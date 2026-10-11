'use strict';

/* ------------------------------------------------------------------
   개체값 고르기 — 왜 슈퍼리그는 공격이 낮은 개체가 좋은가

   CP = floor(공격 x sqrt(방어) x sqrt(HP) / 10) 이고 CP 1500 상한이 있다.
   공격은 CP를 가장 많이 올리는 값이라, 공격 개체값이 낮으면 같은 1500 CP
   안에서 레벨을 더 올릴 수 있고 결과적으로 방어·HP가 커진다.

   스탯곱(공격 x 방어 x HP)이 클수록 오래 버틴다. 1등 개체는 이 값이 최대인 조합이다.
------------------------------------------------------------------ */

const CAP = 1500;
const LV_MAX = 50;

function statsAt(base, ivs, level) {
  const c = CPM[Math.round((level - 1) * 2)];
  const atk = (base[0] + ivs[0]) * c;
  const def = (base[1] + ivs[1]) * c;
  const hp = Math.floor((base[2] + ivs[2]) * c);
  return { atk, def, hp, cp: Math.max(10, Math.floor(atk * Math.sqrt(def) * Math.sqrt(hp) / 10)) };
}

function bestBuild(base, ivs) {
  let out = null;
  for (let lv = 1; lv <= LV_MAX; lv += 0.5) {
    const s = statsAt(base, ivs, lv);
    if (s.cp > CAP) break;
    out = Object.assign({ level: lv, ivs: ivs.slice() }, s);
  }
  if (!out) out = Object.assign({ level: 1, ivs: ivs.slice() }, statsAt(base, ivs, 1));
  out.product = out.atk * out.def * out.hp;
  return out;
}

/* 4096조합 전수 탐색 → 스탯곱 내림차순 */
function rankAll(base) {
  const all = [];
  for (let a = 0; a < 16; a++)
    for (let d = 0; d < 16; d++)
      for (let h = 0; h < 16; h++)
        all.push(bestBuild(base, [a, d, h]));
  all.sort((x, y) => y.product - x.product);
  all.forEach((b, i) => { b.rank = i + 1; });
  return all;
}

const _cache = new Map();
function ranked(mon) {
  if (!_cache.has(mon.id)) _cache.set(mon.id, rankAll(mon.base));
  return _cache.get(mon.id);
}

function findBuild(mon, ivs) {
  const key = ivs.join(',');
  return ranked(mon).find(b => b.ivs.join(',') === key);
}

/* ------------------------------------------------------------------
   화면
------------------------------------------------------------------ */

let mon = null;
// 기본값은 흔히 권장되는 조합. 15·15·15 카드와 겹치지 않아 비교가 바로 보인다.
let myIvs = [0, 15, 15];

function paint() {
  const box = document.getElementById('iv-result');
  const chosen = document.querySelector('.cmp-picker .chosen');

  if (!mon) {
    chosen.hidden = true;
    document.querySelector('.ivs').hidden = true;
    box.innerHTML = '<p class="placeholder">포켓몬을 고르면 개체값별 결과가 나옵니다.</p>';
    return;
  }

  chosen.hidden = false;
  document.querySelector('.ivs').hidden = false;
  chosen.querySelector('.chosen-img').src = 'images/' + encodeURIComponent(mon.img);
  chosen.querySelector('.chosen-name').textContent = mon.ko;
  chosen.querySelector('.chosen-rank').textContent = `${mon.rank}위 · ${mon.types.join(' / ')}`;

  const all = ranked(mon);
  const best = all[0];
  const hundo = findBuild(mon, [15, 15, 15]);
  const mine = findBuild(mon, myIvs);

  document.querySelectorAll('.iv-input').forEach((inp, i) => { inp.value = myIvs[i]; });

  const pct = b => ((b.product / best.product) * 100).toFixed(1);

  box.innerHTML = `
    <div class="matchup">
      <div><b>${esc(mon.ko)}</b> 의 개체값 4,096조합을 전부 계산했습니다.
      각 조합은 CP 1500을 넘지 않는 가장 높은 레벨 기준입니다.</div>
    </div>

    <div class="iv-cards">
      ${card('내 개체값', mine, best, '내가 입력한 조합', 'mine')}
      ${card('1등 개체', best, best, '스탯곱이 가장 큰 조합 — 가장 오래 버틴다', 'best')}
      ${card('15 · 15 · 15', hundo, best, '소위 100% 개체', 'hundo')}
    </div>

    <table class="cmp-table">
      <thead><tr><th>구분</th><th>개체값</th><th>레벨</th><th>CP</th>
        <th>공격</th><th>방어</th><th>HP</th><th>버티는 정도</th></tr></thead>
      <tbody>
        ${row('내 개체값', mine, pct(mine))}
        ${row('1등 개체', best, pct(best))}
        ${row('15 · 15 · 15', hundo, pct(hundo))}
      </tbody>
    </table>

    <p class="answer-sub">
      ‘버티는 정도’는 스탯곱(공격 × 방어 × HP)을 1등 개체 대비 비율로 본 값입니다.
      내 개체값은 4,096조합 중 <b>${mine.rank}위</b>입니다.
    </p>

    ${verdictBlock(mine, best, hundo)}`;
}

