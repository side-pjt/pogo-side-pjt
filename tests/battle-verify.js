'use strict';

/* Deep verification of the 1v1 engine: math, invariants, edges, PvPoke-facing gaps. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = { console };
context.window = context;
context.globalThis = context;
vm.createContext(context);
for (const file of ['data/data.js', 'data/moves.js', 'data/formats/great.js', 'battle-core.js', 'battle-engine.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}

const C = context.BattleCore;
const E = context.BattleEngine;
const POKEMON = context.POKEMON;
const MOVES = context.MOVES;
const SETS = context.MOVESETS;
const RANK = (context.FORMAT_DATA && context.FORMAT_DATA.great && context.FORMAT_DATA.great.ranking) || [];
const mon = id => POKEMON.find(p => p.id === id);
const move = id => C.moveFromRow(id, MOVES[id]);

const findings = [];
const note = (level, msg) => findings.push({ level, msg });
const fail = (msg) => { note('fail', msg); throw new Error(msg); };

function fighter(id, fast, charged, shields = 1, extra = {}) {
  const pokemon = mon(id);
  if (!pokemon) throw new Error('missing pokemon ' + id);
  const ivs = extra.ivs || C.presets(pokemon, 'great').rank1.ivs;
  return {
    mon: pokemon,
    build: C.buildFor(pokemon, { league: 'great', ivs, level: extra.level }),
    fast: fast ? move(fast) : null,
    charged: (charged || []).map(move).filter(Boolean),
    shields,
    strategy: extra.strategy || 'optimal',
    bait: extra.bait !== false,
    energy: extra.energy || 0,
    boosts: extra.boosts || { atk: 0, def: 0 },
    actions: extra.actions || [],
    shadow: extra.shadow,
  };
}

function defaultsFor(pokemon) {
  const set = SETS[pokemon.id];
  if (!set) return null;
  return {
    fast: set[2] || set[0][0],
    charged: (set[3] || []).concat(set[1]).filter((id, i, all) => id && all.indexOf(id) === i).slice(0, 2),
  };
}

function topMons(n) {
  const available = POKEMON.filter(p => !p.mega && SETS[p.id] && SETS[p.id][0].length && SETS[p.id][1].length);
  const byId = new Map(available.map(p => [p.id, p]));
  const ranked = RANK.map(id => byId.get(id)).filter(Boolean);
  const seen = new Set(ranked.map(p => p.id));
  return ranked.concat(available.filter(p => !seen.has(p.id))).slice(0, n);
}

function sideFromMon(pokemon, shields) {
  const d = defaultsFor(pokemon);
  return fighter(pokemon.id, d.fast, d.charged, shields, {
    ivs: C.presets(pokemon, 'great').rank1.ivs,
  });
}

function pvpokeDamage(attacker, defender, mv) {
  const STAB = 1.2000000476837158203125;
  const BONUS = 1.2999999523162841796875;
  const SE = 1.60000002384185791015625;
  const RES = 0.625;
  const IMM = 0.390625;
  const SHADOW_ATK = 1.2;
  const SHADOW_DEF = 0.83333331;
  const chart = context.TYPES.chart;
  let effectiveness = 1;
  for (const type of defender.types) {
    const raw = (chart[mv.type] && chart[mv.type][type] != null) ? chart[mv.type][type] : 1;
    if (raw > 1.1) effectiveness *= SE;
    else if (raw < 0.5) effectiveness *= IMM;
    else if (raw < 0.9) effectiveness *= RES;
  }
  const stab = attacker.types.includes(mv.type) ? STAB : 1;
  const attack = attacker.stats.atk * C.boostMultiplier(attacker.boosts.atk) * (attacker.shadow ? SHADOW_ATK : 1);
  const defense = defender.stats.def * C.boostMultiplier(defender.boosts.def) * (attacker.shadow ? 1 : 1) *
    (defender.shadow ? SHADOW_DEF : 1);
  return Math.max(1, Math.floor(0.5 * mv.power * attack / defense * stab * effectiveness * BONUS) + 1);
}

/* -------------------------------------------------------------------------- */
/* 1. Unit math                                                                */
/* -------------------------------------------------------------------------- */
{
  assert.equal(C.bestBuild([100, 100, 100], [15, 15, 15], 1500).cp <= 1500, true);
  assert.equal(C.typeMultiplier('normal', ['ghost']), 0.390625);
  assert.equal(C.typeMultiplier('fighting', ['dark']), 1.6);
  assert.equal(C.typeMultiplier('fighting', ['steel', 'dark']), 1.6 * 1.6);
  assert.equal(C.boostMultiplier(4), 2);
  assert.equal(C.boostMultiplier(-4), 0.5);
  assert.equal(C.boostMultiplier(99), 2);
  assert.equal(C.boostMultiplier(-99), 0.5);
  const n = { types: ['normal'], shadow: false, stats: { atk: 100, def: 100 }, boosts: { atk: 0, def: 0 } };
  assert.equal(C.damage(n, n, { type: 'normal', power: 10 }), 8);
  assert.equal(C.damage(n, n, { type: 'normal', power: 0 }), 1);
  const ghost = { ...n, types: ['ghost'] };
  const vsGhost = C.damage(n, ghost, { type: 'normal', power: 100 });
  const vsNeutral = C.damage(n, n, { type: 'normal', power: 100 });
  assert.ok(vsGhost < vsNeutral, `ghost resist ${vsGhost} should be < neutral ${vsNeutral}`);
  assert.ok(vsGhost >= 1);
  const shadowAtk = { ...n, shadow: true };
  const shadowDef = { ...n, shadow: true };
  assert.ok(C.damage(shadowAtk, n, { type: 'normal', power: 10 }) >= C.damage(n, n, { type: 'normal', power: 10 }));
  assert.ok(C.damage(n, shadowDef, { type: 'normal', power: 10 }) >= C.damage(n, n, { type: 'normal', power: 10 }));
  note('pass', 'core math / damage floor / immunity / shadow direction');
}

