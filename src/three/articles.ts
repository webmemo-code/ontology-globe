// The "true map" layer: land as a field of dots in the real shape of the
// continents, one dot per article at the place it is about, and a pair of bars
// per country (orange Travelmemo, grey Reisememo) as tall as the article count.
import * as THREE from 'three';
import { geoContains } from 'd3-geo';
import { DOME_R, articleCountry, domeDirection, postKey } from '../data/globe';
import type { PlaceTree, Vec3 } from '../data/model';
import type { Atlas } from '../data/atlas';
import type { Graph, GraphNode, GraphPost, Perf, SiteKey, SiteMode } from '../data/types';
import { fadeRange } from './depthFade';
import { rasteriseLand } from './land';

const RANK: Record<Perf, number> = { top10: 0, top25: 1, active: 2, seen: 3, none: 4 };
const ARTICLE_SIZE = 0.55;
const LAND_SIZE = 0.5;
const LAND_DOTS = 26000;
const LAND_R = DOME_R * 0.985;
const LAND_COLOR = new THREE.Color('#8a8a88');
const BAR_COLORS: Record<SiteKey, string> = { travelmemo: '#FF9000', reisememo: '#989898' };
const NADIR: [number, number, number] = [0, -1, 0];

export interface ArticleStyle {
  rgba: number[];
  size: number;
}

export interface ArticleLayer {
  group: THREE.Group;
  /** Article dots; point index i is `posts[i]`. */
  points: THREE.Points;
  posts: GraphPost[];
  /** Where an article's dot sits, on the skin. */
  at: (key: string) => THREE.Vector3 | null;
  /** The article's country node key. */
  countryOf: (key: string) => string | null;
  /** Per-dot colour and size multiplier; null hides the dot and makes it unpickable. */
  paint: (style: (post: GraphPost) => ArticleStyle | null) => void;
  isVisible: (index: number) => boolean;
  /** Builds the land dots and refines article positions (photo GPS inside the right country). */
  setAtlas: (atlas: Atlas) => void;
  setMode: (mode: SiteMode) => void;
  /** Country bars, pick targets: userData.key is the country node key. */
  bars: THREE.Mesh[];
  /** Per frame: depth-fade range, bar culling. Same numbers the old dome LOD produced. */
  update: (camera: THREE.Camera) => { from: number; far: number; band: number; detail: number };
  /** The same dots for the small globe in "How it works". */
  mini: () => THREE.Group;
}

const VERTEX = `
uniform float uViewH;
uniform float uDpr;
uniform float uMinPx;
uniform float uR;
attribute vec4 color;
attribute float size;
varying vec4 vColor;
varying float vFacing;
varying float vFadeDepth;
varying float vFadeOn;
void main() {
  vec4 mv = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mv;
  // Model scale: the mini globe wears the same dots at a fifth of the size.
  float s = length( modelMatrix[ 0 ].xyz );
  vec3 centre = ( modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
  // Inside the sphere nothing is culled; outside, dots facing away are hidden.
  vFacing = length( centre ) < uR * s ? 1.0 : dot( normalize( mv.xyz - centre ), normalize( -mv.xyz ) );
  vFadeDepth = -mv.z;
  vFadeOn = step( 0.99, s ); // the depth range belongs to the big globe only
  float px = size * s * projectionMatrix[ 1 ][ 1 ] * uViewH * 0.5 / max( -mv.z, 0.01 );
  gl_PointSize = max( px, uMinPx * uDpr );
  vColor = color;
}`;

const FRAGMENT = `
uniform float uFadeFrom;
uniform float uFadeFar;
varying vec4 vColor;
varying float vFacing;
varying float vFadeDepth;
varying float vFadeOn;
void main() {
  float d = length( gl_PointCoord - 0.5 ) * 2.0;
  if ( d > 1.0 ) discard;
  float edge = 1.0 - smoothstep( 0.55, 1.0, d );
  float k = smoothstep( uFadeFrom, uFadeFar, vFadeDepth ) * vFadeOn;
  vec4 c = vColor;
  c.rgb *= 1.0 - 0.7 * k;
  c.a *= ( 1.0 - 0.4 * k ) * edge * smoothstep( -0.02, 0.06, vFacing );
  if ( c.a < 0.002 ) discard;
  gl_FragColor = c;
  #include <colorspace_fragment>
}`;

function dotMaterial(minPx: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uViewH: { value: 800 },
      uDpr: { value: 1 },
      uMinPx: { value: minPx },
      uR: { value: DOME_R },
      uFadeFrom: fadeRange.uFadeFrom,
      uFadeFar: fadeRange.uFadeFar,
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
  });
}

