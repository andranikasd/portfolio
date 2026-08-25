/* Deterministic PRNG + value noise.
   Everything the map draws comes from the seed in portfolio.json, so the
   same config always produces the same continent. */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Small helper bundle so generators don't re-implement the same maths. */
export function rngKit(seed) {
  const rand = mulberry32(seed);
  return {
    rand,
    range: (lo, hi) => lo + rand() * (hi - lo),
    int: (lo, hi) => Math.floor(lo + rand() * (hi - lo + 1)),
    pick: arr => arr[Math.floor(rand() * arr.length)],
    /** -1..1, biased toward zero — good for organic jitter. */
    jitter: () => (rand() + rand() + rand()) / 1.5 - 1,
  };
}

/* ── Value noise ─────────────────────────────────────────── */

const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;

/** Seeded 2D value noise with fractal (fBm) sampling. */
export function makeNoise(seed) {
  const rand = mulberry32(seed);
  const SIZE = 256;
  const grid = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();

  const at = (x, y) => grid[(y & (SIZE - 1)) * SIZE + (x & (SIZE - 1))];

  function noise2(x, y) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = fade(x - x0);
    const ty = fade(y - y0);
    const top = lerp(at(x0, y0), at(x0 + 1, y0), tx);
    const bottom = lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), tx);
    return lerp(top, bottom, ty);
  }

  /** Fractal sum. Returns 0..1. */
  function fbm(x, y, octaves = 5, lacunarity = 2, gain = 0.5) {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise2(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  /** Ridged variant — sharper crests, used for mountain spines. */
  function ridge(x, y, octaves = 4) {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * (1 - Math.abs(noise2(x * freq, y * freq) * 2 - 1));
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }

  return { noise2, fbm, ridge };
}

export { lerp };