{
  const ourStab = 1.2;
  const theirs = 1.2000000476837158203125;
  if (ourStab !== theirs) note('gap', `STAB uses JS 1.2 (${ourStab}) vs PvPoke fround 1.2 (${theirs})`);
  const ourSe = context.TYPES.chart.fighting.dark;
  const theirSe = 1.60000002384185791015625;
  if (ourSe !== theirSe) note('gap', `SE multiplier ${ourSe} vs PvPoke fround 1.6 ${theirSe}`);
  const ourShadowDef = 1 / 1.2;
  const theirShadowDef = 0.83333331;
  if (ourShadowDef !== theirShadowDef) note('gap', `shadow def ${ourShadowDef} vs PvPoke ${theirShadowDef}`);
}

/* -------------------------------------------------------------------------- */
/* 2. Golden + Melmetal regression                                             */
/* -------------------------------------------------------------------------- */
{
  const left = fighter('altaria', 'DRAGON_BREATH', ['SKY_ATTACK', 'MOONBLAST'], 1, { ivs: [0, 15, 15] });
  const right = fighter('stunfisk_galarian', 'MUD_SHOT', ['ROCK_SLIDE', 'EARTHQUAKE'], 1, { ivs: [0, 15, 15] });
  const result = E.simulate({ left, right, seed: 7 });
  const golden = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/battle-golden.json'), 'utf8'))[0].expected;
  assert.deepEqual({
    winner: result.winner, turns: result.turns, rating: result.rating,
    leftHp: result.left.hp, rightHp: result.right.hp,
  }, golden);
  assert.equal(E.simulate({ left, right, seed: 7 }).rating, result.rating);
  note('pass', `golden Altaria vs G-Stunfisk ${result.winner} ${result.turns}T rating ${result.rating}`);
}

