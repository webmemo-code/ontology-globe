// Crisp dots on zoom (#67).
//
// L1: a dot's on-screen size is capped and its soft rim is a constant ~1 px,
// so a close dot stays a sharp disc instead of growing into a blur.
// L2: the land lattice comes in levels, each with 4x the dots of the last
// (half the spacing). A level shows while its own on-screen spacing is at
// least LOD_SPACING_PX; as the camera nears, the next level fades in and this
// one fades out, so the land gets denser instead of the dots getting bigger.
//
// The weight depends on each dot's LATTICE spacing (from the level's point
// count), never on its sprite size, so changing the dot size (#66) does not
// move the thresholds. It is a smooth function of depth: no rebuilds, no
// popping. The GLSL below mirrors lodWeight() exactly; the tests run the TS.

/** On-screen lattice spacing (CSS px) at which a level starts fading in, and the next one takes over. */
export const LOD_SPACING_PX = 9;
/** A level is fully in once its spacing is this many times the threshold. */
export const LOD_RAMP = 1.4;
/** Land levels: 0 is the base lattice, each next one has 4x the dots. */
export const LAND_LEVELS = 3;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * How much of a level to draw, given its lattice spacing on screen (`spacing`, px)
 * and the threshold (`t`, px). The first level never fades in (it is the far
 * view), the last never fades out (nothing finer exists).
 */
export function lodWeight(spacing: number, t: number, first: boolean, last: boolean): number {
  const fadeIn = first ? 1 : smoothstep(t, t * LOD_RAMP, spacing);
  const fadeOut = last ? 0 : smoothstep(t, t * LOD_RAMP, spacing / 2);
  return fadeIn * (1 - fadeOut);
}

/** Mean distance between neighbours of an n-point lattice on a sphere of radius r. */
export const latticeSpacing = (n: number, r: number) => Math.sqrt((4 * Math.PI * r * r) / n);

/** GLSL twin of lodWeight(); expects `smoothstep` and the uniforms named here. */
export const LOD_GLSL = `
float lodWeight( float spacing, float t ) {
  float fadeIn = uFirst > 0.5 ? 1.0 : smoothstep( t, t * ${LOD_RAMP.toFixed(2)}, spacing );
  float fadeOut = uLast > 0.5 ? 0.0 : smoothstep( t, t * ${LOD_RAMP.toFixed(2)}, spacing * 0.5 );
  return fadeIn * ( 1.0 - fadeOut );
}`;
