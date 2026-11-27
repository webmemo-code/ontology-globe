import type { LiveBySite } from '../data/live';

/**
 * What the Live pill says while Live is switched on (#65). Green only when the
 * feed really delivers both blogs with healthy reader data; every other state
 * stays visible as a short amber note, so an outage never hides behind green.
 */
export interface LiveStatus {
  tone: 'ok' | 'degraded';
  /** Short note after "Live visitors ·" on the pill while degraded. */
  short: string;
  /** On a phone, the whole label: "Live visitors" when healthy, else a cue of at most 7 characters. */
  tiny: string;
  /** Full sentence for the tooltip and screen readers. */
  long: string;
}

const SITE_SHORT = { travelmemo: 'EN', reisememo: 'DE' } as const;
const SITE_NAME = { travelmemo: 'Travelmemo', reisememo: 'Reisememo' } as const;
type Site = keyof typeof SITE_SHORT;

export function liveStatus(data: LiveBySite | null): LiveStatus {
  if (!data) return { tone: 'degraded', short: 'connecting', tiny: 'Loading', long: 'Connecting to the live feed' };
  const sites = Object.keys(data) as Site[];
  if (!sites.length) return { tone: 'degraded', short: 'no feed', tiny: 'No feed', long: 'The live feed is not answering' };
  const readers = sites.filter((s) => data[s]?.readers_status === 'ok');
  if (!readers.length) return { tone: 'degraded', short: 'agents only', tiny: 'Agents', long: 'Last 30 min: AI agents only, reader data unavailable' };
  if (sites.length === 1) {
    const s = sites[0];
    return { tone: 'degraded', short: `${SITE_SHORT[s]} only`, tiny: `${SITE_SHORT[s]} only`, long: `Last 30 min: ${SITE_NAME[s]} only, the other blog is not answering` };
  }
  if (readers.length === 1) {
    // Both blogs answer, but only one has reader data (#73 review): agents still come from both.
    const s = readers[0];
    return {
      tone: 'degraded',
      short: `${SITE_SHORT[s]} readers`,
      tiny: 'Partial',
      long: `Last 30 min: readers from ${SITE_NAME[s]} only; AI agents from both blogs`,
    };
  }
  return { tone: 'ok', short: '30 min', tiny: 'Live visitors', long: 'Last 30 min, both blogs' };
}
