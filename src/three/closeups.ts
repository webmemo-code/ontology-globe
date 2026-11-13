// Close-up photos on the dome. The atlas gives every tile a 64 px cell, cut to
// the triangle in its middle: right for the mosaic, a blurred fragment once a
// tile fills the screen. So the tiles nearest the camera, inside the photo
// band, get an overlay triangle carrying the whole photo (public/closeups/,
// 320 px) in natural colour: sharp, inside the triangle's inscribed circle, on
// a dark blurred copy of itself. The circle does not care how the triangle is
// turned, so each photo is mapped upright (world up) and unmirrored for the
// side the camera sees it from. A few at a time, loaded on demand, the oldest
// let go.
import * as THREE from 'three';
import { postKey } from '../data/globe';
import type { Dome } from './dome';

const SLOTS = 24;
const CACHE = 48;
/** Canvas side. The triangle's corners touch the canvas's inscribed circle; its own inscribed circle is half that. */
const S = 448;
/** How far the photo may reach past the triangle's inscribed circle; its corners are cut by the edges. */
const REACH = 1.15;
const WHITE = new THREE.Color(1, 1, 1);

export interface Closeups {
  group: THREE.Group;
  /** Pick and fade the overlays; call every frame with the dome's level of detail. */
  update: (camera: THREE.Camera, lod: { from: number; band: number; detail: number }) => void;
}

