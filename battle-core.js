'use strict';

/* Shared Pokemon GO PvP math. Kept behind one global to avoid collisions
   between classic scripts loaded by file:// pages. */
(function (root) {
  const LEAGUES = {
    great: { key: 'great', name: '슈퍼리그', cap: 1500 },
    // ultra: { key: 'ultra', name: '하이퍼리그', cap: 2500 },
    // master: { key: 'master', name: '마스터리그', cap: Infinity },
  };
  const MAX_LEVEL = 50;
  const STAB = 1.2;
  const SHADOW_ATTACK = 1.2;
  const SHADOW_DEFENSE = 1 / 1.2;
  const ENERGY_CAP = 100;
  const BOOST_MIN = -4;
  const BOOST_MAX = 4;
  const CPM_TABLE = () => root.CPM || [];
  const TYPE_DATA = () => root.TYPES || { chart: {} };
  const buildCache = new Map();

  function league(value) {
    return LEAGUES[value] || LEAGUES.great;
  }

  function statsAt(base, ivs, level) {
    const cpm = CPM_TABLE()[Math.round((level - 1) * 2)];
    if (!cpm) throw new Error(`지원하지 않는 레벨입니다: ${level}`);
    const atk = (base[0] + ivs[0]) * cpm;
    const def = (base[1] + ivs[1]) * cpm;
    const hpRaw = (base[2] + ivs[2]) * cpm;
    return {
      atk,
      def,
      hp: Math.max(10, Math.floor(hpRaw)),
      cp: Math.max(10, Math.floor(atk * Math.sqrt(def) * Math.sqrt(hpRaw) / 10)),
    };
  }

  function bestBuild(base, ivs, cap = 1500, maxLevel = MAX_LEVEL) {
    let out = null;
    for (let level = 1; level <= maxLevel; level += 0.5) {
      const stats = statsAt(base, ivs, level);
      if (stats.cp > cap) break;
      out = Object.assign({ level, ivs: ivs.slice() }, stats);
    }
    if (!out) out = Object.assign({ level: 1, ivs: ivs.slice() }, statsAt(base, ivs, 1));
    out.product = out.atk * out.def * out.hp;
    return out;
  }

  function allBuilds(mon, leagueKey = 'great') {
    const lg = league(leagueKey);
    const cacheKey = `${mon.id}:${lg.key}`;
    if (buildCache.has(cacheKey)) return buildCache.get(cacheKey);
    const out = [];
    for (let atk = 0; atk < 16; atk++)
      for (let def = 0; def < 16; def++)
        for (let hp = 0; hp < 16; hp++)
          out.push(bestBuild(mon.base, [atk, def, hp], lg.cap));
    out.sort((a, b) => b.product - a.product || b.atk - a.atk);
    out.forEach((build, index) => { build.rank = index + 1; });
    buildCache.set(cacheKey, out);
    return out;
  }

  function presets(mon, leagueKey = 'great') {
    const lg = league(leagueKey);
    if (lg.key === 'master') {
      const hundo = bestBuild(mon.base, [15, 15, 15], lg.cap);
      return { rank1: hundo, maxAtk: hundo, hundo, pvpoke: hundo };
    }
    const all = allBuilds(mon, lg.key);
    let maxAtk = all[0];
    for (const build of all) if (build.atk > maxAtk.atk) maxAtk = build;
    return {
      rank1: all[0],
      maxAtk,
      hundo: bestBuild(mon.base, [15, 15, 15], lg.cap),
      pvpoke: mon.pvIv ? bestBuild(mon.base, mon.pvIv, lg.cap) : undefined,
    };
  }

  function buildFor(mon, options = {}) {
    const lg = league(options.league);
    const ivs = (options.ivs || (lg.key === 'master' ? [15, 15, 15] : presets(mon, lg.key).rank1.ivs)).slice();
    if (options.level) return Object.assign(
      { level: options.level, ivs },
      statsAt(mon.base, ivs, options.level),
    );
    return bestBuild(mon.base, ivs, lg.cap);
  }

  function typeMultiplier(moveType, defenderTypes) {
    const chart = TYPE_DATA().chart || {};
    return (defenderTypes || []).reduce(
      (value, type) => value * ((chart[moveType] && chart[moveType][type] != null) ? chart[moveType][type] : 1),
      1,
    );
  }

  function boostMultiplier(stage) {
    const n = Math.max(BOOST_MIN, Math.min(BOOST_MAX, Number(stage) || 0));
    return n >= 0 ? (4 + n) / 4 : 4 / (4 - n);
  }

  function damage(attacker, defender, move) {
    const stab = attacker.types.includes(move.type) ? STAB : 1;
    const effectiveness = typeMultiplier(move.type, defender.types);
    const attack = attacker.stats.atk * boostMultiplier(attacker.boosts.atk) *
      (attacker.shadow ? SHADOW_ATTACK : 1);
    const defense = defender.stats.def * boostMultiplier(defender.boosts.def) *
      (defender.shadow ? SHADOW_DEFENSE : 1);
    return Math.max(1, Math.floor(0.5 * move.power * attack / defense * stab * effectiveness) + 1);
  }

  function moveFromRow(id, row) {
    if (!row) return null;
    const fast = Number(row[4]) > 0;
    return {
      id,
      name: row[0],
      type: row[1],
      power: Number(row[2]) || 0,
      fast,
      turns: fast ? Number(row[3]) || 1 : 1,
      energyGain: fast ? Number(row[4]) || 0 : 0,
      energyCost: fast ? 0 : Number(row[3]) || 0,
      buff: row[5] || null,
    };
  }

  root.BattleCore = {
    LEAGUES,
    MAX_LEVEL,
    ENERGY_CAP,
    BOOST_MIN,
    BOOST_MAX,
    statsAt,
    bestBuild,
    allBuilds,
    presets,
    buildFor,
    typeMultiplier,
    boostMultiplier,
    damage,
    moveFromRow,
  };
})(typeof window !== 'undefined' ? window : globalThis);
