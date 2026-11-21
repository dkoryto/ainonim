import { describe, expect, it } from 'vitest';
import { generalise } from '~/lib/content/generalise';
import type { Span } from '~/lib/shared/messages';

/** The generalised form of `value`, found as `entity_type` where it stands in `text`. */
function of(text: string, value: string, entity_type: string): string {
  const start = text.indexOf(value);
  if (start < 0) throw new Error(`"${value}" is not in the text`);
  const span: Span = { start, end: start + value.length, entity_type, score: 1, token: '<X_1>' };
  return generalise(span, text);
}

describe('generalise', () => {
  it.each([
    ['12.03.1988', 'DATE'],
    ['1988-03-12', 'DATE'],
    ['12 marca 1988 r.', 'BIRTH_DATE'],
    ['3/4/1988', 'BIRTH_DATE'],
  ])('keeps only the year of the date %s', (date, type) => {
    expect(of(`Urodzony ${date} w Łodzi`, date, type)).toBe('1988 r.');
  });

  it.each(['12.03.88', '12 marca', '20251231'])(
    'gives "[data]" for %s, which has no plain year',
    (date) => {
      expect(of(`Termin: ${date}.`, date, 'DATE')).toBe('[data]');
    },
  );

  it('gives the town that follows an address with its postcode', () => {
    expect(of('ul. Długa 5, 00-950 Warszawa', 'ul. Długa 5', 'ADDRESS')).toBe('Warszawa');
    expect(of('Kwiatowa 8 m. 2 31-155 Kraków, Polska', 'Kwiatowa 8 m. 2', 'ADDRESS')).toBe(
      'Kraków',
    );
    expect(of('al. Grunwaldzka 1, 80-001 Gdańsk Oliwa.', 'al. Grunwaldzka 1', 'ADDRESS')).toBe(
      'Gdańsk Oliwa',
    );
  });

  it('gives "[adres]" when no town follows the address', () => {
    expect(of('Mieszka przy Długiej 5 w Krakowie', 'Długiej 5', 'ADDRESS')).toBe('[adres]');
    expect(of('ul. Długa 5, Jan Kowalski', 'ul. Długa 5', 'ADDRESS')).toBe('[adres]');
    expect(of('ul. Długa 5', 'ul. Długa 5', 'ADDRESS')).toBe('[adres]');
  });

  it.each([
    ['00-950', 'POSTAL_CODE', '[kod pocztowy]'],
    ['Jan Kowalski', 'PERSON', '[osoba]'],
    ['50810112354', 'PESEL', '[PESEL]'],
    ['1234563218', 'NIP', '[NIP]'],
    ['123456785', 'REGON', '[REGON]'],
    ['PL61109010140000071219812874', 'IBAN', '[IBAN]'],
    ['600 700 800', 'PHONE', '[telefon]'],
    ['jan@example.pl', 'EMAIL', '[e-mail]'],
    ['ACME sp. z o.o.', 'ORG', '[firma]'],
  ])('names %s by its type', (value, type, expected) => {
    expect(of(`Dane: ${value}.`, value, type)).toBe(expected);
  });

  it('gives "[dane]" for a type it does not know', () => {
    expect(of('Kod: X-1', 'X-1', 'NEW_TYPE')).toBe('[dane]');
    expect(of('Kod: X-1', 'X-1', 'toString')).toBe('[dane]');
  });
});
