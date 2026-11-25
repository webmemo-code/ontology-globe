import { describe, expect, it } from 'vitest';
import { readerPlace } from './derive';

describe('readerPlace', () => {
  it('writes the country name for readers outside Switzerland', () => {
    expect(readerPlace('DE', '')).toBe('Germany');
    expect(readerPlace('SG', '')).toBe('Singapore');
    expect(readerPlace('us', 'New York')).toBe('New York · United States');
  });
  it('names a city-state once', () => {
    expect(readerPlace('SG', 'Singapore')).toBe('Singapore');
  });
  it('keeps Swiss rows as they are', () => {
    expect(readerPlace('CH', 'Bern')).toBe('Bern · CH');
    expect(readerPlace('CH', '')).toBe('CH');
  });
  it('falls back to the code when it is not a country', () => {
    expect(readerPlace('ZZ', '')).toBe('ZZ');
    expect(readerPlace('', '')).toBe('');
  });
});
