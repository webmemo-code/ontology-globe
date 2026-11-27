import { describe, expect, it } from 'vitest';
import { FADE_S, FLICKER_S, FLOOR, FlashQueue, MAX_ACTIVE, STAGGER_S, envelope } from './agentFlash';

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

describe('FlashQueue (#80)', () => {
  it('flashes each target once, however many agents fetch it', () => {
    const q = new FlashQueue();
    q.add('places/switzerland', 'country', '#4C96F2', 'travelmemo');
    q.add('places/switzerland', 'country', '#8FBEFF', 'reisememo');
    expect(q.flashes.size).toBe(1);
    expect([...q.flashes.get('places/switzerland')!.sites]).toEqual(['travelmemo', 'reisememo']);
  });

  it('staggers starts and keeps at most MAX_ACTIVE flickering', () => {
    const q = new FlashQueue();
    for (let i = 0; i < 7; i++) q.add(`topics/t${i}`, 'topic', '#4C96F2', 'travelmemo');
    const started = (now: number) => [...q.flashes.values()].filter((f) => f.start !== null && f.start <= now).length;
    q.update(0);
    expect(started(0)).toBe(1); // one at a time
    for (let t = STAGGER_S; t < FLICKER_S; t += STAGGER_S) q.update(t);
    const flickering = [...q.flashes.values()].filter((f) => f.start !== null && FLICKER_S - 0.01 - f.start < FLICKER_S).length;
    expect(flickering).toBeLessThanOrEqual(MAX_ACTIVE);
    for (let t = FLICKER_S; t < 10; t += 0.1) q.update(t);
    expect(started(10)).toBe(7); // everyone gets a turn
  });

  it('drops a target once no fetch points at it', () => {
    const q = new FlashQueue();
    q.add('places/italy', 'country', '#4C96F2', 'travelmemo');
    q.add('topics/hiking', 'topic', '#4C96F2', 'travelmemo');
    q.retain(new Set(['topics/hiking']));
    expect([...q.flashes.keys()]).toEqual(['topics/hiking']);
  });
});
