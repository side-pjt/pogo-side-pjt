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
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
IMG_MANIFEST = ROOT.parent / 'pogo-image-fetcher' / 'assets' / 'manifest.json'
IMG_DIR = ROOT.parent / 'pogo-image-fetcher' / 'assets' / 'pokemon'
MOVE_POKEMON = ROOT.parent / 'pogo-move-fetcher' / 'data' / 'pokemon_moves.json'
MOVE_TABLE = ROOT.parent / 'pogo-move-fetcher' / 'data' / 'moves.json'


def load(p):
    if not p.exists():
        raise SystemExit('없는 파일: %s\n먼저 해당 수집기를 실행하세요.' % p)
    return json.load(open(p, encoding='utf-8'))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--no-images', action='store_true', help='스프라이트 복사 건너뛰기')
    args = ap.parse_args()

    img = load(IMG_MANIFEST)['pokemon']
    mov = load(MOVE_POKEMON)['pokemon']
    moves = {m['moveId']: m for m in load(MOVE_TABLE)['moves']}

    by_species = {m['speciesId']: m for m in mov}
    rows, skipped = [], []

    for a in img:
        m = by_species.get(a['id'])
        if not m:
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
        })

    rows.sort(key=lambda r: r['rank'])

    out = ROOT / 'data'
    out.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(rows, ensure_ascii=False, separators=(',', ':'))
    (out / 'data.js').write_text(
        '// 자동 생성 — scripts/build_data.py\n'
        'window.POKEMON = %s;\n' % payload, encoding='utf-8')

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
