"""포켓몬별 기술표 데이터(data/moves.js) 생성.

- 기술 수치(위력·에너지·턴)와 포켓몬별 보유 기술: PvPoke gamemaster.json
- 한글 기술명: pogo-move-fetcher/data/moves.json (nameKo)
- 추천 기술: pogo-move-fetcher/data/pokemon_moves.json (슈퍼리그 기준)
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


def main():
    gm = json.load(urllib.request.urlopen(GM, timeout=60))
    ko = {m['moveId']: m.get('nameKo') or KO_FALLBACK.get(m['moveId']) or m['name']
          for m in json.load(open(KO, encoding='utf-8'))['moves']}
    rec = {p['speciesId']: p['recommended'] for p in json.load(open(REC, encoding='utf-8'))['pokemon']}
    ids = set(re.findall(r'"id":"([a-z0-9_]+)","ko"', DATA.read_text(encoding='utf-8')))
    mon = {p['speciesId']: p for p in gm['pokemon']}
    mv = {m['moveId']: m for m in gm['moves']}

    sets, used = {}, set()
    for i in sorted(ids):
        p = mon.get(i)
        if not p:
            continue
        fast = [m for m in p.get('fastMoves', []) if m in mv]
        chg = [m for m in p.get('chargedMoves', []) if m in mv]
        r = rec.get(i) or {}
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
    print(len(table), 'moves,', len(sets), 'pokemon,', len(js) // 1024, 'KB')


if __name__ == '__main__':
    main()
