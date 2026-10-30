'use strict';

/* 포맷(리그·컵) 데이터 정합성과 리그별 CP 상한 계산 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = { console };
context.window = context;
context.globalThis = context;
vm.createContext(context);
const run = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
for (const file of ['data/data.js', 'data/moves.js', 'data/formats/index.js', 'battle-core.js', 'battle-engine.js']) run(file);

const C = context.BattleCore;
const E = context.BattleEngine;
const move = id => C.moveFromRow(id, context.MOVES[id]);
const FORMATS = Array.from(context.FORMATS);
const species = new Map(context.POKEMON.map(p => [p.id, p]));
const KB = 1024;

/* 기본 3리그와 메가 버전은 항상 있어야 한다 */
for (const key of ['great', 'ultra', 'master', 'mega-1500', 'mega-2500', 'mega-10000'])
  assert.ok(FORMATS.some(f => f.key === key), `포맷 없음: ${key}`);

for (const f of FORMATS) {
  const file = `data/formats/${f.key}.js`;
  assert.ok(fs.existsSync(path.join(root, file)), file);
  assert.ok(fs.statSync(path.join(root, file)).size < 120 * KB, `${file} 이 너무 크다`);
  run(file);
  const d = context.FORMAT_DATA[f.key];
  assert.ok(d && d.ranking.length > 50, `${f.key} 순위가 비었다`);
  assert.equal(new Set(d.ranking).size, d.ranking.length, `${f.key} 순위에 중복`);

  /* 순위 종 대부분이 data.js 에 있어야 화면에 나온다 (스프라이트 없는 소수만 빠진다) */
  const shown = d.ranking.filter(id => species.has(id)).length;
  assert.ok(shown / d.ranking.length > 0.99, `${f.key}: 화면에 나오는 종 ${shown}/${d.ranking.length}`);

  /* 추천 기술은 실제 기술이고, PvPoke 빈자리 'none' 이 없어야 한다 */
  for (const [id, set] of Object.entries(d.movesets)) {
    assert.ok(set.length >= 2, `${f.key} ${id} 기술셋이 짧다`);
    for (const m of set) assert.ok(context.MOVES[m], `${f.key} ${id}: 없는 기술 ${m}`);
  }

  /* 리그별 CP 상한 — 상위 20종 1등 개체가 상한을 넘지 않고, 상한 리그는 상한에 바짝 붙는다 */
  const lg = C.league(f.key);
  assert.equal(lg.cap, f.cp, f.key);
  for (const id of d.ranking.filter(x => species.has(x)).slice(0, 20)) {
    const b = C.presets(species.get(id), f.key).rank1;
    assert.ok(b.cp <= f.cp, `${f.key} ${id} CP ${b.cp}`);
    if (C.isUncapped(lg)) assert.deepEqual(Array.from(b.ivs), [15, 15, 15], `${f.key} ${id}`);
  }

  /* 상위 6종이 추천 기술로 서로 싸워도 계산이 끝까지 돈다 (기술표에 없는 추천 기술이 있으면 여기서 깨진다) */
  const top = d.ranking.filter(x => species.has(x) && d.movesets[x]).slice(0, 6);
  const side = id => {
    const set = d.movesets[id];
    return { mon: species.get(id), build: C.presets(species.get(id), f.key).rank1,
      fast: move(set[0]), charged: set.slice(1).map(move), shields: 1 };
  };
  for (const a of top) for (const b of top) {
    const r = E.simulate({ left: side(a), right: side(b), seed: 1 });
    assert.ok(['left', 'right', 'draw'].includes(r.winner), `${f.key} ${a} vs ${b}`);
  }
}

/* 같은 종이라도 리그마다 1등 개체가 다르다 — 캐시가 CP 상한별로 나뉘는지 */
{
  const az = species.get('azumarill');
  const great = C.presets(az, 'great').rank1, ultra = C.presets(az, 'ultra').rank1;
  assert.ok(great.cp <= 1500 && ultra.cp <= 2500 && ultra.cp > 1500);
  assert.notDeepEqual(Array.from(great.ivs), Array.from(ultra.ivs));
  /* 같은 CP 상한의 컵은 같은 결과 (mega-1500 = great) */
  assert.deepEqual(C.presets(az, 'mega-1500').rank1, great);
}

/* 모르는 키는 슈퍼리그로 */
assert.equal(C.league('nope').cap, 1500);

console.log(`formats tests passed (${FORMATS.length} formats)`);

/* 베스트 파트너: 켜면 최대 레벨이 51, 끄면 50. 같은 CP 상한에서도 레벨이 오르면 능력치가 커진다 */
{
  const mon = species.get('medicham') || context.POKEMON[0];
  const off = C.bestBuild(mon.base, [15, 15, 15], 10000);
  assert.equal(off.level, 50);
  assert.equal(C.maxLevel(), 50);
  context.Format = { buddy: true };
  assert.equal(C.maxLevel(), 51);
  const on = C.bestBuild(mon.base, [15, 15, 15], 10000);
  assert.equal(on.level, 51);
  assert.ok(on.atk > off.atk && on.hp >= off.hp);
  const capped = C.bestBuild(mon.base, [0, 15, 15], 1500);
  assert.ok(capped.cp <= 1500 && capped.level <= 51);
  context.Format = undefined;
  assert.equal(C.bestBuild(mon.base, [15, 15, 15], 10000).level, 50);
}
