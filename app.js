'use strict';

/* ------------------------------------------------------------------
   CCT 계산
   내 일반기술 k회 직후에 차징을 누른다. 그때까지 흐른 턴은 k × m.
   상대 기술이 끝나기 직전(= o로 나눈 나머지가 o-1)에 눌러야 공짜 턴이 없다.

       k × m  ≡  o - 1   (mod o)

   gcd(m, o)가 o-1을 나누지 못하면 해가 없다. 그때는 도달 가능한
   가장 큰 나머지를 쓰고, 모자란 만큼이 손해 턴이 된다.
   참고 치트시트의 5×5 = 25칸 전부와 대조해 검증한 식이다.
------------------------------------------------------------------ */

function gcd(a, b) { return b ? gcd(b, a % b) : a; }

function cct(myTurns, foeTurns, count) {
  const m = myTurns, o = foeTurns;
  if (!m || !o) return null;

  // 상대 기술이 매 턴 끝나므로 언제 눌러도 차이가 없다
  if (o === 1) return { kind: 'free' };

  const g = gcd(m, o);
  const want = o - 1;
  const target = want - (want % g);        // 해가 없으면 도달 가능한 최대 나머지
  const loss = want - target;

  const ks = [];
  for (let k = 1; ks.length < (count || 4) && k <= o * (count || 4) + o; k++) {
    if ((k * m) % o === target) ks.push(k);
  }
  if (!ks.length) return { kind: 'blocked' };

  // 모든 k가 동일하게 걸리면(연속) 사실상 '아무 때나'
  const everyK = ks.length > 1 && ks.every((k, i) => i === 0 || k - ks[i - 1] === 1);
  return { kind: 'hit', ks, loss, everyK, period: o / g };
}

/* 표 한 칸에 들어갈 문구 */
function cellText(m, o) {
  if (o === 1) return { cls: 'free', main: '자유', sub: m === 1 ? '매번 가능' : '이득 없음' };
  if (m === o) return { cls: 'blocked', main: '정렬상 불가', sub: '필요할 때' };

  const r = cct(m, o, 4);
  if (!r || r.kind === 'blocked') return { cls: 'blocked', main: '정렬상 불가', sub: '필요할 때' };
  if (r.everyK) return { cls: 'blocked', main: '매번 동일', sub: `최선 · ${r.loss}턴 손해` };
  return {
    cls: '',
    main: r.ks.join('·') + '…',
    sub: r.loss ? `최선 · ${r.loss}턴 손해` : '',
  };
}

/* ------------------------------------------------------------------
   상태
------------------------------------------------------------------ */

const state = {
  me: { mon: null, move: null, turns: null },
  foe: { mon: null, move: null, turns: null },
};

/* 턴 버튼 표시를 state에 맞춘다 */
function syncSeg(root, turns) {
  root.querySelectorAll('.turn-seg button').forEach(b =>
    b.setAttribute('aria-pressed', String(Number(b.dataset.turns) === turns)));
}



/* ------------------------------------------------------------------
   포켓몬 선택 UI
------------------------------------------------------------------ */

