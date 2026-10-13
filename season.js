'use strict';

/* 시즌 일정 판정 — data/seasons.js 의 SEASONS 를 읽어 '지금 열린 리그·컵' 을 계산한다.
   화면 없이 계산만 한다 (사이드바 배지·시즌 페이지·포맷 기본값이 같이 쓴다). */
(function (root) {
  const SEASONS = (root.SEASONS || []).slice().sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const t = s => Date.parse(s);
  const DAY = 24 * 60 * 60 * 1000;

  /* 일정의 포맷 한 칸 → {key, ko, ready}. ready = 순위 데이터가 있어 바로 열 수 있음 */
  function entry(f) {
    const key = typeof f === 'string' ? f : f.key;
    const meta = (root.FORMATS || []).find(x => x.key === key);
    return { key, ko: (typeof f === 'object' && f.ko) || (meta && meta.ko) || key, ready: !!meta };
  }

  function uniq(entries) {
    const seen = new Set();
    return entries.filter(e => !seen.has(e.key) && seen.add(e.key));
  }

  /* now 시점의 상태.
     season   지금 시즌 (없으면 null)
     current  지금 열린 주 — 공지 일정이 겹치면 둘 이상일 수 있다
     live     지금 열린 포맷 (겹친 주를 합치고 중복 제거)
     next     다음에 시작하는 주 (이번 시즌 안에서)
     nextSeason 아직 시작 안 한 다음 시즌
     stale    등록된 시즌이 전부 끝났다 — 다음 시즌 일정을 적어야 한다 */
  function at(now = Date.now()) {
    const season = SEASONS.find(s => t(s.start) <= now && now < t(s.end)) || null;
    const weeks = season ? season.weeks : [];
    const current = weeks.filter(w => t(w.start) <= now && now < t(w.end));
    const next = weeks.filter(w => t(w.start) > now).sort((a, b) => t(a.start) - t(b.start))[0] || null;
    const nextSeason = SEASONS.find(s => t(s.start) > now) || null;
    return {
      season,
      current,
      live: uniq(current.flatMap(w => w.formats.map(entry))),
      endsAt: current.length ? Math.min(...current.map(w => t(w.end))) : null,
      next,
      nextSeason,
      stale: !season && !nextSeason,
    };
  }

  /* 남은 날짜 — 끝나는 날 당일이면 0 ('D-day') */
  function daysLeft(until, now = Date.now()) {
    return Math.max(0, Math.floor((until - now) / DAY));
  }

  function weekState(w, now = Date.now()) {
    if (now >= t(w.end)) return 'past';
    if (now >= t(w.start)) return 'now';
    return 'later';
  }

  /* 한국 시간 날짜 표기 '10/13(화)' — 기기 시간대와 상관없이 KST 로 보여 준다 */
  function kstDate(iso, withTime) {
    const d = new Date(t(iso) + 9 * 60 * 60 * 1000);
    const day = '일월화수목금토'[d.getUTCDay()];
    const hm = withTime ? ` ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}` : '';
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${day})${hm}`;
  }

  root.Season = { list: SEASONS, at, entry, daysLeft, weekState, kstDate };
})(typeof window !== 'undefined' ? window : globalThis);
