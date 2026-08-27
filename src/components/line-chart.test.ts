import { describe, expect, it } from 'vitest';
import { chartValueDomain } from './line-chart';

describe('chartValueDomain', () => {
  it('focuses the axis around the observed values instead of zero', () => {
    const [minimum, maximum] = chartValueDomain([899_000, 903_000, 910_000]);

    expect(minimum).toBeGreaterThan(890_000);
    expect(maximum).toBeLessThan(920_000);
  });

  it('adds a stable range when all values are equal', () => {
    expect(chartValueDomain([900_000, 900_000])).toEqual([891_000, 909_000]);
  });
});
