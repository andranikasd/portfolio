/* Procedural continent generator.
   Produces plain geometry (polylines + point lists) in world coordinates.
   Nothing here touches the DOM — cartography.js does the drawing. */

import { rngKit, makeNoise } from './rng.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;

/* ── Height field ─────────────────────────────────────────── */

function buildHeightField(cfg, noise, gw, gh) {
  const height = new Float32Array(gw * gh);
  const moisture = new Float32Array(gw * gh);

  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const u = gx / (gw - 1);
      const v = gy / (gh - 1);
      const sx = u * 6.2;
      const sy = v * 4.4;

      // Domain warp keeps the coastline from looking like plain noise.
      const wx = noise.fbm(sx * 0.7 + 13.5, sy * 0.7 + 4.25, 3);
      const wy = noise.fbm(sx * 0.7 + 91.2, sy * 0.7 + 47.8, 3);
      const base = noise.fbm(sx + (wx - 0.5) * 1.7, sy + (wy - 0.5) * 1.7, 6);
      const ridged = noise.ridge(sx * 0.55 + 31, sy * 0.55 + 17, 4);

      // Irregular island falloff: radial distance wobbled by low-freq noise.
      const nx = u * 2 - 1;
      const ny = v * 2 - 1;
      // Two wobble octaves: the broad one carves gulfs and peninsulas,
      // the fine one frays the shore into coves and offshore islets.
      const gulf = (noise.fbm(sx * 0.38 + 200, sy * 0.38 + 310, 2) - 0.5) * 0.62;
      const fray = (noise.fbm(sx * 1.7 + 61, sy * 1.7 + 133, 3) - 0.5) * 0.3;
      const d = Math.sqrt(nx * nx * 0.94 + ny * ny * 1.2) + gulf + fray;
      const falloff = clamp(1 - Math.pow(clamp((d - 0.1) / 0.82, 0, 1), 1.3), 0, 1);

      const h = (base * 0.68 + ridged * 0.32) * falloff;
      height[gy * gw + gx] = h;
      moisture[gy * gw + gx] = noise.fbm(sx * 1.35 + 700, sy * 1.35 + 410, 4);
    }
  }
  return { height, moisture };
}

/** Pick the threshold that yields the requested land fraction. */
function seaLevelFor(height, landFraction) {
  const sorted = Float32Array.from(height).sort();
  const idx = clamp(Math.floor((1 - landFraction) * sorted.length), 0, sorted.length - 1);
  return sorted[idx];
}

/** Flood-fill land cells; returns a mask that keeps only the largest mass. */
function mainLandmass(height, sea, gw, gh) {
  const seen = new Int32Array(gw * gh).fill(-1);
  const sizes = [];
  const stack = [];

  for (let i = 0; i < seen.length; i++) {
    if (seen[i] !== -1 || height[i] <= sea) continue;
    const id = sizes.length;
    let count = 0;
    stack.push(i);
    seen[i] = id;
    while (stack.length) {
      const c = stack.pop();
      count++;
      const cx = c % gw;
      const cy = (c / gw) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const n = ny * gw + nx;
        if (seen[n] !== -1 || height[n] <= sea) continue;
        seen[n] = id;
        stack.push(n);
      }
    }
    sizes.push(count);
  }

  let best = 0;
  for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[best]) best = i;
  const mask = new Uint8Array(gw * gh);
  for (let i = 0; i < mask.length; i++) mask[i] = seen[i] === best ? 1 : 0;
  return mask;
}

