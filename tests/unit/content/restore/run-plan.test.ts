import { describe, expect, it } from 'vitest';
import { planRun, resolvedTokens } from '~/lib/content/restore/run-plan';

const mapping = { '<OSOBA_1>': 'Jan Kowalski' };

/** Plans for a run of nodes holding `sources`, with the tokens resolved from their joined text. */
function plan(sources: string[], peek = false) {
  return planRun(sources, resolvedTokens(sources.join(''), mapping), peek);
}

describe('resolvedTokens', () => {
  it('lists known tokens with their originals and offsets, skipping unknown ones', () => {
    expect(resolvedTokens('Hej <OSOBA_1> i <OSOBA_2>', mapping)).toEqual([
      { token: '<OSOBA_1>', value: 'Jan Kowalski', start: 4, end: 13 },
    ]);
  });
});

describe('planRun', () => {
  it('writes the original in place of a token and marks it', () => {
    expect(plan(['Hej <OSOBA_1>!'])).toEqual([
      {
        text: 'Hej Jan Kowalski!',
        values: [{ token: '<OSOBA_1>', value: 'Jan Kowalski', start: 4, end: 16 }],
      },
    ]);
  });

  it('puts a split token whole into the node where it starts and drops its tail', () => {
    expect(plan(['a <OSO', 'BA_1> b'])).toEqual([
      {
        text: 'a Jan Kowalski',
        values: [{ token: '<OSOBA_1>', value: 'Jan Kowalski', start: 2, end: 14 }],
      },
      { text: ' b', values: [] },
    ]);
  });

  it('with peek keeps the text and marks the part of the token in each node', () => {
    expect(plan(['a <OSO', 'BA_1> b'], true)).toEqual([
      { text: 'a <OSO', values: [{ token: '<OSOBA_1>', value: 'Jan Kowalski', start: 2, end: 6 }] },
      {
        text: 'BA_1> b',
        values: [{ token: '<OSOBA_1>', value: 'Jan Kowalski', start: 0, end: 5 }],
      },
    ]);
  });

  it('leaves a node without tokens as it is', () => {
    expect(plan(['bez danych', '<OSOBA_1>'])[0]).toEqual({ text: 'bez danych', values: [] });
  });
});
