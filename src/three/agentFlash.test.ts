import { describe, expect, it } from 'vitest';
import { BORDER_FADE_S, FADE_S, FLICKER_S, FLOOR, FlashQueue, MAX_ACTIVE, STAGGER_S, borderEnvelope, envelope, flashOnArrival, type FlashRow } from './agentFlash';

describe('envelope (#80)', () => {
  it('flickers, then fades to the floor and stays there', () => {
    expect(envelope(-1)).toBe(0);
    const flicker = Array.from({ length: 12 }, (_, i) => envelope((i / 12) * FLICKER_S));
    expect(Math.min(...flicker)).toBeLessThan(0.5);
    expect(Math.max(...flicker)).toBe(1);
    expect(envelope(FLICKER_S + FADE_S)).toBeCloseTo(FLOOR, 6);
    expect(envelope(60)).toBeCloseTo(FLOOR, 6);
  });

  it('fades in without flicker under reduced motion', () => {
    const values = Array.from({ length: 20 }, (_, i) => envelope(i * 0.05, true));
    values.slice(1).forEach((v, i) => expect(v).toBeGreaterThanOrEqual(values[i]));
    expect(Math.max(...values)).toBeLessThanOrEqual(FLOOR + 1e-9);
  });
});

describe('borderEnvelope (#83)', () => {
  it('fades along a smooth sine from 1 to nothing within two seconds', () => {
    expect(borderEnvelope(-1)).toBe(0);
    expect(borderEnvelope(0)).toBe(1);
    expect(borderEnvelope(BORDER_FADE_S / 2)).toBeCloseTo(0.5, 6);
    expect(borderEnvelope(0.02)).toBeGreaterThan(0.99);
    expect(borderEnvelope(BORDER_FADE_S - 0.02)).toBeLessThan(0.01);
    expect(borderEnvelope(BORDER_FADE_S)).toBe(0);
    expect(borderEnvelope(60)).toBe(0);
    const v = Array.from({ length: 20 }, (_, i) => borderEnvelope((i / 20) * BORDER_FADE_S));
    v.slice(1).forEach((x, i) => expect(x).toBeLessThan(v[i]));
  });
});

describe('flashOnArrival (#85)', () => {
  const FLIGHT_S = 2.4; // the follow flight
  const country = (): FlashQueue => {
    const q = new FlashQueue();
    q.sync([{ id: 'b:reisememo:meta:ontology:places/schwyz', key: 'places/switzerland', kind: 'country', color: '#0081FB', site: 'reisememo', age: 0 }]);
    q.update(0); // the poll's flash starts while the camera is still flying
    return q;
  };

  it('restarts the border when the flight arrives, so it is visible after landing', () => {
    const q = country();
    expect(borderEnvelope(FLIGHT_S - q.flashes.get('places/switzerland')!.start!)).toBe(0); // the bug: gone on landing
    expect(flashOnArrival(q, 'places/switzerland', 'done', FLIGHT_S)).toBe(true);
    const start = q.flashes.get('places/switzerland')!.start!;
    expect(borderEnvelope(FLIGHT_S - start)).toBe(1);
    expect(borderEnvelope(FLIGHT_S + 1 - start)).toBeGreaterThan(0.4);
  });

  it('leaves the queue alone when the flight is cancelled or refused: no late flash', () => {
    for (const result of ['cancelled', 'refused'] as const) {
      const q = country();
      expect(flashOnArrival(q, 'places/switzerland', result, FLIGHT_S)).toBe(false);
      expect(q.flashes.get('places/switzerland')!.start).toBe(0);
    }
  });

  it('does nothing for a target no listed fetch points at', () => {
    const q = country();
    expect(flashOnArrival(q, 'places/italy', 'done', FLIGHT_S)).toBe(false);
    expect(flashOnArrival(q, null, 'done', FLIGHT_S)).toBe(false);
    expect(q.flashes.has('places/italy')).toBe(false);
  });
});

const target = 'topics/hiking';
const row = (id: string, opts: Partial<FlashRow> = {}): FlashRow => ({
  id, key: target, kind: 'topic', color: '#4C96F2', site: 'travelmemo', age: 30, ...opts,
});

describe('FlashQueue (#80)', () => {
  it('coalesces multiple new rows for a target, then reflashes when a new row joins later', () => {
    const q = new FlashQueue();
    q.sync([row('a'), row('b')]);
    q.update(0);
    q.update(30);
    expect(q.flashes.size).toBe(1);
    expect(q.flashes.get(target)!.start).toBe(0);
    q.sync([row('a'), row('b'), row('c')]);
    q.update(31);
    expect(q.flashes.get(target)!.start).toBe(31);
    q.sync([row('a'), row('b'), row('c')]);
    q.update(60);
    expect(q.flashes.get(target)!.start).toBe(31);
  });

  it('staggers target starts and keeps at most MAX_ACTIVE flickering', () => {
    const q = new FlashQueue();
    q.sync(Array.from({ length: 7 }, (_, i) => row(String(i), { key: 'topics/t' + i })));
    const startTimes: number[] = [];
    for (let i = 0; i < 100; i++) {
      const now = i / 10;
      q.update(now);
      const active = [...q.flashes.values()].filter((f) => f.start !== null && now - f.start < FLICKER_S);
      expect(active.length).toBeLessThanOrEqual(MAX_ACTIVE);
      if (active.some((f) => f.start === now)) startTimes.push(now);
    }
    expect(startTimes).toHaveLength(7);
    startTimes.slice(1).forEach((t, i) => expect(t - startTimes[i]).toBeGreaterThanOrEqual(STAGGER_S - 1e-9));
  });

  it('uses current blog and tier colors and removes targets when their last fetch expires', () => {
    const q = new FlashQueue();
    const en = row('en', { age: 4 });
    const de = row('de', { site: 'reisememo', color: '#8FBEFF', age: 8 });
    q.sync([en, de]);
    const flash = q.flashes.get(target)!;
    expect(flash.color).toBe(en.color);
    expect(flash.siteColors.get('reisememo')).toBe(de.color);
    q.update(0);
    q.sync([de]);
    expect(flash.siteColors.has('travelmemo')).toBe(false);
    expect(flash.color).toBe(de.color);
    q.update(30);
    expect(flash.start).toBe(0);
    q.sync([]);
    expect(q.flashes.size).toBe(0);
  });
});
