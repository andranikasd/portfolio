/* Paints a generated world onto an offscreen canvas, once, in the style of an
   engraved parchment campaign map. The live view just blits slices of it. */

import { rngKit, makeNoise } from './rng.js';

export const PALETTE = {
  paper:      '#f0e4c8',
  land:       '#f3e9d0',
  sea:        '#b9c4bd',
  seaLine:    '#7d9099',
  ink:        '#4b3b26',
  inkFaint:   'rgba(75, 59, 38, 0.14)',
  mountain:   '#6d5537',
  river:      '#7f9aa8',
  road:       '#9a6636',
};

/* ── Hand-drawn stroke helpers ────────────────────────────── */

/** Perturb a polyline so ink lines wobble like a nib, not a plotter. */
function wobble(points, noise, amount, freq = 0.01, phase = 0) {
  const out = new Array(points.length);
  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i];
    const n = noise.fbm(x * freq + phase, y * freq + phase, 2) - 0.5;
    const m = noise.fbm(y * freq * 1.3 + phase + 40, x * freq * 1.3 + phase + 90, 2) - 0.5;
    out[i] = [x + n * amount, y + m * amount];
  }
  return out;
}

function tracePath(ctx, points, close = false) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  if (close) ctx.closePath();
}

/** Two passes at slightly different offsets = pen-and-ink weight. */
function inkStroke(ctx, points, { color, width, alpha = 1, noise, jitter = 1.6, passes = 2 }) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (let p = 0; p < passes; p++) {
    ctx.globalAlpha = alpha * (p === 0 ? 1 : 0.45);
    ctx.lineWidth = width * (p === 0 ? 1 : 0.7);
    tracePath(ctx, wobble(points, noise, jitter, 0.012, p * 37.5));
    ctx.stroke();
  }
  ctx.restore();
}

/* ── Paper ────────────────────────────────────────────────── */

function makeGrainTile(seed) {
  const size = 220;
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;
  const g = tile.getContext('2d');
  const img = g.createImageData(size, size);
  const kit = rngKit(seed + 991);
  for (let i = 0; i < img.data.length; i += 4) {
    // Dark specks on transparent: composited normally, this reads the same as
    // a multiply pass over pale paper and costs a fraction as much.
    img.data[i] = 120;
    img.data[i + 1] = 98;
    img.data[i + 2] = 60;
    img.data[i + 3] = Math.round(kit.rand() * 26);
  }
  g.putImageData(img, 0, 0);

  // A few long fibres so the grain isn't uniform static.
  g.globalAlpha = 0.1;
  g.strokeStyle = '#8a7448';
  g.lineWidth = 1;
  for (let i = 0; i < 90; i++) {
    const x = kit.rand() * size;
    const y = kit.rand() * size;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + kit.range(-26, 26), y + kit.range(-5, 5));
    g.stroke();
  }
  return tile;
}

