import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DOME_R } from '../data/globe';
import { readerArc } from './arc';
import { BEAM_CLEARANCE, clearance, frameBeamInside, frameInward, framePair, outranks, pathAt, pathPolicy, visibleFrom, kf, type CameraKeyframe } from './camera';

const FOV = 55;
const ASPECTS = { desktop: 16 / 10, phone: 9 / 19.5 };

function tans(aspect: number) {
  const tanV = Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
  return { tanV, tanH: tanV * aspect };
}

/** A reader in Zurich-ish and an article `deg` degrees away, as the live layer draws it. */
function arc(deg: number, axisTilt = 0.3) {
  const a = new THREE.Vector3(0.12, 0.72, -0.68).normalize();
  const axis = new THREE.Vector3().crossVectors(a, new THREE.Vector3(Math.sin(axisTilt), 0, Math.cos(axisTilt))).normalize();
  const from = a.clone().multiplyScalar(DOME_R * 1.015);
  const to = a.clone().applyAxisAngle(axis, THREE.MathUtils.degToRad(deg)).multiplyScalar(DOME_R);
  return readerArc(from, to).curve.getPoints(48);
}

function shoot(key: CameraKeyframe, aspect: number) {
  const cam = new THREE.PerspectiveCamera(FOV, aspect, 0.1, 2000);
  cam.position.set(key.position.x, key.position.y, key.position.z);
  cam.lookAt(key.target.x, key.target.y, key.target.z);
  cam.updateMatrixWorld();
  const eye = cam.position.clone();
  return (p: THREE.Vector3) => {
    const ndc = p.clone().project(cam);
    return { inFrame: Math.abs(ndc.x) <= 0.86 && Math.abs(ndc.y) <= 0.86 && ndc.z < 1, visible: visibleFrom(eye, p) };
  };
}

describe('framePair', () => {
  for (const [name, aspect] of Object.entries(ASPECTS)) {
    for (const deg of [0.5, 10, 60, 80]) {
      it(`frames the whole ${deg} degree arc on ${name}`, () => {
        const points = arc(deg);
        const { key, full } = framePair(points, tans(aspect));
        expect(full).toBe(true);
        const at = shoot(key, aspect);
        for (const p of points) expect(at(p)).toEqual({ inFrame: true, visible: true });
        expect(new THREE.Vector3(key.position.x, key.position.y, key.position.z).length()).toBeGreaterThanOrEqual(DOME_R * 1.3);
      });
    }
    // Long arcs dip below the skin (a 120 degree arc's middle sits at ~0.93 R): destination only.
    for (const deg of [120, 170]) {
      it(`falls back to the destination for a ${deg} degree arc on ${name}`, () => {
        const points = arc(deg);
        const { key, full } = framePair(points, tans(aspect));
        expect(full).toBe(false);
        expect(shoot(key, aspect)(points[points.length - 1])).toEqual({ inFrame: true, visible: true });
      });
    }
  }

  it('the 120 degree arc really dips below the skin', () => {
    expect(Math.min(...arc(120).map((p) => p.length()))).toBeLessThan(DOME_R * 0.95);
  });

  it('keeps the side of the current eye', () => {
    const points = arc(40);
    const a = framePair(points, tans(ASPECTS.desktop)).key.position;
    const b = framePair(points, { ...tans(ASPECTS.desktop), eye: new THREE.Vector3(-a.x, -a.y, -a.z) }).key.position;
    expect(new THREE.Vector3(a.x, a.y, a.z).distanceTo(new THREE.Vector3(b.x, b.y, b.z))).toBeGreaterThan(1);
  });

});