/** Chamfer distance (in cells) from every sea cell to the nearest land. */
function seaDistanceField(height, sea, gw, gh) {
  const INF = 1e6;
  const d = new Float32Array(gw * gh);
  for (let i = 0; i < d.length; i++) d[i] = height[i] > sea ? 0 : INF;

  const relax = (i, j, w) => { if (d[j] + w < d[i]) d[i] = d[j] + w; };

  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const i = y * gw + x;
      if (x > 0) relax(i, i - 1, 1);
      if (y > 0) relax(i, i - gw, 1);
      if (x > 0 && y > 0) relax(i, i - gw - 1, 1.4142);
      if (x < gw - 1 && y > 0) relax(i, i - gw + 1, 1.4142);
    }
  }
  for (let y = gh - 1; y >= 0; y--) {
    for (let x = gw - 1; x >= 0; x--) {
      const i = y * gw + x;
      if (x < gw - 1) relax(i, i + 1, 1);
      if (y < gh - 1) relax(i, i + gw, 1);
      if (x < gw - 1 && y < gh - 1) relax(i, i + gw + 1, 1.4142);
      if (x > 0 && y < gh - 1) relax(i, i + gw - 1, 1.4142);
    }
  }
  return d;
}

/* ── Marching squares contour extraction ──────────────────── */

const CASES = [
  [],                                   // 0
  [['left', 'bottom']],                 // 1  bl
  [['bottom', 'right']],                // 2  br
  [['left', 'right']],                  // 3
  [['top', 'right']],                   // 4  tr
  [['top', 'left'], ['bottom', 'right']], // 5 saddle
  [['top', 'bottom']],                  // 6
  [['top', 'left']],                    // 7
  [['top', 'left']],                    // 8  tl
  [['top', 'bottom']],                  // 9
  [['top', 'right'], ['left', 'bottom']], // 10 saddle
  [['top', 'right']],                   // 11
  [['left', 'right']],                  // 12
  [['bottom', 'right']],                // 13
  [['left', 'bottom']],                 // 14
  [],                                   // 15
];

/**
 * Extract iso-contours of `field` at `level` as world-space polylines.
 * Cells are `cell` units wide; grid origin is world (0,0).
 */
export function contours(field, gw, gh, level, cell) {
  const at = (x, y) => field[y * gw + x];
  const ix = (a, b) => (level - a) / (b - a || 1e-6);
  const segs = [];

  for (let y = 0; y < gh - 1; y++) {
    for (let x = 0; x < gw - 1; x++) {
      const tl = at(x, y);
      const tr = at(x + 1, y);
      const br = at(x + 1, y + 1);
      const bl = at(x, y + 1);
      const idx = (tl > level ? 8 : 0) | (tr > level ? 4 : 0) | (br > level ? 2 : 0) | (bl > level ? 1 : 0);
      const pairs = CASES[idx];
      if (!pairs.length) continue;

      const pt = edge => {
        switch (edge) {
          case 'top':    return [(x + ix(tl, tr)) * cell, y * cell];
          case 'right':  return [(x + 1) * cell, (y + ix(tr, br)) * cell];
          case 'bottom': return [(x + ix(bl, br)) * cell, (y + 1) * cell];
          default:       return [x * cell, (y + ix(tl, bl)) * cell];
        }
      };
      for (const [a, b] of pairs) segs.push([pt(a), pt(b)]);
    }
  }
  return stitch(segs);
}

/** Join loose segments into polylines by matching endpoints. */
function stitch(segs) {
  // Numeric keys: quantise to quarter-units and pack into one integer. String
  // keys here allocated twice per segment and dominated generation time.
  const key = p => Math.round(p[0] * 4) * 1048576 + Math.round(p[1] * 4);
  const buckets = new Map();
  segs.forEach((s, i) => {
    for (const p of s) {
      const k = key(p);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(i);
    }
  });

  const used = new Uint8Array(segs.length);
  const lines = [];

  const extend = (line, fromPoint, backwards) => {
    let cursor = fromPoint;
    for (;;) {
      const cand = (buckets.get(key(cursor)) || []).find(i => !used[i]);
      if (cand === undefined) return;
      used[cand] = 1;
      const [a, b] = segs[cand];
      const next = key(a) === key(cursor) ? b : a;
      if (backwards) line.unshift(next);
      else line.push(next);
      cursor = next;
    }
  };

  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const [a, b] = segs[i];
    const line = [a, b];
    extend(line, b, false);
    extend(line, a, true);
    if (line.length > 6) lines.push(line);
  }
  return lines;
}

/**
 * Halve a field's resolution. The swell rings and elevation bands are smoothed
 * and purely decorative, so tracing them at half resolution looks the same and
 * costs a quarter as much.
 */
