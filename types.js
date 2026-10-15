'use strict';

/* ------------------------------------------------------------------
   상성·기술 — 고른 포켓몬(또는 타입)의 상성과, 포켓몬이면 기술표까지

   타입 상성

   data.js 의 TYPES.chart[공격타입][방어타입] = 배율.
   PvPoke DamageCalculator 의 타입별 약점/저항/무효 표에서 뽑았고,
   공식 GAME_MASTER 의 attackScalar 와 324칸 전부 대조해 검증했다.

   포켓몬 GO에는 '완전 무효'가 없다. 본편에서 ×0 인 조합도 여기서는
   ×0.390625 (이중 저항) 로 들어간다. 데미지가 줄 뿐 0은 아니다.

   기술표
   data/moves.js 의 MOVES[기술id] = [한글명, 타입, 위력, 턴(노말)/에너지(스페셜), 에너지획득(노말), 능력치변화?]
     능력치변화 = [대상(s 자신 / o 상대), 공격 단계, 방어 단계, 발동 확률]
   MOVESETS[포켓몬id] = [노말어택들, 스페셜어택들, 추천 노말, 추천 스페셜들, 대단한 기술 머신 필요, 이벤트 한정]
   (scripts/build_moves.py 가 PvPoke 에서 만든다)
   포켓몬 GO에는 물리/특수 구분이 없다. 기술은 타입·위력·에너지로만 정해진다.
------------------------------------------------------------------ */

const T = window.TYPES || { order: [], ko: {}, chart: {}, mult: {} };
const TKO = t => T.ko[t] || t;

function bucket(v) {
  if (v > 1.1) return { cls: 'super', mark: '●', label: '효과가 굉장하다', x: '×1.6' };
  if (v < 0.5) return { cls: 'double', mark: '✕', label: '효과가 별로다 (이중 저항)', x: '×0.39' };
  if (v < 0.9) return { cls: 'resist', mark: '▲', label: '효과가 별로다', x: '×0.625' };
  return { cls: 'neutral', mark: '', label: '보통', x: '×1' };
}

/* 방어/공격 타입 -> 최종 배율 */
const mult = (atk, defs) => defs.reduce((m, d) => m * ((T.chart[atk] && T.chart[atk][d] != null) ? T.chart[atk][d] : 1), 1);
const badge = (t, cls = '') => `<span class="tbadge ty ty-${t} ${cls}">${esc(TKO(t))}</span>`;
const fmt = m => String(Number(m.toFixed(Math.abs(m - 0.625) < 1e-6 ? 3 : 2)));

const defHost = document.getElementById('def-pick');
const picked = host => [...host.querySelectorAll('.on')].map(b => b.dataset.t);
const MOVES = window.MOVES || {};
const SETS = window.MOVESETS || {};
const f1 = n => String(Number(n.toFixed(2)));
let mon = null;
let basis = null;   // 노말어택 횟수 계산에 쓰는 노말어택 id

