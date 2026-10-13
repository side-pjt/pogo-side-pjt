'use strict';

/* 포맷(리그·컵) — 지금 보고 있는 포맷을 정하고 그 포맷 데이터를 읽는다.
   정하는 순서: 주소 ?f= → 예전 주소 ?league= → localStorage → 슈퍼리그.
   data/formats/index.js 다음, common.js 앞에 둔다. 포맷 파일을 document.write 로 넣어야
   common.js 보다 먼저 실행되고 file:// 로 열어도 동작한다 (fetch 를 쓸 수 없다).
   포맷을 바꾸면 페이지를 다시 연다 — 순위·개체값 계산이 전부 포맷에 묶여 있어서다. */
(function (root) {
  const KEY = 'pogo-format';
  const DEFAULT = 'great';
  const LIST = root.FORMATS || [];
  const byKey = key => LIST.find(f => f.key === key) || null;

  function param(name) {
    try { return new URLSearchParams(location.search).get(name); } catch (e) { return null; }
  }
  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function save(key) {
    try { localStorage.setItem(KEY, key); } catch (e) { /* 사생활 보호 모드 등 */ }
  }

  /* 시즌 일정(season.js) — 있으면 처음 오는 사람에게 이번 주 열린 포맷을 먼저 보여 준다 */
  const season = root.Season ? root.Season.at() : null;
  const liveReady = season ? season.live.filter(e => e.ready).map(e => e.key) : [];

  const asked = param('f') || param('league');
  const current = byKey(asked) || byKey(stored()) || byKey(liveReady[0]) || byKey(DEFAULT) || LIST[0] ||
    { key: DEFAULT, cup: 'all', cp: 1500, title: 'Great League', ko: '슈퍼리그' };
  /* 주소로 연 포맷은 다음 방문에도 이어지게 남긴다. 없어진 포맷이면 알림을 띄운다 */
  if (asked && byKey(asked)) save(current.key);
  const missing = asked && !byKey(asked) ? asked : null;

  const isLeague = f => f.cup === 'all';
  const isMega = f => f.cup === 'mega';
  const capText = f => f.cp >= 10000 ? '무제한' : `CP ${f.cp}`;
  /* 선택기 칸이 좁아서 컵은 이름만 (이름에 리그가 들어 있다) */
  const label = f => isLeague(f) ? `${f.ko} · ${capText(f)}` : f.ko;

  if (document.readyState === 'loading')
    document.write(`<script src="data/formats/${encodeURIComponent(current.key)}.js"><\/script>`);

  /* 포맷을 바꿔도 남길 주소 값 — 타입 상성의 고른 타입(t), 팀 조합의 대회 룰(six).
     고른 포켓몬·기술·개체값은 버린다. 배틀·팀 페이지는 기본으로 띄운 포켓몬도 주소에 적어서,
     남겨 두면 이전 포맷의 포켓몬이 새 포맷에서 고른 것처럼 뜬다 */
  const KEEP = ['t', 'six'];

  /* 다른 포맷으로 다시 연다. 포켓몬은 새 포맷의 기본(1·2위)으로 시작한다 */
  function go(key) {
    if (!byKey(key)) return;
    save(key);
    const old = new URLSearchParams(location.search);
    const q = new URLSearchParams();
    KEEP.forEach(k => { if (old.has(k)) q.set(k, old.get(k)); });
    if (key === DEFAULT) q.delete('f'); else q.set('f', key);
    const s = q.toString();
    location.href = location.pathname + (s ? '?' + s : '') + location.hash;
  }

  /* 지금 열린 포맷 → 다음 주 → 나머지 리그 → 메가 버전 → 컵 */
  function options() {
    const nextReady = season && season.next
      ? season.next.formats.map(root.Season.entry).filter(e => e.ready && !liveReady.includes(e.key)).map(e => e.key)
      : [];
    const used = new Set(liveReady.concat(nextReady));
    const rest = LIST.filter(f => !used.has(f.key));
    const groups = [
      ['지금 열림', liveReady.map(byKey)],
      ['다음 주', nextReady.map(byKey)],
      ['리그', rest.filter(isLeague)],
      ['메가 버전', rest.filter(isMega)],
      ['컵', rest.filter(f => !isLeague(f) && !isMega(f))],
    ];
    return groups.filter(([, fs]) => fs.length).map(([group, fs]) =>
      `<optgroup label="${group}">${fs.map(f =>
        `<option value="${f.key}"${f.key === current.key ? ' selected' : ''}>${label(f)}</option>`).join('')}</optgroup>`).join('');
  }

  /* 사이드바 '지금 열린 리그' — 누르면 그 포맷으로 바뀐다. 순위가 아직 없는 컵은 누를 수 없다 */
  function seasonBadge() {
    if (!season) return null;
    const S = root.Season;
    const el = document.createElement('div');
    el.className = 'season-now';
    const link = '<a href="season.html">시즌 일정</a>';
    if (season.stale) {
      el.innerHTML = `<p>다음 시즌 일정이 아직 등록되지 않았습니다. ${link}</p>`;
      return el;
    }
    if (!season.live.length) {
      const w = season.next || (season.nextSeason && season.nextSeason.weeks[0]);
      el.innerHTML = `<p>${w ? `다음 일정 ${S.kstDate(w.start, true)} 시작` : '이번 주 일정이 없습니다'} · ${link}</p>`;
      return el;
    }
    const left = S.daysLeft(season.endsAt);
    el.innerHTML = `
      <p class="season-now-title"><b>지금 열린 리그</b><span>${left ? `D-${left}` : 'D-day'}</span>${link}</p>
      <div class="season-now-chips">${season.live.map(e => e.ready
        ? `<button type="button" data-key="${e.key}"${e.key === current.key ? ' aria-pressed="true"' : ''}>${e.ko}</button>`
        : `<span title="PvPoke 순위가 아직 없습니다">${e.ko} · 순위 준비 중</span>`).join('')}</div>`;
    el.addEventListener('click', e => {
      const b = e.target.closest('button[data-key]');
      if (b) go(b.dataset.key);
    });
    return el;
  }

  /* 선택기·열린 리그·알림을 한 묶음(.format-bar)으로 만들어 넓은 화면에서는 머리글 오른쪽 위,
     좁은 화면에서는 사이드바(상단 고정 바) 안에 한 줄로 둔다 */
  const WIDE = '(min-width: 861px)';

  function placeBar(bar, sidebar) {
    const head = document.querySelector('.top .wrap');
    const wide = head && root.matchMedia && root.matchMedia(WIDE).matches;
    if (wide) { if (bar.parentNode !== head) head.appendChild(bar); return; }
    const nav = sidebar.querySelector('.nav');
    if (bar.parentNode !== sidebar || bar.previousSibling !== nav)
      sidebar.insertBefore(bar, nav ? nav.nextSibling : sidebar.firstChild);
  }

  function buildPicker() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar || document.querySelector('.format-bar')) return;
    const bar = document.createElement('div');
    bar.className = 'format-bar';
    const box = document.createElement('label');
    box.className = 'format-pick';
    box.innerHTML = `<span>리그·컵</span><select aria-label="리그·컵 고르기">${options()}</select>`;
    bar.appendChild(box);
    box.querySelector('select').addEventListener('change', e => go(e.target.value));

    const note = sidebar.querySelector('.side-note');
    if (note && note.firstChild && note.firstChild.nodeType === 3)
      note.firstChild.nodeValue = `${capText(current)} · ${current.ko}`;
    /* 페이지 본문에서 포맷 이름·CP 를 그대로 받아 쓰는 자리 */
    document.querySelectorAll('[data-format="name"]').forEach(el => { el.textContent = current.ko; });
    document.querySelectorAll('[data-format="cap"]').forEach(el => { el.textContent = capText(current); });

    const now = seasonBadge();
    if (now) bar.appendChild(now);

    if (missing) {
      const warn = document.createElement('p');
      warn.className = 'format-warn';
      warn.setAttribute('role', 'status');
      warn.textContent = `'${missing}' 포맷은 지금 데이터에 없어 ${current.ko}로 열었습니다.`;
      box.after(warn);
    }

    placeBar(bar, sidebar);
    if (root.matchMedia) {
      const mq = root.matchMedia(WIDE);
      const move = () => placeBar(bar, sidebar);
      if (mq.addEventListener) mq.addEventListener('change', move); else if (mq.addListener) mq.addListener(move);
    }
  }

  root.Format = {
    list: LIST,
    current,
    key: current.key,
    cap: current.cp,
    name: current.ko,
    capText: capText(current),
    isMaster: current.cp >= 10000,
    isLeague: isLeague(current),
    byKey,
    capTextOf: capText,
    go,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildPicker);
  else buildPicker();
})(window);
