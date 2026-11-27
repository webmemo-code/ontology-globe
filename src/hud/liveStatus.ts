import type { LiveBySite } from '../data/live';

/**
 * What the Live pill says while Live is switched on (#65). Green only when the
 * feed really delivers both blogs with readers; every other state stays
 * visible as a short amber note, so an outage never hides behind green.
 */
export interface LiveStatus {
  tone: 'ok' | 'degraded';
  /** Short, after "Live ·" on the pill. */
  short: string;
  /** Full sentence for the tooltip and screen readers. */
  long: string;
}

const SITE_SHORT = { travelmemo: 'EN', reisememo: 'DE' } as const;
const SITE_NAME = { travelmemo: 'Travelmemo', reisememo: 'Reisememo' } as const;

export function liveStatus(data: LiveBySite | null): LiveStatus {
  if (!data) return { tone: 'degraded', short: 'connecting', long: 'Connecting to the live feed' };
  const sites = Object.keys(data) as (keyof typeof SITE_SHORT)[];
  if (!sites.length) return { tone: 'degraded', short: 'no feed', long: 'The live feed is not answering' };
  const readers = Object.values(data).some((d) => d?.readers_status === 'ok');
  if (!readers) return { tone: 'degraded', short: 'agents only', long: 'Last 30 min: AI agents only, reader data unavailable' };
  if (sites.length === 1)
    return { tone: 'degraded', short: `${SITE_SHORT[sites[0]]} only`, long: `Last 30 min: ${SITE_NAME[sites[0]]} only, the other blog is not answering` };
  return { tone: 'ok', short: '30 min', long: 'Last 30 min, both blogs' };
}
