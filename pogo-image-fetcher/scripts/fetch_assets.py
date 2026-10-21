"""
PoGoMate 포켓몬 스프라이트 에셋 수집기 — 모든 리그·컵에 나오는 종 전부.

소스
  - 종/이름 데이터 : https://pogomate.com/battles/great-league (Next.js RSC 페이로드에 내장)
                    페이지 이름과 달리 슈퍼·하이퍼·마스터·메가·리틀컵 종이 모두 들어 있다.
  - 스프라이트 이미지 : cdn.pogomate.com (페이지 JS 번들의 해시 매핑에서 추출)
  - PoGoMate에 없는 것 : 종 정보는 PvPoke 게임마스터, 스프라이트는 PokeMiners 인게임 원본 PNG

출력
  assets/pokemon/<영문id>_<한글명>.webp   예: ninetales_alolan_shadow_나인테일.webp
                                          (PokeMiners에서 받은 것은 .png)
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
import urllib.error
import urllib.request

PAGE_URL = 'https://pogomate.com/battles/great-league'
PVPOKE_RANKS = ('https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/'
                'rankings/all/overall/rankings-1500.json')
# 메가 진화·원시회귀는 표준 슈퍼리그 랭킹에 없다. 배틀리그 메가 에디션 랭킹(PvPoke)에서
# 이 폼들만 따로 가져와 '메가 순위'를 붙인다.
PVPOKE_MEGA_RANKS = ('https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/'
                     'rankings/mega/overall/rankings-1500.json')
MEGA_ID = re.compile(r'_(mega|primal)(_[xyz])?$')
PVPOKE_POKEMON = ('https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/'
                  'gamemaster/pokemon.json')
POKEMINERS_SPRITES = ('https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/'
                      'Images/Pokemon%20-%20256x256/Addressable%20Assets/')
POKEMINERS_KO = ('https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/'
                 'Texts/Latest%20APK/JSON/i18n_korean.json')
# 기술 수집기 결과 — PvPoke 모든 포맷 순위에 나오는 종. update_all.py 가 이 수집기보다 먼저 돌린다.
MOVE_POKEMON = pathlib.Path(__file__).resolve().parent.parent.parent / 'pogo-move-fetcher' / 'data' / 'pokemon_moves.json'
# PvPoke 순위에 나오는데 PoGoMate에 없는 종은 자동으로 채운다 (extra_rows).
# 여기에는 순위에도 아직 없지만 미리 넣을 종만 적는다 — {PvPoke 종 id: PokeMiners 스프라이트 키}.
# PoGoMate에 올라오면 그쪽이 우선하니 그때 지우면 된다.
EXTRA_SPECIES = {
    'minior_meteor': 'pm774.fMETEOR.icon.png',
    'minior_core': 'pm774.fRED.icon.png',   # 코어 색은 7가지 — 빨강을 대표로
}
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

    if form in MEGA_LIKE:
        # PoGoMate 라벨표에는 메가가 없어 직접 붙인다: 메가 리자몽 X / 원시 가이오가
        prefix = '원시 ' if form == 'PRIMAL' else '메가 '
        out = prefix + base + (' ' + form[-1] if form in ('MEGA_X', 'MEGA_Y', 'MEGA_Z') else '')
    elif form and form != 'GIGANTAMAX':
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
        rows.append(sprite_row(p, labels, key, sprite_map[key], 'webp'))
    return rows, missing


def pokeminers_url(key):
    """PokeMiners에 그 스프라이트가 있으면 URL, 없으면 None."""
    url = POKEMINERS_SPRITES + key
    try:
        req = urllib.request.Request(url, method='HEAD', headers={'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=30):
            return url
    except Exception:                             # noqa: BLE001
        return None


def pokeminers_fallback(ranked, missing, labels):
    """PoGoMate 번들에 스프라이트가 없는 종을 PokeMiners 원본 PNG로 채운다 (예: brambleghast)."""
    rows, still = [], []
    by_id = {p['id']: p for p in ranked}
    for sid in missing:
        p = by_id[sid]
        dex, form = p['dex'], p.get('imageForm')
        cands = (['pm%d.f%s.icon.png' % (dex, form)] if form else []) + ['pm%d.icon.png' % dex]
        key = next((k for k in cands if pokeminers_url(k)), None)
        if key is None:
            still.append(sid)
            continue
        rows.append(sprite_row(p, labels, key, POKEMINERS_SPRITES + key, 'png'))
    return rows, still


def extra_rows(data, shadow_prefix):
    """PoGoMate에 없는 종의 행 — PvPoke 순위에 나오는 종(pokemon_moves.json) + EXTRA_SPECIES.

    종 정보는 PvPoke 게임마스터, 스프라이트는 PokeMiners. 한글명은 PoGoMate의 같은 도감번호 이름,
    없으면 인게임 로케일(pokemon_name_0774 = 메테노). 폼 표기는 붙이지 않는다 — 번들의 폼 라벨표에 없는 폼이다.
    """
    have = {p['id'] for p in data}
    ranked = []
    if MOVE_POKEMON.exists():
        ranked = [r['speciesId'] for r in json.load(open(MOVE_POKEMON, encoding='utf-8'))['pokemon']]
    else:
        print('    [경고] %s 없음 — 기술 수집기를 먼저 돌리면 PoGoMate에 없는 순위 종도 채운다' % MOVE_POKEMON.name)
    todo = list(dict.fromkeys(sid for sid in ranked + list(EXTRA_SPECIES) if sid not in have))
    if not todo:
        return []

    gm = {p['speciesId']: p for p in fetch_json(PVPOKE_POKEMON)}
    ko_by_dex = {p['dex']: p['nameKo'] for p in data if p.get('nameKo')}
    locale = None
    rows = []
    for sid in todo:
        base = sid[:-len('_shadow')] if sid.endswith('_shadow') else sid
        g = gm.get(sid) or gm.get(base)
        if g is None:
            print('    [경고] PvPoke 게임마스터에 없는 종: %s' % sid)
            continue
        dex = g['dex']
        name = ko_by_dex.get(dex)
        if name is None:
            if locale is None:
                d = fetch_json(POKEMINERS_KO)['data']
                locale = {d[k]: d[k + 1] for k in range(0, len(d) - 1, 2)}
            name = locale.get('pokemon_name_%04d' % dex)
        if name is None:
            print('    [경고] 한글명을 찾지 못한 종: %s' % sid)
            continue
        # 폼 스프라이트 키는 PvPoke id 의 폼 부분을 대문자로 (minior_meteor → pm774.fMETEOR)
        form = base.split('_', 1)[1].upper() if '_' in base else None
        cands = [EXTRA_SPECIES.get(base) or EXTRA_SPECIES.get(sid)] \
            + (['pm%d.f%s.icon.png' % (dex, form)] if form else []) + ['pm%d.icon.png' % dex]
        key = next((k for k in cands if k and pokeminers_url(k)), None)
        if key is None:
            print('    [경고] 스프라이트를 찾지 못한 종: %s' % sid)
            continue
        shadow = sid != base
        p = {'id': sid, 'name': g['speciesName'], 'nameKo': name, 'dex': dex, 'isShadow': shadow,
             'imageForm': re.match(r'pm\d+(?:\.f([A-Z_]+))?\.', key).group(1),
             'types': [t for t in g['types'] if t != 'none']}
        rows.append(sprite_row(p, None, key, POKEMINERS_SPRITES + key, 'png',
                               display_ko=(shadow_prefix if shadow else '') + name))
    return rows


def sprite_row(p, labels, key, url, ext, display_ko=None):
    """manifest 한 행. 파일명 = <영문id>_<한글전체이름>.  양쪽 모두 폼과 그림자를 담는다
    (예: ninetales_alolan_shadow_그림자알로라나인테일)."""
    ko = display_ko or korean_name(p, labels)
    name = FS_UNSAFE.sub('', ko)
    return {
        'rank': p.get('pvpokeRank'),                 # 정본 순위 = PvPoke
        'pogomateRank': p.get('greatRank'),          # 참고용 (둘은 서로 다르다)
        'id': p['id'],
        'name': p['name'],
        'nameKo': p.get('nameKo'),
        'nameJa': p.get('nameJa'),
        'displayKo': ko,
        'dex': p['dex'],
        'isShadow': bool(p.get('isShadow')),
        'isMega': bool(p.get('isMega')),
        'form': p.get('imageForm'),
        'types': p.get('types', []),
        'level': p.get('greatLevel'),
        'file': 'pokemon/%s.%s' % ('%s_%s' % (p['id'], name) if name else p['id'], ext),
        'spriteKey': key,
        'url': url,
    }


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
            ok = (blob[:4] == b'RIFF' and blob[8:12] == b'WEBP') if r['file'].endswith('.webp') \
                else blob[:8] == b'\x89PNG\r\n\x1a\n'
            if not ok:
                raise ValueError('%s 파일이 아님' % r['file'].rsplit('.', 1)[1])
            (out_dir / r['file']).write_bytes(blob)
        except Exception as e:                    # noqa: BLE001
            failed.append((r['id'], str(e)))

    with cf.ThreadPoolExecutor(max_workers=8) as ex:
        for n, _ in enumerate(ex.map(work, todo), 1):
            if n % 50 == 0:
                print('  %d/%d' % (n, len(todo)))

    # 랭킹 변동이나 파일명 규칙 변경으로 남은 옛 파일 정리
    keep = {(out_dir / r['file']).name for r in rows}
    stale = [p for p in sprite_dir.glob('*.*') if p.suffix in ('.webp', '.png') and p.name not in keep]
    for p in stale:
        p.unlink()
    if stale:
        print('정리한 옛 파일: %d개' % len(stale))

    return failed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--top', type=int, default=0,
                    help='슈퍼리그 순위 상위 N종만 (기본 0 = 모든 리그·컵의 종 전체)')
    ap.add_argument('--out', default=str(pathlib.Path(__file__).resolve().parent.parent / 'assets'),
                    help='출력 폴더 (기본: 저장소의 assets/ — 실행 위치와 무관)')
    ap.add_argument('--force', action='store_true', help='이미 받은 파일도 다시 내려받기')
    args = ap.parse_args()

    out_dir = pathlib.Path(args.out)

    print('1/4 랭킹 페이지 로드…')
    try:
        html = fetch(PAGE_URL)
    except urllib.error.HTTPError as e:
        # PoGoMate(Cloudflare)는 GitHub Actions 같은 데이터센터 IP에 확인 페이지(403)를 돌려준다.
        # 그때는 받아 둔 manifest 를 그대로 두고 PvPoke 순위에 새로 나온 종만 채운다
        if e.code != 403 or args.top or not (out_dir / 'manifest.json').exists():
            raise
        return offline(out_dir, args.force)

    print('2/4 랭킹 데이터 파싱…')
    data = backfill_names(load_ranking(html))

    # 순위 정본은 PvPoke. PoGoMate도 자체 순위를 내지만 둘이 다르다
    # (상위 300 집합이 16종 차이). PoGoMate는 스프라이트와 한글명만 담당한다.
    pv = {e['speciesId']: i for i, e in enumerate(fetch_json(PVPOKE_RANKS), 1)}
    for p in data:
        p['pvpokeRank'] = pv.get(p['id'])

    # 메가·원시 폼의 순위 = PvPoke 메가 에디션 랭킹 전체(일반 포켓몬 포함)에서의 순위. PvPoke 사이트와 같은 숫자다.
    mega_all = fetch_json(PVPOKE_MEGA_RANKS)
    mega_rank = {e['speciesId']: i for i, e in enumerate(mega_all, 1) if MEGA_ID.search(e['speciesId'])}
    mega_ids = list(mega_rank)
    for p in data:
        if p['id'] in mega_rank and not p['pvpokeRank']:
            p['pvpokeRank'] = mega_rank[p['id']]
            p['isMega'] = True
    lost = [sid for sid in mega_ids if not any(p['id'] == sid for p in data)]
    if lost:
        print('    [경고] PoGoMate에 없는 메가: %s' % ', '.join(lost))

    # 슈퍼리그 순위가 없는 종(하이퍼·마스터·리틀컵 전용 등)도 모두 받는다. 순위는 비워 두고
    # 포맷별 순위는 기술 수집기의 pokemon_moves.json 이 담당한다. 순위 있는 종이 앞에 온다.
    ranked = sorted(data, key=lambda p: (p['pvpokeRank'] is None, bool(p.get('isMega')),
                                         p['pvpokeRank'] or 0))
    unmatched = [p['id'] for p in data
                 if isinstance(p.get('greatRank'), int) and not p['pvpokeRank']]
    if args.top:
        ranked = [p for p in ranked if p['pvpokeRank']][:args.top]
    print('    PvPoke 슈퍼리그·메가 순위 보유 %d종 / PoGoMate 데이터 %d종 → %d종 사용'
          % (sum(1 for p in data if p['pvpokeRank']), len(data), len(ranked)))
    if unmatched:
        print('    [경고] PvPoke에 없는 종: %s' % ', '.join(unmatched[:10]))

    print('3/4 JS 번들에서 스프라이트 매핑·폼 라벨 추출…')
    chunks = load_chunks(html)
    sprite_map = load_sprite_map(chunks)
    labels = load_form_labels(chunks)
    print('    스프라이트 매핑 %d건 / 폼 라벨 %d건' % (len(sprite_map), len(labels[0])))

    rows, missing = resolve(ranked, sprite_map, labels)
    if missing:
        found, missing = pokeminers_fallback(ranked, missing, labels)
        rows += found
        if found:
            print('    PoGoMate에 스프라이트가 없어 PokeMiners에서: %s' % ', '.join(r['id'] for r in found))
    if missing:
        print('    [경고] 스프라이트 미해결: %s' % ', '.join(missing))
    if not args.top:
        extra = extra_rows(data, labels[2])
        rows += extra
        if extra:
            print('    PoGoMate에 없어 PvPoke·PokeMiners로 채운 종: %s' % ', '.join(r['id'] for r in extra))

    print('4/4 이미지 다운로드…')
    failed = download(rows, out_dir, args.force)

    write_outputs(rows, out_dir, args.top)

    if failed:
        print('  [실패] %s' % failed)
        return 1
    return 0


def offline(out_dir, force):
    """PoGoMate 없이 갱신 — 받아 둔 행은 그대로 두고, PvPoke 순위에 새로 나온 종만 extra_rows 로 채운다.
    PoGoMate 스프라이트·한글명 자체의 변경은 PoGoMate 가 열리는 곳(로컬 PC)에서 돌려야 들어온다.
    manifest 의 rank 는 참고용이라(포맷별 순위는 pokemon_moves.json) 다시 매기지 않는다."""
    print('    [경고] PoGoMate 가 막혀 있다(HTTP 403) — 받아 둔 manifest 로 갱신하고, 새 종만 PvPoke·PokeMiners 로 채운다')
    rows = json.load(open(out_dir / 'manifest.json', encoding='utf-8'))['pokemon']

    # extra_rows 는 id(이미 있는 종)와 dex·nameKo(같은 도감번호 한글명)만 본다
    extra = extra_rows(rows, '그림자 ')
    rows += extra
    if extra:
        print('    PvPoke·PokeMiners로 채운 새 종: %s' % ', '.join(r['id'] for r in extra))
    else:
        print('    새로 채울 종 없음 (%d종 그대로)' % len(rows))

    failed = download(rows, out_dir, force)
    write_outputs(rows, out_dir, 0)
    if failed:
        print('  [실패] %s' % failed)
    return 1      # 경고로 끝낸다 — update_all.py 요약에 남아 PC 에서 한 번 돌릴 때가 됐는지 보게


def write_outputs(rows, out_dir, top):
    out_dir.mkdir(parents=True, exist_ok=True)
    with open(out_dir / 'manifest.json', 'w', encoding='utf-8') as f:
        json.dump({
            'source': PAGE_URL,
            'rankSource': PVPOKE_RANKS,
            'league': 'all',
            'top': top or len(rows),
            'count': len(rows),
            'pokemon': rows,
        }, f, ensure_ascii=False, indent=1)

    with open(out_dir / 'index.csv', 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f, lineterminator='\n')   # Actions(Linux)·PC 어디서 써도 같은 파일이 되게
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


if __name__ == '__main__':
    sys.exit(main())
