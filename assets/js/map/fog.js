/* Fog of war — a lantern, not a map memory.

   The light travels with the party: ground behind you closes up again. That
   makes this pure screen-space work — one radial gradient over the viewport
   per frame, no mask canvas, no accumulated state, no per-move bookkeeping. */

export function createFog(opts = {}) {
  const colour = opts.colour || '20, 15, 8';
  const base = opts.alpha ?? 0.86;

  const state = {
    /** Outer radius as a fraction of the smaller viewport edge. */
    reach: opts.reach ?? 0.58,
    target: opts.reach ?? 0.58,
  };

  /** Missions light the field; roaming pulls the lantern back in. */
  function setReach(value) {
    state.target = value;
  }

  function update(dt) {
    // Ease so the light opens and closes instead of snapping.
    state.reach += (state.target - state.reach) * Math.min(1, dt * 2.4);
  }

  /**
   * @param cx,cy  the party's position in CSS pixels
   * @param cw,ch  viewport size in CSS pixels
   */
  function draw(ctx, cx, cy, cw, ch, flicker = 0) {
    const span = Math.min(cw, ch);
    const outer = span * state.reach * (1 + flicker * 0.012);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, outer);
    g.addColorStop(0, `rgba(${colour}, 0)`);
    g.addColorStop(0.52, `rgba(${colour}, 0)`);
    g.addColorStop(0.72, `rgba(${colour}, ${base * 0.42})`);
    g.addColorStop(0.9, `rgba(${colour}, ${base * 0.88})`);
    g.addColorStop(1, `rgba(${colour}, ${base})`);
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);
    ctx.restore();
  }

  return { draw, update, setReach, state };
}
