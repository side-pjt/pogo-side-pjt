"""
GO배틀리그 시즌 일정 동기화 — 포켓몬 GO 공식 공지를 읽어 data/seasons.js 에 새 시즌을 더한다.

공지 페이지(pokemongo.com/<언어>/news/go-battle-league-…)에는 일정표 블록 <pg-gbl-schedule> 이 있고,
주마다 data-start-date / data-end-date(UTC) 와 열리는 리그·컵 이름이 들어 있다. 이것을 읽는다.

  - 한국어 공지  주차·컵의 한글 이름, '컵' 절의 출전 조건
  - 영어 공지    시즌 영문 이름, 컵 영문 이름(PvPoke 컵 id 를 찾는 데 쓴다)
  - 포맷 key     ① 지난 시즌에 적어 둔 {key, ko} ② data/formats/index.js 의 한글 이름
                 ③ PvPoke gamemaster 의 컵 영문 제목 ④ 영문 이름으로 추정해 PvPoke 순위 파일이 있는지 확인
                 ③④로 정한 key 는 '확인 필요' 로 보고한다

이미 있는 시즌(같은 공지 주소)은 고치지 않는다 — 손으로 다듬은 내용을 지키기 위해서다.
대신 공지와 주차·포맷이 달라졌으면 보고한다.

사용법
  python pogo-cct-tool/scripts/sync_season.py [--url 공지주소] [--dry-run] [--report 파일]
  python pogo-cct-tool/scripts/sync_season.py --ko-html ko.html --en-html en.html --dry-run   # 받아 둔 페이지로

--report 를 주면 사람이 확인할 것(새 시즌 추가, 추정한 컵 id, 공지와 달라진 주차)을 마크다운으로 적는다.
확인할 것이 없으면 파일을 만들지 않는다.
"""

import argparse
import datetime
import html
import json
import pathlib
import re
import sys
import urllib.error
import urllib.request
import zlib

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
SEASONS = ROOT / 'data' / 'seasons.js'
FORMAT_INDEX = ROOT / 'data' / 'formats' / 'index.js'
NEWS = 'https://pokemongo.com/%s/news'
POST = 'https://pokemongo.com/%s/news/%s'
PVPOKE = 'https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/'
UA = 'Mozilla/5.0 (pogo-season-sync)'
SLUG = re.compile(r'href="/ko/news/((?:go-)?(?:battle-league|gbl)[a-z0-9-]*)"')

LEAGUE_CP = {'Great': 1500, 'Ultra': 2500, 'Master': 10000}
BASE_KEYS = {'great', 'ultra', 'master'}


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode('utf-8')


def text(s):
    """태그를 벗기고 줄바꿈·연속 공백을 한 칸으로 — 이름·문장이 JS 문자열 한 줄에 들어가야 한다."""
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s))).strip()


def norm_ko(s):
    return re.sub(r'[\s*"“”]', '', s)


def norm_en(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())


# ---- 시간 ---------------------------------------------------------------
def pacific_offset(d):
    """미국 서머타임(3월 둘째 일요일 ~ 11월 첫째 일요일) — 그날 13:00 태평양 시간의 오프셋(시간)."""
    def sunday(month, nth):
        first = datetime.date(d.year, month, 1)
        return first + datetime.timedelta(days=(6 - first.weekday()) % 7 + 7 * (nth - 1))
    return -7 if sunday(3, 2) <= d < sunday(11, 1) else -8


def pacific_iso(d):
    return '%sT13:00:00%+03d:00' % (d.isoformat(), pacific_offset(d))