function buildPick(host) {
  host.innerHTML = T.order.map(t =>
    `<button type="button" class="ty ty-${t}" data-t="${t}" aria-pressed="false">${esc(TKO(t))}</button>`).join('');
  host.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const max = +host.dataset.multi;
    const on = [...host.querySelectorAll('.on')];
    if (b.classList.contains('on')) b.classList.remove('on');
    else { if (on.length >= max) on[0].classList.remove('on'); b.classList.add('on'); }
    host.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x.classList.contains('on'))));
    // 타입을 직접 만지면 포켓몬 선택은 풀린다
    if (host === defHost) { mon = null; document.querySelector('#src-mon .chosen').hidden = true; }
    render();
    if (host === defHost) syncUrl();
  });
}
function setPick(host, types) {
  host.querySelectorAll('button').forEach(b => {
    const on = types.includes(b.dataset.t);
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
}

/* 받는 피해: 이 타입(조합)이 어떤 기술에 약한가 */
function defCol(types) {
  const rows = T.order.map(a => ({ a, m: mult(a, types) }));
  const lv = f => rows.filter(r => f(r.m)).sort((x, y) => y.m - x.m);
  const g16 = lv(m => m > 2.5), g4 = lv(m => m > 1.1 && m < 2.5);
  const gr = lv(m => m < 0.9 && m >= 0.5), grr = lv(m => m < 0.5);
  const line = (cls, x, list) => `
    <div class="lvl ${cls}"><div class="lvl-x">${x}</div>
      <div class="tchips">${list.length ? list.map(r => badge(r.a, cls[0] === 'x' ? 'x4' : '')).join('') : '<span class="none">없음</span>'}</div></div>`;
  return `
    <div class="duo-col def" id="dmg-in">
      <h3>🛡 받는 피해 <span class="duo-sum"><b class="weak">약점 ${g16.length + g4.length}</b> · <b class="res">저항 ${gr.length + grr.length}</b></span></h3>
      ${g16.length ? line('x16', '×2.56', g16) : ''}
      ${line('x4', '×1.6', g4)}
      ${line('r', '×0.625', gr)}
      ${grr.length ? line('rr', '×0.39', grr) : ''}
    </div>`;
}

/* 주는 피해: 이 타입의 기술로 때리면 누가 약한가 (타입별) */
function atkCol(types) {
  const chips = l => l.length ? l.map(d => badge(d)).join('') : '<span class="none">없음</span>';
  const one = atk => {
    const rows = T.order.map(d => ({ d, m: T.chart[atk][d] }));
    const sup = rows.filter(r => r.m > 1.1).map(r => r.d);
    const res = rows.filter(r => r.m < 0.9 && r.m >= 0.5).map(r => r.d);
    const dbl = rows.filter(r => r.m < 0.5).map(r => r.d);
    return `
      <div class="atk-type">
        <div class="atk-type-head">${badge(atk)} 기술 <b class="weak">${sup.length}</b>종을 잘 잡음</div>
        <div class="lvl x4"><div class="lvl-x">×1.6</div><div class="tchips">${chips(sup)}</div></div>
        <div class="lvl r"><div class="lvl-x">×0.625</div><div class="tchips">${chips(res)}</div></div>
        ${dbl.length ? `<div class="lvl rr"><div class="lvl-x">×0.39</div><div class="tchips">${chips(dbl)}</div></div>` : ''}
      </div>`;
  };
  return `
    <div class="duo-col atk" id="dmg-out">
      <h3>⚔ 주는 피해 <small>이 타입 기술로 때릴 때</small></h3>
      ${types.map(one).join('')}
    </div>`;
}

function render() {
  const ts = picked(defHost);
  defHost.classList.toggle('has-sel', ts.length > 0);
  renderMoves();
  syncJump();
  const box = document.getElementById('out-def');
  if (!ts.length) { box.innerHTML = '<p class="placeholder">포켓몬을 검색하거나 타입을 1~2개 고르세요.</p>'; return; }
  box.innerHTML = `<div class="duo">${defCol(ts)}${atkCol(ts)}</div>`;
  syncJump();
}

/* 포켓몬을 골랐으면 ?p=, 타입을 직접 골랐으면 ?t=, 둘 다 없으면 주소를 비운다 */
function syncUrl() {
  const ts = picked(defHost);
  urlSet('p', mon ? mon.id : null);
  urlSet('t', !mon && ts.length ? ts.join(',') : null);
}

function paintMon(m) {
  mon = m; basis = null;
  const chosen = document.querySelector('#src-mon .chosen');
  chosen.hidden = !m;
  // 포켓몬을 골랐으면 타입 버튼은 접어 둔다
  document.getElementById('def-fold').open = !m;
  if (m) {
    chosen.querySelector('.chosen-img').src = 'images/' + encodeURIComponent(m.img);
    chosen.querySelector('.chosen-img').alt = `${m.ko} 이미지`;
    chosen.querySelector('.chosen-name').innerHTML = nameHtml(m);
    chosen.querySelector('.chosen-rank').textContent = `${rankText(m)} · ${m.types.map(TKO).join(' / ')}`;
    setPick(defHost, m.types);
  } else setPick(defHost, []);
  render();
}

/* ------------------------------------------------------------------
   기술표 (노말어택 / 스페셜어택) — 포켓몬을 골랐을 때만 나온다
------------------------------------------------------------------ */

/* 스페셜어택을 5번 쓸 때마다 노말어택을 몇 번 치는지 (남는 에너지는 이월, 최대 100) */
function tapCounts(gain, cost, times = 5) {
  const out = [];
  let energy = 0;
  for (let i = 0; i < times; i++) {
    let n = 0;
    while (energy < cost) { energy = Math.min(100, energy + gain); n++; }
    energy -= cost;
    out.push(n);
  }
  return out;
}

function buffText(buff) {
  if (!buff) return '';
  const [who, atk, def, chance] = buff;
  const parts = [];
  if (atk) parts.push(`공격 ${atk > 0 ? '+' : ''}${atk}`);
  if (def) parts.push(`방어 ${def > 0 ? '+' : ''}${def}`);
  const good = (who === 's') === (atk + def > 0);   // 자신 강화 또는 상대 약화
  const pct = chance < 1 ? ` (${Math.round(chance * 100)}%)` : '';
  return `<span class="mv-buff ${good ? 'up' : 'down'}">${who === 's' ? '자신' : '상대'} ${parts.join(' ')}${pct}</span>`;
}

/* 자속 / 추천 / 대단한 기술 머신 / 이벤트 한정 태그 */
function tags(id, type, rec) {
  const [, , , , elite, legacy] = SETS[mon.id];
  return (mon.types.includes(type) ? '<em class="mv-tag stab">자속</em>' : '') +
    (rec ? '<em class="mv-tag rec">추천</em>' : '') +
    (elite.includes(id) ? '<em class="mv-tag elite" title="대단한 기술머신이 있어야 배울 수 있는 기술">대단한 기술머신</em>' : '') +
    (legacy.includes(id) ? '<em class="mv-tag legacy" title="이벤트로만 얻을 수 있었던 기술">이벤트</em>' : '');
}

function normalList(ids, recId) {
  return ids.map(id => {
    const [name, type, power, turns, gain] = MOVES[id];
    return `<li class="mv-item ${id === basis ? 'on' : ''}" data-id="${id}" tabindex="0" role="button" aria-pressed="${id === basis}">
      <i class="mv-dot ty ty-${type}" title="${esc(TKO(type))}"></i>
      <span class="mv-name">${esc(name)}${tags(id, type, id === recId)}</span>
      <span class="mv-stats"><b>${power}</b><small>위력</small><b>${turns}</b><small>턴</small><b class="gain">+${gain}</b><small>에너지</small></span>
    </li>`;
  }).join('');
}

function specialList(ids, recIds) {
  const g = basis ? MOVES[basis][4] : 0;
  return ids.map(id => {
    const [name, type, power, energy, , buff] = MOVES[id];
    const taps = g ? tapCounts(g, energy).join('-') : '';
    return `<li class="mv-item">
      <i class="mv-dot ty ty-${type}" title="${esc(TKO(type))}"></i>
      <span class="mv-name">${esc(name)}${tags(id, type, recIds.includes(id))}</span>
      <span class="mv-stats"><b>${power}</b><small>위력</small><b class="cost">${energy}</b><small>에너지</small><b>${f1(power / energy)}</b><small>DPE</small></span>
      ${taps || buff ? `<span class="mv-sub">${taps ? `노말어택 ${taps}회` : ''}${buffText(buff)}</span>` : ''}
    </li>`;
  }).join('');
}

/* 타입만 직접 골랐으면 기술표는 숨긴다 */
function renderMoves() {
  const box = document.getElementById('mv-result');
  box.hidden = !mon;
  if (!mon) { box.innerHTML = ''; return; }
  const set = SETS[mon.id];
  if (!set) { box.innerHTML = '<p class="placeholder">이 포켓몬의 기술 정보가 없습니다.</p>'; return; }
  const [fast, charged, recFast, recCharged, elite] = set;
  const eff = id => MOVES[id][2] / MOVES[id][3];
  if (!basis || !fast.includes(basis)) basis = recFast || fast[0];

  // 추천을 맨 위로, 나머지는 효율(위력÷턴 또는 위력÷에너지) 높은 순
  const fs = fast.slice().sort((a, b) => (b === recFast) - (a === recFast) || eff(b) - eff(a));
  const cs = charged.slice().sort((a, b) => recCharged.includes(b) - recCharged.includes(a) || eff(b) - eff(a));
  const eliteNote = elite.length
    ? `<p class="mv-foot"><em class="mv-tag elite">대단한 기술머신</em> ${elite.map(id => esc(MOVES[id][0])).join(', ')} — 대단한 기술머신이 있어야 배울 수 있습니다</p>` : '';

  box.innerHTML = `
    <div class="mv-col">
      <h3>노말어택 <small>${fast.length}</small></h3>
      <ul class="mv-list" id="mv-normal">${normalList(fs, recFast)}</ul>
      <p class="mv-hint">누르면 그 노말어택 기준으로 오른쪽 횟수가 바뀝니다</p>
    </div>
    <div class="mv-col">
      <h3>스페셜어택 <small>${charged.length}</small></h3>
      <ul class="mv-list">${specialList(cs, recCharged)}</ul>
    </div>
    ${eliteNote}`;
}

const mvBox = document.getElementById('mv-result');
function pickBasis(e) {
  const li = e.target.closest('#mv-normal .mv-item'); if (!li) return false;
  basis = li.dataset.id; renderMoves(); return true;
}
mvBox.addEventListener('click', pickBasis);
mvBox.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && pickBasis(e)) e.preventDefault();
});

