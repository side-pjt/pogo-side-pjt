"""
포켓몬 GO PvP 기술 데이터 수집기 — CCT 계산에 필요한 '일반기술 턴 수'가 핵심.

소스
  - 기술 제원(턴·위력·에너지) : PvPoke gamemaster.json
  - 포맷(리그·컵) 목록        : PvPoke gamemaster.json 의 formats — 자동으로 따라간다
  - 포켓몬별 추천 기술셋      : PvPoke rankings/<컵>/overall/rankings-<CP>.json (포맷마다)
  - 한글 기술명·타입명·컵 이름 : PokeMiners 포켓몬 GO 한국어 로케일 (공식 인게임 표기)

순위 기준은 PvPoke다. PoGoMate도 자체 순위를 내지만 둘이 서로 다르고
(상위 300 집합이 16종 차이) PvPoke를 정본으로 삼는다. PoGoMate는 스프라이트와
한글 포켓몬명만 담당한다 — 두 소스의 종 ID는 1,152종 전부 일치하므로 그대로 붙는다.

범위는 좁히지 않는다. 기술 데이터는 파일 2개로 끝나서 1,152종 전부 받아도 비용이 같다.

출력
  data/moves.json          기술 전체 — id, 한글명, 영문명, 타입, 턴, 위력, 에너지
  data/formats.json        포맷 목록 — key, 컵, CP, 영문·한글 이름, 한글 이름 출처, 종 수
  data/pokemon_moves.json  모든 포맷에 나오는 종 — 포맷별 순위·추천 기술셋 + 일반기술과 턴 수
  data/fast_moves.csv      일반기술 턴별 요약 (표 작업용)

사용법
  python scripts/fetch_moves.py [--out data] [--extra fantasy:1500 ...]
"""

import argparse
import csv
import json
import pathlib
import re
import sys
import urllib.error
import urllib.request

PVPOKE = 'https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/'
POKEMINERS = ('https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/'
              'Texts/Latest%20APK/JSON/')
UA = 'pogo-move-fetch'

# PvPoke 기술명이 인게임 영문 표기와 다른 소수의 예외
NAME_FIXES = {
    'Water Gun Fast Blastoise': 'Water Gun',       # 거북왕 전용
    'Hydro Pump Blastoise': 'Hydro Pump',
}

# ---- 포맷(리그·컵) -------------------------------------------------------
# PvPoke formats 를 자동으로 따라가되, GO배틀리그가 아닌 커뮤니티 대회·사용자 정의 포맷은 뺀다.
EXCLUDE_CUPS = {'custom', 'championshipseries'}
EXCLUDE_TITLE = re.compile(r'Battle Frontier|Devon|Invitational')
# 시즌 일정에는 있는데 PvPoke formats 에 아직 안 올라온 컵. 순위 파일이 있을 때만 들어간다.
EXTRA_FORMATS = [('fantasy', 1500)]
# 순위가 겹치는 종의 기본 기술셋·일반기술 사용률을 어느 포맷에서 가져올지 (앞이 우선)
PRIMARY_FORMATS = ['great', 'mega-1500', 'ultra', 'mega-2500', 'master', 'mega-10000']

LEAGUE_KEY = {1500: 'great', 2500: 'ultra', 10000: 'master'}
LEAGUE_EN = {500: 'Little', 1500: 'Great League', 2500: 'Ultra League', 10000: 'Master League'}
LEAGUE_KO = {500: '리틀', 1500: '슈퍼리그', 2500: '하이퍼리그', 10000: '마스터리그'}
# 공식 표기가 없거나 어색할 때만 적는다. 키는 포맷 key.
FORMAT_NAME_KO = {}
MEGA_ID = re.compile(r'_(mega|primal)(_[xyz])?$')


def fetch_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def load_locale(lang):
    """PokeMiners 로케일은 [키, 값, 키, 값, …] 평면 배열이다."""
    d = fetch_json(POKEMINERS + 'i18n_%s.json' % lang)['data']
    return {d[i]: d[i + 1] for i in range(0, len(d) - 1, 2)}


def norm(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())


def korean_types(ko):
    """한글 타입명 — 공식 로케일의 pokemon_type_* 키."""
    return {k[len('pokemon_type_'):]: v
            for k, v in ko.items() if k.startswith('pokemon_type_')}


