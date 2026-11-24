// The reader arc's geometry, kept pure so the camera framing and its tests
// use exactly the curve the live layer draws.
import * as THREE from 'three';
import { DOME_R } from '../data/globe';

/** Reader-to-article distance (globe units, ~11 degrees) below which a read draws as a local hop. */
export const LOCAL_HOP = 12;

/**
 * Arc over the skin from a reader's city to the article: the control point is
 * lifted outward, more for longer hops; a local read barely leaves the surface,
 * so Swiss hops do not tangle into a dome. Long hops (over ~95 degrees) dip
 * below the skin at their middle.
 */
export function readerArc(from: THREE.Vector3, to: THREE.Vector3): { curve: THREE.QuadraticBezierCurve3; local: boolean } {
  const local = from.distanceTo(to) < LOCAL_HOP;
  const mid = from.clone().add(to).multiplyScalar(0.5);
  const lift = DOME_R * (local ? 1.02 : 1.05 + (0.35 * from.distanceTo(to)) / (2 * DOME_R));
  const ctrl = mid.lengthSq() > 1 ? mid.setLength(lift) : new THREE.Vector3(0, lift, 0);
  return { curve: new THREE.QuadraticBezierCurve3(from, ctrl, to.clone().multiplyScalar(1.005)), local };
}
