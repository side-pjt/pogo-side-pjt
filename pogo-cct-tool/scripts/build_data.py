"""
pogo-image-fetcher + pogo-move-fetcher 결과를 합쳐 정적 도구용 데이터를 만든다.

- data/data.js   전역 변수로 내보낸다. fetch()가 아니라 <script>로 읽어야
                 file:// 로 열었을 때도 동작한다 (정적 빌드의 핵심 제약).
- images/        스프라이트를 복사해 자체 완결 폴더로 만든다.

사용법
  python scripts/build_data.py [--no-images]
"""

import argparse
import json
import pathlib
import re
import shutil
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
IMG_MANIFEST = ROOT.parent / 'pogo-image-fetcher' / 'assets' / 'manifest.json'
IMG_DIR = ROOT.parent / 'pogo-image-fetcher' / 'assets' / 'pokemon'
MOVE_POKEMON = ROOT.parent / 'pogo-move-fetcher' / 'data' / 'pokemon_moves.json'
MOVE_TABLE = ROOT.parent / 'pogo-move-fetcher' / 'data' / 'moves.json'

# CMP 계산용 — 종족값과 CPM 표는 PvPoke 소스에서 직접 받는다.
# 공격 실수치 = (종족값공격 + 공격개체값) x CPM(레벨)  — 1,152종 전부 재현 검증 완료.
PVPOKE_GM = 'https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/gamemaster.json'
PVPOKE_POKEMON_JS = ('https://raw.githubusercontent.com/pvpoke/pvpoke/master/'
                     'src/js/pokemon/Pokemon.js')

# 타입 상성 — PvPoke DamageCalculator 의 getTypeTraits 를 쓴다.
# 공식 GAME_MASTER 의 attackScalar 배열과 324칸 전부 대조해 검증했다.
# attackScalar 쪽은 배열 순서에 라벨이 없어 순서를 가정해야 하지만, 이쪽은 타입을
# 이름으로 적어 둬서 추측할 여지가 없다. 그래서 이쪽을 정본으로 쓴다.
PVPOKE_DMG_JS = ('https://raw.githubusercontent.com/pvpoke/pvpoke/master/'
                 'src/js/battle/DamageCalculator.js')
TYPE_MOVE_TABLE = ROOT.parent / 'pogo-move-fetcher' / 'data' / 'types.json'

SUPER, RESIST, DOUBLE_RESIST = 1.6, 0.625, 0.390625


def load(p):
    if not p.exists():
        raise SystemExit('없는 파일: %s\n먼저 해당 수집기를 실행하세요.' % p)
    return json.load(open(p, encoding='utf-8'))


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'pogo-cct-build'})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read().decode('utf-8', 'replace')


def load_cmp_source():
    """CMP 계산에 필요한 종족값과 CPM 표.

    개체값·레벨 조합은 브라우저에서 계산한다 (4096조합 x 이진탐색이면 즉시 끝난다).
    그래서 여기서는 재료만 넘기고 프리셋을 미리 굽지 않는다.
    """
    gm = json.loads(fetch(PVPOKE_GM))
    base = {p['speciesId']: p['baseStats'] for p in gm['pokemon'] if 'baseStats' in p}

    js = fetch(PVPOKE_POKEMON_JS)
    m = re.search(r'cpms\s*=\s*\[([^\]]+)\]', js)
    if not m:
        raise SystemExit('CPM 표를 찾지 못했습니다 — PvPoke 소스 구조가 바뀌었을 수 있습니다.')
    cpms = [float(x) for x in m.group(1).split(',')]
    if len(cpms) < 100:
        raise SystemExit('CPM 표가 너무 짧습니다 (%d개)' % len(cpms))
    return base, cpms


