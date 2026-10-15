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
const MOVE_DATA = window.MOVES || {};
const MOVE_SETS = window.MOVESETS || {};

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

function syncDiagUrl() {
  let last = diag.length - 1;
  while (last >= 0 && !diag[last]) last--;
  const value = last < 0 ? '-' : diag.slice(0, last + 1).map(mon => mon ? mon.id : '').join(',');
  urlSet('team', value);
  urlSet('six', tournament ? '1' : null);
}

function restoreDiagUrl() {
  const value = urlGet('team');
  if (value == null) return false;
  const ids = value === '-' ? [] : value.split(',').slice(0, diag.length);
  if (value !== '-') {
    ids.forEach((id, i) => { diag[i] = ALL.find(p => p.id === id) || null; });
  }
  tournament = urlGet('six') === '1' || ids.length > 3;
  return true;
}

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
  chosen.querySelector('.chosen-img').alt = `${mon.ko} 이미지`;
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

/* PvPoke 권장 기술 기준으로 현재 팀의 약점과 공격 범위를 보완하는 후보를 고른다. */
function recommendedMoves(mon) {
  const set = MOVE_SETS[mon.id];
  if (!set) return [];
  return [set[2], ...(set[3] || [])]
    .filter(Boolean)
    .map(id => ({ id, data: MOVE_DATA[id] }))
    .filter(m => m.data)
    .map(m => ({ id: m.id, name: m.data[0], type: m.data[1], power: m.data[2], pace: m.data[3], gain: m.data[4] || 0 }));
}

function defendMult(atk, mon) {
  return mon.types.reduce((m, d) => m * (((T.chart[atk] || {})[d]) ?? 1), 1);
}

/* 후보를 넣었을 때 남는 팀으로 점수를 매긴다. 팀이 꽉 찼으면 누를 때 마지막 슬롯을 바꾸니 그 자리는 빼고 본다.
   여럿이 함께 약한 타입이 생기거나 늘면 크게 깎고(세 마리 모두 약하면 더 크게),
   남는 포켓몬의 약점을 받아 주면 더하고, 아직 못 찌르는 타입을 찌르면 조금 더한다. */
function recommendationCards(mons, complete) {
  const kept = complete ? mons.slice(0, -1) : mons;
  const selectedIds = new Set(mons.map(m => m.id));
  const selectedBases = new Set(mons.map(m => m.id.replace(/_shadow$/, '')));
  const weakCounts = new Map(T.order.map(t => [t, kept.filter(m => weakSet(m).has(t)).length]));
  const teamMoveTypes = new Set(kept.flatMap(recommendedMoves).map(m => m.type));
  const uncovered = T.order.filter(def => ![...teamMoveTypes].some(atk => (T.chart[atk] || {})[def] > 1.1));
  const stack = n => n >= 3 ? 12 : n === 2 ? 4 : 0;   // 함께 약한 마리 수에 따른 감점

  const scored = DATA
    .filter(p => p.rank <= 100 && !selectedIds.has(p.id) && !selectedBases.has(p.id.replace(/_shadow$/, '')))
    .map(mon => {
      const moves = recommendedMoves(mon);
      if (!moves.length) return null;
      const moveTypes = new Set(moves.map(m => m.type));
      const weak = weakSet(mon);
      let score = Math.max(0, 101 - mon.rank) * 0.04;

      for (const [threat, count] of weakCounts) {
        const after = count + (weak.has(threat) ? 1 : 0);
        score -= stack(after) - stack(count);
        if (!count) continue;
        const dm = defendMult(threat, mon);
        if (dm < 0.9) score += count * (dm < 0.5 ? 4 : 3);
        // 약점을 같이 지면서 그 타입을 때리는 기술만 있는 건 보완이 아니다
        if (!weak.has(threat) && [...moveTypes].some(atk => (T.chart[atk] || {})[threat] > 1.1)) score += count;
      }
      const added = uncovered.filter(def => [...moveTypes].some(atk => (T.chart[atk] || {})[def] > 1.1));
      score += added.length * 1.2;
      return { mon, moves, score, added };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.mon.rank - b.mon.rank);

  const pool = [];
  const bases = new Set();
  for (const item of scored) {
    const base = item.mon.id.replace(/_shadow$/, '');
    if (bases.has(base)) continue;
    bases.add(base);
    pool.push(item);
  }

  /* 같은 타입 후보만 줄 세우지 않도록 이미 뽑힌 타입에는 작은 중복 감점을 준다. */
  const unique = [];
  const typeCounts = new Map();
  while (pool.length && unique.length < 8) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    pool.forEach((item, i) => {
      const diversityPenalty = item.mon.types.reduce((sum, t) => sum + (typeCounts.get(t) || 0) * 4, 0);
      const adjusted = item.score - diversityPenalty;
      if (adjusted > bestScore) { bestScore = adjusted; bestIndex = i; }
    });
    const [picked] = pool.splice(bestIndex, 1);
    unique.push(picked);
    picked.mon.types.forEach(t => typeCounts.set(t, (typeCounts.get(t) || 0) + 1));
  }

  const reason = item => {
    const resisted = [...weakCounts]
      .filter(([t, count]) => count && defendMult(t, item.mon) < 0.9)
      .sort((a, b) => b[1] - a[1]);
    if (resisted.length) {
      const added = item.added.find(t => t !== resisted[0][0]);
      return added ? `${TKO(resisted[0][0])} 저항 · ${TKO(added)} 대응` : `${TKO(resisted[0][0])} 약점 보완`;
    }
    const countered = [...weakCounts]
      .filter(([t, count]) => count && item.moves.some(m => (T.chart[m.type] || {})[t] > 1.1))
      .sort((a, b) => b[1] - a[1]);
    if (countered.length) return `${TKO(countered[0][0])} 대응 기술 보강`;
    if (item.added.length) return `${item.added.slice(0, 2).map(TKO).join('·')} 대응 추가`;
    return '상위권 범용 교체 후보';
  };

  return unique.map(item => `<button type="button" class="tt-suggest-card" data-suggest="${esc(item.mon.id)}">
    <img src="images/${encodeURIComponent(item.mon.img)}" alt="" loading="lazy">
    <span class="tt-suggest-name">${esc(item.mon.ko)}</span>
    <span class="tt-suggest-moves">${item.moves.map(m => esc(m.name)).join(' · ')}</span>
    <span class="tt-suggest-reason">${esc(reason(item))}</span>
  </button>`).join('');
}

