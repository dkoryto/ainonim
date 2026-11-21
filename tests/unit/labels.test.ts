import { describe, expect, it } from 'vitest';
import { labelFor } from '~/lib/ui/labels';

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
