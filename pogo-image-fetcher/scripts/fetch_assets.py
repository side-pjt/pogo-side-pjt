"""
PoGoMate 슈퍼리그(Great League) 상위 N위 포켓몬 스프라이트 에셋 수집기.

소스
  - 랭킹/이름 데이터 : https://pogomate.com/battles/great-league (Next.js RSC 페이로드에 내장)
  - 스프라이트 이미지 : cdn.pogomate.com (페이지 JS 번들의 해시 매핑에서 추출)

출력
  assets/pokemon/<영문id>_<한글명>.webp   예: ninetales_alolan_shadow_나인테일.webp
  assets/manifest.json       전체 메타데이터 (영문/한글/일본어명, dex, 그림자, 타입, 랭크)
  assets/index.csv           표 작업용 간단 목록

사용법
  python scripts/fetch_assets.py [--top 300] [--out assets] [--force]
"""

import argparse
import concurrent.futures as cf
import csv
import json
import pathlib
import re
import sys
import urllib.request

PAGE_URL = 'https://pogomate.com/battles/great-league'
PVPOKE_RANKS = ('https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/'
                'rankings/all/overall/rankings-1500.json')
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) pogomate-asset-fetch'


def fetch(url, binary=False):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read()
    return raw if binary else raw.decode('utf-8', 'replace')


def fetch_json(url):
    return json.loads(fetch(url))


def match_bracket(s, start):
    """start 위치의 '[' 와 짝이 되는 ']' 다음 인덱스를 반환 (문자열 리터럴 인식)."""
    depth = 0
    esc = False
    instr = False
    for i in range(start, len(s)):
        c = s[i]
        if instr:
            if esc:
                esc = False
            elif c == chr(92):
                esc = True
            elif c == '"':
                instr = False
            continue
        if c == '"':
            instr = True
        elif c == '[':
            depth += 1
        elif c == ']':
            depth -= 1
            if depth == 0:
                return i + 1
    raise ValueError('brackets unbalanced')


def load_ranking(html):
    """RSC 플라이트 페이로드에서 pokemonList 추출."""
    chunks = []
    for m in re.finditer(r'self\.__next_f\.push\(\[1,\s*(".*?")\]\)', html, re.S):
        try:
            chunks.append(json.loads(m.group(1)))
        except ValueError:
            pass
    flight = ''.join(chunks)

    i = flight.find('"pokemonList":')
    if i < 0:
        raise SystemExit('pokemonList를 찾지 못했습니다 — 사이트 구조가 바뀌었을 수 있습니다.')
    start = flight.index('[', i)
    return json.loads(flight[start:match_bracket(flight, start)])


def load_chunks(html):
    """페이지가 참조하는 JS 청크를 모두 받아온다."""
    out = []
    for path in sorted(set(re.findall(r'/_next/static/chunks/[^"?]+\.js', html))):
        try:
            out.append(fetch('https://pogomate.com' + path))
        except Exception:
            pass
    return out


def load_sprite_map(chunks):
    """JS 번들에서 "pmN[.fFORM][.s].icon.png" -> CDN webp URL 매핑 추출."""
    sprite_map = {}
    for js in chunks:
        if 'cdn.pogomate.com/pokemon/' in js:
            sprite_map.update(re.findall(
                r'"(pm[^"]*?\.icon\.png)":"(https://cdn\.pogomate\.com/pokemon/[^"]+)"', js))
    if not sprite_map:
        raise SystemExit('스프라이트 매핑을 찾지 못했습니다 — 사이트 구조가 바뀌었을 수 있습니다.')
    return sprite_map


def _entries(js, start):
    """`KEY:{...}` / `"KEY":{...}` 항목을 중괄호 매칭으로 잘라 (키, 본문) 으로 돌려준다."""
    i = start
    while i < len(js):
        m = re.compile(r'\s*,?\s*"?([A-Za-z0-9_]+)"?\s*:\s*\{').match(js, i)
        if not m:
            return
        depth, j = 0, m.end() - 1
        while j < len(js):
            if js[j] == '{':
                depth += 1
            elif js[j] == '}':
                depth -= 1
                if depth == 0:
                    break
            j += 1
        yield m.group(1), js[m.end():j]
        i = j + 1


