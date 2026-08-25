/* One place that decides how hard this machine should be pushed.

   The map is a full-screen animated canvas over a world-sized offscreen
   sheet, so a phone and a workstation cannot be handed the same workload.
   Everything here is a hint, never a hard requirement: the map is correct at
   any tier, only cheaper. */

function tier() {
  const mem = navigator.deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 8;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const small = Math.min(window.screen?.width || 1920, window.screen?.height || 1080) < 820;

  if (coarse || small || mem <= 4 || cores <= 4) return 'low';
  if (mem <= 8 || cores <= 8) return 'mid';
  return 'high';
}

const PROFILES = {
  // sheetScale keeps the offscreen world sheet under iOS Safari's ~16.7 Mpx
  // canvas ceiling with room to spare, and keeps its memory sane on phones.
  low:  { sheetScale: 0.5,  dprCap: 1.5, maxZoom: 2.4, quality: 1 },
  mid:  { sheetScale: 0.75, dprCap: 2,   maxZoom: 3.2, quality: 2 },
  high: { sheetScale: 1,    dprCap: 2,   maxZoom: 3.2, quality: 3 },
};

export function deviceProfile() {
  // `?quality=low|mid|high` overrides the guess — useful when a machine
  // under-reports, and the only way to check the other tiers by hand.
  const forced = new URLSearchParams(location.search).get('quality');
  const name = PROFILES[forced] ? forced : tier();
  return { name, ...PROFILES[name] };
}
