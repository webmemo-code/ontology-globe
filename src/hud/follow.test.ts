import { describe, expect, it } from 'vitest';
import type { SiteKey } from '../data/types';
import type { ReadingRow } from './derive';
import { nextFollow, stillListed, type Baseline } from './follow';

const reader = (site: SiteKey, id: string): ReadingRow => ({ id: `r:${site}:${id}`, kind: 'reader', site, who: id, what: id, pick: id });
const bot = (site: SiteKey, id: string): ReadingRow => ({ id: `b:${site}:${id}`, kind: 'bot', site, who: id, what: id, pick: id });
const BOTH: SiteKey[] = ['travelmemo', 'reisememo'];

describe('nextFollow', () => {
  it('first poll: follows one row only, the freshest bot', () => {
    const { row, baseline } = nextFollow(null, [reader('travelmemo', 'a')], [bot('reisememo', 'x'), bot('travelmemo', 'y')], BOTH);
    expect(row?.id).toBe('b:reisememo:x');
    expect([...baseline.get('travelmemo')!]).toEqual(['r:travelmemo:a', 'b:travelmemo:y']);
  });

  it('first poll without bots: the first reader', () => {
    expect(nextFollow(null, [reader('travelmemo', 'a')], [], BOTH).row?.id).toBe('r:travelmemo:a');
  });

  it('rows already in the previous snapshot never trigger a flight', () => {
    const first = nextFollow(null, [reader('travelmemo', 'a')], [bot('travelmemo', 'x')], BOTH);
    expect(nextFollow(first.baseline, [reader('travelmemo', 'a')], [bot('travelmemo', 'x')], BOTH).row).toBeNull();
  });

  it('prefers a new reader over a fresher new bot', () => {
    const first = nextFollow(null, [], [], BOTH);
    const { row } = nextFollow(first.baseline, [reader('reisememo', 'b')], [bot('travelmemo', 'x')], BOTH);
    expect(row?.id).toBe('r:reisememo:b');
  });

  it('a row that left and came back counts as new again', () => {
    let b: Baseline = nextFollow(null, [reader('travelmemo', 'a')], [], BOTH).baseline;
    b = nextFollow(b, [], [], BOTH).baseline;
    expect(nextFollow(b, [reader('travelmemo', 'a')], [], BOTH).row?.id).toBe('r:travelmemo:a');
  });

  it('a failed fetch keeps that blog baseline, so recovery is no burst', () => {
    const rows = [reader('reisememo', 'a'), reader('reisememo', 'b')];
    const first = nextFollow(null, rows, [], BOTH);
    // reisememo failed: its rows vanish from the lists for one poll
    const failed = nextFollow(first.baseline, [], [], ['travelmemo']);
    expect(failed.row).toBeNull();
    expect(nextFollow(failed.baseline, rows, [], BOTH).row).toBeNull();
  });

  it('a blog seen for the first time counts nothing as new', () => {
    const first = nextFollow(null, [], [], ['travelmemo']);
    expect(nextFollow(first.baseline, [reader('reisememo', 'a')], [], BOTH).row).toBeNull();
  });
});

describe('a row that came in while the camera was busy', () => {
  // Poll 1 brings row a during a drag; poll 2 is unchanged (quiet feed). The
  // baseline already holds a, so only the pending row can still fly (#47 review).
  it('stays retryable after an unchanged poll while it is listed', () => {
    const rows = [reader('travelmemo', 'a')];
    const p1 = nextFollow(nextFollow(null, [], [], BOTH).baseline, rows, [], BOTH);
    expect(p1.row?.id).toBe('r:travelmemo:a');
    const pending = p1.row!.id; // followPair said 'busy'
    const p2 = nextFollow(p1.baseline, rows, [], BOTH);
    expect(p2.row).toBeNull();
    expect(stillListed(pending, rows, [])?.id).toBe('r:travelmemo:a');
  });

  it('is dropped once it leaves the lists', () => {
    expect(stillListed('r:travelmemo:a', [reader('travelmemo', 'b')], [])).toBeNull();
    expect(stillListed(null, [reader('travelmemo', 'b')], [])).toBeNull();
  });
});
