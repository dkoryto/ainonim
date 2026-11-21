// A value's generalised form: what the panel writes for a row set to "ogólnie" instead of its
// token. It keeps a little of the meaning (the year of a date, the town of an address) and drops
// the rest. Generalised text is not a token, so it is never stored in a mapping nor restored.

import type { Span } from '~/lib/shared/messages';
import { hasLabel, labelFor } from '~/lib/shared/labels';

/** A year a date in a text can plausibly have: 1000..2999. */
const YEAR = /(?<!\d)([12]\d{3})(?!\d)/;

/**
 * A town named right after an address: ", 00-950 Warszawa", " 31-155 Kraków", ", 80-001 Gdańsk
 * Oliwa". polanon's ADDRESS covers the street and the house number only; the postcode and the town
 * follow it. The postcode is what marks the next words as a town, so a sentence that goes on after
 * the number ("Długa 5, Jan Kowalski") gives none.
 */
const TOWN_AFTER = /^[ \t]*,?[ \t]*\d{2}-\d{3}[ \t]+(\p{Lu}[\p{L}-]*(?:[ \t]+\p{Lu}[\p{L}-]*)?)/u;

function generaliseDate(original: string): string {
  const year = YEAR.exec(original)?.[1];
  return year === undefined ? '[data]' : `${year} r.`;
}

function generaliseAddress(span: Span, text: string): string {
  const town = TOWN_AFTER.exec(text.slice(span.end))?.[1];
  return town ?? '[adres]';
}

/** The generalised form of the value `span` covers in `text` (the text the span was found in). */
export function generalise(span: Span, text: string): string {
  switch (span.entity_type) {
    case 'DATE':
    case 'BIRTH_DATE':
      return generaliseDate(text.slice(span.start, span.end));
    case 'ADDRESS':
      return generaliseAddress(span, text);
    default:
      return hasLabel(span.entity_type) ? `[${labelFor(span.entity_type)}]` : '[dane]';
  }
}