{
  const mel = s => fighter('melmetal', 'THUNDER_SHOCK', ['DOUBLE_IRON_BASH', 'DYNAMIC_PUNCH'], s);
  const umb = s => fighter('umbreon', 'SNARL', ['DARK_PULSE', 'LAST_RESORT'], s);
  const z = E.simulate({ left: mel(0), right: umb(0), seed: 1 });
  const o = E.simulate({ left: mel(1), right: umb(1), seed: 1 });
  const t = E.simulate({ left: mel(2), right: umb(2), seed: 1 });
  assert.equal(z.winner, 'left');
  assert.equal(t.winner, 'left');
  assert.equal(o.log.some(e => e.side === 'left' && e.move === 'DYNAMIC_PUNCH'), true);
  note('pass', `Melmetal vs Umbreon 0s ${z.winner}/${z.turns}T · 1s ${o.winner}/${o.turns}T hp ${o.right.hp} · 2s ${t.winner}/${t.turns}T`);
}

/* -------------------------------------------------------------------------- */
/* 3. Cadence: opponent fast is not stalled extra by our charged               */
/* -------------------------------------------------------------------------- */
{
  const result = E.simulate({
    left: fighter('melmetal', 'THUNDER_SHOCK', ['DOUBLE_IRON_BASH', 'DYNAMIC_PUNCH'], 0),
    right: fighter('umbreon', 'SNARL', ['DARK_PULSE', 'LAST_RESORT'], 0),
    seed: 1,
  });
  const snarls = result.log.filter(e => e.side === 'right' && e.kind === 'fast').map(e => e.turn);
  const throws = result.log.filter(e => e.side === 'right' && e.kind === 'charged').map(e => e.turn);
  for (let i = 1; i < snarls.length; i++) {
    const gap = snarls[i] - snarls[i - 1];
    const ownThrows = throws.filter(t => t > snarls[i - 1] && t <= snarls[i]).length;
    const expected = 3 + ownThrows;
    if (gap !== expected) fail(`Snarl gap ${gap} expected ${expected} (ownThrows ${ownThrows}) at ${snarls[i - 1]}->${snarls[i]}`);
  }
  note('pass', 'Umbreon Snarl cadence = 3 + own charged count');
}

/* -------------------------------------------------------------------------- */
/* 4. Edge strategies / sandbox / empty moves                                  */
/* -------------------------------------------------------------------------- */
{
  const baseL = fighter('altaria', 'DRAGON_BREATH', ['SKY_ATTACK'], 0);
  const baseR = fighter('stunfisk_galarian', 'MUD_SHOT', ['ROCK_SLIDE'], 0);
  const farm = E.simulate({
    left: Object.assign({}, baseL, { strategy: 'farm' }),
    right: baseR, seed: 1,
  });
  const nuke = E.simulate({
    left: Object.assign({}, baseL, { strategy: 'nuke' }),
    right: baseR, seed: 1,
  });
  assert.ok(farm.turns > 0);
  assert.ok(nuke.log.some(e => e.kind === 'charged'));
  const noCharged = E.simulate({
    left: fighter('altaria', 'DRAGON_BREATH', [], 0),
    right: fighter('stunfisk_galarian', 'MUD_SHOT', [], 0),
    seed: 1,
  });
  assert.equal(noCharged.log.some(e => e.kind === 'charged'), false);
  const noFast = E.simulate({
    left: Object.assign({}, fighter('altaria', 'DRAGON_BREATH', ['SKY_ATTACK'], 0), { fast: null, energy: 100 }),
    right: fighter('stunfisk_galarian', 'MUD_SHOT', [], 0),
    seed: 1,
  });
  assert.ok(noFast.log.some(e => e.kind === 'charged') || noFast.timedOut || noFast.winner);
  const scripted = E.simulate({
    left: Object.assign({}, fighter('melmetal', 'THUNDER_SHOCK', ['DOUBLE_IRON_BASH', 'DYNAMIC_PUNCH'], 0, { energy: 100, actions: ['DYNAMIC_PUNCH', 'fast', 'DOUBLE_IRON_BASH'] })),
    right: fighter('umbreon', 'SNARL', ['DARK_PULSE'], 0),
    seed: 1,
  });
  const firstCharged = scripted.log.find(e => e.side === 'left' && e.kind === 'charged');
  assert.equal(firstCharged.move, 'DYNAMIC_PUNCH');
  note('pass', 'farm / nuke / no-charged / no-fast / scripted first throw');
}

