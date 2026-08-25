/* Art for the hostile half: one silhouette per incident archetype, one per
   tool. Everything is drawn in screen space around an origin of (0, 0) at the
   figure's feet, already translated and scaled by the caller. */

/* ── Incidents ───────────────────────────────────────────── */

/** DDoS / DNS flood: a breaking wave of arrowheads. Never arrives alone. */
function surge(ctx, e, t) {
  const roll = Math.sin(e.phase * 1.6);
  ctx.beginPath();
  ctx.moveTo(-11, 1);
  ctx.quadraticCurveTo(-9, -9, -2, -11);
  ctx.quadraticCurveTo(4, -13, 7, -8 + roll);
  ctx.quadraticCurveTo(10, -3, 11, 1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();                       // crests
  for (let i = 0; i < 3; i++) {
    const x = -7 + i * 6;
    const lift = -12 - Math.sin(t * 9 + i * 1.7 + e.phase) * 2.5;
    ctx.moveTo(x - 3, -9);
    ctx.lineTo(x, lift);
    ctx.lineTo(x + 3, -9);
  }
  ctx.stroke();

  ctx.beginPath();                       // forward arrowheads: it is coming at you
  ctx.moveTo(9, -6);
  ctx.lineTo(15, -3);
  ctx.lineTo(9, 0);
  ctx.stroke();
}

/** Config drift: a crystal that has come apart, pieces out of register. */
function shard(ctx, e) {
  const gap = 1.6 + Math.sin(e.phase) * 1.1;
  const piece = (dx, dy, pts) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0] + dx, pts[0][1] + dy);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] + dx, pts[i][1] + dy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };
  piece(-gap, 0, [[-9, 1], [-6, -12], [0, -16], [-1, 1]]);
  piece(gap, -gap * 0.6, [[1, 1], [0, -16], [7, -11], [9, 1]]);
  ctx.beginPath();                       // the fault line between them
  ctx.moveTo(0, -17);
  ctx.lineTo(0, 2);
  ctx.stroke();
}