def load_form_labels(chunks):
    """폼 코드 -> 한글 라벨 테이블을 번들에서 추출.

    PoGoMate는 폼을 둘 중 하나로 표기한다:
      prefix 가 있으면  "알로라 " + 나인테일   -> 알로라 나인테일
      없으면            킬가르도 + " (실드폼)" -> 킬가르도 (실드폼)
    """
    js = next((c for c in chunks if 'ALOLA:{' in c and 'prefix:' in c), None)
    if js is None:
        raise SystemExit('폼 라벨 테이블을 찾지 못했습니다 — 사이트 구조가 바뀌었을 수 있습니다.')

    def table(anchor):
        out = {}
        at = js.find(anchor)
        if at < 0:
            return out
        for key, body in _entries(js, at):
            ko = re.search(r'\bko:"([^"]*)"', body)
            pre = re.search(r'prefix:\{[^}]*?\bko:"([^"]*)"', body)
            dexes = re.search(r'restrictToDex:\[([\d,\s]*)\]', body)
            if not ko:
                continue
            out[key] = {
                'ko': ko.group(1),
                'prefix': pre.group(1) if pre else None,
                'dex': [int(d) for d in dexes.group(1).split(',') if d.strip()] if dexes else None,
            }
        return out

    forms = table('ALOLA:{')                      # 폼 코드 기준
    forms.update(table('"669_RED":{'))            # dex_폼 기준 (같은 폼 코드의 종별 예외)

    # 소수의 하드 오버라이드 (o = {"646_BLACK":"블랙 ", …})
    ov = {}
    m = re.search(r'=\{("(?:\d+_[A-Z][A-Z_0-9]*)":"[^"]*",?)+\}', js)
    if m:
        ov = dict(re.findall(r'"(\d+_[A-Z][A-Z_0-9]*)":"([^"]*)"', m.group(0)))

    shadow = re.search(r'ko:\{shadow:"([^"]*)"', js)
    return forms, ov, (shadow.group(1) if shadow else '그림자 ')


FS_UNSAFE = re.compile(r'[\\/:*?"<>|()（）\s]+')
MEGA_LIKE = {'MEGA', 'MEGA_X', 'MEGA_Y', 'MEGA_Z', 'PRIMAL'}


def korean_name(p, labels):
    """PoGoMate 표시 규칙 그대로 한글 전체 이름을 만든다.
    예: ninetales_alolan_shadow -> '그림자 알로라 나인테일'
        aegislash_shield        -> '킬가르도 (실드폼)'
    """
    forms, overrides, shadow_prefix = labels
    base = p.get('nameKo') or p.get('name') or ''
    form = p.get('imageForm')
    out = base

    if form and form not in MEGA_LIKE and form != 'GIGANTAMAX':
        key = '%s_%s' % (p['dex'], form)
        if key in overrides:
            out = overrides[key] + base
        else:
            d = forms.get(key) or forms.get(form)
            if d and (not d['dex'] or p['dex'] in d['dex']):
                # nameKo에 이미 폼 표기가 섞여 있으면 중복을 피한다
                for lab in (d['prefix'], d['ko']):
                    if lab and base.startswith(lab.strip()):
                        base = base[len(lab.strip()):].strip()
                out = (d['prefix'] + base) if d['prefix'] else '%s (%s)' % (base, d['ko'])

    if p.get('isShadow'):
        out = shadow_prefix + out
    return out.strip()


def stem(p, labels):
    """파일명 = <영문id>_<한글전체이름>.  양쪽 모두 폼과 그림자를 담는다
    (예: ninetales_alolan_shadow_그림자알로라나인테일)."""
    ko = FS_UNSAFE.sub('', korean_name(p, labels))
    return '%s_%s' % (p['id'], ko) if ko else p['id']


def backfill_names(data):
    """그림자 엔트리에는 nameJa가 비어 있다 — 같은 종의 일반 폼에서 채운다."""
    ja = {}
    for p in data:
        if p.get('nameJa'):
            ja.setdefault((p['dex'], p.get('imageForm')), p['nameJa'])
            ja.setdefault((p['dex'], None), p['nameJa'])
    for p in data:
        if not p.get('nameJa'):
            p['nameJa'] = ja.get((p['dex'], p.get('imageForm'))) or ja.get((p['dex'], None))
    return data


def resolve(ranked, sprite_map, labels):
    """각 포켓몬을 스프라이트 키에 매칭. 그림자는 일반 스프라이트를 공유한다
    (포켓몬 GO는 그림자를 별도 이미지가 아닌 인게임 오버레이로 표현)."""
    by_dex = {}
    for k in sprite_map:
        m = re.match(r'pm(\d+)\.', k)
        if m and '.s.icon' not in k:          # .s. = 이로치(shiny), 제외
            by_dex.setdefault(int(m.group(1)), []).append(k)

    rows, missing = [], []
    for p in ranked:
        dex, form = p['dex'], p.get('imageForm')
        cands = ([('pm%d.f%s.icon.png' % (dex, form))] if form else []) \
            + ['pm%d.icon.png' % dex] + sorted(by_dex.get(dex, []))
        key = next((c for c in cands if c in sprite_map), None)
        if key is None:
            missing.append(p['id'])
            continue
        rows.append({
            'rank': p['pvpokeRank'],                 # 정본 순위 = PvPoke
            'pogomateRank': p['greatRank'],          # 참고용 (둘은 서로 다르다)
            'id': p['id'],
            'name': p['name'],
            'nameKo': p.get('nameKo'),
            'nameJa': p.get('nameJa'),
            'displayKo': korean_name(p, labels),
            'dex': dex,
            'isShadow': bool(p.get('isShadow')),
            'form': form,
            'types': p.get('types', []),
            'level': p.get('greatLevel'),
            'file': 'pokemon/%s.webp' % stem(p, labels),
            'spriteKey': key,
            'url': sprite_map[key],
        })
    return rows, missing


