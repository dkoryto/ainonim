import { analyzeInPage, expect, test } from './fixtures';

test('masks a name and a PESEL number end to end', async ({ testPage }) => {
  const response = await analyzeInPage(testPage, 'Jan Kowalski, PESEL 50810112354');

  if (!response.ok) throw new Error(response.error);
  expect(response.result.anonymized).toBe('<OSOBA_1>, PESEL <PESEL_1>');
  expect(response.result.spans).toEqual([
    expect.objectContaining({ start: 0, end: 12, entity_type: 'PERSON' }),
    expect.objectContaining({ start: 20, end: 31, entity_type: 'PESEL' }),
  ]);
  expect(response.result.mapping).toEqual({
    '<OSOBA_1>': 'Jan Kowalski',
    '<PESEL_1>': '50810112354',
  });
});