function setupPicker(root, side, initial) {
  const chosen = root.querySelector('.chosen');
  const movesBox = root.querySelector('.moves');
  const chips = root.querySelector('.move-chips');

  // 포켓몬을 몰라도 턴 수만 눌러서 계산할 수 있다. 고른 기술과 턴이 다르면 기술 선택은 푼다.
  root.querySelectorAll('.turn-seg button').forEach(b => {
    b.addEventListener('click', () => {
      const n = Number(b.dataset.turns);
      state[side].turns = n;
      if (state[side].move && state[side].move.turns !== n) state[side].move = null;
      [...chips.children].forEach((c, i) => {
        const mon = state[side].mon;
        c.setAttribute('aria-pressed', String(!!mon && mon.fast[i] === state[side].move));
      });
      syncSeg(root, n);
      render();
    });
  });

  function pick(p) {
    state[side].mon = p;
    state[side].move = p.fast[0];
    state[side].turns = p.fast[0].turns;
    syncSeg(root, state[side].turns);

    chosen.hidden = false;
    chosen.querySelector('.chosen-img').src = 'images/' + encodeURIComponent(p.img);
    chosen.querySelector('.chosen-name').textContent = p.ko;
    chosen.querySelector('.chosen-rank').textContent = `${rankText(p)} · ${p.types.join(' / ')}`;

    chips.innerHTML = '';
    p.fast.forEach(f => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.setAttribute('aria-pressed', String(f === state[side].move));
      b.innerHTML = `<span class="mv"></span><span class="turns">${f.turns}턴</span>`;
      b.querySelector('.mv').textContent = f.name;
      b.addEventListener('click', () => {
        state[side].move = f;
        state[side].turns = f.turns;
        syncSeg(root, f.turns);
        [...chips.children].forEach((c, i) =>
          c.setAttribute('aria-pressed', String(p.fast[i] === f)));
        render();
      });
      chips.append(b);
    });
    movesBox.hidden = false;
    render();
  }

  setupSearch(root, pick);

  root.querySelector('.clear').addEventListener('click', () => {
    state[side].mon = null;
    state[side].move = null;   // 턴 수는 남겨 둬서 계속 계산할 수 있다
    chosen.hidden = true;
    movesBox.hidden = true;
    render();
  });

  if (initial) pick(initial);
}

/* ------------------------------------------------------------------
   결과
------------------------------------------------------------------ */

function render() {
  const box = document.getElementById('result');
  const { me, foe } = state;

  if (!me.turns || !foe.turns) {
    box.innerHTML = '<p class="placeholder">양쪽 일반기술 턴 수를 고르거나 포켓몬을 고르면 차징 타이밍이 나옵니다.</p>';
    highlightCell(null, null);
    return;
  }

  const m = me.turns, o = foe.turns;
  const r = cct(m, o, 4);

  const who = (s, label) => {
    const name = s.mon && s.move
      ? `${label} <b>${esc(s.mon.ko)}</b> · ${esc(s.move.name)} `
      : s.mon ? `${label} <b>${esc(s.mon.ko)}</b> · 일반기술 ` : `${label} 일반기술 `;
    return `<div>${name}<b>${s.turns}턴</b> (${(s.turns * 0.5).toFixed(1)}초)</div>`;
  };
  const head = `<div class="matchup">${who(me, '내')}${who(foe, '상대')}</div>`;

  let body;
  if (r.kind === 'free') {
    body = `<div class="verdict free">아무 때나 눌러도 됩니다</div>` +
      `<p class="answer-sub">상대 기술이 매 턴 끝나므로 CCT 이득이 없습니다. 에너지와 CMP를 우선하세요.</p>`;
  } else if (m === o || r.kind === 'blocked') {
    body = `<div class="verdict blocked">정렬이 불가능한 조합</div>` +
      `<p class="answer-sub">서로 턴이 같아 완벽한 CCT가 나오지 않습니다. 필요할 때 누르고 에너지·CMP를 우선하세요.</p>`;
  } else if (r.everyK) {
    body = `<div class="verdict blocked">언제 눌러도 동일</div>` +
      `<p class="answer-sub">이 조합은 최선이어도 ${r.loss}턴을 내줍니다.</p>`;
  } else {
    body =
      `<div class="answer"><span class="k">${r.ks.join(' · ')}</span>번째 직후 차징</div>` +
      `<p class="answer-sub">` +
      `내 일반기술을 ${r.ks[0]}번 쓴 직후가 첫 타이밍, 이후 ${r.period}번마다 반복` +
      (r.loss ? ` · 최선이어도 ${r.loss}턴 손해` : ' · 공짜 턴 없음') +
      `</p>` + timeline(m, o, r.ks);
  }

  box.innerHTML = head + body +
    `<p class="answer-sub">※ 차징기를 쓰거나 포켓몬이 바뀌면 카운트는 0부터 다시 셉니다.</p>`;

  highlightCell(m, o);
}

/* 두 기술을 같은 시간축(1칸 = 1턴 = 0.5초)에 겹쳐 그린다.
   노란 칸 = 내 기술 k번째가 끝나는 턴, 여기서 차징을 입력한다. */
