// Imperative three.js scene behind both views:
//   system - entities packed into the ontology cube under the publishing stack
//   graph  - the article dome, seen from the inside, with places on inner shells
// React owns the UI; this class owns WebGL and reports hover/select back.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { withDetailFade } from './detailFade';
import { createBloomComposer, type BloomComposerResult } from './bloomComposer';
import { Labels } from './label';
import { LiveLayer, hash } from './live';
import { frameBeamInside, frameInward, framePair, framePlace, framePost, frameInterior, frameTopic, kf, outranks, pathAt, pathPolicy, type CameraKeyframe, type CameraOwner, type FlightResult, type PathPolicy } from './camera';
import type { LiveBySite } from '../data/live';
import { CUBE_Y, GHOST_SHELL, MINI, buildSystem, miniGlobePositions } from './system';
import { buildArticleLayer, type ArticleLayer } from './articles';
import type { AtlasIndex } from './dome';
import { haloTexture, makeEmblem, makePortrait } from './portrait';
import { DOME_R, domeDirection, domeLayout, orgsOverHeadquarters, postKey, topicsOverHotspots, type Headquarters } from '../data/globe';
import { WHEEL_MAX, WHEEL_R, WHEEL_R0, articleRadius, topicWheelLayout, wheelPoint } from '../data/topicWheel';
import { footprints, liftByCountry, type Footprint } from '../data/footprint';
import type { Atlas } from '../data/atlas';
import { CLASS_COLORS, GHOST_COLOR, ancestorOfType, entityColor, cooccurring, descendants, labelFor, placeTree, postsFor, slugTitle, statsFor, type PlaceTree, type Vec3 } from '../data/model';
import type { Graph, GraphNode, GraphPost, Perf, SiteMode, SiteStats } from '../data/types';
import type { Geometry } from 'geojson';
import { geoCentroid, geoContains } from 'd3-geo';

const GHOST_R = DOME_R * GHOST_SHELL;
const MAX_STEP = Math.cos((12 * Math.PI) / 180);
/** How it works turns once per 60 / this seconds (OrbitControls: 2π/60 rad per unit per second). */
const SYSTEM_SPIN = 0.4; // one turn per 150 s
const GRAPH_SPIN = 0.3;
const SPIN_IDLE_MS = 4000;
/** Live follow: between arrivals the camera circles the followed pair this fast (rad/s, ~1.1 deg/s). */
const DRIFT_SPEED = 0.02;
/** Tour drift at a stop: at most this far (rad, 8 deg), easing out over TOUR_DRIFT_S, so a long read ends in a settle. */
const TOUR_DRIFT = (8 * Math.PI) / 180;
const TOUR_DRIFT_S = 8;
const UP = new THREE.Vector3(0, 1, 0);

/** True borders on the same rotated globe, as line segments just inside the skin. */
function borderSegments(geometry: Geometry, out: number[]) {
  // A coastline mesh is a MultiLineString: treat each line as one ring.
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : geometry.type === 'MultiLineString' ? [geometry.coordinates] : [];
  for (const poly of polys) {
    for (const ring of poly) {
      let prev: [number, number, number] | null = null;
      for (const [lon, lat] of ring) {
        const d = domeDirection(lat, lon);
        // Guard against ring jumps (antimeridian-split polygons) drawing chords across the globe.
        if (prev && prev[0] * d[0] + prev[1] * d[1] + prev[2] * d[2] > MAX_STEP) {
          out.push(prev[0] * GHOST_R, prev[1] * GHOST_R, prev[2] * GHOST_R, d[0] * GHOST_R, d[1] * GHOST_R, d[2] * GHOST_R);
        }
        prev = d;
      }
    }
  }
}

export type View = 'system' | 'graph';

export type { CameraKeyframe } from './camera';
export const HOMES: Record<View, CameraKeyframe> = {
  system: kf([52, 62, 92], [-10, 12, 0]),
  // Outside, facing Switzerland: the view that reads like the globe we know.
  graph: kf([28, 30, -142], [0, 2, 0]),
};

const GLOW: Record<Perf, number> = { top10: 1.25, top25: 0.75, active: 0.45, seen: 0.22, none: 0.1 };
// Article dots: brightness and size rank by perf tier.
const DOT_LIGHT: Record<Perf, number> = { top10: 1.25, top25: 1.0, active: 0.8, seen: 0.6, none: 0.45 };
const DOT_SIZE: Record<Perf, number> = { top10: 1.5, top25: 1.25, active: 1.0, seen: 0.85, none: 0.7 };
const SITE_TINT = { travelmemo: new THREE.Color('#FF9000'), reisememo: new THREE.Color('#989898') };
const GOLD = new THREE.Color('#FFF1DC');
const GHOST = new THREE.Color(GHOST_COLOR);
const TRIP = new THREE.Color(CLASS_COLORS.trips);
const FACE_TINT = { person: new THREE.Color('#b8b8b8'), emblem: new THREE.Color('#c8c8c8') };

// Spotlight (#27): colour means focus. Entities are ghosts until the screen centre
// passes over them; angles from the view axis, full inside IN and gone by OUT.
const SPOT = { desk: [12, 24], phone: [9, 18] };
const SPOT_EASE = 0.1; // seconds; ~300 ms to settle
const LABEL_EVERY = 0.25; // seconds between label re-evaluations
const LABEL_SPOT = 0.35;
const GHOST_FILL = 0.1;
const GHOST_LINE = 0.28;
const GHOST_FACE = 0.18;
const GHOST_ROUGH = 0.9;
const LIT_ROUGH = 0.3;

