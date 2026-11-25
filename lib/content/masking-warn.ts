// Console warnings of the masking session.
//
// Privacy rule for this file: no text of a field, no span and no mapping value is ever logged.
// Warnings name the failure code and at most an error message checked by safeDetail.

export function warn(what: string, code?: string, detail?: string): void {
  const suffix = code === undefined ? '' : ` (${code}${detail ? `: ${detail}` : ''})`;
  console.warn(`AInonim: ${what}${suffix}`);
}

/**
 * An error message that is safe to log next to the failure code: cut to 200 characters and
 * withheld entirely when it contains any word (3+ letters or digits) of the analysed text, so an
 * engine message that quotes the input never reaches the console.
 */
export function safeDetail(message: string, text: string): string {
  const words = new Set(text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
  const lower = message.toLowerCase();
  for (const word of words) if (lower.includes(word)) return '[szczegóły ukryte]';
  return message.length > 200 ? `${message.slice(0, 200)}…` : message;
}
