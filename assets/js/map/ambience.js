/* Living layer of the map. The static engraving lives in cartography.js; this
   is everything that moves: woodland leaning in the wind, sea swell, grass,
   chimney smoke, carts on the roads, birds, and cloud shadows crossing the
   land.

   Each family of glyphs is batched into one path and stroked once, so a
   viewport holding several hundred trees costs a handful of draw calls rather
   than several hundred. */

import { rngKit } from './rng.js';

const WIND = { speed: 1.15, lean: 0.16 };
const BUCKET = 384;               // world units per spatial-index cell
const TREE = 15;                  // base crown size in world units

/* Quality budget. The map is correct at every level; higher levels only add
   detail. The host lowers this when frames start costing too much. */
const DETAIL = {
  0: { waves: false, grass: false, smoke: false, carts: false, clouds: false, trunks: false },
  1: { waves: true,  grass: false, smoke: false, carts: false, clouds: false, trunks: false },
  2: { waves: true,  grass: false, smoke: true,  carts: true,  clouds: false, trunks: true },
  3: { waves: true,  grass: true,  smoke: true,  carts: true,  clouds: true,  trunks: true },
};

export function createAmbience(world, seed = 1) {
  const kit = rngKit(seed + 4242);
  let detail = DETAIL[3];

  /* ── Spatial index over the woodland ────────────────────── */

  const cols = Math.ceil(world.width / BUCKET);
  const rows = Math.ceil(world.height / BUCKET);
  const buckets = Array.from({ length: cols * rows }, () => []);
  for (const tree of world.forests) {
    const cx = Math.min(cols - 1, Math.max(0, Math.floor(tree.x / BUCKET)));
    const cy = Math.min(rows - 1, Math.max(0, Math.floor(tree.y / BUCKET)));
    buckets[cy * cols + cx].push(tree);
  }

  function eachVisibleTree(view, fn) {
    const { sx, sy, vw, vh } = view;
    const x0 = Math.max(0, Math.floor((sx - 80) / BUCKET));
    const x1 = Math.min(cols - 1, Math.floor((sx + vw + 80) / BUCKET));
    const y0 = Math.max(0, Math.floor((sy - 80) / BUCKET));
    const y1 = Math.min(rows - 1, Math.floor((sy + vh + 80) / BUCKET));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        for (const tree of buckets[cy * cols + cx]) fn(tree);
      }
    }
  }

  /* ── Moving inhabitants ─────────────────────────────────── */

  const flocks = Array.from({ length: 11 }, () => ({
    x: kit.range(0, world.width),
    y: kit.range(0, world.height),
    dir: kit.range(0, Math.PI * 2),
    turn: kit.range(-0.28, 0.28),
    speed: kit.range(26, 46),
    size: kit.range(0.75, 1.35),
    birds: Array.from({ length: kit.int(3, 6) }, () => ({
      dx: kit.range(-26, 26),
      dy: kit.range(-14, 14),
      phase: kit.range(0, Math.PI * 2),
      beat: kit.range(5.5, 8.5),
    })),
  }));

  const clouds = Array.from({ length: 7 }, () => ({
    x: kit.range(0, world.width),
    y: kit.range(0, world.height),
    rx: kit.range(230, 460),
    ry: kit.range(120, 240),
    speed: kit.range(9, 20),
    drift: kit.range(-0.12, 0.12),
    lobes: kit.int(3, 5),
    seed: kit.range(0, 10),
  }));

  /* Carts plod up and down the roads and side tracks. */
  const routes = [...world.roads.map(r => r.points), ...world.tracks]
    .filter(pts => pts && pts.length > 8)
    .map(pts => {
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      return { pts, cum, length: cum[cum.length - 1] };
    });

  const carts = routes.length
    ? Array.from({ length: Math.min(7, routes.length + 2) }, (_, i) => {
      const route = routes[i % routes.length];
      return {
        route,
        s: kit.range(0, route.length),
        dir: kit.rand() < 0.5 ? 1 : -1,
        speed: kit.range(26, 44),
        bob: kit.range(0, Math.PI * 2),
      };
    })
    : [];

  /** Point and heading at distance `s` along a route. */
  function alongRoute(route, s) {
    const { pts, cum } = route;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    const span = cum[i] - cum[i - 1] || 1;
    const f = (s - cum[i - 1]) / span;
    const a = pts[i - 1];
    const b = pts[i];
    return {
      x: a[0] + (b[0] - a[0]) * f,
      y: a[1] + (b[1] - a[1]) * f,
      angle: Math.atan2(b[1] - a[1], b[0] - a[0]),
    };
  }

  function update(dt) {
    for (const f of flocks) {
      f.dir += f.turn * dt;
      f.x += Math.cos(f.dir) * f.speed * dt;
      f.y += Math.sin(f.dir) * f.speed * dt;
      // Wrap rather than bounce — flocks drift off one edge and back on another.
      if (f.x < -200) f.x = world.width + 200;
      if (f.x > world.width + 200) f.x = -200;
      if (f.y < -200) f.y = world.height + 200;
      if (f.y > world.height + 200) f.y = -200;
    }
    for (const c of clouds) {
      c.x += c.speed * dt;
      c.y += c.drift * c.speed * dt;
      if (c.x - c.rx > world.width) c.x = -c.rx;
      if (c.y - c.ry > world.height) c.y = -c.ry;
      if (c.y + c.ry < 0) c.y = world.height + c.ry;
    }
    for (const cart of carts) {
      cart.s += cart.speed * cart.dir * dt;
      cart.bob += dt * 7;
      if (cart.s > cart.route.length) { cart.s = cart.route.length; cart.dir = -1; }
      if (cart.s < 0) { cart.s = 0; cart.dir = 1; }
    }
  }

  /* ── Wind ───────────────────────────────────────────────── */

  /** Wind strength at a point: a travelling wave, so gusts sweep the map. */
  const windAt = (x, y, t) =>
    Math.sin(t * WIND.speed + x * 0.0035 + y * 0.0018) * 0.7 +
    Math.sin(t * WIND.speed * 2.3 + x * 0.011) * 0.3;

  /* ── Woodland ───────────────────────────────────────────── */

  function drawTrees(ctx, view, t) {
    const { sx, sy, z } = view;
    const showTrunks = detail.trunks && z > 0.8;   // below that it is sub-pixel

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(0.7, 1.3 * z);

    // One path for every crown in view: fill once, stroke once.
    ctx.beginPath();
    eachVisibleTree(view, tree => {
      const px = (tree.x - sx) * z;
      const py = (tree.y - sy) * z;
      const s = TREE * tree.s * z;
      const lean = windAt(tree.x, tree.y, t) * WIND.lean;
      // Two tiers give the crown some body at this size.
      ctx.moveTo(px - s * 1.75 * lean, py - s * 1.75);
      ctx.lineTo(px + s * 0.62, py - s * 0.75);
      ctx.lineTo(px - s * 0.62, py - s * 0.75);
      ctx.closePath();
      ctx.moveTo(px - s * 1.05 * lean, py - s * 1.05);
      ctx.lineTo(px + s * 0.9, py);
      ctx.lineTo(px - s * 0.9, py);
      ctx.closePath();
    });
    ctx.fillStyle = 'rgba(95, 122, 75, 0.52)';
    ctx.strokeStyle = 'rgba(63, 84, 48, 0.8)';
    ctx.fill();
    ctx.stroke();

    if (showTrunks) {
      ctx.beginPath();
      eachVisibleTree(view, tree => {
        const px = (tree.x - sx) * z;
        const py = (tree.y - sy) * z;
        const s = TREE * tree.s * z;
        const lean = windAt(tree.x, tree.y, t) * WIND.lean;
        ctx.moveTo(px, py);
        ctx.lineTo(px + s * 0.4 * lean, py + s * 0.4);
      });
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ── Grass ──────────────────────────────────────────────── */

  /** Tufts on open ground, bending with the same gusts as the trees. */
  function drawGrass(ctx, view, t) {
    const { sx, sy, vw, vh, z } = view;
    if (!detail.grass || z < 1.35) return;   // invisible clutter when zoomed out
    const step = 120;
    const x0 = Math.floor(sx / step) * step;
    const y0 = Math.floor(sy / step) * step;

    ctx.save();
    ctx.strokeStyle = 'rgba(120, 136, 92, 0.3)';
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(0.7, 0.85 * z);
    ctx.beginPath();

    for (let wy = y0; wy < sy + vh + step; wy += step) {
      for (let wx = x0; wx < sx + vw + step; wx += step) {
        const h = Math.sin(wx * 0.71 + wy * 0.37);
        if (h < -0.2) continue;                       // sparse, not a lawn
        const gx = wx + h * 34;
        const gy = wy + Math.cos(wx * 0.21 + wy * 0.53) * 34;
        if (!world.isLand(gx, gy)) continue;

        const px = (gx - sx) * z;
        const py = (gy - sy) * z;
        const lean = windAt(gx, gy, t) * 3.2 * z;
        for (let b = -1; b <= 1; b++) {
          // Each blade a different length, or the tuft reads as a hatch mark.
          const grow = 0.65 + Math.abs(b) * 0.35 + Math.sin(gx + b) * 0.12;
          const bx = px + b * 2.2 * z;
          ctx.moveTo(bx, py);
          ctx.quadraticCurveTo(bx + lean * 0.35, py - 2.4 * z * grow, bx + lean * grow, py - 5 * z * grow);
        }
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  /* ── Sea ────────────────────────────────────────────────── */

  /** Short swell strokes over open water, marching with the wind. */
  function drawWaves(ctx, view, t) {
    if (!detail.waves) return;
    const { sx, sy, vw, vh, z } = view;
    const step = 104;
    const x0 = Math.floor(sx / step) * step;
    const y0 = Math.floor(sy / step) * step;

    ctx.save();
    ctx.strokeStyle = 'rgba(96, 122, 133, 0.34)';
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(0.9, 1.1 * z);
    ctx.beginPath();

    for (let wy = y0; wy < sy + vh + step; wy += step) {
      for (let wx = x0; wx < sx + vw + step; wx += step) {
        if (world.isLand(wx, wy)) continue;
        // A stable per-cell offset keeps the swell from looking like a grid.
        const jitter = Math.sin(wx * 0.37 + wy * 0.71) * 26;
        const phase = t * 1.5 + (wx + wy) * 0.006;
        const ox = wx + jitter + Math.sin(phase) * 7;
        const oy = wy + Math.cos(phase * 0.8) * 5;
        if (world.isLand(ox, oy)) continue;

        const px = (ox - sx) * z;
        const py = (oy - sy) * z;
        const w = 15 * z;
        const lift = (0.5 + Math.sin(phase * 1.3) * 0.7) * z;
        ctx.moveTo(px - w, py);
        ctx.quadraticCurveTo(px - w * 0.5, py - lift, px, py);
        ctx.quadraticCurveTo(px + w * 0.5, py + lift, px + w, py);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  /* ── Villages, carts, birds, clouds ─────────────────────── */

  /** A thread of smoke over every village in view. */
  function drawSmoke(ctx, view, t) {
    const { sx, sy, vw, vh, z } = view;
    if (!detail.smoke || z < 0.9) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(90, 78, 62, 0.32)';
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1, 1.6 * z);
    ctx.beginPath();
    for (const v of world.villages) {
      if (v.x < sx - 60 || v.x > sx + vw + 60 || v.y < sy - 80 || v.y > sy + vh + 60) continue;
      const px = (v.x + 3) * 1;
      const base = { x: (px - sx) * z, y: (v.y - 8 - sy) * z };
      ctx.moveTo(base.x, base.y);
      for (let i = 1; i <= 4; i++) {
        const drift = Math.sin(t * 1.6 + i * 0.9 + v.x * 0.01) * (2.4 + i * 1.7) * z;
        ctx.lineTo(base.x + drift, base.y - i * 6 * z);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawCarts(ctx, view, t) {
    const { sx, sy, vw, vh, z } = view;
    if (!detail.carts || z < 0.75) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(58, 44, 26, 0.8)';
    ctx.fillStyle = 'rgba(243, 233, 208, 0.92)';
    ctx.lineWidth = Math.max(0.9, 1.2 * z);
    ctx.lineJoin = 'round';

    for (const cart of carts) {
      const p = alongRoute(cart.route, cart.s);
      if (p.x < sx - 60 || p.x > sx + vw + 60 || p.y < sy - 60 || p.y > sy + vh + 60) continue;
      const px = (p.x - sx) * z;
      const py = (p.y - sy) * z;
      const jog = Math.abs(Math.sin(cart.bob)) * 0.8 * z;

      ctx.save();
      ctx.translate(px, py - jog);
      ctx.scale(z * (cart.dir * Math.cos(p.angle) < 0 ? -1 : 1), z);
      ctx.beginPath();                    // ox
      ctx.ellipse(-9, -4, 4.4, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();                    // shaft
      ctx.moveTo(-5, -4);
      ctx.lineTo(1, -4);
      ctx.stroke();
      ctx.beginPath();                    // cart body and wheel
      ctx.rect(1, -8, 8, 5);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(5, -2, 2.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    void t;
  }

  function drawBirds(ctx, view, t) {
    const { sx, sy, vw, vh, z } = view;
    ctx.save();
    ctx.strokeStyle = 'rgba(58, 44, 26, 0.55)';
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1, 1.2 * z);
    ctx.beginPath();
    for (const f of flocks) {
      if (f.x < sx - 160 || f.x > sx + vw + 160) continue;
      if (f.y < sy - 160 || f.y > sy + vh + 160) continue;
      for (const b of f.birds) {
        const px = (f.x + b.dx - sx) * z;
        const py = (f.y + b.dy - sy) * z;
        // A hard "v" reads as a bird at any size; a curve reads as a smudge.
        const w = 6.5 * f.size * z;
        const h = (2.2 + Math.sin(t * b.beat + b.phase) * 3.4) * f.size * z;
        ctx.moveTo(px - w, py - h);
        ctx.lineTo(px, py);
        ctx.lineTo(px + w, py - h);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  /** Cloud shadows: the only thing on this map that dims the paper. */
  function drawClouds(ctx, view) {
    if (!detail.clouds) return;
    const { sx, sy, vw, vh, z } = view;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    for (const c of clouds) {
      if (c.x + c.rx < sx || c.x - c.rx > sx + vw) continue;
      if (c.y + c.ry < sy || c.y - c.ry > sy + vh) continue;
      for (let i = 0; i < c.lobes; i++) {
        const a = (i / c.lobes) * Math.PI * 2 + c.seed;
        const ox = c.x + Math.cos(a) * c.rx * 0.34;
        const oy = c.y + Math.sin(a) * c.ry * 0.34;
        const rx = c.rx * 0.62 * z;
        const ry = c.ry * 0.62 * z;
        const px = (ox - sx) * z;
        const py = (oy - sy) * z;
        const g = ctx.createRadialGradient(px, py, 0, px, py, Math.max(rx, ry));
        g.addColorStop(0, 'rgba(150, 132, 96, 0.20)');
        g.addColorStop(1, 'rgba(150, 132, 96, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  return {
    /** 0–3; the host lowers it when frames get expensive. */
    setQuality(level) {
      detail = DETAIL[Math.max(0, Math.min(3, level))] || DETAIL[3];
    },
    update,
    /** Below the actors: sea, grass, woodland, smoke, carts. */
    drawGround(ctx, view, t) {
      drawWaves(ctx, view, t);
      drawGrass(ctx, view, t);
      drawTrees(ctx, view, t);
      drawSmoke(ctx, view, t);
      drawCarts(ctx, view, t);
    },
    /** Above the actors: birds, then cloud shadow across the whole scene. */
    drawSky(ctx, view, t) {
      drawBirds(ctx, view, t);
      drawClouds(ctx, view);
    },
  };
}