def build_korean_names(moves, en, ko):
    """영문 기술명으로 로케일 키를 찾아 한글명을 붙인다.

    GAME_MASTER(19MB)의 숫자 ID를 거치는 방법보다 가볍고 적중률도 높다.
    """
    by_en = {}
    for k, v in en.items():
        if k.startswith('move_name_'):
            by_en.setdefault(norm(v), k)

    types_ko = korean_types(ko)

    out, missing = {}, []
    for m in moves:
        name = NAME_FIXES.get(m['name'], m['name'])

        key = by_en.get(norm(name))
        if key and ko.get(key):
            out[m['moveId']] = ko[key]
            continue

        # 타입별로 쪼개진 기술 — "Hidden Power (Fire)", "Weather Ball (Fire)" 등.
        # 기본명의 한글 표기에 한글 타입명을 붙인다.
        split = re.match(r'^(.+?) \((.+)\)$', name)
        if split:
            base = ko.get(by_en.get(norm(split.group(1)), ''))
            if base:
                out[m['moveId']] = '%s (%s)' % (
                    base, types_ko.get(split.group(2).lower(), split.group(2)))
                continue

        # 게임 로케일에 아직 없는 기술 (PvPoke가 먼저 반영한 신규 기술).
        # 한글명을 지어내지 않고 비워 둔다 — 표시는 영문명으로 대체한다.
        missing.append(m['moveId'])
    return out, missing


def format_key(cup, cp):
    """URL·파일 이름에 쓰는 포맷 키. 기본 리그는 great/ultra/master, 나머지는 <컵>-<CP>."""
    return LEAGUE_KEY[cp] if cup == 'all' and cp in LEAGUE_KEY else '%s-%d' % (cup, cp)


def load_formats(gm, extra):
    """기본 3리그 + PvPoke formats + 추가 컵. (cup, cp) 가 같으면 한 번만."""
    titles = {c['name']: c.get('title') or c['name'] for c in gm.get('cups', [])}
    cands = [{'cup': 'all', 'cp': cp, 'title': LEAGUE_EN[cp]} for cp in (1500, 2500, 10000)]
    cands += gm.get('formats', [])
    cands += [{'cup': cup, 'cp': cp, 'title': titles.get(cup, cup)} for cup, cp in extra]

    out, skipped, seen = [], [], set()
    for f in cands:
        if (f['cup'], f['cp']) in seen:
            continue
        seen.add((f['cup'], f['cp']))
        if f['cup'] in EXCLUDE_CUPS or f.get('hideRankings') or EXCLUDE_TITLE.search(f['title']):
            skipped.append(f['title'])
            continue
        out.append({'key': format_key(f['cup'], f['cp']), 'cup': f['cup'], 'cp': f['cp'],
                    'title': f['title']})
    return out, skipped


def format_namer(en, ko):
    """포맷 영문 제목 -> 한글 이름. (이름, 출처) 를 돌려준다.

    출처 순서: override(FORMAT_NAME_KO) > official(게임 로케일에 같은 영문 표기)
              > rule(공식 단어를 조합) > fallback(영문 그대로, 빌드 경고 대상)
    """
    official = {}
    for k, v in en.items():
        if (k.endswith('_title') or re.fullmatch(r'combat_\w+_league', k)) and ko.get(k):
            official.setdefault(norm(v), ko[k])
    # "Fossil Cup" = "화석컵", "Color Cup: Great League Edition" = "4색컵: 슈퍼리그 버전" 같은
    # 공식 컵 이름에서 단어 사전을 만든다
    words = {'mega': '메가'}
    for k, v in en.items():
        m = re.fullmatch(r'([A-Za-z]+) Cup(:.*)?', v)
        kv = re.match(r'(.+?)\s*컵', ko.get(k, ''))
        if m and kv and k.endswith('_title'):
            words.setdefault(m.group(1).lower(), kv.group(1))

    def name(f):
        if f['key'] in FORMAT_NAME_KO:
            return FORMAT_NAME_KO[f['key']], 'override'
        title, cp = f['title'], f['cp']
        if f['cup'] == 'all':
            title = LEAGUE_EN[cp]
        cands = [title]
        mega = re.fullmatch(r'Mega (Great|Ultra|Master) League', title)
        if mega:
            cands.insert(0, '%s League: Mega Edition' % mega.group(1))
        elif title.endswith(' Cup') and cp in LEAGUE_EN:
            cands.insert(0, '%s: %s Edition' % (title, LEAGUE_EN[cp]))
        for c in cands:
            if norm(c) in official:
                return official[norm(c)], 'official'
        if mega:
            return '%s: 메가 버전' % LEAGUE_KO[cp], 'rule'
        cup = re.fullmatch(r'([A-Za-z ]+) Cup', title)
        if cup and all(w.lower() in words for w in cup.group(1).split()):
            return ' '.join(words[w.lower()] for w in cup.group(1).split()) + '컵', 'rule'
        return title, 'fallback'

    return name