def load_type_chart():
    """방어 타입별 약점·저항·무효를 긁어 18x18 배율 행렬로 만든다."""
    src = fetch(PVPOKE_DMG_JS)
    traits = {}
    for m in re.finditer(r'case\s+"(\w+)":\s*traits\s*=\s*\{(.*?)\};', src, re.S):
        t, body = m.group(1), m.group(2)
        got = {}
        for key in ('resistances', 'weaknesses', 'immunities'):
            block = re.search(key + r':\s*\[(.*?)\]', body, re.S)
            got[key] = re.findall(r'"(\w+)"', block.group(1)) if block else []
        traits[t] = got

    if len(traits) != 18:
        raise SystemExit('타입 상성표를 18개로 못 읽었습니다 (%d개) — PvPoke 소스 구조 확인 필요.'
                         % len(traits))

    def mult(atk, dfn):
        tr = traits[dfn]
        if atk in tr['weaknesses']:
            return SUPER
        if atk in tr['resistances']:
            return RESIST
        if atk in tr['immunities']:
            return DOUBLE_RESIST
        return 1.0

    # 게임 내 표준 타입 순서. GAME_MASTER attackScalar 배열의 인덱스 순서와 같고,
    # 324칸 전부 대조해 확인했다. 알파벳순으로 두면 표가 읽기 어색해진다.
    order = ['normal', 'fighting', 'flying', 'poison', 'ground', 'rock',
             'bug', 'ghost', 'steel', 'fire', 'water', 'grass',
             'electric', 'psychic', 'ice', 'dragon', 'dark', 'fairy']
    if set(order) != set(traits):
        raise SystemExit('타입 목록이 표준 순서와 다릅니다: %s' % (set(order) ^ set(traits)))

    chart = {a: {d: mult(a, d) for d in order} for a in order}

    ko = {}
    if TYPE_MOVE_TABLE.exists():
        ko = load(TYPE_MOVE_TABLE)['types']
    missing = [t for t in order if t not in ko]
    if missing:
        print('  [경고] 한글 타입명 없음: %s' % ', '.join(missing))

    return {'order': order, 'ko': ko, 'chart': chart,
            'mult': {'super': SUPER, 'resist': RESIST, 'doubleResist': DOUBLE_RESIST}}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--no-images', action='store_true', help='스프라이트 복사 건너뛰기')
    args = ap.parse_args()

    img = load(IMG_MANIFEST)['pokemon']
    mov = load(MOVE_POKEMON)['pokemon']
    moves = {m['moveId']: m for m in load(MOVE_TABLE)['moves']}

    print('CMP용 종족값·CPM 표 받는 중…')
    base_stats, cpms = load_cmp_source()
    print('  종족값 %d종 / CPM %d개 (레벨 1~%g)'
          % (len(base_stats), len(cpms), 1 + (len(cpms) - 1) / 2))

    print('타입 상성표 받는 중…')
    types = load_type_chart()
    print('  타입 %d개 / 상성 %d칸' % (len(types['order']), len(types['order']) ** 2))

    by_species = {m['speciesId']: m for m in mov}
    rows, skipped = [], []

    for a in img:
        m = by_species.get(a['id'])
        bs = base_stats.get(a['id'])
        if not m or not bs:
            skipped.append(a['id'])
            continue

        # 상대가 실제로 들고 나올 수 있는 일반기술 — 턴 수를 아는 것만
        fast = [{
            'id': f['moveId'],
            'name': moves.get(f['moveId'], {}).get('nameDisplay') or f['moveId'],
            'turns': f['turns'],
            'share': f['share'],
        } for f in m['fastMoves'] if f.get('turns')]
        if not fast:
            skipped.append(a['id'])
            continue

        fast.sort(key=lambda f: -f['share'])
        rec = m['recommended']['fast']
        # 추천 기술을 맨 앞으로
        fast.sort(key=lambda f: f['id'] != rec)

        rows.append({
            'id': a['id'],
            'ko': a['displayKo'],
            'en': a['name'],
            'rank': a['rank'],
            'types': a['types'],
            'shadow': a['isShadow'],
            'img': pathlib.PurePosixPath(a['file']).name,
            'fast': fast,
            'base': [bs['atk'], bs['def'], bs['hp']],   # CMP 계산용 종족값
        })

    rows.sort(key=lambda r: r['rank'])

    out = ROOT / 'data'
    out.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(rows, ensure_ascii=False, separators=(',', ':'))
    (out / 'data.js').write_text(
        '// 자동 생성 — scripts/build_data.py\n'
        'window.POKEMON = %s;\n'
        '// CPM[i] = 레벨 (1 + i/2) 의 배율. 공격 실수치 = (종족값 + 개체값) x CPM\n'
        'window.CPM = %s;\n'
        '// TYPES.chart[공격타입][방어타입] = 배율 (1.6 / 1 / 0.625 / 0.390625)\n'
        'window.TYPES = %s;\n'
        % (payload,
           json.dumps(cpms, separators=(',', ':')),
           json.dumps(types, ensure_ascii=False, separators=(',', ':'))), encoding='utf-8')

    if not args.no_images:
        dst = ROOT / 'images'
        dst.mkdir(parents=True, exist_ok=True)
        want = {r['img'] for r in rows}
        copied = 0
        for name in want:
            src, tgt = IMG_DIR / name, dst / name
            if not tgt.exists() or tgt.stat().st_size != src.stat().st_size:
                shutil.copy2(src, tgt)
                copied += 1
        for p in dst.glob('*.webp'):          # 범위에서 빠진 옛 파일 정리
            if p.name not in want:
                p.unlink()
        print('이미지: %d장 (새로 복사 %d장)' % (len(want), copied))

    print('포켓몬 %d종 / data.js %.0f KB' % (len(rows), len(payload) / 1024))
    if skipped:
        print('[경고] 기술 데이터 없어 제외: %d종 %s' % (len(skipped), skipped[:5]))
    return 0


if __name__ == '__main__':
    sys.exit(main())
