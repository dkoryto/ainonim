import { describe, expect, it, vi } from 'vitest';
import { createDeclensionCache, findTokens, restoreTokens } from '~/lib/shared/tokens';

const mapping = {
  '<OSOBA_1>': 'Jan Kowalski',
  '<OSOBA_12>': 'Anna Nowak',
  '<PESEL_1>': '50810112354',
  '<NR_DOWODU_1>': 'ABC123456',
};

describe('findTokens', () => {
  it('finds plain and cased tokens with their offsets', () => {
    const text = 'Do <OSOBA_1>, witaj <OSOBA_1:wołacz>!';
    expect(findTokens(text)).toEqual([
      {
        token: '<OSOBA_1>',
        base: '<OSOBA_1>',
        label: 'OSOBA',
        index: 1,
        grammaticalCase: undefined,
        start: 3,
        end: 12,
      },
      {
        token: '<OSOBA_1:wołacz>',
        base: '<OSOBA_1>',
        label: 'OSOBA',
        index: 1,
        grammaticalCase: 'wołacz',
        start: 20,
        end: 36,
      },
    ]);
  });

  it('reads labels with underscores', () => {
    expect(findTokens('<NR_DOWODU_3>').map((found) => [found.label, found.index])).toEqual([
      ['NR_DOWODU', 3],
    ]);
  });

  it('ignores text that only looks similar', () => {
    expect(findTokens('<osoba_1> <OSOBA> <OSOBA_> [OSOBA_1] <OSOBA_1:>')).toEqual([]);
  });
});

describe('restoreTokens', () => {
  it('replaces known tokens', () => {
    expect(restoreTokens('<OSOBA_1>, PESEL <PESEL_1>, dowód <NR_DOWODU_1>', mapping)).toBe(
      'Jan Kowalski, PESEL 50810112354, dowód ABC123456',
    );
  });

  it('prefers the longest token: <OSOBA_12> is not <OSOBA_1> followed by "2"', () => {
    expect(restoreTokens('<OSOBA_12> i <OSOBA_1>', mapping)).toBe('Anna Nowak i Jan Kowalski');
  });

  it('leaves unknown tokens as written', () => {
    expect(restoreTokens('<OSOBA_7> i <OSOBA_1>', mapping)).toBe('<OSOBA_7> i Jan Kowalski');
  });

  it('declines cased tokens with the injected function', () => {
    const decline = vi.fn((token: string, original: string) =>
      token === '<OSOBA_1:wołacz>' && original === 'Jan Kowalski' ? 'Janie Kowalski' : undefined,
    );
    expect(restoreTokens('Witaj, <OSOBA_1:wołacz>!', mapping, decline)).toBe(
      'Witaj, Janie Kowalski!',
    );
    expect(decline).toHaveBeenCalledWith('<OSOBA_1:wołacz>', 'Jan Kowalski');
  });

  it('leaves a cased token as written without a declension', () => {
    expect(restoreTokens('Witaj, <OSOBA_1:wołacz>!', mapping)).toBe('Witaj, <OSOBA_1:wołacz>!');
    expect(restoreTokens('<OSOBA_1:wołacz>', mapping, () => undefined)).toBe('<OSOBA_1:wołacz>');
  });

  it('does not ask for a declension of a token whose base form is unknown', () => {
    const decline = vi.fn(() => 'Janie Kowalski');
    expect(restoreTokens('<OSOBA_7:wołacz>', mapping, decline)).toBe('<OSOBA_7:wołacz>');
    expect(decline).not.toHaveBeenCalled();
  });

  it('uses an exact mapping entry for a cased token', () => {
    expect(restoreTokens('<OSOBA_1:wołacz>', { '<OSOBA_1:wołacz>': 'Janie' })).toBe('Janie');
  });

  it('restores a token only once it is complete', () => {
    const first = 'Dzień dobry <OSO';
    expect(restoreTokens(first, mapping)).toBe(first);
    expect(restoreTokens(`${first}BA_1>!`, mapping)).toBe('Dzień dobry Jan Kowalski!');
  });
});

describe('createDeclensionCache', () => {
  it('requests a declension once and notifies when it arrives', async () => {
    const request = vi.fn(() => Promise.resolve('Janie Kowalski'));
    const cache = createDeclensionCache(request);
    const listener = vi.fn();
    cache.onChange(listener);

    expect(cache.decline('<OSOBA_1:wołacz>', 'Jan Kowalski')).toBeUndefined();
    expect(cache.decline('<OSOBA_1:wołacz>', 'Jan Kowalski')).toBeUndefined();
    await Promise.resolve();

    expect(request).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(cache.decline('<OSOBA_1:wołacz>', 'Jan Kowalski')).toBe('Janie Kowalski');
  });

  it('falls back to the base form when the request fails', async () => {
    const cache = createDeclensionCache(() => Promise.reject(new Error('bridge down')));
    cache.decline('<OSOBA_1:wołacz>', 'Jan Kowalski');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cache.decline('<OSOBA_1:wołacz>', 'Jan Kowalski')).toBe('Jan Kowalski');
  });

  it('falls back to the base form when no declension comes back', async () => {
    const cache = createDeclensionCache(() => Promise.resolve(undefined));
    cache.decline('<OSOBA_1:wołacz>', 'Jan Kowalski');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cache.decline('<OSOBA_1:wołacz>', 'Jan Kowalski')).toBe('Jan Kowalski');
  });

  it('stops notifying after unsubscribe', async () => {
    const cache = createDeclensionCache(() => Promise.resolve('Janie'));
    const listener = vi.fn();
    cache.onChange(listener)();
    cache.decline('<OSOBA_1:wołacz>', 'Jan');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(listener).not.toHaveBeenCalled();
  });
});