def load_format_rankings(formats):
    """포맷마다 PvPoke 순위 파일을 받는다. 아직 없는 컵은 빼고 이름을 돌려준다."""
    out, missing = [], []
    for f in formats:
        url = PVPOKE + 'rankings/%s/overall/rankings-%d.json' % (f['cup'], f['cp'])
        try:
            f['ranking'] = fetch_json(url)
        except urllib.error.HTTPError as e:
            if e.code != 404:
                raise
            missing.append(f['key'])
            continue
        f['source'] = url
        out.append(f)
    return out, missing


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=str(pathlib.Path(__file__).resolve().parent.parent / 'data'),
                    help='출력 폴더 (기본: 저장소의 data/ — 실행 위치와 무관)')
    ap.add_argument('--extra', nargs='*', default=[], metavar='CUP:CP',
                    help='PvPoke formats 에 없는 컵 추가 (예: fantasy:1500)')
    args = ap.parse_args()
    out_dir = pathlib.Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    extra = EXTRA_FORMATS + [(s.split(':')[0], int(s.split(':')[1])) for s in args.extra]

    print('1/4 PvPoke 기술 제원…')
    gm = fetch_json(PVPOKE + 'gamemaster.json')
    moves = gm['moves']
    print('    기술 %d종' % len(moves))

    print('2/4 한국어 로케일…')
    ko, en = load_locale('korean'), load_locale('english')
    names_ko, missing = build_korean_names(moves, en, ko)
    print('    한글명 %d/%d' % (len(names_ko), len(moves)))
    if missing:
        print('    [경고] 한글명 없음: %s' % ', '.join(missing[:10]))

    print('3/4 PvPoke 포맷별 랭킹(추천 기술셋)…')
    formats, skipped = load_formats(gm, extra)
    formats, no_ranking = load_format_rankings(formats)
    name_ko = format_namer(en, ko)
    for f in formats:
        f['ko'], f['nameSource'] = name_ko(f)
        print('    %-16s %-24s %4d종  %s' % (f['key'], f['ko'], len(f['ranking']),
                                           '' if f['nameSource'] == 'official' else '(%s)' % f['nameSource']))
    if skipped:
        print('    제외한 포맷: %s' % ', '.join(skipped))
    if no_ranking:
        print('    [경고] 순위 파일이 아직 없는 포맷: %s' % ', '.join(no_ranking))
    untranslated = [f['key'] for f in formats if f['nameSource'] == 'fallback']
    if untranslated:
        print('    [경고] 한글 이름 없음 (FORMAT_NAME_KO 에 추가): %s' % ', '.join(untranslated))

    # ---- 기술 테이블 -------------------------------------------------
    move_rows = {}
    for m in moves:
        is_fast = m.get('energyGain', 0) > 0
        move_rows[m['moveId']] = {
            'moveId': m['moveId'],
            'name': m['name'],
            'nameKo': names_ko.get(m['moveId']),
            # 화면에 그대로 쓸 이름 — 한글명이 없으면 영문으로 대체
            'nameDisplay': names_ko.get(m['moveId']) or m['name'],
            'type': m.get('type'),
            'kind': 'fast' if is_fast else 'charged',
            # CCT의 전부: 일반기술 1턴 = 0.5초
            'turns': m.get('turns') if is_fast else None,
            'seconds': round(m['turns'] * 0.5, 1) if is_fast and m.get('turns') else None,
            'power': m.get('power'),
            'energyGain': m.get('energyGain') if is_fast else None,
            'energy': m.get('energy') if not is_fast else None,
        }

    # ---- 포켓몬별 기술 -----------------------------------------------
    # 모든 포맷 순위의 합집합. 파일 순서 = PvPoke 랭킹(점수 내림차순).
    # 기본 기술셋·일반기술 사용률은 PRIMARY_FORMATS 순서로 처음 나오는 포맷의 것을 쓴다.
    order = {k: i for i, k in enumerate(PRIMARY_FORMATS)}
    species = {}
    for f in sorted(formats, key=lambda f: order.get(f['key'], len(order))):
        for rank, e in enumerate(f['ranking'], 1):
            s = species.setdefault(e['speciesId'], {'entry': e, 'formats': {}})
            s['formats'][f['key']] = {'rank': rank, 'score': e.get('score'),
                                      'moveset': e.get('moveset') or []}

    def legacy_rank(sid, s):
        """기존 화면용 순위 — 일반은 슈퍼리그, 메가·원시는 메가 에디션(슈퍼리그) 순위.
        순위는 그 랭킹 전체(일반 포켓몬 포함)에서의 위치 — PvPoke 사이트와 같은 숫자."""
        key = 'mega-1500' if MEGA_ID.search(sid) else 'great'
        return s['formats'].get(key, {}).get('rank')

    pm_rows = []
    for sid, s in species.items():
        e = s['entry']
        fast_used = e.get('moves', {}).get('fastMoves', [])
        total = sum(f.get('uses') or 0 for f in fast_used) or 1
        pm_rows.append({
            'speciesId': sid,
            'speciesName': e['speciesName'],
            'rank': legacy_rank(sid, s),
            'mega': bool(MEGA_ID.search(sid)),
            'score': e.get('score'),
            'formats': s['formats'],
            'recommended': {
                'fast': e['moveset'][0] if e.get('moveset') else None,
                'charged': e['moveset'][1:] if e.get('moveset') else [],
            },
            # 상대가 실제로 들고 나올 수 있는 일반기술 — 사용률 순
            'fastMoves': [{
                'moveId': f['moveId'],
                'nameKo': names_ko.get(f['moveId']),
                'turns': move_rows.get(f['moveId'], {}).get('turns'),
                'share': round((f.get('uses') or 0) / total, 3),
            } for f in fast_used],
        })
    # 기존 순서 유지: 슈퍼리그 순위 → 메가 에디션 순위 → 그 밖의 포맷에만 나오는 종
    pm_rows.sort(key=lambda r: (r['rank'] is None, r['mega'], r['rank'] or 0))

    json.dump({'count': len(move_rows), 'moves': list(move_rows.values())},
              open(out_dir / 'moves.json', 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    json.dump({'formats': [f['key'] for f in formats], 'count': len(pm_rows), 'pokemon': pm_rows},
              open(out_dir / 'pokemon_moves.json', 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    json.dump({
        'count': len(formats),
        'formats': [{k: f[k] for k in ('key', 'cup', 'cp', 'title', 'ko', 'nameSource', 'source')}
                    | {'count': len(f['ranking'])} for f in formats],
        'skipped': skipped,
        'noRanking': no_ranking,
    }, open(out_dir / 'formats.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    tko = korean_types(ko)
    json.dump({'count': len(tko), 'types': tko},
              open(out_dir / 'types.json', 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)

    fast = sorted([m for m in move_rows.values() if m['kind'] == 'fast'],
                  key=lambda m: (m['turns'] or 9, m['nameKo'] or m['name']))
    with open(out_dir / 'fast_moves.csv', 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(['turns', 'seconds', 'moveId', 'nameKo', 'name', 'type',
                    'power', 'energyGain'])
        for m in fast:
            w.writerow([m['turns'], m['seconds'], m['moveId'], m['nameKo'], m['name'],
                        m['type'], m['power'], m['energyGain']])

    print('4/4 저장 완료')
    dist = {}
    for m in fast:
        dist[m['turns']] = dist.get(m['turns'], 0) + 1
    print()
    print('일반기술 %d종 / 턴 분포 %s' % (len(fast), dict(sorted(dist.items()))))
    print('  %s' % (out_dir / 'moves.json'))
    print('  %s (%d종)' % (out_dir / 'pokemon_moves.json', len(pm_rows)))
    print('  %s (%d개 포맷)' % (out_dir / 'formats.json', len(formats)))
    print('  %s' % (out_dir / 'fast_moves.csv'))
    print('  %s (한글 타입명 %d개)' % (out_dir / 'types.json', len(tko)))
    return 1 if missing else 0


if __name__ == '__main__':
    sys.exit(main())
