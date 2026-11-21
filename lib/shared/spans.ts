// Writing replacements into a text by UTF-16 offsets. Shared by the content script, which masks
// the values the user checked, and the service worker, which rebuilds `anonymized` after the
// user's settings changed the spans (lib/background/refine.ts).

import type { Span } from './messages';

/** One stretch of the text and what is written in its place. */
export interface Replacement {
  start: number;
  end: number;
  text: string;
}

/** `text` with each replacement's stretch replaced by its text. The stretches must not overlap. */
export function replaceAll(text: string, replacements: readonly Replacement[]): string {
  let result = text;
  // From the end backwards, so the offsets of the stretches still to do stay valid.
  for (const { start, end, text: value } of [...replacements].sort((a, b) => b.start - a.start)) {
    result = result.slice(0, start) + value + result.slice(end);
  }
  return result;
}

/** `text` with only `spans` replaced by their tokens. With every span of a result: `anonymized`. */
export function maskSpans(text: string, spans: readonly Span[]): string {
  return replaceAll(
    text,
    spans.map((span) => ({ start: span.start, end: span.end, text: span.token })),
  );
}