function recommendationBlock(mons, completeAt = 3) {
  const complete = mons.length >= completeAt;
  return `<section class="tt-suggest" aria-labelledby="tt-suggest-title">
    <div class="tt-suggest-head">
      <h3 id="tt-suggest-title">${complete ? '교체 후보 추천' : '다음 포켓몬 추천'}</h3>
      <span>현재 ${mons.length}마리 · PvPoke 권장 기술 기준</span>
    </div>
    <div class="tt-suggest-track">${recommendationCards(mons, complete)}</div>
    <p class="note">${complete ? '현재 팀의 빈 공격 범위와 공통 약점을 줄일 교체 후보입니다. 누르면 마지막 슬롯을 교체합니다.' : '아직 채우지 못한 공격 범위와 현재 포켓몬의 약점을 보완할 후보입니다. 누르면 빈 슬롯에 추가합니다.'}</p>
  </section>`;
}

/* ------------------------------------------------------------------
   이 팀이 약한 포켓몬 — 지금 포맷 상위 100종의 추천 노말어택·스페셜어택 타입으로 따진다.
   눌림 = 그 포켓몬의 기술 중 하나라도 약점(×1.6 이상)을 찌름. 노말어택이면 매 턴 눌려서 더 무겁다.
   맞받아침 = 우리 포켓몬의 추천 기술 중 하나라도 그 포켓몬의 약점을 찌름.
------------------------------------------------------------------ */
function typeMult(atk, types) {
  return types.reduce((m, d) => m * (((T.chart[atk] || {})[d]) ?? 1), 1);
}

function threatAgainst(foe, foeMoves, mons) {
  const [fast, ...charged] = foeMoves;
  const rows = mons.map(m => {
    const hits = foeMoves.filter(mv => typeMult(mv.type, m.types) >= 1.59);
    const fastHit = !!fast && hits.includes(fast);
    const answerMoves = recommendedMoves(m).filter(mv => typeMult(mv.type, foe.types) >= 1.59);
    const answer = answerMoves.length > 0;
    const walls = foeMoves.every(mv => typeMult(mv.type, m.types) < 0.9);
    const dbl = hits.some(mv => typeMult(mv.type, m.types) > 2.5);
    let score = 0;
    if (hits.length) score += (fastHit ? 2 : 1.5) + (dbl ? 0.5 : 0);
    if (answer) score -= 1.5;
    if (walls) score -= 1;
    const cls = hits.length ? (answer ? 'warn' : 'bad') : answer ? 'good' : 'mid';
    return { m, hits, fastHit, answer, answerMoves, walls, cls, score };
  });
  return {
    foe, moves: foeMoves, rows,
    pressed: rows.filter(r => r.hits.length).length,
    lost: rows.filter(r => r.cls === 'bad').length,
    score: rows.reduce((t, r) => t + r.score, 0) + Math.max(0, 101 - foe.rank) * 0.01,
    charged,
  };
}

