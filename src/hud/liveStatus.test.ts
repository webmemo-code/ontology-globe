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
});
