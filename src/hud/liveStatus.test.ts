import { describe, expect, it } from 'vitest';
import type { LiveBySite, LiveSnapshot } from '../data/live';
import { liveStatus } from './liveStatus';

const snap = (readers: LiveSnapshot['readers_status']) => ({ readers_status: readers }) as LiveSnapshot;

describe('liveStatus (#65)', () => {
  it('is green only with both blogs and readers', () => {
    expect(liveStatus({ travelmemo: snap('ok'), reisememo: snap('ok') })).toMatchObject({ tone: 'ok', short: '30 min' });
  });

  it('keeps every degraded feed visible', () => {
    expect(liveStatus(null)).toMatchObject({ tone: 'degraded', short: 'connecting' });
    expect(liveStatus({} as LiveBySite)).toMatchObject({ tone: 'degraded', short: 'no feed' });
    expect(liveStatus({ reisememo: snap('ok') })).toMatchObject({ tone: 'degraded', short: 'DE only' });
    expect(liveStatus({ travelmemo: snap('error'), reisememo: snap('not-configured') })).toMatchObject({ tone: 'degraded', short: 'agents only' });
  });

  it('reports a reader outage on one blog even when both blogs answer (#73 review)', () => {
    expect(liveStatus({ travelmemo: snap('ok'), reisememo: snap('error') })).toMatchObject({ tone: 'degraded', short: 'EN readers', tiny: 'Partial' });
  });

  it('keeps every phone cue as short as "Offline"', () => {
    const fixtures: (LiveBySite | null)[] = [null, {}, { reisememo: snap('ok') }, { travelmemo: snap('error') }, { travelmemo: snap('ok'), reisememo: snap('error') }, { travelmemo: snap('ok'), reisememo: snap('ok') }];
    for (const f of fixtures) expect(liveStatus(f).tiny.length).toBeLessThanOrEqual('Offline'.length);
  });
});
