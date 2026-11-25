import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeDetail, warn } from '~/lib/content/masking-warn';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('warn', () => {
  it('names what failed, with the code and the detail when given', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    warn('masking failed');
    warn('masking failed', 'timeout');
    warn('masking failed', 'engine', 'out of memory');
    expect(spy.mock.calls).toEqual([
      ['AInonim: masking failed'],
      ['AInonim: masking failed (timeout)'],
      ['AInonim: masking failed (engine: out of memory)'],
    ]);
  });
});

describe('safeDetail', () => {
  it('withholds a message that quotes a word of the text and cuts a long one', () => {
    expect(safeDetail('bad value Kowalski', 'Jan Kowalski')).toBe('[szczegóły ukryte]');
    expect(safeDetail('x'.repeat(250), 'Jan')).toBe(`${'x'.repeat(200)}…`);
    expect(safeDetail('engine crashed', '')).toBe('engine crashed');
  });
});