/* -------------------------------------------------------------------------- */
/* 5. CMP equal-attack double charged (PvPoke usePriority=false)               */
/* -------------------------------------------------------------------------- */
{
  const poke = mon('altaria');
  const build = C.buildFor(poke, { league: 'great', ivs: [0, 15, 15] });
  const sky = move('SKY_ATTACK');
  const dmg = C.damage(
    { types: poke.types, shadow: false, stats: build, boosts: { atk: 0, def: 0 } },
    { types: poke.types, shadow: false, stats: build, boosts: { atk: 0, def: 0 } },
    sky,
  );
  const left = {
    mon: poke, build, fast: move('DRAGON_BREATH'), charged: [sky],
    shields: 0, energy: sky.energyCost, bait: false,
  };
  const right = {
    mon: poke, build: Object.assign({}, build), fast: move('DRAGON_BREATH'), charged: [sky],
    shields: 0, energy: sky.energyCost, bait: false,
  };
  /* Force lethal charged on turn 1 both sides. */
  left.build = Object.assign({}, build, { hp: Math.max(1, dmg) });
  right.build = Object.assign({}, build, { hp: Math.max(1, dmg) });
  const result = E.simulate({ left, right, seed: 1 });
  const throws = result.log.filter(e => e.kind === 'charged');
  const bothFired = throws.length >= 2;
  if (!bothFired) {
    note('fail', `CMP tie lethal: only ${throws.length} charged landed, winner=${result.winner}`);
  } else if (result.winner !== 'draw') {
    note('fail', `CMP tie lethal: both charged fired but winner=${result.winner} (expected draw)`);
  } else {
    note('pass', `CMP tie lethal: both charged fired, winner=${result.winner}`);
  }
}

/* -------------------------------------------------------------------------- */
/* 6. Same-turn fast vs charged order                                          */
/* -------------------------------------------------------------------------- */
{
  /* 1-turn fast that would KO if it landed before the opponent's charged. */
  const leftMon = mon('altaria');
  const rightMon = mon('stunfisk_galarian');
  const leftBuild = C.buildFor(leftMon, { league: 'great', ivs: [0, 15, 15] });
  const rightBuild = C.buildFor(rightMon, { league: 'great', ivs: [0, 15, 15] });
  const breath = move('DRAGON_BREATH');
  const rock = move('ROCK_SLIDE');
  const fastDmg = C.damage(
    { types: leftMon.types, shadow: false, stats: leftBuild, boosts: { atk: 0, def: 0 } },
    { types: rightMon.types, shadow: false, stats: rightBuild, boosts: { atk: 0, def: 0 } },
    breath,
  );
  const chargedDmg = C.damage(
    { types: rightMon.types, shadow: false, stats: rightBuild, boosts: { atk: 0, def: 0 } },
    { types: leftMon.types, shadow: false, stats: leftBuild, boosts: { atk: 0, def: 0 } },
    rock,
  );
  const result = E.simulate({
    left: {
      mon: leftMon,
      build: Object.assign({}, leftBuild, { hp: chargedDmg + 5 }),
      fast: breath, charged: [], shields: 0, bait: false,
    },
    right: {
      mon: rightMon,
      build: Object.assign({}, rightBuild, { hp: fastDmg }),
      fast: move('MUD_SHOT'), charged: [rock], shields: 0, energy: rock.energyCost, bait: false,
    },
    seed: 1,
  });
  const first = result.log[0];
  note('info', `same-turn order: first event kind=${first && first.kind} side=${first && first.side} winner=${result.winner} (PvPoke charged-before-fast)`);
  if (first && first.kind === 'fast' && first.side === 'left') {
    note('gap', 'same-turn: finishing fast lands before charged (PvPoke charged has +10 priority)');
  }
}

