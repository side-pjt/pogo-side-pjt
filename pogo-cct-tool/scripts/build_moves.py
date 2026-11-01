"""포켓몬별 기술표 데이터(data/moves.js) 생성.

- 기술 수치(위력·에너지·턴)와 포켓몬별 보유 기술: PvPoke gamemaster.json
- 한글 기술명: pogo-move-fetcher/data/moves.json (nameKo)
- 기본 추천 기술: pogo-move-fetcher/data/pokemon_moves.json (슈퍼리그 우선, 없으면 그 종이 나오는 다른 포맷)
  포맷별 추천 기술은 data/formats/<key>.js 의 movesets 에 따로 있다.
- 대상 포켓몬은 data/data.js 의 목록(window.POKEMON 의 id)과 같다.
"""
import json
import pathlib
import re
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
GM = 'https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/gamemaster.json'
KO = ROOT / 'pogo-move-fetcher' / 'data' / 'moves.json'
REC = ROOT / 'pogo-move-fetcher' / 'data' / 'pokemon_moves.json'
DATA = ROOT / 'data' / 'data.js'
OUT = ROOT / 'data' / 'moves.js'


# pogo-move-fetcher 의 moves.json 에 한글명이 없는 최신 기술. PokeAPI(본편 공식 한글명) 기준.
KO_FALLBACK = {
    'BEAK_BLAST': '부리캐논', 'CHILLING_WATER': '찬물끼얹기', 'DIVE': '다이빙',
    'DRUM_BEATING': '드럼어택', 'GIGATON_HAMMER': '거대해머', 'GLAIVE_RUSH': '대검돌격',
    'MIND_BLOWN': '깜짝헤드', 'PLASMA_FISTS': '플라스마피스트', 'PYRO_BALL': '화염볼',
    'SNIPE_SHOT': '노려맞히기',
}


# PvPoke 게임마스터에 아직 없는 새 기술 — 올라오면(같은 id가 생기면) 이 항목은 쓰지 않는다.
# 출처: Dittobase(나이트헤드+ 트레이너 배틀 위력 55·에너지 35). 공식 공지는 위력 55만 밝혔다 — 에너지는 확인되면 고친다.
PROVISIONAL_MOVES = {
    'NIGHT_SHADE_PLUS': {'moveId': 'NIGHT_SHADE_PLUS', 'name': 'Night Shade+', 'type': 'ghost', 'power': 55,
                         'energy': 35, 'energyGain': 0, 'cooldown': 500, 'turns': 1, 'nameKo': '나이트헤드+'},
}
# 임시 기술을 쓸 수 있는 종 {종 id: [기술 id]}
PROVISIONAL_LEARNERS = {'sableye_mega': ['NIGHT_SHADE_PLUS']}


def format_movesets():
    """data/formats/*.js(build_data.py 가 먼저 만든다)의 추천 기술 → {종: (노말들, 스페셜들)}.

    PvPoke 추천에는 종의 기본 기술 목록에 없는 기술이 섞인다 — 은혜갚기(정화)·프러스트레이션(그림자)·
    메가 전용 '…_PLUS'. 기술표에 없으면 배틀 기본 기술이 깨지므로 그 종의 목록에 더한다.
    """
    out = {}
    for p in sorted((ROOT / 'data' / 'formats').glob('*.js')):
        m = re.search(r'window\.FORMAT_DATA\["[^"]+"\] = (\{.*\});', p.read_text(encoding='utf-8'))
        if not m:
            continue
        for sid, ms in json.loads(m.group(1))['movesets'].items():
            fast, chg = out.setdefault(sid, (set(), set()))
            fast.add(ms[0])
            chg.update(ms[1:])
    return out


def main():
    gm = json.load(urllib.request.urlopen(GM, timeout=60))
    for k, m in PROVISIONAL_MOVES.items():
        if not any(x['moveId'] == k for x in gm['moves']):
            gm['moves'].append(m)
            print('    [임시] 게임마스터에 없는 기술 사용: %s' % k)
    ko = {m['moveId']: m.get('nameKo') or KO_FALLBACK.get(m['moveId']) or m['name']
          for m in json.load(open(KO, encoding='utf-8'))['moves']}
    for k, m in PROVISIONAL_MOVES.items():
        ko.setdefault(k, m['nameKo'])
    rec = {p['speciesId']: p['recommended'] for p in json.load(open(REC, encoding='utf-8'))['pokemon']}
    ids = set(re.findall(r'"id":"([a-z0-9_]+)","ko"', DATA.read_text(encoding='utf-8')))
    mon = {p['speciesId']: p for p in gm['pokemon']}
    mv = {m['moveId']: m for m in gm['moves']}

    fmt = format_movesets()
    sets, used, added = {}, set(), 0
    for i in sorted(ids):
        p = mon.get(i)
        if not p:
            continue
        fast = [m for m in p.get('fastMoves', []) if m in mv]
        chg = [m for m in p.get('chargedMoves', []) if m in mv]
        chg += [m for m in PROVISIONAL_LEARNERS.get(i, []) if m in mv and m not in chg]
        r = rec.get(i) or {}
        extra_fast, extra_chg = fmt.get(i, (set(), set()))
        extra_fast = extra_fast | ({r['fast']} if r.get('fast') else set())
        extra_chg = extra_chg | {c for c in r.get('charged', []) if c}
        for lst, extra in ((fast, extra_fast), (chg, extra_chg)):
            for m in sorted(extra):
                if m in mv and m not in lst:
                    lst.append(m)
                    added += 1
        # [노말어택들, 스페셜어택들, 추천 노말, 추천 스페셜들, 대단한 기술 머신 필요, 이벤트 한정]
        sets[i] = [fast, chg, r.get('fast'), [c for c in r.get('charged', []) if c],
                   [m for m in (p.get('eliteMoves') or []) if m in mv],
                   [m for m in (p.get('legacyMoves') or []) if m in mv]]
        used.update(fast + chg)

    table = {}
    for k in sorted(used):
        m = mv[k]
        fast = m['energy'] == 0
        
        row = [ko.get(k, m['name']), m['type'], m['power'],
               m['turns'] if fast else m['energy'], m['energyGain'] if fast else 0]
        if m.get('buffs'):
            # 능력치 변화: [대상(s=자신, o=상대), 공격 단계, 방어 단계, 발동 확률]
            row.append([('s' if m.get('buffTarget') == 'self' else 'o'), m['buffs'][0], m['buffs'][1],
                        float(m.get('buffApplyChance', 1))])
        table[k] = row

    js = ('// 자동 생성 — scripts/build_moves.py\n'
          'window.MOVES = ' + json.dumps(table, ensure_ascii=False, separators=(',', ':')) + ';\n'
          'window.MOVESETS = ' + json.dumps(sets, ensure_ascii=False, separators=(',', ':')) + ';\n')
    OUT.write_text(js, encoding='utf-8')
    print(len(table), 'moves,', len(sets), 'pokemon,', len(js) // 1024, 'KB',
          '(추천 기술 중 기본 목록에 없던 것 %d개 추가)' % added)


if __name__ == '__main__':
    main()