function timeline(m, o, ks) {
  const n = Math.min(Math.max(12, ks[0] * m + o), 30);
  const hit = new Set(ks.map(k => k * m).filter(t => t <= n));

  const track = (len, cls, mark) => {
    let h = `<div class="trk ${cls}" style="--n:${n}">`;
    for (let i = 1; i <= n; i++) {
      const alt = Math.floor((i - 1) / len) % 2 ? 'alt' : '';
      const on = hit.has(i) ? ' hit' : '';
      h += `<i class="${alt}${on}">${mark && hit.has(i) ? '●' : ((i - 1) % len) + 1}</i>`;
    }
    return h + '</div>';
  };
  let axis = `<div class="axis" style="--n:${n}">`;
  for (let i = 1; i <= n; i++) axis += `<span>${i % 2 === 0 ? i / 2 : ''}</span>`;
  axis += '</div>';

  return `<div class="tl" style="--n:${n}">` +
    `<div class="tl-row"><span class="tl-name">상대</span>${track(o, 'foe', false)}</div>` +
    `<div class="tl-row"><span class="tl-name">나</span>${track(m, 'me', true)}</div>` +
    `<div class="tl-row"><span class="tl-name">초</span>${axis}</div>` +
    `<p class="tl-note">노란 칸이 끝나는 순간 차징을 입력합니다. 칸 하나는 1턴(0.5초)입니다.</p>` +
    `</div>`;
}


/* ------------------------------------------------------------------
   5×5 표
------------------------------------------------------------------ */

function buildTable() {
  const t = document.getElementById('cct-table');
  const turns = [1, 2, 3, 4, 5];

  let html = '<thead><tr><th>내 턴 ↓ / 상대 턴 →</th>';
  turns.forEach(o => { html += `<th data-o="${o}">${o}턴</th>`; });
  html += '</tr></thead><tbody>';

  turns.forEach(m => {
    html += `<tr><th data-m="${m}">내 ${m}턴 기술</th>`;
    turns.forEach(o => {
      const c = cellText(m, o);
      html += `<td class="${c.cls}" data-m="${m}" data-o="${o}">${c.main}` +
        (c.sub ? `<small>${c.sub}</small>` : '') + '</td>';
    });
    html += '</tr>';
  });

  t.innerHTML = html + '</tbody>';
}

function highlightCell(m, o) {
  document.querySelectorAll('#cct-table .on, #cct-table .hl').forEach(el => el.classList.remove('on', 'hl'));
  if (!m || !o) return;
  document.querySelectorAll(`#cct-table [data-m="${m}"], #cct-table [data-o="${o}"]`)
    .forEach(el => el.classList.add('hl'));
  const td = document.querySelector(`#cct-table td[data-m="${m}"][data-o="${o}"]`);
  if (td) td.classList.add('on');
}

/* ------------------------------------------------------------------
   턴 그룹별 일반기술 (상위 100위에서 실제로 쓰이는 것)
------------------------------------------------------------------ */

function buildGroups() {
  const seen = new Map();
  DATA.filter(p => !p.mega && p.rank <= 100).forEach(p => {
    const f = p.fast[0];
    if (f && !seen.has(f.name)) seen.set(f.name, f.turns);
  });

  const byTurns = new Map();
  for (const [name, turns] of seen) {
    if (!byTurns.has(turns)) byTurns.set(turns, []);
    byTurns.get(turns).push(name);
  }

  const host = document.getElementById('groups');
  host.innerHTML = '';
  [...byTurns.keys()].sort((a, b) => a - b).forEach(turns => {
    const names = byTurns.get(turns).sort((a, b) => a.localeCompare(b, 'ko'));
    const div = document.createElement('div');
    div.className = 'group';
    div.dataset.turns = turns;
    div.innerHTML = `<h3>${turns}턴 · ${(turns * 0.5).toFixed(1)}초</h3><ul></ul>`;
    const ul = div.querySelector('ul');
    names.forEach(n => {
      const li = document.createElement('li');
      li.textContent = n;
      ul.append(li);
    });
    host.append(div);
  });
}

/* ------------------------------------------------------------------ */

// 기본값: 내 포켓몬 = 1위, 상대 = 2위 (열자마자 결과가 보이도록)
document.querySelectorAll('.picker').forEach(el =>
  setupPicker(el, el.dataset.side, byRank(el.dataset.side === 'me' ? 1 : 2)));
buildTable();
buildGroups();
render();
