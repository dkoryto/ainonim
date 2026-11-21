// Polish names of polanon's entity types (polanon/policy.py, ENTITY_TYPES), as the panel shows them.

/** The user's own words and patterns (lib/detection/custom-words.ts); polanon has no such type. */
export const CUSTOM_ENTITY_TYPE = 'CUSTOM';

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
  [CUSTOM_ENTITY_TYPE]: 'własne słowo',
};

/** polanon's entity types, the ones a user can switch off in the "Kategorie" tab. */
export const ENGINE_ENTITY_TYPES: readonly string[] = Object.keys(LABELS).filter(
  (entityType) => entityType !== CUSTOM_ENTITY_TYPE,
);

/** Whether `entityType` is one of polanon's types listed here. */
export function hasLabel(entityType: string): boolean {
  return Object.hasOwn(LABELS, entityType);
}

/** The Polish label of an entity type; a type this list does not know keeps its raw name. */
export function labelFor(entityType: string): string {
  return (hasLabel(entityType) ? LABELS[entityType] : undefined) ?? entityType;
}