/** The photo, whole and sharp, centred in the triangle's inscribed circle, on a darkened blurred copy filling the canvas. */
function compose(img: HTMLImageElement): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const a = img.naturalWidth / img.naturalHeight;
  const cover = Math.max(S / img.naturalWidth, S / img.naturalHeight);
  ctx.filter = 'blur(10px) brightness(0.45)';
  ctx.drawImage(img, (S - img.naturalWidth * cover) / 2, (S - img.naturalHeight * cover) / 2, img.naturalWidth * cover, img.naturalHeight * cover);
  ctx.filter = 'none';
  // A rectangle of aspect a inscribed in a circle of radius r: w = 2ra / sqrt(1 + a^2).
  const r = (S / 4) * REACH;
  const w = (2 * r * a) / Math.sqrt(1 + a * a);
  const h = w / a;
  ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createCloseups(dome: Dome): Closeups {
  const group = new THREE.Group();
  const pos = dome.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  // The tile's near colour (rgba per corner), as GraphScene painted it.
  const col = dome.mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
  const slots = Array.from({ length: SLOTS }, () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(6), 2));
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    // After the dome (-1), before everything inside it.
    mesh.renderOrder = -0.5;
    mesh.visible = false;
    group.add(mesh);
    return { mesh, face: -1, side: 0 };
  });

  let have: Set<string> | null = null;
  fetch('closeups/index.json')
    .then((r) => (r.ok ? r.json() : []))
    .then((keys: string[]) => (have = new Set(keys)))
    .catch(() => (have = new Set()));

  // Composed textures, least recently used first (Map keeps insertion order).
  // Loads in flight are tracked apart from them and capped at SLOTS, so a fast
  // pan cannot queue more than one screenful, and trim() runs whenever a texture
  // arrives: only textures a slot shows right now are kept past CACHE.
  const ready = new Map<string, THREE.CanvasTexture>();
  const pending = new Set<string>();
  const failed = new Set<string>();
  const trim = () => {
    const shown = new Set(slots.map((s) => s.mesh.material.map));
    for (const [k, t] of ready) {
      if (ready.size <= CACHE) break;
      if (shown.has(t)) continue;
      t.dispose();
      ready.delete(k);
    }
  };
  const load = (key: string) => {
    const t = ready.get(key);
    if (t) {
      ready.delete(key); // re-insert: most recently used
      ready.set(key, t);
      return t;
    }
    if (pending.has(key) || failed.has(key) || pending.size >= SLOTS) return null;
    pending.add(key);
    const [, site, id] = key.split(':');
    const img = new Image();
    img.onload = () => {
      pending.delete(key);
      ready.set(key, compose(img));
      trim();
    };
    img.onerror = () => {
      pending.delete(key);
      failed.add(key);
    };
    img.src = `closeups/${site}/${id}.jpg`;
    return null;
  };

  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const mid = new THREE.Vector3();
  const facing = new THREE.Vector3();
  const up = new THREE.Vector3();
  const right = new THREE.Vector3();

  /**
   * Copy face f's corners and give them UVs in a frame where up is world up
   * projected onto the tile and right is right as seen from `side` (+1 outside
   * the dome, -1 inside), so the photo reads upright and unmirrored.
   */
  const mapUpright = (geo: THREE.BufferGeometry, f: number, side: number) => {
    const a = geo.getAttribute('position') as THREE.BufferAttribute;
    const u = geo.getAttribute('uv') as THREE.BufferAttribute;
    mid.set(0, 0, 0);
    for (let k = 0; k < 3; k++) {
      corners[k].fromBufferAttribute(pos, f * 3 + k);
      a.setXYZ(k, corners[k].x, corners[k].y, corners[k].z);
      mid.add(corners[k]);
    }
    mid.divideScalar(3);
    facing.copy(mid).normalize().multiplyScalar(side); // towards the camera
    up.set(0, 1, 0).addScaledVector(facing, -facing.y);
    if (up.lengthSq() < 1e-6) up.set(0, 0, 1).addScaledVector(facing, -facing.z);
    up.normalize();
    right.crossVectors(up, facing);
    const rc = corners[0].distanceTo(mid); // circumradius: corners land on the canvas's inscribed circle
    for (let k = 0; k < 3; k++) {
      const d = tmp2.subVectors(corners[k], mid);
      u.setXY(k, 0.5 + (0.5 * d.dot(right)) / rc, 0.5 + (0.5 * d.dot(up)) / rc);
    }
    a.needsUpdate = u.needsUpdate = true;
    geo.computeBoundingSphere();
  };
  let frame = 0;
  let picked: { f: number; d: number }[] = [];

  const update: Closeups['update'] = (camera, lod) => {
    if (!have || lod.detail < 0.02) {
      for (const s of slots) s.mesh.visible = false;
      return;
    }
    const eye = camera.getWorldPosition(tmp);
    // Re-pick a few times a second; distances are cheap but 2,400 of them every frame are not free.
    if (frame++ % 8 === 0) {
      const near: { f: number; d: number }[] = [];
      for (let f = 0; f < dome.faceToPost.length; f++) {
        const i = dome.faceToPost[f];
        if (i < 0) continue;
        const d = dome.centers[f].distanceTo(eye);
        // Hidden tiles (the other blog in a one-blog view) never take a slot or a download.
        if (d < lod.from + lod.band && col.getW(f * 3) > 0.01 && have.has(postKey(dome.posts[i]))) near.push({ f, d });
      }
      picked = near.sort((a, b) => a.d - b.d).slice(0, SLOTS);
    }
    slots.forEach((s, n) => {
      const p = picked[n];
      if (!p) return void (s.mesh.visible = false);
      const tex = load(postKey(dome.posts[dome.faceToPost[p.f]]));
      if (!tex) return void (s.mesh.visible = false);
      const centre = dome.centers[p.f];
      const side = Math.sign(tmp2.subVectors(eye, centre).dot(centre)) || 1;
      if (s.face !== p.f || s.side !== side) {
        s.face = p.f;
        s.side = side;
        mapUpright(s.mesh.geometry, p.f, side);
      }
      if (s.mesh.material.map !== tex) {
        s.mesh.material.map = tex;
        s.mesh.material.needsUpdate = true;
      }
      // The tile's own paint still speaks: a hidden tile (other blog) shows no
      // close-up, a dimmed one (outside a selection) a fainter one, and the
      // photo carries half of the tile's tint (warm white when selected, EN/DE otherwise).
      const [r, g, b, alpha] = [col.getX(p.f * 3), col.getY(p.f * 3), col.getZ(p.f * 3), col.getW(p.f * 3)];
      const top = Math.max(r, g, b, 1e-3);
      s.mesh.material.color.setRGB(r / top, g / top, b / top).lerp(WHITE, 0.5);
      // Fade in with the dome's photo detail, out towards the edge of the photo band.
      const d = dome.centers[p.f].distanceTo(eye);
      s.mesh.material.opacity =
        Math.min(1, alpha / 0.45) * lod.detail * (1 - THREE.MathUtils.smoothstep(d, lod.from - lod.band, lod.from + lod.band));
      s.mesh.visible = s.mesh.material.opacity > 0.01;
    });
  };

  return { group, update };
}