function halve(field, gw, gh) {
  const hw = Math.floor(gw / 2);
  const hh = Math.floor(gh / 2);
  const out = new Float32Array(hw * hh);
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < hw; x++) {
      const i = y * 2 * gw + x * 2;
      out[y * hw + x] = (field[i] + field[i + 1] + field[i + gw] + field[i + gw + 1]) * 0.25;
    }
  }
  return { field: out, gw: hw, gh: hh };
}

/** Chaikin corner-cutting: turns blocky contours into flowing coast. */
export function smooth(points, passes = 2, closed = false) {
  let pts = points;
  for (let p = 0; p < passes; p++) {
    const out = [];
    const n = pts.length;
    if (!closed) out.push(pts[0]);
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      out.push([lerp(a[0], b[0], 0.25), lerp(a[1], b[1], 0.25)]);
      out.push([lerp(a[0], b[0], 0.75), lerp(a[1], b[1], 0.75)]);
    }
    if (!closed) out.push(pts[n - 1]);
    pts = out;
  }
  return pts;
}

/* ── Feature scattering ───────────────────────────────────── */

/** Trees read as woodland when they clump; alone they read as noise. */
function pushGrove(out, kit, x, y) {
  const n = kit.int(3, 7);
  for (let i = 0; i < n; i++) {
    out.push({
      x: x + kit.range(-19, 19),
      y: y + kit.range(-11, 11),
      s: kit.range(0.7, 1.15),
    });
  }
}

function scatterFeatures(ctxData, kit) {
  const { height, moisture, mask, gw, gh, cell, sea, peak } = ctxData;
  const mountains = [];
  const hills = [];
  const forests = [];
  const marshes = [];

  const h = (x, y) => height[y * gw + x];

  for (let gy = 1; gy < gh - 1; gy++) {
    for (let gx = 1; gx < gw - 1; gx++) {
      const i = gy * gw + gx;
      if (!mask[i]) continue;
      const e = (h(gx, gy) - sea) / (peak - sea); // 0..1 above water
      const m = moisture[i];
      const x = (gx + kit.jitter() * 0.45) * cell;
      const y = (gy + kit.jitter() * 0.45) * cell;

      if (e > 0.66) {
        // Peaks come in ranges, not as a field of identical triangles.
        if (kit.rand() < 0.028) {
          const base = lerp(0.85, 1.5, (e - 0.66) / 0.34);
          mountains.push({ x, y, s: base * kit.range(0.9, 1.15) });
          const flanks = kit.int(1, 3);
          for (let f = 0; f < flanks; f++) {
            mountains.push({
              x: x + kit.range(-46, 46),
              y: y + kit.range(-10, 14),
              s: base * kit.range(0.5, 0.85),
            });
          }
        }
      } else if (e > 0.4) {
        if (kit.rand() < 0.022) hills.push({ x, y, s: kit.range(0.8, 1.2) });
        if (m > 0.56 && kit.rand() < 0.02) pushGrove(forests, kit, x, y);
      } else if (e > 0.06) {
        if (m > 0.5 && kit.rand() < 0.015) pushGrove(forests, kit, x, y);
      } else if (m > 0.62 && kit.rand() < 0.1) {
        marshes.push({ x, y, s: kit.range(0.8, 1.3) });   // wet coastal flats
      }
    }
  }
  mountains.sort((a, b) => a.y - b.y);
  forests.sort((a, b) => a.y - b.y);
  return { mountains, hills, forests, marshes };
}