function paintPaper(ctx, w, h, seed) {
  ctx.fillStyle = PALETTE.paper;
  ctx.fillRect(0, 0, w, h);

  const kit = rngKit(seed + 17);

  // Broad tonal blotches — the uneven wash of aged paper.
  ctx.save();
  for (let i = 0; i < 30; i++) {
    const x = kit.rand() * w;
    const y = kit.rand() * h;
    const r = kit.range(150, 480);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const tint = kit.rand() < 0.5 ? '185, 150, 96' : '236, 222, 188';
    g.addColorStop(0, `rgba(${tint}, ${kit.range(0.03, 0.1).toFixed(3)})`);
    g.addColorStop(1, `rgba(${tint}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = ctx.createPattern(makeGrainTile(seed), 'repeat');
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/* ── Terrain glyphs ───────────────────────────────────────── */

function drawMountain(ctx, m) {
  const w = 32 * m.s;
  const h = 44 * m.s;
  const { x, y } = m;

  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.lineTo(x - w * 0.26, y - h * 0.82);
  ctx.lineTo(x, y - h);
  ctx.lineTo(x + w * 0.34, y - h * 0.7);
  ctx.lineTo(x + w, y);
  ctx.closePath();
  ctx.fillStyle = 'rgba(243, 233, 208, 0.92)';
  ctx.fill();
  ctx.strokeStyle = PALETTE.mountain;
  ctx.lineWidth = 1.8;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Hatched shading on the lee side.
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(109, 85, 55, 0.5)';
  ctx.lineWidth = 1.1;
  for (let i = 0; i < 9; i++) {
    const t = i / 9;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.05 * t, y - h * (1 - t) * 0.9);
    ctx.lineTo(x + w * (0.35 + t * 0.7), y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHill(ctx, hl) {
  const w = 20 * hl.s;
  ctx.strokeStyle = 'rgba(109, 85, 55, 0.62)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(hl.x - w, hl.y);
  ctx.quadraticCurveTo(hl.x - w * 0.4, hl.y - w * 0.95, hl.x + w * 0.15, hl.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(hl.x + w * 0.02, hl.y);
  ctx.quadraticCurveTo(hl.x + w * 0.5, hl.y - w * 0.7, hl.x + w * 1.05, hl.y);
  ctx.stroke();
}

function drawMarsh(ctx, m) {
  const s = 4.4 * m.s;
  ctx.save();
  ctx.strokeStyle = 'rgba(112, 128, 110, 0.55)';
  ctx.lineWidth = 0.9;
  ctx.lineCap = 'round';
  for (let i = -1; i <= 1; i++) {                 // reeds, leaning apart
    ctx.beginPath();
    ctx.moveTo(m.x + i * s * 0.9, m.y);
    ctx.quadraticCurveTo(m.x + i * s * 1.2, m.y - s, m.x + i * s * 1.6, m.y - s * 1.4);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(127, 154, 168, 0.55)';  // standing water
  for (const dy of [1.5, 4]) {
    ctx.beginPath();
    ctx.moveTo(m.x - s * 1.4, m.y + dy);
    ctx.lineTo(m.x + s * 0.2, m.y + dy);
    ctx.stroke();
  }
  ctx.restore();
}

/** Hachure ticks pointing inland — the classic sea-cliff notation. */
function drawCliffs(ctx, cliffs) {
  ctx.save();
  ctx.strokeStyle = 'rgba(75, 59, 38, 0.5)';
  ctx.lineWidth = 1.1;
  for (const c of cliffs) {
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x + c.nx * 8, c.y + c.ny * 8);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBridge(ctx, b) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.angle);
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-7, -5);
  ctx.lineTo(7, -5);
  ctx.moveTo(-7, 5);
  ctx.lineTo(7, 5);
  ctx.stroke();
  ctx.lineWidth = 1;
  for (const x of [-4, 0, 4]) {
    ctx.beginPath();
    ctx.moveTo(x, -5);
    ctx.lineTo(x, 5);
    ctx.stroke();
  }
  ctx.restore();
}

/** A whale spout in the empty ocean, in the spirit of old sea charts. */
function drawSeaBeast(ctx, spot) {
  ctx.save();
  ctx.translate(spot.x, spot.y);
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = PALETTE.ink;
  ctx.fillStyle = 'rgba(243, 233, 208, 0.75)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();                       // back
  ctx.moveTo(-26, 4);
  ctx.quadraticCurveTo(0, -14, 24, 2);
  ctx.quadraticCurveTo(0, 6, -26, 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();                       // fluke
  ctx.moveTo(24, 2);
  ctx.lineTo(34, -6);
  ctx.lineTo(31, 3);
  ctx.lineTo(36, 8);
  ctx.stroke();
  ctx.beginPath();                       // spout
  ctx.moveTo(-16, -6);
  ctx.quadraticCurveTo(-20, -20, -12, -24);
  ctx.moveTo(-16, -6);
  ctx.quadraticCurveTo(-12, -19, -4, -21);
  ctx.stroke();
  ctx.restore();
}

function drawVillage(ctx, v) {
  ctx.save();
  ctx.strokeStyle = 'rgba(75, 59, 38, 0.75)';
  ctx.fillStyle = 'rgba(240, 228, 200, 0.95)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(v.x - 4, v.y - 3, 8, 6);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(v.x - 5.5, v.y - 3);
  ctx.lineTo(v.x, v.y - 8);
  ctx.lineTo(v.x + 5.5, v.y - 3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Letter-spaced text, drawn glyph by glyph so every browser agrees. */
function tracked(ctx, text, x, y, spacing) {
  const chars = [...text];
  const widths = chars.map(c => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let cx = ctx.textAlign === 'center' ? x - total / 2 : x;
  const prev = ctx.textAlign;
  ctx.textAlign = 'left';
  chars.forEach((c, i) => {
    ctx.fillText(c, cx, y);
    cx += widths[i] + spacing;
  });
  ctx.textAlign = prev;
}

function drawRegionLabel(ctx, region) {
  ctx.save();
  ctx.translate(region.x, region.y);
  ctx.rotate(region.angle);
  ctx.font = '400 27px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(75, 59, 38, 0.34)';
  tracked(ctx, region.label.toUpperCase(), 0, 0, 5.5);
  ctx.strokeStyle = 'rgba(75, 59, 38, 0.2)';
  ctx.lineWidth = 1;
  const half = ctx.measureText(region.label.toUpperCase()).width / 2 + 18;
  for (const dy of [-19, 19]) {
    ctx.beginPath();
    ctx.moveTo(-half, dy);
    ctx.lineTo(half, dy);
    ctx.stroke();
  }
  ctx.restore();
}

function drawLabelledSite(ctx, site, drawGlyph, { size = 11, italic = true, dy = 14 } = {}) {
  drawGlyph(ctx, site);
  ctx.save();
  ctx.font = `${italic ? 'italic ' : '600 '}${size}px Georgia, "Times New Roman", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(243, 233, 208, 0.85)';
  ctx.strokeText(site.label, site.x, site.y + dy);
  ctx.fillStyle = 'rgba(58, 44, 26, 0.85)';
  ctx.fillText(site.label, site.x, site.y + dy);
  ctx.restore();
}

function drawAbbey(ctx, a) {
  ctx.save();
  ctx.strokeStyle = 'rgba(75, 59, 38, 0.85)';
  ctx.fillStyle = 'rgba(243, 233, 208, 0.95)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.rect(a.x - 9, a.y - 7, 18, 10);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();          // bell tower
  ctx.rect(a.x - 3, a.y - 18, 6, 11);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();          // cross finial
  ctx.moveTo(a.x, a.y - 18);
  ctx.lineTo(a.x, a.y - 25);
  ctx.moveTo(a.x - 3, a.y - 22);
  ctx.lineTo(a.x + 3, a.y - 22);
  ctx.stroke();
  ctx.restore();
}

function drawLandmark(ctx, l) {
  ctx.save();
  ctx.strokeStyle = 'rgba(75, 59, 38, 0.85)';
  ctx.fillStyle = 'rgba(243, 233, 208, 0.95)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();          // slender watchtower
  ctx.moveTo(l.x - 5, l.y + 2);
  ctx.lineTo(l.x - 3.5, l.y - 17);
  ctx.lineTo(l.x + 3.5, l.y - 17);
  ctx.lineTo(l.x + 5, l.y + 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.rect(l.x - 6, l.y - 22, 12, 5);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawCompassRose(ctx, rose) {
  const R = 78;
  ctx.save();
  ctx.translate(rose.x, rose.y);
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 1.1;

  for (const r of [R, R * 0.78, R * 0.3]) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const inner = i % 4 === 0 ? R * 0.78 : R * 0.9;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
    ctx.stroke();
  }

  const point = (angle, len, width, filled) => {
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * len, Math.sin(angle) * len);
    ctx.lineTo(Math.cos(angle + Math.PI / 2) * width, Math.sin(angle + Math.PI / 2) * width);
    ctx.lineTo(0, 0);
    ctx.lineTo(Math.cos(angle - Math.PI / 2) * width, Math.sin(angle - Math.PI / 2) * width);
    ctx.closePath();
    ctx.fillStyle = filled ? PALETTE.ink : 'rgba(243, 233, 208, 0.9)';
    ctx.fill();
    ctx.stroke();
  };

  for (let i = 0; i < 4; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 2;
    point(a + Math.PI / 4, R * 0.5, 6, false);
  }
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 2;
    point(a, R * 0.74, 9, i % 2 === 1);
  }

  ctx.fillStyle = PALETTE.ink;
  ctx.font = '600 15px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ['N', 'E', 'S', 'W'].forEach((c, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 2;
    ctx.fillText(c, Math.cos(a) * (R + 14), Math.sin(a) * (R + 14));
  });
  ctx.restore();
}

