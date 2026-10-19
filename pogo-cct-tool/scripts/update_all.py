"""
데이터 일괄 갱신 — 수집기 둘과 도구 데이터 빌드를 순서대로 돌리고 요약을 낸다.

  1. pogo-move-fetcher   포맷 목록(PvPoke 자동), 포맷별 순위·추천 기술셋, 한글 기술·컵 이름
  2. pogo-image-fetcher  모든 리그·컵의 종, 스프라이트, 한글 포켓몬명
                         (1의 순위에 있는데 PoGoMate에 없는 종도 채우므로 1 다음에 돈다)
  3. pogo-cct-tool       data/*.js, data/formats/*.js, images/

한 단계가 경고로 끝나도(예: 한글명이 아직 없는 신규 기술) 다음 단계는 계속 돌린다.
요약의 경고는 사람이 확인할 목록이다.

사용법
  python pogo-cct-tool/scripts/update_all.py [--no-images] [--extra fantasy:1500 ...]
"""

import argparse
import json
import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
MANIFEST = ROOT / 'pogo-image-fetcher' / 'assets' / 'manifest.json'
FORMATS = ROOT / 'pogo-move-fetcher' / 'data' / 'formats.json'


def run(title, args):
    print('\n=== %s ===' % title, flush=True)
    env = dict(os.environ, PYTHONIOENCODING='utf-8')
    return subprocess.run([sys.executable] + args, cwd=ROOT, env=env).returncode


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--no-images', action='store_true', help='스프라이트 내려받기·복사 건너뛰기')
    ap.add_argument('--extra', nargs='*', default=[], metavar='CUP:CP',
                    help='PvPoke formats 에 없는 컵 추가 (예: fantasy:1500)')
    args = ap.parse_args()

    steps = [('1/4 포맷·순위·기술', ['pogo-move-fetcher/scripts/fetch_moves.py']
              + (['--extra'] + args.extra if args.extra else []))]
    if not args.no_images:
        steps.append(('2/4 이미지·한글 포켓몬명', ['pogo-image-fetcher/scripts/fetch_assets.py']))
    steps.append(('3/4 도구 데이터 빌드', ['pogo-cct-tool/scripts/build_data.py']
                  + (['--no-images'] if args.no_images else [])))
    steps.append(('4/4 기술표 빌드', ['pogo-cct-tool/scripts/build_moves.py']))
    codes = [(title, run(title, cmd)) for title, cmd in steps]

    print('\n=== 요약 ===')
    if MANIFEST.exists():
        m = json.load(open(MANIFEST, encoding='utf-8'))
        print('종 %d / 스프라이트 %d장' % (m['count'], len({p['url'] for p in m['pokemon']})))
    if FORMATS.exists():
        f = json.load(open(FORMATS, encoding='utf-8'))
        print('포맷 %d개' % f['count'])
        for x in f['formats']:
            note = '' if x['nameSource'] in ('official', 'override') else '  ← 한글 이름 확인 (%s)' % x['nameSource']
            print('  %-16s %s · %d종%s' % (x['key'], x['ko'], x['count'], note))
        if f['noRanking']:
            print('  순위 파일 아직 없음: %s' % ', '.join(f['noRanking']))
    failed = [t for t, c in codes if c]
    if failed:
        print('경고로 끝난 단계: %s (위 로그의 [경고] 확인)' % ', '.join(failed))
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