def week_dates(utc_iso, label, year_hint):
    """주 경계는 늘 태평양 시간 13:00 이다. 공지의 UTC 값이 그 시각이면 그 날짜를 쓰고,
    아니면(공지 데이터 오류 — 실제로 00:34Z 가 있었다) 화면에 보이는 날짜 표기를 따른다."""
    t = datetime.datetime.fromisoformat(utc_iso.replace('Z', '+00:00'))
    local = t + datetime.timedelta(hours=pacific_offset((t - datetime.timedelta(hours=8)).date()))
    if (local.hour, local.minute) == (13, 0):
        return local.date(), None
    m = re.search(r'(\d+)\s*월\s*(\d+)\s*일', label)
    if not m:
        raise ValueError('주 날짜를 읽지 못했다: %s / %s' % (utc_iso, label))
    d = datetime.date(year_hint, int(m.group(1)), int(m.group(2)))
    if (d - local.date()).days > 180:       # 해를 넘는 주
        d = d.replace(year=d.year - 1)
    elif (local.date() - d).days > 180:
        d = d.replace(year=d.year + 1)
    return d, '공지 데이터의 %s 시각이 %s 로 어긋나 있어 날짜 표기대로 13:00 으로 적었다' % (label.strip(), utc_iso)


# ---- 공지 읽기 -------------------------------------------------------------
def parse_schedule(page):
    """[(start_utc, end_utc, start_label, end_label, [리그·컵 이름…])]"""
    m = re.search(r'<pg-gbl-schedule>(.*?)</pg-gbl-schedule>', page, re.S)
    if not m:
        return []
    weeks = []
    for item in re.split(r'(?=<div data-slot="GblScheduleBlockItem")', m.group(1))[1:]:
        start = re.search(r'data-start-date="([^"]+)"', item).group(1)
        end = re.search(r'data-end-date="([^"]+)"', item).group(1)
        label = text(re.search(r'data-slot="GblScheduleBlockDates">(.*?)</span>', item, re.S).group(1))
        names = [text(x).rstrip('*').strip() for x in
                 re.findall(r'_gblScheduleBlockScheduleItemLeague_[^"]*">.*?<div>([^<]*)</div></div>', item, re.S)]
        a, b = (re.split(r'\s*[-–—~]\s*', label, maxsplit=1) + [''])[:2]
        weeks.append((start, end, a, b, names))
    return weeks


def parse_cups(page, names):
    """'컵' 절에서 일정표에 나온 이름마다 조건 문장과 참가 불가 포켓몬 목록을 모은다."""
    want = {norm_ko(n) for n in names}
    out = {}
    heads = list(re.finditer(r'<h2[^>]*>(.*?)</h2>', page, re.S))
    for i, h in enumerate(heads):
        name = text(h.group(1))
        if norm_ko(name) not in want:
            continue
        body = page[h.end(): heads[i + 1].start() if i + 1 < len(heads) else len(page)]
        lines = [text(x) for x in re.findall(r'<(?:li|p)>(.*?)</(?:li|p)>', body, re.S)]
        banned = [text(x).strip('"') for x in
                  re.findall(r'_pokemonImageGridBlockGridPokemonCaption_[^"]*">(.*?)</div>', body, re.S)]
        out[norm_ko(name)] = {'lines': [x for x in lines if x], 'banned': list(dict.fromkeys(banned))}
    return out


def season_names(ko_page, en_page):
    heads = lambda p: [text(x) for x in re.findall(r'<h2[^>]*>(.*?)</h2>', p, re.S)]
    ko = next(h for h in heads(ko_page) if h.startswith('GO배틀리그:'))
    en = next((h for h in heads(en_page) if h.startswith('GO Battle League:')), '') if en_page else ''
    return ko, en


# ---- 출전 조건 요약 ---------------------------------------------------------
def types_in(s):
    return '·'.join(t.strip() for t in re.split(r',\s*', re.sub(r'타입', '', s)) if t.strip())


