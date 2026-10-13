'use strict';

/* ------------------------------------------------------------------
   개체값 고르기 — 왜 슈퍼리그는 공격이 낮은 개체가 좋은가

   CP = floor(공격 x sqrt(방어) x sqrt(HP) / 10) 이고 CP 1500 상한이 있다. (CP의 HP는 내림 전 값)
   공격은 CP를 가장 많이 올리는 값이라, 공격 개체값이 낮으면 같은 1500 CP
   안에서 레벨을 더 올릴 수 있고 결과적으로 방어·HP가 커진다.

   스탯곱(공격 x 방어 x HP)이 클수록 오래 버틴다. 1등 개체는 이 값이 최대인 조합이다.
------------------------------------------------------------------ */

/* 4096조합 전수 탐색 → 스탯곱 내림차순 */
function ranked(mon) {
  return BattleCore.allBuilds(mon);
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
  chosen.querySelector('.chosen-img').alt = `${mon.ko} 이미지`;
  chosen.querySelector('.chosen-name').innerHTML = nameHtml(mon);
  chosen.querySelector('.chosen-rank').textContent = `${rankText(mon)} · ${mon.types.join(' / ')}${mon.mega ? ' · 메가 전투용 CP 보정 미반영' : ''}`;

  // 메가 폼만: PvPoke 기본 개체값 빠른 선택
  const pvBtn = document.getElementById('iv-pv');
  if (mon.pvIv) {
    pvBtn.hidden = false;
    pvBtn.dataset.ivs = mon.pvIv.join('/');
    pvBtn.textContent = 'PvPoke 기본 ' + mon.pvIv.join(' · ');
  } else {
    pvBtn.hidden = true;
  }

  const all = ranked(mon);
  const best = all[0];
  const hundo = findBuild(mon, [15, 15, 15]);
  const mine = findBuild(mon, myIvs);

  document.querySelectorAll('.iv-input').forEach((inp, i) => { inp.value = myIvs[i]; });

  const pct = b => ((b.product / best.product) * 100).toFixed(1);

  box.innerHTML = `
    ${gradeBlock(mine, best, all)}
    ${statBars(mine, best, hundo)}

    <details class="more">
      <summary>숫자로 자세히 보기</summary>
      <p class="answer-sub" style="margin-top:8px"><b>${esc(mon.ko)}</b> 의 개체값 4,096조합을 전부 계산했습니다.
      각 조합은 ${Format.capText}을 넘지 않는 가장 높은 레벨 기준입니다.</p>
    <p class="scroll-hint">표를 좌우로 밀어 전체 수치를 확인하세요.</p>
    <div class="table-scroll" tabindex="0" aria-label="개체값 상세 수치, 가로로 스크롤 가능">
      <table class="cmp-table">
        <thead><tr><th>구분</th><th>개체값</th><th>레벨</th><th>CP</th>
          <th>공격</th><th>방어</th><th>HP</th><th>버티는 정도</th></tr></thead>
        <tbody>
          ${row('내 개체값', mine, pct(mine))}
          ${row('1등 개체', best, pct(best))}
          ${row('15 · 15 · 15', hundo, pct(hundo))}
          ${mon.pvIv ? row('PvPoke 기본', findBuild(mon, mon.pvIv), pct(findBuild(mon, mon.pvIv))) : ''}
        </tbody>
      </table>
    </div>

    <p class="answer-sub">
      ‘버티는 정도’는 스탯곱(공격 × 방어 × HP)을 1등 개체 대비 비율로 본 값입니다.
      내 개체값은 4,096조합 중 <b>${mine.rank}위</b>입니다.
    </p>

    ${verdictBlock(mine, best, hundo)}
    </details>`;
}

/* 4,096조합 중 순위를 등급으로 바꾼다. 기준은 임의로 정한 것이라 화면에도 적어 둔다. */
function gradeOf(rank, total) {
  const top = rank / total * 100;
  if (top <= 1) return { g: 'S', cls: 's', text: '버티는 힘 최상급입니다' };
  if (top <= 10) return { g: 'A', cls: 'a', text: '충분히 좋은 개체입니다' };
  if (top <= 30) return { g: 'B', cls: 'b', text: '무난한 개체입니다' };
  return { g: 'C', cls: 'c', text: '더 좋은 개체가 많습니다' };
}

