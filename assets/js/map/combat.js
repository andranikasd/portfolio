/* "Incidents" — the hostile half of the campaign map.
 *
 * Two modes share one engine:
 *   free roam — a trickle of wandering incidents that chase the party
 *   mission   — accepted at a keep: waves march on the KEEP, not on you.
 *               You are the garrison's only archer. The keep's integrity is
 *               the health bar that matters; if it falls, so does the world.
 *
 * Every incident is weak to exactly one tool domain. The wrong tool bounces
 * off. Swap tools mid-fight — that is the whole game.
 */

import { drawIncident, drawTool } from './bestiary.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export const COMBAT = {
  sanctuary: 320,        // world units around a keep that roaming foes avoid
  spawnMin: 380,
  spawnMax: 680,
  despawn: 1700,
  contactRange: 36,
  contactDamage: 1,
  invuln: 1.4,
  maxHp: 5,
  peace: 7,              // grace period before anything hostile appears
  waveBreak: 3.4,
  keepReach: 78,         // how close an incident must get to strike the walls
  keepHitGap: 1.3,       // seconds between blows on the walls
  knockback: 190,
};

const WANDERERS = [
  { id: 'roam-1', name: 'P3 Alert',    weakTo: null, art: 'surge',   skill: null, hp: 2, speed: 118, radius: 15, colour: '#b45309', reward: 1 },
  { id: 'roam-2', name: 'P2 Degraded', weakTo: null, art: 'shard',   skill: null, hp: 3, speed: 138, radius: 17, colour: '#9b2c1f', reward: 2 },
  { id: 'roam-3', name: 'P1 Outage',   weakTo: null, art: 'boulder', skill: null, hp: 5, speed: 104, radius: 22, colour: '#5b1717', reward: 4 },
];

const DEFAULT_TOOL = { name: 'Bow', kind: 'bolt', domain: null, damage: 1, cooldown: 0.24, speed: 940, pierce: 1, splash: 0 };