/** Steepest-descent rivers from high ground to the sea. */
function carveRivers(ctxData, kit, count) {
  const { height, mask, gw, gh, cell, sea, peak } = ctxData;
  const rivers = [];
  let guard = count * 40;

  while (rivers.length < count && guard-- > 0) {
    const gx0 = kit.int(2, gw - 3);
    const gy0 = kit.int(2, gh - 3);
    const i0 = gy0 * gw + gx0;
    if (!mask[i0]) continue;
    if ((height[i0] - sea) / (peak - sea) < 0.55) continue;

    const pts = [];
    let gx = gx0;
    let gy = gy0;
    for (let step = 0; step < 400; step++) {
      pts.push([(gx + 0.5) * cell, (gy + 0.5) * cell]);
      let bx = gx;
      let by = gy;
      let bh = height[gy * gw + gx];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = gx + dx;
          const ny = gy + dy;
          if (nx < 1 || ny < 1 || nx >= gw - 1 || ny >= gh - 1) continue;
          const nh = height[ny * gw + nx] + kit.rand() * 0.004;
          if (nh < bh) { bh = nh; bx = nx; by = ny; }
        }
      }
      if (bx === gx && by === gy) break;      // stuck in a basin
      gx = bx;
      gy = by;
      if (height[gy * gw + gx] <= sea) { pts.push([(gx + 0.5) * cell, (gy + 0.5) * cell]); break; }
    }
    if (pts.length > 18) rivers.push(smooth(pts, 2));
  }
  return rivers;
}

/** Coast points where the land rises sharply — drawn with hachure ticks. */
function findCliffs(ctxData, coast) {
  const { height, gw, gh, cell, sea, peak } = ctxData;
  const span = peak - sea;
  const sample = (x, y) => {
    const gx = clamp(Math.round(x / cell), 0, gw - 1);
    const gy = clamp(Math.round(y / cell), 0, gh - 1);
    return height[gy * gw + gx];
  };

  const out = [];
  for (const loop of coast) {
    for (let i = 4; i < loop.length - 4; i += 4) {
      const [x, y] = loop[i];
      const [px, py] = loop[i - 3];
      const [nx2, ny2] = loop[i + 3];
      let tx = ny2 - py;
      let ty = -(nx2 - px);
      const len = Math.hypot(tx, ty) || 1;
      tx /= len;
      ty /= len;
      // Probe both sides; the landward one tells us how fast it climbs.
      const inland = Math.max(sample(x + tx * 95, y + ty * 95), sample(x - tx * 95, y - ty * 95));
      if ((inland - sea) / span > 0.17) out.push({ x, y, nx: tx, ny: ty });
    }
  }
  return out;
}

/* ── Castle placement ─────────────────────────────────────── */

const TERRAIN_SCORE = {
  coast:    e => 1 - Math.abs(e - 0.14) * 3,
  valley:   e => 1 - Math.abs(e - 0.3) * 3,
  forest:   e => 1 - Math.abs(e - 0.4) * 3,
  mountain: e => 1 - Math.abs(e - 0.66) * 3,
};

function placeCastles(ctxData, kit, entries) {
  const { height, mask, gw, gh, cell, sea, peak, width, wHeight } = ctxData;
  const n = entries.length;
  const minGap = Math.min(width, wHeight) * 0.26;
  const placed = [];

  // A wandering march across the continent: oldest keep first.
  const phase = kit.range(0, Math.PI * 2);
  const swing = kit.range(0.13, 0.2);

  entries.forEach((entry, i) => {
    const t = n === 1 ? 0.5 : 0.1 + 0.8 * (i / (n - 1));
    const along = { u: lerp(0.16, 0.84, t), v: lerp(0.76, 0.22, t) };
    const bend = Math.sin(t * Math.PI * 1.7 + phase) * swing;
    const target = {
      x: clamp(along.u + bend * 0.55, 0.08, 0.92) * width,
      y: clamp(along.v + bend, 0.08, 0.92) * wHeight,
    };

    const want = entry.castle?.terrain || 'valley';
    const scoreFn = TERRAIN_SCORE[want] || TERRAIN_SCORE.valley;

    let best = null;
    const maxR = Math.max(gw, gh);
    for (let r = 0; r < maxR; r += 1) {
      for (let a = 0; a < Math.max(8, r * 6); a++) {
        const ang = (a / Math.max(8, r * 6)) * Math.PI * 2;
        const gx = Math.round(target.x / cell + Math.cos(ang) * r);
        const gy = Math.round(target.y / cell + Math.sin(ang) * r);
        if (gx < 2 || gy < 2 || gx >= gw - 2 || gy >= gh - 2) continue;
        const idx = gy * gw + gx;
        if (!mask[idx]) continue;
        const e = (height[idx] - sea) / (peak - sea);
        if (e < 0.04 || e > 0.86) continue;
        const x = (gx + 0.5) * cell;
        const y = (gy + 0.5) * cell;
        if (placed.some(p => Math.hypot(p.x - x, p.y - y) < minGap)) continue;
        const score = scoreFn(e) - r * 0.02;
        if (!best || score > best.score) best = { x, y, e, score };
      }
      if (best && r > 6) break;   // good enough, stop widening the search
    }

    if (!best) best = { x: target.x, y: target.y, e: 0.3, score: 0 };
    placed.push({
      id: entry.id,
      x: best.x,
      y: best.y,
      elevation: best.e,
      entry,
      size: entry.castle?.size || 'medium',
      terrain: want,
      banner: entry.castle?.banner || '#7c2d12',
      name: entry.castle?.name || entry.company,
    });
  });

  return placed;
}