/** Per-key stable pseudo-random in [0, 1) for a step number. */
function stepRand(step: number, seed: number): number {
  let h = Math.imul(step ^ Math.floor(seed * 4294967295), 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** Live-visit flicker: irregular on/off steps at 6-10 Hz with a soft decay, never a sine. */
function flicker(t: number, seed: number): number {
  const x = t * (6 + 4 * seed) + seed * 1000;
  const step = Math.floor(x);
  if (stepRand(step, seed) > 0.45) return 1;
  return stepRand(step - 1, seed) > 0.45 ? (1 - (x - step)) ** 2 : 0;
}

/** The colour depthFade scales from; written here, so the spotlight and the depth cue share one source. */
function setBase(m: THREE.Material & { color: THREE.Color }, c: THREE.Color) {
  ((m.userData.base ??= new THREE.Color()) as THREE.Color).copy(c);
}

interface Box {
  mesh: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>;
  outline: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
  halo: THREE.Sprite;
  face?: THREE.Sprite;
  base: Vec3;
  /** Diameter: articles carrying the entity. */
  size: number;
  /** Height: AI fetches of the entity when the snapshot has them, else the diameter. */
  height: number;
  detail: { value: number };
  /** How far the cylinder is raised so its base sits on the plane (topics on the wheel). */
  lift: number;
  /** Face saturation: 0 = grey ghost, 1 = full colour (set by paint). */
  sat: { value: number };
  /** What styleBox wants when fully lit; the spotlight blends from the ghost look towards it. */
  lit: {
    color: THREE.Color;
    emissive: number;
    fill: number;
    line: number;
    face: number;
    faceTint: THREE.Color;
    ghostFill: number;
    ghostLine: number;
    ghostFace: number;
    haloOn: boolean;
    haloOp: number;
  };
  /** Eased spotlight 0..1, the visit flicker, and the value last painted (-1 = repaint). */
  spot: number;
  flick: number;
  drawn: number;
  /** 1 = selection, neighbour or search hit (always lit); -1 = dimmed by them; 0 = free. */
  hold: number;
  labelled: boolean;
  labelPriority: number;
}

interface NodeView extends Box {
  key: string;
  node: GraphNode;
  pickable: boolean;
}

export interface SceneCallbacks {
  onHover: (key: string | null, x: number, y: number) => void;
  onSelect: (key: string | null) => void;
}

export class GraphScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  // Drawn after the bloom pass so text stays crisp instead of glowing.
  private labelScene = new THREE.Scene();
  private labels = new Labels();
  private live = new LiveLayer(this.labels);
  private liveData: LiveBySite | null = null;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private bloom: BloomComposerResult;
  private views = new Map<string, NodeView>();
  private layouts: Record<'graph' | 'system', Map<string, Vec3>>;
  private articles: ArticleLayer;
  private postsByKey = new Map<string, GraphPost>();
  /** Whether the snapshot carries AI fetch weights; without them cylinders keep height = width. */
  private hasAi = false;
  /** AI fetch weight stretched over its class's own range, 0..1 (see applyStyle). */
  private aiSpan = new Map<string, number>();
  /** Entities an agent fetched in the live feed -> tier colour; their outline lights up. */
  private liveEntities = new Map<string, string>();
  /** Entities currently visited (bot entity hits, entities of articles read or fetched): they flicker. */
  private visited = new Set<string>();
  private lastT = 0;
  private lastLabels = 0;
  private narrow = false;
  private labelOn = new Set<string>();
  private linkLines!: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private tubes: { mesh: THREE.Mesh<THREE.TubeGeometry, THREE.MeshBasicMaterial>; key: string }[] = [];
  private fwd = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private tmpColor = new THREE.Color();
  private tmpColor2 = new THREE.Color();
  private tree: PlaceTree;
  private nodes: Map<string, GraphNode>;
  private atlas: Atlas | null = null;
  private ghost = new THREE.Group();
  private ghostFocus = new THREE.Group();
  private globeDetail = { value: 0 };
  private photos: { tex: THREE.Texture; index: AtlasIndex } | null = null;
  // A blurred photo of the selection's best article, fading in over the sky.
  private photoSky!: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  /** Background sphere, photo sky and stars; follows the camera (buildBackdrop). */
  private sky = new THREE.Group();
  private photoSkyKey: string | null = null;
  private photoSkyTarget = 0;
  private links = new THREE.Group();
  private wheel = new THREE.Group();
  private focusLinks = new THREE.Group();
  private hotLines = new THREE.Group();
  private hotMats: LineMaterial[] = [];
  /** Footprints per site mode, computed on first use. */
  private fps = new Map<SiteMode, Map<string, Footprint>>();
  private system: ReturnType<typeof buildSystem>;
  private view: View = 'graph';
  private morph: { from: Map<string, Vec3>; t0: number; ms: number } | null = null;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private mode: SiteMode = 'both';
  private selected: string | null = null;
  private filter: Set<string> | null = null;
  private filterTop: string | null = null;
  private hovered: string | null = null;
  private flight: { from: CameraKeyframe; to: CameraKeyframe; t0: number; ms: number; owner: CameraOwner; path: PathPolicy; done: (r: FlightResult) => void } | null = null;
  // Home cameras fitted to the HUD's free rectangle; HOMES stays the unfitted reference.
  private homes: Record<View, CameraKeyframe> = { system: HOMES.system, graph: HOMES.graph };
  private insets = { top: 0, right: 0, bottom: 0, left: 0 };
  // True until the user orbits away from home; only then may a reframe move the camera.
  private atHome = true;
  private frame = 0;
  private clock = new THREE.Clock();
  private downAt = { x: 0, y: 0 };
  // The How it works stack turns by the camera's own auto-rotate (so labels and
  // picking stay attached): paused while pressed, hovering or selected, and for
  // SPIN_IDLE_MS after the last touch; never under reduced motion. `matches` is
  // live, so a change of the preference applies at once.
  private pressed = false;
  /**
   * Slow motion while nothing flies: 'pair' circles a followed live pair;
   * 'tour' turns a little about the vertical through a tour stop's target,
   * toward the next stop. Any flight, selection or touch ends it.
   */
  private drift: { kind: 'pair' } | { kind: 'tour'; sign: number; t0: number; applied: number } | null = null;
  /** The guided tour owns the camera: no system spin, no live follow. */
  private touring = false;
  private touchedAt = 0;
  private lastTick = 0;
  private reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  private graph: Graph;
  private container: HTMLElement;
  private cb: SceneCallbacks;

  constructor(container: HTMLElement, graph: Graph, cb: SceneCallbacks) {
    this.container = container;
    this.graph = graph;
    this.cb = cb;
    const { clientWidth: w, clientHeight: h } = container;
    this.narrow = w < 768 || h <= 520;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 2000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.setCamera(HOMES.graph);
    this.controls.enableDamping = true;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = GRAPH_SPIN;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 260;
    this.controls.addEventListener('start', () => {
      // The user takes the camera: any flight in progress ends here, settled as cancelled.
      this.cancelFlight();
      this.drift = null;
      this.controls.autoRotate = false;
      this.atHome = false;
      this.touchedAt = performance.now();
    });
    this.controls.addEventListener('end', () => (this.touchedAt = performance.now())); // wheel zoom has no pointer events

    this.scene.background = new THREE.Color('#101010');
    this.scene.fog = new THREE.FogExp2('#101010', 0.003);
    this.scene.add(new THREE.AmbientLight('#ffffff', 0.6));
    const sun = new THREE.DirectionalLight('#ffffff', 1.0);
    sun.position.set(40, 80, 30);
    this.scene.add(sun);
    // A second light below the horizon: seen from slightly above, the cylinder walls
    // catch its reflection too, not only when looking up from underneath.
    const under = new THREE.DirectionalLight('#ffffff', 1.3);
    under.position.set(-40, -14, -28); // ~16 deg below: mirrors a camera ~16 deg above
    this.scene.add(under);

    this.bloom = createBloomComposer(this.renderer, this.scene, this.camera, { strength: 1.3, radius: 0.65, threshold: 0.62 });
    this.bloom.updateSize(w, h);

    this.tree = placeTree(graph);
    this.nodes = new Map(graph.nodes.map((n) => [n.key, n]));
    // Places keep their true geographic directions; articles are dots at the place they are about.
    const geo = domeLayout(graph);
    this.articles = buildArticleLayer(graph, geo, this.nodes, this.tree);
    // Topics and companies hang over where they are over-represented, judged
    // on both blogs; companies with a known headquarters move there once it loads.
    const globe = topicsOverHotspots(graph, geo, this.footprintsFor('both'), ['organizations']);
    // Topics have no latitude: they sit on the wheel in the middle instead.
    const wheel = topicWheelLayout(graph);
    wheel.pos.forEach((p, k) => globe.set(k, p));
    this.layouts = {
      graph: globe,
      system: miniGlobePositions(globe),
    };
    graph.posts.forEach((p) => this.postsByKey.set(postKey(p), p));

    this.buildBackdrop();
    this.buildNodes();
    this.buildLinks();
    this.buildWheel(wheel.sectors);
    this.system =buildSystem(graph, graph.system ?? null, DOME_R);
    // The mini globe wears the globe view's article shell, at the same scale and turn.
    const shell = this.articles.mini();
    shell.scale.setScalar(MINI);
    shell.rotation.y = Math.PI;
    shell.position.y = CUBE_Y;
    this.system.group.add(shell);
    this.system.labels.forEach((l, i) => this.labels.set(`sys-label:${i}`, l.text, l.pos, l.priority, { px: l.px, color: l.color, views: ['system'], always: true }));
    this.articles.group.add(this.ghost, this.ghostFocus, rimGlow(DOME_R, '#FF9000'));
    this.scene.add(this.articles.group, this.links, this.wheel, this.focusLinks, this.hotLines, this.system.group, this.live.group);
    this.labelScene.add(this.labels.group);
    this.showViewDecor();
    this.applyStyle();
    void this.loadImages();
    void this.loadHeadquarters();

    const el = this.renderer.domElement;
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerRelease);
    el.addEventListener('pointerleave', this.onPointerLeave);
    window.addEventListener('resize', this.onResize);
    this.loop();
  }

  // ---------- construction ----------

  /**
   * The sky (#40): background sphere, photo sky and stars, centred on the eye
   * every frame (loop), so they stay 520-600 from the camera however far the
   * HUD refit pulls it back, and no star can sit between the camera and the globe.
   */
  private buildBackdrop() {
    this.sky.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(600, 48, 48),
        new THREE.MeshBasicMaterial({ side: THREE.BackSide, color: '#101010', fog: false }),
      ),
    );
    this.photoSky = new THREE.Mesh(
      new THREE.SphereGeometry(590, 48, 48),
      new THREE.MeshBasicMaterial({ side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, fog: false, color: '#6f7a8c' }),
    );
    this.photoSky.renderOrder = -2;
    this.sky.add(this.photoSky);
    // Stars: a thin shell just inside the photo sky, fixed pixel size. They draw
    // first in the transparent pass (-3, before the land and the photo sky at -2
    // and the article dots at -1) and write no depth, so every globe layer
    // blends over them.
    const stars = new Float32Array(1500 * 3);
    for (let i = 0; i < stars.length; i += 3) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(520 + Math.random() * 60);
      stars.set([v.x, v.y, v.z], i);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(stars, 3));
    const points = new THREE.Points(g, new THREE.PointsMaterial({ color: '#cfcfcf', size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.5, depthWrite: false, fog: false }));
    points.renderOrder = -3;
    this.sky.add(points);
    this.scene.add(this.sky);
  }

  private makeBox(node: GraphNode, box: THREE.CylinderGeometry, edges: THREE.EdgesGeometry, halo: THREE.Texture, base: Vec3): Box {
    const color = GHOST.clone(); // every entity starts as a ghost; applyStyle and the spotlight colour it
    const mesh = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color, emissive: color, transparent: true, depthWrite: false, metalness: 0.1, roughness: GHOST_ROUGH }));
    mesh.userData.key = node.key;
    const outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color, transparent: true }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const face = node.class === 'people' ? makePortrait(node.id, CLASS_COLORS.people) : undefined;
    const detail = { value: 1 };
    withDetailFade(mesh.material, detail, 0.045);
    withDetailFade(outline.material, detail, 0.08);
    withDetailFade(glow.material, detail, 0.01, 0.15);
    const sat = { value: 0 };
    if (face) withDetailFade(face.material, detail, 0.08, 0.45, sat);
    this.scene.add(mesh, outline, glow, ...(face ? [face] : []));
    const lit = { color: new THREE.Color(), emissive: 0, fill: 0, line: 0, face: 0, faceTint: new THREE.Color(), ghostFill: 0, ghostLine: 0, ghostFace: 0, haloOn: false, haloOp: 0 };
    return { mesh, outline, halo: glow, face, base: { ...base }, size: 1, height: 1, detail, sat, lift: 0, lit, spot: 0, flick: 0, drawn: -1, hold: 0, labelled: false, labelPriority: 0 };
  }

  private buildNodes() {
    // Entities are cylinders: width = articles, height = AI fetches (#394).
    const box = new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
    const edges = new THREE.EdgesGeometry(box, 30);
    this.hasAi = this.graph.nodes.some((n) => Object.values(n.sites).some((s) => s?.ai !== undefined));
    const halo = haloTexture();
    for (const node of this.graph.nodes) {
      const base = this.layouts.graph.get(node.key)!;
      const main = this.makeBox(node, box, edges, halo, base);
      this.views.set(node.key, { key: node.key, node, pickable: true, ...main });
      this.place(main);
    }
  }

  private place(b: Box) {
    b.mesh.position.set(b.base.x, b.base.y + b.lift, b.base.z);
    b.outline.position.copy(b.mesh.position);
    b.halo.position.copy(b.mesh.position);
    b.face?.position.copy(b.mesh.position);
  }

  private buildLinks() {
    const pos = this.layouts.graph;
    const segs: number[] = [];
    for (const e of this.graph.edges) {
      const a = pos.get(e.from);
      const b = pos.get(e.to);
      if (a && b && e.rel === 'parent') segs.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3));
    this.linkLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#989898', transparent: true, opacity: 0.25 }));
    this.linkLines.visible = false; // links only with intent: a selection or a filter
    this.links.add(this.linkLines);
    withDetailFade(this.linkLines.material, this.globeDetail, 0.06);

    // A trip is drawn as the route itself, stop by stop in itinerary order.
    for (const node of this.graph.nodes) {
      if (!node.route?.length) continue;
      const pts = [node.key, ...node.route].map((k) => pos.get(k)).filter(Boolean).map((p) => new THREE.Vector3(p!.x, p!.y, p!.z));
      if (pts.length < 2) continue;
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.16, 6, false),
        new THREE.MeshBasicMaterial({ color: GHOST_COLOR, transparent: true, opacity: 0.1 }), // lit per frame, with its trip
      );
      this.tubes.push({ mesh: tube, key: node.key });
      tube.material.depthWrite = false;
      withDetailFade(tube.material, this.globeDetail, 0.06);
      this.links.add(tube);
    }
  }

  /** The topic wheel's rings, spokes, ticks and family labels; built once. */
  private buildWheel(sectors: { name: string; from: number; to: number; mid: number }[]) {
    const R = WHEEL_R + 1;
    const circle = (r: number, n = 128) => {
      const s: number[] = [];
      for (let i = 0; i < n; i++) {
        const a = wheelPoint((2 * Math.PI * i) / n, r);
        const b = wheelPoint((2 * Math.PI * (i + 1)) / n, r);
        s.push(a.x, 0, a.z, b.x, 0, b.z);
      }
      return s;
    };
    const radial = (a: number, r0: number, r1: number) => {
      const p = wheelPoint(a, r0);
      const q = wheelPoint(a, r1);
      return [p.x, 0, p.z, q.x, 0, q.z];
    };
    const add = (segs: number[], opacity: number) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3));
      // Light grey and additive: just bright enough to catch a little bloom.
      const mat = new THREE.LineBasicMaterial({ color: '#d4d4d4', transparent: true, depthWrite: false, opacity, blending: THREE.AdditiveBlending });
      withDetailFade(mat, this.globeDetail, 0.05);
      this.wheel.add(new THREE.LineSegments(g, mat));
    };
    add(circle(R), 0.9);
    // The article scale as a flat disc of fading bands instead of rings: each step of
    // each decade (1-2, 2-3 ... 9-10) fades in towards its end, the decades more
    // strongly, and the whole disc brightens towards the rim (more articles). The bands
    // narrow towards every decade's end, like log paper. Decades are labelled.
    this.wheel.add(articleDisc(WHEEL_R0, articleRadius(WHEEL_MAX), WHEEL_MAX, this.globeDetail));
    for (let d = 1; d <= WHEEL_MAX; d *= 10)
      this.labels.set(`wheel-scale:${d}`, d === WHEEL_MAX ? `${d} articles` : `${d}`, { ...wheelPoint(0, articleRadius(d)), y: 0.3 }, 2400, { px: 10, color: '#9D9C9A', views: ['graph'] });
    add(sectors.flatMap((s) => radial(s.from - 0.03, WHEEL_R0, R)), 0.55);
    const ticks: number[] = [];
    for (let i = 0; i < 96; i++) ticks.push(...radial((2 * Math.PI * i) / 96, R, R + (i % 4 === 0 ? 1.1 : 0.5)));
    add(ticks, 0.75);
    for (const s of sectors) {
      this.labels.set(`wheel:${s.name}`, s.name.toUpperCase(), { ...wheelPoint(s.mid, WHEEL_R + 4), y: 0.6 }, 2500, { px: 12, color: '#BDBDBD', views: ['graph'] });
    }
  }

  // ---------- styling ----------

  setMode(mode: SiteMode) {
    this.mode = mode;
    this.articles.setMode(mode);
    this.applyStyle();
    this.refreshFocus();
    this.refreshLive();
  }

  /** Live readers and AI agents (null clears the layer). */
  setLive(data: LiveBySite | null) {
    this.liveData = data;
    this.refreshLive();
  }

  private refreshLive() {
    const data = this.liveData && this.mode !== 'both' ? { [this.mode]: this.liveData[this.mode] } : this.liveData;
    this.live.set(data, {
      atlas: this.atlas,
      tile: (site, id) => this.articles.at(`post:${site}:${id}`)?.clone() ?? null,
      // Where the article's photos were taken, else its country at its true
      // centroid; never its cartogram patch. A photo point counts only inside
      // the article's country (give or take ~50 km for coasts and islands):
      // some OKF photo lists carry another site's images (wrong GPS), and a
      // line to the wrong continent is worse than one to the country centre.
      destination: (site, id) => {
        const c = this.articles.countryOf(`post:${site}:${id}`);
        const feat = c ? this.atlas?.byNode.get(c) : undefined;
        if (!feat) return null;
        const geo = this.postsByKey.get(`post:${site}:${id}`)?.geo;
        const near = (lat: number, lon: number) =>
          [0, -0.5, 0.5].some((dy) => [0, -0.5, 0.5].some((dx) => geoContains(feat, [lon + dx, lat + dy])));
        const [lon, lat] = geo && near(geo.lat, geo.lon) ? [geo.lon, geo.lat] : geoCentroid(feat);
        return new THREE.Vector3(...domeDirection(lat, lon)).multiplyScalar(DOME_R * 1.015);
      },
      entity: (key) => this.layouts.graph.get(key) ?? null,
      name: ({ site, post, entity }) => {
        if (post) {
          const p = this.postsByKey.get(`post:${site}:${post}`);
          return p ? this.titleOf(p) : null;
        }
        const n = entity ? this.nodes.get(entity) : undefined;
        return n ? labelFor(n, site) : null;
      },
    });
    this.liveEntities = new Map(this.live.entityHits);
    for (const k of this.visited) {
      const v = this.views.get(k);
      if (v) v.flick = 0;
    }
    this.visited = new Set(this.liveEntities.keys());
    const addPost = (site: string, id: number | null | undefined) => {
      for (const e of (id ? this.postsByKey.get(`post:${site}:${id}`)?.entities : undefined) ?? []) this.visited.add(e);
    };
    for (const [site, snap] of Object.entries(data ?? {})) {
      for (const r of snap?.readers ?? []) addPost(site, r.post);
      for (const b of snap?.bots ?? []) if (b.kind === 'post') addPost(site, b.post);
    }
    if (this.views.size) this.applyStyle();
  }

  /** How an article is named on the globe; the app swaps in real titles once they load. */
  titleOf: (post: GraphPost) => string = (p) => slugTitle(p.url);

  /** Re-label the live layer, e.g. after real titles loaded. */
  refreshLiveNames() {
    this.refreshLive();
  }

  /** Search: dim all but `keys`; `top` (what Enter would pick) also lights its articles. */
  setFilter(keys: Set<string> | null, top: string | null = null) {
    this.filter = keys;
    this.filterTop = top;
    this.applyStyle();
  }

  /** Flags, logos and the article photo atlas arrive after first paint; the scene works without them. */
  /** Companies move over their headquarters; one without stays on its footprint. */
  private async loadHeadquarters() {
    try {
      const hq: Record<string, Headquarters> = await fetch('identity/hq.json').then((r) => r.json());
      this.layouts.graph = orgsOverHeadquarters(this.graph, this.layouts.graph, hq);
      if (this.view !== 'graph' || this.morph) return;
      const from = new Map([...this.views.values()].map((v) => [v.key, { ...v.base }]));
      this.morph = { from, t0: performance.now(), ms: 1200 };
    } catch {
      // no headquarters file: companies keep their footprint position
    }
  }

  private async loadImages() {
    try {
      const credits: Record<string, { image: string; kind?: 'flag' | 'logo' | 'arms' }> = await fetch('identity/credits.json').then((r) => r.json());
      for (const v of this.views.values()) {
        const c = credits[v.key];
        if (!c || v.face) continue;
        const kind = c.kind ?? (v.node.type === 'Country' ? 'flag' : 'logo');
        v.face = makeEmblem(c.image, kind, entityColor(v.node));
        withDetailFade(v.face.material, v.detail, v.node.type === 'Country' ? 0.09 : 0.035, 0.45, v.sat);
        v.drawn = -1; // a new emblem was never painted: force its ghost look on the next frame
        v.face.position.copy(v.mesh.position);
        this.scene.add(v.face);
      }
      this.applyStyle();
    } catch (e) {
      console.warn('identity images:', e);
    }
    try {
      const index: AtlasIndex = await fetch('atlas/articles.json').then((r) => r.json());
      const tex = await new THREE.TextureLoader().loadAsync('atlas/articles.jpg');
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      this.photos = { tex, index };
      this.applyStyle();
    } catch (e) {
      console.warn('photo atlas:', e);
    }
  }

  /** Fade the best lit article's photo, blurred, into the sky behind the globe. */
  private updatePhotoSky(lit: Set<string> | null) {
    const rank = { top10: 0, top25: 1, active: 2, seen: 3, none: 4 };
    const best = this.view === 'graph' && lit && this.photos
      ? [...lit]
          .map((k) => this.postsByKey.get(k)!)
          .filter((p) => p && this.photos!.index.index[postKey(p)])
          .sort((a, b) => rank[a.perf] - rank[b.perf] || b.id - a.id)[0]
      : undefined;
    // A hint of the place's mood, not a wallpaper: bright snow photos would wash the scene out.
    this.photoSkyTarget = best ? 0.14 : 0;
    if (!best || postKey(best) === this.photoSkyKey) return;
    this.photoSkyKey = postKey(best);
    const { index, tex } = this.photos!;
    const cell = index.index[this.photoSkyKey];
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.filter = 'blur(14px) saturate(1.2)';
    const sx = (cell % index.cols) * index.cell;
    const sy = Math.floor(cell / index.cols) * index.cell;
    ctx.drawImage(tex.image as CanvasImageSource, sx + 2, sy + 2, index.cell - 4, index.cell - 4, -40, -40, 592, 336);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    // Mirrored twice round the sphere: a single wrap leaves a hard seam where the photo's edges meet.
    map.wrapS = THREE.MirroredRepeatWrapping;
    map.repeat.x = 2;
    this.photoSky.material.map?.dispose();
    this.photoSky.material.map = map;
    this.photoSky.material.needsUpdate = true;
    // Turn the photo towards where the viewer is looking.
    const dir = new THREE.Vector3().subVectors(this.controls.target, this.camera.position);
    this.photoSky.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI / 2;
  }

  /** Show the true borders as a ghost under the cartogram. */
  setAtlas(atlas: Atlas) {
    this.atlas = atlas;
    this.ghost.clear();
    this.articles.setAtlas(atlas);
    // No border or coast lines: the dotted land draws the map; only a selection is outlined.
    this.system.setLand(atlas.features);
    this.refreshGhostFocus();
    this.refreshLive(); // readers are placed by country, which needs the atlas
  }

  /** The selection's country, traced in gold along its true border. */
  private refreshGhostFocus() {
    this.ghostFocus.clear();
    if (!this.atlas || !this.selected) return;
    const post = this.postsByKey.get(this.selected);
    const keys = post ? post.entities : [this.selected];
    const countries = new Set(keys.map((k) => ancestorOfType(this.tree, this.nodes, k, 'Country')).filter(Boolean) as string[]);
    const segs: number[] = [];
    for (const c of countries) {
      const f = this.atlas.byNode.get(c);
      if (f) borderSegments(f.geometry, segs);
    }
    if (!segs.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3));
    this.ghostFocus.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#FF9000', transparent: true, opacity: 0.95, depthWrite: false })));
  }

  /** The top search hit lights its articles, so it shows where it lives; all hits would flood the globe. */
  private filterPosts(): Set<string> | null {
    if (!this.filter || !this.filterTop) return null;
    const under = descendants(this.tree, this.filterTop);
    return new Set(postsFor(this.graph, this.mode).filter((p) => p.entities.some((e) => under.has(e))).map(postKey));
  }

  private footprintsFor(mode: SiteMode): Map<string, Footprint> {
    let fp = this.fps.get(mode);
    if (!fp) this.fps.set(mode, (fp = footprints(this.graph, postsFor(this.graph, mode))));
    return fp;
  }

  /** The selected topic's or company's footprint, for the lens; null for anything else. */
  private selectedFootprint(): Footprint | null {
    const n = this.selected ? this.nodes.get(this.selected) : undefined;
    if (!n || (n.class !== 'topics' && n.class !== 'organizations')) return null;
    return this.footprintsFor(this.mode).get(n.key) ?? null;
  }

  /** Entities and articles to keep lit for the current selection. */
  private highlight(sel = this.selected): { entities: Set<string>; posts: Set<string> } | null {
    if (!sel) return null;
    const post = this.postsByKey.get(sel);
    if (post) return { entities: new Set(post.entities), posts: new Set([sel]) };
    if (!this.views.has(sel)) return null;
    const entities = new Set([sel]);
    for (const e of this.graph.edges) {
      if (e.from === sel) entities.add(e.to);
      if (e.to === sel) entities.add(e.from);
    }
    const scoped = postsFor(this.graph, this.mode);
    for (const [k] of cooccurring(scoped, sel, 12)) entities.add(k);
    // A place owns the articles of everything inside it: Italy lights Tuscany's too.
    const under = descendants(this.tree, sel);
    return { entities, posts: new Set(scoped.filter((p) => p.entities.some((e) => under.has(e))).map(postKey)) };
  }

  private styleBox(b: Box, node: GraphNode, s: SiteStats | null, dim: boolean, maxSize: number) {
    const present = !!s;
    const orphan = !s || s.status === 'orphan';
    // Topics crowd the small wheel in the middle: a slimmer scale so they barely overlap.
    const topic = node.class === 'topics' && this.view === 'graph';
    b.size = !present ? 0.5 : topic ? Math.min(0.5 + 0.17 * Math.sqrt(s!.posts), 2) : Math.min(0.7 + 0.32 * Math.sqrt(s!.posts), maxSize);
    // Height is the AI fetch weight alone (log scale 0..1, never a count), on
    // its own scale (0.4..5 units), so a big
    // topic is not tall just for being big; no fetches = a flat disc.
    const ai = s?.ai ?? 0;
    // The weights bunch (all topics sit between 0.63 and 1), so a 0..1 map read as one
    // height: stretch the class's own range over the full height, linearly, so similar
    // weights keep similar heights and the most fetched stand tallest.
    const k = this.aiSpan.get(node.key) ?? 0;
    b.height = !this.hasAi || !present ? b.size : ai > 0 ? 0.3 + 6.2 * k : 0.2;
    // On the wheel, cylinders stand on the grid like bars instead of floating around it.
    b.lift = topic ? b.height / 2 : 0;
    this.place(b);
    scaleBox(b, 1);
    const L = b.lit;
    L.color.set(entityColor(node));
    // Authors sit on every article, so their tier says little; keep them from outshining the map.
    L.emissive = orphan ? 0 : GLOW[s!.perf] * (node.class === 'people' ? 0.45 : node.class === 'topics' ? 0.4 : 1); // topics stand apart on the wheel now (#28), but full glow still blooms neighbours together
    // Orphans are outlines only: in the ontology, no article yet.
    L.fill = b.face || orphan ? 0 : dim ? 0.07 : 0.85;
    L.line = b.face ? 0 : !present ? 0.1 : dim ? 0.08 : orphan ? 0.45 : 0.9;
    // Ghosts: the same shapes, nearly gone; orphans fainter still.
    L.ghostFill = Math.min(L.fill, GHOST_FILL);
    L.ghostLine = Math.min(L.line, orphan ? 0.12 : GHOST_LINE);
    const tier = present && !orphan && !dim && !b.face ? s!.perf : 'none';
    L.haloOn = (tier === 'top10' || tier === 'top25') && this.view !== 'system' && node.class !== 'topics';
    L.haloOp = tier === 'top10' ? 0.6 : 0.3;
    b.halo.scale.setScalar(b.size * (tier === 'top10' ? 3.4 : 2.4));
    if (b.face) {
      const person = node.class === 'people';
      const f = this.view === 'system' ? 1.3 : person ? 3.4 : Math.max(2.2, b.size * (node.type === 'Country' ? 1.05 : node.class === 'places' ? 1.25 : 1.5));
      b.face.scale.set(f * (b.face.userData.aspect ?? 1), f, 1);
      // Emblems stay a little see-through; an orphan's flag or logo fades like its outline would.
      L.face = dim || !present ? 0.2 : orphan ? 0.4 : person ? 1 : 0.7;
      L.faceTint.copy(person ? FACE_TINT.person : FACE_TINT.emblem);
      L.ghostFace = Math.min(L.face, GHOST_FACE);
    }
    return present;
  }

  private applyStyle() {
    // AI fetch weight -> 0..1 between the lowest and highest weight in each class.
    this.aiSpan.clear();
    const byClass = new Map<string, { key: string; ai: number }[]>();
    for (const n of this.graph.nodes) {
      const ai = statsFor(n, this.mode)?.ai ?? 0;
      if (ai > 0) (byClass.get(n.class) ?? byClass.set(n.class, []).get(n.class)!).push({ key: n.key, ai });
    }
    for (const list of byClass.values()) {
      const lo = Math.min(...list.map((e) => e.ai));
      const hi = Math.max(...list.map((e) => e.ai));
      for (const e of list) this.aiSpan.set(e.key, hi > lo ? (e.ai - lo) / (hi - lo) : 1);
    }
    const hl = this.highlight();
    const maxSize = this.view === 'system' ? 1.1 : 3.6;
    const ranked = [...this.graph.nodes].sort((a, b) => (statsFor(b, this.mode)?.posts ?? 0) - (statsFor(a, this.mode)?.posts ?? 0));
    const rank = new Map(ranked.map((n, i) => [n.key, i]));
    // Label tiers (see label.ts): the main countries and the most local topics read from afar.
    const topCountries = new Set(ranked.filter((n) => n.type === 'Country').slice(0, 8).map((n) => n.key));
    const topTopics = new Set(
      [...this.footprintsFor('both')]
        .filter(([k]) => this.nodes.get(k)?.class === 'topics')
        .sort((a, b) => b[1].concentration - a[1].concentration)
        .slice(0, 5)
        .map(([k]) => k),
    );
    const tierOf = (n: GraphNode) =>
      n.class === 'people' || topCountries.has(n.key) || topTopics.has(n.key) || (n.class === 'places' && n.depth === 0)
        ? 0
        : n.type === 'Country' || n.class === 'topics' || n.class === 'organizations'
          ? 1
          : 2;

    for (const node of this.graph.nodes) {
      const v = this.views.get(node.key)!;
      const dim = !!((hl && !hl.entities.has(node.key)) || (this.filter && !this.filter.has(node.key)));
      const s = statsFor(node, this.mode);
      // In "How it works" the mini globe is one object among the floors: its
      // article shell says enough, and 200 boxes inside it made the scene too busy.
      const noBox = this.view === 'system';
      const present = this.styleBox(v, node, s, dim, maxSize);
      v.pickable = (present || !dim) && !noBox;
      // A face replaces the box; an invisible box would still write depth and hide it.
      // An agent's fetch lights the outline up in its colour, even around a flag or logo.
      const fetched = this.view === 'graph' ? this.liveEntities.get(node.key) : undefined;
      v.mesh.visible = !v.face && !noBox;
      v.outline.visible = (!v.face || !!fetched) && !noBox;
      if (v.face) v.face.visible = !noBox;
      // Selection, neighbours and search hits stay lit wherever they are; what they dim is a ghost.
      v.hold = hl?.entities.has(node.key) || this.filter?.has(node.key) ? 1 : dim ? -1 : 0;
      if (this.view !== 'graph') v.spot = 1; // How it works keeps its full look
      this.paint(v, Math.max(v.spot, v.flick));
      if (noBox) v.halo.visible = false;

      // Labels: every entity is a candidate; priority decides who survives the overlap cull.
      const orphan = !s || s.status === 'orphan';
      const bonus = node.class === 'people' ? 400 : node.class === 'trips' ? 300 : node.depth === 0 && node.class === 'places' ? 250 : 0;
      // A main country beats its continent: Europe hangs right in front of Switzerland.
      let priority = 1000 - (rank.get(node.key) ?? 999) + bonus + (topCountries.has(node.key) ? 300 : 0) - (orphan ? 800 : 0);
      if (this.filter?.has(node.key)) priority += 4000;
      if (hl?.entities.has(node.key)) priority += 5000;
      if (node.key === this.selected) priority += 20000;
      const showMain = this.view !== 'system' && !(dim && !this.filter?.has(node.key)) && (present || this.filter?.has(node.key));
      const text = labelFor(node, this.mode);
      // The selection, its neighbours and search hits always read, whatever their tier.
      const tier = hl?.entities.has(node.key) || this.filter?.has(node.key) ? 0 : tierOf(node);
      this.labels.set(node.key, showMain ? text : null, this.anchor(v), priority, { px: node.key === this.selected ? 18 : 14, tier });
      v.labelled = !!showMain && !!text;
      v.labelPriority = priority;
    }
    this.refreshLabels();

    // The grey entity links appear only with intent; trip tubes colour with their trip (spotlight()).
    this.linkLines.visible = !!(hl || this.filter);
    this.linkLines.material.opacity = 0.07;
    // Articles filed inside the selection's own country patch light fully;
    // ones that merely mention it but were filed elsewhere stay dim amber.
    const home = this.selected && this.views.has(this.selected) ? ancestorOfType(this.tree, this.nodes, this.selected, 'Country') : null;
    const fp = this.selectedFootprint();
    this.paintArticles(hl?.posts ?? this.filterPosts(), home, fp ? liftByCountry(fp) : null);
    this.updatePhotoSky(hl?.posts ?? null);
  }

  /**
   * `lens` (a topic or company selected): country -> lift. Its articles light
   * by how over-represented it is in their country, and the rest of a hotspot
   * country's patch gets a faint wash, so the patch reads as a heat region.
   */
  private paintArticles(lit: Set<string> | null, home: string | null = null, lens: Map<string, number> | null = null) {
    const tmp = new THREE.Color();
    const v4 = (c: THREE.Color, a: number) => [c.r, c.g, c.b, a];
    // Kept under the bloom threshold: a place's lit dots sit close together and would burn into one blob.
    const crowd = !!lit && lit.size > 12;
    const gold = { rgba: v4(tmp.copy(GOLD).multiplyScalar(crowd ? 0.58 : 0.8), 1), size: crowd ? 1.35 : 1.7 };
    const dimAmber = { rgba: [0.55, 0.36, 0.12, 0.7], size: 1.1 };
    this.articles.paint((post) => {
      if (this.mode !== 'both' && post.site !== this.mode) return null;
      const key = postKey(post);
      const country = this.articles.countryOf(key);
      const lift = lens ? lens.get(country ?? '') ?? 0 : 0;
      const isLit = !!lit && lit.has(key);
      if (isLit && lens && lift < 1.5) return dimAmber; // tagged, but no more than the blog's usual share here
      if (isLit && lens) return gold;
      if (lit && lens && lift >= 1.5) return { rgba: [0.4, 0.25, 0.08, 0.5], size: 0.9 };
      if (isLit) return home && country !== home ? dimAmber : gold; // filed under another country: dim amber
      if (lit) return { rgba: v4(tmp.copy(SITE_TINT[post.site]).multiplyScalar(0.3), 0.35), size: 0.8 };
      return { rgba: v4(tmp.copy(SITE_TINT[post.site]).multiplyScalar(DOT_LIGHT[post.perf]), 0.95), size: DOT_SIZE[post.perf] };
    });
  }

  /**
   * Blend one entity between its ghost look and its lit look (`lit`, from styleBox).
   * Colours go into userData.base/emissive, which depthFade scales each frame.
   */
  private paint(v: NodeView, s: number) {
    const L = v.lit;
    v.drawn = s;
    const c = this.tmpColor.copy(GHOST).lerp(L.color, s);
    const m = v.mesh.material;
    setBase(m, c);
    ((m.userData.emissive ??= new THREE.Color()) as THREE.Color).copy(c);
    m.emissiveIntensity = L.emissive * s;
    // Glass like the How it works tiles once lit (#33): low roughness lets the
    // under-light's streak cross the bloom threshold; ghosts stay matte and calm.
    m.roughness = THREE.MathUtils.lerp(GHOST_ROUGH, LIT_ROUGH, s);
    m.opacity = THREE.MathUtils.lerp(L.ghostFill, L.fill, s);
    const o = v.outline.material;
    const fetched = this.view === 'graph' ? this.liveEntities.get(v.key) : undefined;
    if (fetched) {
      // An agent's visit keeps the outline in its tier colour (breathing, see loop).
      setBase(o, this.tmpColor2.set(fetched));
      o.opacity = 1;
    } else {
      setBase(o, c);
      o.opacity = THREE.MathUtils.lerp(L.ghostLine, L.line, s);
    }
    v.halo.visible = L.haloOn && s > 0.5;
    setBase(v.halo.material, c);
    v.halo.material.opacity = L.haloOp * s;
    if (v.face) {
      setBase(v.face.material, this.tmpColor2.copy(GHOST).lerp(L.faceTint, s));
      v.face.material.opacity = THREE.MathUtils.lerp(L.ghostFace, L.face, s);
      v.sat.value = s; // flags and logos turn grey as ghosts, not just dimmer
    }
  }

  /** Globe view, per frame: ease every entity's spotlight towards the view axis, flicker visits, repaint what moved. */
  private spotlight(t: number) {
    const dt = Math.min(0.1, Math.max(0, t - this.lastT));
    this.lastT = t;
    if (this.view !== 'graph') return;
    const inside = this.camera.position.length() < DOME_R;
    const [inA, outA] = this.narrow ? SPOT.phone : SPOT.desk;
    const cosIn = Math.cos(THREE.MathUtils.degToRad(inA));
    const cosOut = Math.cos(THREE.MathUtils.degToRad(outA));
    const k = 1 - Math.exp(-dt / SPOT_EASE);
    this.camera.getWorldDirection(this.fwd);
    const eye = this.camera.position;
    for (const v of this.views.values()) {
      let target = 0;
      if (v.hold) target = v.hold > 0 ? 1 : 0;
      else if (inside) {
        // Aim at the rendered centre: a topic stands lift units above its wheel point.
        const d = this.tmp.set(v.base.x - eye.x, v.base.y + v.lift - eye.y, v.base.z - eye.z);
        const len = d.length();
        target = len < 1e-3 ? 1 : THREE.MathUtils.smoothstep(d.dot(this.fwd) / len, cosOut, cosIn);
      }
      v.spot += (target - v.spot) * k;
      if (Math.abs(target - v.spot) < 0.004) v.spot = target;
    }
    // Visits flash at full colour whatever the spotlight says, inside the globe only.
    const flick = this.live.group.visible && inside;
    for (const key of this.visited) {
      const v = this.views.get(key);
      if (v) v.flick = flick ? flicker(t, hash(key)) : 0;
    }
    for (const v of this.views.values()) {
      const s = Math.max(v.spot, v.flick);
      if (Math.abs(s - v.drawn) > 0.01 || (s !== v.drawn && (s === 0 || s === 1))) this.paint(v, s);
    }
    // A trip's route takes its colour with the trip.
    for (const { mesh, key } of this.tubes) {
      const s = this.views.get(key)?.spot ?? 0;
      mesh.material.color.copy(GHOST).lerp(TRIP, s);
      mesh.material.opacity = THREE.MathUtils.lerp(0.1, 0.6, s);
    }
  }

  /**
   * Whisper: only lit entities (or the selection, its neighbours, search hits) may
   * carry a label. The 8 / 5 budget is spent in Labels.update, on labels that pass its
   * distance, viewport and overlap checks, so a rejected label never takes a slot.
   */
  private refreshLabels() {
    this.labelOn.clear();
    if (this.view !== 'graph') return;
    for (const v of this.views.values()) if (v.labelled && (v.hold > 0 || v.spot > LABEL_SPOT)) this.labelOn.add(v.key);
  }

  /** Labels.update budget: spotlight labels count towards the cap; overrides (hold) and non-entity labels never do. */
  private budgeted = (key: string) => this.view === 'graph' && (this.views.get(key)?.hold ?? 1) <= 0;

  /** Labels.update hook: in the globe view an entity label shows only while it is in labelOn. */
  private hideLabel = (key: string) => this.view === 'graph' && this.views.has(key) && !this.labelOn.has(key);

  /** Globe view: entities behind the photo band dim like the dome tiles, so the near side reads first. */
  private depthFade(range: { from: number; far: number } | null) {
    const fwd = this.camera.getWorldDirection(new THREE.Vector3());
    const at = new THREE.Vector3();
    // Outside: geography first. Countries regain colour before cantons/sights
    // as the camera approaches their own shell; other views retain full detail.
    const overview = this.view === 'graph'
      ? 1 - THREE.MathUtils.smoothstep(this.camera.position.length(), DOME_R * 0.9, DOME_R * 1.9)
      : 1;
    this.globeDetail.value = overview;
    const tint = (m: THREE.Material & { color: THREE.Color }, f: number) => {
      m.color.copy((m.userData.base ??= m.color.clone()) as THREE.Color).multiplyScalar(f);
    };
    for (const v of this.views.values()) {
      for (const b of [v]) {
        const focus = this.selected === v.key || this.filter?.has(v.key);
        const reach = v.node.class === 'places' && v.node.depth > 1 ? 55 : 90;
        const local = 1 - THREE.MathUtils.smoothstep(this.camera.position.distanceTo(b.mesh.position), reach * 0.45, reach);
        b.detail.value = this.view !== 'graph' || focus ? 1 : Math.min(overview, local);
        let f = 1;
        if (range && this.view === 'graph') {
          const depth = at.copy(b.mesh.position).sub(this.camera.position).dot(fwd);
          f = 1 - 0.7 * THREE.MathUtils.smoothstep(depth, range.from, range.far);
        }
        const m = b.mesh.material;
        tint(m, f);
        m.emissive.copy((m.userData.emissive ??= m.emissive.clone()) as THREE.Color).multiplyScalar(f);
        tint(b.outline.material, f);
        tint(b.halo.material, f);
        if (b.face) tint(b.face.material, f);
      }
    }
  }

  private anchor(b: Box): Vec3 {
    const lift = b.face ? b.face.scale.y / 2 : b.lift ? 2 * b.lift + 0.4 : b.size / 2;
    return { x: b.base.x, y: b.base.y + lift, z: b.base.z };
  }

  /** A selected topic or company: bold lines to its top three hotspot countries, weighted by share. */
  private refreshHotLines() {
    this.hotLines.children.forEach((c) => (c as LineSegments2).geometry.dispose());
    this.hotLines.clear();
    this.hotMats.forEach((m) => m.dispose());
    this.hotMats = [];
    const fp = this.selectedFootprint();
    const from = this.selected ? this.views.get(this.selected)?.base : undefined;
    if (this.view !== 'graph' || !fp || !from) return;
    const { clientWidth: w, clientHeight: h } = this.container;
    for (const hot of fp.hotspots.slice(0, 3)) {
      const to = this.views.get(hot.country)?.base;
      if (!to) continue;
      const mat = new LineMaterial({ color: 0xff9000, linewidth: 1.5 + 5 * hot.share, transparent: true, opacity: 0.9, depthWrite: false });
      mat.resolution.set(w, h);
      this.hotMats.push(mat);
      this.hotLines.add(new LineSegments2(new LineSegmentsGeometry().setPositions([from.x, from.y, from.z, to.x, to.y, to.z]), mat));
    }
  }

  private refreshFocus() {
    this.focusLinks.clear();
    this.refreshGhostFocus();
    this.refreshHotLines();
    if (this.view !== 'graph' || !this.selected) return;
    const segs: number[] = [];
    const post = this.postsByKey.get(this.selected);
    if (post) {
      // Rays from the article dot to the entities it is tagged with.
      const at = this.articles.at(this.selected);
      if (!at) return;
      const c = at.clone().multiplyScalar(0.995);
      for (const k of post.entities) {
        const b = this.views.get(k)?.base;
        if (b) segs.push(c.x, c.y, c.z, b.x, b.y, b.z);
      }
    } else {
      const v = this.views.get(this.selected);
      if (!v) return; // a system tile
      const a = v.base;
      for (const [k] of cooccurring(postsFor(this.graph, this.mode), v.key, 12)) {
        const b = this.views.get(k)?.base;
        if (b) segs.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
      // ...and from the entity out to each of its articles on the skin (not for a topic: hundreds).
      for (const p of v.node.class === 'topics' ? [] : postsFor(this.graph, this.mode)) {
        if (!p.entities.includes(v.key)) continue;
        const c = this.articles.at(postKey(p));
        if (!c) continue;
        segs.push(a.x, a.y, a.z, c.x, c.y, c.z);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3));
    this.focusLinks.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#FF9000', transparent: true, opacity: 0.55 })));
  }

  // ---------- selection & camera ----------

  /**
   * Select an entity or article and, with `fly`, frame it. `pair` is a live
   * reading-list row id: several rows can share one destination, so the row
   * says which origin -> destination curve to frame. `owner` is who flies:
   * the tour passes 'tour', so its next stop can replace this flight.
   */
  select(key: string | null, fly = true, { pair, owner = 'select' }: { pair?: string; owner?: CameraOwner } = {}) {
    this.selected = key;
    if (key) this.drift = null;
    this.applyStyle();
    this.refreshFocus();
    if (!fly) return;
    // Nothing selected and already home (e.g. on load): no flight, so live follow is not blocked.
    if (!key) return this.atHome && !this.flight ? undefined : this.flyHome(1600, owner);
    const path = pair && this.view === 'graph' && this.live.group.visible ? this.live.pathOf(pair) : null;
    if (path) return void this.flyTo(this.pairShot(path), 1900, owner);
    const shot = this.shotFor(key);
    if (shot) void this.flyTo(shot, this.postsByKey.has(key) ? 1900 : this.view === 'system' ? 1600 : 1800, owner);
  }

  /**
   * Where the camera goes to show `key` in `view` (camera.ts), from the layout
   * of that view, not the current morph, so a tour can work its shots out up
   * front. `prevEye` picks the side, for shots that follow one another.
   */
  private shotFor(key: string, view: View = this.view, prevEye?: THREE.Vector3): CameraKeyframe | null {
    const at = (k: string) => {
      const p = this.layouts[view].get(k);
      return p ? new THREE.Vector3(p.x, p.y, p.z) : null;
    };
    const post = this.postsByKey.get(key);
    if (post && view === 'graph') {
      const c = this.articles.at(key);
      // From inside, a dot is easy to miss: step outside instead.
      return c ? framePost(c, post.entities.map(at).filter((e): e is THREE.Vector3 => !!e), prevEye) : null;
    }
    const v = this.views.get(key);
    const p = at(key);
    if (!v || !p) return null;
    if (view === 'system') return kf([p.x + 18, p.y + 10, p.z + 22], [p.x, p.y, p.z]);
    if (v.node.class === 'places') return framePlace(p, v.node.depth === 0 ? 2.3 : v.node.type === 'Country' ? 1.9 : 1.45, prevEye);
    if (v.node.class === 'topics') return frameTopic(p);
    // Inside the dome, behind the entity on the line from its articles. Not all of them fit, and need not.
    const tiles = [...(this.highlight(key)?.posts ?? [])].map((k) => this.articles.at(k)).filter((c): c is THREE.Vector3 => !!c);
    return frameInterior(p, tiles, prevEye);
  }

  // ---------- guided tour ----------

  /** While on, the tour alone moves the camera. Off ends a tour flight and its drift where they are: Close keeps the shot. */
  setTour(on: boolean) {
    this.touring = on;
    if (on) return;
    if (this.flight?.owner === 'tour') this.cancelFlight();
    if (this.drift?.kind === 'tour') this.drift = null;
  }

  /**
   * A stop's canonical arrival shot: its authored camera, else the framing of
   * its selection in the graph view, on the side nearer the previous stop's
   * shot. The same every time, so Back lands where Next did.
   */
  tourShot(stop: { select?: string; camera?: CameraKeyframe; inside?: string }, prev?: CameraKeyframe): CameraKeyframe {
    if (stop.camera) return stop.camera;
    const eye = prev ? new THREE.Vector3(prev.position.x, prev.position.y, prev.position.z) : undefined;
    const inner = stop.inside && this.layouts.graph.get(stop.inside);
    if (inner) return frameInward(new THREE.Vector3(inner.x, inner.y, inner.z), eye);
    return (stop.select && this.shotFor(stop.select, 'graph', eye)) || this.homes.graph;
  }

  /**
   * One tour transition: switch the view without its own flight home and fly
   * straight to the shot, so there is no join to stop at. A view change swings
   * round the centre (orbit) while the layout morphs: the shots on either side
   * face different ways, and a straight line would pass through its target.
   * Reduced motion: a cut.
   */
  tourFly(view: View, shot: CameraKeyframe): Promise<FlightResult> {
    const changing = view !== this.view;
    // Every tour step is a click (start, Next, Back): it takes over whatever
    // flies, a selection's flight included, so its shot always starts.
    this.cancelFlight();
    this.setView(view, 'tour', false);
    return this.flyTo(shot, this.reduced.matches ? 1 : changing ? 2200 : 2000, 'tour', changing ? 'orbit' : undefined);
  }

  /** Drift at a tour stop, turning toward the next stop's eye; none under reduced motion. */
  tourDrift(next?: CameraKeyframe) {
    if (this.reduced.matches) return;
    let sign = 1;
    if (next) {
      const q = this.camera.position.clone().sub(this.controls.target);
      const n = new THREE.Vector3(next.position.x, next.position.y, next.position.z).sub(this.controls.target);
      sign = new THREE.Vector3().crossVectors(q, n).y < 0 ? -1 : 1;
    }
    this.drift = { kind: 'tour', sign, t0: this.clock.getElapsedTime(), applied: 0 };
  }

  /**
   * Live follow: fly to a reading-list row's origin -> destination pair as
   * owner 'follow', then circle it slowly until something else moves the
   * camera. False when the user is busy (pressing, touched in the last
   * SPIN_IDLE_MS, a selection, the other view, a higher flight) or the row draws
   * no curve. Reduced motion: a jump cut, no circling. 'busy' means try
   * again later; 'none' means this row can never be framed.
   */
  followPair(row: string): 'started' | 'busy' | 'none' {
    // touchedAt starts at 0: only a real touch counts, not the first seconds after load.
    const touched = this.touchedAt > 0 && performance.now() - this.touchedAt < SPIN_IDLE_MS;
    if (this.view !== 'graph' || this.touring || this.selected || this.pressed || touched) return 'busy';
    if (this.flight && outranks(this.flight.owner, 'follow')) return 'busy';
    const path = this.live.pathOf(row);
    if (!path) return 'none';
    const reduced = this.reduced.matches;
    const shot = this.pairShot(path);
    void this.flyTo(shot, reduced ? 1 : 2400, 'follow').then((r) => {
      if (r === 'done' && !reduced) this.drift = { kind: 'pair' };
    });
    return 'started';
  }

  /** Follow switched off: end a follow flight and the drift where they are; other flights carry on. */
  stopFollow() {
    if (this.flight?.owner === 'follow' || this.flight?.owner === 'drift') this.cancelFlight();
    if (this.drift?.kind === 'pair') this.drift = null;
  }

  /**
   * The shot for a live row: an agent fetching an entity inside the dome is
   * framed from inside, along its beam (#54); everything else, readers and
   * article fetches, from outside (framePair).
   */
  private pairShot(path: { points: THREE.Vector3[]; interior: boolean }): CameraKeyframe {
    const eye = this.camera.position;
    if (path.interior) return frameBeamInside(path.points[0], path.points[path.points.length - 1], eye);
    return framePair(path.points, { ...this.frameTans(), eye }).key;
  }

  /** Half-angle tangents of the HUD's free rectangle, for framing (one focal length for both axes). */
  private frameTans() {
    const { clientWidth: w, clientHeight: h } = this.container;
    const { top, right, bottom, left } = this.insets;
    const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    return { tanV: (t * Math.max(h - top - bottom, 1)) / h, tanH: (t * Math.max(w - left - right, 1)) / h };
  }

  private setCamera(k: CameraKeyframe) {
    this.camera.position.set(k.position.x, k.position.y, k.position.z);
    this.controls.target.set(k.target.x, k.target.y, k.target.z);
  }

  /**
   * Fly to a keyframe. Resolves 'done' on landing, or 'cancelled' when the user
   * or a later flight takes over; a flight cannot replace one with a higher
   * owner (camera.ts), and then resolves 'refused' without moving.
   */
  flyTo(to: CameraKeyframe, ms = 1600, owner: CameraOwner = 'select', path?: PathPolicy): Promise<FlightResult> {
    if (this.flight && outranks(this.flight.owner, owner)) return Promise.resolve('refused');
    this.cancelFlight();
    this.drift = null;
    this.controls.autoRotate = false;
    if (to !== this.homes[this.view]) this.atHome = false;
    const from = { position: this.camera.position.clone(), target: this.controls.target.clone() };
    return new Promise((done) => {
      this.flight = { from, to, t0: performance.now(), ms, owner, path: path ?? pathPolicy(from, to, this.view === 'graph'), done };
    });
  }

  /** End the flight in progress, if any; its promise settles as 'cancelled'. */
  private cancelFlight() {
    const f = this.flight;
    this.flight = null;
    f?.done('cancelled');
  }

  /** Back to the current view's home, even with nothing selected (select(null) alone is a no-op then). */
  resetView() {
    this.flyHome(1600);
  }

  /** Fly to the fitted home of the current view; afterwards a reframe may move the camera again. */
  private flyHome(ms: number, owner: CameraOwner = 'select') {
    void this.flyTo(this.homes[this.view], ms, owner).then((r) => {
      if (r === 'done' && !this.selected) this.atHome = true;
    });
  }

  /** Pixels of the viewport the HUD covers; the globe is framed in what is left. */
  setSafeArea(insets: { top: number; right: number; bottom: number; left: number }) {
    this.insets = { ...insets };
    this.applyProjection();
    this.refit();
  }

  /** Shift the projection centre to the middle of the free rectangle. */
  private applyProjection() {
    const { clientWidth: w, clientHeight: h } = this.container;
    const { top, right, bottom, left } = this.insets;
    this.camera.aspect = w / h;
    if (top || right || bottom || left) this.camera.setViewOffset(w, h, (right - left) / 2, (bottom - top) / 2, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  /** Fit the globe view's home distance to the free rectangle, keeping its direction. */
  private refit() {
    const { clientWidth: w, clientHeight: h } = this.container;
    const { top, right, bottom, left } = this.insets;
    const prev = this.homes.graph;
    let next = HOMES.graph;
    if (top || right || bottom || left) {
      const { position: p, target: t } = HOMES.graph;
      const dir = new THREE.Vector3(p.x - t.x, p.y - t.y, p.z - t.z);
      const base = dir.length();
      // One focal length for both axes: the free rectangle spans tan(fov/2) scaled by its share of the canvas.
      const tanHalf = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * Math.min(Math.max(h - top - bottom, 1), Math.max(w - left - right, 1)) / h;
      // Sphere of radius R (globe + bars + glow) fits when distance >= R / sin(half angle).
      const dist = Math.max(base, ((DOME_R * 1.15) / Math.sin(Math.atan(tanHalf))) * 1.03);
      dir.setLength(dist);
      next = kf([t.x + dir.x, t.y + dir.y, t.z + dir.z], [t.x, t.y, t.z]);
      this.controls.maxDistance = Math.max(260, dist);
    } else {
      this.controls.maxDistance = 260;
    }
    this.homes = { ...this.homes, graph: next };
    if (this.flight?.to === prev) this.flight.to = next;
    if (this.atHome && !this.selected && !this.flight && this.view === 'graph') this.setCamera(next);
  }

  private showViewDecor() {
    const v = this.view;
    this.articles.group.visible = this.links.visible = this.wheel.visible = this.hotLines.visible = this.live.group.visible = v === 'graph';
    this.system.group.visible = v === 'system';
  }

  /** Switch views; the camera flies home as `owner` (the tour passes 'tour'). */
  setView(view: View, owner: CameraOwner = 'select', fly = true) {
    if (view === this.view) return;
    this.view = view;
    this.controls.autoRotateSpeed = view === 'system' ? SYSTEM_SPIN : GRAPH_SPIN;
    const from = new Map([...this.views.values()].map((v) => [v.key, { ...v.base }]));
    // Reduced motion: the layout cuts with the camera instead of morphing.
    this.morph = { from, t0: performance.now(), ms: this.reduced.matches ? 1 : 2200 };
    this.showViewDecor();
    this.focusLinks.clear();
    this.applyStyle();
    if (fly) this.flyHome(2200, owner);
  }

  getCamera(): CameraKeyframe {
    const r = (v: THREE.Vector3) => ({ x: +v.x.toFixed(1), y: +v.y.toFixed(1), z: +v.z.toFixed(1) });
    return { position: r(this.camera.position), target: r(this.controls.target) };
  }

  setAutoRotate(on: boolean) {
    this.controls.autoRotate = on;
  }

  /** Viewport pixel of an entity's spot on the skin; null when hidden behind the globe or off screen. */
  screenPoint(key: string): { x: number; y: number } | null {
    const base = this.views.get(key)?.base;
    if (!base) return null;
    const p = new THREE.Vector3(base.x, base.y, base.z).normalize().multiplyScalar(DOME_R);
    const eye = this.camera.position;
    if (eye.length() > DOME_R && p.dot(eye) <= 0) return null;
    p.project(this.camera);
    if (p.z > 1 || Math.abs(p.x) > 1.05 || Math.abs(p.y) > 1.05) return null;
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  }

  // ---------- events ----------

  private pick(ev: PointerEvent): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const targets: THREE.Object3D[] = [];
    for (const v of this.views.values()) if (v.pickable) targets.push(v.face ?? v.mesh);
    if (this.view === 'system') targets.push(...this.system.pickables);
    if (this.view === 'graph') targets.push(this.articles.points, ...this.articles.bars);
    this.raycaster.params.Points = { threshold: 0.7 };
    const outside = this.camera.position.length() > DOME_R;
    const hits = this.raycaster.intersectObjects(targets, false);
    for (const hit of hits) {
      if (hit.object === this.articles.points) {
        const post = hit.index === undefined ? undefined : this.articles.posts[hit.index];
        if (!post || !this.articles.isVisible(hit.index!)) continue; // hidden dot: look further along the ray
        if (outside && hit.point.dot(this.camera.position) <= 0) continue; // far hemisphere
        return postKey(post);
      }
      if (!hit.object.visible && this.articles.bars.includes(hit.object as THREE.Mesh)) continue; // culled bar
      const key = (hit.object.userData.key as string | undefined) ?? this.faceOwner(hit.object);
      if (key) return key;
    }
    return null;
  }

  private faceOwner(o: THREE.Object3D): string | null {
    for (const v of this.views.values()) if (v.face === o) return v.key;
    return null;
  }

  private onPointerMove = (ev: PointerEvent) => {
    const key = this.pick(ev);
    if (key !== this.hovered) {
      this.hovered = key;
      this.touchedAt = performance.now();
      this.renderer.domElement.style.cursor = key ? 'pointer' : 'grab';
    }
    this.cb.onHover(key, ev.clientX, ev.clientY);
  };

  private onPointerDown = (ev: PointerEvent) => {
    this.downAt = { x: ev.clientX, y: ev.clientY };
    this.pressed = true;
  };

  /** Pointer up or a cancelled touch: the idle clock for the spin starts here. */
  private onPointerRelease = () => {
    this.pressed = false;
    this.touchedAt = performance.now();
  };

  /** A finger lifting or the mouse leaving the canvas: nothing is hovered any more. */
  private onPointerLeave = (ev: PointerEvent) => {
    if (!this.hovered) return;
    this.hovered = null;
    this.touchedAt = performance.now();
    this.cb.onHover(null, ev.clientX, ev.clientY);
  };

  private onPointerUp = (ev: PointerEvent) => {
    this.onPointerRelease();
    if (Math.hypot(ev.clientX - this.downAt.x, ev.clientY - this.downAt.y) > 5) return; // a drag, not a click
    this.cb.onSelect(this.pick(ev));
  };

  private onResize = () => {
    const { clientWidth: w, clientHeight: h } = this.container;
    this.narrow = w < 768 || h <= 520;
    this.applyProjection();
    this.refit();
    this.renderer.setSize(w, h);
    this.bloom.updateSize(w, h);
    this.hotMats.forEach((m) => m.resolution.set(w, h));
  };

  private stepMorph() {
    const m = this.morph!;
    const k = Math.min(1, (performance.now() - m.t0) / m.ms);
    const to = this.layouts[this.view];
    const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    let i = 0;
    const n = this.views.size;
    for (const v of this.views.values()) {
      // Stagger so the boxes stream into place instead of jumping together.
      const delay = 0.3 * (i++ / n);
      const e = ease(Math.min(1, Math.max(0, (k - delay) / 0.7)));
      const lerp = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, z: a.z + (b.z - a.z) * e });
      v.base = lerp(m.from.get(v.key)!, to.get(v.key)!);
      this.place(v);
      this.labels.move(v.key, this.anchor(v));
    }
    if (k === 1) {
      this.morph = null;
      this.applyStyle();
      this.refreshFocus();
    }
  }

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop);
    const t = this.clock.getElapsedTime();
    if (this.flight) {
      const f = this.flight;
      const k = Math.min(1, (performance.now() - f.t0) / f.ms);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; // cubic in-out, as in the Cube
      const at = pathAt(f.from, f.to, e, f.path);
      this.camera.position.copy(at.position);
      this.controls.target.copy(at.target);
      if (k === 1) {
        this.flight = null;
        f.done('done');
      }
    }
    if (this.morph) this.stepMorph();
    if (this.system.group.visible) {
      const key = this.hovered ?? this.selected;
      this.system.animate(t, key, this.reduced.matches);
    }
    if (this.live.group.visible) this.live.tick(t, this.camera.position);
    const fade = this.articles.group.visible ? this.articles.update(this.camera) : null;
    this.spotlight(t);
    if (t - this.lastLabels > LABEL_EVERY) {
      this.lastLabels = t;
      this.refreshLabels();
    }
    this.depthFade(fade);
    const sky = this.photoSky.material;
    sky.opacity += (this.photoSkyTarget - sky.opacity) * 0.04;
    const v = this.selected ? this.views.get(this.selected) : undefined;
    if (v && !v.face) {
      scaleBox(v, 1 + 0.12 * Math.sin(t * 4));
      v.mesh.rotation.y = v.outline.rotation.y = t * 0.8;
    }
    // Entities an agent is fetching: the outline breathes in the agent's colour.
    if (this.live.group.visible)
      for (const key of this.liveEntities.keys()) {
        const b = this.views.get(key);
        if (!b || b === v) continue;
        b.outline.scale.set(b.size, b.height, b.size).multiplyScalar(1.04 * (1.05 + 0.15 * Math.sin(t * 3)));
        b.outline.material.opacity = 0.65 + 0.35 * Math.sin(t * 3);
      }
    // One mechanism for the spin: the camera's auto-rotate, time-based here.
    const dt = Math.min(0.1, t - this.lastTick);
    this.lastTick = t;
    if (this.view === 'system')
      this.controls.autoRotate = !this.reduced.matches && !this.touring && !this.flight && !this.pressed && !this.hovered && !this.selected && performance.now() - this.touchedAt > SPIN_IDLE_MS;
    // Drift: turn the eye about the line from the globe centre through the
    // target, so its distance from the centre never changes and it cannot dip
    // into the globe; the pair stays in the middle of the frame.
    const d = this.drift;
    if (d && !this.flight && !this.reduced.matches) {
      if (d.kind === 'pair' && this.view === 'graph' && this.controls.target.lengthSq() > 1)
        this.camera.position.applyAxisAngle(this.tmp.copy(this.controls.target).normalize(), DRIFT_SPEED * dt);
      if (d.kind === 'tour') {
        // About the vertical through the target, bounded and easing out.
        const a = TOUR_DRIFT * (1 - Math.exp(-(t - d.t0) / TOUR_DRIFT_S));
        const q = this.tmp.copy(this.camera.position).sub(this.controls.target).applyAxisAngle(UP, d.sign * (a - d.applied));
        d.applied = a;
        this.camera.position.copy(this.controls.target).add(q);
      }
    }
    this.controls.update(this.view === 'system' ? dt : undefined);
    const { clientWidth: w, clientHeight: h } = this.container;
    // Labels anchor to the interior entity shells, not the geographic surface.
    // Hide the entire label layer outside, including selections and live labels.
    const outside = this.view === 'graph' && this.camera.position.length() > DOME_R;
    this.labels.group.visible = !outside;
    if (!outside) this.labels.update(this.camera, w, h, this.view, this.hideLabel, fade, this.view === 'graph' ? THREE.MathUtils.lerp(0.62, 1, this.globeDetail.value) : 1, { counts: this.budgeted, max: this.narrow ? 5 : 8 });
    this.sky.position.copy(this.camera.position);
    this.bloom.composer.render();
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.renderer.render(this.labelScene, this.camera);
    this.renderer.autoClear = true;
  };

  dispose() {
    cancelAnimationFrame(this.frame);
    this.cancelFlight();
    const el = this.renderer.domElement;
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointercancel', this.onPointerRelease);
    el.removeEventListener('pointerleave', this.onPointerLeave);
    window.removeEventListener('resize', this.onResize);
    this.controls.dispose();
    this.bloom.dispose();
    this.renderer.dispose();
    el.remove();
  }
}

