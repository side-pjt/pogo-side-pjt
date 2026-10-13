"""sync_season.py 가 '황혼의 여정' 공지(tests/fixtures/gbl-twilight-trails.*.html)를 읽으면
손으로 적은 data/seasons.js 와 주차·포맷이 똑같이 나와야 한다. 네트워크는 쓰지 않는다.

  python tests/sync_season_test.py
"""

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'pogo-cct-tool' / 'scripts'))
import sync_season as S  # noqa: E402

FIX = ROOT / 'tests' / 'fixtures'
URL = 'https://pokemongo.com/ko/news/go-battle-league-twilight-trails'
ko = (FIX / 'gbl-twilight-trails.ko.html').read_text(encoding='utf-8')
en = (FIX / 'gbl-twilight-trails.en.html').read_text(encoding='utf-8')

season, checks = S.build(ko, en, URL, S.KeyResolver(offline=True))

# 손으로 적은 시즌과 주차·포맷 key 가 같다
old = S.existing_seasons()['go-battle-league-twilight-trails']
assert S.diff_weeks(old, season) == [], S.diff_weeks(old, season)
assert season['id'] == 'twilight-trails'
assert season['ko'] == 'GO배틀리그: 황혼의 여정'
assert season['en'] == 'GO Battle League: Twilight Trails'
assert (season['start'], season['end']) == ('2026-09-08T13:00:00-07:00', '2026-12-01T13:00:00-08:00')

# 서머타임 경계 — 10/27 주는 PDT 로 시작해 PST 로 끝난다
w = next(w for w in season['weeks'] if w['start'].startswith('2026-10-27'))
assert w['end'] == '2026-11-03T13:00:00-08:00'

# 공지 데이터의 어긋난 시각(00:34Z)은 날짜 표기대로 고치고 확인 목록에 올린다
assert any('00:34' in c for c in checks)
w = next(w for w in season['weeks'] if w['start'].startswith('2026-11-18'))
assert w['start'] == '2026-11-18T13:00:00-08:00'

# 비거나 겹친 주는 메모로 남긴다
assert any('비어 있습니다' in n for n in season['notes'])
assert any('겹칩니다' in n for n in season['notes'])

# 출전 조건 요약
assert season['rules']['colormega-1500'] == 'CP 1,500 이하 · 메가진화 가능 · 풀·불꽃·물·전기 타입만'
assert season['rules']['willpower-1500'].endswith('가디안·조로아·조로아크 사용 불가')
assert '14종 금지' in season['rules']['laic2027-1500']
assert 'great' not in season['rules'] and 'mega-1500' not in season['rules']

# seasons.js 에 붙일 블록은 build_data.py 가 읽는 '한 주 한 줄' 형식이다
block = S.render_season(season)
assert block.count("formats: [") == len(season['weeks'])

# 서머타임 판정
import datetime  # noqa: E402
assert S.pacific_offset(datetime.date(2027, 3, 13)) == -8
assert S.pacific_offset(datetime.date(2027, 3, 14)) == -7
assert S.pacific_offset(datetime.date(2026, 10, 31)) == -7
assert S.pacific_offset(datetime.date(2026, 11, 1)) == -8


# ---- 가상의 다음 시즌 — 해 넘김, 서머타임 시작, 새 컵, 어긋난 시각, 따옴표 ------------------
import json  # noqa: E402
import shutil  # noqa: E402
import subprocess  # noqa: E402
import tempfile  # noqa: E402


def page(title, weeks, cups, heading):
    items = ''.join(
        '<div data-slot="GblScheduleBlockItem" data-start-date="%s" data-end-date="%s" class="x">'
        '<button data-slot="GblScheduleBlockButton"><span data-slot="GblScheduleBlockDates">%s - %s</span></button>'
        '<div class="_gblScheduleBlockScheduleItemContent_1"><div>%s</div></div></div>'
        % (a, b, la, lb, ''.join('<div class="_gblScheduleBlockScheduleItemLeague_1cyux_43"><div><div class="_image_1"></div>'
                                 '</div><div>%s</div></div>' % n for n in names))
        for a, b, la, lb, names in weeks)
    cup_html = ''.join('<h2 class="h">%s</h2><div><ul>%s</ul></div>' % (n, ''.join('<li>%s</li>' % x for x in lines))
                       for n, lines in cups)
    return ('<article><h2 class="h">%s</h2><p>GO배틀리그 랭크가 초기화됩니다.</p><h2 class="h">%s</h2>'
            '<pg-gbl-schedule>%s</pg-gbl-schedule><h2 class="h">%s</h2>%s<h2 class="h">변경되는 기술</h2></article>'
            % (title, title + ' 일정', items, heading, cup_html))