/** Blind spot: a hooded absence. Barely there until it is on top of you. */
function wraith(ctx, e, t) {
  const drift = Math.sin(t * 2.2 + e.phase) * 1.6;
  ctx.beginPath();
  ctx.moveTo(-8, 2);
  ctx.quadraticCurveTo(-9 + drift, -10, -4, -15);
  ctx.quadraticCurveTo(0, -19, 4, -15);
  ctx.quadraticCurveTo(9 + drift, -10, 8, 2);
  ctx.quadraticCurveTo(4, 0, 0, 2);
  ctx.quadraticCurveTo(-4, 4, -8, 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.save();                            // a hollow where a face should be
  ctx.globalAlpha *= 0.9;
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.ellipse(0, -12, 3.6, 4.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Failed rollout: a braced crate that shrugs off half of everything. */
function crateFoe(ctx, e) {
  const lean = Math.sin(e.phase * 0.8) * 0.08;
  ctx.save();
  ctx.rotate(lean);
  ctx.beginPath();
  ctx.rect(-10, -19, 20, 19);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();                       // strapping
  ctx.moveTo(-10, -13);
  ctx.lineTo(10, -13);
  ctx.moveTo(-10, -6);
  ctx.lineTo(10, -6);
  ctx.moveTo(0, -19);
  ctx.lineTo(0, 0);
  ctx.stroke();
  ctx.beginPath();                       // a split down one corner
  ctx.moveTo(6, -19);
  ctx.lineTo(3, -12);
  ctx.lineTo(8, -7);
  ctx.stroke();
  ctx.restore();
  ctx.beginPath();                       // stubby legs
  ctx.moveTo(-6, 0);
  ctx.lineTo(-7, 3);
  ctx.moveTo(6, 0);
  ctx.lineTo(7, 3);
  ctx.stroke();
}

/** Node pressure: a slab of load, cracked, grinding towards the walls. */
function boulder(ctx, e) {
  const squash = 1 + Math.sin(e.phase * 1.4) * 0.05;
  ctx.save();
  ctx.scale(1 / squash, squash);
  ctx.beginPath();
  ctx.moveTo(-14, 2);
  ctx.quadraticCurveTo(-16, -12, -6, -18);
  ctx.quadraticCurveTo(4, -23, 12, -14);
  ctx.quadraticCurveTo(17, -6, 14, 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();                       // strata and fractures
  ctx.moveTo(-12, -5);
  ctx.quadraticCurveTo(-2, -9, 13, -6);
  ctx.moveTo(-4, -18);
  ctx.lineTo(-1, -10);
  ctx.lineTo(-6, -5);
  ctx.stroke();
  ctx.restore();
}

/** CrashLoop: a serpent eating its own tail. Kill it twice. */
function ouro(ctx, e, t) {
  const spin = t * 1.7 + e.phase;
  ctx.save();
  ctx.translate(0, -11);
  ctx.rotate(spin);
  ctx.lineWidth *= 1.6;
  ctx.beginPath();
  ctx.arc(0, 0, 9.5, 0.5, Math.PI * 2 - 0.1);
  ctx.stroke();
  ctx.lineWidth /= 1.6;
  ctx.beginPath();                       // head
  ctx.moveTo(Math.cos(0.5) * 9.5, Math.sin(0.5) * 9.5);
  ctx.lineTo(Math.cos(0.5) * 15, Math.sin(0.5) * 11);
  ctx.lineTo(Math.cos(0.5) * 10, Math.sin(0.5) * 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.beginPath();                       // it still has legs
  ctx.moveTo(-4, -2);
  ctx.lineTo(-5, 2);
  ctx.moveTo(4, -2);
  ctx.lineTo(5, 2);
  ctx.stroke();
}

const INCIDENT_ART = { surge, shard, wraith, crate: crateFoe, boulder, ouro };

export function drawIncident(ctx, e, t) {
  (INCIDENT_ART[e.kind.art] || surge)(ctx, e, t);
}

/* ── Tools ───────────────────────────────────────────────── */

/** WAF / CDN: a shield thrown edge-on. */
function bolt(ctx) {
  ctx.beginPath();
  ctx.moveTo(-9, 0);
  ctx.lineTo(4, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(11, 0);
  ctx.lineTo(4, -6);
  ctx.quadraticCurveTo(9, 0, 4, 6);
  ctx.closePath();
  ctx.fillStyle = '#1d4ed8';
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();                       // chevron on the boss
  ctx.moveTo(3, -3);
  ctx.lineTo(6, 0);
  ctx.lineTo(3, 3);
  ctx.stroke();
}

/** Terraform / Ansible: a wrench, end over end. */
function wrench(ctx, shot) {
  ctx.rotate(shot.spin);
  ctx.lineWidth *= 1.3;
  ctx.beginPath();
  ctx.moveTo(-8, 0);
  ctx.lineTo(5, 0);
  ctx.stroke();
  ctx.lineWidth /= 1.3;
  ctx.fillStyle = '#7c3aed';
  ctx.beginPath();                       // open jaw
  ctx.moveTo(5, -5);
  ctx.lineTo(11, -5);
  ctx.lineTo(11, -2);
  ctx.lineTo(8, 0);
  ctx.lineTo(11, 2);
  ctx.lineTo(11, 5);
  ctx.lineTo(5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();                       // closed end
  ctx.arc(-9, 0, 3.4, 0, Math.PI * 2);
  ctx.stroke();
}

/** Telemetry: a leading dot dragging expanding rings behind it. */
function ping(ctx) {
  ctx.fillStyle = '#0f766e';
  ctx.beginPath();
  ctx.arc(6, 0, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.globalAlpha *= 0.55 - i * 0.13;
    ctx.beginPath();
    ctx.arc(6 - i * 6, 0, 4 + i * 3.6, Math.PI * 0.55, Math.PI * 1.45);
    ctx.stroke();
    ctx.restore();
  }
}

/** Helm / Jenkins: a parcel tumbling in, ribbon streaming. */
function crateTool(ctx, shot) {
  ctx.rotate(shot.spin * 0.6);
  ctx.fillStyle = '#a9741f';
  ctx.beginPath();
  ctx.rect(-5.5, -5.5, 11, 11);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-5.5, 0);
  ctx.lineTo(5.5, 0);
  ctx.moveTo(0, -5.5);
  ctx.lineTo(0, 5.5);
  ctx.stroke();
  ctx.beginPath();                       // ribbon
  ctx.moveTo(-5.5, -2);
  ctx.quadraticCurveTo(-12, -6, -15, -1);
  ctx.stroke();
}

/** Kubernetes / Bash: the helm wheel. */
function wheel(ctx, shot) {
  ctx.rotate(shot.spin);
  ctx.fillStyle = '#1d4ed8';
  ctx.beginPath();
  ctx.arc(0, 0, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 3, Math.sin(a) * 3);
    ctx.lineTo(Math.cos(a) * 10, Math.sin(a) * 10);
    ctx.stroke();
  }
}

const TOOL_ART = { bolt, wrench, ping, crate: crateTool, wheel };

export function drawTool(ctx, shot) {
  (TOOL_ART[shot.kind] || bolt)(ctx, shot);
}

/** Small glyph for the tool switcher in the HUD, drawn into its own canvas. */
export function toolGlyph(ctx, kind, size) {
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.scale(size / 26, size / 26);
  ctx.strokeStyle = '#3a2c1a';
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  (TOOL_ART[kind] || bolt)(ctx, { spin: -0.5 });
  ctx.restore();
}
