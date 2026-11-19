import { describe, expect, it } from 'vitest';
import { labelFor, summarize } from '~/lib/ui/labels';

describe('labelFor', () => {
  it('names entity types in Polish', () => {
    expect(labelFor('PERSON')).toBe('osoba');
    expect(labelFor('CREDIT_CARD')).toBe('karta płatnicza');
    expect(labelFor('PESEL')).toBe('PESEL');
  });

  it('falls back to the raw name for an unknown type', () => {
    expect(labelFor('NEW_TYPE')).toBe('NEW_TYPE');
    expect(labelFor('toString')).toBe('toString');
  });
});

describe('summarize', () => {
  it('shows the count only when it is above 1', () => {
    expect(summarize({ PESEL: 1, PERSON: 2 })).toBe('osoba ×2, PESEL');
  });

  it('orders by count, then by label', () => {
    expect(summarize({ PHONE: 1, EMAIL: 3, ADDRESS: 1, IBAN: 3 })).toBe(
      'e-mail ×3, IBAN ×3, adres, telefon',
    );
  });

  it('leaves out types with no values and returns an empty string for none', () => {
    expect(summarize({ PERSON: 0 })).toBe('');
    expect(summarize({})).toBe('');
  });
});
