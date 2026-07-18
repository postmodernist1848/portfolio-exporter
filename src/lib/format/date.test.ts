import { describe, expect, it } from 'vitest';
import { formatMoscowDateTime } from './date';

describe('display date formatting', () => {
  it('renders UTC timestamps explicitly in Moscow time', () => {
    expect(formatMoscowDateTime('2026-07-18T13:00:00.000Z')).toContain('16:00:00');
    expect(formatMoscowDateTime('2026-07-18T13:00:00.000Z')).not.toContain('МСК');
  });
});
