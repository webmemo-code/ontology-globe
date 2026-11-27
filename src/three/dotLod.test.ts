import { describe, expect, it } from 'vitest';
import { LAND_LEVELS, LOD_RAMP, LOD_SPACING_PX as T, latticeSpacing, lodWeight } from './dotLod';

/** Weights of every land level when the base level's lattice spacing is `s0` px on screen. */
const weights = (s0: number) =>
  Array.from({ length: LAND_LEVELS }, (_, k) => lodWeight(s0 / 2 ** k, T, k === 0, k === LAND_LEVELS - 1));

describe('lodWeight (#67)', () => {
  it('shows only the base level from far away', () => {
    expect(weights(T)).toEqual([1, 0, 0]);
  });

  it('hands over to the next level as the camera nears, never leaving a gap', () => {
    // Sweep the zoom: the levels' weights never all drop out, and never pile up beyond a crossfade.
    for (let s0 = 1; s0 < 200; s0 += 0.25) {
      const w = weights(s0);
      const sum = w.reduce((a, b) => a + b, 0);
      expect(sum, `s0=${s0}`).toBeGreaterThan(0.99);
      expect(sum, `s0=${s0}`).toBeLessThan(1.01);
    }
  });

  it('gives the finest level everything once it is fully in', () => {
    const s0 = T * LOD_RAMP * 2 ** (LAND_LEVELS - 1) + 1;
    expect(weights(s0)).toEqual([0, 0, 1]);
  });

  it('is continuous: small camera moves change weights by small amounts', () => {
    for (let s0 = 1; s0 < 200; s0 += 0.25) {
      const a = weights(s0);
      const b = weights(s0 + 0.05);
      a.forEach((w, k) => expect(Math.abs(w - b[k]), `s0=${s0} k=${k}`).toBeLessThan(0.02));
    }
  });

  it('measures spacing from the lattice, so 4x the dots means half the spacing', () => {
    expect(latticeSpacing(4 * 26000, 59) / latticeSpacing(26000, 59)).toBeCloseTo(0.5, 6);
  });
});