def summarize_rules(cup):
    """공지 문장을 seasons.js 의 rules 처럼 짧게 줄인다. 모르는 문장은 그대로 둔다."""
    parts = []
    for s in cup['lines']:
        s = s.rstrip('*')
        if re.search(r'다음 포켓몬은 참가할 수 없', s):
            b = cup['banned']
            if b:
                parts.append('%s 사용 불가' % '·'.join(b) if len(b) <= 5 else '%s 등 %d종 금지' % ('·'.join(b[:5]), len(b)))
            continue
        m = re.search(r'([\d,]+)\s*CP 이하', s)
        if m:
            parts.append('CP %s 이하' % m.group(1))
        elif re.match(r'메가진화 포켓몬이 참가할 수 있', s):
            parts.append('메가진화 가능')
        elif re.match(r'메가진화 포켓몬은', s) and '참가할 수 없' in s:
            parts.append('메가진화 사용 불가')
        elif re.match(r'(.+?)\s*포켓몬만 참가할 수 있', s) and '타입' in s:
            parts.append('%s 타입만' % types_in(re.match(r'(.+?)\s*포켓몬만', s).group(1)))
        elif re.match(r'(.+?)\s*포켓몬은 참가할 수 없', s) and '타입' in s:
            parts.append('%s 타입 사용 불가' % types_in(re.match(r'(.+?)\s*포켓몬은', s).group(1)))
        elif '전설' in s and '참가할 수 없' in s:
            kinds = re.findall(r'(전설|환상|울트라비스트)', s)
            parts.append('%s 사용 불가' % '·'.join(dict.fromkeys(kinds)))
        elif '환상의 포켓몬은 참가할 수 없' in s:
            parts.append('환상 포켓몬 불가')
        elif '진화하지 않은' in s:
            parts.append('진화할 수 있는 진화 전 포켓몬만')
        elif '잡은 포켓몬만' in s:
            parts.append('이번 시즌에 잡은 포켓몬만')
        elif s.startswith('*'):
            continue
        else:
            parts.append(s.rstrip('.'))      # 모르는 문장은 그대로
    return ' · '.join(dict.fromkeys(parts))


# ---- 포맷 key ---------------------------------------------------------------
def format_names():
    """포맷 목록의 key → 한글 이름. 공지 표기와 같으면 seasons.js 에 key 만 적는다."""
    if not FORMAT_INDEX.exists():
        return {}
    src = FORMAT_INDEX.read_text(encoding='utf-8')
    return {f['key']: f['ko'] for f in json.loads(src[src.index('= [') + 2: src.rindex(']') + 1])}


def known_names():
    """한글 이름 → 포맷 key. 지난 시즌에 적은 {key, ko} 가 우선, 다음이 포맷 목록의 한글 이름."""
    names = {}
    for season in existing_seasons().values():
        for ko, key in season['aliases']:
            names.setdefault(norm_ko(ko), key)
    for key, ko in format_names().items():
        names.setdefault(norm_ko(ko), key)
    return names


def cp_of(en_name, rules, ko_name):
    m = re.search(r'(Great|Ultra|Master) League', en_name)
    if m:
        return LEAGUE_CP[m.group(1)]
    m = re.search(r'(슈퍼|하이퍼|마스터)리그', ko_name)
    if m:
        return {'슈퍼': 1500, '하이퍼': 2500, '마스터': 10000}[m.group(1)]
    m = re.search(r'([\d,]+)\s*CP 이하', ' '.join(rules or []))
    if m:
        return int(m.group(1).replace(',', ''))
    if 'Little' in en_name or '리틀' in ko_name:
        return 500
    return 1500


