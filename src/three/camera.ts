// Camera framing and flight paths as pure functions: vectors in, keyframes out.
// No scene access, so every shot can be tested without WebGL (camera.test.ts).
import * as THREE from 'three';
import { DOME_R } from '../data/globe';

export interface CameraKeyframe {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
}

export const kf = (p: [number, number, number], t: [number, number, number]): CameraKeyframe => ({
  position: { x: p[0], y: p[1], z: p[2] },
  target: { x: t[0], y: t[1], z: t[2] },
});

const vec = (p: { x: number; y: number; z: number }) => new THREE.Vector3(p.x, p.y, p.z);
const key = (eye: THREE.Vector3, target: THREE.Vector3) => kf(eye.toArray(), target.toArray());
const UP = new THREE.Vector3(0, 1, 0);

/** Any unit vector perpendicular to `v`, chosen the same way every time. */
function perpendicular(v: THREE.Vector3): THREE.Vector3 {
  const p = new THREE.Vector3().crossVectors(v, UP);
  if (p.lengthSq() < 1e-6) p.crossVectors(v, new THREE.Vector3(1, 0, 0));
  return p.normalize();
}

// ---------- who may move the camera ----------

/** Who asked for a flight; a higher owner's flight cannot be replaced by a lower one's. */
export type CameraOwner = 'drift' | 'follow' | 'tour' | 'select' | 'user';
const RANK: Record<CameraOwner, number> = { drift: 0, follow: 1, tour: 2, select: 3, user: 4 };
export const outranks = (a: CameraOwner, b: CameraOwner) => RANK[a] > RANK[b];

/**
 * How a flight ended: it landed ('done'), another flight or the user took over
 * while it flew ('cancelled'), or it never started because a higher owner's
 * flight was running ('refused'). Only 'done' means the camera got there.
 */
export type FlightResult = 'done' | 'cancelled' | 'refused';

// ---------- flight paths ----------

/**
 * `orbit` swings round the globe centre (graph view, both eyes outside the
 * skin); `linear` is the straight move for everything else (inside the dome,
 * the offset system stack).
 */
export type PathPolicy = 'orbit' | 'linear';

export function pathPolicy(from: CameraKeyframe, to: CameraKeyframe, globe: boolean): PathPolicy {
  return globe && vec(from.position).length() > DOME_R && vec(to.position).length() > DOME_R ? 'orbit' : 'linear';
}

/**
 * The camera at eased progress `e` (0..1). Orbit: the eye's direction slerps on
 * a great circle and its distance lerps, so it never comes closer to the
 * centre than the nearer end point; antipodal ends turn about a fixed axis.
 * The target always lerps.
 */
export function pathAt(from: CameraKeyframe, to: CameraKeyframe, e: number, policy: PathPolicy): { position: THREE.Vector3; target: THREE.Vector3 } {
  const target = vec(from.target).lerp(vec(to.target), e);
  const p0 = vec(from.position);
  const p1 = vec(to.position);
  if (policy === 'linear') return { position: p0.lerp(p1, e), target };
  const r0 = p0.length();
  const r1 = p1.length();
  const a = p0.clone().divideScalar(r0);
  const b = p1.clone().divideScalar(r1);
  const angle = Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1));
  let dir: THREE.Vector3;
  if (angle < 1e-4) dir = a.lerp(b, e).normalize();
  else {
    const axis = new THREE.Vector3().crossVectors(a, b);
    if (axis.lengthSq() < 1e-8) axis.copy(perpendicular(a));
    dir = a.applyAxisAngle(axis.normalize(), angle * e);
  }
  return { position: dir.multiplyScalar(r0 + (r1 - r0) * e), target };
}

// ---------- visibility ----------

/** Whether `p` can be seen from `eye`: outside the globe, and the sight line does not pass through it. */
export function visibleFrom(eye: THREE.Vector3, p: THREE.Vector3, r = DOME_R * 0.99): boolean {
  if (p.length() < r) return false;
  const d = p.clone().sub(eye);
  const a = d.dot(d);
  const b = 2 * eye.dot(d);
  const c = eye.dot(eye) - r * r;
  const disc = b * b - 4 * a * c;
  if (disc <= 0) return true;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return !(t > 0 && t < 1 - 1e-6);
}

// ---------- framing a live pair ----------

export interface FrameOpts {
  /** Half-angle tangents of the HUD's free rectangle (see GraphScene.frameTans). */
  tanH: number;
  tanV: number;
  /** The current eye: of two equal shots, the one on its side wins. */
  eye?: THREE.Vector3;
  /** Share of the free rectangle kept empty at its edges. */
  margin?: number;
}