/** Wobbly road between two keeps, nudged back onto dry land. */
function buildRoad(a, b, ctxData, kit) {
  const { mask, gw, gh, cell } = ctxData;
  const onLand = (x, y) => {
    const gx = Math.round(x / cell);
    const gy = Math.round(y / cell);
    if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return false;
    return mask[gy * gw + gx] === 1;
  };

  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(10, Math.round(dist / 45));
  const nx = -(b.y - a.y) / dist;
  const ny = (b.x - a.x) / dist;
  const amp = dist * kit.range(0.06, 0.15) * (kit.rand() < 0.5 ? -1 : 1);

  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const bow = Math.sin(t * Math.PI) * amp;
    const wiggle = Math.sin(t * Math.PI * 5 + kit.rand() * 0.2) * dist * 0.012;
    let x = lerp(a.x, b.x, t) + nx * (bow + wiggle);
    let y = lerp(a.y, b.y, t) + ny * (bow + wiggle);

    // If the bow swings into water, walk it back toward the straight line.
    for (let k = 0; k < 12 && !onLand(x, y); k++) {
      x = lerp(x, lerp(a.x, b.x, t), 0.25);
      y = lerp(y, lerp(a.y, b.y, t), 0.25);
    }
    pts.push([x, y]);
  }
  return smooth(pts, 2);
}

/* ── Named sites ──────────────────────────────────────────
   The document view's own content doubles as map furniture: skill groups
   become provinces, their tags become the villages inside them, and the
   certifications and projects become outlying sites. */

/** Rough half-width of a tracked 27px serif caps label, in world units. */
function estimateLabelHalfWidth(label) {
  return (label.length * 20.5) / 2 + 24;
}

/** True when a horizontal run centred on (x, y) stays over land. */
function spanOnLand(ctxData, x, y, halfWidth) {
  const { height, gw, gh, cell, sea } = ctxData;
  const steps = 9;
  for (let i = 0; i <= steps; i++) {
    const px = x - halfWidth + (halfWidth * 2 * i) / steps;
    const gx = Math.round(px / cell);
    const gy = Math.round(y / cell);
    if (gx < 1 || gy < 1 || gx >= gw - 1 || gy >= gh - 1) return false;
    if (height[gy * gw + gx] <= sea) return false;
  }
  return true;
}