def download(rows, out_dir, force):
    sprite_dir = out_dir / 'pokemon'
    sprite_dir.mkdir(parents=True, exist_ok=True)

    todo = [r for r in rows if force or not (out_dir / r['file']).exists()]
    print('내려받을 파일: %d개 (전체 %d개)' % (len(todo), len(rows)))

    cache = {}
    failed = []

    def work(r):
        try:
            if r['url'] not in cache:
                cache[r['url']] = fetch(r['url'], binary=True)
            blob = cache[r['url']]
            if blob[:4] != b'RIFF' or blob[8:12] != b'WEBP':
                raise ValueError('webp 파일이 아님')
            (out_dir / r['file']).write_bytes(blob)
        except Exception as e:                    # noqa: BLE001
            failed.append((r['id'], str(e)))

    with cf.ThreadPoolExecutor(max_workers=8) as ex:
        for n, _ in enumerate(ex.map(work, todo), 1):
            if n % 50 == 0:
                print('  %d/%d' % (n, len(todo)))

    # 랭킹 변동이나 파일명 규칙 변경으로 남은 옛 파일 정리
    keep = {(out_dir / r['file']).name for r in rows}
    stale = [p for p in sprite_dir.glob('*.webp') if p.name not in keep]
    for p in stale:
        p.unlink()
    if stale:
        print('정리한 옛 파일: %d개' % len(stale))

    return failed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--top', type=int, default=0,
                    help='상위 N종만 (기본 0 = 슈퍼리그 랭크 보유 전체)')
    ap.add_argument('--out', default=str(pathlib.Path(__file__).resolve().parent.parent / 'assets'),
                    help='출력 폴더 (기본: 저장소의 assets/ — 실행 위치와 무관)')
    ap.add_argument('--force', action='store_true', help='이미 받은 파일도 다시 내려받기')
    args = ap.parse_args()

    out_dir = pathlib.Path(args.out)

    print('1/4 랭킹 페이지 로드…')
    html = fetch(PAGE_URL)

    print('2/4 랭킹 데이터 파싱…')
    data = backfill_names(load_ranking(html))

    # 순위 정본은 PvPoke. PoGoMate도 자체 순위를 내지만 둘이 다르다
    # (상위 300 집합이 16종 차이). PoGoMate는 스프라이트와 한글명만 담당한다.
    pv = {e['speciesId']: i for i, e in enumerate(fetch_json(PVPOKE_RANKS), 1)}
    for p in data:
        p['pvpokeRank'] = pv.get(p['id'])

    ranked = sorted([p for p in data if p['pvpokeRank']], key=lambda p: p['pvpokeRank'])
    unmatched = [p['id'] for p in data
                 if isinstance(p.get('greatRank'), int) and not p['pvpokeRank']]
    if args.top:
        ranked = ranked[:args.top]
    print('    PvPoke 랭킹 %d종 / PoGoMate 데이터 %d종 → %d종 사용'
          % (len(pv), len(data), len(ranked)))
    if unmatched:
        print('    [경고] PvPoke에 없는 종: %s' % ', '.join(unmatched[:10]))

    print('3/4 JS 번들에서 스프라이트 매핑·폼 라벨 추출…')
    chunks = load_chunks(html)
    sprite_map = load_sprite_map(chunks)
    labels = load_form_labels(chunks)
    print('    스프라이트 매핑 %d건 / 폼 라벨 %d건' % (len(sprite_map), len(labels[0])))

    rows, missing = resolve(ranked, sprite_map, labels)
    if missing:
        print('    [경고] 스프라이트 미해결: %s' % ', '.join(missing))

    print('4/4 이미지 다운로드…')
    failed = download(rows, out_dir, args.force)

    out_dir.mkdir(parents=True, exist_ok=True)
    with open(out_dir / 'manifest.json', 'w', encoding='utf-8') as f:
        json.dump({
            'source': PAGE_URL,
            'rankSource': PVPOKE_RANKS,
            'league': 'great',
            'top': args.top or len(rows),
            'count': len(rows),
            'pokemon': rows,
        }, f, ensure_ascii=False, indent=1)

    with open(out_dir / 'index.csv', 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(['rank', 'pogomateRank', 'id', 'name', 'nameKo', 'displayKo',
                    'nameJa', 'dex', 'isShadow', 'form', 'types', 'file'])
        for r in rows:
            w.writerow([r['rank'], r['pogomateRank'], r['id'], r['name'], r['nameKo'],
                        r['displayKo'], r['nameJa'], r['dex'],
                        'Y' if r['isShadow'] else '', r['form'] or '',
                        '/'.join(r['types']), r['file']])

    print()
    print('완료: %d종 / 그림자 %d종 / 실제 이미지 %d장'
          % (len(rows), sum(1 for r in rows if r['isShadow']), len({r['url'] for r in rows})))
    print('  %s' % (out_dir / 'manifest.json'))
    print('  %s' % (out_dir / 'index.csv'))
    if failed:
        print('  [실패] %s' % failed)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