export interface PairFrame {
  key: CameraKeyframe;
  /** True when the whole curve is in frame; false for the destination-only fallback. */
  full: boolean;
}

/** Distance from `target` along `dir` at which every point fits inside the free rectangle. */
function fitDistance(points: THREE.Vector3[], target: THREE.Vector3, dir: THREE.Vector3, o: FrameOpts): number {
  const m = 1 - (o.margin ?? 0.15);
  const right = new THREE.Vector3().crossVectors(UP, dir);
  if (right.lengthSq() < 1e-6) right.copy(perpendicular(dir));
  right.normalize();
  const up = new THREE.Vector3().crossVectors(dir, right).normalize();
  let dist = 0;
  for (const p of points) {
    const q = p.clone().sub(target);
    const z = q.dot(dir);
    dist = Math.max(dist, z + Math.abs(q.dot(right)) / (o.tanH * m), z + Math.abs(q.dot(up)) / (o.tanV * m));
  }
  return dist;
}

/**
 * Frame a rendered origin -> destination curve (first point origin, last
 * destination). The eye looks down on the curve's middle, tilted 20 degrees off
 * the curve's plane so an arc reads as a curve, and backs off until every point
 * fits. If any point would hide behind the globe (long arcs dip below the
 * skin), frame the destination instead, from the side away from the origin, so
 * the arc rises over the horizon.
 */
export function framePair(points: THREE.Vector3[], o: FrameOpts): PairFrame {
  const from = points[0];
  const to = points[points.length - 1];
  const mid = points[Math.floor(points.length / 2)];
  const n = from.clone().normalize().add(to.clone().normalize());
  if (n.lengthSq() < 1e-6) n.copy(mid);
  n.normalize();
  let across = new THREE.Vector3().crossVectors(from, to);
  across = across.lengthSq() < 1e-6 ? perpendicular(n) : across.normalize();
  const tilt = THREE.MathUtils.degToRad(20);
  const sides = [1, -1].map((s) => n.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(across, s * Math.sin(tilt)).normalize());
  const dir = o.eye && sides[1].dot(o.eye) > sides[0].dot(o.eye) ? sides[1] : sides[0];
  const target = points.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(points.length);
  let dist = Math.max(fitDistance(points, target, dir, o), DOME_R * 0.45);
  // Stay above the country bars, as high as an article shot (framePost), however short the hop.
  while (target.clone().addScaledVector(dir, dist).length() < DOME_R * 1.75) dist += 1;
  const eye = target.clone().addScaledVector(dir, dist);
  if (points.every((p) => visibleFrom(eye, p))) return { key: key(eye, target), full: true };
  return { key: frameDestination(from, to), full: false };
}

/** Something in the scene the camera should keep clear of: a bounding sphere. */
export interface Obstacle {
  centre: THREE.Vector3;
  radius: number;
}

/** Clearance the inside agent shot keeps from the SURFACE of any other entity (#68, B2). */
export const BEAM_CLEARANCE = 6;

/**
 * An AI agent fetching an entity inside the dome (#54): step inside, just
 * behind the entity, and look along the beam toward the agent's satellite, a
 * little off to one side so the beam reads as a diagonal. The cylinder sits in
 * the foreground, the satellite beyond the translucent skin. The eye stays
 * clear of the skin, as in frameInterior.
 *
 * #68 (B2): the eye also keeps BEAM_CLEARANCE from the surface of every other
 * entity (`obstacles`, bounding spheres of the entities near the shot).
 * Candidates: the preferred side, pulled back along the beam step by step,
 * then the other side. Both endpoints in frame (positive depth, inside the
 * HUD's free rectangle) is a hard constraint. Among the framed, clear
 * candidates, the one with the fewest entities between the eye and the
 * destination wins (in a dense country none may be free of them; the step-back
 * fade, B1, keeps those see-through). Without a clear one, the framed one with
 * the most clearance; without any framed one, the destination alone, as before.
 */
