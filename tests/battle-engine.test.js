'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = { console };
context.window = context;
context.globalThis = context;
vm.createContext(context);
for (const file of ['data/data.js', 'data/moves.js', 'battle-core.js', 'battle-engine.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}

const C = context.BattleCore;
const E = context.BattleEngine;
const mon = id => context.POKEMON.find(p => p.id === id);
const move = id => C.moveFromRow(id, context.MOVES[id]);

function fighter(id, fast, charged, shields = 1, ivs = [0, 15, 15]) {
  const pokemon = mon(id);
  return {
    mon: pokemon,
    build: C.buildFor(pokemon, { league: 'great', ivs }),
    fast: move(fast),
    charged: charged.map(move),
    shields,
  };
}

assert.equal(C.bestBuild([100, 100, 100], [15, 15, 15], 1500).cp <= 1500, true);
assert.equal(C.typeMultiplier('normal', ['ghost']), 0.390625);
assert.equal(C.boostMultiplier(4), 2);
assert.equal(C.boostMultiplier(-4), 0.5);

const neutral = {
  types: ['normal'], shadow: false, stats: { atk: 100, def: 100 }, boosts: { atk: 0, def: 0 },
};
assert.equal(C.damage(neutral, neutral, { type: 'normal', power: 10 }), 7);

const left = fighter('altaria', 'DRAGON_BREATH', ['SKY_ATTACK', 'MOONBLAST']);
const right = fighter('stunfisk_galarian', 'MUD_SHOT', ['ROCK_SLIDE', 'EARTHQUAKE']);
const result = E.simulate({ left, right, seed: 7 });
const golden = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/battle-golden.json'), 'utf8'))[0].expected;
assert.deepEqual({
  winner: result.winner,
  turns: result.turns,
  rating: result.rating,
  leftHp: result.left.hp,
  rightHp: result.right.hp,
}, golden);
assert.ok(result.turns > 0 && result.turns < 1000);
assert.ok(result.log.some(event => event.kind === 'fast'));
assert.ok(result.log.some(event => event.kind === 'charged'));
assert.equal(E.simulate({ left, right, seed: 7 }).rating, result.rating);

const noShield = E.simulate({
  left: Object.assign({}, left, { shields: 0 }),
  right: Object.assign({}, right, { shields: 0 }),
  seed: 1,
});
assert.equal(noShield.left.shields, 0);
assert.equal(noShield.right.shields, 0);

const matrix = E.shieldMatrix({ left, right, seed: 3 });
assert.equal(matrix.length, 3);
assert.equal(matrix[0].length, 3);
assert.equal(matrix[2][2].left.shields >= 0, true);

console.log('battle-engine tests passed');
