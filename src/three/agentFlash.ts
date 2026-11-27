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

/** A country border fades out over this many seconds, to nothing. */
export const BORDER_FADE_S = 2;

/**
 * Border opacity `s` seconds after its flash started (#83): a half cosine from 1
 * down to 0, flat at both ends so it neither lingers at the top nor snaps off at
 * the bottom. No flicker, no floor.
 */
export function borderEnvelope(s: number): number {
  if (s < 0 || s >= BORDER_FADE_S) return 0;
  return 0.5 * (1 + Math.cos(Math.PI * (s / BORDER_FADE_S)));
}

export type FlashKind ='country' | 'topic';

export interface FlashRow {
  id: string;
  key: string;
  kind: FlashKind;
  color: string;
  site: string;
  age: number;
}

export interface Flash {
  key: string;
  kind: FlashKind;
  /** The freshest current fetch, overall and per blog. */
  color: string;
  siteColors: Map<string, string>;
  start: number | null;
  pending: boolean;
}

/** Coalesce new rows by target, then stagger the flashes as slots free up. */
export class FlashQueue {
  readonly flashes = new Map<string, Flash>();
  private previousRows = new Set<string>();
  private lastStart = -Infinity;

  /** Feed membership and colors reflect this snapshot. Animation timing persists independently. */
  sync(rows: FlashRow[]) {
    const current = new Map<string, FlashRow[]>();
    for (const row of rows) {
      const group = current.get(row.key);
      if (group) group.push(row);
      else current.set(row.key, [row]);
    }
    for (const key of this.flashes.keys()) if (!current.has(key)) this.flashes.delete(key);
    for (const [key, group] of current) {
      group.sort((a, b) => a.age - b.age);
      const { kind, color } = group[0];
      const siteColors = new Map<string, string>();
      for (const row of group) if (!siteColors.has(row.site)) siteColors.set(row.site, row.color);
      const pending = group.some((row) => !this.previousRows.has(row.id));
      const flash = this.flashes.get(key);
      if (flash) {
        flash.color = color;
        flash.siteColors = siteColors;
        flash.pending ||= pending;
      } else {
        this.flashes.set(key, { key, kind, color, siteColors, start: null, pending });
      }
    }
    this.previousRows = new Set(rows.map((row) => row.id));
    if (!rows.length) this.lastStart = -Infinity;
  }

  /** Start queued flashes as slots free up; call once per frame with the clock in seconds. */
  update(now: number) {
    const flickering = [...this.flashes.values()].filter((f) => f.start !== null && now - f.start < FLICKER_S).length;
    let free = MAX_ACTIVE - flickering;
    for (const f of this.flashes.values()) {
      if (free <= 0 || now - this.lastStart < STAGGER_S) break;
      if (!f.pending || (f.start !== null && now - f.start < FLICKER_S)) continue;
      f.start = now;
      f.pending = false;
      this.lastStart = now;
      free--;
    }
  }
}