function card(title, b, best, note, cls) {
  const p = ((b.product / best.product) * 100).toFixed(1);
  return `<div class="iv-card ${cls}">
    <div class="iv-card-title">${title}</div>
    <div class="iv-card-ivs">${b.ivs.join(' / ')}</div>
    <div class="iv-card-main">${p}<small>%</small></div>
    <div class="iv-card-meta">Lv${b.level} · CP ${b.cp} · ${b.rank}위</div>
    <div class="iv-card-note">${note}</div>
  </div>`;
}

function row(name, b, pct) {
  return `<tr>
    <td>${name}</td><td>${b.ivs.join(' / ')}</td><td>Lv${b.level}</td><td>${b.cp}</td>
    <td>${b.atk.toFixed(1)}</td><td>${b.def.toFixed(1)}</td><td>${b.hp}</td>
    <td>${pct}%</td></tr>`;
}

function verdictBlock(mine, best, hundo) {
  const gap = (best.product / hundo.product - 1) * 100;
  const lvGap = (best.level - hundo.level).toFixed(1);
  return `<div class="panel inner">
    <h3>이 포켓몬은 이렇습니다</h3>
    <ul class="tips">
      <li><strong>1등 개체가 ${gap.toFixed(1)}% 더 버팁니다</strong>
        같은 CP 1500인데 공격 개체값이 ${best.ivs[0]}이라 레벨을 ${lvGap > 0 ? `Lv${lvGap} 더` : '비슷하게'}
        올릴 수 있어서입니다</li>
      <li><strong>공격은 15·15·15가 더 높습니다</strong>
        ${hundo.atk.toFixed(1)} 대 ${best.atk.toFixed(1)} — 차징 우선권(CMP)만 보면 이쪽이 유리합니다</li>
      <li><strong>그래서 무조건 0/15/15가 정답은 아닙니다</strong>
        오래 버티는 쪽이 보통 유리하지만, CMP를 노린다면 공격이 높은 개체도 쓸 데가 있습니다</li>
    </ul>
  </div>`;
}

/* ------------------------------------------------------------------ */

setupSearch(document.querySelector('.cmp-picker'), m => { mon = m; paint(); });
document.querySelector('.cmp-picker .clear').addEventListener('click', () => { mon = null; paint(); });

document.querySelectorAll('.iv-input').forEach((inp, i) => {
  inp.addEventListener('input', () => {
    myIvs[i] = Math.max(0, Math.min(15, parseInt(inp.value, 10) || 0));
    paint();
  });
});

document.querySelectorAll('.iv-quick').forEach(btn => {
  btn.addEventListener('click', () => {
    myIvs = btn.dataset.ivs.split('/').map(Number);
    paint();
  });
});

mon = byRank(1);
paint();