/* -------------------------------------------------------------------------- */
/* 7. Buffs: 100% apply, clamp, self-debuff value sign                         */
/* -------------------------------------------------------------------------- */
{
  const sp = move('SUPER_POWER');
  const pup = move('POWER_UP_PUNCH');
  const acid = move('ACID_SPRAY');
  assert.ok(sp && sp.buff && sp.buff[0] === 's');
  assert.ok(sp.buff[1] + sp.buff[2] < 0, 'Superpower is a self-debuff');
  const atk = {
    types: ['fighting'], shadow: false, stats: { atk: 120, def: 100 }, boosts: { atk: 0, def: 0 },
    side: 'left', hp: 100, energy: 100, shields: 0, maxHp: 100, fastCount: 0, charged: [],
  };
  const def = {
    types: ['normal'], shadow: false, stats: { atk: 100, def: 100 }, boosts: { atk: 0, def: 0 },
    side: 'right', hp: 200, energy: 0, shields: 0, maxHp: 200, fastCount: 0, charged: [],
  };
  /* Charged value: self-debuff must not get a bonus. */
  const engineSrc = fs.readFileSync(path.join(root, 'battle-engine.js'), 'utf8');
  assert.ok(engineSrc.includes("move.buff[0] === 's' ? 1 : -1"));
  const result = E.simulate({
    left: fighter('machamp', 'COUNTER', ['SUPER_POWER'], 0, { energy: 100 }),
    right: fighter('snorlax', 'PSYWAVE', ['BODY_SLAM'], 0),
    seed: 1,
  });
  const buff = result.log.find(e => e.kind === 'buff');
  if (buff) {
    assert.ok(buff.atkStage >= -4 && buff.atkStage <= 4);
    assert.ok(buff.defStage >= -4 && buff.defStage <= 4);
    note('pass', `Superpower buff applied stages atk=${buff.atkStage} def=${buff.defStage}`);
  } else {
    note('info', 'Superpower buff did not appear in first fight (seed/chance) — checking 100% buff');
  }
  if (pup && pup.buff && pup.buff[3] === 1) {
    const pupFight = E.simulate({
      left: fighter('medicham', 'COUNTER', ['POWER_UP_PUNCH'], 0, { energy: 100 }),
      right: fighter('snorlax', 'PSYWAVE', ['BODY_SLAM'], 2),
      seed: 99,
    });
    const pupBuff = pupFight.log.find(e => e.kind === 'buff' && e.move === 'POWER_UP_PUNCH');
    if (!pupBuff) note('fail', '100% Power-Up Punch buff did not apply');
    else note('pass', `PUP 100% buff atkStage=${pupBuff.atkStage}`);
  }
  if (acid && acid.buff) {
    note('info', `ACID_SPRAY buff ${JSON.stringify(acid.buff)}`);
  }
}

/* -------------------------------------------------------------------------- */
/* 8. Shield always consumes; charged deals 1                                  */
/* -------------------------------------------------------------------------- */
{
  const result = E.simulate({
    left: fighter('melmetal', 'THUNDER_SHOCK', ['DYNAMIC_PUNCH'], 0, { energy: 100 }),
    right: fighter('umbreon', 'SNARL', ['DARK_PULSE'], 2),
    seed: 1,
  });
  const charged = result.log.filter(e => e.side === 'left' && e.kind === 'charged');
  assert.ok(charged.length >= 1);
  assert.equal(charged[0].damage, 1);
  assert.equal(charged[0].shielded, true);
  assert.equal(result.right.shields, 2 - Math.min(2, charged.filter(e => e.shielded).length));
  note('pass', 'shield reduces charged to 1 and decrements');
}