/** Size a cylinder: diameter b.size, height b.height, times k; the outline sits just outside. */
function scaleBox(b: Box, k: number) {
  b.mesh.scale.set(b.size * k, b.height * k, b.size * k);
  b.outline.scale.copy(b.mesh.scale).multiplyScalar(1.04);
}

/** The topic wheel's article scale: a flat disc whose bands fade in along a log10 scale (#27). */
function articleDisc(r0: number, r1: number, max: number, detail: { value: number }): THREE.Mesh {
  const geo = new THREE.RingGeometry(r0, r1, 160, 1);
  geo.rotateX(-Math.PI / 2);
  const material = new THREE.ShaderMaterial({
    uniforms: { uR0: { value: r0 }, uR1: { value: r1 }, uLogMax: { value: Math.log10(1 + max) }, uDetail: detail, uColor: { value: new THREE.Color('#d4d4d4') } },
    vertexShader: `
      varying vec2 vXZ;
      void main() {
        vXZ = position.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }`,
    fragmentShader: `
      uniform float uR0; uniform float uR1; uniform float uLogMax; uniform float uDetail; uniform vec3 uColor;
      varying vec2 vXZ;
      void main() {
        float t = clamp( ( length( vXZ ) - uR0 ) / ( uR1 - uR0 ), 0.0, 1.0 );
        float v = max( pow( 10.0, t * uLogMax ) - 1.0, 1.0 );
        float lg = log( v ) / log( 10.0 );
        float decade = fract( lg );                      // 0 at 1, 10, 100 ... rising to the next
        float step = fract( v / pow( 10.0, floor( lg ) ) ); // 0 at each 1, 2, 3 ... of the decade
        float a = ( 0.008 + 0.026 * t ) * ( 0.25 + 0.45 * decade + 0.3 * step );
        gl_FragColor = vec4( uColor, a * mix( 0.15, 1.0, uDetail ) );
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const disc = new THREE.Mesh(geo, material);
  disc.position.y = -0.02; // just under the grid lines and the cylinder bases
  disc.renderOrder = -1;
  return disc;
}

/** An orange glow that brightens toward the globe's edge; front faces only, so it vanishes once the camera is inside. */
function rimGlow(radius: number, color: string): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) } },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4( position, 1.0 );
        vNormal = normalize( normalMatrix * normal );
        vView = normalize( -mv.xyz );
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float rim = pow( 1.0 - max( dot( normalize( vNormal ), normalize( vView ) ), 0.0 ), 3.6 );
        gl_FragColor = vec4( uColor, rim * 0.32 );
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 64), material);
  mesh.renderOrder = -3;
  return mesh;
}