export function frameBeamInside(origin: THREE.Vector3, dest: THREE.Vector3, o: FrameOpts, obstacles: Obstacle[] = []): CameraKeyframe {
  const prevEye = o.eye;
  const dir = origin.clone().sub(dest);
  if (dir.lengthSq() < 1e-6) dir.copy(dest.lengthSq() > 1e-6 ? dest : new THREE.Vector3(0, 0, -1));
  dir.normalize();
  const eyeAt = (side: THREE.Vector3, back: number) => {
    const eye = dest.clone().addScaledVector(dir, -back).addScaledVector(side, 7).addScaledVector(UP, 3);
    return eye.length() > DOME_R * 0.82 ? eye.setLength(DOME_R * 0.82) : eye;
  };
  // Aim past the entity toward where the beam leaves the dome, so the cylinder
  // sits low in the frame and the satellite high.
  const b = dest.dot(dir);
  const exit = dest.clone().addScaledVector(dir, -b + Math.sqrt(Math.max(0, b * b - dest.lengthSq() + DOME_R * DOME_R)));
  const target = dest.clone().lerp(exit, 0.35);
  const first = sideFor(dir, (side) => eyeAt(side, 18), prevEye);
  let clear: { eye: THREE.Vector3; covers: number } | null = null;
  let closest: { eye: THREE.Vector3; gap: number } | null = null;
  for (const side of [first, first.clone().negate()])
    for (const back of [18, 22, 26, 30, 34]) {
      const eye = eyeAt(side, back);
      if (!inView(eye, target, dest, o) || !inView(eye, target, origin, o)) continue;
      const { gap, covers } = clearance(eye, dest, obstacles);
      if (gap >= BEAM_CLEARANCE) {
        if (!clear || covers < clear.covers) clear = { eye, covers };
      } else if (!closest || gap > closest.gap) closest = { eye, gap };
    }
  const pick = clear ?? closest;
  if (pick) return key(pick.eye, target);
  // Keeping the eye inside can carry it past a destination near the skin when
  // the satellite is across the globe (#55 review). Then show the destination
  // alone, from its centre side, looking out at it.
  const out = dest.lengthSq() > 1e-6 ? dest.clone().normalize() : new THREE.Vector3(0, 0, -1);
  const back = out.clone().multiplyScalar(Math.max(0, dest.length() - 22)).addScaledVector(perpendicular(out), 6).addScaledVector(UP, 3);
  return key(back, dest.clone());
}

/**
 * `gap`: the smallest distance from the eye to any obstacle's surface.
 * `covers`: how many obstacles sit between the eye and `dest`.
 */
export function clearance(eye: THREE.Vector3, dest: THREE.Vector3, obstacles: Obstacle[]): { gap: number; covers: number } {
  let gap = Infinity;
  let covers = 0;
  const seg = dest.clone().sub(eye);
  const len2 = Math.max(seg.lengthSq(), 1e-6);
  for (const { centre, radius } of obstacles) {
    gap = Math.min(gap, eye.distanceTo(centre) - radius);
    // Nearest point of the eye-to-entity segment, short of the entity itself.
    const t = THREE.MathUtils.clamp(centre.clone().sub(eye).dot(seg) / len2, 0, 0.9);
    if (eye.clone().addScaledVector(seg, t).distanceTo(centre) < radius) covers++;
  }
  return { gap, covers };
}

/** Whether `p` lies in front of a camera at `eye` looking at `target`, inside the free rectangle (10% margin). */
function inView(eye: THREE.Vector3, target: THREE.Vector3, p: THREE.Vector3, o: FrameOpts): boolean {
  const f = target.clone().sub(eye).normalize();
  const right = new THREE.Vector3().crossVectors(f, UP);
  if (right.lengthSq() < 1e-6) right.copy(perpendicular(f));
  right.normalize();
  const up = new THREE.Vector3().crossVectors(right, f);
  const q = p.clone().sub(eye);
  const depth = q.dot(f);
  return depth > 1 && Math.abs(q.dot(right)) <= o.tanH * 0.9 * depth && Math.abs(q.dot(up)) <= o.tanV * 0.9 * depth;
}

/** The destination from outside, 35 degrees away from the origin's side. */
function frameDestination(from: THREE.Vector3, to: THREE.Vector3): CameraKeyframe {
  const out = to.clone().normalize();
  const toward = from.clone().normalize().addScaledVector(out, -from.clone().normalize().dot(out));
  const away = toward.lengthSq() < 1e-6 ? perpendicular(out) : toward.normalize().negate();
  const a = THREE.MathUtils.degToRad(35);
  const dir = out.clone().multiplyScalar(Math.cos(a)).addScaledVector(away, Math.sin(a));
  return key(dir.multiplyScalar(DOME_R * 1.9), to.clone());
}

// ---------- framing an entity or article (moved out of GraphScene.select) ----------

