/* The playable half of the portfolio: camera, party movement, keeps, cards. */

import { generateWorld } from './worldgen.js';
import { paintWorld, PALETTE } from './cartography.js';
import { createCombat, COMBAT } from './combat.js';
import { createAmbience } from './ambience.js';
import { createFog } from './fog.js';
import { deviceProfile } from './device.js';
import { toolGlyph } from './bestiary.js';
import { inline } from '../text.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;

const NEAR_RADIUS = 165;     // world units — card opens inside this
const LEAVE_RADIUS = 265;    // hysteresis so the card doesn't flicker
const SPEED = 300;           // world units per second
const MIN_ZOOM = 0.5;

/** Hand the main thread back so the loading state can actually paint. */
const breathe = () => new Promise(resolve => setTimeout(resolve, 0));

export async function createMapView(data, { onSwitchToDoc }) {
  const canvas = document.getElementById('map-canvas');
  // The sheet always covers the viewport, so the canvas never needs to be
  // composited as transparent.
  const ctx = canvas.getContext('2d', { alpha: false });
  const cardEl = document.getElementById('castle-card');
  const cardBody = document.getElementById('castle-card-body');
  const logEl = document.getElementById('map-log');
  const hintEl = document.getElementById('map-hint');
  const stickEl = document.getElementById('map-stick');

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const device = deviceProfile();
  const MAX_ZOOM = device.maxZoom;

  const world = await generateWorld(data, breathe);
  await breathe();
  const sheet = await paintWorld(world, device.sheetScale, breathe);
  await breathe();
  const combat = createCombat(world, { tools: data.tools, incidents: data.incidents });
  const ambience = createAmbience(world, data.map.seed || 1);
  const fog = createFog();
  const byId = new Map(world.castles.map(c => [c.id, c]));

  const start = world.castles[0];
  // Start on safe ground just outside the first keep's gate: close enough to
  // be sheltered, far enough that the chronicle card does not fire on load.
  const state = {
    px: start.x - 150,
    py: start.y + 130,
    facing: 1,
    heading: [1, 0],
    speed: 0,
    walk: 0,
    dust: [],
    mouse: null,
    ending: null,
    completed: new Set(),
    camX: start.x,
    camY: start.y,
    zoom: 2,
    keys: new Set(),
    stick: null,
    target: null,
    active: null,
    dismissed: null,
    visited: new Set(),
    trail: [],
    running: false,
    dpr: 1,
    cw: 0,
    ch: 0,
    t: 0,
  };

  if (!world.isPassable(state.px, state.py)) {
    // Spiral outward for the nearest dry spot that is still clear of the walls.
    outer: for (let r = 40; r < 900; r += 40) {
      for (let a = 0; a < 24; a++) {
        const ang = (a / 24) * Math.PI * 2;
        const x = start.x + Math.cos(ang) * r;
        const y = start.y + Math.sin(ang) * r;
        if (r > NEAR_RADIUS && r < 260 && world.isPassable(x, y)) { state.px = x; state.py = y; break outer; }
      }
    }
  }

  /* ── Sizing ─────────────────────────────────────────────── */

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, device.dprCap);
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Bilinear is plenty for a hand-drawn sheet, and 'high' costs several
    // milliseconds per frame on the blit — it is a multi-step downsample.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'low';
    state.dpr = dpr;
    state.cw = w;
    state.ch = h;
    state.zoom = clamp(state.zoom, minZoom(), MAX_ZOOM);
  }

  const minZoom = () => Math.max(MIN_ZOOM, state.cw / world.width, state.ch / world.height);

  function viewRect() {
    const z = state.zoom;
    const vw = state.cw / z;
    const vh = state.ch / z;
    // A short kick when the party takes a hit — read as impact, not drift.
    const k = combat.state.shake;
    const jx = k ? Math.sin(state.t * 61) * k * 9 : 0;
    const jy = k ? Math.cos(state.t * 47) * k * 9 : 0;
    const sx = clamp(state.camX - vw / 2 + jx, 0, Math.max(0, world.width - vw));
    const sy = clamp(state.camY - vh / 2 + jy, 0, Math.max(0, world.height - vh));
    return { sx, sy, vw, vh, z };
  }

  const toScreen = (x, y, r) => [(x - r.sx) * r.z, (y - r.sy) * r.z];
  const toWorld = (x, y, r) => [x / r.z + r.sx, y / r.z + r.sy];

  /* ── Drawing ────────────────────────────────────────────── */

  /* ── Keep silhouettes ───────────────────────────────────
     Each terrain gets its own shape so no two keeps read alike. */

  function keepShell(ctx, fill) {
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.fillStyle = fill;
  }

  function crenellate(ctx, x0, x1, y, teeth) {
    const step = (x1 - x0) / (teeth * 2 - 1);
    ctx.beginPath();
    for (let i = 0; i < teeth; i++) ctx.rect(x0 + i * step * 2, y, step, 3.2);
    ctx.fill();
    ctx.stroke();
  }

  const KEEP_SHAPES = {
    /* Harbour keep: round drum tower, conical roof, a jetty running out. */
    coast(ctx, fill) {
      keepShell(ctx, fill);
      ctx.beginPath();                    // jetty
      ctx.moveTo(-30, 3);
      ctx.lineTo(-15, 3);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-28 + i * 6, 3);
        ctx.lineTo(-28 + i * 6, 7);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.rect(-15, -12, 24, 15);
      ctx.fill();
      ctx.stroke();
      crenellate(ctx, -15, 9, -15, 4);
      ctx.beginPath();                    // drum tower
      ctx.arc(13, -14, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(5, -14, 16, 17);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();                    // conical roof
      ctx.moveTo(3, -21);
      ctx.lineTo(13, -34);
      ctx.lineTo(23, -21);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      return { x: 13, y: -34 };
    },

    /* Mountain citadel: stepped curtain walls climbing to a tall keep. */
    mountain(ctx, fill) {
      keepShell(ctx, fill);
      ctx.beginPath();
      ctx.rect(-24, -10, 18, 13);
      ctx.fill();
      ctx.stroke();
      crenellate(ctx, -24, -6, -13, 3);
      ctx.beginPath();
      ctx.rect(-8, -19, 17, 22);
      ctx.fill();
      ctx.stroke();
      crenellate(ctx, -8, 9, -22, 3);
      ctx.beginPath();                    // great tower
      ctx.rect(11, -32, 13, 35);
      ctx.fill();
      ctx.stroke();
      crenellate(ctx, 11, 24, -35, 3);
      ctx.beginPath();                    // arrow slits
      ctx.strokeStyle = 'rgba(75, 59, 38, 0.7)';
      ctx.moveTo(17, -26);
      ctx.lineTo(17, -21);
      ctx.moveTo(17, -16);
      ctx.lineTo(17, -11);
      ctx.stroke();
      ctx.strokeStyle = PALETTE.ink;
      return { x: 17.5, y: -35 };
    },

    /* Forest hold: timber palisade, low roofs, twin gate posts. */
    forest(ctx, fill) {
      keepShell(ctx, fill);
      ctx.beginPath();                    // palisade
      ctx.moveTo(-24, 3);
      for (let i = 0; i < 8; i++) {
        const x = -24 + i * 6;
        ctx.lineTo(x, -8);
        ctx.lineTo(x + 3, -12);
        ctx.lineTo(x + 6, -8);
      }
      ctx.lineTo(24, 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();                    // hall behind the palisade
      ctx.rect(-9, -22, 18, 12);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();                    // pitched roof
      ctx.moveTo(-12, -22);
      ctx.lineTo(0, -32);
      ctx.lineTo(12, -22);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      return { x: 0, y: -32 };
    },

    /* Valley watch: a single square tower and a gatehouse arch. */
    valley(ctx, fill) {
      keepShell(ctx, fill);
      ctx.beginPath();
      ctx.rect(-22, -13, 20, 16);
      ctx.fill();
      ctx.stroke();
      crenellate(ctx, -22, -2, -16, 3);
      ctx.beginPath();                    // gate arch
      ctx.moveTo(-16, 3);
      ctx.lineTo(-16, -4);
      ctx.arc(-12, -4, 4, Math.PI, 0);
      ctx.lineTo(-8, 3);
      ctx.fillStyle = 'rgba(75, 59, 38, 0.55)';
      ctx.fill();
      keepShell(ctx, fill);
      ctx.beginPath();                    // watch tower
      ctx.rect(2, -28, 15, 31);
      ctx.fill();
      ctx.stroke();
      crenellate(ctx, 2, 17, -31, 3);
      ctx.beginPath();                    // hoarding
      ctx.rect(0, -22, 19, 4);
      ctx.fill();
      ctx.stroke();
      return { x: 9.5, y: -31 };
    },
  };

  function drawCastle(c, r) {
    const [sx, sy] = toScreen(c.x, c.y, r);
    if (sx < -180 || sy < -180 || sx > state.cw + 180 || sy > state.ch + 180) return;

    const s = (c.size === 'large' ? 1.75 : 1.5) * (0.62 + 0.38 * r.z);
    const isActive = state.active === c.id;
    const seen = state.visited.has(c.id);
    const shape = KEEP_SHAPES[c.terrain] || KEEP_SHAPES.valley;
    const mission = combat.state.mission;
    const besieged = mission && !mission.done && mission.id === c.id;
    const integrity = besieged ? mission.keepHp / mission.keepMaxHp : 1;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(s, s);

    ctx.fillStyle = 'rgba(75, 59, 38, 0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 4, 26, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Walls darken and soot up as the keep is worn down.
    const wall = besieged
      ? `rgb(${Math.round(247 - 60 * (1 - integrity))}, ${Math.round(241 - 90 * (1 - integrity))}, ${Math.round(224 - 100 * (1 - integrity))})`
      : (seen ? '#f7f1e0' : '#e6dcc2');
    const mast = shape(ctx, wall);

    if (besieged && integrity < 0.999) {
      ctx.save();
      ctx.strokeStyle = 'rgba(155, 44, 31, 0.85)';
      ctx.lineWidth = 1.3;
      ctx.lineCap = 'round';
      const breaks = Math.min(6, Math.ceil((1 - integrity) * 8));
      for (let i = 0; i < breaks; i++) {
        const bx = -18 + (i * 37) / Math.max(1, breaks - 1);
        ctx.beginPath();
        ctx.moveTo(bx, -2);
        ctx.lineTo(bx + 3, -8 - (i % 3) * 3);
        ctx.lineTo(bx - 1, -13 - (i % 2) * 4);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Banner in the company colour, flying from the tallest point.
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(mast.x, mast.y);
    ctx.lineTo(mast.x, mast.y - 15);
    ctx.stroke();
    const flutter = Math.sin(state.t * 2.6 + c.x * 0.01) * 2.2;
    ctx.beginPath();
    ctx.moveTo(mast.x, mast.y - 15);
    ctx.lineTo(mast.x + 13 + flutter, mast.y - 11.5);
    ctx.lineTo(mast.x + 3, mast.y - 8);
    ctx.closePath();
    ctx.fillStyle = c.banner;
    ctx.globalAlpha = seen ? 1 : 0.5;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
    ctx.restore();

    if (besieged) {
      // Integrity ring: how much of the wall is still standing.
      ctx.save();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(64, 49, 29, 0.22)';
      ctx.beginPath();
      ctx.arc(sx, sy - 6 * s, 40 * s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = integrity > 0.3 ? '#3f6212' : '#9b2c1f';
      ctx.beginPath();
      ctx.arc(sx, sy - 6 * s, 40 * s, -Math.PI / 2, -Math.PI / 2 + integrity * Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (isActive) {
      ctx.save();
      ctx.strokeStyle = c.banner;
      ctx.globalAlpha = 0.35 + Math.sin(state.t * 3) * 0.12;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 6]);
      ctx.beginPath();
      ctx.arc(sx, sy - 6 * s, 34 * s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Name plate — constant screen size so it stays legible at any zoom.
    const label = c.name.toUpperCase();
    ctx.save();
    ctx.font = '600 13px Georgia, "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(label).width * 1.06;
    const ly = sy + 16 * s;
    ctx.fillStyle = 'rgba(243, 233, 208, 0.9)';
    ctx.strokeStyle = isActive ? c.banner : 'rgba(75, 59, 38, 0.45)';
    ctx.lineWidth = isActive ? 1.6 : 1;
    ctx.beginPath();
    ctx.roundRect(sx - tw / 2 - 9, ly - 10, tw + 18, 20, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = PALETTE.ink;
    ctx.fillText(label, sx, ly + 0.5);
    ctx.restore();
  }

  /* ── The party ──────────────────────────────────────────── */

  function drawParty(r) {
    const [sx, sy] = toScreen(state.px, state.py, r);
    const s = (0.62 + 0.38 * r.z) * 1.35;
    const moving = state.speed > 6;

    // Ink-dot trail of the road already walked.
    ctx.save();
    state.trail.forEach((p, i) => {
      const [tx, ty] = toScreen(p.x, p.y, r);
      ctx.globalAlpha = (i / state.trail.length) * 0.24;
      ctx.fillStyle = '#5b4224';
      ctx.beginPath();
      ctx.arc(tx, ty, 1.9 * s, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // Dust kicked up on the stride.
    ctx.save();
    for (const puff of state.dust) {
      const [dx, dy] = toScreen(puff.x, puff.y, r);
      ctx.globalAlpha = puff.life * 0.3;
      ctx.fillStyle = '#b09566';
      ctx.beginPath();
      ctx.arc(dx, dy, (1 - puff.life) * 7 * s + 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    const cycle = state.walk;
    const stride = moving ? Math.sin(cycle) : 0;
    const bob = moving ? Math.abs(Math.sin(cycle)) * 1.6 : Math.sin(state.t * 1.9) * 0.5;
    const lean = moving ? state.heading[0] * 1.4 : 0;
    const backView = state.heading[1] < -0.55;   // walking away from the reader

    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(s, s);

    ctx.fillStyle = 'rgba(75, 59, 38, 0.26)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 8.5 - Math.abs(stride) * 1.2, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(0, -bob);
    ctx.save();
    ctx.scale(state.facing, 1);
    ctx.rotate(lean * 0.02 * state.facing);

    ctx.strokeStyle = '#3a2c1a';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';

    // Legs: a two-beat stride under the cloak.
    ctx.beginPath();
    ctx.moveTo(-1, -4);
    ctx.lineTo(-1 + stride * 3.4, 2);
    ctx.moveTo(1, -4);
    ctx.lineTo(1 - stride * 3.4, 2);
    ctx.stroke();

    // Cloak, swinging opposite the legs.
    ctx.fillStyle = '#8d3b2f';
    ctx.beginPath();
    ctx.moveTo(-6.5, -2 + stride * 0.6);
    ctx.quadraticCurveTo(-5.5, -11, 0, -11);
    ctx.quadraticCurveTo(5.5, -11, 6.5, -2 - stride * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Arm swing.
    ctx.beginPath();
    ctx.moveTo(3.5, -8);
    ctx.lineTo(4.5 - stride * 2.2, -3.5);
    ctx.stroke();

    // Head: hooded from behind, face forward.
    ctx.fillStyle = backView ? '#8d3b2f' : '#e8d9b8';
    ctx.beginPath();
    ctx.arc(0, -12.5, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (!backView) {
      ctx.fillStyle = '#3a2c1a';
      ctx.beginPath();
      ctx.arc(1.6, -13, 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // The standard, always upright and fluttering.
    ctx.strokeStyle = '#3a2c1a';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(5 * state.facing, -2);
    ctx.lineTo(7 * state.facing, -24);
    ctx.stroke();
    const wave = Math.sin(state.t * (moving ? 8 : 3.4)) * 1.6;
    ctx.beginPath();
    ctx.moveTo(7 * state.facing, -24);
    ctx.lineTo((17 + wave) * state.facing, -21);
    ctx.lineTo(7 * state.facing, -17.5);
    ctx.closePath();
    ctx.fillStyle = '#1d4ed8';
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawTargetPin(r) {
    if (!state.target) return;
    const [sx, sy] = toScreen(state.target.x, state.target.y, r);
    const k = (Math.sin(state.t * 6) + 1) / 2;
    ctx.save();
    ctx.strokeStyle = 'rgba(157, 62, 47, 0.85)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(sx, sy, 7 + k * 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx - 6, sy);
    ctx.lineTo(sx + 6, sy);
    ctx.moveTo(sx, sy - 6);
    ctx.lineTo(sx, sy + 6);
    ctx.stroke();
    ctx.restore();
  }

  function render() {
    const r = viewRect();
    if (state.ending) {
      drawCollapse(r, clamp(state.ending.t / state.ending.dur, 0, 1));
      return;
    }
    const k = sheet.scale;
    ctx.drawImage(sheet.canvas, r.sx * k, r.sy * k, r.vw * k, r.vh * k, 0, 0, state.cw, state.ch);
    ambience.drawGround(ctx, r, state.t);
    drawTargetPin(r);
    for (const c of world.castles) drawCastle(c, r);

    const project = (x, y) => toScreen(x, y, r);
    combat.draw(ctx, project, r.z, state.t, 'actors');
    drawParty(r);
    combat.draw(ctx, project, r.z, state.t, 'fx');
    ambience.drawSky(ctx, r, state.t);

    // The lantern rides with the party, so it is drawn last and centred on it.
    const [lx, ly] = toScreen(state.px, state.py, r);
    fog.draw(ctx, lx, ly, state.cw, state.ch, Math.sin(state.t * 2.7) + Math.sin(state.t * 4.1));
  }

  /* ── Simulation ─────────────────────────────────────────── */

  function axisFromInput() {
    let ax = 0;
    let ay = 0;
    const k = state.keys;
    if (k.has('a') || k.has('arrowleft')) ax -= 1;
    if (k.has('d') || k.has('arrowright')) ax += 1;
    if (k.has('w') || k.has('arrowup')) ay -= 1;
    if (k.has('s') || k.has('arrowdown')) ay += 1;
    if (state.stick) {
      ax += state.stick.x;
      ay += state.stick.y;
    }
    return [ax, ay];
  }

  function step(dt) {
    let [ax, ay] = axisFromInput();

    if (ax || ay) state.target = null;
    else if (state.target) {
      const dx = state.target.x - state.px;
      const dy = state.target.y - state.py;
      const d = Math.hypot(dx, dy);
      if (d < 6) state.target = null;
      else { ax = dx / d; ay = dy / d; }
    }

    const mag = Math.hypot(ax, ay);
    const before = { x: state.px, y: state.py };

    if (mag > 0) {
      ax /= mag;
      ay /= mag;
      state.heading = [ax, ay];
      if (Math.abs(ax) > 0.15) state.facing = ax > 0 ? 1 : -1;
      const dist = SPEED * dt;
      const nx = clamp(state.px + ax * dist, 8, world.width - 8);
      const ny = clamp(state.py + ay * dist, 8, world.height - 8);

      // Axis-separated movement so the coastline slides instead of sticking.
      if (world.isPassable(nx, state.py)) state.px = nx;
      if (world.isPassable(state.px, ny)) state.py = ny;
      hideHint();
    }

    // Actual travelled distance drives the animation, so bumping into a
    // coastline stops the legs instead of running on the spot.
    const moved = Math.hypot(state.px - before.x, state.py - before.y);
    state.speed = dt > 0 ? moved / dt : 0;
    state.walk += (state.speed / 70) * dt * Math.PI * 2;

    if (moved > 0.5) {
      const last = state.trail[state.trail.length - 1];
      if (!last || Math.hypot(last.x - state.px, last.y - state.py) > 30) {
        state.trail.push({ x: state.px, y: state.py });
        if (state.trail.length > 26) state.trail.shift();
        state.dust.push({ x: before.x, y: before.y + 2, life: 1 });
      }
    }

    for (const puff of state.dust) puff.life -= dt * 1.6;
    state.dust = state.dust.filter(p => p.life > 0);

    const follow = reduced ? 1 : 1 - Math.pow(0.0015, dt);
    state.camX = lerp(state.camX, state.px, follow);
    state.camY = lerp(state.camY, state.py, follow);

    checkProximity();

    // A defended keep is lit by its own braziers; the road is not.
    fog.setReach(combat.state.mission ? 0.95 : 0.58);
    fog.update(dt);
    ambience.update(dt);
    const wasRouted = combat.state.routed > 0;
    combat.update(dt, { x: state.px, y: state.py });
    const knock = combat.takeKnock();
    if (knock) {
      const kx = clamp(state.px + knock.x, 8, world.width - 8);
      const ky = clamp(state.py + knock.y, 8, world.height - 8);
      if (world.isPassable(kx, state.py)) state.px = kx;
      if (world.isPassable(state.px, ky)) state.py = ky;
    }

    if (combat.state.dead && !state.ending) beginCollapse();
    if (wasRouted && combat.state.routed === 0) fallBackToKeep();
    syncCombatHud();
  }

  /** A free-roam wipe is a setback, not an ending: retreat to a keep. */
  function fallBackToKeep() {
    let best = world.castles[0];
    let bestD = Infinity;
    for (const c of world.castles) {
      const d = Math.hypot(c.x - state.px, c.y - state.py);
      if (d < bestD) { bestD = d; best = c; }
    }
    state.px = best.x;
    state.py = best.y + 90;
    state.target = null;
    state.trail.length = 0;
    state.dust.length = 0;
    state.camX = state.px;
    state.camY = state.py;
    combat.say('Driven back to the keep', 2.6);
  }

  function checkProximity() {
    // While a mission is under way the card would reopen every frame at the
    // very keep being defended.
    if (combat.state.mission) return;

    let nearest = null;
    let best = Infinity;
    for (const c of world.castles) {
      const d = Math.hypot(c.x - state.px, c.y - state.py);
      if (d < best) { best = d; nearest = c; }
    }
    if (!nearest) return;

    if (best < NEAR_RADIUS) {
      if (state.dismissed !== nearest.id && state.active !== nearest.id) openCard(nearest.id);
    } else if (best > LEAVE_RADIUS) {
      state.dismissed = null;
      if (state.active) closeCard();
    }
  }

  /* ── Frame budget governor ──────────────────────────────────
     Detail is dropped when frames start costing too much and restored when
     they get cheap again, so a slow phone degrades instead of stuttering. */
  let quality = device.quality;
  let frameAvg = 16;
  let governorTick = 0;
  ambience.setQuality(quality);

  function governFrames(rawMs) {
    if (rawMs > 0 && rawMs < 250) frameAvg += (rawMs - frameAvg) * 0.06;
    if (++governorTick < 45) return;
    governorTick = 0;
    if (frameAvg > 26 && quality > 0) ambience.setQuality(--quality);
    else if (frameAvg < 13 && quality < device.quality) ambience.setQuality(++quality);
  }

  let last = 0;
  function frame(now) {
    if (!state.running) return;
    const raw = now - last;
    const dt = Math.min(raw / 1000 || 0, 0.05);
    last = now;
    governFrames(raw);
    state.t = now / 1000;
    if (state.ending) {
      state.ending.t += dt;
      render();
      if (state.ending.t >= state.ending.dur) { show500(); return; }
      requestAnimationFrame(frame);
      return;
    }
    step(dt);
    render();
    requestAnimationFrame(frame);
  }

  /* ── Collapse and the 500 ───────────────────────────────── */

  const errorEl = document.getElementById('error-500');
  const easeIn = p => p * p * p;

  /** Jagged fissures radiating from wherever the party fell. */
  function makeCracks(originX, originY) {
    const cracks = [];
    for (let i = 0; i < 9; i++) {
      const pts = [[originX, originY]];
      let ang = (i / 9) * Math.PI * 2 + Math.random() * 0.4;
      let x = originX;
      let y = originY;
      for (let step = 0; step < 14; step++) {
        ang += (Math.random() - 0.5) * 0.9;
        const len = 60 + Math.random() * 130;
        x += Math.cos(ang) * len;
        y += Math.sin(ang) * len;
        pts.push([x, y]);
      }
      cracks.push(pts);
    }
    return cracks;
  }

  function beginCollapse() {
    state.ending = { t: 0, dur: 2.9, cracks: makeCracks(state.px, state.py) };
    state.target = null;
    state.keys.clear();
    closeCard();
  }

  function drawCollapse(r, p) {
    ctx.fillStyle = '#0a0806';
    ctx.fillRect(0, 0, state.cw, state.ch);

    // The engraving tears into slices and slides apart.
    const slices = 16;
    const h = state.ch / slices;
    const shear = easeIn(clamp((p - 0.22) / 0.6, 0, 1));
    for (let i = 0; i < slices; i++) {
      const dir = i % 2 ? 1 : -1;
      const off = shear * dir * state.cw * (0.3 + ((i * 7) % 5) / 5);
      const drop = shear * state.ch * 0.22 * (((i * 3) % 4) / 4);
      ctx.save();
      ctx.globalAlpha = 1 - shear * 0.35;
      const k = sheet.scale;
      ctx.drawImage(
        sheet.canvas,
        r.sx * k, (r.sy + (i * h) / r.z) * k, r.vw * k, (h / r.z + 1) * k,
        off, i * h + drop, state.cw, h + 1,
      );
      ctx.restore();
    }

    // Fissures, glowing hotter as it goes.
    const grow = clamp(p / 0.45, 0, 1);
    ctx.save();
    ctx.lineCap = 'round';
    for (const crack of state.ending.cracks) {
      const upTo = Math.max(2, Math.floor(crack.length * grow));
      for (const [width, colour, alpha] of [[9, '#f97316', 0.5], [3.4, '#fde68a', 0.95]]) {
        ctx.strokeStyle = colour;
        ctx.globalAlpha = alpha * (1 - p * 0.3);
        ctx.lineWidth = width * r.z * 0.6;
        ctx.beginPath();
        for (let i = 0; i < upTo; i++) {
          const [wx, wy] = crack[i];
          const [px2, py2] = toScreen(wx, wy, r);
          if (i === 0) ctx.moveTo(px2, py2);
          else ctx.lineTo(px2, py2);
        }
        ctx.stroke();
      }
    }
    ctx.restore();

    // Ash, then the wash-out.
    ctx.save();
    ctx.globalAlpha = clamp((p - 0.15) * 1.1, 0, 0.75);
    ctx.fillStyle = '#120c05';
    ctx.fillRect(0, 0, state.cw, state.ch);
    ctx.restore();

    if (p > 0.82) {
      ctx.save();
      ctx.globalAlpha = clamp((p - 0.82) / 0.18, 0, 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, state.cw, state.ch);
      ctx.restore();
    }
  }

  function show500() {
    state.running = false;
    errorEl.hidden = false;
    document.body.dataset.view = 'error';
    detachKeys();
  }

  /** Put the party and the world back to a clean starting state. */
  function resetWorldState() {
    state.ending = null;
    state.target = null;
    combat.reset();
    const keep = world.castles[0];
    state.px = keep.x;
    state.py = keep.y + 90;
    state.camX = state.px;
    state.camY = state.py;
    state.trail.length = 0;
    state.dust.length = 0;
  }

  function restart() {
    errorEl.hidden = true;
    document.body.dataset.view = 'map';
    resetWorldState();
    api.activate();
    combat.say('The world is redrawn. Ride on.', 3);
  }

  document.getElementById('error-restart').addEventListener('click', restart);

  /* ── Card + log ─────────────────────────────────────────── */

  function openCard(id) {
    const c = byId.get(id);
    if (!c) return;
    state.active = id;
    state.visited.add(id);

    const e = c.entry;
    cardBody.replaceChildren();

    const head = document.createElement('header');
    head.className = 'castle-card__head';
    head.style.setProperty('--banner', c.banner);

    const keep = document.createElement('p');
    keep.className = 'castle-card__keep';
    keep.textContent = c.name;
    const role = document.createElement('h2');
    role.textContent = e.role;
    const org = document.createElement('p');
    org.className = 'castle-card__org';
    org.textContent = e.company;
    head.append(keep, role, org);

    const meta = document.createElement('p');
    meta.className = 'castle-card__meta';
    meta.textContent = [e.period, e.duration, e.badge, e.location].filter(Boolean).join(' · ');
    head.appendChild(meta);

    if (e.castle?.motto) {
      const motto = document.createElement('p');
      motto.className = 'castle-card__motto';
      motto.textContent = `“${e.castle.motto}”`;
      head.appendChild(motto);
    }

    renderMissionBlock(c);

    const list = document.createElement('ul');
    list.className = 'castle-card__bullets';
    for (const b of e.bullets || []) {
      const li = document.createElement('li');
      li.appendChild(inline(b));
      list.appendChild(li);
    }

    cardBody.append(head, missionEl, list);

    if (e.stack?.length) {
      const tags = document.createElement('ul');
      tags.className = 'castle-card__stack';
      for (const t of e.stack) {
        const li = document.createElement('li');
        li.textContent = t;
        tags.appendChild(li);
      }
      cardBody.appendChild(tags);
    }

    cardEl.hidden = false;
    requestAnimationFrame(() => cardEl.classList.add('is-open'));
    syncLog();
  }

  /* ── Missions ───────────────────────────────────────────── */

  const missionEl = document.getElementById('castle-mission');

  function renderMissionBlock(c) {
    const cfg = c.entry.mission;
    missionEl.replaceChildren();
    missionEl.hidden = !cfg;
    if (!cfg) return;

    const head = document.createElement('p');
    head.className = 'castle-card__mission-name';
    head.textContent = cfg.name;

    const brief = document.createElement('p');
    brief.className = 'castle-card__mission-brief';
    brief.textContent = cfg.brief;
    missionEl.append(head, brief);

    // The whole point of the fight: which tool answers which incident.
    const pairs = (cfg.incidents || [])
      .map(id => data.incidents?.[id])
      .filter(Boolean)
      .map(incident => ({
        incident,
        tool: (cfg.tools || []).find(t => t.domain === incident.weakTo),
      }));

    if (pairs.length) {
      const fold = document.createElement('details');
      fold.className = 'threat-fold';
      const legend = document.createElement('summary');
      legend.textContent = `What is coming — ${pairs.length} kinds, and only the matching tool bites`;
      const table = document.createElement('ul');
      table.className = 'threat-table';
      for (const { incident, tool } of pairs) {
        const li = document.createElement('li');
        const foe = document.createElement('strong');
        foe.textContent = incident.name;
        foe.style.color = incident.colour;
        const answer = document.createElement('span');
        answer.className = 'threat-table__tool';
        answer.textContent = tool ? tool.name : '—';
        const tell = document.createElement('em');
        tell.textContent = incident.tell || '';
        li.append(foe, answer, tell);
        table.appendChild(li);
      }
      fold.append(legend, table);
      missionEl.appendChild(fold);
    }

    const scale = document.createElement('p');
    scale.className = 'castle-card__mission-sub';
    scale.textContent = `${cfg.waves} waves · keep integrity ${cfg.keepHp} · swap tools with 1–${(cfg.tools || []).length || 3}`;

    if (state.completed.has(c.id)) {
      const done = document.createElement('p');
      done.className = 'castle-card__mission-done';
      done.textContent = 'Held. This keep is yours.';
      missionEl.append(scale, done);
      return;
    }

    const accept = document.createElement('button');
    accept.type = 'button';
    accept.className = 'castle-card__accept';
    accept.textContent = 'Accept mission — defend the keep';
    accept.addEventListener('click', () => launchMission(c, cfg));
    missionEl.append(scale, accept);
  }

  function launchMission(c, cfg) {
    combat.startMission({ ...cfg, id: c.id }, { x: c.x, y: c.y });
    state.dismissed = c.id;
    closeCard();
    hideHint();
  }

  function onMissionResolved(id) {
    state.completed.add(id);
    combat.abandonMission();
    // Clear the dismissal set when the mission was accepted, so the card can
    // come straight back with its "held" badge.
    state.dismissed = null;
    syncLog();
  }

  function closeCard() {
    state.active = null;
    cardEl.classList.remove('is-open');
    syncLog();
    setTimeout(() => { if (!state.active) cardEl.hidden = true; }, 240);
  }

  function travelTo(id) {
    const c = byId.get(id);
    if (!c) return;
    state.dismissed = null;
    // Stop just short of the walls so the approach still reads as travel.
    const dx = state.px - c.x;
    const dy = state.py - c.y;
    const d = Math.hypot(dx, dy) || 1;
    const stop = Math.min(d, NEAR_RADIUS * 0.7);
    state.target = { x: c.x + (dx / d) * stop, y: c.y + (dy / d) * stop };
    hideHint();
  }

  function syncLog() {
    for (const li of logEl.children) {
      li.classList.toggle('is-active', li.dataset.id === state.active);
      li.classList.toggle('is-visited', state.visited.has(li.dataset.id));
      li.classList.toggle('is-held', state.completed.has(li.dataset.id));
    }
  }

  function buildLog() {
    logEl.replaceChildren();
    // Newest role first in the list, even though the march runs oldest-first.
    for (const entry of data.experience) {
      const c = byId.get(entry.id);
      if (!c) continue;
      const li = document.createElement('li');
      li.dataset.id = entry.id;
      const btn = document.createElement('button');
      btn.type = 'button';
      const dot = document.createElement('span');
      dot.className = 'map-hud__dot';
      dot.style.background = c.banner;
      const text = document.createElement('span');
      text.className = 'map-hud__text';
      const name = document.createElement('strong');
      name.textContent = entry.company;
      const when = document.createElement('em');
      when.textContent = entry.period;
      text.append(name, when);
      btn.append(dot, text);
      btn.addEventListener('click', () => travelTo(entry.id));
      li.appendChild(btn);
      logEl.appendChild(li);
    }
  }

  const hpEl = document.getElementById('map-hp');
  const partyRowEl = document.getElementById('map-party-row');
  const keepEl = document.getElementById('map-keep');
  const keepValueEl = document.getElementById('map-keep-value');
  const keepBarEl = document.getElementById('map-keep-bar');
  const scoreEl = document.getElementById('map-score');
  const bannerEl = document.getElementById('map-banner');
  const missionHudEl = document.getElementById('map-mission');
  const toolRackEl = document.getElementById('map-tools');
  let lastHp = -1;
  let lastScore = -1;
  let lastBanner = null;
  let lastMissionLine = null;
  let lastKeepHp = -1;
  let rackSignature = '';

  /** Rebuild the tool rack when the set of tools changes, not every frame. */
  const railEl = document.querySelector('.map-rail');

  function syncToolRack() {
    const tools = combat.state.mission ? combat.state.tools : [];
    // A fight needs the rail space more than the standing instructions do.
    railEl.dataset.mission = combat.state.mission ? 'on' : 'off';
    const signature = tools.map(t => t.name).join('|');
    if (signature !== rackSignature) {
      rackSignature = signature;
      toolRackEl.replaceChildren();
      toolRackEl.hidden = tools.length === 0;
      tools.forEach((tool, i) => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.index = String(i);

        const glyph = document.createElement('canvas');
        glyph.width = 26;
        glyph.height = 26;
        glyph.className = 'tool-rack__glyph';
        toolGlyph(glyph.getContext('2d'), tool.kind, 26);

        const text = document.createElement('span');
        const name = document.createElement('strong');
        name.textContent = tool.name;
        const domain = document.createElement('em');
        domain.textContent = (data.domains && data.domains[tool.domain]) || tool.domain || '';
        text.append(name, domain);

        const key = document.createElement('kbd');
        key.textContent = String(i + 1);

        btn.append(glyph, text, key);
        btn.addEventListener('click', () => combat.selectTool(i));
        li.appendChild(btn);
        toolRackEl.appendChild(li);
      });
    }
    for (const li of toolRackEl.children) {
      const btn = li.firstElementChild;
      btn.classList.toggle('is-active', Number(btn.dataset.index) === combat.state.toolIndex);
    }
  }

  function syncCombatHud() {
    if (combat.state.mission?.done) onMissionResolved(combat.state.mission.id);

    const { hp, score, banner, mission, enemies } = combat.state;
    const line = mission
      ? `Wave ${Math.max(1, mission.wave)} of ${mission.waves} · ${enemies.length} afoot`
      : null;

    // Free roam tracks the party; a mission tracks the walls.
    partyRowEl.hidden = Boolean(mission);
    keepEl.hidden = !mission;
    if (mission && mission.keepHp !== lastKeepHp) {
      lastKeepHp = mission.keepHp;
      keepValueEl.textContent = `${mission.keepHp}/${mission.keepMaxHp}`;
      const pct = (mission.keepHp / mission.keepMaxHp) * 100;
      keepBarEl.style.width = `${pct}%`;
      keepBarEl.classList.toggle('is-critical', pct <= 30);
    }
    if (!mission) lastKeepHp = -1;
    syncToolRack();
    if (line !== lastMissionLine) {
      lastMissionLine = line;
      missionHudEl.textContent = line || '';
      missionHudEl.hidden = !line;
    }
    if (hp !== lastHp) {
      lastHp = hp;
      hpEl.replaceChildren();
      for (let i = 0; i < COMBAT.maxHp; i++) {
        const pip = document.createElement('span');
        pip.className = i < hp ? 'is-full' : '';
        hpEl.appendChild(pip);
      }
      hpEl.classList.toggle('is-low', hp <= 2);
    }
    if (score !== lastScore) {
      lastScore = score;
      scoreEl.textContent = String(score);
    }
    if (banner !== lastBanner) {
      lastBanner = banner;
      bannerEl.textContent = banner || '';
      bannerEl.classList.toggle('is-on', Boolean(banner));
    }
  }

  function hideHint() {
    hintEl.classList.add('is-gone');
  }

  /* ── Input ──────────────────────────────────────────────── */

  /** Aim at whatever the cursor is over; otherwise auto-aim at the nearest. */
  function loose() {
    if (!state.mouse) {
      combat.fire(state.px, state.py, state.heading);
      return;
    }
    const target = combat.nearest(state.mouse.x, state.mouse.y, 150);
    if (target) {
      combat.fire(state.px, state.py, state.heading, target);
      return;
    }
    combat.fire(state.px, state.py, [state.mouse.x - state.px, state.mouse.y - state.py], null);
  }

  function onKeyDown(ev) {
    const k = ev.key.toLowerCase();
    // Space on a focused card button should press it, not loose an arrow.
    const onControl = ev.target instanceof Element
      && ev.target.closest('button, a, input, select, textarea');
    if (onControl && k !== 'escape' && k !== 'm') return;
    if (k === ' ' || k === 'spacebar' || k === 'f') { loose(); ev.preventDefault(); return; }
    if (k === 'escape') {
      if (combat.state.mission && !combat.state.mission.done) {
        combat.abandonMission();
        combat.say('Mission abandoned', 2);
        return;
      }
      state.dismissed = state.active;
      closeCard();
      return;
    }
    if (k === 'm') { onSwitchToDoc(); return; }
    if (k === 'q' || k === 'e') {
      if (combat.state.mission) combat.selectTool(combat.state.toolIndex + (k === 'e' ? 1 : -1));
      return;
    }
    if (k >= '1' && k <= '9') {
      const n = Number(k) - 1;
      // Number keys pick a tool in a fight and a destination out of one.
      if (combat.state.mission) combat.selectTool(n);
      else {
        const entry = data.experience[n];
        if (entry) travelTo(entry.id);
      }
      return;
    }
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
      state.keys.add(k);
      ev.preventDefault();
    }
  }

  const onKeyUp = ev => state.keys.delete(ev.key.toLowerCase());
  const onBlur = () => state.keys.clear();

  function onPointerMove(ev) {
    const rect = canvas.getBoundingClientRect();
    const r = viewRect();
    const [wx, wy] = toWorld(ev.clientX - rect.left, ev.clientY - rect.top, r);
    state.mouse = { x: wx, y: wy };
  }

  function onPointerDown(ev) {
    // Touch is handled by the touchstart/touchend pair, which also does
    // drag-to-steer; running both would double every tap.
    if (ev.pointerType === 'touch') return;
    if (ev.target.closest('.castle-card, .map-hud, .view-switch, .map-fire')) return;
    const rect = canvas.getBoundingClientRect();
    const r = viewRect();
    const [wx, wy] = toWorld(ev.clientX - rect.left, ev.clientY - rect.top, r);
    state.mouse = { x: wx, y: wy };

    // Clicking an incident looses an arrow at it instead of walking into it.
    const foe = combat.nearest(wx, wy, 70);
    if (foe) { combat.fire(state.px, state.py, state.heading, foe); return; }

    // Clicking a keep marches straight to it.
    const hit = world.castles.find(c => Math.hypot(c.x - wx, c.y - wy) < 60);
    if (hit) { travelTo(hit.id); return; }
    if (!world.isPassable(wx, wy)) return;
    state.dismissed = null;
    state.target = { x: wx, y: wy };
    hideHint();
  }

  function onWheel(ev) {
    ev.preventDefault();
    const next = state.zoom * (ev.deltaY > 0 ? 0.9 : 1.1);
    state.zoom = clamp(next, minZoom(), MAX_ZOOM);
  }

  /* Touch: drag anywhere to steer, tap to travel. */
  let touchOrigin = null;
  function onTouchStart(ev) {
    if (ev.target.closest('.castle-card, .map-hud, .view-switch')) return;
    const t = ev.touches[0];
    touchOrigin = { x: t.clientX, y: t.clientY, at: performance.now(), moved: false };
    stickEl.style.left = `${t.clientX}px`;
    stickEl.style.top = `${t.clientY}px`;
  }

  function onTouchMove(ev) {
    if (!touchOrigin) return;
    const t = ev.touches[0];
    const dx = t.clientX - touchOrigin.x;
    const dy = t.clientY - touchOrigin.y;
    const d = Math.hypot(dx, dy);
    if (d < 14) return;
    ev.preventDefault();
    touchOrigin.moved = true;
    stickEl.classList.add('is-live');
    const k = Math.min(d, 60) / 60;
    state.stick = { x: (dx / d) * k, y: (dy / d) * k };
    stickEl.firstElementChild.style.transform = `translate(${(dx / d) * k * 26}px, ${(dy / d) * k * 26}px)`;
    hideHint();
  }

  function onTouchEnd(ev) {
    state.stick = null;
    stickEl.classList.remove('is-live');
    stickEl.firstElementChild.style.transform = '';
    if (touchOrigin && !touchOrigin.moved) {
      onPointerDown({ clientX: touchOrigin.x, clientY: touchOrigin.y, target: ev.target, pointerType: 'tap' });
    }
    touchOrigin = null;
  }

  /* ── Wiring ─────────────────────────────────────────────── */

  document.getElementById('castle-close').addEventListener('click', () => {
    state.dismissed = state.active;
    closeCard();
  });

  cardEl.querySelectorAll('.castle-card__step').forEach(btn => {
    btn.addEventListener('click', () => {
      const order = world.castles.map(c => c.id);
      const i = order.indexOf(state.active);
      const next = order[(i + Number(btn.dataset.step) + order.length) % order.length];
      travelTo(next);
    });
  });

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerleave', () => { state.mouse = null; });
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('touchstart', onTouchStart, { passive: true });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd);

  const fireBtn = document.getElementById('map-fire');
  fireBtn.addEventListener('pointerdown', ev => {
    ev.preventDefault();
    combat.fire(state.px, state.py, state.heading);   // auto-aim: no cursor here
  });

  buildLog();
  document.getElementById('map-title').textContent = data.map.title || data.meta.name;
  document.getElementById('map-subtitle').textContent = data.map.subtitle || '';
  hintEl.textContent = data.map.hint || '';
  document.getElementById('map-legend').textContent = data.map.legend || '';

  const onResize = () => {
    if (!state.running) return;
    resize();
    render();
  };

  /** A backgrounded tab should not keep animating wind, waves, and birds. */
  function onVisibility() {
    if (document.hidden) {
      state.running = false;
      return;
    }
    if (document.body.dataset.view === 'map' && !state.running) api.activate();
  }
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVisibility);

  function attachKeys() {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
  }

  function detachKeys() {
    state.keys.clear();
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
  }

  const api = {
    activate() {
      if (state.running) return;
      // Coming back to a world that has already collapsed (via the switch, or
      // by leaving mid-collapse) must start a fresh one, not replay the 500.
      if (state.ending || combat.state.dead) {
        errorEl.hidden = true;
        resetWorldState();
      }
      state.running = true;
      resize();
      attachKeys();
      last = performance.now();
      requestAnimationFrame(frame);
      setTimeout(hideHint, 9000);
    },
    deactivate() {
      state.running = false;
      detachKeys();
    },
  };

  return api;
}