/* -------------------------------------------------------------------------- */
/* 9. Energy cap, HP floor, log consistency                                    */
/* -------------------------------------------------------------------------- */
function checkResult(label, result, left, right) {
  if (result.left.hp < 0 || result.right.hp < 0) fail(`${label} negative HP`);
  if (result.left.hp > result.left.maxHp || result.right.hp > result.right.maxHp) fail(`${label} HP > max`);
  if (result.left.energy < 0 || result.left.energy > 100) fail(`${label} left energy ${result.left.energy}`);
  if (result.right.energy < 0 || result.right.energy > 100) fail(`${label} right energy ${result.right.energy}`);
  if (result.left.shields < 0 || result.left.shields > 2) fail(`${label} left shields`);
  if (result.right.shields < 0 || result.right.shields > 2) fail(`${label} right shields`);
  if (Number.isNaN(result.rating) || result.rating < 0 || result.rating > 1000) fail(`${label} rating ${result.rating}`);
  const expectedWinner = result.left.hp === result.right.hp ? 'draw' : result.left.hp > result.right.hp ? 'left' : 'right';
  if (result.winner !== expectedWinner) fail(`${label} winner ${result.winner} vs hp L${result.left.hp} R${result.right.hp}`);
  const leftRatio = result.left.hp / result.left.maxHp;
  const rightRatio = result.right.hp / result.right.maxHp;
  const expectedRating = Math.max(0, Math.min(1000, Math.round(500 + (leftRatio - rightRatio) * 500)));
  if (result.rating !== expectedRating) fail(`${label} rating ${result.rating} expected ${expectedRating}`);
  let lastTurn = 0;
  for (const e of result.log) {
    if (e.turn < lastTurn) fail(`${label} log turn went backwards ${lastTurn} -> ${e.turn}`);
    lastTurn = e.turn;
    if (e.energy < 0 || e.energy > 100) fail(`${label} log energy ${e.energy} at T${e.turn} ${e.kind}`);
    if (e.hp < 0) fail(`${label} log hp ${e.hp}`);
    if (e.kind === 'charged' && e.shielded && e.damage !== 1) fail(`${label} shielded damage ${e.damage}`);
  }
  if (result.turns >= 1000 && !result.timedOut && result.left.hp > 0 && result.right.hp > 0) {
    fail(`${label} hit 1000 turns without timedOut`);
  }
}

/* -------------------------------------------------------------------------- */
/* 10. Invariant sweep + symmetry + damage drift                               */
/* -------------------------------------------------------------------------- */
const pool = topMons(40);
const SETS_OK = pool.filter(p => defaultsFor(p));
let battles = 0;
let invariantFails = 0;
let symmetryMismatches = [];
let damageDrift = 0;
let damageCompared = 0;
let timeouts = 0;
let longBattles = 0;
const winners = { left: 0, right: 0, draw: 0 };
const turnHist = [];