function makeSampler(ctxData, kit) {
  const { height, mask, gw, gh, cell, sea, peak } = ctxData;

  /** One random land cell matching an elevation window, or null. */
  function candidate(opts = {}) {
    const { minE = 0.05, maxE = 0.75, near = null, radius = 0 } = opts;
    for (let attempt = 0; attempt < 90; attempt++) {
      let gx;
      let gy;
      if (near) {
        const ang = kit.range(0, Math.PI * 2);
        const r = Math.sqrt(kit.rand()) * radius;
        gx = Math.round((near.x + Math.cos(ang) * r) / cell);
        gy = Math.round((near.y + Math.sin(ang) * r) / cell);
      } else {
        gx = kit.int(3, gw - 4);
        gy = kit.int(3, gh - 4);
      }
      if (gx < 2 || gy < 2 || gx >= gw - 2 || gy >= gh - 2) continue;
      const i = gy * gw + gx;
      if (!mask[i]) continue;
      const e = (height[i] - sea) / (peak - sea);
      if (e < minE || e > maxE) continue;
      const x = (gx + 0.5) * cell;
      const y = (gy + 0.5) * cell;
      if (opts.fits && !opts.fits(x, y)) continue;
      return { x, y, e };
    }
    return null;
  }

  /** Best-of-K sampling: keeps sites from clumping without a real solver. */
  function spread(occupied, opts = {}, tries = 40) {
    let best = null;
    let bestScore = -Infinity;
    for (let k = 0; k < tries; k++) {
      const c = candidate(opts);
      if (!c) continue;
      let nearest = Infinity;
      for (const o of occupied) nearest = Math.min(nearest, Math.hypot(o.x - c.x, o.y - c.y));
      if (nearest > bestScore) { bestScore = nearest; best = c; }
    }
    if (best && bestScore < (opts.minGap || 0)) return null;
    return best;
  }

  return { candidate, spread };
}

function placeNamedSites(ctxData, kit, data, castles) {
  const sampler = makeSampler(ctxData, kit);
  const occupied = castles.map(c => ({ x: c.x, y: c.y }));
  const regions = [];
  const villages = [];
  const abbeys = [];
  const landmarks = [];

  for (const group of data.skills || []) {
    // Reserve room for the whole word, not just its anchor, or the name
    // ends up half in the sea.
    const halfWidth = estimateLabelHalfWidth(group.group);
    const spot = sampler.spread(occupied, {
      minE: 0.08,
      maxE: 0.62,
      minGap: 240,
      fits: (x, y) => spanOnLand(ctxData, x, y, halfWidth),
    }, 90);
    if (!spot) continue;
    regions.push({ x: spot.x, y: spot.y, label: group.group, angle: kit.range(-0.09, 0.09) });
    occupied.push(spot);

    for (const tag of group.tags || []) {
      const v = sampler.spread(occupied, { near: spot, radius: 330, minE: 0.06, maxE: 0.7, minGap: 108 }, 24);
      if (!v) continue;
      villages.push({ x: v.x, y: v.y, label: tag });
      occupied.push(v);
    }
  }

  for (const cert of data.certifications || []) {
    const spot = sampler.spread(occupied, { minE: 0.3, maxE: 0.85, minGap: 210 }, 50);
    if (!spot) continue;
    abbeys.push({ x: spot.x, y: spot.y, label: cert.short || cert.name, issuer: cert.issuer });
    occupied.push(spot);
  }

  for (const project of data.projects || []) {
    const spot = sampler.spread(occupied, { minE: 0.06, maxE: 0.8, minGap: 170 }, 90);
    if (!spot) continue;
    landmarks.push({ x: spot.x, y: spot.y, label: project.short || project.title });
    occupied.push(spot);
  }

  return { regions, villages, abbeys, landmarks };
}

/** Open-water spots for a compass rose and a couple of sails. */
function placeSeaOrnaments(ctxData, kit) {
  const { height, gw, gh, cell, sea } = ctxData;
  const isSea = (gx, gy) =>
    gx >= 0 && gy >= 0 && gx < gw && gy < gh && height[gy * gw + gx] <= sea;

  const clearance = (gx, gy, cells) => {
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2;
      if (!isSea(Math.round(gx + Math.cos(ang) * cells), Math.round(gy + Math.sin(ang) * cells))) return false;
    }
    return isSea(gx, gy);
  };

  const findOpen = cells => {
    for (let attempt = 0; attempt < 900; attempt++) {
      const gx = kit.int(4, gw - 5);
      const gy = kit.int(4, gh - 5);
      if (clearance(gx, gy, cells)) return { x: (gx + 0.5) * cell, y: (gy + 0.5) * cell };
    }
    return null;
  };

  const rose = findOpen(9);
  const ships = [];
  for (let i = 0; i < 3; i++) {
    const spot = findOpen(4);
    if (spot) ships.push({ ...spot, angle: kit.range(-0.35, 0.35) });
  }
  return { rose, ships, beast: findOpen(6) };
}

