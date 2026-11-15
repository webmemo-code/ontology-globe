// Scene 1, "the stack": how one ontology becomes everything the sites
// publish. A mini globe on the bottom floor (the globe view's shell, land and
// coast, scaled down) stands for the ontology; this module builds the floors
// above it, the soft haze the blogs draw from it, the quiet streams that pulse
// upward from the blogs to the outputs, and the readers' beams back down.
//
// Heights and sizes carry data from public/system.json: an output box is as
// tall as the log of how many items it serves, and a reader (an AI satellite
// or the travelers' dots) is as big as its (log-scaled, relative) monthly volume. Without that file the scene
// falls back to even sizes.
//
// Glass: the cylinders are see-through and do not write depth, so
// whatever stands behind them reads at every angle; their rims carry the form. Readers use the globe
// view's live-layer look: wireframe satellites, solid orange dots.
import * as THREE from 'three';
import type { Feature, Geometry } from 'geojson';
import { buildLand } from './land';
import { logoTexture } from './logo';
import { flowingDash } from './flowingDash';
import { TIER_COLORS } from './live';
import type { Vec3 } from '../data/model';
import type { Graph, SystemNumbers } from '../data/types';

export const CUBE_Y = -16;
export const MINI = 0.2; // the mini globe is the globe view at a fifth of its size
/** The globe view draws land and borders on this fraction of the dome radius. */
export const GHOST_SHELL = 0.965;
const TOWER_Y = 4;
const OUTPUT_Y = 22;
const CONSUMER_Y = 38;
// Draw order: haze and streams first, then the glass (sorted back to front by
// distance within one renderOrder), then rims (and the satellites), then the motes on top.
const ORDER = { haze: 1, stream: 2, glass: 3, rim: 4, mote: 5 };
/** Weight for a reader with no number in system.json: neutral, never zero. */
const NEUTRAL_WEIGHT = 0.5;

export interface SystemTile {
  key: string;
  title: string;
  at: Vec3;
}

/** The globe layout, shrunk onto the bottom floor. */
export function miniGlobePositions(globe: Map<string, Vec3>): Map<string, Vec3> {
  const pos = new Map<string, Vec3>();
  // Turned half a circle: the big globe faces Switzerland away from this
  // scene's camera, and the mini globe should show Europe, not the Pacific.
  for (const [k, p] of globe) pos.set(k, { x: -p.x * MINI, y: CUBE_Y + p.y * MINI, z: -p.z * MINI });
  return pos;
}

/** Opaque centre fading to clear at the rim, like the Periodic Cube's panes. */
function fadeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

/** Vertical glow for the haze: clear at both ends, brightest low, so it seems to rise out of the globe. */
function hazeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 128); // canvas top = top of the haze
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  g.addColorStop(0.8, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(c);
}

const CONSUMER_RADIUS = 22;

/** All orders of `n` items, for the small n of the readers' circle. */
function permutations(n: number): number[][] {
  if (n <= 1) return [[0].slice(0, n)];
  return permutations(n - 1).flatMap((p) => Array.from({ length: n }, (_, i) => [...p.slice(0, i), n - 1, ...p.slice(i)]));
}

/**
 * Even slots on a circle of `radius` for each item, minimising the summed
 * horizontal distance from each item's slot to its targets. Exhaustive over
 * orders and 1-degree rotations: exact, and cheap for a handful of items.
 */
export function placeOnCircle(targets: THREE.Vector3[][], radius: number): { x: number; z: number }[] {
  const n = targets.length;
  let best: { cost: number; order: number[]; turn: number } = { cost: Infinity, order: [], turn: 0 };
  for (const order of permutations(n))
    for (let deg = 0; deg < 360 / n; deg++) {
      const turn = (deg * Math.PI) / 180;
      let cost = 0;
      order.forEach((item, slot) => {
        const a = turn + (slot / n) * Math.PI * 2;
        const x = Math.cos(a) * radius;
        const z = Math.sin(a) * radius;
        for (const t of targets[item]) cost += Math.hypot(t.x - x, t.z - z);
      });
      if (cost < best.cost) best = { cost, order, turn };
    }
  const out: { x: number; z: number }[] = new Array(n);
  best.order.forEach((item, slot) => {
    const a = best.turn + (slot / n) * Math.PI * 2;
    out[item] = { x: Math.cos(a) * radius, z: Math.sin(a) * radius };
  });
  return out;
}

