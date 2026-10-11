'use strict';

/* ------------------------------------------------------------------
   팀 조합 유형 — ABB / ABA / ABC / XAB

   A, B, C는 타입 이름이 아니라 '역할과 약점 구조'를 구분하는 기호다.
   같은 글자 = 비슷한 역할이거나 비슷한 약점을 가진 포켓몬.

   예시 포켓몬은 설명용이다. 메타는 계속 바뀌므로 순위는 현재 데이터 기준으로
   그때그때 다시 찍는다 (아래 byId 가 data.js 를 참조한다).
------------------------------------------------------------------ */

const ROLE = {
  A: { name: '공격형', note: '압박 · 딜 담당' },
  B: { name: '보완형', note: '약점 커버 · 전환' },
  C: { name: '특수형', note: '특정 역할 · 테크' },
  X: { name: '유동형', note: '상황 대응' },
};

const SLOT_NAMES = ['선봉', '중견', '마무리'];

/* stab / press / diff 는 각 유형의 장점·주의 설명을 바탕으로 한 참고용 평가(1~3). */
const ARCHETYPES = [
  {
    code: 'ABB',
    slots: ['A', 'B', 'B'],
    headline: '뒤 두 마리가 비슷한 역할',
    how: 'B의 카운터를 먼저 유도해서 빼낸 뒤, 남은 B로 마무리한다.',
    members: ['stunfisk_galarian', 'ninetales_alolan', 'clefable'],
    pro: '운영이 강력하고 압박감이 크다',
    con: '공통 카운터를 못 처리하면 힘들다',
    stab: 2, press: 3, diff: 2, who: '운영으로 압박하고 싶은 분',
  },
  {
    code: 'ABA',
    slots: ['A', 'B', 'A'],
    headline: '앞과 뒤가 비슷한 역할',
    how: '리드 A로 압박하고, 가운데 B로 약점을 보완한 뒤, 마지막 A로 다시 압박한다.',
    members: ['altaria', 'lanturn', 'noctowl'],
    pro: '특정 매치업을 반복해서 압박할 수 있다',
    con: 'A의 공통 약점이 드러나면 흔들린다',
    stab: 2, press: 3, diff: 1, who: '같은 매치업을 반복해서 압박하고 싶은 분',
  },
  {
    code: 'ABC',
    slots: ['A', 'B', 'C'],
    headline: '세 마리가 모두 다른 역할',
    how: '넓은 대응 범위로 안정적으로 싸우는 밸런스형.',
    members: ['swampert', 'noctowl', 'sableye'],
    pro: '안정적이고 초보자도 이해하기 쉽다',
    con: '아주 날카로운 몰아치기 패턴은 약할 수 있다',
    stab: 3, press: 2, diff: 1, who: '처음 시작하는 분',
    recommended: true,
  },
  {
    code: 'XAB',
    slots: ['X', 'A', 'B'],
    headline: '첫 자리가 유동적인 응용 조합',
    how: '선봉 X로 판을 보고, A와 B가 상성을 이어받아 유연하게 운영한다.',
    members: ['gliscor', 'altaria', 'lanturn'],
    pro: '상황 대응력이 높고 응용 폭이 넓다',
    con: 'X 역할 이해도가 낮으면 운영 난도가 올라간다',
    stab: 2, press: 2, diff: 3, who: '상황을 보며 응용하고 싶은 분',
  },
];

const byId = id => DATA.find(p => p.id === id);
const byCode = code => ARCHETYPES.find(a => a.code === code);
const dots = n => '<span class="tt-dots" aria-label="3점 만점에 ' + n + '점">' +
  '●'.repeat(n) + '<s>' + '●'.repeat(3 - n) + '</s></span>';
const roleBadge = r => `<i class="role r-${r}">${r}</i>`;

const T = window.TYPES || { order: [], ko: {}, chart: {} };
const TKO = t => T.ko[t] || t;

let selected = 'ABC';

/* ---------- 역할 설명 ---------- */

