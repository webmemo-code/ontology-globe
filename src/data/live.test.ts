import { describe, expect, it } from 'vitest';
import { KNOWN_BOTS, botIcon } from './live';

describe('botIcon', () => {
  // #56: every crawler the live layer names has its site icon.
  it('resolves an icon for every known crawler', () => {
    for (const bot of KNOWN_BOTS) expect(botIcon(bot), bot).toMatch(/^bot-icons\/[a-z]+\.(png|svg|ico|jpg|webp)$/);
  });
  it('has none for an unknown crawler', () => {
    expect(botIcon('somebot')).toBeNull();
  });
});