export function createCombat(world, opts = {}) {
  const rand = opts.rand || Math.random;
  const toolStats = opts.tools || {};
  const catalogue = opts.incidents || {};

  const state = {
    hp: COMBAT.maxHp,
    kills: 0,
    score: 0,
    enemies: [],
    shots: [],
    sparks: [],
    floats: [],           // short-lived text over the world
    tools: [DEFAULT_TOOL],
    toolIndex: 0,
    tool: DEFAULT_TOOL,
    fireTimer: 0,
    spawnTimer: 1.6,
    invuln: 0,
    shake: 0,
    peace: COMBAT.peace,
    dead: false,          // the keep fell: the host plays the destruction
    routed: 0,            // free-roam wipe: the host falls back to a keep
    banner: null,
    bannerTimer: 0,
    mission: null,
    knock: null,          // knockback impulse the host applies to the party
  };

  const inSanctuary = (x, y) =>
    !state.mission && world.castles.some(c => Math.hypot(c.x - x, c.y - y) < COMBAT.sanctuary);

  const roamCap = () => Math.min(2 + Math.floor(state.kills / 6), 5);
  const roamGap = () => Math.max(3.4, 6 - state.kills * 0.05);

  function say(text, seconds = 2.4) {
    state.banner = text;
    state.bannerTimer = seconds;
  }

  function float(x, y, text, colour) {
    state.floats.push({ x, y, text, colour, life: 1 });
  }

  /* ── Spawning ───────────────────────────────────────────── */

  function placeNear(x0, y0, min, max) {
    for (let attempt = 0; attempt < 50; attempt++) {
      const ang = rand() * Math.PI * 2;
      const dist = min + rand() * (max - min);
      const x = clamp(x0 + Math.cos(ang) * dist, 40, world.width - 40);
      const y = clamp(y0 + Math.sin(ang) * dist, 40, world.height - 40);
      if (!world.isPassable(x, y)) continue;
      if (inSanctuary(x, y)) continue;
      return { x, y };
    }
    return null;
  }

  function push(kind, spot) {
    state.enemies.push({
      x: spot.x,
      y: spot.y,
      kind,
      hp: kind.hp,
      maxHp: kind.hp,
      phase: rand() * Math.PI * 2,
      hurt: 0,
      seen: 0,            // cloaked foes fade in as this rises
      revived: false,
      blinkTimer: 1.5 + rand() * 2,
      strikeTimer: 0,
      facing: 1,
    });
  }

  function spawnWanderer(px, py) {
    const tier = state.kills < 5 ? 0
      : state.kills < 14 ? (rand() < 0.6 ? 0 : 1)
        : rand() < 0.3 ? 0 : rand() < 0.85 ? 1 : 2;
    const spot = placeNear(px, py, COMBAT.spawnMin, COMBAT.spawnMax);
    if (spot) push(WANDERERS[tier], spot);
  }

  /* ── Missions ───────────────────────────────────────────── */

  /** Wave scaling: more of them, tougher, and quicker off the mark. */
  function scaled(base, wave, elite) {
    const grow = 1 + 0.22 * (wave - 1);
    return {
      ...base,
      name: elite ? `Major ${base.name}` : base.name,
      hp: Math.max(1, Math.round(base.hp * grow * (elite ? 2.2 : 1))),
      speed: base.speed * (1 + 0.05 * (wave - 1)),
      radius: base.radius * (elite ? 1.35 : 1),
      reward: base.reward * wave * (elite ? 3 : 1),
      elite: Boolean(elite),
    };
  }

  function selectTool(i) {
    if (!state.tools.length) return;
    state.toolIndex = ((i % state.tools.length) + state.tools.length) % state.tools.length;
    state.tool = state.tools[state.toolIndex];
    state.fireTimer = Math.max(state.fireTimer, 0.18);   // a beat to switch grip
  }

  function startMission(cfg, keep) {
    state.tools = (cfg.tools || []).map(t => ({ ...DEFAULT_TOOL, ...(toolStats[t.kind] || {}), ...t }));
    if (!state.tools.length) state.tools = [DEFAULT_TOOL];
    state.toolIndex = 0;
    state.tool = state.tools[0];

    state.mission = {
      id: cfg.id,
      name: cfg.name,
      keep,
      waves: cfg.waves || 4,
      keepHp: cfg.keepHp || 20,
      keepMaxHp: cfg.keepHp || 20,
      pool: (cfg.incidents || []).map(id => catalogue[id]).filter(Boolean),
      wave: 0,
      pending: 0,
      breakTimer: 2,
      spawnGap: 0,
      stalled: 0,
      done: false,
    };
    if (!state.mission.pool.length) state.mission.pool = WANDERERS;

    state.enemies.length = 0;
    state.shots.length = 0;
    state.hp = COMBAT.maxHp;
    state.invuln = COMBAT.invuln;
    state.peace = 0;
    say(`${cfg.name} — ${state.tool.name} in hand`, 3);
  }

  function abandonMission() {
    state.mission = null;
    state.enemies.length = 0;
    state.shots.length = 0;
    state.tools = [DEFAULT_TOOL];
    state.toolIndex = 0;
    state.tool = DEFAULT_TOOL;
    state.hp = COMBAT.maxHp;
    state.peace = COMBAT.peace;
  }

  function updateMission(dt, party) {
    const m = state.mission;
    if (m.done) return;

    if (m.pending === 0 && state.enemies.length === 0) {
      m.breakTimer -= dt;
      if (m.breakTimer > 0) return;

      if (m.wave >= m.waves) {
        m.done = true;
        state.score += 15 * m.waves;
        say(`${m.name} — held. The chronicle is yours.`, 4);
        return;
      }
      m.wave += 1;
      m.pending = 2 + m.wave;
      m.breakTimer = COMBAT.waveBreak;
      m.spawnGap = 0;
      say(m.wave === m.waves ? `Final wave — ${m.wave} of ${m.waves}` : `Wave ${m.wave} of ${m.waves}`, 2);
      return;
    }

    if (m.pending > 0) {
      m.spawnGap -= dt;
      if (m.spawnGap > 0) return;
      m.spawnGap = Math.max(0.36, 0.8 - m.wave * 0.05);

      const base = m.pool[Math.floor(rand() * m.pool.length)];
      const elite = m.wave === m.waves && m.pending <= 2;
      const kind = scaled(base, m.wave, elite);

      // Waves march on the keep, so they gather beyond its walls.
      // Far enough out that a prepared defender gets a few seconds' warning.
      const spot = placeNear(m.keep.x, m.keep.y, 720, 1080)
        || placeNear(party.x, party.y, 480, 820)
        || placeNear(m.keep.x, m.keep.y, 300, 1200);

      if (spot) {
        push(kind, spot);
        m.pending -= 1;
        m.stalled = 0;
        // A swarm never arrives alone.
        if (kind.skill === 'swarm' && m.pending > 0) {
          const mate = placeNear(spot.x, spot.y, 40, 120);
          if (mate) { push(kind, mate); m.pending -= 1; }
        }
      } else {
        m.stalled += 1;
        if (m.stalled > 6) { m.pending -= 1; m.stalled = 0; }
      }
    }
  }

  function damageKeep(amount) {
    const m = state.mission;
    if (!m || m.done) return;
    m.keepHp = Math.max(0, m.keepHp - amount);
    state.shake = Math.max(state.shake, 0.8);
    float(m.keep.x, m.keep.y - 40, `-${amount}`, '#7f1d1d');
    if (m.keepHp === 0) {
      state.dead = true;
      say('The keep has fallen', 3);
    }
  }

  /* ── Shooting ───────────────────────────────────────────── */

  function nearest(x, y, maxDist = Infinity) {
    let best = null;
    let bestD = maxDist;
    for (const e of state.enemies) {
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  /**
   * Strike from (px, py). `at` picks the target: an incident to aim at, `null`
   * to force the raw `heading`, or omitted to auto-aim at the nearest.
   */
  function fire(px, py, heading, at) {
    if (state.fireTimer > 0 || state.dead) return false;
    const w = state.tool;
    const target = at !== undefined ? at : nearest(px, py, 1500);
    let dx;
    let dy;
    if (target) {
      dx = target.x - px;
      dy = target.y - py - 8;
    } else {
      [dx, dy] = heading;
    }
    const len = Math.hypot(dx, dy) || 1;
    state.shots.push({
      x: px,
      y: py - 10,
      vx: (dx / len) * w.speed,
      vy: (dy / len) * w.speed,
      life: 1.2,
      spin: 0,
      hits: 0,
      kind: w.kind,
      domain: w.domain,
      damage: w.damage,
      pierce: w.pierce,
      splash: w.splash,
    });
    state.fireTimer = w.cooldown;
    return true;
  }

  function burst(x, y, colour, count, power) {
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      const v = power * (0.4 + rand() * 0.8);
      state.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, colour });
    }
  }

  /** @returns {boolean} whether the blow actually landed. */
  function damage(e, amount, atX, atY) {
    // The whole point of the tool map: the wrong domain simply bounces.
    if (e.kind.weakTo && state.tool.domain !== e.kind.weakTo) {
      e.seen = 1;
      burst(atX, atY, '#94a3b8', 4, 90);
      float(atX, atY - 12, 'no effect', '#475569');
      return false;
    }

    let dealt = amount;
    if (e.kind.skill === 'armour') dealt = Math.max(1, dealt - 1);   // braced, not immune

    e.hp -= dealt;
    e.hurt = 1;
    e.seen = 1;
    burst(atX, atY, e.kind.colour, 5, 130);
    float(atX, atY - 14, `-${dealt}`, e.kind.colour);

    if (e.hp <= 0) {
      if (e.kind.skill === 'revive' && !e.revived) {
        e.revived = true;
        e.hp = Math.max(1, Math.round(e.maxHp / 2));
        burst(e.x, e.y, '#0f766e', 12, 160);
        float(e.x, e.y - 26, 'restarting…', '#0f766e');
        return true;
      }
      state.kills += 1;
      state.score += e.kind.reward;
      burst(e.x, e.y, e.kind.colour, 18, 230);
    }
    return true;
  }

  /* ── Per-incident behaviour ─────────────────────────────── */

  function steer(e, dt, goal, party) {
    let dx = goal.x - e.x;
    let dy = goal.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;

    if (e.kind.skill === 'swarm') {
      // Weave: perpendicular wobble makes a pack hard to line up.
      const wob = Math.sin(e.phase * 2.2) * 0.55;
      const px = -dy;
      const py = dx;
      dx += px * wob;
      dy += py * wob;
    }

    if (e.kind.skill === 'blink') {
      e.blinkTimer -= dt;
      if (e.blinkTimer <= 0) {
        e.blinkTimer = 2 + rand() * 2.2;
        const side = rand() < 0.5 ? 1 : -1;
        const jx = e.x + -dy * 120 * side;
        const jy = e.y + dx * 120 * side;
        if (world.isPassable(jx, jy)) {
          burst(e.x, e.y, '#7c3aed', 8, 140);
          e.x = jx;
          e.y = jy;
          burst(e.x, e.y, '#7c3aed', 8, 140);
        }
      }
    }

    if (e.kind.skill === 'cloak') {
      // Visible only when close to the party, or freshly hit.
      const near = Math.hypot(party.x - e.x, party.y - e.y);
      const want = near < 330 ? 1 : 0;
      e.seen += (want - e.seen) * Math.min(1, dt * 3);
    } else {
      e.seen = 1;
    }

    const mag = Math.hypot(dx, dy) || 1;
    const step = e.kind.speed * dt;
    const nx = e.x + (dx / mag) * step;
    const ny = e.y + (dy / mag) * step;
    if (world.isPassable(nx, e.y)) e.x = nx;
    if (world.isPassable(e.x, ny)) e.y = ny;
    e.facing = dx > 0 ? 1 : -1;
    return d;
  }

  /* ── Frame ──────────────────────────────────────────────── */

  function update(dt, party) {
    state.fireTimer = Math.max(0, state.fireTimer - dt);
    state.invuln = Math.max(0, state.invuln - dt);
    state.shake = Math.max(0, state.shake - dt * 3.4);
    state.bannerTimer = Math.max(0, state.bannerTimer - dt);
    if (state.bannerTimer === 0) state.banner = null;

    for (const f of state.floats) {
      f.life -= dt * 1.15;
      f.y -= dt * 26;
    }
    state.floats = state.floats.filter(f => f.life > 0);

    if (state.dead) return;

    if (state.routed > 0) {
      state.routed = Math.max(0, state.routed - dt);
      if (state.routed === 0) {
        state.enemies.length = 0;
        state.shots.length = 0;
        state.hp = COMBAT.maxHp;
        state.invuln = COMBAT.invuln * 2;
        state.peace = COMBAT.peace;
      }
      return;
    }

    state.peace = Math.max(0, state.peace - dt);

    if (state.mission) {
      updateMission(dt, party);
    } else {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0 && state.peace === 0) {
        state.spawnTimer = roamGap();
        if (!inSanctuary(party.x, party.y) && state.enemies.length < roamCap()) spawnWanderer(party.x, party.y);
      }
    }

    const m = state.mission;
    const guarded = inSanctuary(party.x, party.y);

    for (const e of state.enemies) {
      e.hurt = Math.max(0, e.hurt - dt * 4);
      e.phase += dt * 6;
      e.strikeTimer = Math.max(0, e.strikeTimer - dt);

      if (m && !m.done) {
        const d = steer(e, dt, m.keep, party);
        if (d < COMBAT.keepReach && e.strikeTimer === 0) {
          e.strikeTimer = COMBAT.keepHitGap;
          damageKeep(e.kind.skill === 'siege' ? 2 : 1);
        }
        // The party is an obstacle, not a target: barging past costs a shove.
        const pd = Math.hypot(party.x - e.x, party.y - e.y);
        if (pd < COMBAT.contactRange) {
          const k = COMBAT.knockback / (pd || 1);
          state.knock = { x: (party.x - e.x) * k * dt, y: (party.y - e.y) * k * dt };
        }
        continue;
      }

      // Free roam: they come for you, and shy off a keep's lands.
      const goal = guarded
        ? { x: e.x * 2 - party.x, y: e.y * 2 - party.y }
        : party;
      const d = steer(e, dt, goal, party);

      if (!guarded && d < COMBAT.contactRange && state.invuln === 0) {
        state.hp -= COMBAT.contactDamage;
        state.invuln = COMBAT.invuln;
        state.shake = 1;
        burst(party.x, party.y - 10, '#9b2c1f', 10, 170);
        if (state.hp <= 0) {
          state.hp = 0;
          state.routed = 1.2;
          return;
        }
      }
    }

    for (const s of state.shots) {
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.spin += dt * 15;

      for (const e of state.enemies) {
        if (e.hp <= 0 || s.hits >= s.pierce) continue;
        if (Math.hypot(e.x - s.x, e.y - s.y) > e.kind.radius + 8) continue;
        s.hits += 1;
        const landed = damage(e, s.damage, s.x, s.y);

        if (landed && s.splash) {
          burst(s.x, s.y, '#c2410c', 14, 190);
          for (const other of state.enemies) {
            if (other === e || other.hp <= 0) continue;
            if (Math.hypot(other.x - s.x, other.y - s.y) <= s.splash) damage(other, 1, other.x, other.y);
          }
        }
        if (!landed || s.hits >= s.pierce) s.life = 0;
        break;
      }
    }

    state.shots = state.shots.filter(s => s.life > 0);
    state.enemies = state.enemies.filter(
      e => e.hp > 0 && (state.mission || Math.hypot(e.x - party.x, e.y - party.y) < COMBAT.despawn),
    );

    for (const s of state.sparks) {
      s.life -= dt * 2.1;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.92;
      s.vy *= 0.92;
    }
    state.sparks = state.sparks.filter(s => s.life > 0);
  }

  function reset() {
    state.hp = COMBAT.maxHp;
    state.invuln = COMBAT.invuln * 2;
    state.peace = COMBAT.peace;
    state.dead = false;
    state.routed = 0;
    state.enemies.length = 0;
    state.shots.length = 0;
    state.sparks.length = 0;
    state.floats.length = 0;
    state.mission = null;
    state.tools = [DEFAULT_TOOL];
    state.toolIndex = 0;
    state.tool = DEFAULT_TOOL;
  }

  /* ── Drawing (screen space; caller supplies the projection) ── */

  function drawEnemy(ctx, e, toScreen, z, t) {
    const [sx, sy] = toScreen(e.x, e.y);
    const s = (0.62 + 0.38 * z) * 1.35 * (e.kind.radius / 15) ** 0.55;
    const alpha = e.kind.skill === 'cloak' ? 0.18 + e.seen * 0.82 : 1;
    const bob = Math.sin(e.phase) * 2;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(sx, sy);
    ctx.scale(s, s);

    ctx.fillStyle = 'rgba(75, 59, 38, 0.24)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 10, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(0, -Math.abs(bob) * 0.6);
    ctx.scale(e.facing, 1);
    ctx.strokeStyle = '#2b1d10';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.fillStyle = e.hurt > 0 ? '#ffffff' : e.kind.colour;
    drawIncident(ctx, e, t);
    ctx.restore();

    if (alpha < 0.35) return;            // still hidden: no bar, no name

    if (e.kind.elite) {
      ctx.save();
      ctx.globalAlpha = alpha * (0.45 + Math.sin(t * 4) * 0.2);
      ctx.strokeStyle = e.kind.colour;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy - 8 * s, 26 * s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (e.hp < e.maxHp) {
      const w = 28;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(64, 49, 29, 0.35)';
      ctx.fillRect(sx - w / 2, sy - 40 * s, w, 4);
      ctx.fillStyle = e.kind.colour;
      ctx.fillRect(sx - w / 2, sy - 40 * s, (w * e.hp) / e.maxHp, 4);
      ctx.restore();
    }

    // Skip the name for anything already at the walls: it would just pile up
    // on top of the keep's own plate.
    const atKeep = state.mission && Math.hypot(e.x - state.mission.keep.x, e.y - state.mission.keep.y) < 110;
    if (!atKeep) {
      ctx.save();
      ctx.globalAlpha = alpha * 0.85;
      ctx.font = '600 10px Georgia, "Times New Roman", serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(58, 44, 26, 0.8)';
      ctx.fillText(e.kind.name, sx, sy + 16 * s);
      ctx.restore();
    }
  }

  function drawShot(ctx, s, toScreen, z) {
    const [sx, sy] = toScreen(s.x, s.y);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(Math.atan2(s.vy, s.vx));
    ctx.scale(z, z);
    ctx.strokeStyle = '#3a2c1a';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    drawTool(ctx, s);
    ctx.restore();
  }

  /** `layer` is 'actors' (incidents) or 'fx' (shots, sparks, floating text). */
  function draw(ctx, toScreen, z, t, layer) {
    if (layer === 'actors') {
      for (const e of state.enemies) drawEnemy(ctx, e, toScreen, z, t);
      return;
    }

    for (const s of state.shots) drawShot(ctx, s, toScreen, z);

    ctx.save();
    for (const s of state.sparks) {
      const [sx, sy] = toScreen(s.x, s.y);
      ctx.globalAlpha = Math.max(0, s.life) * 0.85;
      ctx.fillStyle = s.colour;
      ctx.beginPath();
      ctx.arc(sx, sy, 3.4 * s.life * z + 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.font = '700 13px Georgia, "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    for (const f of state.floats) {
      const [sx, sy] = toScreen(f.x, f.y);
      ctx.globalAlpha = Math.min(1, f.life * 1.6);
      ctx.strokeStyle = 'rgba(243, 233, 208, 0.85)';
      ctx.strokeText(f.text, sx, sy);
      ctx.fillStyle = f.colour;
      ctx.fillText(f.text, sx, sy);
    }
    ctx.restore();
  }

  return {
    state,
    update,
    draw,
    fire,
    nearest,
    reset,
    say,
    inSanctuary,
    startMission,
    abandonMission,
    selectTool,
    damageKeep,
    /** Set by update() when an incident shoulders the party aside. */
    takeKnock() {
      const k = state.knock;
      state.knock = null;
      return k;
    },
  };
}
