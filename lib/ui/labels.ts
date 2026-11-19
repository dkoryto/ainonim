// Polish names of polanon's entity types (polanon/policy.py, ENTITY_TYPES), as the badge shows them.

const LABELS: Readonly<Record<string, string>> = {
  PERSON: 'osoba',
  ORG: 'firma',
  LOCATION: 'miejsce',
  PESEL: 'PESEL',
  NIP: 'NIP',
  REGON: 'REGON',
  KRS: 'KRS',
  PL_ID: 'dowód osobisty',
  PL_PASSPORT: 'paszport',
  DRIVING_LICENCE: 'prawo jazdy',
  IBAN: 'IBAN',
  CREDIT_CARD: 'karta płatnicza',
  EMAIL: 'e-mail',
  LINK: 'link do profilu',
  PHONE: 'telefon',
  POSTAL_CODE: 'kod pocztowy',
  SECRET: 'sekret',
  IP_ADDRESS: 'adres IP',
  MAC_ADDRESS: 'adres MAC',
  ADDRESS: 'adres',
  PLATE: 'tablica rejestracyjna',
  VIN: 'VIN',
  DATE: 'data',
  BIRTH_DATE: 'data urodzenia',
  TAX_ID: 'numer podatkowy',
  COMPANY_ID: 'numer rejestrowy firmy',
  BANK_ACCOUNT: 'konto bankowe',
  OTHER: 'inne',
};

/** The Polish label of an entity type; a type this list does not know keeps its raw name. */
export function labelFor(entityType: string): string {
  return (Object.hasOwn(LABELS, entityType) ? LABELS[entityType] : undefined) ?? entityType;
}

/**
 * One line naming what was found, e.g. "osoba ×2, PESEL": most frequent first, ties in label
 * order, the count only when it is above 1. Types with a count below 1 are left out.
 */
export function summarize(byType: Record<string, number>): string {
  return Object.entries(byType)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => ({ label: labelFor(type), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pl'))
    .map(({ label, count }) => (count > 1 ? `${label} ×${String(count)}` : label))
    .join(', ');
}