describe('pathAt', () => {
  const sample = (from: CameraKeyframe, to: CameraKeyframe) =>
    Array.from({ length: 65 }, (_, i) => pathAt(from, to, i / 64, pathPolicy(from, to, true)).position);

  it('orbits outside: never nearer the centre than the nearer end, never beyond the farther', () => {
    const from = kf([28, 30, -142], [0, 2, 0]);
    const to = kf([120, -20, 60], [10, 0, 5]);
    expect(pathPolicy(from, to, true)).toBe('orbit');
    const r = sample(from, to).map((p) => p.length());
    const r0 = r[0];
    const r1 = r[r.length - 1];
    for (const x of r) {
      expect(x).toBeGreaterThanOrEqual(Math.min(r0, r1) - 1e-6);
      expect(x).toBeLessThanOrEqual(Math.max(r0, r1) + 1e-6);
    }
  });

  it('lands exactly on both keyframes', () => {
    const from = kf([0, 0, -150], [0, 0, 0]);
    const to = kf([90, 40, 20], [5, 5, 5]);
    const [first, last] = [pathAt(from, to, 0, 'orbit'), pathAt(from, to, 1, 'orbit')];
    expect(first.position.distanceTo(new THREE.Vector3(0, 0, -150))).toBeLessThan(1e-6);
    expect(last.position.distanceTo(new THREE.Vector3(90, 40, 20))).toBeLessThan(1e-6);
    expect(last.target.distanceTo(new THREE.Vector3(5, 5, 5))).toBeLessThan(1e-6);
  });

  it('turns antipodal ends about a stable axis, round the globe rather than through it', () => {
    const from = kf([0, 0, -150], [0, 0, 0]);
    const to = kf([0, 0, 150], [0, 0, 0]);
    const a = sample(from, to);
    const b = sample(from, to);
    a.forEach((p, i) => {
      expect(p.distanceTo(b[i])).toBe(0);
      expect(p.length()).toBeCloseTo(150, 6);
    });
  });

  it('flies straight inside the dome and in the system view', () => {
    expect(pathPolicy(kf([5, 5, 5], [0, 0, 0]), kf([90, 40, 20], [0, 0, 0]), true)).toBe('linear');
    expect(pathPolicy(kf([0, 0, -150], [0, 0, 0]), kf([90, 40, 20], [0, 0, 0]), false)).toBe('linear');
  });
});

describe('camera owners', () => {
  // A quick Next: the next tour stop must replace the previous stop's flight,
  // whether that stop flew to a keyframe or framed a selection (#46 review).
  it('lets a tour flight replace a tour flight', () => {
    expect(outranks('tour', 'tour')).toBe(false);
  });
  it('keeps a user selection over the tour and live follow, and the user over all', () => {
    expect(outranks('select', 'tour')).toBe(true);
    expect(outranks('tour', 'follow')).toBe(true);
    expect(outranks('user', 'select')).toBe(true);
  });
});

describe('frameInward', () => {
  // The inside tour stops (#45) all look in toward the centre, so a straight
  // flight between two of them never passes through its own target.
  const entities = [new THREE.Vector3(-3, 2, -30), new THREE.Vector3(-1, 1, -42), new THREE.Vector3(4, -6, -20)];
  it('keeps the eye inside the dome and further out than its target', () => {
    for (const t of entities) {
      const { position: p, target: q } = frameInward(t);
      const eye = new THREE.Vector3(p.x, p.y, p.z);
      const target = new THREE.Vector3(q.x, q.y, q.z);
      expect(eye.length()).toBeLessThanOrEqual(DOME_R * 0.9);
      expect(eye.length()).toBeGreaterThan(target.length());
    }
  });
  it('a straight flight between two inward shots never meets its target', () => {
    const [a, b] = [frameInward(entities[0]), frameInward(entities[1], new THREE.Vector3(0, 0, -50))];
    for (let i = 0; i <= 32; i++) {
      const { position, target } = pathAt(a, b, i / 32, 'linear');
      expect(position.distanceTo(target)).toBeGreaterThan(5);
    }
  });
});

describe('frameBeamInside', () => {
  // An agent fetching an entity (#54): the camera goes inside, and both the
  // satellite and the cylinder are in frame.
  const cases = [
    { sat: new THREE.Vector3(0.1, 0.6, -1).normalize().multiplyScalar(DOME_R * 1.55), entity: new THREE.Vector3(-2, 4, -28) },
    { sat: new THREE.Vector3(-0.8, 0.3, 0.5).normalize().multiplyScalar(DOME_R * 1.3), entity: new THREE.Vector3(6, -3, -40) },
    { sat: new THREE.Vector3(0, 1, 0).multiplyScalar(DOME_R * 1.65), entity: new THREE.Vector3(1, 2, 3) },
  ];
  for (const [name, aspect] of Object.entries(ASPECTS))
    cases.forEach(({ sat, entity }, i) => {
      it(`keeps satellite and cylinder in frame from inside, case ${i + 1} on ${name}`, () => {
        const k = frameBeamInside(sat, entity, tans(aspect));
        expect(new THREE.Vector3(k.position.x, k.position.y, k.position.z).length()).toBeLessThanOrEqual(DOME_R * 0.82 + 1e-6);
        const at = shoot(k, aspect);
        expect(at(entity).inFrame).toBe(true);
        expect(at(sat).inFrame).toBe(true);
      });
    });

  // #55 review: a destination on the outer sight shell with the satellite
  // across the globe. Keeping the eye inside used to put the destination
  // behind the camera; now it falls back to the destination alone, in front.
  for (const [name, aspect] of Object.entries(ASPECTS))
    it(`keeps a far-side destination on the outer shell in front of the camera on ${name}`, () => {
      const dest = new THREE.Vector3(0, 0, 52);
      const sat = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(150)).multiplyScalar(93);
      const k = frameBeamInside(sat, dest, tans(aspect));
      expect(new THREE.Vector3(k.position.x, k.position.y, k.position.z).length()).toBeLessThanOrEqual(DOME_R * 0.82 + 1e-6);
      expect(shoot(k, aspect)(dest).inFrame).toBe(true);
    });
});