function drawShip(ctx, ship) {
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);
  ctx.globalAlpha = 0.72;
  ctx.strokeStyle = PALETTE.ink;
  ctx.fillStyle = 'rgba(243, 233, 208, 0.9)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();               // hull
  ctx.moveTo(-13, 0);
  ctx.quadraticCurveTo(0, 8, 13, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();               // mast
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -17);
  ctx.stroke();
  ctx.beginPath();               // sails
  ctx.moveTo(0, -16);
  ctx.quadraticCurveTo(9, -10, 0, -4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -14);
  ctx.quadraticCurveTo(-8, -9, 0, -5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/* ── Map furniture ────────────────────────────────────────── */

function drawGraticule(ctx, w, h) {
  ctx.save();
  ctx.strokeStyle = PALETTE.inkFaint;
  ctx.lineWidth = 0.8;
  ctx.setLineDash([2, 9]);
  for (let x = 400; x < w; x += 400) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 400; y < h; y += 400) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawScaleBar(ctx, w, h) {
  const x = w - 330;
  const y = h - 90;
  const seg = 60;
  ctx.save();
  ctx.strokeStyle = PALETTE.ink;
  ctx.fillStyle = PALETTE.ink;
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.rect(x + i * seg, y, seg, 9);
    if (i % 2 === 0) ctx.fill();
    ctx.stroke();
  }
  ctx.font = '600 15px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.fillText('leagues', x + seg * 2, y + 30);
  ctx.restore();
}

