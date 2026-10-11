"""
포켓몬 GO PvP 기술 데이터 수집기 — CCT 계산에 필요한 '일반기술 턴 수'가 핵심.

소스
  - 기술 제원(턴·위력·에너지) : PvPoke gamemaster.json
  - 포켓몬별 추천 기술셋      : PvPoke rankings-1500.json (슈퍼리그)
  - 한글 기술명·타입명        : PokeMiners 포켓몬 GO 한국어 로케일 (공식 인게임 표기)

순위 기준은 PvPoke다. PoGoMate도 자체 순위를 내지만 둘이 서로 다르고
(상위 300 집합이 16종 차이) PvPoke를 정본으로 삼는다. PoGoMate는 스프라이트와
한글 포켓몬명만 담당한다 — 두 소스의 종 ID는 1,152종 전부 일치하므로 그대로 붙는다.

범위는 좁히지 않는다. 기술 데이터는 파일 2개로 끝나서 1,152종 전부 받아도 비용이 같다.

출력
  data/moves.json          기술 전체 — id, 한글명, 영문명, 타입, 턴, 위력, 에너지
  data/pokemon_moves.json  1,152종 — 추천 기술셋 + 쓰일 수 있는 일반기술과 각각의 턴 수
  data/fast_moves.csv      일반기술 턴별 요약 (표 작업용)

사용법
  python scripts/fetch_moves.py [--out data]
"""

import argparse
import csv
import json
import pathlib
import re
import sys
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=str(pathlib.Path(__file__).resolve().parent.parent / 'data'),
                    help='출력 폴더 (기본: 저장소의 data/ — 실행 위치와 무관)')
    args = ap.parse_args()
    out_dir = pathlib.Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

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

    print('3/4 PvPoke 슈퍼리그 랭킹(추천 기술셋)…')
    ranks = fetch_json(PVPOKE + 'rankings/all/overall/rankings-1500.json')
    print('    %d종' % len(ranks))

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
    pm_rows = []
    for rank, e in enumerate(ranks, 1):              # 파일 순서 = PvPoke 랭킹(점수 내림차순)
        fast_used = e.get('moves', {}).get('fastMoves', [])
        total = sum(f.get('uses') or 0 for f in fast_used) or 1
        pm_rows.append({
            'speciesId': e['speciesId'],
            'speciesName': e['speciesName'],
            'rank': rank,
            'score': e.get('score'),
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

    json.dump({'count': len(move_rows), 'moves': list(move_rows.values())},
              open(out_dir / 'moves.json', 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    json.dump({'league': 'great', 'count': len(pm_rows), 'pokemon': pm_rows},
              open(out_dir / 'pokemon_moves.json', 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)

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
    print('  %s' % (out_dir / 'pokemon_moves.json'))
    print('  %s' % (out_dir / 'fast_moves.csv'))
    print('  %s (한글 타입명 %d개)' % (out_dir / 'types.json', len(tko)))
    return 1 if missing else 0


if __name__ == '__main__':
    sys.exit(main())