describe('frameBeamInside clearance (#68, B2)', () => {
  const sat = new THREE.Vector3(0.1, 0.6, -1).normalize().multiplyScalar(DOME_R * 1.55);
  const entity = new THREE.Vector3(-2, 4, -28);
  const pos = (k: CameraKeyframe) => new THREE.Vector3(k.position.x, k.position.y, k.position.z);
  const framed = (k: CameraKeyframe, aspect: number) => {
    const at = shoot(k, aspect);
    return at(entity).inFrame && at(sat).inFrame;
  };

  for (const [name, aspect] of Object.entries(ASPECTS)) {
    it(`keeps the default shot when nothing is in the way on ${name}`, () => {
      expect(frameBeamInside(sat, entity, tans(aspect), [])).toEqual(frameBeamInside(sat, entity, tans(aspect)));
    });

    it(`moves off an emblem sitting where the camera would be on ${name}`, () => {
      const plain = pos(frameBeamInside(sat, entity, tans(aspect)));
      const emblem = { centre: plain.clone(), radius: 4 };
      const k = frameBeamInside(sat, entity, tans(aspect), [emblem]);
      expect(pos(k).distanceTo(emblem.centre) - emblem.radius).toBeGreaterThanOrEqual(BEAM_CLEARANCE);
      expect(framed(k, aspect)).toBe(true);
    });

    it(`takes the other side when the preferred one is blocked all the way back on ${name}`, () => {
      const plain = pos(frameBeamInside(sat, entity, tans(aspect)));
      // A wall of big emblems along the preferred side's whole pull-back line.
      const dir = sat.clone().sub(entity).normalize();
      const wall = [0, 4, 8, 12, 16].map((d) => ({ centre: plain.clone().addScaledVector(dir, -d), radius: 5 }));
      const k = frameBeamInside(sat, entity, tans(aspect), wall);
      expect(clearance(pos(k), entity, wall).gap).toBeGreaterThanOrEqual(BEAM_CLEARANCE);
      expect(framed(k, aspect)).toBe(true);
    });

    it(`keeps both endpoints framed when no pose is clear on ${name}`, () => {
      // Obstacles everywhere: no candidate can be clear, framing still wins.
      const fog = [];
      for (let x = -40; x <= 40; x += 8) for (let y = -40; y <= 40; y += 8) for (let z = -50; z <= 10; z += 8) fog.push({ centre: new THREE.Vector3(x, y, z), radius: 3 });
      const k = frameBeamInside(sat, entity, tans(aspect), fog);
      expect(pos(k).length()).toBeLessThanOrEqual(DOME_R * 0.82 + 1e-6);
      expect(framed(k, aspect)).toBe(true);
    });
  }

  it('measures the gap to the surface and counts what covers the entity', () => {
    const eye = new THREE.Vector3(0, 0, 0);
    const dest = new THREE.Vector3(0, 0, -20);
    expect(clearance(eye, dest, [{ centre: new THREE.Vector3(0, 0, -10), radius: 2 }])).toEqual({ gap: 8, covers: 1 });
    expect(clearance(eye, dest, [{ centre: new THREE.Vector3(10, 0, -10), radius: 2 }]).covers).toBe(0);
  });

  for (const [name, aspect] of Object.entries(ASPECTS))
    it(`prefers the clear pose with fewer entities in front of the destination on ${name}`, () => {
      const plain = pos(frameBeamInside(sat, entity, tans(aspect)));
      // A small emblem just in front of the entity on the default line of sight.
      const blocker = { centre: plain.clone().lerp(entity, 0.8), radius: 1.5 };
      const k = frameBeamInside(sat, entity, tans(aspect), [blocker]);
      const c = clearance(pos(k), entity, [blocker]);
      expect(c.gap).toBeGreaterThanOrEqual(BEAM_CLEARANCE);
      expect(c.covers).toBe(0);
      expect(framed(k, aspect)).toBe(true);
    });
});