for (let i = 0; i < SETS_OK.length; i++) {
  for (let j = i; j < SETS_OK.length; j++) {
    for (const shields of [0, 1, 2]) {
      const left = sideFromMon(SETS_OK[i], shields);
      const right = sideFromMon(SETS_OK[j], shields);
      let result;
      try {
        result = E.simulate({ left, right, seed: 1 });
        checkResult(`${SETS_OK[i].id} vs ${SETS_OK[j].id} s${shields}`, result, left, right);
      } catch (err) {
        invariantFails++;
        note('fail', String(err.message || err));
        continue;
      }
      battles++;
      winners[result.winner]++;
      turnHist.push(result.turns);
      if (result.timedOut) timeouts++;
      if (result.turns > 480) longBattles++;

      const swapped = E.simulate({ left: right, right: left, seed: 1 });
      const swapWinner = swapped.winner === 'left' ? 'right' : swapped.winner === 'right' ? 'left' : 'draw';
      const atkTie = Math.abs(left.build.atk - right.build.atk) < 1e-9;
      if (swapWinner !== result.winner) {
        symmetryMismatches.push({
          a: SETS_OK[i].id, b: SETS_OK[j].id, shields,
          winner: result.winner, swapped: swapped.winner,
          atkTie, atkL: left.build.atk, atkR: right.build.atk,
          turns: result.turns, swapTurns: swapped.turns,
        });
      }

      /* Compare one fast-move damage to PvPoke float32. */
      const aF = {
        types: left.mon.types, shadow: left.mon.shadow, stats: left.build, boosts: { atk: 0, def: 0 },
      };
      const dF = {
        types: right.mon.types, shadow: right.mon.shadow, stats: right.build, boosts: { atk: 0, def: 0 },
      };
      const ours = C.damage(aF, dF, left.fast);
      const theirs = pvpokeDamage(aF, dF, left.fast);
      damageCompared++;
      if (ours !== theirs) damageDrift++;
    }
  }
}

const avgTurns = turnHist.reduce((a, b) => a + b, 0) / Math.max(1, turnHist.length);
note(invariantFails ? 'fail' : 'pass', `invariant sweep ${battles} battles, fails ${invariantFails}, timeout ${timeouts}, >480T ${longBattles}, avgT ${avgTurns.toFixed(1)}`);
note('info', `winners L${winners.left} R${winners.right} D${winners.draw}`);

const cmpTies = symmetryMismatches.filter(x => x.atkTie);
const realAsym = symmetryMismatches.filter(x => !x.atkTie);
note(realAsym.length ? 'fail' : 'pass', `symmetry: ${symmetryMismatches.length} mismatches / ${battles} (${cmpTies.length} equal-atk, ${realAsym.length} real)`);
for (const row of (realAsym.length ? realAsym : cmpTies).slice(0, 8)) {
  note(realAsym.length ? 'fail' : 'info', `asym ${row.a} vs ${row.b} s${row.shields}: ${row.winner} vs swapped ${row.swapped} atkTie=${row.atkTie}`);
}
note(damageDrift ? 'gap' : 'pass', `fast damage vs PvPoke float32: ${damageDrift}/${damageCompared} differ`);

/* -------------------------------------------------------------------------- */
/* 11. Cadence invariant across the sweep sample                               */
/* -------------------------------------------------------------------------- */
{
  let cadenceFails = 0;
  const sample = SETS_OK.slice(0, 20);
  for (const a of sample) {
    for (const b of sample) {
      const result = E.simulate({ left: sideFromMon(a, 0), right: sideFromMon(b, 0), seed: 1 });
      for (const side of ['left', 'right']) {
        const fighterIn = side === 'left' ? sideFromMon(a, 0) : sideFromMon(b, 0);
        if (!fighterIn.fast) continue;
        const turnsPer = fighterIn.fast.turns;
        const fasts = result.log.filter(e => e.side === side && e.kind === 'fast');
        const throws = result.log.filter(e => e.side === side && e.kind === 'charged');
        for (let i = 1; i < fasts.length; i++) {
          const gap = fasts[i].turn - fasts[i - 1].turn;
          const ownThrows = throws.filter(t => t.turn > fasts[i - 1].turn && t.turn <= fasts[i].turn).length;
          const expected = turnsPer + ownThrows;
          if (gap !== expected) {
            cadenceFails++;
            if (cadenceFails <= 6) {
              note('fail', `cadence ${a.id} vs ${b.id} ${side} ${fighterIn.fast.id} gap ${gap} expected ${expected}`);
            }
          }
        }
      }
    }
  }
  note(cadenceFails ? 'fail' : 'pass', `generic fast cadence fails ${cadenceFails}`);
}

