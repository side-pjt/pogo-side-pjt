'use strict';

/* ------------------------------------------------------------------
   타입 상성

   data.js 의 TYPES.chart[공격타입][방어타입] = 배율.
   PvPoke DamageCalculator 의 타입별 약점/저항/무효 표에서 뽑았고,
   공식 GAME_MASTER 의 attackScalar 와 324칸 전부 대조해 검증했다.

   포켓몬 GO에는 '완전 무효'가 없다. 본편에서 ×0 인 조합도 여기서는
   ×0.390625 (이중 저항) 로 들어간다. 데미지가 줄 뿐 0은 아니다.
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
let mon = null;

function buildPick(host) {
  host.innerHTML = T.order.map(t =>
    `<button type="button" class="ty ty-${t}" data-t="${t}">${esc(TKO(t))}</button>`).join('');
  host.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const max = +host.dataset.multi;
    const on = [...host.querySelectorAll('.on')];
    if (b.classList.contains('on')) b.classList.remove('on');
    else { if (on.length >= max) on[0].classList.remove('on'); b.classList.add('on'); }
    // 타입을 직접 만지면 포켓몬 선택은 풀린다
    if (host === defHost) { mon = null; document.querySelector('#src-mon .chosen').hidden = true; }
    render();
  });
}
function setPick(host, types) {
  host.querySelectorAll('button').forEach(b => b.classList.toggle('on', types.includes(b.dataset.t)));
}

/* 받는 피해: 이 타입(조합)이 어떤 기술에 약한가 */
function defCol(types) {
  const rows = T.order.map(a => ({ a, m: mult(a, types) }));
  const lv = f => rows.filter(r => f(r.m)).sort((x, y) => y.m - x.m);
  const g16 = lv(m => m > 2.5), g4 = lv(m => m > 1.1 && m < 2.5);
  const gr = lv(m => m < 0.9 && m >= 0.5), grr = lv(m => m < 0.5);
  const line = (cls, x, list, tip) => `
    <div class="lvl ${cls}"><div class="lvl-x">${x}</div>
      <div class="tchips">${list.length ? list.map(r => badge(r.a, cls[0] === 'x' ? 'x4' : '')).join('') : '<span class="none">없음</span>'}</div>
      ${tip ? `<div class="lvl-tip">${tip}</div>` : ''}</div>`;
  return `
    <div class="duo-col def">
      <h3>🛡 받는 피해 <small>상대 기술 기준</small></h3>
      <p class="duo-sum"><b class="weak">약점 ${g16.length + g4.length}</b> · <b class="res">저항 ${gr.length + grr.length}</b></p>
      ${g16.length ? line('x16', '×2.56', g16, '약점이 겹침 — 가장 위험') : ''}
      ${line('x4', '×1.6', g4, '')}
      ${line('r', '×0.625', gr, '')}
      ${line('rr', '×0.39', grr, '거의 안 아픔')}
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
    <div class="duo-col atk">
      <h3>⚔ 주는 피해 <small>이 타입 기술로 때릴 때</small></h3>
      ${types.map(one).join('')}
    </div>`;
}

/* 고른 타입을 위에 크게 보여주고, 하나씩 또는 전체 해제 */
function renderSel(ts) {
  const bar = document.getElementById('def-sel');
  bar.hidden = !ts.length;
  bar.innerHTML = ts.length
    ? `<span class="selbar-label">선택됨</span>` +
      ts.map(t => `<button type="button" class="selchip ty ty-${t}" data-t="${t}" aria-label="${esc(TKO(t))} 해제">${esc(TKO(t))} <i>✕</i></button>`).join('') +
      `<button type="button" class="selclear">모두 지우기</button>`
    : '';
}
document.getElementById('def-sel').addEventListener('click', e => {
  if (e.target.closest('.selclear')) return paintMon(null);
  const c = e.target.closest('.selchip'); if (!c) return;
  const rest = picked(defHost).filter(t => t !== c.dataset.t);
  mon = null; document.querySelector('#src-mon .chosen').hidden = true;
  setPick(defHost, rest); render();
});

function render() {
  const ts = picked(defHost);
  renderSel(ts);
  defHost.classList.toggle('has-sel', ts.length > 0);
  const box = document.getElementById('out-def');
  if (!ts.length) { box.innerHTML = '<p class="placeholder">포켓몬을 검색하거나 타입을 1~2개 고르세요.</p>'; return; }
  box.innerHTML = `
    <div class="matchup"><div>${mon ? `<b>${esc(mon.ko)}</b> · ` : ''}${ts.map(t => badge(t)).join(' ')} — 왼쪽은 맞을 때, 오른쪽은 때릴 때입니다.</div></div>
    <div class="duo">${defCol(ts)}${atkCol(ts)}</div>`;
}

function paintMon(m) {
  mon = m;
  const chosen = document.querySelector('#src-mon .chosen');
  chosen.hidden = !m;
  if (m) {
    chosen.querySelector('.chosen-img').src = 'images/' + encodeURIComponent(m.img);
    chosen.querySelector('.chosen-name').textContent = m.ko;
    chosen.querySelector('.chosen-rank').textContent = `${rankText(m)} · ${m.types.map(TKO).join(' / ')}`;
    setPick(defHost, m.types);
  } else setPick(defHost, []);
  render();
}

/* ------------------------------------------------------------------
   18 x 18 상성표
------------------------------------------------------------------ */

function buildChart() {
  const host = document.getElementById('type-table');
  const types = T.order;
  const mark = { super: '●', resist: '▲', double: '✕', neutral: '' };

  let html = '<thead><tr><th class="corner">방어↓ 공격→</th>' +
    types.map(a => `<th class="ty ty-${a}" data-atk="${a}">${esc(TKO(a))}</th>`).join('') + '</tr></thead><tbody>';
  for (const d of types) {
    html += `<tr><th class="ty ty-${d}" data-def="${d}">${esc(TKO(d))}</th>`;
    for (const a of types) {
      const b = bucket(T.chart[a][d]);
      html += `<td class="${b.cls}" data-atk="${a}" data-def="${d}">${mark[b.cls]}</td>`;
    }
    html += '</tr>';
  }
  // 맨 아래: 이 타입 기술이 약점을 찌르는 타입 수
  html += '</tbody><tfoot><tr><td class="lbl">잡는 수</td>' +
    types.map(a => `<td>${types.filter(d => T.chart[a][d] > 1.1).length}</td>`).join('') + '</tr></tfoot>';
  host.innerHTML = html;

  // 칸을 누르면 같은 행·열을 강조하고 설명을 보여준다 (폰에는 hover가 없다)
  host.addEventListener('click', e => {
    const td = e.target.closest('td[data-atk]'); if (!td) return;
    host.querySelectorAll('.sel,.hl').forEach(el => el.classList.remove('sel', 'hl'));
    td.classList.add('sel');
    const { atk, def } = td.dataset;
    host.querySelectorAll(`[data-atk="${atk}"],[data-def="${def}"]`).forEach(el => el.classList.add('hl'));
    const b = bucket(T.chart[atk][def]);
    document.getElementById('cell-detail').innerHTML =
      `${badge(atk)} 기술 → ${badge(def)} 타입 &nbsp;<b>${b.label}</b> ${b.x}`;
  });
}

/* ------------------------------------------------------------------ */

buildPick(defHost);
buildChart();
setupSearch(document.getElementById('src-mon'), paintMon);
document.querySelector('#src-mon .clear').addEventListener('click', () => paintMon(null));
paintMon(byRank(1));