KO_WEEKS = [
    ('2026-12-01T21:00:00.000Z', '2026-12-08T21:00:00.000Z', '12월 1일', '12월 8일', ['슈퍼리그', '하이퍼리그', '마스터리그']),
    ('2026-12-29T21:00:00.000Z', '2027-01-05T21:00:00.000Z', '12월 29일', '1월 5일',
     ['슈퍼리그: 메가 버전', "트레이너's 컵: 하이퍼리그 버전*"]),
    # 공지 데이터 시각이 어긋난 주 — 날짜 표기(해 넘김 뒤)를 따라야 한다
    ('2027-01-05T03:10:00.000Z', '2027-01-12T03:10:00.000Z', '1월 5일', '1월 12일', ['리틀컵']),
    # 서머타임 시작(2027-03-14) 을 끼는 주
    ('2027-03-09T21:00:00.000Z', '2027-03-16T20:00:00.000Z', '3월 9일', '3월 16일', ['마스터리그: 메가 버전']),
]
EN_WEEKS = [w[:4] + (n,) for w, n in zip(KO_WEEKS, [
    ['Great League', 'Ultra League', 'Master League'],
    ['Great League: Mega Edition', "Trainer's Cup: Ultra League Edition*"],
    ['Little Cup'], ['Master League: Mega Edition']])]
ko2 = page('GO배틀리그: 가상의 시즌', KO_WEEKS, [
    ("트레이너's 컵: 하이퍼리그 버전", ['2,500CP 이하 포켓몬만 참가할 수 있습니다.',
                                    '노말타입, 비행타입 포켓몬만 참가할 수 있습니다.',
                                    '새로운 규칙이 적용됩니다.'])], '컵')
en2 = page('GO Battle League: Imaginary Season', EN_WEEKS, [], 'Cups')
URL2 = 'https://pokemongo.com/ko/news/go-battle-league-imaginary-season'
# 실제 seasons.js 에 시즌이 늘어도(별칭이 늘어도) 결과가 같게 — 이 가상 시즌은 포맷 목록 이름만 보고 푼다
_real = S.SEASONS
S.SEASONS = FIX / 'no-such-seasons.js'
try:
    s2, checks2 = S.build(ko2, en2, URL2, S.KeyResolver(offline=True))
finally:
    S.SEASONS = _real

assert s2['id'] == 'imaginary-season', s2['id']
assert s2['en'] == 'GO Battle League: Imaginary Season'
assert [w['start'] for w in s2['weeks']] == [
    '2026-12-01T13:00:00-08:00', '2026-12-29T13:00:00-08:00', '2027-01-05T13:00:00-08:00', '2027-03-09T13:00:00-08:00']
assert [w['end'] for w in s2['weeks']] == [
    '2026-12-08T13:00:00-08:00', '2027-01-05T13:00:00-08:00', '2027-01-12T13:00:00-08:00', '2027-03-16T13:00:00-07:00']
assert s2['end'] == '2027-03-16T13:00:00-07:00'
keys = [[f['key'] for f in w['formats']] for w in s2['weeks']]
assert keys[0] == ['great', 'ultra', 'master'] and keys[2] == ['little-500'] and keys[3] == ['mega-10000']
new_key = keys[1][1]
assert new_key == 'trainers-2500', new_key                                     # CP 는 'Ultra League Edition' 에서
assert any(new_key in c for c in checks2), checks2                            # 임시 key 는 확인 목록에
assert any('03:10' in c for c in checks2)
assert s2['rules'][new_key] == 'CP 2,500 이하 · 노말·비행 타입만 · 새로운 규칙이 적용됩니다', s2['rules'][new_key]
assert any('비어 있습니다' in n for n in s2['notes'])                          # 12/8 – 12/29, 1/12 – 3/9

# ---- seasons.js 에 붙이고 진짜 season.js 로 읽어 본다 -----------------------------------
# 사본은 '황혼의 여정' 하나만 담는다 — 실제 seasons.js 에 시즌이 더 늘어도 이 시험은 그대로 돈다.
import contextlib  # noqa: E402
import io  # noqa: E402

