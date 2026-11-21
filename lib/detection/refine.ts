// The user's detection settings applied to an engine result in the service worker: spans of the
// switched-off categories are dropped and the user's own words are added, before the mapping is
// stored. Doing it here, and not in the content script, keeps the tokens of dropped values out of
// a conversation's persisted mapping and gives custom words tokens that restore in chat answers.
//
// Never log the text, spans or mapping values.

import type { AnalyzeResult, Mapping, Span } from '~/lib/messages';
import { findTokens } from '~/lib/restore/tokens';
import type { DetectionSettings } from '~/lib/settings';
import { maskSpans } from '~/lib/spans';
import { CUSTOM_ENTITY_TYPE } from '~/lib/ui/labels';
import { type TextRange, compileCustomWords, findCustomMatches } from './custom-words';

/** Token label of custom words: `<SLOWO_1>`. polanon restores it like any token it does not know. */
export const CUSTOM_TOKEN_LABEL = 'SLOWO';

export interface DetectionRules {
  disabled: ReadonlySet<string>;
  /** From compileCustomWords (lib/detection/custom-words.ts). */
  patterns: readonly RegExp[];
}

const CUSTOM_TOKEN = new RegExp(`^<${CUSTOM_TOKEN_LABEL}_(\\d{1,6})>$`);

/**
 * Custom word matches merged into the engine's spans. A match that overlaps engine spans replaces
 * them only when it covers every one of them whole; otherwise the engine's spans stay and the
 * match is dropped. So "Projekt Feniks Jana Kowalskiego" as a custom word wins over the name
 * inside it, while a custom "Kowalski" does not cut into "Jan Kowalski".
 */
export function mergeCustomMatches(
  spans: readonly Span[],
  matches: readonly TextRange[],
): { spans: Span[]; custom: TextRange[] } {
  const custom: TextRange[] = [];
  const replaced = new Set<Span>();
  for (const match of matches) {
    const hit = spans.filter((span) => span.start < match.end && match.start < span.end);
    if (hit.every((span) => match.start <= span.start && span.end <= match.end)) {
      for (const span of hit) replaced.add(span);
      custom.push(match);
    }
  }
  return { spans: spans.filter((span) => !replaced.has(span)), custom };
}

/** Hands out `<SLOWO_n>` tokens: a value seen before (in any letter case) keeps its token. */
function customTokens(mapping: Mapping): (value: string) => string {
  const byValue = new Map<string, string>();
  let highest = 0;
  for (const [token, value] of Object.entries(mapping)) {
    const number = CUSTOM_TOKEN.exec(token)?.[1];
    if (number === undefined) continue;
    highest = Math.max(highest, Number(number));
    // A token typed as text stands for itself there; it reserves the number and nothing else.
    if (value !== token && !byValue.has(value.toLowerCase()))
      byValue.set(value.toLowerCase(), token);
  }
  return (value) => {
    const known = byValue.get(value.toLowerCase());
    if (known !== undefined) return known;
    let token: string;
    do token = `<${CUSTOM_TOKEN_LABEL}_${String(++highest)}>`;
    while (Object.hasOwn(mapping, token));
    byValue.set(value.toLowerCase(), token);
    return token;
  };
}

/** The mapping key of a span's token: `<OSOBA_1>` for `<OSOBA_1:dopełniacz>`. */
const baseOf = (token: string): string => findTokens(token)[0]?.base ?? token;

/**
 * `result` (the engine's analysis of `text`, given the mapping `known`) with `rules` applied:
 * spans, `anonymized` and `mapping` describe the same masking. The mapping keeps `known`, the
 * placeholders the engine reserved, and the tokens of the spans that remain.
 */
export function refineResult(
  text: string,
  known: Mapping,
  result: AnalyzeResult,
  rules: DetectionRules,
): AnalyzeResult {
  // The engine finds values of earlier `<SLOWO_n>` tokens itself and calls them by the label.
  const engineSpans = result.spans.map((span) =>
    span.entity_type === CUSTOM_TOKEN_LABEL ? { ...span, entity_type: CUSTOM_ENTITY_TYPE } : span,
  );
  const kept = engineSpans.filter((span) => !rules.disabled.has(span.entity_type));
  const matches = findCustomMatches(text, rules.patterns);
  if (kept.length === engineSpans.length && matches.length === 0) {
    return { ...result, spans: engineSpans };
  }

  const merged = mergeCustomMatches(kept, matches);
  const tokenFor = customTokens(result.mapping);
  const mapping: Record<string, string> = { ...known };
  for (const [token, value] of Object.entries(result.mapping)) {
    if (value === token) mapping[token] = value;
  }
  for (const span of merged.spans) {
    const base = baseOf(span.token);
    const value = result.mapping[base];
    if (value !== undefined) mapping[base] = value;
  }
  const custom = merged.custom.map((range): Span => {
    const value = text.slice(range.start, range.end);
    const token = tokenFor(value);
    // A known token keeps the spelling it was first stored with.
    if (!Object.hasOwn(mapping, token)) mapping[token] = result.mapping[token] ?? value;
    return { ...range, entity_type: CUSTOM_ENTITY_TYPE, score: 1, token };
  });
  const spans = [...merged.spans, ...custom].sort((a, b) => a.start - b.start);
  return { anonymized: maskSpans(text, spans), spans, mapping };
}

/** The stored settings in the form `refineResult` uses. */
export function detectionRules(settings: DetectionSettings): DetectionRules {
  return {
    disabled: new Set(settings.disabledCategories),
    patterns: compileCustomWords(settings.customWords),
  };
}