/* ------------------------------------------------------------------
   18 x 18 상성표
------------------------------------------------------------------ */

function buildChart() {
  const host = document.getElementById('type-table');
  const types = T.order;
  const mark = { super: '●', resist: '▲', double: '✕', neutral: '' };
  let cellIndex = 0;

  let html = '<thead><tr><th class="corner">방어↓ 공격→</th>' +
    types.map(a => `<th class="ty ty-${a}" data-atk="${a}">${esc(TKO(a))}</th>`).join('') + '</tr></thead><tbody>';
  for (const d of types) {
    html += `<tr><th class="ty ty-${d}" data-def="${d}">${esc(TKO(d))}</th>`;
    for (const a of types) {
      const b = bucket(T.chart[a][d]);
      html += `<td class="${b.cls}" data-atk="${a}" data-def="${d}" role="button" tabindex="${cellIndex++ === 0 ? '0' : '-1'}" aria-label="${esc(TKO(a))} 기술이 ${esc(TKO(d))} 타입을 공격: ${b.label} ${b.x}">${mark[b.cls]}</td>`;
    }
    html += '</tr>';
  }
  // 맨 아래: 이 타입 기술이 약점을 찌르는 타입 수
  html += '</tbody><tfoot><tr><td class="lbl">잡는 수</td>' +
    types.map(a => `<td>${types.filter(d => T.chart[a][d] > 1.1).length}</td>`).join('') + '</tr></tfoot>';
  host.innerHTML = html;

  // 칸을 누르면 같은 행·열을 강조하고 설명을 보여준다 (폰에는 hover가 없다)
  function selectCell(td) {
    host.querySelectorAll('td[data-atk]').forEach(cell => { cell.tabIndex = cell === td ? 0 : -1; });
    host.querySelectorAll('.sel,.hl').forEach(el => el.classList.remove('sel', 'hl'));
    td.classList.add('sel');
    const { atk, def } = td.dataset;
    host.querySelectorAll(`[data-atk="${atk}"],[data-def="${def}"]`).forEach(el => el.classList.add('hl'));
    const b = bucket(T.chart[atk][def]);
    document.getElementById('cell-detail').innerHTML =
      `${badge(atk)} 기술 → ${badge(def)} 타입 &nbsp;<b>${b.label}</b> ${b.x}`;
  }
  host.addEventListener('click', e => {
    const td = e.target.closest('td[data-atk]'); if (!td) return;
    selectCell(td);
  });
  host.addEventListener('keydown', e => {
    const td = e.target.closest('td[data-atk]'); if (!td) return;
    if (['Enter', ' '].includes(e.key)) {
      e.preventDefault();
      selectCell(td);
      return;
    }
    const move = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key];
    if (!move) return;
    e.preventDefault();
    const row = types.indexOf(td.dataset.def);
    const col = types.indexOf(td.dataset.atk);
    const nextRow = Math.max(0, Math.min(types.length - 1, row + move[0]));
    const nextCol = Math.max(0, Math.min(types.length - 1, col + move[1]));
    const next = host.querySelector(`td[data-def="${types[nextRow]}"][data-atk="${types[nextCol]}"]`);
    selectCell(next);
    next.focus();
  });
}