REAL = S.SEASONS
HEADER = REAL.read_text(encoding='utf-8')
HEADER = HEADER[:HEADER.index('window.SEASONS = [')]
SLUG1, SLUG2 = 'go-battle-league-twilight-trails', 'go-battle-league-imaginary-season'


def fresh_copy(tmp, tail=''):
    f = tmp / 'seasons.js'
    f.write_text(HEADER + 'window.SEASONS = [' + S.render_season(season) + '];\n' + tail, encoding='utf-8')
    S.SEASONS = f
    return f


def run_main(*argv):
    old_argv, buf = sys.argv, io.StringIO()
    sys.argv = ['sync_season.py'] + list(argv)
    try:
        with contextlib.redirect_stdout(buf):
            code = S.main()
    finally:
        sys.argv = old_argv
    return code, buf.getvalue()


JS_CHECK = r"""
const fs = require('fs'), vm = require('vm'), path = require('path');
const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
for (const f of [path.join(process.argv[1], 'data/formats/index.js'), process.argv[2], path.join(process.argv[1], 'season.js')])
  vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
const S = ctx.Season, byId = id => S.list.find(s => s.id === id);
const at = S.at(Date.parse('2027-01-01T00:00:00Z'));
const e = S.entry(byId('imaginary-season').weeks[1].formats[1]);
console.log(JSON.stringify({ ids: Array.from(S.list, s => s.id), season: at.season && at.season.id,
  live: Array.from(at.live, x => x.key), newKo: e.ko, ready: e.ready,
  gapLive: S.at(Date.parse('2027-02-01T00:00:00Z')).live.length, tail: ctx.TAIL_OK === true }));
"""


def node_check(f):
    out = subprocess.run(['node', '-e', JS_CHECK, str(ROOT), str(f)], capture_output=True, text=True, encoding='utf-8')
    assert out.returncode == 0, out.stderr
    return json.loads(out.stdout)


