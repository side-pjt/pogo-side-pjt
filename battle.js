'use strict';

(function () {
  const C = BattleCore;
  const E = BattleEngine;
  const MOVE = window.MOVES || {};
  const SETS = window.MOVESETS || {};
  const T = window.TYPES || { ko: {} };
  const state = {
    mode: 'single',
    league: BattleCore.LEAGUES[urlGet('league')] ? urlGet('league') : 'great',
    left: makeSide(),
    right: makeSide(),
    result: null,
    matrixResults: null,
    matrixGroups: { left: [], right: [] },
    multiMon: null,
    multiJob: 0,
    sandbox: false,
    timer: null,
  };

  function makeSide() {
    return {
      mon: null, preset: 'rank1', ivs: [0, 15, 15], fast: null, charged: [],
      shields: 1, strategy: 'optimal', bait: true, boosts: { atk: 0, def: 0 }, actions: [],
    };
  }

  const option = (value, label, selected) =>
    `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`;
  const move = id => C.moveFromRow(id, MOVE[id]);
  const moveName = id => MOVE[id] ? MOVE[id][0] : id;
  const typeName = id => T.ko[id] || id;

  function availablePokemon() {
    return DATA.filter(mon => !mon.mega && SETS[mon.id] && SETS[mon.id][0].length && SETS[mon.id][1].length);
  }

  function rankedPokemon() {
    const available = new Map(availablePokemon().map(mon => [mon.id, mon]));
    const ranking = (window.LEAGUE_RANKINGS && window.LEAGUE_RANKINGS[state.league]) || [];
    const ranked = ranking.map(id => available.get(id)).filter(Boolean);
    const included = new Set(ranked.map(mon => mon.id));
    return ranked.concat(availablePokemon().filter(mon => !included.has(mon.id)));
  }

  function defaultMon(rank) {
    return rankedPokemon()[Math.max(0, rank - 1)] || availablePokemon()[0];
  }

  function defaultsFor(mon) {
    const set = SETS[mon.id];
    return {
      fast: set[2] || set[0][0],
      charged: (set[3] || []).concat(set[1]).filter((id, index, all) => id && all.indexOf(id) === index).slice(0, 2),
    };
  }

  function setMon(side, mon) {
    const current = state[side];
    current.mon = mon;
    if (mon) {
      const defaults = defaultsFor(mon);
      current.fast = defaults.fast;
      current.charged = defaults.charged;
      current.preset = state.league === 'master' ? 'hundo' : 'rank1';
    }
    paintSide(side);
    syncUrl();
    runBattle();
  }

  function getBuild(side) {
    const data = state[side];
    if (!data.mon) return null;
    if (data.preset === 'custom') return C.buildFor(data.mon, { league: state.league, ivs: data.ivs });
    return C.presets(data.mon, state.league)[data.preset] || C.presets(data.mon, state.league).rank1;
  }

  function sideInput(side) {
    const data = state[side];
    return {
      mon: data.mon,
      build: getBuild(side),
      fast: move(data.fast),
      charged: data.charged.map(move),
      shields: data.shields,
      strategy: data.strategy,
      bait: data.bait,
      boosts: data.boosts,
      actions: state.sandbox ? data.actions : [],
    };
  }

  function buildConfig() {
    return { left: sideInput('left'), right: sideInput('right'), seed: 1 };
  }

  function paintSide(side) {
    const data = state[side];
    const root = document.querySelector(`.battle-picker[data-side="${side}"]`);
    const chosen = root.querySelector('.chosen');
    const controls = root.querySelector('.battle-options');
    chosen.hidden = !data.mon;
    controls.hidden = !data.mon;
    if (!data.mon) return;

    const mon = data.mon;
    const set = SETS[mon.id];
    const build = getBuild(side);
    const moreOpen = controls.querySelector('.battle-more')?.open;
    if (data.preset !== 'custom') data.ivs = build.ivs.slice();
    chosen.querySelector('.chosen-img').src = `images/${encodeURIComponent(mon.img)}`;
    chosen.querySelector('.chosen-img').alt = `${mon.ko} 이미지`;
    chosen.querySelector('.chosen-name').innerHTML = nameHtml(mon);
    chosen.querySelector('.chosen-rank').textContent =
      `${rankText(mon)} · CP ${build.cp} · ${build.ivs.join('/')}`;

    const fastOptions = set[0].map(id => option(id, moveName(id), data.fast)).join('');
    const chargedOptions = set[1].map(id => option(id, moveName(id), null)).join('');
    controls.innerHTML = `
      <div class="battle-moves">
        <label>일반<select data-field="fast">${fastOptions}</select></label>
        <label>스페셜<select data-field="charged0">${chargedOptions.replace(`value="${data.charged[0]}"`, `value="${data.charged[0]}" selected`)}</select></label>
        <label>스페셜<select data-field="charged1">${chargedOptions.replace(`value="${data.charged[1]}"`, `value="${data.charged[1]}" selected`)}</select></label>
        <label>실드<select data-field="shields">${[0, 1, 2].map(n => option(String(n), `${n}개`, String(data.shields))).join('')}</select></label>
      </div>
      <details class="battle-more"${moreOpen ? ' open' : ''}>
        <summary>개체값 · 전략</summary>
        <div class="preset-row">
          ${['rank1', 'maxAtk', 'hundo'].map(key => `<button type="button" class="chip battle-preset" data-value="${key}" aria-pressed="${data.preset === key}">${{ rank1: '1등', maxAtk: '공격↑', hundo: '15·15·15' }[key]}</button>`).join('')}
          <button type="button" class="chip battle-preset" data-value="custom" aria-pressed="${data.preset === 'custom'}">직접</button>
        </div>
        <div class="iv-row battle-ivs">
          ${['공격', '방어', 'HP'].map((label, i) => `<label>${label}<input type="number" class="battle-iv" data-index="${i}" min="0" max="15" value="${data.ivs[i]}"></label>`).join('')}
        </div>
        <p class="battle-build">Lv${build.level} · 공격 ${build.atk.toFixed(1)} · 방어 ${build.def.toFixed(1)} · HP ${build.hp}</p>
        <div class="battle-inline">
          <label>전략<select data-field="strategy">${option('optimal', '효율 우선', data.strategy)}${option('nuke', '강한 기술', data.strategy)}${option('farm', '에너지 모으기', data.strategy)}</select></label>
          <label><input type="checkbox" data-field="bait"${data.bait ? ' checked' : ''}> 베이팅</label>
          ${side === 'left' ? `<label><input type="checkbox" data-field="sandbox"${state.sandbox ? ' checked' : ''}> 샌드박스</label>` : ''}
        </div>
        <div class="battle-inline">
          <label>공격 단계<input type="number" data-field="atkBoost" min="-4" max="4" value="${data.boosts.atk}"></label>
          <label>방어 단계<input type="number" data-field="defBoost" min="-4" max="4" value="${data.boosts.def}"></label>
        </div>
        <label class="sandbox-actions">행동 순서<textarea data-field="actions" rows="2" placeholder="fast, 기술ID, fast">${data.actions.join(', ')}</textarea></label>
      </details>`;
  }

  function setupSides() {
    document.querySelectorAll('.battle-picker').forEach(root => {
      const side = root.dataset.side;
      setupSearch(root, mon => setMon(side, mon));
      root.querySelector('.clear').addEventListener('click', () => setMon(side, null));
      root.addEventListener('click', event => {
        const button = event.target.closest('.battle-preset');
        if (!button) return;
        state[side].preset = button.dataset.value;
        if (button.dataset.value !== 'custom') state[side].ivs = C.presets(state[side].mon, state.league)[button.dataset.value].ivs.slice();
        paintSide(side);
        syncUrl();
        runBattle();
      });
      root.addEventListener('input', event => updateControl(side, event.target));
      root.addEventListener('change', event => updateControl(side, event.target));
    });
  }

  function updateControl(side, target) {
    const data = state[side];
    const field = target.dataset.field;
    if (target.classList.contains('battle-iv')) {
      data.ivs[Number(target.dataset.index)] = Math.max(0, Math.min(15, Number(target.value) || 0));
      data.preset = 'custom';
      paintSide(side);
    } else if (field === 'fast') data.fast = target.value;
    else if (field === 'charged0') data.charged[0] = target.value;
    else if (field === 'charged1') data.charged[1] = target.value;
    else if (field === 'shields') data.shields = Number(target.value);
    else if (field === 'strategy') data.strategy = target.value;
    else if (field === 'bait') data.bait = target.checked;
    else if (field === 'atkBoost') data.boosts.atk = Number(target.value);
    else if (field === 'defBoost') data.boosts.def = Number(target.value);
    else if (field === 'actions') data.actions = target.value.split(',').map(x => x.trim()).filter(Boolean);
    else if (field === 'sandbox') {
      state.sandbox = target.checked;
      document.querySelectorAll('.battle-more').forEach(details => { details.open = state.sandbox; });
    }
    syncUrl();
    runBattle();
  }

  function syncUrl() {
    urlSet('league', state.league === 'great' ? null : state.league);
    for (const side of ['left', 'right']) {
      const data = state[side];
      urlSet(side, data.mon && data.mon.id);
      urlSet(`${side}m`, data.mon ? [data.fast].concat(data.charged).join('.') : null);
      urlSet(`${side}s`, data.mon ? data.shields : null);
      urlSet(`${side}iv`, data.mon && data.preset === 'custom' ? data.ivs.join('.') : null);
    }
  }

  function restoreSide(side, fallback) {
    const id = urlGet(side);
    const mon = DATA.find(item => item.id === id) || fallback;
    state[side].mon = mon;
    const defaults = defaultsFor(mon);
    const ids = (urlGet(`${side}m`) || '').split('.');
    state[side].fast = SETS[mon.id][0].includes(ids[0]) ? ids[0] : defaults.fast;
    state[side].charged = [ids[1], ids[2]].map((id, i) => SETS[mon.id][1].includes(id) ? id : defaults.charged[i]).filter(Boolean);
    state[side].shields = Math.max(0, Math.min(2, Number(urlGet(`${side}s`) ?? 1)));
    const ivs = (urlGet(`${side}iv`) || '').split('.').map(Number);
    if (ivs.length === 3 && ivs.every(n => n >= 0 && n <= 15)) {
      state[side].ivs = ivs;
      state[side].preset = 'custom';
    } else state[side].preset = state.league === 'master' ? 'hundo' : 'rank1';
  }

  function runBattle(config = buildConfig()) {
    if (!config.left.mon || !config.right.mon) {
      document.getElementById('battle-result').innerHTML = '<p class="placeholder">양쪽 포켓몬을 고르면 결과가 나옵니다.</p>';
      document.getElementById('battle-timeline-panel').hidden = true;
      document.getElementById('shield-panel').hidden = true;
      document.getElementById('battle-analysis').hidden = true;
      return;
    }
    state.result = E.simulate(config);
    renderBattle(state.result);
    renderTimeline(state.result);
    renderShieldMatrix(config);
    renderAnalysis(config, state.result);
  }

  function fighterCard(side, result, label) {
    const data = state[side];
    const pct = Math.round(result.hp / result.maxHp * 100);
    return `<div class="battle-fighter">
      <span>${label}</span><img src="images/${encodeURIComponent(data.mon.img)}" alt="">
      <strong>${esc(data.mon.ko)}</strong>
      <div class="hp"><i style="width:${pct}%"></i></div>
      <small>HP ${result.hp}/${result.maxHp} · 에너지 ${result.energy} · 실드 ${result.shields}</small>
    </div>`;
  }

  function renderBattle(result) {
    const winnerText = result.winner === 'draw' ? '무승부' :
      `${esc(state[result.winner].mon.ko)} 승리`;
    document.getElementById('battle-result').innerHTML = `
      <div class="battle-summary">
        ${fighterCard('left', result.left, '내 포켓몬')}
        <div class="battle-verdict"><b>${winnerText}</b><span>레이팅 ${result.rating}</span><small>${result.turns}턴 · ${result.seconds.toFixed(1)}초${result.timedOut ? ' · 제한시간 종료' : ''}</small></div>
        ${fighterCard('right', result.right, '상대 포켓몬')}
      </div>`;
  }

  function renderTimeline(result) {
    const panel = document.getElementById('battle-timeline-panel');
    panel.hidden = false;
    const host = document.getElementById('battle-timeline');
    host.innerHTML = result.log.map((event, index) => `
      <button type="button" class="timeline-event side-${event.side} kind-${event.kind}" data-index="${index}" title="${esc(event.moveName || event.kind)}">
        <span>${event.turn}T</span><b>${event.kind === 'fast' ? '●' : event.kind === 'charged' ? '◆' : '±'}</b><small>${esc(event.moveName || '능력 변화')}${event.shielded ? ' · 실드' : ''}</small>
      </button>`).join('');
    document.getElementById('timeline-clock').textContent = `전체 ${result.seconds.toFixed(1)}초`;
  }

  function renderShieldMatrix(config) {
    const panel = document.getElementById('shield-panel');
    panel.hidden = false;
    const matrix = E.shieldMatrix(config);
    const rows = matrix.map((row, mine) => `<tr><th>${mine}</th>${row.map((result, foe) => {
      const cls = result.winner === 'left' ? 'win' : result.winner === 'right' ? 'loss' : 'draw';
      return `<td><button type="button" class="${cls}" data-mine="${mine}" data-foe="${foe}"><b>${result.rating}</b><small>${result.winner === 'left' ? '승' : result.winner === 'right' ? '패' : '무'}</small></button></td>`;
    }).join('')}</tr>`).join('');
    document.getElementById('shield-matrix').innerHTML =
      `<thead><tr><th>내＼상대</th><th>0</th><th>1</th><th>2</th></tr></thead><tbody>${rows}</tbody>`;
  }

  function breakpoint(config) {
    const left = config.left;
    const right = config.right;
    const baseDamage = C.damage({
      types: left.mon.types, shadow: left.mon.shadow, stats: left.build, boosts: left.boosts,
    }, {
      types: right.mon.types, shadow: right.mon.shadow, stats: right.build, boosts: right.boosts,
    }, left.fast);
    const candidates = C.allBuilds(left.mon, state.league).slice().sort((a, b) => a.atk - b.atk);
    const next = candidates.find(build => C.damage({
      types: left.mon.types, shadow: left.mon.shadow, stats: build, boosts: left.boosts,
    }, {
      types: right.mon.types, shadow: right.mon.shadow, stats: right.build, boosts: right.boosts,
    }, left.fast) > baseDamage);
    return { baseDamage, next };
  }

  function bulkpoint(config) {
    const attacker = config.right;
    const defender = config.left;
    const baseDamage = C.damage({
      types: attacker.mon.types, shadow: attacker.mon.shadow, stats: attacker.build, boosts: attacker.boosts,
    }, {
      types: defender.mon.types, shadow: defender.mon.shadow, stats: defender.build, boosts: defender.boosts,
    }, attacker.fast);
    const candidates = C.allBuilds(defender.mon, state.league).slice().sort((a, b) => a.def - b.def);
    const next = candidates.find(build => C.damage({
      types: attacker.mon.types, shadow: attacker.mon.shadow, stats: attacker.build, boosts: attacker.boosts,
    }, {
      types: defender.mon.types, shadow: defender.mon.shadow, stats: build, boosts: defender.boosts,
    }, attacker.fast) < baseDamage);
    return { baseDamage, next };
  }

  function cctCounts(myTurns, foeTurns) {
    if (foeTurns === 1) return '상대가 1턴 기술이라 언제든 동일';
    const target = foeTurns - 1;
    const hits = [];
    for (let count = 1; count <= 20 && hits.length < 4; count++)
      if ((count * myTurns) % foeTurns === target) hits.push(count);
    if (hits.length) return `일반기 ${hits.join('·')}회 뒤 차징`;
    let best = 0;
    for (let count = 1; count <= 20; count++) best = Math.max(best, (count * myTurns) % foeTurns);
    return `완전 정렬 불가 · 최소 ${target - best}턴 손해`;
  }

  function renderAnalysis(config, result) {
    const box = document.getElementById('battle-analysis');
    box.hidden = false;
    const bp = breakpoint(config);
    const bulk = bulkpoint(config);
    const leftCharged = result.log.filter(event => event.side === 'left' && event.kind === 'charged');
    const timings = leftCharged.length ? leftCharged.map(event => `${event.moveName} ${event.turn}턴`).join(' · ') : '스페셜어택 사용 없음';
    const cmp = Math.abs(config.left.build.atk - config.right.build.atk) < 1e-9 ? '동점' :
      config.left.build.atk > config.right.build.atk ? '내 포켓몬 우선' : '상대 포켓몬 우선';
    box.innerHTML = `<h2>고급 분석</h2>
      <div class="battle-analysis-grid">
        <div><span>일반기 피해</span><b>${bp.baseDamage}</b><small>${bp.next ? `다음 브레이크포인트 공격 ${bp.next.atk.toFixed(2)} · ${bp.next.ivs.join('/')}` : '현재 리그에서 다음 구간 없음'}</small></div>
        <div><span>받는 일반기 피해</span><b>${bulk.baseDamage}</b><small>${bulk.next ? `다음 벌크포인트 방어 ${bulk.next.def.toFixed(2)} · ${bulk.next.ivs.join('/')}` : '현재 리그에서 다음 구간 없음'}</small></div>
        <div><span>CMP</span><b>${cmp}</b><small>${config.left.build.atk.toFixed(2)} vs ${config.right.build.atk.toFixed(2)}</small></div>
        <div><span>최적 CCT</span><b>${cctCounts(config.left.fast.turns, config.right.fast.turns)}</b><small>${esc(timings)}</small></div>
      </div>
      <p class="note">브레이크포인트와 벌크포인트는 현재 기술·상대 빌드·능력치 단계에서 일반기 피해가 1 변하는 최소 후보입니다.</p>`;
  }

  function timelinePlayback() {
    clearInterval(state.timer);
    const events = [...document.querySelectorAll('.timeline-event')];
    events.forEach(event => event.classList.add('future'));
    let index = 0;
    const delay = Number(document.getElementById('timeline-speed').value);
    state.timer = setInterval(() => {
      if (index >= events.length) {
        clearInterval(state.timer);
        document.getElementById('timeline-play').textContent = '재생';
        return;
      }
      events[index].classList.remove('future');
      document.getElementById('timeline-clock').textContent = `${state.result.log[index].time.toFixed(1)}초`;
      index++;
    }, delay);
    document.getElementById('timeline-play').textContent = '처음부터 재생 중';
  }

  function defaultInput(mon, shields = 1) {
    const defaults = defaultsFor(mon);
    const preset = state.league === 'master' ? 'hundo' : 'rank1';
    return {
      mon,
      build: C.presets(mon, state.league)[preset],
      fast: move(defaults.fast),
      charged: defaults.charged.map(move),
      shields,
      boosts: { atk: 0, def: 0 },
      strategy: 'optimal',
      bait: true,
    };
  }

  function paintMultiMon() {
    const root = document.querySelector('.multi-picker');
    const chosen = root.querySelector('.chosen');
    const mon = state.multiMon;
    chosen.hidden = !mon;
    if (!mon) return;
    chosen.querySelector('.chosen-img').src = `images/${encodeURIComponent(mon.img)}`;
    chosen.querySelector('.chosen-img').alt = `${mon.ko} 이미지`;
    chosen.querySelector('.chosen-name').innerHTML = nameHtml(mon);
    chosen.querySelector('.chosen-rank').textContent = rankText(mon);
  }

  function setupMulti() {
    const root = document.querySelector('.multi-picker');
    setupSearch(root, mon => { state.multiMon = mon; paintMultiMon(); runMulti(); });
    root.querySelector('.clear').addEventListener('click', () => {
      state.multiMon = null;
      paintMultiMon();
      runMulti();
    });
    document.getElementById('multi-size').addEventListener('change', runMulti);
    state.multiMon = rankedPokemon()[0] || null;
    paintMultiMon();
  }

  function runMulti() {
    const job = ++state.multiJob;
    const mine = state.multiMon;
    const box = document.getElementById('multi-result');
    const progress = document.getElementById('multi-progress');
    if (!mine) {
      progress.hidden = true;
      box.innerHTML = '<p class="placeholder">포켓몬을 고르면 상위 메타와 비교합니다.</p>';
      return;
    }
    const opponents = rankedPokemon().filter(mon => mon.id !== mine.id).slice(0, Number(document.getElementById('multi-size').value));
    const results = [];
    progress.hidden = false;
    progress.max = opponents.length;
    progress.value = 0;
    let index = 0;
    function chunk() {
      if (job !== state.multiJob) return;
      const stop = Math.min(index + 8, opponents.length);
      for (; index < stop; index++) {
        const foe = opponents[index];
        results.push({ foe, result: E.simulate({ left: defaultInput(mine), right: defaultInput(foe), seed: 1 }) });
      }
      progress.value = index;
      if (index >= opponents.length) {
        progress.hidden = true;
        renderMulti(mine, results);
      } else setTimeout(chunk, 0);
    }
    chunk();
  }

  function renderMulti(mine, rows) {
    const wins = rows.filter(row => row.result.winner === 'left').length;
    const losses = rows.filter(row => row.result.winner === 'right').length;
    const draws = rows.length - wins - losses;
    document.getElementById('multi-result').innerHTML = `
      <div class="multi-summary"><h3>${esc(mine.ko)} · ${rows.length}전</h3><div class="multi-bars"><i class="win" style="flex:${wins}"></i><i class="draw" style="flex:${draws}"></i><i class="loss" style="flex:${losses}"></i></div><p>승 ${wins} · 무 ${draws} · 패 ${losses}</p></div>
      <ol class="multi-list">
      ${rows.sort((a, b) => b.result.rating - a.result.rating).map(row => {
        const cls = row.result.winner === 'left' ? 'win' : row.result.winner === 'right' ? 'loss' : 'draw';
        const label = cls === 'win' ? '승' : cls === 'loss' ? '패' : '무';
        return `<li class="${cls}">
          <img src="images/${encodeURIComponent(row.foe.img)}" alt="" loading="lazy">
          <span class="multi-name">${esc(row.foe.ko)}</span>
          <span class="multi-rate" style="--p:${Math.max(0, Math.min(100, row.result.rating / 10))}%"><i></i><b>${row.result.rating}</b></span>
          <span class="multi-res">${label}</span>
        </li>`;
      }).join('')}
      </ol>`;
  }

  function paintMatrixGroup(group) {
    const root = document.querySelector(`.matrix-builder[data-group="${group}"]`);
    const mons = state.matrixGroups[group];
    root.querySelector('.matrix-count').textContent = `${mons.length} / 12`;
    root.querySelector('.matrix-selected').innerHTML = mons.length
      ? mons.map(mon => `<div class="matrix-mon">
          <img src="images/${encodeURIComponent(mon.img)}" alt="">
          <span><b>${esc(mon.ko)}</b><small>${esc(mon.en)}</small></span>
          <button type="button" data-id="${esc(mon.id)}" aria-label="${esc(mon.ko)} 그룹에서 제거">✕</button>
        </div>`).join('')
      : '<p class="matrix-empty">검색해서 포켓몬을 추가하세요.</p>';
  }

  function addMatrixMon(group, mon) {
    const mons = state.matrixGroups[group];
    if (mons.length >= 12 || mons.some(item => item.id === mon.id) || !SETS[mon.id]) return;
    mons.push(mon);
    paintMatrixGroup(group);
  }

  function setupMatrix() {
    document.querySelectorAll('.matrix-builder').forEach(root => {
      const group = root.dataset.group;
      setupSearch(root, mon => addMatrixMon(group, mon));
      root.querySelector('.matrix-selected').addEventListener('click', event => {
        const button = event.target.closest('button[data-id]');
        if (!button) return;
        state.matrixGroups[group] = state.matrixGroups[group].filter(mon => mon.id !== button.dataset.id);
        paintMatrixGroup(group);
      });
      paintMatrixGroup(group);
    });
    document.getElementById('matrix-fill').addEventListener('click', () => {
      const mons = rankedPokemon().slice(0, 12);
      state.matrixGroups.left = mons.slice(0, 6);
      state.matrixGroups.right = mons.slice(6, 12);
      paintMatrixGroup('left');
      paintMatrixGroup('right');
    });
    document.getElementById('matrix-run').addEventListener('click', runMatrix);
    document.getElementById('matrix-export').addEventListener('click', exportMatrix);
  }

  function runMatrix() {
    const left = state.matrixGroups.left;
    const right = state.matrixGroups.right;
    if (!left.length || !right.length) {
      document.getElementById('matrix-result').innerHTML = '<p class="placeholder">양쪽 그룹에 인식할 수 있는 포켓몬을 입력하세요.</p>';
      return;
    }
    const results = left.map(mine => right.map(foe => E.simulate({ left: defaultInput(mine), right: defaultInput(foe), seed: 1 })));
    state.matrixResults = { left, right, results };
    document.getElementById('matrix-result').innerHTML = `<div class="table-scroll"><table class="matrix-table"><thead><tr><th>내＼상대</th>${right.map(mon => `<th>${esc(mon.ko)}</th>`).join('')}<th>평균</th></tr></thead><tbody>
      ${left.map((mon, i) => {
        const average = Math.round(results[i].reduce((sum, result) => sum + result.rating, 0) / results[i].length);
        return `<tr><th>${esc(mon.ko)}</th>${results[i].map(result => `<td class="${result.rating >= 500 ? 'win' : 'loss'}">${result.rating}</td>`).join('')}<td><b>${average}</b></td></tr>`;
      }).join('')}</tbody></table></div>`;
  }

  function exportMatrix() {
    if (!state.matrixResults) return;
    const data = state.matrixResults;
    const lines = [['내 포켓몬', ...data.right.map(mon => mon.ko)].join(',')];
    data.left.forEach((mon, i) => lines.push([mon.ko, ...data.results[i].map(result => result.rating)].join(',')));
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `battle-matrix-${state.league}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function setMode(mode) {
    state.mode = mode;
    document.querySelectorAll('.battle-tab').forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.mode === mode)));
    document.querySelectorAll('.battle-pane').forEach(pane => { pane.hidden = pane.id !== `mode-${mode}`; });
    document.getElementById('battle-mode-help').textContent = {
      single: '두 포켓몬의 기술·실드·개체값을 직접 정해 1대1 결과를 봅니다.',
      multi: '내 포켓몬 한 마리를 현재 리그 상위 포켓몬들과 자동으로 대결시킵니다.',
      matrix: '내 그룹과 상대 그룹을 만들고 가능한 모든 1대1 조합을 표로 비교합니다.',
    }[mode];
    try { history.replaceState(null, '', location.pathname + location.search + (mode === 'single' ? '' : `#${mode}`)); } catch (error) { /* file:// */ }
    if (mode === 'multi') runMulti();
  }

  setupSides();
  restoreSide('left', defaultMon(1));
  restoreSide('right', defaultMon(2));
  document.getElementById('battle-league').value = state.league;
  paintSide('left');
  paintSide('right');
  setupMulti();
  setupMatrix();

  document.getElementById('timeline-play').addEventListener('click', timelinePlayback);
  document.getElementById('shield-matrix').addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    const config = buildConfig();
    config.left.shields = Number(button.dataset.mine);
    config.right.shields = Number(button.dataset.foe);
    runBattle(config);
  });
  document.getElementById('battle-league').addEventListener('change', event => {
    state.league = event.target.value;
    for (const side of ['left', 'right']) {
      state[side].preset = state.league === 'master' ? 'hundo' : 'rank1';
      paintSide(side);
    }
    syncUrl();
    if (state.mode === 'multi') runMulti();
    else runBattle();
  });
  document.querySelectorAll('.battle-tab').forEach(tab => tab.addEventListener('click', () => setMode(tab.dataset.mode)));
  setMode(['multi', 'matrix'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'single');
  runBattle();
})();
