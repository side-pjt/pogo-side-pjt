'use strict';

/* ------------------------------------------------------------------
   CMP (Charge Move Priority)

   같은 턴에 양쪽이 차징기를 쓰면 공격 실수치가 높은 쪽이 먼저 나간다.
   PvPoke 시뮬레이터도 그냥 stats.atk 끼리 비교한다:
       if (poke.stats.atk > opponent.stats.atk) priority++

   두 가지를 기억할 것:
   - 그림자는 CMP에 영향이 없다. shadowAtkMult는 데미지 계산에서만 곱해진다
   - 공격 실수치가 정확히 같으면 어느 쪽도 우선권이 없다 (사실상 랜덤)

   공격 실수치 = (종족값공격 + 공격개체값) x CPM(레벨)
   CP         = floor(공격 x sqrt(방어) x sqrt(HP) / 10)
   1,152종 전부 PvPoke 수치와 대조해 검증한 식이다.
------------------------------------------------------------------ */

const CP_CAP = 1500;
const MAX_LEVEL = 50;

function statsAt(base, ivs, level) {
  const c = CPM[Math.round((level - 1) * 2)];
  const atk = (base[0] + ivs[0]) * c;
  const def = (base[1] + ivs[1]) * c;
  const hp = Math.floor((base[2] + ivs[2]) * c);
  return { atk, def, hp, cp: Math.max(10, Math.floor(atk * Math.sqrt(def) * Math.sqrt(hp) / 10)) };
}

/* CP 상한을 넘지 않는 가장 높은 레벨. CP는 레벨에 단조증가라 넘는 순간 끊으면 된다. */
function bestBuild(base, ivs) {
  let out = null;
  for (let lv = 1; lv <= MAX_LEVEL; lv += 0.5) {
    const s = statsAt(base, ivs, lv);
    if (s.cp > CP_CAP) break;
    out = Object.assign({ level: lv, ivs: ivs.slice() }, s);
  }
  return out || Object.assign({ level: 1, ivs: ivs.slice() }, statsAt(base, ivs, 1));
}

/* 모든 개체값 조합(4096개)의 최적 빌드. 브라우저에서 즉시 끝난다. */
function allBuilds(base) {
  const out = [];
  for (let a = 0; a < 16; a++)
    for (let d = 0; d < 16; d++)
      for (let h = 0; h < 16; h++)
        out.push(bestBuild(base, [a, d, h]));
  return out;
}

const _cache = new Map();
function buildsFor(mon) {
  if (!_cache.has(mon.id)) _cache.set(mon.id, allBuilds(mon.base));
  return _cache.get(mon.id);
}

/* 프리셋 세 가지 */
function presets(mon) {
  const all = buildsFor(mon);
  let rank1 = all[0], maxAtk = all[0];
  for (const b of all) {
    if (b.atk * b.def * b.hp > rank1.atk * rank1.def * rank1.hp) rank1 = b;
    if (b.atk > maxAtk.atk) maxAtk = b;
  }
  return {
    rank1,                                   // 스탯곱 최대 — 대부분이 키우는 빌드
    maxAtk,                                  // 공격 최대 — CMP를 노린 빌드
    hundo: bestBuild(mon.base, [15, 15, 15]),
  };
}

/* 상대 개체값을 모를 때: 전체 조합 대비 내가 이기는 비율과 공격 개체값별 판정 */
function spread(myAtk, foe) {
  const all = buildsFor(foe);
  let win = 0, tie = 0;
  const perAtkIV = Array.from({ length: 16 }, () => ({ win: 0, total: 0 }));

  for (const b of all) {
    const slot = perAtkIV[b.ivs[0]];
    slot.total++;
    if (myAtk > b.atk) { win++; slot.win++; }
    else if (Math.abs(myAtk - b.atk) < 1e-9) tie++;
  }
  return { total: all.length, win, tie, lose: all.length - win - tie, perAtkIV };
}

/* ------------------------------------------------------------------
   상태
------------------------------------------------------------------ */

const PRESET_LABEL = { rank1: '1등 개체', maxAtk: '공격 최대', hundo: '15·15·15', custom: '직접 입력' };

const S = {
  mode: 'spread',                                  // spread | head
  me: { mon: null, preset: 'rank1', ivs: [0, 15, 15] },
  foe: { mon: null, preset: 'rank1', ivs: [0, 15, 15] },
};

function buildOf(side) {
  const st = S[side];
  if (!st.mon) return null;
  if (st.preset === 'custom') return bestBuild(st.mon.base, st.ivs);
  return presets(st.mon)[st.preset];
}

/* ------------------------------------------------------------------
   선택 UI
------------------------------------------------------------------ */