/* ------------------------------------------------------------------
   페이지 안 바로가기 — 위에 붙어 있고, 지금 보고 있는 칸에 불이 들어온다
------------------------------------------------------------------ */

const jump = document.getElementById('jump');
const jumpLinks = [...jump.querySelectorAll('a')];
const jumpTarget = a => document.getElementById(a.hash.slice(1));
let jumpClicked = null;   // 나란히 놓인 칸(받는·주는 피해)은 위치가 같아서 누른 쪽을 고른다

/* 아직 없는 칸(포켓몬을 안 골랐을 때의 기술표 등)은 링크도 숨긴다 */
function syncJump() {
  jumpLinks.forEach(a => { const t = jumpTarget(a); a.hidden = !t || t.closest('[hidden]') !== null; });
  spyJump();
}

/* 바로가기 바 밑까지 올라온 칸 중 가장 아래 것. 맨 아래까지 내렸으면 마지막 칸 */
function spyJump() {
  const shown = jumpLinks.filter(a => !a.hidden);
  const line = jump.getBoundingClientRect().bottom + 24;
  const tops = shown.map(a => jumpTarget(a).getBoundingClientRect().top);
  let cur = null;
  if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) cur = shown[shown.length - 1];
  else {
    const passed = shown.filter((a, i) => tops[i] <= line);
    if (passed.length) {
      const top = Math.max(...passed.map(a => tops[shown.indexOf(a)]));
      const same = passed.filter(a => Math.abs(tops[shown.indexOf(a)] - top) < 2);
      cur = same.includes(jumpClicked) ? jumpClicked : same[0];
    }
  }
  jumpLinks.forEach(a => { if (a === cur) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
}

/* 폰에서는 상단 바가 붙어 있으니 그 밑에 붙인다 */
function placeJump() {
  const bar = document.querySelector('.sidebar');
  const top = getComputedStyle(bar).position === 'sticky' && innerWidth <= 860 ? bar.getBoundingClientRect().height : 0;
  document.documentElement.style.setProperty('--jump-top', top + 'px');
  document.documentElement.style.setProperty('--jump-h', jump.offsetHeight + 'px');
}

jump.addEventListener('click', e => {
  const a = e.target.closest('a'); if (!a) return;
  const t = jumpTarget(a); if (!t) return;
  e.preventDefault();
  jumpClicked = a;
  if (t.tagName === 'DETAILS') t.open = true;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  t.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
  spyJump();   // 이미 그 자리면 스크롤이 안 일어난다
});

let spyQueued = false;
addEventListener('scroll', () => {
  if (spyQueued) return;
  spyQueued = true;
  requestAnimationFrame(() => { spyQueued = false; spyJump(); });
}, { passive: true });
placeJump();
addEventListener('resize', placeJump);
// 리그·컵 선택기가 나중에 상단 바로 옮겨 오면 바 높이가 바뀐다
if ('ResizeObserver' in window) new ResizeObserver(placeJump).observe(document.querySelector('.sidebar'));

/* ------------------------------------------------------------------ */

buildPick(defHost);
buildChart();
setupSearch(document.getElementById('src-mon'), m => { paintMon(m); syncUrl(); });
document.querySelector('#src-mon .clear').addEventListener('click', () => { paintMon(null); syncUrl(); });

const urlTypes = (urlGet('t') || '').split(',').filter(t => T.order.includes(t)).slice(0, 2);
if (!monFromUrl('p') && urlTypes.length) { document.getElementById('def-fold').open = true; setPick(defHost, urlTypes); render(); }
else paintMon(monFromUrl('p') || byRank(1));