tmp = pathlib.Path(tempfile.mkdtemp())
try:
    # 붙이기 — 기존 시즌은 그대로, ]; 뒤의 내용도 그대로
    f = fresh_copy(tmp, tail='// 꼬리 주석\nwindow.TAIL_OK = true;\n')
    S.append_season(S.render_season(s2))
    after = S.existing_seasons()
    assert set(after) == {SLUG1, SLUG2}, set(after)
    assert S.diff_weeks(after[SLUG1], season) == []
    assert len(after[SLUG2]['weeks']) == 4
    assert ("트레이너's 컵: 하이퍼리그 버전", new_key) in after[SLUG2]['aliases']    # {key, ko} 로 적혀 다시 읽힌다
    r = node_check(f)
    assert r['ids'] == ['twilight-trails', 'imaginary-season'], r
    assert r['season'] == 'imaginary-season' and r['live'] == ['mega-1500', new_key], r
    assert r['newKo'] == "트레이너's 컵: 하이퍼리그 버전" and r['ready'] is False, r   # 순위 없으면 '준비 중'
    assert r['gapLive'] == 0, r                                                     # 일정이 빈 기간
    assert r['tail'] is True, r

    # 따옴표 든 이름도 다음 실행에서 별칭으로 읽힌다 → 사람이 key 를 고치면 그 key 를 쓴다
    fixed = f.read_text(encoding='utf-8').replace("key: '%s'" % new_key, "key: 'realid-2500'")
    f.write_text(fixed, encoding='utf-8')
    assert S.known_names()[S.norm_ko("트레이너's 컵: 하이퍼리그 버전")] == 'realid-2500'
    again, _ = S.build(ko2, en2, URL2, S.KeyResolver(offline=True))
    assert S.diff_weeks(S.existing_seasons()[SLUG2], again) == []                  # 되돌리라는 보고가 없다

    # 실제 실행 경로(main) — 이미 있는 시즌은 손대지 않고, 보고도 없다
    k, e2 = tmp / 'ko.html', tmp / 'en.html'
    k.write_text(ko2, encoding='utf-8'); e2.write_text(en2, encoding='utf-8')
    before = f.read_text(encoding='utf-8')
    code, out = run_main('--ko-html', str(k), '--en-html', str(e2), '--url', URL2, '--report', str(tmp / 'r.md'))
    assert code == 0 and '이미 등록됨' in out and f.read_text(encoding='utf-8') == before, out
    assert not (tmp / 'r.md').exists()

    # 다른 주소(/en/, ?쿼리)로 와도 같은 공지로 본다
    code, out = run_main('--ko-html', str(k), '--url', URL2.replace('/ko/', '/en/') + '/?utm=x')
    assert '이미 등록됨' in out and f.read_text(encoding='utf-8') == before, out

    # 다른 공지인데 기간이 겹치면 더하지 않고 보고한다 (시즌 중 일정 변경 공지 등)
    code, out = run_main('--ko-html', str(k), '--en-html', str(e2), '--url', URL2 + '-update', '--report', str(tmp / 'r.md'))
    assert code == 0 and '겹쳐서 더하지 않았다' in out and f.read_text(encoding='utf-8') == before, out
    assert '겹쳐서 더하지 않았다' in (tmp / 'r.md').read_text(encoding='utf-8')
    (tmp / 'r.md').unlink()

    # 새 시즌은 main 으로 더해지고 보고가 남는다
    fresh_copy(tmp)
    code, out = run_main('--ko-html', str(k), '--en-html', str(e2), '--url', URL2, '--report', str(tmp / 'r.md'))
    assert code == 0 and '새로 더한 시즌 1개' in out, out
    assert '새 시즌을 seasons.js 에 더했다' in (tmp / 'r.md').read_text(encoding='utf-8')
    assert node_check(S.SEASONS)['ids'] == ['twilight-trails', 'imaginary-season']

    # 공지 모양이 바뀌어 해석하지 못해도 죽지 않고 보고한다
    (tmp / 'r.md').unlink()
    bad = tmp / 'bad.html'
    bad.write_text('<pg-gbl-schedule><div data-slot="GblScheduleBlockItem" data-start-date="x"></div></pg-gbl-schedule>',
                   encoding='utf-8')
    code, out = run_main('--ko-html', str(bad), '--url', URL2 + '-broken', '--report', str(tmp / 'r.md'))
    assert code == 0 and '해석하지 못했다' in (tmp / 'r.md').read_text(encoding='utf-8'), out

    # 사이트 장애(목록·공지 받기 실패)도 죽지 않고 보고한다
    (tmp / 'r.md').unlink()
    real_fetch = S.fetch

    def down(url):
        raise TimeoutError('read timed out')
    S.fetch = down
    try:
        code, out = run_main('--report', str(tmp / 'r.md'))
    finally:
        S.fetch = real_fetch
    assert code == 0 and '공지 목록을 읽지 못했다' in (tmp / 'r.md').read_text(encoding='utf-8'), out
finally:
    S.SEASONS = REAL
    shutil.rmtree(tmp)

# ---- 공지 표기의 작은 변형 -------------------------------------------------------------
# 이름·문장 안의 줄바꿈 → 한 줄 JS 문자열
assert S.text('<div>멀티\n  라인컵</div>') == '멀티 라인컵'
assert S.js('a\nb c\'d') == "'a\\nb\\u2028c\\'d'"
assert S.unjs("a\\nb\\u2028c\\'d\\\\e") == "a\nb c'd\\e"
for name in ["트레이너's 컵", 'back\\slash', '줄\n바꿈', '"따옴표"']:
    assert S.unjs(S.js(name)[1:-1]) == name, name
# 한글 이름만으로도 CP
assert S.cp_of('', None, '판타지컵: 하이퍼리그 버전') == 2500
assert S.cp_of('', None, '판타지컵: 마스터리그 버전') == 10000
assert S.cp_of('', ['1,500CP 이하 포켓몬만'], '새컵') == 1500
assert S.cp_of('', None, '리틀컵') == 500
# 날짜 표기 변형 — 요일 괄호, en dash
d, why = S.week_dates('2026-12-02T03:00:00.000Z', '12월 1일(화)', 2026)
assert d == datetime.date(2026, 12, 1) and why
assert S.parse_schedule(ko2.replace(' - ', ' – '))[1][2:4] == ('12월 29일', '1월 5일')
# 컵이 하나도 없는 주도 깨지지 않는다
empty = S.render_season(dict(s2, weeks=[dict(s2['weeks'][0], formats=[])]))
assert 'formats: [] }' in empty

print('sync_season ok')
