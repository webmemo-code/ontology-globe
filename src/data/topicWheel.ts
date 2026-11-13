// Topics live on a level wheel in the middle of the globe: direction = family,
// distance from the centre = how specific the topic is.
import type { Graph } from './types';
import type { Vec3 } from './model';

/** Outer radius of the wheel; it fits inside the innermost place shell (22). */
export const WHEEL_R = 18;

// Editorial first draft: the owner will correct this grouping.
export const TOPIC_FAMILIES: { name: string; topics: string[] }[] = [
  { name: 'Hotels', topics: ['boutique-hotel', 'resort', 'lodge', 'masseria', 'wellness-tourism', 'thermal-springs', 'luxury-travel', 'design'] },
  { name: 'Restaurants', topics: ['restaurant', 'culinary-tourism'] },
  { name: 'Hiking & nature', topics: ['hiking', 'peak-hike', 'levada-walk', 'long-distance-trail', 'lake', 'landscape', 'nature-tourism', 'canopy-walk'] },
  { name: 'City trips', topics: ['city-trip', 'culture', 'museum', 'architecture', 'shopping'] },
  { name: 'Golf & active', topics: ['golf', 'winter-tourism', 'scuba-diving', 'adventure-travel'] },
  { name: 'Wildlife & countryside', topics: ['safari', 'wildlife-tourism', 'wildlife-viewing', 'rural-tourism', 'agritourism'] },
  { name: 'Journeys', topics: ['itinerary', 'round-trip', 'road-trip', 'air-travel', 'sea-travel', 'vehicle-rental'] },
  { name: 'Formats', topics: ['review', 'experience-travel', 'excursion-tips', 'travel-photography'] },
];

const GAP = 0.06;
const ZIGZAG = [0.5, 0.25, 0.75, 0.4, 0.6, 0.15, 0.85, 0.5];

/** Angle (0 = world -z, clockwise from above) and radius to a point on the wheel plane. */
export const wheelPoint = (a: number, r: number): Vec3 => ({ x: Math.sin(a) * r, y: 0, z: -Math.cos(a) * r });

export function topicWheelLayout(graph: Graph): {
  pos: Map<string, Vec3>;
  sectors: { name: string; from: number; to: number; mid: number }[];
} {
  const topics = graph.nodes.filter((n) => n.class === 'topics');
  const posts = (k: string) => {
    const s = topics.find((n) => n.key === k)?.sites;
    return (s?.travelmemo?.posts ?? 0) + (s?.reisememo?.posts ?? 0);
  };
  const listed = new Set(TOPIC_FAMILIES.flatMap((f) => f.topics.map((t) => `topics/${t}`)));
  const families = TOPIC_FAMILIES.map((f) => ({ name: f.name, keys: f.topics.map((t) => `topics/${t}`) }));
  const other = topics.map((n) => n.key).filter((k) => !listed.has(k));
  if (other.length) families.push({ name: 'Other', keys: other });

  const have = new Set(topics.map((n) => n.key));
  const groups = families
    .map((f) => ({ name: f.name, keys: f.keys.filter((k) => have.has(k)) }))
    .filter((f) => f.keys.length);
  const weight = (n: number) => 1 + n;
  const total = groups.reduce((s, g) => s + weight(g.keys.length), 0);
  const free = 2 * Math.PI - GAP * groups.length;

  const pos = new Map<string, Vec3>();
  const sectors: { name: string; from: number; to: number; mid: number }[] = [];
  let at = GAP / 2;
  for (const g of groups) {
    const width = (free * weight(g.keys.length)) / total;
    const from = at;
    const to = at + width;
    sectors.push({ name: g.name, from, to, mid: (from + to) / 2 });
    const sorted = [...g.keys].sort((a, b) => posts(b) - posts(a) || a.localeCompare(b));
    const n = sorted.length;
    sorted.forEach((k, i) => {
      const r = 5 + (WHEEL_R - 6.5) * (n === 1 ? 0.35 : i / (n - 1));
      pos.set(k, wheelPoint(from + width * ZIGZAG[i % ZIGZAG.length], r));
    });
    at = to + GAP;
  }
  return { pos, sectors };
}