class KeyResolver:
    def __init__(self, offline):
        self.names = known_names()
        self.offline = offline
        self._cups = None

    def pvpoke_cups(self):
        if self._cups is None:
            try:
                gm = json.loads(fetch(PVPOKE + 'gamemaster.json'))
                self._cups = {norm_en(c.get('title') or c['name']): c['name'] for c in gm.get('cups', [])}
            except (urllib.error.URLError, ValueError):
                self._cups = {}
        return self._cups

    def has_ranking(self, cup, cp):
        try:
            req = urllib.request.Request(PVPOKE + 'rankings/%s/overall/rankings-%d.json' % (cup, cp),
                                         headers={'User-Agent': UA}, method='HEAD')
            urllib.request.urlopen(req, timeout=30).close()
            return True
        except urllib.error.URLError:
            return False

    def resolve(self, ko, en, cp):
        """(key, 확인 필요 사유 또는 None)"""
        key = self.names.get(norm_ko(ko))
        if key:
            return key, None
        title = re.sub(r':\s*(Great|Ultra|Master) League Edition$', '', en).strip()
        word = re.sub(r'\s*Cup$', '', title)
        mega = word.startswith('Mega ')
        base = norm_en(word[5:] if mega else word)
        if self.offline or not base:
            # 영문 이름이 없으면 PvPoke id 를 짐작할 수 없다. key 모양(<영문소문자>-<CP>)만 맞춘 임시 key
            tmp = (base + 'mega' if mega else base) if base else 'cup%d' % (zlib.crc32(norm_ko(ko).encode()) % 10000)
            return '%s-%d' % (tmp, cp), 'PvPoke 컵 id 를 찾지 못해 임시 key "%s" 를 붙였다 — seasons.js 의 key 를 고칠 것' % tmp
        cups = self.pvpoke_cups()
        for cand in [title, '%s Cup (Mega)' % word[5:] if mega else None]:
            if cand and norm_en(cand) in cups:
                return '%s-%d' % (cups[norm_en(cand)], cp), None      # PvPoke 컵 제목과 같다 — 확인할 것 없음
        guesses = [base + 'mega', 'mega' + base, base] if mega else [base]
        for g in guesses:
            if self.has_ranking(g, cp):
                return '%s-%d' % (g, cp), 'PvPoke 순위 파일이 있는 컵 id "%s" 로 정했다' % g
        return '%s-%d' % (guesses[0], cp), ('PvPoke 에 아직 없어서 "%s" 로 추정했다 — 올라온 id 가 다르면 '
                                           'seasons.js 의 key 를 고칠 것' % guesses[0])


# ---- seasons.js -------------------------------------------------------------
STR = r"'((?:[^'\\\n]|\\.)*)'"           # 작은따옴표 JS 문자열 (\' 같은 escape 포함)


def js(s):
    s = s.replace('\\', '\\\\').replace("'", "\\'").replace('\n', '\\n').replace('\r', '\\r')
    return "'%s'" % s.replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')


def unjs(s):
    def one(m):
        c = m.group(1)
        return chr(int(c[1:], 16)) if len(c) == 5 else {'n': '\n', 'r': '\r'}.get(c, c)
    return re.sub(r'\\(u[0-9a-fA-F]{4}|.)', one, s)


def post_slug(url):
    """공지 주소의 마지막 이름 — /ko/·/en/, 끝의 /, ?쿼리 와 무관하게 같은 공지를 가리킨다."""
    return re.sub(r'[?#].*$', '', url).rstrip('/').rsplit('/', 1)[-1]


def existing_seasons():
    """공지 slug(없으면 id) → {id, start, end, weeks:[(start, end, [key…])], aliases:[(ko, key)]}"""
    if not SEASONS.exists():
        return {}
    src = SEASONS.read_text(encoding='utf-8')
    out = {}
    for block in re.split(r"(?=^\s*id: ')", src, flags=re.M)[1:]:
        def field(k):
            m = re.search(r'^\s*%s: %s,' % (k, STR), block, re.M)
            return unjs(m.group(1)) if m else ''
        weeks = [(a, b, re.findall(r"(?:^|[\[,]\s*)(?:\{ key: )?'([a-z0-9]+(?:-\d+)?)'", f))
                 for a, b, f in re.findall(r"start: '([^']+)', end: '([^']+)', formats: \[(.*)\] \}", block)]
        aliases = [(unjs(ko), key) for key, ko in re.findall(r"\{ key: %s, ko: %s \}" % (STR, STR), block)]
        out[post_slug(field('source')) or field('id')] = {
            'id': field('id'), 'start': field('start'), 'end': field('end'), 'weeks': weeks, 'aliases': aliases}
    return out