/**
 * Particles along static arcs, lit only while `active` is one of the arc's end
 * tiles (the glow eases in and out, so hovering does not flash them).
 */
function arcParticles(group: THREE.Group, curves: THREE.Curve<THREE.Vector3>[], ends: [string, string][], per: number, hex: string, size: number, speed: number) {
  const pos = new Float32Array(curves.length * per * 3);
  const col = new Float32Array(curves.length * per * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ vertexColors: true, size, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  pts.frustumCulled = false;
  pts.renderOrder = ORDER.mote;
  group.add(pts);
  const glow = curves.map(() => 0);
  const c = new THREE.Color(hex);
  const p = new THREE.Vector3();
  return (time: number, active: string | null) => {
    curves.forEach((curve, a) => {
      glow[a] += ((active !== null && ends[a].includes(active) ? 1 : 0) - glow[a]) * 0.12;
      for (let j = 0; j < per; j++) {
        const i = a * per + j;
        curve.getPoint((time * speed + j / per) % 1, p);
        pos.set([p.x, p.y, p.z], i * 3);
        col.set([c.r * glow[a], c.g * glow[a], c.b * glow[a]], i * 3);
      }
    });
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  };
}

export function buildSystem(graph: Graph, numbers: SystemNumbers | null, globeRadius: number) {
  const group = new THREE.Group();
  const labels: { text: string; pos: Vec3; color: string; px: number; priority: number }[] = [];
  const pickables: THREE.Mesh[] = [];
  // Upward streams (blogs to outputs): a thin line and one faint mote that
  // rises along it. `level` is the stream's brightness, 0..1.
  const streams: { a: THREE.Vector3; b: THREE.Vector3; level: number; color: THREE.Color }[] = [];
  const maxPosts = Math.max(...graph.sites.map((x) => x.posts), 1);
  const v = (p: Vec3) => new THREE.Vector3(p.x, p.y, p.z);
  const fade = fadeTexture();

  const plate = (y: number, r: number, name: string) => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r - 0.1, r + 0.1, 128),
      new THREE.MeshBasicMaterial({ color: '#989898', transparent: true, opacity: 0.15, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = y;
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(r, 96),
      new THREE.MeshBasicMaterial({ color: '#555555', map: fade, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = y - 0.02;
    group.add(ring, disc);
    labels.push({ text: name, pos: { x: -r * 0.55, y: y + 0.5, z: r * 0.84 }, color: '#BDBDBD', px: 11, priority: 3000 });
  };

  const tile = (t: SystemTile, color: string, r: number, h: number, opacity = 0.4) => {
    // Glass: low emissive and low roughness so the under-light leaves a streak
    // on the wall; no depth write so the tiles behind show through.
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3, roughness: 0.3, metalness: 0.1, transparent: true, opacity, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 48), mat);
    mesh.renderOrder = ORDER.glass;
    mesh.position.set(t.at.x, t.at.y + h / 2, t.at.z);
    mesh.userData.key = t.key;
    // Rims only: a low threshold would also draw every side facet as a line.
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 30), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6 }));
    edges.position.copy(mesh.position);
    edges.renderOrder = ORDER.rim;
    group.add(mesh, edges);
    pickables.push(mesh);
    labels.push({ text: t.title, pos: { x: t.at.x, y: t.at.y + h + 0.4, z: t.at.z }, color: '#ffffff', px: 12, priority: 4000 });
    return mesh;
  };

  // The source of truth is the globe itself, small: its continents are drawn
  // once the atlas loads (setLand).
  const r = globeRadius * MINI;
  plate(CUBE_Y - r - 1.5, r + 4, 'SOURCE OF TRUTH');
  plate(TOWER_Y, 22, 'PUBLISHING');
  plate(OUTPUT_Y, 30, 'GENERATED OUTPUTS');
  plate(CONSUMER_Y, 30, 'WHO READS IT');

  const globeTop = new THREE.Vector3(0, CUBE_Y + r, 0);
  labels.push({ text: `Ontology · ${graph.nodes.length} entities in YAML`, pos: { x: r + 9, y: CUBE_Y, z: 0 }, color: '#FF9000', px: 16, priority: 5000 });

  // Publishing: each blog a box whose VOLUME is its article count, with a
  // square section so all four sides are the same 3:1 face, the shape of a
  // wordmark, and the logo looks the same from every side.
  const towerW: number[] = [];
  const towers = graph.sites.map((s, i) => {
    const h = 0.9 * Math.cbrt(Math.max(1, s.posts) / 9);
    const w = 3 * h;
    const x = (i === 0 ? -1 : 1) * (w / 2 + 1);
    const color = i === 0 ? '#FF9000' : '#989898';
    const plain = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55 });
    const face = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.35 });
    // Box faces: +x, -x, +y, -y, +z, -z; the logo on all four sides.
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), [face, face, plain, plain, face, face]);
    mesh.position.set(x, TOWER_Y + h / 2, 0);
    mesh.userData.key = `sys:site:${s.key}`;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6 }));
    edges.position.copy(mesh.position);
    group.add(mesh, edges);
    pickables.push(mesh);
    labels.push({ text: `${s.name} · ${s.posts}`, pos: { x, y: TOWER_Y + h + 0.4, z: 0 }, color: '#ffffff', px: 12, priority: 4000 });
    void logoTexture(s.key, color).then((tex) => {
      face.map = tex;
      face.emissiveMap = tex;
      face.needsUpdate = true;
    });
    towerW[i] = w;
    return new THREE.Vector3(x, TOWER_Y + h, 0);
  });

  // The blogs draw from the globe: a soft haze rising from its top into each
  // blog's box, a few slow motes inside it, both stronger for the bigger blog.
  const hazeTex = hazeTexture();
  const motes: { a: THREE.Vector3; b: THREE.Vector3; off: THREE.Vector3; phase: number; rate: number; color: THREE.Color; level: number }[] = [];
  const hazes = towers.map((top, i) => {
    const heft = (graph.sites[i]?.posts ?? 0) / maxPosts;
    const color = new THREE.Color(i === 0 ? '#FF9000' : '#989898');
    const from = globeTop.clone();
    const to = top.clone().setY(TOWER_Y);
    const dir = to.clone().sub(from);
    const mat = new THREE.MeshBasicMaterial({ color, map: hazeTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(towerW[i] * 0.45, 0.9, dir.length(), 32, 1, true), mat);
    mesh.position.copy(from).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    mesh.renderOrder = ORDER.haze;
    group.add(mesh);
    const n = 2 + Math.round(4 * heft);
    for (let j = 0; j < n; j++) {
      const ang = j * 2.4 + i;
      const spread = towerW[i] * 0.3 * ((j % 3) / 3 + 0.2);
      motes.push({ a: from, b: to, off: new THREE.Vector3(Math.cos(ang) * spread, 0, Math.sin(ang) * spread), phase: j / n, rate: 0.045, color, level: 0.35 + 0.4 * heft });
    }
    return { mat, base: 0.16 + 0.26 * heft, i };
  });

  // Generated outputs, on a circle so the links between them can show:
  // height = log of the items each one serves, radius = how often AI crawlers
  // fetch it (log weight from system.json). Order keeps linked ones near.
  const outputs: [string, string, string][] = [
    ['sys:html', 'HTML pages', 'html'],
    ['sys:photos', 'Photos', 'images'],
    ['sys:okf', 'OKF bundle', 'okf'],
    ['sys:llmstxt', 'llms.txt', 'llms'],
    ['sys:entitymap', 'EntityMap', 'entitymap'],
    ['sys:taxonomy', 'Taxonomies', 'taxonomy'],
    ['sys:jsonld', 'JSON-LD', 'jsonld'],
  ];
  const base = new Map<string, THREE.Vector3>();
  const outTops = outputs.map(([key, title, field], i) => {
    const n = numbers?.outputs[field];
    // Log, offset so the smallest (llms.txt, ~120) still reads as a box and
    // each tenfold step adds the same height: photos stand clearly tallest.
    const h = n ? Math.max(1, 1 + 2.6 * (Math.log10(n) - 1.8)) : 2.4;
    const a = (i / outputs.length) * Math.PI * 2 + Math.PI / 2;
    const at = { x: Math.cos(a) * 20, y: OUTPUT_Y, z: Math.sin(a) * 20 };
    // JSON-LD ships inside the HTML and is never fetched on its own: a thin,
    // faint cylinder. Without system.json every output gets the same radius.
    const fetched = numbers?.retrievals;
    const w = fetched?.[field];
    const r = w !== undefined ? 1.2 + 3.5 * w : fetched ? 0.6 : 2.5;
    tile({ key, title: n ? `${title} · ${n.toLocaleString('en')}` : title, at }, '#FF8F00', r, h, fetched && w === undefined ? 0.45 : 0.85);
    base.set(key, v(at));
    return new THREE.Vector3(at.x, OUTPUT_Y + h, at.z);
  });
  // Stage 1, blogs -> outputs: every blog feeds every output, up.
  towers.forEach((t, i) => {
    const heft = (graph.sites[i]?.posts ?? 0) / maxPosts;
    const color = new THREE.Color(i === 0 ? '#FF9000' : '#989898');
    for (const o of outTops) streams.push({ a: t, b: o.clone().setY(OUTPUT_Y), level: 0.25 + 0.35 * heft, color });
  });
  // What points to what: static arcs over the floor within one level (not data
  // moving between levels, so not part of the upward flow). Their particles
  // run only while a connected tile is hovered or selected.
  const links: [string, string][] = [
    ['sys:okf', 'sys:html'],
    ['sys:okf', 'sys:photos'],
    ['sys:llmstxt', 'sys:okf'],
    ['sys:llmstxt', 'sys:html'],
    ['sys:entitymap', 'sys:html'],
    ['sys:jsonld', 'sys:html'],
    ['sys:taxonomy', 'sys:html'],
  ];
  const arcs = links.map(([from, to]) => {
    const a = base.get(from)!.clone().setY(OUTPUT_Y + 0.6);
    const b = base.get(to)!.clone().setY(OUTPUT_Y + 0.6);
    const mid = a.clone().add(b).multiplyScalar(0.5 * 0.55).setY(OUTPUT_Y + 5);
    return new THREE.QuadraticBezierCurve3(a, mid, b);
  });
  for (const arc of arcs)
    group.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(arc.getPoints(40)),
        new THREE.LineBasicMaterial({ color: '#FFB74D', transparent: true, opacity: 0.3, depthWrite: false }),
      ),
    );
  const linkParticles = arcParticles(group, arcs, links, 6, '#FFE0B2', 0.5, 0.3);

  // Who reads it, in the globe view's live-layer language: AI readers are
  // wireframe satellites in their tier colour, travelers a few solid orange
  // dots; size = relative monthly volume (log-scaled upstream).
  type Reader = { key: string; title: string; field: string; from: string[]; tier: string | null };
  const consumers: Reader[] = [
    { key: 'sys:google', title: 'Google Search', field: 'google', tier: TIER_COLORS.search, from: ['sys:html', 'sys:photos', 'sys:jsonld', 'sys:taxonomy'] },
    { key: 'sys:ai-training', title: 'AI training', field: 'ai-training', tier: TIER_COLORS.training, from: ['sys:html', 'sys:llmstxt', 'sys:okf', 'sys:entitymap'] },
    { key: 'sys:ai-search', title: 'AI search', field: 'ai-search', tier: TIER_COLORS.search, from: ['sys:html', 'sys:jsonld', 'sys:entitymap', 'sys:llmstxt', 'sys:okf'] },
    { key: 'sys:assistants', title: 'AI assistants', field: 'assistants', tier: TIER_COLORS.user, from: ['sys:html', 'sys:entitymap', 'sys:llmstxt', 'sys:okf'] },
    { key: 'sys:travelers', title: 'Travelers', field: 'travelers', tier: null, from: ['sys:html', 'sys:photos', 'sys:taxonomy'] },
  ];
  const readerAt = new Map<string, THREE.Vector3>();
  const tumblers: THREE.Mesh[] = [];
  const beamShifts: { value: number }[] = [];
  const READER_DOT = new THREE.Color('#FF9000').multiplyScalar(0.78); // dimmed like the live dots: crisp, no bloom
  // Readers sit on a circle above the outputs. Every order of readers around
  // it, at every turn of the circle, is tried (5! x 360 is nothing), and the
  // one with the shortest total beams down to the outputs each reader reads
  // wins, so a reader hangs over what it reads.
  const slots = placeOnCircle(
    consumers.map(({ from }) => from.map((k) => base.get(k)!)),
    CONSUMER_RADIUS,
  );
  consumers.forEach(({ key, title, field, from, tier }, i) => {
    const given = numbers?.consumers[field];
    const w = given ?? NEUTRAL_WEIGHT;
    const size = 1.4 + 2.4 * w; // satellite radius / traveler cluster radius
    const centre = new THREE.Vector3(slots[i].x, CONSUMER_Y + 3, slots[i].z);
    // Invisible pick proxy: wireframes and tiny dots are hard to hit.
    const proxy = new THREE.Mesh(new THREE.SphereGeometry(size + 0.8, 12, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    proxy.position.copy(centre);
    proxy.userData.key = key;
    proxy.renderOrder = ORDER.glass;
    group.add(proxy);
    pickables.push(proxy);
    if (tier) {
      const sat = new THREE.Mesh(new THREE.OctahedronGeometry(size), new THREE.MeshBasicMaterial({ color: tier, wireframe: true }));
      sat.position.copy(centre);
      sat.renderOrder = ORDER.rim;
      sat.rotation.set(i, i * 2, 0);
      group.add(sat);
      tumblers.push(sat);
    } else {
      // Small solid cores, more of them for more readers.
      const n = 4 + Math.round(8 * w);
      const dot = new THREE.SphereGeometry(0.28, 10, 8);
      const mat = new THREE.MeshBasicMaterial({ color: READER_DOT });
      for (let j = 0; j < n; j++) {
        const m = new THREE.Mesh(dot, mat);
        const rad = size * 0.8 * Math.sqrt((j + 0.5) / n);
        const ang = j * 2.4;
        m.position.set(centre.x + Math.cos(ang) * rad, centre.y + (((j * 5) % 7) / 3 - 1) * size * 0.4, centre.z + Math.sin(ang) * rad);
        m.renderOrder = ORDER.rim;
        group.add(m);
      }
    }
    // Labels sit outward of their reader, so two in line of sight keep both names.
    labels.push({ text: title, pos: { x: centre.x * 1.3, y: centre.y + size + 1.2, z: centre.z * 1.3 }, color: '#ffffff', px: 12, priority: 4000 });
    // Stage 2, readers -> outputs: beams DOWN onto the top of each cylinder the
    // reader reads. Illustrative: there is no measured reader x output matrix,
    // so the reader's own weight is its total, split over its beams. A reader
    // with no weight draws at a fixed, fainter level.
    const level = w / from.length;
    const opacity = given === undefined ? 0.25 : Math.min(1, 0.4 + 2.4 * level);
    const pos: number[] = [];
    for (const k of from) {
      const top = outTops[outputs.findIndex(([ok]) => ok === k)];
      pos.push(centre.x, centre.y - size, centre.z, top.x, top.y, top.z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    let beams: THREE.LineSegments;
    if (tier) {
      const { mat, shift } = flowingDash({ color: tier, dashSize: 0.8, gapSize: 0.8, transparent: true, opacity, depthWrite: false });
      beams = new THREE.LineSegments(geo, mat);
      beams.computeLineDistances();
      beamShifts.push(shift);
    } else {
      beams = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: READER_DOT, transparent: true, opacity, depthWrite: false }));
    }
    beams.frustumCulled = false;
    beams.renderOrder = ORDER.stream;
    group.add(beams);
    readerAt.set(key, centre);
  });
  // Many travelers arrive through a search engine or an AI answer, not
  // directly: blue arcs from those readers over to the travelers.
  const referrals = ['sys:google', 'sys:ai-search', 'sys:assistants'].map((from) => {
    const a = readerAt.get(from)!;
    const b = readerAt.get('sys:travelers')!;
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.y += 6 + a.distanceTo(b) * 0.12;
    return new THREE.QuadraticBezierCurve3(a, mid, b);
  });
  for (const arc of referrals)
    group.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(arc.getPoints(40)),
        new THREE.LineBasicMaterial({ color: '#8FBEFF', transparent: true, opacity: 0.3, depthWrite: false }),
      ),
    );
  const refParticles = arcParticles(
    group,
    referrals,
    ['sys:google', 'sys:ai-search', 'sys:assistants'].map((k): [string, string] => [k, 'sys:travelers']),
    8,
    '#CFE2FA',
    0.55,
    0.25,
  );

  // Stage 1 stream lines (blogs -> outputs): thin and dim.
  {
    const pos: number[] = [];
    const col: number[] = [];
    for (const { a, b, level, color } of streams) {
      const k = 0.1 + 0.55 * level;
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      col.push(color.r * k, color.g * k, color.b * k, color.r * k, color.g * k, color.b * k);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    lines.renderOrder = ORDER.stream;
    group.add(lines);
  }
  // One faint mote rises along each stream, out of phase with the others.
  streams.forEach((st, i) => motes.push({ a: st.a, b: st.b, off: new THREE.Vector3(), phase: (i * 0.37) % 1, rate: 0.1, color: st.color, level: Math.min(1, 0.2 + 1.6 * st.level) }));

  const mpos = new Float32Array(motes.length * 3);
  const mcol = new Float32Array(motes.length * 3);
  const mgeo = new THREE.BufferGeometry();
  mgeo.setAttribute('position', new THREE.BufferAttribute(mpos, 3));
  mgeo.setAttribute('color', new THREE.BufferAttribute(mcol, 3));
  const moteLayer = new THREE.Points(mgeo, new THREE.PointsMaterial({ vertexColors: true, size: 0.45, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  moteLayer.frustumCulled = false; // positions move after the first bounds pass
  moteLayer.renderOrder = ORDER.mote;
  group.add(moteLayer);

  const tmp = new THREE.Vector3();
  // Own clock that stands still under reduced motion and resumes without a jump.
  let time = 0;
  let last = 0;
  const animate = (t: number, active: string | null, reduced: boolean) => {
    if (!reduced) time += Math.min(0.1, Math.max(0, t - last));
    last = t;
    motes.forEach((m, i) => {
      const k = (time * m.rate + m.phase) % 1;
      tmp.lerpVectors(m.a, m.b, k).add(m.off);
      mpos.set([tmp.x, tmp.y, tmp.z], i * 3);
      // Fade in and out so a mote never pops: it is felt, not counted.
      const e = Math.sin(Math.PI * k) * m.level;
      mcol.set([m.color.r * e, m.color.g * e, m.color.b * e], i * 3);
    });
    mgeo.attributes.position.needsUpdate = true;
    mgeo.attributes.color.needsUpdate = true;
    // Satellites tumble as in the globe view; the beams' dashes flow down.
    tumblers.forEach((m) => m.rotation.set(time * 0.7, time * 1.1, 0));
    for (const sh of beamShifts) sh.value = -time * 4;
    for (const h of hazes) h.mat.opacity = h.base * (0.85 + 0.15 * Math.sin(time * 0.7 + h.i * 2));
    linkParticles(time, active);
    refParticles(time, active);
  };

  /** Land on the mini globe: the globe view's own land layer, scaled down. */
  const setLand = (features: Feature<Geometry>[]) => {
    const land = buildLand(features, globeRadius * GHOST_SHELL * MINI);
    land.position.y = CUBE_Y;
    land.rotation.y = Math.PI;
    group.add(land);
  };

  return { group, labels, pickables, animate, setLand };
}