function buildRoles() {
  document.getElementById('roles').innerHTML = Object.entries(ROLE).map(([k, v]) =>
    `<div class="role-item">
      <span class="role r-${k}">${k}</span>
      <div><b>${v.name}</b><small>${v.note}</small></div>
    </div>`).join('');
}

/* ---------- 1. 슬롯 흐름도 ---------- */

function memberCard(id, role) {
  const p = byId(id);
  if (!p) return '';
  return `<figure class="tm">
    <img src="images/${encodeURIComponent(p.img)}" alt="" loading="lazy">
    <figcaption>
      <span class="tm-name">${esc(p.ko)}</span>
      <span class="role r-${role}">${role}</span>
      <span class="tm-rank">${rankText(p)}</span>
    </figcaption>
  </figure>`;
}

function buildCodes() {
  document.getElementById('codes').innerHTML = ARCHETYPES.map(a =>
    `<button type="button" class="tt-code" data-code="${a.code}" aria-pressed="${a.code === selected}">${a.code}</button>`
  ).join('');
}

function buildFlow() {
  const a = byCode(selected);
  const missing = a.members.filter(id => !byId(id));
  const slots = a.slots.map((r, i) => `
    <div class="tt-slot">
      <div class="tt-slot-head">${roleBadge(r)}<span>${SLOT_NAMES[i]} · ${ROLE[r].name}</span></div>
      ${memberCard(a.members[i], r)}
    </div>`);
  document.getElementById('flow').innerHTML = `
    <div class="tt-flow-title"><h3>${a.code}</h3><span>${esc(a.headline)}</span><span class="pill-note">일반 슈퍼리그 예시</span></div>
    <div class="tt-flow">${slots.join('<span class="tt-arrow" aria-hidden="true">→</span>')}</div>
    <p class="arch-how"><b>운영 핵심</b> ${esc(a.how)}</p>
    ${missing.length ? `<p class="note">※ 예시 ${missing.length}종이 현재 데이터에 없어 표시하지 못했습니다.</p>` : ''}
    <div class="arch-pc">
      <div class="pro"><b>장점</b> ${esc(a.pro)}</div>
      <div class="con"><b>주의</b> ${esc(a.con)}</div>
    </div>`;
}

/* ---------- 3. 비교표 ---------- */

function buildTable() {
  const rows = ARCHETYPES.map(a => `
    <tr class="${a.code === selected ? 'sel' : ''}" data-code="${a.code}" tabindex="0" role="button" aria-pressed="${a.code === selected}">
      <th scope="row"><span class="tt-code-cell">${a.code}</span></th>
      <td class="tt-roles">${a.slots.map(roleBadge).join('')}</td>
      <td>${dots(a.stab)}</td><td>${dots(a.press)}</td><td>${dots(a.diff)}</td>
      <td class="tt-who">${a.recommended ? '<b>추천</b> ' : ''}${esc(a.who)}</td>
    </tr>`).join('');
  document.getElementById('cmp-types').innerHTML =
    '<thead><tr><th>유형</th><th>구성</th><th>안정성</th><th>압박</th><th>난이도</th><th>이런 분께</th></tr></thead>' +
    '<tbody>' + rows + '</tbody>';
}

