import { describe, expect, it } from 'vitest';
import { AGENT_ROWS, KNOWN_BOTS, botIcon, brandColor, listedFetches, type LiveBot, type LiveBySite } from './live';

describe('listedFetches (#83)', () => {
  const bot = (entity: string, seconds_ago: number, route = 'ontology'): LiveBot =>
    ({ bot: 'gptbot', route, kind: 'entity', entity, seconds_ago, country: 'US' }) as LiveBot;
  const snap = (bots: LiveBot[]) => ({ readers: [], bots }) as unknown as NonNullable<LiveBySite[keyof LiveBySite]>;

  it('lists the newest AGENT_ROWS across blogs, so no older fetch gets a flash', () => {
    const data: LiveBySite = {
      travelmemo: snap(Array.from({ length: 4 }, (_, i) => bot(`places/a${i}`, i * 10 + 5))),
      reisememo: snap(Array.from({ length: 4 }, (_, i) => bot(`places/b${i}`, i * 10 + 7))),
    };
    const rows = listedFetches(data);
    expect(rows).toHaveLength(AGENT_ROWS);
    expect(rows.map((r) => r.bot.seconds_ago)).toEqual([5, 7, 15, 17, 25]);
  });

  it('counts a repeated row once, as the panel does', () => {
    const data: LiveBySite = { travelmemo: snap([bot('places/x', 5), bot('places/x', 9), bot('places/y', 12)]) };
    expect(listedFetches(data).map((r) => r.bot.entity)).toEqual(['places/x', 'places/y']);
  });

  it('is empty without data', () => {
    expect(listedFetches(null)).toEqual([]);
  });
});

describe('botIcon', () => {
  // #56: every crawler the live layer names has its site icon.
  it('resolves an icon for every known crawler', () => {
    for (const bot of KNOWN_BOTS) expect(botIcon(bot), bot).toMatch(/^bot-icons\/[a-z]+\.(png|svg|ico|jpg|webp)$/);
  });
  it('has none for an unknown crawler', () => {
    expect(botIcon('somebot')).toBeNull();
  });
});

describe('brandColor (#83)', () => {
  it('gives every known crawler a hex brand colour', () => {
    for (const bot of KNOWN_BOTS) expect(brandColor(bot), bot).toMatch(/^#[0-9A-F]{6}$/);
  });
  it('shares one colour per operator and has none for an unknown crawler', () => {
    expect(brandColor('gptbot')).toBe(brandColor('chatgpt-user'));
    expect(brandColor('somebot')).toBeNull();
  });
});