/** The side vector across `out`; flipped when that puts the eye nearer the previous one. */
function sideFor(out: THREE.Vector3, eyeWith: (side: THREE.Vector3) => THREE.Vector3, prevEye?: THREE.Vector3): THREE.Vector3 {
  const side = perpendicular(out);
  if (!prevEye) return side;
  const flipped = side.clone().negate();
  return eyeWith(flipped).distanceTo(prevEye) < eyeWith(side).distanceTo(prevEye) ? flipped : side;
}

/**
 * An article dot, from outside: beside and above it, aimed between the dot and
 * its entities, so the dot sits off-centre and its rays fan across the frame.
 */
export function framePost(dot: THREE.Vector3, entities: THREE.Vector3[], prevEye?: THREE.Vector3): CameraKeyframe {
  const mid = entities.length ? entities.reduce((a, b) => a.add(b), new THREE.Vector3()).divideScalar(entities.length) : new THREE.Vector3();
  const target = dot.clone().lerp(mid, 0.45);
  const out = dot.clone().normalize();
  const eyeWith = (side: THREE.Vector3) => {
    const up = new THREE.Vector3().crossVectors(side, out).normalize();
    return out.clone().multiplyScalar(DOME_R * 1.75).addScaledVector(side, DOME_R * 0.95).addScaledVector(up, DOME_R * 0.5);
  };
  return key(eyeWith(sideFor(out, eyeWith, prevEye)), target);
}

/** A place hangs under its own spot on the true map: frame it from outside, where the map reads. */
export function framePlace(p: THREE.Vector3, reach: number, prevEye?: THREE.Vector3): CameraKeyframe {
  const out = p.clone().normalize();
  const eyeWith = (across: THREE.Vector3) => {
    const up = new THREE.Vector3().crossVectors(across, out).normalize();
    return out.clone().multiplyScalar(DOME_R * reach).addScaledVector(across, DOME_R * 0.22).addScaledVector(up, DOME_R * 0.18);
  };
  return key(eyeWith(sideFor(out, eyeWith, prevEye)), out.multiplyScalar(DOME_R * 0.96));
}

/**
 * Inside the dome, from the skin side: just inside the skin above `t`, looking
 * in toward the centre, so `t` sits in the foreground with the inner shells and
 * the wheel beyond. A run of these shots all look inward, so a camera moving
 * between them never passes its own target.
 */
export function frameInward(t: THREE.Vector3, prevEye?: THREE.Vector3): CameraKeyframe {
  const out = t.lengthSq() > 1e-6 ? t.clone().normalize() : new THREE.Vector3(0, 0, -1);
  const r = Math.min(t.length() + 16, DOME_R * 0.86);
  const eyeWith = (side: THREE.Vector3) => out.clone().multiplyScalar(r).addScaledVector(side, 5).addScaledVector(UP, 3);
  return key(eyeWith(sideFor(out, eyeWith, prevEye)), t.clone().multiplyScalar(0.55));
}

/** A topic sits on the wheel: look across it from above, from the far side. */
export function frameTopic(p: THREE.Vector3): CameraKeyframe {
  const d = new THREE.Vector3(p.x, 0, p.z);
  if (d.lengthSq() < 1e-4) d.set(0, 0, -1);
  d.normalize();
  return key(new THREE.Vector3(-d.x * 30, 36, -d.z * 30), p.clone().lerp(new THREE.Vector3(), 0.15));
}

/**
 * Inside the dome, stand behind the entity on the line from its articles and
 * look past it: the tag sits in the foreground, a little off-centre, with its
 * stories glowing behind it. The eye stays clear of the skin.
 */
export function frameInterior(t: THREE.Vector3, tiles: THREE.Vector3[], prevEye?: THREE.Vector3): CameraKeyframe {
  const toward = tiles.length ? tiles.reduce((a, c) => a.add(c), new THREE.Vector3()).divideScalar(tiles.length) : t.clone();
  if (toward.lengthSq() < 1) toward.copy(t); // articles all around the globe cancel out
  toward.setLength(DOME_R);
  const look = toward.clone().sub(t);
  if (look.lengthSq() < 1) look.copy(t).negate(); // entity sits on its own articles: look outward from the centre side
  look.normalize();
  const eyeWith = (side: THREE.Vector3) => {
    const eye = t.clone().addScaledVector(look, -22).addScaledVector(side, 5);
    return eye.length() > DOME_R * 0.82 ? eye.setLength(DOME_R * 0.82) : eye;
  };
  return key(eyeWith(sideFor(look, eyeWith, prevEye)), t.clone().lerp(toward, 0.35));
}
