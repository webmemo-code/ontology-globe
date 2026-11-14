import type { BotTier, LiveBySite, LiveSnapshot } from '../data/live';
import type { SiteKey, SiteMode } from '../data/types';

export type ReadingRow = {
  id: string; kind: 'reader' | 'bot'; site: SiteKey; who: string; what: string; pick: string | null;
  tier?: BotTier; route?: string;
};
export const TIER_LABELS: Record<BotTier, string> = { training: 'training', search: 'search', user: 'for a user', other: 'other' };
const ROUTE_LABELS: Record<string, string> = { okf: 'OKF', ontology: 'EntityMap', llms: 'llms.txt', 'llms.txt': 'llms.txt', jsonld: 'JSON-LD' };
export const routeLabel = (route?: string) => (route ? (ROUTE_LABELS[route] ?? route) : '');

export const SERVED_KEYS = ['HTML', 'JSON-LD', 'EntityMap', 'llms.txt', 'OKF'] as const;
export type Served = Record<(typeof SERVED_KEYS)[number], number>;
export interface LiveStats {
  readers: Record<SiteKey, number>;
  total: number;
  bots: number;
  served: Served;
}
/** Reader count per mode, one point of the sparkline. */
export type Sample = Record<SiteMode, number>;

const scoped = (data: LiveBySite, mode: SiteMode) =>
  (Object.entries(data) as [SiteKey, LiveSnapshot][]).filter(([site]) => mode === 'both' || site === mode);

/** Counts of presence rows (a city and article pair, not a person) and bot fetches in scope. */
export function liveStats(data: LiveBySite, mode: SiteMode): LiveStats {
  const readers: Record<SiteKey, number> = { travelmemo: 0, reisememo: 0 };
  const served: Served = { HTML: 0, 'JSON-LD': 0, EntityMap: 0, 'llms.txt': 0, OKF: 0 };
  let bots = 0;
  for (const [site, snap] of scoped(data, mode)) {
    readers[site] = snap.readers.length;
    served.HTML += snap.readers.length;
    for (const b of snap.bots) {
      bots++;
      const label = routeLabel(b.route);
      if (label !== 'HTML' && label in served) served[label as keyof Served]++;
      else served.HTML++;
    }
  }
  return { readers, total: readers.travelmemo + readers.reisememo, bots, served };
}

export function sampleOf(data: LiveBySite): Sample {
  const n = (mode: SiteMode) => liveStats(data, mode).total;
  return { both: n('both'), travelmemo: n('travelmemo'), reisememo: n('reisememo') };
}

/** 25 deterministic points around the first sample, so ?live=demo previews look alive. */
export function demoHistory(first: Sample): Sample[] {
  const wobble = (i: number) => 1 + 0.22 * Math.sin(i * 1.9 + 0.7) + 0.12 * Math.sin(i * 4.3 + 2.1);
  return Array.from({ length: 25 }, (_, i) => ({
    both: Math.max(1, Math.round(first.both * wobble(i))),
    travelmemo: Math.max(1, Math.round(first.travelmemo * wobble(i + 3))),
    reisememo: Math.max(1, Math.round(first.reisememo * wobble(i + 7))),
  }));
}

/** Rounded percentages that always sum to 100. */
export const shareOf = (part: number, total: number): [number, number] => {
  const a = Math.round((100 * part) / total);
  return [a, 100 - a];
};
