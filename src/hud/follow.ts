// Live follow (#44): which reading-list row the camera flies to after a poll.
// The feed sends presence rows, not arrival events: reader rows carry no
// timestamp and a repeat visit reuses its row id. So "new" means newly
// observed: a row id that was not in its blog's previous snapshot.
import type { SiteKey } from '../data/types';
import type { ReadingRow } from './derive';

/** Row ids seen in each blog's last successful snapshot. */
export type Baseline = Map<SiteKey, Set<string>>;

/**
 * The row to follow and the next baseline.
 * - `present`: blogs whose fetch succeeded this poll. A blog that failed keeps
 *   its old ids, so its rows do not all count as new when it comes back; a blog
 *   seen for the first time counts nothing as new either.
 * - First poll (`prev` null): one row only, no burst: the freshest bot, else the
 *   first reader.
 * - Several new rows: a reader first (people reading is the headline), else the
 *   freshest bot. `bots` come newest first, `readers` as the feed gives them.
 */
export function nextFollow(
  prev: Baseline | null,
  readers: ReadingRow[],
  bots: ReadingRow[],
  present: SiteKey[],
): { row: ReadingRow | null; baseline: Baseline } {
  const baseline: Baseline = new Map(prev ?? []);
  for (const site of present) baseline.set(site, new Set([...readers, ...bots].filter((r) => r.site === site).map((r) => r.id)));
  if (!prev) return { row: bots[0] ?? readers[0] ?? null, baseline };
  const isNew = (r: ReadingRow) => present.includes(r.site) && !!prev.get(r.site) && !prev.get(r.site)!.has(r.id);
  return { row: readers.find(isNew) ?? bots.find(isNew) ?? null, baseline };
}
