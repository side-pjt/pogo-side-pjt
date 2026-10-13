'use strict';

/* Deterministic 1v1 simulator. Inputs and outputs contain plain objects so the
   same engine can power Single, Multi, Matrix and Node regression tests. */
(function (root) {
  const Core = root.BattleCore;
  if (!Core) throw new Error('battle-core.js must be loaded before battle-engine.js');

  function clampStage(value) {
    return Math.max(Core.BOOST_MIN, Math.min(Core.BOOST_MAX, value));
  }

  function seededRandom(seed) {
    let state = (Number(seed) || 1) >>> 0;
    return function random() {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function cloneFighter(input, side) {
    const build = input.build;
    return {
      side,
      id: input.mon.id,
      name: input.mon.ko,
      types: input.mon.types.slice(),
      shadow: Boolean(input.mon.shadow || input.shadow),
      stats: { atk: build.atk, def: build.def, hp: build.hp },
      maxHp: build.hp,
      hp: build.hp,
      energy: Math.max(0, Math.min(Core.ENERGY_CAP, input.energy || 0)),
      shields: Math.max(0, Math.min(2, Number(input.shields) || 0)),
      boosts: {
        atk: clampStage(input.boosts && input.boosts.atk),
        def: clampStage(input.boosts && input.boosts.def),
      },
      fast: input.fast,
      charged: (input.charged || []).filter(Boolean),
      strategy: input.strategy || 'optimal',
      bait: input.bait !== false,
      script: (input.actions || []).slice(),
      cooldown: 0,
      pendingFast: null,
      fastCount: 0,
    };
  }

  function availableCharged(fighter) {
    return fighter.charged.filter(move => move && fighter.energy >= move.energyCost);
  }

  function chargedValue(move, attacker, defender) {
    const raw = Core.damage(attacker, defender, move);
    let buffValue = 0;
    if (move.buff) {
      /* Stage changes on the user help as written; on the opponent they help when negative. */
      const sign = move.buff[0] === 's' ? 1 : -1;
      buffValue = sign * (move.buff[1] + move.buff[2]) * 8 * move.buff[3];
    }
    return raw / Math.max(1, move.energyCost) + buffValue / 100;
  }

  /* True when the foe could KO the fighter within `turns` turns, counting its fast moves and
     one Charged Move it can afford (a shield reduces that Charged Move to 1 damage). */
  function dies(fighter, defender, turns) {
    if (!defender.fast) return false;
    const fastDamage = Core.damage(defender, fighter, defender.fast);
    const hits = Math.floor(turns / Math.max(1, defender.fast.turns));
    for (let n = 0; n <= hits; n++) {
      const energy = defender.energy + n * defender.fast.energyGain;
      let burst = 0;
      for (const move of defender.charged) {
        if (!move || energy < move.energyCost) continue;
        burst = Math.max(burst, fighter.shields > 0 ? 1 : Core.damage(defender, fighter, move));
      }
      if (n * fastDamage + burst >= fighter.hp) return true;
    }
    return false;
  }

  /* Turns needed to KO the foe by farming with the fast move and throwing only `move`. */
  function turnsToKo(fighter, defender, move) {
    const fastDamage = Core.damage(fighter, defender, fighter.fast);
    const throwDamage = Core.damage(fighter, defender, move);
    let hp = defender.hp;
    let energy = fighter.energy;
    let shields = defender.shields;
    let turns = 0;
    for (let guard = 0; guard < 500; guard++) {
      while (energy < move.energyCost) {
        hp -= fastDamage;
        energy += Math.max(1, fighter.fast.energyGain);
        turns += fighter.fast.turns;
        if (hp <= 0) return turns;
      }
      energy -= move.energyCost;
      turns += 1;
      if (shields > 0) { shields--; hp -= 1; } else hp -= throwDamage;
      if (hp <= 0) return turns;
    }
    return Infinity;
  }

  function chooseCharged(fighter, defender) {
    const ready = availableCharged(fighter);
    if (!ready.length) return null;
    const scripted = fighter.script[0];
    if (scripted) {
      if (scripted === 'fast') return null;
      const wanted = ready.find(move => move.id === scripted);
      if (wanted) {
        fighter.script.shift();
        return wanted;
      }
    }
    if (fighter.strategy === 'farm' && fighter.energy < 90) return null;
    if (fighter.strategy === 'nuke') {
      return ready.slice().sort((a, b) => b.power - a.power || a.energyCost - b.energyCost)[0];
    }
    if (defender.shields === 0) {
      const lethal = ready.filter(move => Core.damage(fighter, defender, move) >= defender.hp);
      if (lethal.length) {
        return lethal.sort((a, b) => a.energyCost - b.energyCost)[0];
      }
    }
    if (fighter.bait && defender.shields && ready.length > 1) {
      const cheap = ready.slice().sort((a, b) => a.energyCost - b.energyCost)[0];
      const expensive = ready.slice().sort((a, b) => b.energyCost - a.energyCost)[0];
      if (fighter.energy < expensive.energyCost + 10) return cheap;
    }
    const byValue = (a, b) => chargedValue(b, fighter, defender) - chargedValue(a, fighter, defender);
    const best = fighter.charged.slice().sort(byValue)[0];
    if (best && fighter.fast) {
      const fastDamage = Core.damage(fighter, defender, fighter.fast);
      const gain = Math.max(1, fighter.fast.energyGain);
      const cycle = Core.damage(fighter, defender, best) +
        fastDamage * Math.ceil(best.energyCost / gain);
      let target = best;
      if (defender.hp / cycle <= 2) {
        /* Close to a KO: pick the move whose repeated use finishes the foe soonest. */
        target = fighter.charged.slice().sort((a, b) =>
          turnsToKo(fighter, defender, a) - turnsToKo(fighter, defender, b) || byValue(a, b))[0];
      }
      if (ready.includes(target)) return target;
      const fastsNeeded = Math.ceil((target.energyCost - fighter.energy) / gain);
      /* Like PvPoke: build up to the chosen move rather than spend energy on a weaker one. */
      if (!dies(fighter, defender, fastsNeeded * fighter.fast.turns)) return null;
    }
    return ready.slice().sort(byValue)[0];
  }

  function logEvent(log, turn, fighter, kind, move, extra) {
    log.push(Object.assign({
      turn,
      time: turn * 0.5,
      side: fighter.side,
      kind,
      move: move ? move.id : null,
      moveName: move ? move.name : null,
      hp: fighter.hp,
      energy: fighter.energy,
      shields: fighter.shields,
    }, extra || {}));
  }

  function applyBuff(move, attacker, defender, random, log, turn) {
    if (!move.buff || random() > move.buff[3]) return;
    const target = move.buff[0] === 's' ? attacker : defender;
    target.boosts.atk = clampStage(target.boosts.atk + move.buff[1]);
    target.boosts.def = clampStage(target.boosts.def + move.buff[2]);
    logEvent(log, turn, attacker, 'buff', move, {
      target: target.side,
      atkStage: target.boosts.atk,
      defStage: target.boosts.def,
    });
  }

  function useCharged(attacker, defender, move, turn, random, log) {
    attacker.energy -= move.energyCost;
    let dealt;
    let shielded = false;
    if (defender.shields > 0) {
      defender.shields--;
      dealt = 1;
      shielded = true;
    } else {
      dealt = Core.damage(attacker, defender, move);
    }
    defender.hp = Math.max(0, defender.hp - dealt);
    logEvent(log, turn, attacker, 'charged', move, {
      damage: dealt,
      defenderHp: defender.hp,
      shielded,
    });
    applyBuff(move, attacker, defender, random, log, turn);
  }

  function beginFast(fighter) {
    if (!fighter.fast) return;
    if (fighter.script[0] === 'fast') fighter.script.shift();
    fighter.pendingFast = fighter.fast;
    fighter.cooldown = Math.max(1, fighter.fast.turns);
  }

  function finishFast(attacker, defender, turn, log) {
    const move = attacker.pendingFast;
    if (!move) return;
    const dealt = Core.damage(attacker, defender, move);
    defender.hp = Math.max(0, defender.hp - dealt);
    attacker.energy = Math.min(Core.ENERGY_CAP, attacker.energy + move.energyGain);
    attacker.fastCount++;
    logEvent(log, turn, attacker, 'fast', move, {
      damage: dealt,
      defenderHp: defender.hp,
      fastCount: attacker.fastCount,
    });
    attacker.pendingFast = null;
  }

  function snapshot(fighter) {
    return {
      id: fighter.id,
      name: fighter.name,
      hp: fighter.hp,
      maxHp: fighter.maxHp,
      energy: fighter.energy,
      shields: fighter.shields,
      boosts: Object.assign({}, fighter.boosts),
      fastCount: fighter.fastCount,
    };
  }

  function simulate(config) {
    const maxTurns = Number(config.maxTurns) || 1000;
    const random = seededRandom(config.seed);
    const left = cloneFighter(config.left, 'left');
    const right = cloneFighter(config.right, 'right');
    const log = [];
    let turn = 0;

    while (left.hp > 0 && right.hp > 0 && turn < maxTurns) {
      turn++;
      const leftCharge = left.cooldown === 0 ? chooseCharged(left, right) : null;
      const rightCharge = right.cooldown === 0 ? chooseCharged(right, left) : null;

      const charging = [];
      if (leftCharge) charging.push([left, right, leftCharge]);
      if (rightCharge) charging.push([right, left, rightCharge]);

      /* A Charged Move takes the thrower's turn; the other side keeps ticking its fast move. */
      const finishing = [];
      for (const [fighter, foe] of [[left, right], [right, left]]) {
        if (charging.some(entry => entry[0] === fighter)) continue;
        if (fighter.cooldown === 0) beginFast(fighter);
        fighter.cooldown = Math.max(0, fighter.cooldown - 1);
        if (fighter.cooldown === 0 && fighter.pendingFast) finishing.push([fighter, foe]);
      }
      /* Fast moves finishing this turn land together, before any Charged Move resolves. */
      for (const [fighter, foe] of finishing) finishFast(fighter, foe, turn, log);

      charging.sort((a, b) => b[0].stats.atk - a[0].stats.atk ||
        (a[0].side === 'left' ? -1 : 1));
      for (const [attacker, defender, move] of charging) {
        if (attacker.hp <= 0 || defender.hp <= 0) continue;
        useCharged(attacker, defender, move, turn, random, log);
      }
    }

    const timedOut = turn >= maxTurns && left.hp > 0 && right.hp > 0;
    const winner = left.hp === right.hp ? 'draw' : left.hp > right.hp ? 'left' : 'right';
    const leftRatio = left.hp / left.maxHp;
    const rightRatio = right.hp / right.maxHp;
    const rating = Math.max(0, Math.min(1000, Math.round(500 + (leftRatio - rightRatio) * 500)));
    return {
      winner,
      turns: turn,
      seconds: turn * 0.5,
      timedOut,
      rating,
      left: snapshot(left),
      right: snapshot(right),
      log,
    };
  }

  function shieldMatrix(config) {
    const rows = [];
    for (let leftShields = 0; leftShields <= 2; leftShields++) {
      const row = [];
      for (let rightShields = 0; rightShields <= 2; rightShields++) {
        row.push(simulate(Object.assign({}, config, {
          left: Object.assign({}, config.left, { shields: leftShields }),
          right: Object.assign({}, config.right, { shields: rightShields }),
        })));
      }
      rows.push(row);
    }
    return rows;
  }

  root.BattleEngine = { simulate, shieldMatrix };
})(typeof window !== 'undefined' ? window : globalThis);
