'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = { console };
context.window = context;
context.globalThis = context;
vm.createContext(context);
for (const file of ['data/formats/index.js', 'data/seasons.js', 'season.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}
const S = context.Season;
const keys = state => Array.from(state.live, e => e.key);   // vm 컨텍스트 배열 → 이 쪽 배열
const at = iso => S.at(Date.parse(iso));

/* 일정 데이터 모양 — 주는 시즌 안에 있고, 시작 < 끝, 포맷 key 는 <컵>-<CP> 또는 기본 리그 */
for (const season of S.list) {
  assert.ok(Date.parse(season.start) < Date.parse(season.end), season.id);
  for (const w of season.weeks) {
    assert.ok(Date.parse(w.start) < Date.parse(w.end), w.start);
    assert.ok(Date.parse(w.start) >= Date.parse(season.start) && Date.parse(w.end) <= Date.parse(season.end), w.start);
    for (const f of w.formats) {
      const e = S.entry(f);
      assert.match(e.key, /^(great|ultra|master|[a-z0-9]+-\d+)$/, e.key);
      assert.ok(e.ko && e.ko !== e.key, `한글 이름 없음: ${e.key}`);
    }
  }
}

/* 기본 리그와 메가 버전은 언제나 순위 데이터가 있어야 한다 */
for (const season of S.list)
  for (const w of season.weeks)
    for (const e of w.formats.map(S.entry))
      if (/^(great|ultra|master|mega-\d+)$/.test(e.key)) assert.equal(e.ready, true, e.key);

/* 교체 시각 경계 — 한국시간 10/14(수) 05:00 = 10/13 13:00 PDT */
assert.deepEqual(keys(at('2026-10-13T19:59:59Z')), ['mega-1500', 'mega-2500', 'mega-10000']);
assert.deepEqual(keys(at('2026-10-13T20:00:00Z')), ['great', 'mega-2500', 'little-500']);
assert.equal(S.kstDate('2026-10-13T13:00:00-07:00', true), '10/14(수) 05:00');
/* 서머타임이 끝난 뒤에는 한국시간 06:00 */
assert.equal(S.kstDate('2026-11-10T13:00:00-08:00', true), '11/11(수) 06:00');

/* 남은 날짜와 다음 주 */
{
  const now = Date.parse('2026-10-14T00:00:00Z');
  const state = S.at(now);
  assert.equal(S.daysLeft(state.endsAt, now), 6);
  assert.deepEqual(Array.from(state.next.formats, f => S.entry(f).key), ['ultra', 'mega-10000', 'fantasy-1500']);
  assert.equal(state.season.id, 'twilight-trails');
}

/* 공지 일정이 겹치는 11/24–25 는 두 주의 포맷을 합친다 (laic 는 한 번만) */
assert.deepEqual(keys(at('2026-11-25T00:00:00Z')), ['ultra', 'mega-10000', 'laic2027-1500', 'master', 'catch-1500']);
/* 비어 있는 11/17–18 은 열린 포맷이 없고 다음 주를 알려 준다 */
{
  const gap = at('2026-11-18T00:00:00Z');
  assert.deepEqual(keys(gap), []);
  assert.equal(gap.next.start, '2026-11-18T13:00:00-08:00');
}

/* 등록된 시즌이 다 끝나면 stale — 화면이 '다음 시즌 일정 미등록' 을 띄운다 */
/* 날짜는 마지막 시즌 끝 다음 날 — 새 시즌이 자동으로 더해져도 깨지지 않게 */
assert.equal(S.at(Math.max(...Array.from(S.list, s => Date.parse(s.end))) + 864e5).stale, true);
assert.equal(at('2026-12-02T00:00:00Z').stale, S.list.every(s => Date.parse(s.end) < Date.parse('2026-12-02T00:00:00Z')));
assert.equal(at('2026-10-14T00:00:00Z').stale, false);

console.log('season tests passed');
