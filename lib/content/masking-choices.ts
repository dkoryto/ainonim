// What masking writes: the panel's rows for an analysis, the values it would mask, and the text
// with those values replaced. Pure functions of the analysis.

import { generalise } from '~/lib/content/generalise';
import type { Badge, BadgeItem, MaskChoice, MaskMode } from '~/lib/content/ui/badge';
import { labelFor } from '~/lib/shared/labels';
import type { AnalyzeResult, Span } from '~/lib/shared/messages';
import { replaceAll } from '~/lib/shared/spans';

/** `text` with each chosen span replaced by its token or by its generalised text. */
export function applyChoices(text: string, choices: readonly MaskChoice[]): string {
  return replaceAll(
    text,
    choices.map(({ span, mode }) => ({
      start: span.start,
      end: span.end,
      text: mode === 'general' ? generalise(span, text) : span.token,
    })),
  );
}

/** The panel's rows for the analysis `result` of `text`. */
export function itemsOf(
  text: string,
  result: AnalyzeResult,
  defaultMode?: (entityType: string) => MaskMode,
): BadgeItem[] {
  return result.spans.map((span) => ({
    span,
    original: text.slice(span.start, span.end),
    label: labelFor(span.entity_type),
    general: generalise(span, text),
    defaultMode: defaultMode?.(span.entity_type) ?? 'token',
  }));
}

/** What the panel would mask of `items`: its choices, or every value as a token without a panel. */
export function choicesFor(badge: Badge | null, items: readonly BadgeItem[]): MaskChoice[] {
  return badge
    ? badge.choicesFor(items)
    : items.map(({ span, defaultMode }) => ({ span, mode: defaultMode ?? 'token' }));
}

const sameSpan = (a: Span, b: Span): boolean =>
  a.start === b.start && a.end === b.end && a.entity_type === b.entity_type;

/**
 * `choices` made on the spans of one analysis, moved to the same values in `spans` of another
 * analysis of the same text, so they carry that analysis's tokens. Generalised values need no
 * token and stay; a token choice whose value the other analysis did not find is dropped.
 */
export function moveChoices(
  choices: readonly MaskChoice[],
  spans: readonly Span[],
): readonly MaskChoice[] {
  return choices.flatMap((choice) => {
    if (choice.mode === 'general') return [choice];
    const span = spans.find((found) => sameSpan(choice.span, found));
    return span ? [{ span, mode: choice.mode }] : [];
  });
}