function setupSide(root, side) {
  const chosen = root.querySelector('.chosen');
  const ivBox = root.querySelector('.ivs');

  setupSearch(root, mon => { S[side].mon = mon; paintSide(root, side); render(); });

  root.querySelector('.clear').addEventListener('click', () => {
    S[side].mon = null;
    chosen.hidden = true;
    ivBox.hidden = true;
    render();
  });

  // 프리셋 버튼
  root.querySelectorAll('.preset').forEach(btn => {
    btn.addEventListener('click', () => {
      S[side].preset = btn.dataset.preset;
      paintSide(root, side);
      render();
    });
  });

  // 직접 입력 슬라이더
  root.querySelectorAll('.iv-input').forEach((inp, i) => {
    inp.addEventListener('input', () => {
      S[side].ivs[i] = Math.max(0, Math.min(15, parseInt(inp.value, 10) || 0));
      S[side].preset = 'custom';
      paintSide(root, side);
      render();
    });
  });
}

function paintSide(root, side) {
  const st = S[side];
  const chosen = root.querySelector('.chosen');
  const ivBox = root.querySelector('.ivs');
  if (!st.mon) { chosen.hidden = true; ivBox.hidden = true; return; }

  chosen.hidden = false;
  chosen.querySelector('.chosen-img').src = 'images/' + encodeURIComponent(st.mon.img);
  chosen.querySelector('.chosen-name').textContent = st.mon.ko;
  chosen.querySelector('.chosen-rank').textContent = `${st.mon.rank}위 · ${st.mon.types.join(' / ')}`;

  // 상대 쪽은 '전체 비교' 모드에서 개체값을 받지 않는다
  const needIV = side === 'me' || S.mode === 'head';
  const hint = root.querySelector('.side-hint');
  ivBox.hidden = !needIV;
  if (hint) hint.hidden = needIV;
  if (!needIV) return;

  root.querySelectorAll('.preset').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.preset === st.preset)));

  const b = buildOf(side);
  if (st.preset !== 'custom') {
    root.querySelectorAll('.iv-input').forEach((inp, i) => { inp.value = b.ivs[i]; });
    st.ivs = b.ivs.slice();
  }
  root.querySelector('.iv-summary').textContent =
    `${b.ivs.join(' / ')} · Lv${b.level} · CP ${b.cp} · 공격 ${b.atk.toFixed(1)}`;
}

/* ------------------------------------------------------------------
   결과
------------------------------------------------------------------ */

function render() {
  const box = document.getElementById('cmp-result');
  const me = S.me.mon, foe = S.foe.mon;

  if (!me || !foe) {
    box.innerHTML = '<p class="placeholder">양쪽 포켓몬을 고르면 CMP 결과가 나옵니다.</p>';
    return;
  }

  const mb = buildOf('me');
  box.innerHTML = S.mode === 'head' ? renderHead(me, foe, mb) : renderSpread(me, foe, mb);
}

function verdict(mine, theirs) {
  if (Math.abs(mine - theirs) < 1e-9)
    return { cls: 'tie', text: '동점 — 랜덤', note: '공격 실수치가 완전히 같아 어느 쪽도 우선권이 없습니다.' };
  return mine > theirs
    ? { cls: 'free', text: '내가 먼저', note: '같은 턴에 차징기를 쓰면 내 기술이 먼저 나갑니다.' }
    : { cls: 'blocked', text: '상대가 먼저', note: '같은 턴에 차징기를 쓰면 상대 기술이 먼저 나갑니다.' };
}

function renderHead(me, foe, mb) {
  const fb = buildOf('foe');
  const v = verdict(mb.atk, fb.atk);
  const diff = Math.abs(mb.atk - fb.atk).toFixed(2);

  return `
    <div class="cmp-head">
      ${sideCard(me, mb, S.me.preset, '내')}
      <div class="vs">VS</div>
      ${sideCard(foe, fb, S.foe.preset, '상대')}
    </div>
    <div class="verdict ${v.cls}">${v.text}</div>
    <p class="answer-sub">${v.note} 공격 실수치 차이 ${diff}</p>`;
}

function sideCard(mon, b, preset, label) {
  return `<div class="cmp-side">
    <div class="cmp-side-label">${label}</div>
    <img src="images/${encodeURIComponent(mon.img)}" alt="">
    <strong>${esc(mon.ko)}</strong>
    <div class="cmp-atk">${b.atk.toFixed(1)}</div>
    <div class="cmp-meta">${esc(PRESET_LABEL[preset])} · ${b.ivs.join('/')} · Lv${b.level}</div>
  </div>`;
}