function threatBlock(mons) {
  // 그림자와 일반은 같은 포켓몬 — 팀에 있는 종은 빼고, 둘 다 위협이면 순위 높은 쪽 하나에 묶는다
  const baseOf = p => p.id.replace(/_shadow$/, '');
  const teamBases = new Set(mons.map(baseOf));
  const need = Math.max(1, Math.ceil(mons.length / 2));
  const found = DATA
    .filter(p => p.rank <= 100 && !teamBases.has(baseOf(p)))
    .map(p => { const mv = recommendedMoves(p); return mv.length ? threatAgainst(p, mv, mons) : null; })
    .filter(t => t && t.pressed >= need && t.lost >= 1);
  const byBase = new Map();
  for (const t of found.slice().sort((a, b) => a.foe.rank - b.foe.rank)) {
    const kept = byBase.get(baseOf(t.foe));
    if (kept) kept.twins.push(t.foe); else byBase.set(baseOf(t.foe), Object.assign(t, { twins: [] }));
  }
  const list = [...byBase.values()]
    .sort((a, b) => b.lost - a.lost || b.score - a.score || a.foe.rank - b.foe.rank)
    .slice(0, 6);

  const head = `<h3 class="tt-h3">이 팀이 약한 포켓몬 <small>${esc(FORMAT.ko)} 상위 100종 · 추천 노말어택·스페셜어택 타입 기준</small></h3>`;
  if (!list.length) return head + '<p class="tt-warn good">상위권에서 팀 절반 이상을 약점으로 찌르면서 맞받아치기 어려운 포켓몬이 없습니다.</p>';

  const moveTag = (mv, fast) => `<span class="tt-th-move${fast ? ' fast' : ''}"><i class="mv-dot ty ty-${mv.type}" title="${esc(TKO(mv.type))}"></i>${esc(mv.name)}</span>`;
  // 밀리는 포켓몬(찔리는 기술과 함께)과 내보낼 만한 포켓몬만 — '보통'은 뺀다
  const hit = (r, note) => `<span class="tt-hit ${r.cls}"><b>${esc(r.m.ko)}</b>${note ? `<small>${note}</small>` : ''}</span>`;
  const names = list => list.map(mv => esc(mv.name)).join('·');
  /* 팀에 대응도 버팀도 없을 때: 팀 밖 상위 100종 중 그 기술에 약점을 안 찔리고 약점을 찌르는 포켓몬 */
  const counters = t => DATA
    .filter(p => p.rank <= 100 && !teamBases.has(baseOf(p)) && baseOf(p) !== baseOf(t.foe))
    .map(p => ({ p, mv: recommendedMoves(p).filter(mv => typeMult(mv.type, t.foe.types) >= 1.59) }))
    .filter(c => c.mv.length && t.moves.every(mv => typeMult(mv.type, c.p.types) < 1.59))
    .filter((c, i, all) => all.findIndex(o => baseOf(o.p) === baseOf(c.p)) === i)
    .slice(0, 2);
  const line = (cls, lb, body) => `<div class="tt-hl"><span class="tt-hl-lb ${cls}">${lb}</span>${body}</div>`;
  const lines = t => {
    const lost = t.rows.filter(r => r.cls === 'bad');
    const ans = t.rows.filter(r => r.answer);
    const wall = t.rows.filter(r => r.walls && !r.answer);
    let out = line('bad', '밀림', lost.map(r => hit(r, names(r.hits))).join(''));
    if (ans.length) out += line('good', '대응', ans.map(r => hit(r, names(r.answerMoves) + (r.cls === 'warn' ? ' · 서로 약점' : ''))).join(''));
    if (wall.length) out += line('wall', '버팀', wall.map(r => hit({ ...r, cls: 'wall' }, '기술 전부 저항')).join(''));
    if (!ans.length && !wall.length) {
      const cs = counters(t);
      out += line('pick', '추천', cs.length
        ? cs.map(c => `<span class="tt-hit pick"><b>${esc(c.p.ko)}</b><small>${names(c.mv)} · ${c.p.rank}위</small></span>`).join('') + '<span class="tt-hl-none dim">팀에 대응할 포켓몬이 없어 영입 후보</span>'
        : '<span class="tt-hl-none">대응할 포켓몬이 없음</span>');
    }
    return out;
  };

  // 처음엔 위의 3마리만, 나머지는 더 보기로
  return head + `<ol class="tt-threats">${list.map((t, i) => `<li class="tt-threat"${i >= 3 ? ' hidden' : ''}>
      <img src="images/${encodeURIComponent(t.foe.img)}" alt="" loading="lazy">
      <div class="tt-threat-main">
        <div class="tt-threat-top"><a href="types.html?p=${encodeURIComponent(t.foe.id)}"><b>${esc(t.foe.ko)}</b></a>
          <small>${t.foe.rank}위 · ${t.lost}마리가 밀림${t.twins.map(f => ` · ${esc(f.ko)}(${f.rank}위)도 같음`).join('')}</small></div>
        <div class="tt-threat-moves">${moveTag(t.moves[0], true)}${t.charged.map(mv => moveTag(mv, false)).join('')}</div>
        <div class="tt-threat-hits">${lines(t)}</div>
      </div>
    </li>`).join('')}</ol>
    ${list.length > 3 ? `<button type="button" class="tt-threat-more">${list.length - 3}마리 더 보기</button>` : ''}
    <p class="note tt-method-note">밀림 = 그 포켓몬 기술이 약점을 찌르는데 우리 추천 기술로는 약점을 못 찌름 · 대응 = 우리 추천 기술(옆에 적은 기술)로 약점을 찌름 · 버팀 = 그 포켓몬 기술을 전부 저항 · 추천 = 팀에 대응·버팀이 없을 때 상위권에서 잡을 만한 포켓몬 · 노말어택(굵게)으로 찔리면 매 턴 눌려 더 위험합니다. 실제 대전은 종족값·실드·기술 속도에 따라 달라집니다.</p>`;
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
  return `<h3 class="tt-h3">공격 가능한 타입 <small>숫자 = 자속으로 약점을 찌를 수 있는 포켓몬 수</small></h3>
    ${msg}
    <div class="tt-grid">${strongGrid(strong)}</div>
    <p class="note tt-method-note">자기 타입 기준이라 실제 보유 기술은 반영하지 않았고, 듀얼 타입 상대는 따로 계산하지 않았습니다.</p>`;
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
    box.innerHTML = `<h3 class="tt-h3" style="margin-top:0">팀 약점 <small>숫자 = 해당 타입에 약한 포켓몬 수</small></h3>
      ${summary}
      <div class="tt-grid">${grid}</div>
      ${threatBlock(mons)}
      ${recommendationBlock(mons, 6)}
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

  const suggestions = recommendationBlock(mons, 3);
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

  box.innerHTML = `<h3 class="tt-h3" style="margin-top:0">팀 약점 <small>숫자 = 해당 타입에 약한 포켓몬 수</small></h3>
    ${summary}
    <div class="tt-grid">${grid}</div>
    ${threatBlock(mons)}
    ${suggestions}
    ${strongBlock(mons)}
    ${guess}`;
}

function relabelSlots() {
  document.getElementById('diag-slots').classList.toggle('six', tournament);
  document.querySelectorAll('.tt-dslot').forEach(root => {
    const i = Number(root.dataset.slot);
    root.hidden = i >= 3 && !tournament;
    const label = root.querySelector('.tt-slot-label');
    const badge = i < 3 ? `<i class="role r-${['A', 'B', 'C'][i]}">${i + 1}</i> ` : `<i class="role r-n">${i + 1}</i> `;
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
  syncDiagUrl();
}

/* 1~50위에서 서로 다른 종(그림자 포함 같은 종은 하나만) 세 마리를 무작위로 */
function randomTopTeam() {
  const pool = DATA.filter(p => p.rank <= 50);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const bases = new Set();
  return pool.filter(p => {
    const base = p.id.replace(/_shadow$/, '');
    if (bases.has(base) || bases.size >= 3) return false;
    bases.add(base);
    return true;
  });
}

function setupDiag() {
  document.querySelectorAll('.tt-dslot').forEach(root => {
    const i = Number(root.dataset.slot);
    setupSearch(root, mon => { diag[i] = mon; paintSlot(root, i); paintDiag(); syncDiagUrl(); });
    root.querySelector('.clear').addEventListener('click', () => { diag[i] = null; paintSlot(root, i); paintDiag(); syncDiagUrl(); });
  });
  // 주소에 저장된 팀이 없으면 지금 포맷 1~50위에서 무작위 세 마리. 순위가 아직 없으면 ABC 예시 팀.
  if (!restoreDiagUrl()) {
    const team = randomTopTeam();
    (team.length ? team : byCode('ABC').members.map(byId)).forEach((mon, i) => { diag[i] = mon || null; });
  }
  document.getElementById('diag-6').checked = tournament;
  relabelSlots();
  document.querySelectorAll('.tt-dslot').forEach(root => paintSlot(root, Number(root.dataset.slot)));
  document.getElementById('diag-6').addEventListener('change', e => setTournament(e.target.checked));
  paintDiag();
}

/* ---------- 5. 메가 탭 — 지금 포맷에 나오는 메가·원시 포켓몬 ---------- */

const MEGAS = DATA.filter(p => p.mega);
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
  /* 메가가 나오지 않는 포맷이면 메가 버전 포맷으로 바꾸는 버튼을 보여 준다 */
  if (!MEGAS.length) {
    document.getElementById('mega-count').textContent = `지금 고른 ${FORMAT.ko}에는 메가·원시 포켓몬이 나오지 않습니다.`;
    document.getElementById('mega-list').innerHTML = Format.list.filter(f => f.cup === 'mega').map(f =>
      `<button type="button" class="tt-chip" data-go="${esc(f.key)}">${esc(f.ko)}로 보기</button>`).join('');
    return;
  }
  document.getElementById('mega-count').textContent = `${FORMAT.ko} 순위순 · ${list.length}종 / 전체 ${MEGAS.length}종`;
  document.getElementById('mega-list').innerHTML = list.map(p => `<figure class="tm">
    <img src="images/${encodeURIComponent(p.img)}" alt="${esc(p.ko)} 이미지" loading="lazy">
    <figcaption>
      <span class="tm-name">${esc(p.ko)}</span>
      <span class="tm-rank">${rankText(p)}</span>
    </figcaption>
  </figure>`).join('') || '<p class="note">조건에 맞는 메가가 없습니다.</p>';
}

/* ---------- 탭 ---------- */

function showTab(name) {
  document.querySelectorAll('.tt-tab').forEach(b => {
    const selected = b.dataset.tab === name;
    b.setAttribute('aria-selected', String(selected));
    b.tabIndex = selected ? 0 : -1;
  });
  document.querySelectorAll('.tt-pane').forEach(p => { p.hidden = p.id !== 'tab-' + name; });
  try {
    const base = location.pathname + location.search;
    history.replaceState(null, '', name === 'diag' ? base : base + '#' + name);
  } catch (e) { /* file:// 등 */ }
}

/* ------------------------------------------------------------------ */

buildRoles();
select('ABC', false);
paintQuiz();
setupDiag();
paintMega();

document.querySelectorAll('.tt-tab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
document.querySelector('.tt-tabs').addEventListener('keydown', e => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  const tabs = [...document.querySelectorAll('.tt-tab')];
  const current = tabs.indexOf(document.activeElement);
  if (current < 0) return;
  e.preventDefault();
  let next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 :
    (current + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  showTab(tabs[next].dataset.tab);
  tabs[next].focus();
});
document.querySelectorAll('.tt-opt').forEach(b => b.addEventListener('click', () => { quiz[b.dataset.q] = b.dataset.v; paintQuiz(); }));
document.addEventListener('click', e => {
  const suggestion = e.target.closest('.tt-suggest-card');
  if (suggestion) {
    const mon = byId(suggestion.dataset.suggest);
    if (!mon) return;
    const limit = tournament ? 6 : 3;
    let slot = diag.slice(0, limit).findIndex(p => !p);
    if (slot < 0) slot = limit - 1;
    diag[slot] = mon;
    const root = document.querySelector(`.tt-dslot[data-slot="${slot}"]`);
    paintSlot(root, slot);
    paintDiag();
    syncDiagUrl();
    return;
  }
  const more = e.target.closest('.tt-threat-more');
  if (more) {
    more.previousElementSibling.querySelectorAll('.tt-threat[hidden]').forEach(li => { li.hidden = false; });
    more.remove();
    return;
  }
  const go = e.target.closest('.tt-go');
  if (go) { showTab('types'); select(go.dataset.code, true); return; }
  const code = e.target.closest('.tt-code');
  if (code) select(code.dataset.code, false);
  const chip = e.target.closest('.tt-chip');
  if (chip && chip.dataset.go) { Format.go(chip.dataset.go); return; }
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
showTab(['types', 'mega'].includes(startTab) ? startTab : 'diag');