/** Closest point on any road (or keep) to a site — where its track joins. */
function nearestOnRoads(roads, castles, site) {
  let best = null;
  let bestD = Infinity;
  for (const road of roads) {
    for (let i = 0; i < road.points.length; i += 2) {
      const [x, y] = road.points[i];
      const d = Math.hypot(x - site.x, y - site.y);
      if (d < bestD) { bestD = d; best = { x, y }; }
    }
  }
  for (const c of castles) {
    const d = Math.hypot(c.x - site.x, c.y - site.y);
    if (d < bestD) { bestD = d; best = { x: c.x, y: c.y }; }
  }
  return best;
}

/** Segment intersection, used to drop a bridge glyph at every ford. */
function segmentHit(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]];
  const s2 = [d[0] - c[0], d[1] - c[1]];
  const denom = r[0] * s2[1] - r[1] * s2[0];
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s2[1] - (c[1] - a[1]) * s2[0]) / denom;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a[0] + t * r[0], y: a[1] + t * r[1], angle: Math.atan2(r[1], r[0]) };
}

function findBridges(roadLines, rivers) {
  const out = [];
  for (const line of roadLines) {
    for (let i = 0; i < line.length - 1; i++) {
      for (const river of rivers) {
        for (let j = 0; j < river.length - 1; j++) {
          const hit = segmentHit(line[i], line[i + 1], river[j], river[j + 1]);
          if (hit && !out.some(b => Math.hypot(b.x - hit.x, b.y - hit.y) < 40)) out.push(hit);
        }
      }
    }
  }
  return out;
}

/**
 * Walkable-terrain grid. Sea is impassable, and so is the footprint of each
 * drawn mountain — the block follows the glyph that is actually on the paper,
 * not a coarse elevation band. Roads and the ground around each keep are
 * carved back open, so every keep stays reachable through a pass.
 */
function buildPassable(ctxData, { roads, tracks, castles, mountains }) {
  const { height, gw, gh, cell, sea } = ctxData;
  const grid = new Uint8Array(gw * gh);

  for (let i = 0; i < grid.length; i++) grid[i] = height[i] > sea ? 1 : 0;

  // Matches drawMountain(): base half-width 32*s, and only the lower slopes
  // read as ground, so the blocking ellipse is wide and shallow.
  const blockEllipse = (x, y, rx, ry) => {
    const gx0 = Math.max(0, Math.floor((x - rx) / cell));
    const gx1 = Math.min(gw - 1, Math.ceil((x + rx) / cell));
    const gy0 = Math.max(0, Math.floor((y - ry) / cell));
    const gy1 = Math.min(gh - 1, Math.ceil((y + ry) / cell));
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const ddx = (gx * cell - x) / rx;
        const ddy = (gy * cell - y) / ry;
        if (ddx * ddx + ddy * ddy <= 1) grid[gy * gw + gx] = 0;
      }
    }
  };

  for (const m of mountains) blockEllipse(m.x, m.y - 10 * m.s, 27 * m.s, 15 * m.s);

  const carve = (x, y, radius) => {
    const r = Math.ceil(radius / cell);
    const cx = Math.round(x / cell);
    const cy = Math.round(y / cell);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const gx = cx + dx;
        const gy = cy + dy;
        if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) continue;
        const i = gy * gw + gx;
        if (height[i] > sea) grid[i] = 1;      // never carve into the sea
      }
    }
  };

  for (const road of roads) for (const [x, y] of road.points) carve(x, y, 46);
  for (const track of tracks) for (const [x, y] of track) carve(x, y, 34);
  for (const c of castles) carve(c.x, c.y, 110);

  return grid;
}

/* ── Entry point ──────────────────────────────────────────── */

/**
 * Build the whole world from `data.map.seed`.
 *
 * `breathe` is awaited between phases so a slow device splits this across
 * several frames instead of freezing on one long task.
 */
