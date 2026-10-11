'use strict';

/* ------------------------------------------------------------------
   포켓몬별 기술표 (노말어택 / 스페셜어택)

   data/moves.js 의 MOVES[기술id] = [한글명, 타입, 위력, 턴(노말)/에너지(스페셜), 에너지획득(노말), 능력치변화?]
     능력치변화 = [대상(s 자신 / o 상대), 공격 단계, 방어 단계, 발동 확률]
   MOVESETS[포켓몬id] = [노말어택들, 스페셜어택들, 추천 노말, 추천 스페셜들, 대단한 기술 머신 필요, 이벤트 한정]
   (scripts/build_moves.py 가 PvPoke 에서 만든다)

   포켓몬 GO에는 물리/특수 구분이 없다. 기술은 타입·위력·에너지로만 정해진다.
------------------------------------------------------------------ */

const T = window.TYPES || { order: [], ko: {} };
const TKO = t => T.ko[t] || t;
const MOVES = window.MOVES || {};
const SETS = window.MOVESETS || {};
const f1 = n => String(Number(n.toFixed(2)));

let mon = null;
let basis = null;   // 노말어택 횟수 계산에 쓰는 노말어택 id

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

function render() {
  const box = document.getElementById('mv-result');
  if (!mon) { box.innerHTML = '<p class="placeholder">포켓몬을 고르면 기술표가 나옵니다.</p>'; return; }
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

function paintMon(m) {
  mon = m; basis = null;
  const chosen = document.querySelector('.cmp-picker .chosen');
  chosen.hidden = !m;
  if (m) {
    chosen.querySelector('.chosen-img').src = 'images/' + encodeURIComponent(m.img);
    chosen.querySelector('.chosen-name').textContent = m.ko;
    chosen.querySelector('.chosen-rank').textContent = `${rankText(m)} · ${m.types.map(TKO).join(' / ')}`;
  }
  render();
}

const result = document.getElementById('mv-result');
function pickBasis(e) {
  const li = e.target.closest('#mv-normal .mv-item'); if (!li) return false;
  basis = li.dataset.id; render(); return true;
}
result.addEventListener('click', pickBasis);
result.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && pickBasis(e)) e.preventDefault();
});

setupSearch(document.querySelector('.cmp-picker'), paintMon);
document.querySelector('.cmp-picker .clear').addEventListener('click', () => paintMon(null));
paintMon(byRank(1));