function select(code, scroll) {
  selected = code;
  buildCodes(); buildTable(); buildFlow();
  if (scroll) document.getElementById('flow-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- 4. 질문형 추천 ---------- */

const quiz = { 1: null, 2: null };
// 두 질문의 조합 → 유형. 참고용 규칙이다.
const QUIZ_MAP = {
  'stable|fixed': 'ABC',
  'stable|improv': 'XAB',
  'pressure|fixed': 'ABA',
  'pressure|improv': 'ABB',
};

function paintQuiz() {
  document.querySelectorAll('.tt-opt').forEach(b =>
    b.setAttribute('aria-pressed', String(quiz[b.dataset.q] === b.dataset.v)));
  const box = document.getElementById('quiz-result');
  if (!quiz[1] || !quiz[2]) { box.innerHTML = '<p class="note">두 질문에 모두 답하면 추천 유형이 나옵니다.</p>'; return; }
  const a = byCode(QUIZ_MAP[quiz[1] + '|' + quiz[2]]);
  box.innerHTML = `
    <div class="tt-reco">
      <div><span class="lb">추천 유형</span>
        <div class="tt-reco-code">${a.code} <small>${esc(a.headline)}</small></div>
        <p class="note">${esc(a.how)}</p></div>
      <button type="button" class="tt-go" data-code="${a.code}">흐름도 보기</button>
    </div>`;
}

/* ---------- 2. 내 팀 진단 ---------- */

const diag = [null, null, null, null, null, null];
let tournament = false;   // 대회 룰: 6마리 등록, 3마리 출전
const LABELS3 = ['선봉', '중견', '마무리'];

/* 약점 = 방어 타입 조합의 배율이 1.6배 이상인 공격 타입 */
function weakSet(mon) {
  const out = new Set();
  for (const atk of T.order) {
    let m = 1;
    for (const d of mon.types) m *= (T.chart[atk] || {})[d] ?? 1;
    if (m >= 1.59) out.add(atk);
  }
  return out;
}

function jaccard(a, b) {
  const u = new Set([...a, ...b]);
  if (!u.size) return 0;
  let i = 0; for (const x of a) if (b.has(x)) i++;
  return i / u.size;
}

/* 세 마리의 약점 겹침으로 유형을 추정한다 (선봉, 중견, 마무리 순서) */
function guessType(w) {
  const j01 = jaccard(w[0], w[1]), j02 = jaccard(w[0], w[2]), j12 = jaccard(w[1], w[2]);
  const max = Math.max(j01, j02, j12);
  if (max < 0.2) return { code: 'ABC', why: '세 마리의 약점이 거의 겹치지 않아 서로 다른 역할을 맡는 구조에 가깝습니다.' };
  if (max === j12) return { code: 'ABB', why: '중견과 마무리의 약점이 비슷해서, 뒤 두 마리가 같은 역할을 하는 구조에 가깝습니다.' };
  if (max === j02) return { code: 'ABA', why: '선봉과 마무리의 약점이 비슷해서, 앞뒤가 같은 역할을 하는 구조에 가깝습니다.' };
  return { code: null, why: '선봉과 중견의 약점이 비슷합니다. 이 페이지의 네 유형에는 없는 구조예요.' };
}

function paintSlot(root, i) {
  const mon = diag[i];
  const chosen = root.querySelector('.chosen');
  chosen.hidden = !mon;
  if (!mon) return;
  chosen.querySelector('.chosen-img').src = 'images/' + encodeURIComponent(mon.img);
  chosen.querySelector('.chosen-name').innerHTML = nameHtml(mon);
  chosen.querySelector('.chosen-rank').textContent = `${rankText(mon)} · ${mon.types.map(TKO).join(' / ')}`;
}

function typeGrid(weak) {
  return T.order.map(t => {
    const n = weak.filter(w => w.has(t)).length;
    const cls = n >= 3 ? 'w3' : n === 2 ? 'w2' : n === 1 ? 'w1' : '';
    return `<div class="tt-cell ${cls}"><span>${esc(TKO(t))}</span><i>${n}</i></div>`;
  }).join('');
}

/* 강점 = 포켓몬 자기 타입(자속) 기술이 1.6배 이상으로 들어가는 방어 타입.
   실제 보유 기술이 아니라 타입 기준이고, 방어 쪽은 단일 타입으로 본다. */
function strongSet(mon) {
  const out = new Set();
  for (const def of T.order)
    if (mon.types.some(a => ((T.chart[a] || {})[def] ?? 1) >= 1.59)) out.add(def);
  return out;
}

function strongGrid(strong) {
  return T.order.map(t => {
    const n = strong.filter(s => s.has(t)).length;
    const cls = n >= 2 ? 's2' : n === 1 ? 's1' : 's0';
    return `<div class="tt-cell ${cls}"><span>${esc(TKO(t))}</span><i>${n}</i></div>`;
  }).join('');
}

/* 약점 아래에 붙는 '팀이 강한 타입' 블록 */
function strongBlock(mons) {
  const strong = mons.map(strongSet);
  const none = T.order.filter(t => !strong.some(s => s.has(t))).map(TKO);
  const msg = none.length
    ? `<p class="tt-warn">팀의 자속 기술로 약점을 못 찌르는 타입: <b>${none.join(', ')}</b>. 이 타입 상대에게는 다른 타입 기술이 필요합니다.</p>`
    : '<p class="tt-warn good">18개 타입 모두를 약점으로 찌를 수 있는 포켓몬이 팀에 있습니다.</p>';
  return `<h3 class="tt-h3">팀이 강한 타입 <small>칸의 숫자 = 그 타입에 자속 기술이 잘 통하는 포켓몬 수</small></h3>
    <div class="tt-grid">${strongGrid(strong)}</div>
    ${msg}
    <p class="note">자기 타입 기준이라 실제 보유 기술은 반영하지 않았고, 듀얼 타입 상대는 따로 계산하지 않았습니다.</p>`;
}

/* 6마리 중 3마리를 고르는 모든 조합(20가지)을 약점 겹침이 적은 순으로 */
function trioReport(mons) {
  const ws = mons.map(weakSet);
  const out = [];
  for (let a = 0; a < mons.length; a++)
    for (let b = a + 1; b < mons.length; b++)
      for (let c = b + 1; c < mons.length; c++) {
        const w = [ws[a], ws[b], ws[c]];
        let all3 = 0, two = 0;
        for (const t of T.order) {
          const n = w.filter(x => x.has(t)).length;
          if (n === 3) all3++; else if (n === 2) two++;
        }
        out.push({ idx: [a, b, c], all3, two, score: all3 * 3 + two, g: guessType(w) });
      }
  out.sort((x, y) => x.score - y.score);
  return out;
}

function trioRow(t, mons, tag) {
  const names = t.idx.map(i => esc(mons[i].ko)).join(' · ');
  const detail = t.all3 === 0 && t.two === 0 ? '약점이 겹치지 않음'
    : `${t.all3 ? `세 마리 모두 약한 타입 ${t.all3}개 · ` : ''}두 마리가 약한 타입 ${t.two}개`;
  return `<li><span class="tt-trio-tag ${tag.cls}">${tag.text}</span><b>${names}</b>
    <small>${detail}${t.g.code ? ` · 추정 ${t.g.code}` : ''}</small></li>`;
}

function paintDiag() {
  const box = document.getElementById('diag-result');
  const n = tournament ? 6 : 3;
  const mons = diag.slice(0, n).filter(Boolean);
  if (!mons.length) { box.innerHTML = '<p class="placeholder">포켓몬을 고르면 팀의 약점이 나옵니다.</p>'; return; }

  const weak = mons.map(weakSet);
  const counts = T.order.map(t => [t, weak.filter(w => w.has(t)).length]);
  const grid = typeGrid(weak);

  if (tournament) {
    const wide = counts.filter(([, c]) => c >= 3).map(([t, c]) => `${TKO(t)}(${c})`);
    const summary = wide.length
      ? `<p class="tt-warn">6마리 중 3마리 이상이 약한 타입: <b>${wide.join(', ')}</b>. 이 타입을 쓰는 상대에게는 출전 3마리를 신중히 고르세요.</p>`
      : '<p class="tt-warn good">6마리 중 3마리 이상이 함께 약한 타입이 없어, 상대에 맞춰 출전 조합을 고를 여유가 있습니다.</p>';

    let trios = '';
    if (mons.length >= 3) {
      const rep = trioReport(mons);
      const best = rep.slice(0, 3).map((t, i) => trioRow(t, mons, { cls: 'good', text: `추천 ${i + 1}` }));
      const worst = rep.length > 3 ? [trioRow(rep[rep.length - 1], mons, { cls: 'bad', text: '피하기' })] : [];
      trios = `<h3 class="tt-h3">출전 3마리 조합 <small>${mons.length}마리 중 ${rep.length}가지, 약점 겹침이 적은 순</small></h3>
        <ol class="tt-trios">${best.concat(worst).join('')}</ol>
        <p class="note">약점 겹침만 본 값이라 실제 상대와의 상성, 기술, 메타는 반영하지 않았습니다.</p>`;
    } else {
      trios = '<p class="note">세 마리 이상 고르면 출전 조합을 추천해 드립니다.</p>';
    }
    box.innerHTML = `<h3 class="tt-h3" style="margin-top:0">등록 ${mons.length}마리가 약한 타입 <small>칸의 숫자 = 그 타입에 약한 포켓몬 수</small></h3>
      <div class="tt-grid">${grid}</div>
      ${summary}
      ${strongBlock(mons)}
      ${trios}`;
    return;
  }

  const all3 = counts.filter(([, c]) => c >= 3 && mons.length === 3).map(([t]) => TKO(t));
  const two = counts.filter(([, c]) => c === 2).map(([t]) => TKO(t));
  let summary;
  if (all3.length) summary = `<p class="tt-warn bad">세 마리가 모두 약한 타입: <b>${all3.join(', ')}</b>. 이 타입을 쓰는 상대에게 팀이 통째로 밀릴 수 있습니다.</p>`;
  else if (two.length) summary = `<p class="tt-warn">두 마리가 함께 약한 타입: <b>${two.join(', ')}</b>. 이 타입을 쓰는 상대는 조심하세요.</p>`;
  else summary = '<p class="tt-warn good">두 마리 이상이 함께 약한 타입이 없습니다. 한 가지 타입에 팀 전체가 무너지지 않습니다.</p>';

  let guess = '<p class="note">세 마리를 모두 고르면 유형을 추정해 드립니다.</p>';
  if (mons.length === 3) {
    const g = guessType(weak);
    guess = `<div class="tt-reco">
      <div><span class="lb">추정 유형 (참고용)</span>
        <div class="tt-reco-code">${g.code || '—'} <small>${g.code ? esc(byCode(g.code).headline) : '해당 없음'}</small></div>
        <p class="note">${g.why} 역할은 데이터에 없어서 약점 겹침과 순서로만 추정한 값입니다.</p></div>
      ${g.code ? `<button type="button" class="tt-go" data-code="${g.code}">흐름도 보기</button>` : ''}
    </div>`;
  }

  box.innerHTML = `<h3 class="tt-h3" style="margin-top:0">팀이 약한 타입 <small>칸의 숫자 = 그 타입에 약한 포켓몬 수</small></h3>
    <div class="tt-grid">${grid}</div>
    ${summary}
    ${strongBlock(mons)}
    ${guess}`;
}

function relabelSlots() {
  document.getElementById('diag-slots').classList.toggle('six', tournament);
  document.querySelectorAll('.tt-dslot').forEach(root => {
    const i = Number(root.dataset.slot);
    root.hidden = i >= 3 && !tournament;
    const label = root.querySelector('.tt-slot-label');
    const badge = i < 3 ? `<i class="role r-${['A', 'B', 'C'][i]}">${i + 1}</i> ` : '';
    label.innerHTML = badge + (tournament ? `등록 ${i + 1}` : LABELS3[i]);
  });
}

function setTournament(on) {
  tournament = on;
  if (on && diag.slice(3).every(m => !m)) {
    // 처음 켤 때는 예시 팀으로 채워 바로 결과가 보이게 한다
    const have = new Set(diag.slice(0, 3).filter(Boolean).map(m => m.id));
    const pool = [];
    ARCHETYPES.forEach(a => a.members.forEach(id => { if (!have.has(id) && !pool.includes(id)) pool.push(id); }));
    for (let i = 3; i < 6; i++) diag[i] = byId(pool[i - 3]) || null;
  }
  relabelSlots();
  document.querySelectorAll('.tt-dslot').forEach(root => paintSlot(root, Number(root.dataset.slot)));
  paintDiag();
}

function setupDiag() {
  document.querySelectorAll('.tt-dslot').forEach(root => {
    const i = Number(root.dataset.slot);
    setupSearch(root, mon => { diag[i] = mon; paintSlot(root, i); paintDiag(); });
    root.querySelector('.clear').addEventListener('click', () => { diag[i] = null; paintSlot(root, i); paintDiag(); });
  });
  // 처음 열 때 보여줄 예시: ABC 유형의 예시 팀
  byCode('ABC').members.forEach((id, i) => { diag[i] = byId(id) || null; });
  relabelSlots();
  document.querySelectorAll('.tt-dslot').forEach(root => paintSlot(root, Number(root.dataset.slot)));
  document.getElementById('diag-6').addEventListener('change', e => setTournament(e.target.checked));
  paintDiag();
}

/* ---------- 5. 메가 에디션 탭 ---------- */

const MEGAS = DATA.filter(p => p.mega).sort((a, b) => a.rank - b.rank);
let megaType = '', megaQuery = '';

function paintMega() {
  const counts = {};
  MEGAS.forEach(p => p.types.forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
  const types = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  document.getElementById('mega-chips').innerHTML =
    [''].concat(types).map(t =>
      `<button type="button" class="tt-chip" data-t="${t}" aria-pressed="${t === megaType}">${t ? esc(TKO(t)) : '전체'}</button>`
    ).join('');

  const q = norm(megaQuery);
  const list = MEGAS.filter(p => (!megaType || p.types.includes(megaType)) &&
    (!q || norm(p.ko).includes(q) || norm(p.en).includes(q)));
  document.getElementById('mega-count').textContent = `메가 에디션 순위순 · ${list.length}종 / 전체 ${MEGAS.length}종`;
  document.getElementById('mega-list').innerHTML = list.map(p => `<figure class="tm">
    <img src="images/${encodeURIComponent(p.img)}" alt="" loading="lazy">
    <figcaption>
      <span class="tm-name">${esc(p.ko)}</span>
      <span class="tm-rank">${rankText(p)}</span>
    </figcaption>
  </figure>`).join('') || '<p class="note">조건에 맞는 메가가 없습니다.</p>';
}

/* ---------- 탭 ---------- */

function showTab(name) {
  document.querySelectorAll('.tt-tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('.tt-pane').forEach(p => { p.hidden = p.id !== 'tab-' + name; });
  try { history.replaceState(null, '', name === 'diag' ? location.pathname : '#' + name); } catch (e) { /* file:// 등 */ }
}

/* ------------------------------------------------------------------ */

buildRoles();
select('ABC', false);
paintQuiz();
setupDiag();
paintMega();

document.querySelectorAll('.tt-tab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
document.querySelectorAll('.tt-opt').forEach(b => b.addEventListener('click', () => { quiz[b.dataset.q] = b.dataset.v; paintQuiz(); }));
document.addEventListener('click', e => {
  const go = e.target.closest('.tt-go');
  if (go) { showTab('types'); select(go.dataset.code, true); return; }
  const code = e.target.closest('.tt-code');
  if (code) select(code.dataset.code, false);
  const chip = e.target.closest('.tt-chip');
  if (chip) { megaType = chip.dataset.t; paintMega(); }
  const row = e.target.closest('#cmp-types tbody tr');
  if (row) select(row.dataset.code, true);
});
document.addEventListener('keydown', e => {
  const row = e.target.closest && e.target.closest('#cmp-types tbody tr');
  if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(row.dataset.code, true); }
});
document.getElementById('mega-q').addEventListener('input', e => { megaQuery = e.target.value; paintMega(); });

const startTab = location.hash.replace('#', '');
if (['types', 'mega'].includes(startTab)) showTab(startTab);