/* -------------------------------------------------------------------------- */
/* 12. Determinism, matrix, boost clamp, energy start                          */
/* -------------------------------------------------------------------------- */
{
  const left = sideFromMon(mon('melmetal'), 1);
  const right = sideFromMon(mon('umbreon'), 1);
  const a = E.simulate({ left, right, seed: 42 });
  const b = E.simulate({ left, right, seed: 42 });
  assert.deepEqual(a, b);
  const matrix = E.shieldMatrix({ left, right, seed: 1 });
  assert.equal(matrix.length, 3);
  assert.equal(matrix[0].length, 3);
  const boosted = E.simulate({
    left: Object.assign({}, left, { boosts: { atk: 9, def: -9 } }),
    right, seed: 1,
  });
  assert.ok(boosted.left.boosts.atk <= 4);
  assert.ok(boosted.left.boosts.def >= -4);
  const precharged = E.simulate({
    left: Object.assign({}, left, { energy: 100, shields: 0 }),
    right: Object.assign({}, right, { shields: 0 }),
    seed: 1,
  });
  assert.ok(precharged.log[0].kind === 'charged' || precharged.log.some(e => e.kind === 'charged'));
  note('pass', 'determinism / matrix / boost clamp / starting energy');
}

/* -------------------------------------------------------------------------- */
/* 13. Bait: cheaper move first when opponent still has shields                */
/* -------------------------------------------------------------------------- */
{
  const result = E.simulate({
    left: fighter('melmetal', 'THUNDER_SHOCK', ['DOUBLE_IRON_BASH', 'DYNAMIC_PUNCH'], 0, { bait: true }),
    right: fighter('umbreon', 'SNARL', ['DARK_PULSE', 'LAST_RESORT'], 2),
    seed: 1,
  });
  const first = result.log.find(e => e.side === 'left' && e.kind === 'charged');
  const dib = move('DOUBLE_IRON_BASH');
  const dp = move('DYNAMIC_PUNCH');
  note('info', `Melmetal bait vs 2s first throw ${first && first.move} (DIB cost ${dib.energyCost}, DP cost ${dp.energyCost})`);
  if (first && dib.energyCost < dp.energyCost && first.move !== 'DOUBLE_IRON_BASH') {
    note('gap', 'bait on: expected cheaper DIB first against shields');
  }
}

/* -------------------------------------------------------------------------- */
/* 14. Known meta sanity: a few one-sided matchups                             */
/* -------------------------------------------------------------------------- */
{
  const cases = [
    ['melmetal', 'umbreon', 0, 'left', 'fighting vs dark, 0s'],
    ['azumarill', 'ninetales', 1, null, 'fairly even, just must finish'],
    ['medicham', 'umbreon', 0, 'left', 'fighting vs dark'],
  ];
  for (const [a, b, s, expect, why] of cases) {
    if (!mon(a) || !mon(b) || !defaultsFor(mon(a)) || !defaultsFor(mon(b))) continue;
    const r = E.simulate({ left: sideFromMon(mon(a), s), right: sideFromMon(mon(b), s), seed: 1 });
    note('info', `${a} vs ${b} s${s}: ${r.winner} ${r.turns}T hp ${r.left.hp}/${r.right.hp} (${why})`);
    if (expect && r.winner !== expect) note('fail', `${a} vs ${b} s${s} expected ${expect} got ${r.winner}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Report                                                                      */
/* -------------------------------------------------------------------------- */
const counts = { pass: 0, fail: 0, gap: 0, info: 0 };
for (const f of findings) counts[f.level] = (counts[f.level] || 0) + 1;
console.log('\n=== battle verify ===');
for (const f of findings) {
  const tag = f.level.toUpperCase().padEnd(4);
  console.log(`${tag} ${f.msg}`);
}
console.log(`\nsummary pass=${counts.pass || 0} fail=${counts.fail || 0} gap=${counts.gap || 0} info=${counts.info || 0} battles=${battles}`);
if (counts.fail) process.exit(1);
console.log('battle-verify ok');