def render_season(s):
    lines = ['{',
             '  id: %s,' % js(s['id']),
             '  ko: %s,' % js(s['ko']),
             '  en: %s,' % js(s['en']),
             '  start: %s,' % js(s['start']),
             '  end: %s,' % js(s['end']),
             '  source: %s,' % js(s['source']),
             '  verifiedAt: %s,' % js(s['verifiedAt']),
             '  // sync_season.py 가 공지에서 옮겨 적었다. 확인하고 다듬어도 다시 덮어쓰지 않는다',
             '  notes: [']
    lines += ['    %s,' % js(n) for n in s['notes']]
    lines += ['  ],', '  rules: {']
    lines += ['    %s: %s,' % (js(k), js(v)) for k, v in s['rules'].items()]
    lines += ['  },', '  weeks: [']
    for w in s['weeks']:
        if w.get('comment'):
            lines.append('    // %s' % re.sub(r'\s+', ' ', w['comment']))
        fs = ', '.join(js(f['key']) if f['plain'] else '{ key: %s, ko: %s }' % (js(f['key']), js(f['ko']))
                       for f in w['formats'])
        lines.append('    { start: %s, end: %s, formats: [%s] },' % (js(w['start']), js(w['end']), fs))
    lines += ['  ],', '}']
    return '\n'.join(lines)


def append_season(block):
    src = SEASONS.read_text(encoding='utf-8')
    i = src.rindex('];')
    head, tail = src[:i].rstrip(), src[i:]
    sep = ', ' if head.endswith('}') else ''
    SEASONS.write_text(head + sep + block + tail, encoding='utf-8')


# ---- 본체 -------------------------------------------------------------------
def build(ko_page, en_page, source, resolver):
    sched = parse_schedule(ko_page)
    if not sched:
        raise ValueError('일정표(<pg-gbl-schedule>)가 없다: %s' % source)
    en_sched = parse_schedule(en_page) if en_page else []
    if en_sched and [len(w[4]) for w in en_sched] != [len(w[4]) for w in sched]:
        en_sched = []                       # 한·영 공지 모양이 다르면 영문 이름은 쓰지 않는다
    all_names = [n for w in sched for n in w[4]]
    cups = parse_cups(ko_page, all_names)
    ko_name, en_name = season_names(ko_page, en_page)
    year = int(sched[0][0][:4])

    index_ko = format_names()
    notes, checks, rules, weeks, seen = [], [], {}, [], {}
    for i, (s_utc, e_utc, s_lab, e_lab, names) in enumerate(sched):
        start, why_s = week_dates(s_utc, s_lab, year)
        end, why_e = week_dates(e_utc, e_lab, year)
        comments = [x for x in (why_s, why_e) if x]
        fmts = []
        for j, ko in enumerate(names):
            en = en_sched[i][4][j] if en_sched else ''
            if norm_ko(ko) in seen:
                key = seen[norm_ko(ko)]
            else:
                cup = cups.get(norm_ko(ko), {})
                key, why = resolver.resolve(ko, en, cp_of(en, cup.get('lines'), ko))
                seen[norm_ko(ko)] = key
                if why:
                    checks.append('`%s` %s → `%s`: %s' % (ko, ('(%s)' % en) if en else '', key, why))
                    comments.append('%s → %s: %s' % (ko, key, why))
                if key not in BASE_KEYS and cup and key not in rules and not re.fullmatch(r'mega-\d+', key):
                    rules[key] = summarize_rules(cup)
            fmts.append({'key': key, 'ko': ko, 'plain': index_ko.get(key) == ko})
        weeks.append({'start': pacific_iso(start), 'end': pacific_iso(end), 'formats': fmts,
                      'comment': ' / '.join(comments)})
        checks += ['%s 주: %s' % (s_lab, c) for c in (why_s, why_e) if c]

    # 공지 일정표가 비거나 겹치는 주
    for a, b in zip(weeks, weeks[1:]):
        if b['start'] > a['end']:
            notes.append('공지 일정표는 %s–%s 가 비어 있습니다. 공지 그대로 적었습니다.'
                         % (kst_md(a['end']), kst_md(b['start'])))
        elif b['start'] < a['end']:
            notes.append('공지 일정표는 %s–%s 에 두 주가 겹칩니다. 공지 그대로 적었습니다.'
                         % (kst_md(b['start']), kst_md(a['end'])))
    if re.search(r'랭크가 초기화', ko_page):
        notes.insert(0, '시즌이 시작되면 GO배틀리그 랭크가 초기화됩니다.')
    if any(re.match(r'mega', f['key']) or '메가' in f['ko'] for w in weeks for f in w['formats']):
        notes.insert(1 if notes else 0, '메가 버전 리그·컵에서는 메가진화한 포켓몬을 쓸 수 있습니다.')

    slug = post_slug(source)
    return {
        'id': re.sub(r'^(go-)?(battle-league|gbl)-', '', slug) or slug,
        'ko': ko_name, 'en': en_name or ko_name,
        'start': min(w['start'] for w in weeks), 'end': max(w['end'] for w in weeks),
        'source': source, 'verifiedAt': datetime.date.today().isoformat(),
        'notes': notes, 'rules': rules, 'weeks': weeks,
    }, checks