function gradeBlock(mine, best, all) {
  const total = all.length;
  const topPct = Math.max(0.1, mine.rank / total * 100);
  const g = gradeOf(mine.rank, total);
  const hold = mine.product / best.product * 100;
  const holdLabel = hold >= 99 ? ['매우 좋음', 'good'] : hold >= 97 ? ['좋음', 'good'] : hold >= 94 ? ['보통', 'acc'] : ['약함', 'bad'];

  // 공격 실수치가 4,096조합 중 얼마나 높은지 = 차징 우선권(CMP) 쪽 강도
  const beaten = all.filter(b => b.atk < mine.atk).length / total * 100;
  const cmpLabel = beaten >= 70 ? ['강함', 'good'] : beaten >= 30 ? ['보통', 'acc'] : ['약함', 'bad'];

  return `
    <div class="iv-grade">
      <span class="iv-g ${g.cls}">${g.g}</span>
      <div>
        <div class="iv-g-title">상위 ${topPct.toFixed(1)}% · ${g.text}</div>
        <div class="iv-g-sub">${esc(mon.ko)} ${mine.ivs.join('/')} · 4,096조합 중 ${mine.rank}위</div>
        <div class="iv-pct"><i style="width:${(100 - topPct).toFixed(1)}%"></i></div>
      </div>
    </div>
    <div class="iv-two">
      <div class="iv-verdict"><span class="k">오래 버티기</span>
        <b class="${holdLabel[1]}">${holdLabel[0]} · 1등의 ${hold.toFixed(1)}%</b>
        <span>스탯곱(공격×방어×HP) 기준</span></div>
      <div class="iv-verdict"><span class="k">차징 우선권 (CMP)</span>
        <b class="${cmpLabel[1]}">${cmpLabel[0]} · 공격이 ${beaten.toFixed(0)}%의 조합보다 높음</b>
        <span>같은 턴 차징에서 이기기 쉬운 정도</span></div>
    </div>
    <p class="iv-grade-note">등급 기준: S 상위 1% · A 10% · B 30% · 그 아래 C</p>`;
}

/* 공격·방어·HP·레벨을 내 개체, 1등, 15/15/15로 겹쳐 비교한다.
   차이가 보이도록 막대 축을 잘라서 그린다(0이 아니라 최댓값의 70%에서 시작). */
function statBars(mine, best, hundo) {
  const sets = [
    ['내 개체', 'me', mine], ['1등', 'best', best], ['15/15/15', 'hundo', hundo],
  ];
  const stats = [
    ['공격', b => b.atk, v => v.toFixed(1)],
    ['방어', b => b.def, v => v.toFixed(1)],
    ['HP', b => b.hp, v => String(v)],
    ['레벨', b => b.level, v => 'Lv' + v],
  ];
  const rows = stats.map(([name, get, fmt]) => {
    const vals = sets.map(([, , b]) => get(b));
    const hi = Math.max(...vals), lo = hi * 0.7;
    const bars = sets.map(([label, cls, b]) => {
      const v = get(b);
      const w = Math.max(4, (v - lo) / (hi - lo) * 100);
      return `<div class="iv-bar ${cls}"><i style="width:${w.toFixed(1)}%"></i><em>${fmt(v)}</em></div>`;
    }).join('');
    return `<div class="iv-bar-row"><span>${name}</span><div class="iv-bar-stack">${bars}</div></div>`;
  }).join('');
  return `
    <div class="iv-bars">
      <div class="iv-bars-title">같은 ${Format.capText}에서 이렇게 달라집니다</div>
      ${rows}
      <div class="iv-bars-leg">
        <span><i class="me"></i>내 개체 ${mine.ivs.join('/')}</span>
        <span><i class="best"></i>1등 ${best.ivs.join('/')}</span>
        <span><i class="hundo"></i>15/15/15</span>
      </div>
      <p class="iv-grade-note">막대는 차이가 잘 보이도록 최댓값의 70%부터 그렸습니다.</p>
    </div>`;
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
        같은 ${Format.capText}인데 공격 개체값이 ${best.ivs[0]}이라 레벨을 ${lvGap > 0 ? `Lv${lvGap} 더` : '비슷하게'}
        올릴 수 있어서입니다</li>
      <li><strong>공격은 15·15·15가 더 높습니다</strong>
        ${hundo.atk.toFixed(1)} 대 ${best.atk.toFixed(1)} — 차징 우선권(CMP)만 보면 이쪽이 유리합니다</li>
      <li><strong>그래서 무조건 0/15/15가 정답은 아닙니다</strong>
        오래 버티는 쪽이 보통 유리하지만, CMP를 노린다면 공격이 높은 개체도 쓸 데가 있습니다</li>
    </ul>
  </div>`;
}

/* ------------------------------------------------------------------ */

setupSearch(document.querySelector('.cmp-picker'), m => { mon = m; paint(); urlSet('p', m && m.id); });
document.querySelector('.cmp-picker .clear').addEventListener('click', () => { mon = null; paint(); urlSet('p', null); });

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

/* CP 상한이 없는 포맷(마스터리그 계열)은 '공격을 낮춰 레벨을 올린다' 는 이야기가 성립하지 않는다 */
if (Format.isMaster) {
  const note = document.createElement('section');
  note.className = 'panel sn-alert';
  note.innerHTML = `<h2>${esc(FORMAT.ko)}는 CP 상한이 없습니다</h2>
    <p class="note">모든 포켓몬이 최대 레벨까지 올라가므로 개체값이 높을수록 강합니다. 15 · 15 · 15가 1등이고,
    아래의 '공격이 낮은 개체가 좋은 이유' 는 슈퍼·하이퍼리그 같은 CP 상한 리그 이야기입니다.</p>`;
  document.querySelector('main.wrap').prepend(note);
  document.querySelector('.top .meta span').textContent = 'CP 제한 없음';
}

mon = monFromUrl('p') || byRank(1);
paint();
