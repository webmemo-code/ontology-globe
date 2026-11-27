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
import { LAND_LEVELS, LOD_GLSL, LOD_SPACING_PX, latticeSpacing } from './dotLod';

const RANK: Record<Perf, number> = { top10: 0, top25: 1, active: 2, seen: 3, none: 4 };
const ARTICLE_SIZE = 0.55;
// Land is the map, articles are the data (#66): the land lattice is cooler,
// fainter and a little smaller than Reisememo's grey article dots, so the two
// no longer blend. Shape and article colours stay as they were.
const LAND_SIZE = 0.42;
const LAND_DOTS = 26000;
const LAND_R = DOME_R * 0.985;
const LAND_COLOR = new THREE.Color('#5c646e');
const LAND_ALPHA = 0.6;
// Largest on-screen diameter (CSS px) of a dot at its base size (#67, L1):
// close up, dots stay sharp discs instead of growing into blurs.
const ARTICLE_MAX_PX = 10;
const LAND_MAX_PX = 5;
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

const VERTEX = /* glsl */ `
uniform float uViewH;
uniform float uDpr;
uniform float uMinPx;
uniform float uR;
uniform float uMaxPx;
uniform float uRefSize;
uniform float uSpacing;
uniform float uLodT;
uniform float uLodOn;
uniform float uFirst;
uniform float uLast;
attribute vec4 color;
attribute float size;
varying vec4 vColor;
varying float vFacing;
varying float vFadeDepth;
varying float vFadeOn;
varying float vSize;
varying float vLod;
${LOD_GLSL}
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
  float k = s * projectionMatrix[ 1 ][ 1 ] * uViewH * 0.5 / max( -mv.z, 0.01 ); // px per world unit here
  float lo = uMinPx * uDpr;
  // L1: capped in proportion to the dot's own size, so larger dots stay larger.
  gl_PointSize = clamp( size * k, lo, max( lo, uMaxPx * uDpr * size / uRefSize ) );
  vSize = gl_PointSize;
  // L2: land levels crossfade by their lattice spacing on screen (dotLod.ts).
  // Outside the big globe only; inside and on the mini globe the base level stays.
  vLod = uLodOn * vFadeOn > 0.5 ? lodWeight( uSpacing * k, uLodT * uDpr ) : ( uFirst > 0.5 ? 1.0 : 0.0 );
  if ( vLod < 0.004 ) { gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 ); gl_PointSize = 0.0; }
  vColor = color;
}`;

const FRAGMENT = `
uniform float uFadeFrom;
uniform float uFadeFar;
varying vec4 vColor;
varying float vFacing;
varying float vFadeDepth;
varying float vFadeOn;
varying float vSize;
varying float vLod;
void main() {
  float d = length( gl_PointCoord - 0.5 ) * 2.0;
  if ( d > 1.0 ) discard;
  // A soft rim of about 1 px whatever the size (L1); small dots keep their round falloff.
  float edge = 1.0 - smoothstep( max( 0.55, 1.0 - 2.0 / max( vSize, 1.0 ) ), 1.0, d );
  float k = smoothstep( uFadeFrom, uFadeFar, vFadeDepth ) * vFadeOn;
  vec4 c = vColor;
  c.rgb *= 1.0 - 0.7 * k;
  c.a *= ( 1.0 - 0.4 * k ) * edge * smoothstep( -0.02, 0.06, vFacing ) * vLod;
  if ( c.a < 0.002 ) discard;
  gl_FragColor = c;
  #include <colorspace_fragment>
}`;

/** Shared per frame by every land level: L2 runs only with the camera outside the globe. */
const lodOn = { value: 1 };

interface DotOpts {
  minPx: number;
  /** Cap for a dot of `refSize`; bigger dots get a proportionally bigger cap. */
  maxPx: number;
  refSize: number;
  /** Land level: its lattice spacing (world units) and place in the chain. Omitted for articles. */
  lod?: { spacing: number; first: boolean; last: boolean };
}

function dotMaterial(o: DotOpts): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uViewH: { value: 800 },
      uDpr: { value: 1 },
      uMinPx: { value: o.minPx },
      uMaxPx: { value: o.maxPx },
      uRefSize: { value: o.refSize },
      uSpacing: { value: o.lod?.spacing ?? 1 },
      uLodT: { value: LOD_SPACING_PX },
      uLodOn: o.lod ? lodOn : { value: 0 },
      uFirst: { value: !o.lod || o.lod.first ? 1 : 0 },
      uLast: { value: !o.lod || o.lod.last ? 1 : 0 },
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
  const articleMat = dotMaterial({ minPx: 2.5, maxPx: ARTICLE_MAX_PX, refSize: ARTICLE_SIZE });
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
  // Level k has 4^k times the base dots at half the size per level, so every
  // level looks alike at the zoom where it is in charge (#67, L2).
  const levels = Array.from({ length: LAND_LEVELS }, (_, k) => {
    const count = LAND_DOTS * 4 ** k;
    const size = LAND_SIZE / 2 ** k;
    const mat = dotMaterial({
      minPx: 1.5,
      maxPx: LAND_MAX_PX, // the same cap at every level: finer levels add dots, not smaller ones
      refSize: size,
      lod: { spacing: latticeSpacing(count, LAND_R), first: k === 0, last: k === LAND_LEVELS - 1 },
    });
    const pts = track(new THREE.Points(dotGeometry(0), mat));
    pts.renderOrder = -2;
    return { count, size, pts };
  });
  const land = levels[0].pts;
  const landMat = land.material;
  let landGeometry = land.geometry;

  /** The land raster every level samples, made once per atlas. */
  type Raster = { data: Uint8ClampedArray; w: number; h: number };
  const rasterOf = (atlas: Atlas): Raster => {
    const canvas = rasteriseLand(atlas.features);
    const { width: w, height: h } = canvas;
    return { data: canvas.getContext('2d')!.getImageData(0, 0, w, h).data, w, h };
  };
  const buildLandDots = ({ data, w, h }: Raster, count: number, size: number): THREE.BufferGeometry => {
    const pts: number[] = [];
    for (let i = 0; i < count; i++) {
      // Fibonacci lattice: even coverage of the whole sphere.
      const lat = (Math.asin(1 - (2 * (i + 0.5)) / count) * 180) / Math.PI;
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
      c.setXYZW(i, LAND_COLOR.r, LAND_COLOR.g, LAND_COLOR.b, LAND_ALPHA);
      s.setX(i, size);
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
  group.add(...levels.map((l) => l.pts), points, ...bars);

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
      const raster = rasterOf(atlas);
      const next = buildLandDots(raster, levels[0].count, levels[0].size);
      land.geometry = next;
      if (miniLand) miniLand.geometry = next;
      landGeometry.dispose();
      landGeometry = next;
      // The finer levels: built after the base level is on screen, one per idle slot.
      levels.slice(1).forEach((l, i) =>
        setTimeout(() => {
          const g = buildLandDots(raster, l.count, l.size);
          l.pts.geometry.dispose();
          l.pts.geometry = g;
        }, 200 * (i + 1)),
      );
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
      lodOn.value = inside ? 0 : 1;
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
