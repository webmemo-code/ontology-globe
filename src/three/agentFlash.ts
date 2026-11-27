// A new AI agent fetch flashes what it retrieves (#80). From outside the globe
// the entity is out of sight, so its country's border (places) or its cylinder
// (topics) flickers in the agent's colour, then fades to a faint glow that
// stays while the agent is in the feed. Pure timing and queueing here; the
// drawing lives in GraphScene.

/** Seconds of flicker, then of fade down to the floor. */
export const FLICKER_S = 1.2;
export const FADE_S = 1.5;
/** What stays visible while the agent is still around. */
export const FLOOR = 0.15;
/** Flashes at once; more wait their turn. */
export const MAX_ACTIVE = 4;
/** Seconds between two starts, so a batch (e.g. on load) flashes one after another. */
export const STAGGER_S = 0.4;

// The HUD's flick (index.css @keyframes flick): opacity steps at these fractions.
const STEPS: [number, number][] = [[0, 0.2], [0.2, 1], [0.35, 0.45], [0.55, 1], [0.7, 0.75], [1, 1]];

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Opacity factor `s` seconds after a flash started (negative: not yet). Reduced motion: a plain fade-in to the floor. */
export function envelope(s: number, reduced = false): number {
  if (s < 0) return 0;
  if (reduced) return FLOOR * smoothstep(0, 0.6, s);
  if (s < FLICKER_S) {
    const f = s / FLICKER_S;
    let v = STEPS[0][1];
    for (const [at, o] of STEPS) if (f >= at) v = o;
    return v;
  }
  return 1 - (1 - FLOOR) * smoothstep(0, FADE_S, s - FLICKER_S);
}

export type FlashKind = 'country' | 'topic';

export interface Flash {
  /** Country or topic node key: one flash per target, however many agents fetch it. */
  key: string;
  kind: FlashKind;
  color: string;
  /** Blogs whose agents fetched it, for the blog switch. */
  sites: Set<string>;
  /** When it started flashing (seconds), or null while queued. */
  start: number | null;
}

/** One flash per target; at most MAX_ACTIVE flickering at a time, starts STAGGER_S apart. */
export class FlashQueue {
  readonly flashes = new Map<string, Flash>();
  private lastStart = -Infinity;

  /** A new fetch of `key`: queue its flash unless it is already showing. */
  add(key: string, kind: FlashKind, color: string, site: string) {
    const have = this.flashes.get(key);
    if (have) return void have.sites.add(site);
    this.flashes.set(key, { key, kind, color, sites: new Set([site]), start: null });
  }

  /** Keep only targets some current fetch still points at. */
  retain(keys: Set<string>) {
    for (const k of this.flashes.keys()) if (!keys.has(k)) this.flashes.delete(k);
  }

  /** Start queued flashes as slots free up; call once per frame with the clock in seconds. */
  update(now: number) {
    const flickering = [...this.flashes.values()].filter((f) => f.start !== null && now - f.start < FLICKER_S).length;
    let free = MAX_ACTIVE - flickering;
    for (const f of this.flashes.values()) {
      if (free <= 0 || now - this.lastStart < STAGGER_S) break;
      if (f.start !== null) continue;
      f.start = now;
      this.lastStart = now;
      free--;
    }
  }
}