function drawBorderFrame(ctx, w, h) {
  ctx.save();
  const inset = 26;
  ctx.strokeStyle = PALETTE.ink;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 3;
  ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
  ctx.lineWidth = 1;
  ctx.strokeRect(inset + 9, inset + 9, w - (inset + 9) * 2, h - (inset + 9) * 2);
  ctx.restore();

  // Burned, darkened edges.
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  const edge = 200;
  const sides = [
    [0, 0, edge, 0, 'x'],
    [w, 0, w - edge, 0, 'x'],
    [0, 0, 0, edge, 'y'],
    [0, h, 0, h - edge, 'y'],
  ];
  for (const [x0, y0, x1, y1] of sides) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(120, 88, 44, 0.42)');
    g.addColorStop(1, 'rgba(120, 88, 44, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

/* ── Main paint ───────────────────────────────────────────── */

/**
 * Paint the static engraving once, offscreen.
 *
 * `scale` trades sheet resolution for memory: the whole world at 1:1 is a
 * 14 Mpx canvas, which is more than a phone should be asked to hold. Drawing
 * still happens in world units — the scale is applied to the context — so
 * nothing else in this file needs to know.
 *
 * `breathe` is awaited between the heavy passes so the browser can paint the
 * loading state and stay responsive instead of freezing for one long task.
 *
 * @returns {Promise<{canvas: HTMLCanvasElement, scale: number}>}
 */
export async function paintWorld(world, scale = 1, breathe = async () => {}) {
  const { width, height } = world;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.scale(scale, scale);
  const noise = makeNoise(world.seed + 3);

  paintPaper(ctx, width, height, world.seed);
  await breathe();

  /* Sea wash over everything, then the land is painted back on top. */
  ctx.save();
  ctx.globalAlpha = 0.62;
  ctx.fillStyle = PALETTE.sea;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  /* Engraved sea ripples, palest first. */
  world.ripples.forEach((set, depth) => {
    for (const line of set) {
      inkStroke(ctx, line, {
        color: PALETTE.seaLine,
        width: depth === 0 ? 1.5 : 1.1,
        alpha: 0.62 - depth * 0.08,
        noise,
        jitter: 2.6,
        passes: 1,
      });
    }
  });

  await breathe();

  /* Land mass. Even-odd so inland lakes punch back through to the sea wash. */
  const landPath = () => {
    ctx.beginPath();
    for (const loop of world.coast) {
      ctx.moveTo(loop[0][0], loop[0][1]);
      for (let i = 1; i < loop.length; i++) ctx.lineTo(loop[i][0], loop[i][1]);
      ctx.closePath();
    }
  };

  ctx.save();
  landPath();
  ctx.fillStyle = PALETTE.land;
  ctx.fill('evenodd');
  ctx.restore();

  await breathe();

  /* Coastal shading: wide translucent strokes clipped to the land. */
  ctx.save();
  landPath();
  ctx.clip('evenodd');
  for (const loop of world.coast) {
    for (const [w, a] of [[22, 0.05], [13, 0.06], [6, 0.08]]) {
      inkStroke(ctx, loop, { color: '#8a6a3c', width: w, alpha: a, noise, jitter: 1.2, passes: 1 });
    }
  }

  /* Elevation washes: each band darkens the land a little more. */
  world.bands.forEach((band, i) => {
    if (!band.length) return;
    ctx.beginPath();
    for (const loop of band) {
      ctx.moveTo(loop[0][0], loop[0][1]);
      for (let k = 1; k < loop.length; k++) ctx.lineTo(loop[k][0], loop[k][1]);
      ctx.closePath();
    }
    ctx.fillStyle = `rgba(196, 168, 112, ${0.1 + i * 0.03})`;
    ctx.fill('evenodd');
    for (const loop of band) {
      inkStroke(ctx, loop, { color: '#9a8354', width: 1, alpha: 0.22, noise, jitter: 2, passes: 1 });
    }
  });
  ctx.restore();

  await breathe();

  drawGraticule(ctx, width, height);

  /* Rivers. */
  for (const river of world.rivers) {
    inkStroke(ctx, river, { color: PALETTE.river, width: 2.6, alpha: 0.85, noise, jitter: 1.4, passes: 1 });
    inkStroke(ctx, river, { color: '#ffffff', width: 0.8, alpha: 0.35, noise, jitter: 1.4, passes: 1 });
  }

  drawCliffs(ctx, world.cliffs);

  /* Relief, back to front. Woodland is drawn live by ambience.js so it can
     move in the wind, so it is deliberately absent here. */
  for (const m of world.marshes) drawMarsh(ctx, m);
  for (const h of world.hills) drawHill(ctx, h);
  for (const m of world.mountains) drawMountain(ctx, m);
  for (const v of world.villages) drawLabelledSite(ctx, v, drawVillage, { size: 10.5, dy: 6 });
  for (const a of world.abbeys) drawLabelledSite(ctx, a, drawAbbey, { size: 11, italic: false, dy: 6 });
  for (const l of world.landmarks) drawLabelledSite(ctx, l, drawLandmark, { size: 11, italic: false, dy: 6 });

  await breathe();

  /* Village side tracks: thinner and fainter than the highway. */
  for (const track of world.tracks) {
    ctx.save();
    ctx.setLineDash([4, 7]);
    inkStroke(ctx, track, { color: '#a97c4c', width: 1.5, alpha: 0.6, noise, jitter: 0.8, passes: 1 });
    ctx.restore();
  }

  /* Roads: a soft dust bed under a dashed track. */
  for (const road of world.roads) {
    inkStroke(ctx, road.points, { color: '#c8a271', width: 7, alpha: 0.4, noise, jitter: 0.8, passes: 1 });
    ctx.save();
    ctx.setLineDash([9, 8]);
    inkStroke(ctx, road.points, { color: PALETTE.road, width: 2.2, alpha: 0.9, noise, jitter: 0.8, passes: 1 });
    ctx.restore();
  }

  for (const b of world.bridges) drawBridge(ctx, b);

  /* Coastline ink, drawn last so it sits crisply over everything. */
  for (const loop of world.coast) {
    inkStroke(ctx, loop, { color: PALETTE.ink, width: 2.1, alpha: 0.9, noise, jitter: 1.3, passes: 2 });
  }

  await breathe();

  /* Province names sit above the terrain but below the coast ink. */
  for (const region of world.regions) drawRegionLabel(ctx, region);

  if (world.seaOrnaments.rose) drawCompassRose(ctx, world.seaOrnaments.rose);
  for (const ship of world.seaOrnaments.ships) drawShip(ctx, ship);
  if (world.seaOrnaments.beast) drawSeaBeast(ctx, world.seaOrnaments.beast);

  drawScaleBar(ctx, width, height);
  drawBorderFrame(ctx, width, height);

  return { canvas, scale };
}