/** Keep the point-size uniforms in step with the target being drawn (bloom renders off-screen). */
function track(points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>) {
  const size = new THREE.Vector2();
  points.onBeforeRender = (renderer) => {
    const target = renderer.getRenderTarget();
    const u = points.material.uniforms;
    u.uViewH.value = target ? target.height : renderer.getDrawingBufferSize(size).y;
    u.uDpr.value = renderer.getPixelRatio();
  };
  return points;
}

function dotGeometry(count: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 4), 4).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('size', new THREE.BufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage));
  return g;
}

export function buildArticleLayer(graph: Graph, _pos: Map<string, Vec3>, nodes: Map<string, GraphNode>, tree: PlaceTree): ArticleLayer {
  const posts = graph.posts;
  const keys = posts.map(postKey);
  const country = new Map(posts.map((p, i) => [keys[i], articleCountry(p, nodes, tree)]));
  const where = new Map(keys.map((k) => [k, new THREE.Vector3()]));
  const visible = new Uint8Array(posts.length);

  // ---------- article dots ----------
  const geometry = dotGeometry(posts.length);
  const articleMat = dotMaterial(2.5);
  const points = track(new THREE.Points(geometry, articleMat));
  points.renderOrder = -1;
  const sizes = geometry.getAttribute('size') as THREE.BufferAttribute;
  const colors = geometry.getAttribute('color') as THREE.BufferAttribute;
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;

  /** The deepest place with coordinates; a country-level one yields to the photo GPS when that lies inside it. */
  const anchorOf = (post: GraphPost, atlas: Atlas | null): [number, number, number] => {
    const placed = post.entities
      .map((k) => nodes.get(k))
      .filter((n): n is GraphNode => !!n && n.class === 'places' && !!n.geo)
      .sort((a, b) => b.depth - a.depth);
    const top = placed[0];
    if (!top) return NADIR;
    let at = top.geo!;
    if (top.type === 'Country' && post.geo && atlas) {
      const feature = atlas.byNode.get(top.key);
      if (feature && geoContains(feature, [post.geo.lon, post.geo.lat])) at = post.geo;
    }
    return domeDirection(at.lat, at.lon);
  };

  const place = (atlas: Atlas | null) => {
    const groups = new Map<string, { dir: [number, number, number]; members: number[] }>();
    posts.forEach((p, i) => {
      const dir = anchorOf(p, atlas);
      const id = dir.map((x) => x.toFixed(4)).join(',');
      const g = groups.get(id) ?? { dir, members: [] };
      g.members.push(i);
      groups.set(id, g);
    });
    const v = new THREE.Vector3();
    const t1 = new THREE.Vector3();
    const t2 = new THREE.Vector3();
    for (const { dir, members } of groups.values()) {
      members.sort((a, b) => RANK[posts[a].perf] - RANK[posts[b].perf] || posts[a].id - posts[b].id);
      const n = new THREE.Vector3(...dir);
      t1.crossVectors(n, Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
      t2.crossVectors(n, t1);
      members.forEach((i, k) => {
        v.copy(n).multiplyScalar(DOME_R);
        // Sunflower spiral: shared anchors fan out instead of stacking.
        const a = k * 2.39996;
        const r = 0.42 * Math.sqrt(k);
        v.addScaledVector(t1, r * Math.cos(a)).addScaledVector(t2, r * Math.sin(a)).setLength(DOME_R);
        positions.setXYZ(i, v.x, v.y, v.z);
        where.get(keys[i])!.copy(v);
      });
    }
    positions.needsUpdate = true;
    geometry.computeBoundingSphere();
  };
  place(null);

  // ---------- land dots ----------
  let landGeometry = dotGeometry(0);
  const landMat = dotMaterial(1.5);
  const land = track(new THREE.Points(landGeometry, landMat));
  land.renderOrder = -2;

  const buildLandDots = (atlas: Atlas): THREE.BufferGeometry => {
    const canvas = rasteriseLand(atlas.features);
    const { width: w, height: h } = canvas;
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, w, h);
    const pts: number[] = [];
    for (let i = 0; i < LAND_DOTS; i++) {
      // Fibonacci lattice: even coverage of the whole sphere.
      const lat = (Math.asin(1 - (2 * (i + 0.5)) / LAND_DOTS) * 180) / Math.PI;
      const lon = ((i * 137.50776405) % 360) - 180;
      const x = Math.min(w - 1, Math.floor(((lon + 180) / 360) * w));
      const y = Math.min(h - 1, Math.floor(((90 - lat) / 180) * h));
      if (data[(y * w + x) * 4 + 3] < 128) continue;
      const d = domeDirection(lat, lon);
      pts.push(d[0] * LAND_R, d[1] * LAND_R, d[2] * LAND_R);
    }
    const n = pts.length / 3;
    const g = dotGeometry(n);
    (g.getAttribute('position') as THREE.BufferAttribute).array.set(pts);
    const c = g.getAttribute('color') as THREE.BufferAttribute;
    const s = g.getAttribute('size') as THREE.BufferAttribute;
    for (let i = 0; i < n; i++) {
      c.setXYZW(i, LAND_COLOR.r, LAND_COLOR.g, LAND_COLOR.b, 0.8);
      s.setX(i, LAND_SIZE);
    }
    g.computeBoundingSphere();
    return g;
  };

  // ---------- country bars ----------
  const group = new THREE.Group();
  const bars: THREE.Mesh[] = [];
  const barInfo: { site: SiteKey; dir: THREE.Vector3; on: boolean }[] = [];
  const counts = new Map<string, Record<SiteKey, number>>();
  posts.forEach((p, i) => {
    const c = country.get(keys[i]);
    if (!c) return;
    const row = counts.get(c) ?? { travelmemo: 0, reisememo: 0 };
    row[p.site]++;
    counts.set(c, row);
  });
  const barMats: Record<SiteKey, THREE.MeshBasicMaterial> = {
    travelmemo: new THREE.MeshBasicMaterial({ color: BAR_COLORS.travelmemo }),
    reisememo: new THREE.MeshBasicMaterial({ color: BAR_COLORS.reisememo }),
  };
  const up = new THREE.Vector3(0, 1, 0);
  for (const node of nodes.values()) {
    const row = counts.get(node.key);
    if (node.type !== 'Country' || !node.geo || !row) continue;
    const dir = new THREE.Vector3(...domeDirection(node.geo.lat, node.geo.lon));
    const east = new THREE.Vector3().crossVectors(up, dir);
    if (east.lengthSq() < 1e-6) east.set(1, 0, 0);
    east.normalize();
    for (const [site, side] of [['travelmemo', -1], ['reisememo', 1]] as const) {
      const n = row[site];
      if (!n) continue;
      const height = 1.2 + 3.4 * Math.log10(n);
      const geo = new THREE.CylinderGeometry(0.26, 0.26, height, 12);
      geo.translate(0, height / 2, 0); // base on the skin
      const bar = new THREE.Mesh(geo, barMats[site]);
      bar.position.copy(dir).multiplyScalar(DOME_R).addScaledVector(east, 0.34 * side);
      bar.quaternion.setFromUnitVectors(up, dir);
      bar.userData.key = node.key;
      bars.push(bar);
      barInfo.push({ site, dir, on: true });
      group.add(bar);
    }
  }
  group.add(land, points, ...bars);

  let miniGroup: THREE.Group | null = null;
  let miniLand: THREE.Points | null = null;

  return {
    group,
    points,
    posts,
    bars,
    at: (key) => where.get(key) ?? null,
    countryOf: (key) => country.get(key) ?? null,
    paint: (style) => {
      posts.forEach((p, i) => {
        const s = style(p);
        visible[i] = s ? 1 : 0;
        const [r, g, b, a] = s?.rgba ?? [0, 0, 0, 0];
        colors.setXYZW(i, r, g, b, s ? a : 0);
        sizes.setX(i, ARTICLE_SIZE * (s?.size ?? 1));
      });
      colors.needsUpdate = true;
      sizes.needsUpdate = true;
    },
    isVisible: (index) => visible[index] === 1,
    setAtlas: (atlas) => {
      const next = buildLandDots(atlas);
      land.geometry = next;
      if (miniLand) miniLand.geometry = next;
      landGeometry.dispose();
      landGeometry = next;
      place(atlas);
    },
    setMode: (mode) => {
      barInfo.forEach((b) => (b.on = mode === 'both' || mode === b.site));
    },
    update: (camera) => {
      const d = camera.position.length();
      const near = Math.abs(d - DOME_R);
      const far = d + DOME_R;
      const from = near + (far - near) / 6;
      fadeRange.uFadeFrom.value = from;
      fadeRange.uFadeFar.value = far;
      const inside = d < DOME_R;
      bars.forEach((bar, i) => {
        const b = barInfo[i];
        bar.visible = b.on && !inside && b.dir.dot(camera.position) > 0;
      });
      return { from, far, band: (far - near) * 0.04, detail: 1 - THREE.MathUtils.smoothstep(d, DOME_R * 0.8, DOME_R * 1.4) };
    },
    mini: () => {
      if (miniGroup) return miniGroup;
      miniLand = track(new THREE.Points(landGeometry, landMat));
      miniLand.renderOrder = -2;
      const dots = track(new THREE.Points(geometry, articleMat));
      dots.renderOrder = -1;
      miniGroup = new THREE.Group();
      miniGroup.add(miniLand, dots);
      return miniGroup;
    },
  };
}