def kst_md(iso):
    k = datetime.datetime.fromisoformat(iso).astimezone(datetime.timezone(datetime.timedelta(hours=9)))
    return '%d/%d' % (k.month, k.day)


def diff_weeks(old, new):
    """이미 있는 시즌과 공지를 주 단위로 비교한다."""
    o = [(a, b, tuple(k)) for a, b, k in old['weeks']]
    n = [(w['start'], w['end'], tuple(f['key'] for f in w['formats'])) for w in new['weeks']]
    if o == n:
        return []
    out = []
    for w in n:
        if w not in o:
            out.append('공지에만 있음: %s – %s %s' % (w[0], w[1], ', '.join(w[2])))
    for w in o:
        if w not in n:
            out.append('seasons.js 에만 있음: %s – %s %s' % (w[0], w[1], ', '.join(w[2])))
    return out


def find_posts():
    page = fetch(NEWS % 'ko')
    return list(dict.fromkeys(SLUG.findall(page)))


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser()
    ap.add_argument('--url', help='공지 주소 (없으면 공지 목록에서 GO배틀리그 공지를 찾는다)')
    ap.add_argument('--ko-html', help='받아 둔 한국어 공지 HTML (시험용)')
    ap.add_argument('--en-html', help='받아 둔 영어 공지 HTML (시험용)')
    ap.add_argument('--dry-run', action='store_true', help='seasons.js 를 고치지 않고 결과만 출력')
    ap.add_argument('--report', help='사람이 확인할 것을 적을 마크다운 파일')
    args = ap.parse_args()

    offline = bool(args.ko_html)
    resolver = KeyResolver(offline)
    have = existing_seasons()
    report = []

    if args.ko_html:
        ko = pathlib.Path(args.ko_html).read_text(encoding='utf-8')
        en = pathlib.Path(args.en_html).read_text(encoding='utf-8') if args.en_html else ''
        url = args.url or (re.search(r'https://pokemongo\.com/ko/news/[a-z0-9-]+', ko) or [None])[0] \
            or 'https://pokemongo.com/ko/news/unknown'
        posts = [(url, ko, en)]
    else:
        posts = []
        try:
            slugs = [post_slug(args.url)] if args.url else find_posts()
        except Exception as e:  # noqa: BLE001 — 사이트 장애로 순위 갱신까지 멈추지 않게
            slugs = []
            print('[경고] 공지 목록을 읽지 못했다 (%s: %s)' % (type(e).__name__, e))
            report.append('### 공지 목록을 읽지 못했다\n\n`%s` — 다음 실행에 다시 시도한다. '
                          '계속되면 pokemongo.com 공지 목록 모양을 확인할 것.' % type(e).__name__)
        print('GO배틀리그 공지 후보: %s' % (', '.join(slugs) or '없음'))
        for slug in slugs:
            try:
                ko = fetch(POST % ('ko', slug))
            except Exception as e:  # noqa: BLE001
                print('[경고] 공지를 읽지 못했다: %s (%s: %s)' % (slug, type(e).__name__, e))
                report.append('### 공지를 읽지 못했다: %s\n\n`%s` — 다음 실행에 다시 시도한다.' % (slug, type(e).__name__))
                continue
            if '<pg-gbl-schedule>' not in ko:
                continue                     # 일정표 없는 공지(시즌 중 소식 등)
            try:
                en = fetch(POST % ('en', slug))
            except Exception:  # noqa: BLE001 — 영어 공지는 없어도 된다(컵 id 추정만 약해진다)
                en = ''
            posts.append((POST % ('ko', slug), ko, en))

    added = 0
    for url, ko, en in posts:
        try:
            season, checks = build(ko, en, url, resolver)
        except Exception as e:  # noqa: BLE001 — 공지 모양이 바뀐 것. 다른 공지·순위 갱신은 계속한다
            print('[경고] 공지를 해석하지 못했다: %s (%s: %s)' % (url, type(e).__name__, e))
            report.append('### 공지를 해석하지 못했다: %s\n\n`%s: %s`\n\n공지 페이지 모양이 바뀌었을 수 있다. '
                          'sync_season.py 의 parse_schedule 을 확인할 것.' % (url, type(e).__name__, e))
            continue
        old = have.get(post_slug(url))
        if old:
            d = diff_weeks(old, season)
            print('%s — 이미 등록됨 (%s)%s' % (season['ko'], old['id'], '' if not d else ', 공지와 다른 주 %d개' % len(d)))
            for x in d:
                print('  ' + x)
            if d:
                report.append('### %s — 공지와 seasons.js 가 다르다\n\n공지: %s\n\n%s\n\n'
                              '공지가 바뀐 것이면 seasons.js 의 그 주를 고친다 (자동으로 덮어쓰지 않는다).'
                              % (season['ko'], url, '\n'.join('- ' + x for x in d)))
            continue
        clash = [s['id'] for s in have.values() if s['id'] == season['id'] or
                 (s['start'] and s['start'] < season['end'] and season['start'] < s['end'])]
        if clash:
            msg = '이미 있는 시즌 %s 와 기간이나 id 가 겹쳐서 더하지 않았다' % ', '.join(clash)
            print('%s — %s' % (season['ko'], msg))
            report.append('### %s — %s\n\n공지: %s\n\n같은 시즌이면 seasons.js 의 source 를 이 공지 주소로 바꾸고, '
                          '다른 시즌이면 두 일정을 확인할 것.' % (season['ko'], msg, url))
            continue
        block = render_season(season)
        print('%s — 새 시즌, %d주 (%s – %s)' % (season['ko'], len(season['weeks']), season['start'], season['end']))
        for c in checks:
            print('  [확인] ' + c)
        if args.dry_run:
            print(block)
        else:
            append_season(block)
            have[post_slug(url)] = {'id': season['id'], 'start': season['start'], 'end': season['end'],
                                    'weeks': [], 'aliases': []}
            added += 1
        report.append('### %s — 새 시즌을 seasons.js 에 더했다\n\n공지: %s\n\n%s'
                      % (season['ko'], url,
                         '\n'.join('- ' + c for c in checks) if checks else '추정한 값 없음. 화면만 한 번 확인할 것.'))

    if not posts:
        print('일정표가 있는 GO배틀리그 공지가 목록에 없다')
    if args.report and report:
        pathlib.Path(args.report).write_text('\n\n'.join(report) + '\n', encoding='utf-8')
    print('새로 더한 시즌 %d개' % added)
    return 0


if __name__ == '__main__':
    sys.exit(main())
