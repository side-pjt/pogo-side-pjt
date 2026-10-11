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

/* 방어 타입 조합(1~2개)에 대한 공격 타입별 최종 배율 */
function defenseProfile(types) {
  const out = {};
  for (const atk of T.order) {
    let m = 1;
    for (const d of types) m *= (T.chart[atk] && T.chart[atk][d] != null) ? T.chart[atk][d] : 1;
    out[atk] = m;
  }
  return out;
}

/* ------------------------------------------------------------------
   포켓몬으로 찾기
------------------------------------------------------------------ */

let current = null;

function paintMon(mon) {
  current = mon;
  const box = document.getElementById('mon-result');
  const chosen = document.querySelector('.cmp-picker .chosen');

  if (!mon) {
    chosen.hidden = true;
    box.innerHTML = '<p class="placeholder">포켓몬을 고르면 약점과 저항이 나옵니다.</p>';
    return;
  }

  chosen.hidden = false;
  chosen.querySelector('.chosen-img').src = 'images/' + encodeURIComponent(mon.img);
  chosen.querySelector('.chosen-name').textContent = mon.ko;
  chosen.querySelector('.chosen-rank').textContent =
    `${rankText(mon)} · ${mon.types.map(TKO).join(' / ')}`;

  const prof = defenseProfile(mon.types);
  const groups = { super: [], resist: [], double: [] };
  for (const atk of T.order) {
    const b = bucket(prof[atk]);
    if (b.cls !== 'neutral') groups[b.cls].push({ atk, m: prof[atk] });
  }
  // 4배 약점(1.6*1.6)이 앞에 오도록
  groups.super.sort((a, b) => b.m - a.m);
  groups.resist.sort((a, b) => a.m - b.m);

  // 0.625 는 그대로 보여주되 0.390625 같은 긴 값은 두 자리로 줄인다
  const num = m => String(Number(m.toFixed(Math.abs(m - 0.625) < 1e-6 ? 3 : 2)));
  const chips = arr => arr.length
    ? arr.map(({ atk, m }) =>
        `<span class="tchip t-${atk}">${esc(TKO(atk))}<small>×${num(m)}</small></span>`).join('')
    : '<span class="none">없음</span>';

  box.innerHTML = `
    <div class="matchup">
      <div><b>${esc(mon.ko)}</b> · ${mon.types.map(t => esc(TKO(t))).join(' / ')} 타입이
      받는 피해입니다. 내가 쓰는 기술이 아니라 <b>상대 기술</b> 기준입니다.</div>
    </div>
    <div class="tgroup">
      <h3 class="tg-super">약점 — 이 타입 기술에 크게 맞는다</h3>
      <div class="tchips">${chips(groups.super)}</div>
    </div>
    <div class="tgroup">
      <h3 class="tg-resist">저항 — 이 타입 기술을 잘 버틴다</h3>
      <div class="tchips">${chips(groups.resist.filter(g => g.m >= 0.5))}</div>
    </div>
    <div class="tgroup">
      <h3 class="tg-double">이중 저항 — 거의 안 아프다</h3>
      <div class="tchips">${chips(groups.double)}</div>
    </div>`;
}

/* ------------------------------------------------------------------
   18 x 18 상성표
------------------------------------------------------------------ */

function buildChart() {
  const host = document.getElementById('type-table');
  const types = T.order;

  let html = '<thead><tr><th class="corner">방어 ↓ / 공격 →</th>';
  for (const a of types) html += `<th class="t-${a}" data-atk="${a}">${esc(TKO(a))}</th>`;
  html += '</tr></thead><tbody>';

  for (const d of types) {
    html += `<tr><th class="t-${d}" data-def="${d}">${esc(TKO(d))}</th>`;
    for (const a of types) {
      const b = bucket(T.chart[a][d]);
      html += `<td class="${b.cls}" data-atk="${a}" data-def="${d}" ` +
        `title="${esc(TKO(a))} 기술 → ${esc(TKO(d))} 타입 : ${b.label} ${b.x}">${b.mark}</td>`;
    }
    html += '</tr>';
  }
  host.innerHTML = html + '</tbody>';

  // 칸에 마우스를 올리면 같은 행·열을 강조
  host.addEventListener('mouseover', e => {
    const td = e.target.closest('td, th');
    host.querySelectorAll('.hl').forEach(el => el.classList.remove('hl'));
    if (!td) return;
    const { atk, def } = td.dataset;
    if (atk) host.querySelectorAll(`[data-atk="${atk}"]`).forEach(el => el.classList.add('hl'));
    if (def) host.querySelectorAll(`[data-def="${def}"]`).forEach(el => el.classList.add('hl'));
  });
}

/* ------------------------------------------------------------------ */

setupSearch(document.querySelector('.cmp-picker'), paintMon);
document.querySelector('.cmp-picker .clear').addEventListener('click', () => paintMon(null));

buildChart();
paintMon(byRank(1));