export async function generateWorld(data, breathe = async () => {}) {
  const mapCfg = data.map || {};
  const experience = data.experience || [];
  const width = mapCfg.world?.width || 2800;
  const wHeight = mapCfg.world?.height || 1900;
  const cell = 16;
  const gw = Math.ceil(width / cell) + 1;
  const gh = Math.ceil(wHeight / cell) + 1;

  const seed = mapCfg.seed || 1;
  const kit = rngKit(seed);
  const noise = makeNoise(seed);

  const { height, moisture } = buildHeightField(mapCfg, noise, gw, gh);
  const sea = seaLevelFor(height, 0.46);
  const mask = mainLandmass(height, sea, gw, gh);

  let peak = sea;
  for (let i = 0; i < height.length; i++) if (mask[i] && height[i] > peak) peak = height[i];

  await breathe();

  const seaDist = seaDistanceField(height, sea, gw, gh);
  const ctxData = { height, moisture, mask, gw, gh, cell, sea, peak, width, wHeight };

  // Oldest role first, so the march reads chronologically west-to-east.
  const journey = [...experience].reverse();
  const castles = placeCastles(ctxData, kit, journey);

  const coastLoops = contours(height, gw, gh, sea, cell).map(l => smooth(l, 2));
  await breathe();

  const features = scatterFeatures(ctxData, kit);
  const sites = placeNamedSites(ctxData, kit, data, castles);
  const seaOrnaments = placeSeaOrnaments(ctxData, kit);

  const roads = [];
  for (let i = 0; i < castles.length - 1; i++) {
    roads.push({ from: castles[i].id, to: castles[i + 1].id, points: buildRoad(castles[i], castles[i + 1], ctxData, kit) });
  }

  // Villages hang off the highway on thin side tracks.
  const tracks = [];
  for (const v of sites.villages) {
    const anchor = nearestOnRoads(roads, castles, v);
    if (anchor && Math.hypot(anchor.x - v.x, anchor.y - v.y) < 620) {
      tracks.push(buildRoad(v, anchor, ctxData, kit));
    }
  }

  await breathe();

  const rivers = carveRivers(ctxData, kit, 6);
  const bridges = findBridges([...roads.map(r => r.points), ...tracks], rivers);
  const passable = buildPassable(ctxData, { roads, tracks, castles, mountains: features.mountains });

  const span = peak - sea;
  const coarseHeight = halve(height, gw, gh);
  const coarseDist = halve(seaDist, gw, gh);
  await breathe();

  // Offshore distance rings read as the engraved swell of an old sea chart.
  const ripples = [1.6, 3.4, 5.6, 8.2, 11.4, 15.2].map(rings =>
    contours(coarseDist.field, coarseDist.gw, coarseDist.gh, rings, cell * 2).map(l => smooth(l, 2)));
  await breathe();

  // Elevation bands, low to high — drawn as stacked washes plus contour lines.
  const bands = [0.22, 0.45, 0.7].map(f =>
    contours(coarseHeight.field, coarseHeight.gw, coarseHeight.gh, sea + span * f, cell * 2).map(l => smooth(l, 2)));
  const cliffs = findCliffs(ctxData, coastLoops);
  await breathe();

  return {
    seed,
    width,
    height: wHeight,
    cell,
    gw,
    gh,
    sea,
    peak,
    field: height,
    mask,
    coast: coastLoops,
    ripples,
    bands,
    rivers,
    tracks,
    bridges,
    cliffs,
    ...features,
    castles,
    roads,
    ...sites,
    seaOrnaments,
    passable,

    /** Dry ground of any height — used for placement and for drawing. */
    isLand: (x, y) => {
      const gx = Math.round(x / cell);
      const gy = Math.round(y / cell);
      if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return false;
      return height[gy * gw + gx] > sea;
    },

    /** Where anything on foot can actually go: no sea, no mountain wall. */
    isPassable: (x, y) => {
      const gx = Math.round(x / cell);
      const gy = Math.round(y / cell);
      if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return false;
      return passable[gy * gw + gx] === 1;
    },
  };
}