function renderSpread(me, foe, mb) {
  const sp = spread(mb.atk, foe);
  const pctOf = n => (n / sp.total * 100).toFixed(1);
  const pct = pctOf(sp.win);
  const fp = presets(foe);

  // 이김·동점·짐 비율을 막대 한 줄로
  const bar = `<div class="wl">` +
    (sp.win ? `<i class="w" style="flex:${sp.win}"></i>` : '') +
    (sp.tie ? `<i class="t" style="flex:${sp.tie}"></i>` : '') +
    (sp.lose ? `<i class="l" style="flex:${sp.lose}"></i>` : '') + `</div>` +
    `<div class="wl-legend">` +
    `<span><i class="w"></i>이김 <b>${pctOf(sp.win)}%</b></span>` +
    (sp.tie ? `<span><i class="t"></i>동점 <b>${pctOf(sp.tie)}%</b></span>` : '') +
    `<span><i class="l"></i>짐 <b>${pctOf(sp.lose)}%</b></span></div>`;

  // 상대 공격 개체값 구간별로 전부 승 / 일부 승 / 전부 패를 한 문장으로
  const span = ivs => {
    const parts = [];
    for (let i = 0; i < ivs.length; i++) {
      let j = i;
      while (j + 1 < ivs.length && ivs[j + 1] === ivs[j] + 1) j++;
      parts.push(j > i ? `${ivs[i]}~${ivs[j]}` : `${ivs[i]}`);
      i = j;
    }
    return `<b>${parts.join(', ')}</b>`;
  };
  const group = kind => sp.perAtkIV.map((s, iv) => [s, iv])
    .filter(([s]) => (kind === 'all' ? s.win === s.total : kind === 'none' ? s.win === 0 : s.win > 0 && s.win < s.total))
    .map(([, iv]) => iv);
  const ga = group('all'), gs = group('some'), gn = group('none');
  const bits = [];
  if (ga.length) bits.push(`${span(ga)}이면 전부 이기고`);
  if (gs.length) bits.push(`${span(gs)}이면 일부만 이기고`);
  if (gn.length) bits.push(`${span(gn)}이면 전부 집니다`);
  const bound = ga.length === 16 ? '상대 공격 개체값이 몇이어도 내가 먼저입니다.'
    : '상대 공격 개체값이 ' + bits.join(' ').replace(/고$/, '고').replace(/고 전부 집니다/, '고 전부 집니다') + '.';

  // 공격 개체값별 — 내가 전부 이기는지 / 일부만인지 / 전부 지는지
  const strip = sp.perAtkIV.map((s, iv) => {
    const cls = s.win === s.total ? 'all' : s.win === 0 ? 'none' : 'some';
    return `<span class="iv-cell ${cls}" title="공격 개체값 ${iv}: ${s.total}개 중 ${s.win}개 승">${iv}</span>`;
  }).join('');

  const rows = [['rank1', '1등 개체'], ['maxAtk', '공격 최대'], ['hundo', '15·15·15']].map(([k, name]) => {
    const b = fp[k];
    const v = verdict(mb.atk, b.atk);
    return `<tr>
      <td>${name}</td>
      <td>${b.ivs.join('/')} · Lv${b.level}</td>
      <td>${b.atk.toFixed(1)}</td>
      <td class="${v.cls}">${v.text}</td>
    </tr>`;
  }).join('');

  return `
    <div class="matchup">
      <div>내 <b>${esc(me.ko)}</b> · ${esc(PRESET_LABEL[S.me.preset])}
        ${mb.ivs.join('/')} · Lv${mb.level} · 공격 <b>${mb.atk.toFixed(1)}</b></div>
      <div>상대 <b>${esc(foe.ko)}</b> · 개체값 전체 ${sp.total}조합과 비교</div>
    </div>

    <div class="answer-label">내가 CMP를 이길 확률</div>
    <div class="answer"><span class="k">${pct}%</span> 내가 먼저</div>
    ${bar}
    <p class="answer-sub">상대 개체값을 모를 때, 가능한 ${sp.total.toLocaleString()}조합 전체와 비교한 값입니다.</p>

    <div class="iv-strip-wrap">
      <div class="iv-strip-label">상대 공격 개체값별</div>
      <div class="iv-strip">${strip}</div>
      <p class="bound">${bound}</p>
      <div class="legend">
        <span><i class="sw all"></i>전부 승</span>
        <span><i class="sw some"></i>일부 승</span>
        <span><i class="sw none"></i>전부 패</span>
      </div>
    </div>

    <table class="cmp-table">
      <thead><tr><th>상대 빌드</th><th>개체값</th><th>공격</th><th>결과</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/* ------------------------------------------------------------------ */

document.querySelectorAll('.cmp-picker').forEach(el => setupSide(el, el.dataset.side));

document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    S.mode = btn.dataset.mode;
    document.querySelectorAll('.mode-btn').forEach(b =>
      b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)));
    document.querySelectorAll('.cmp-picker').forEach(el => paintSide(el, el.dataset.side));
    render();
  });
});

// 기본값: 1위 vs 2위
S.me.mon = byRank(1);
S.foe.mon = byRank(2);
document.querySelectorAll('.cmp-picker').forEach(el => paintSide(el, el.dataset.side));
render();
