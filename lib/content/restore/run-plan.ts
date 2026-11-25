// Planning what to write over a run of adjacent text nodes: pure functions, no DOM writes. The
// run is read as one string so that a token split across nodes ("<OSO" + "BA_1>") is found.

import { type Decline, type Mapping, findTokens, resolveToken } from '~/lib/shared/tokens';
import type { RestoredValue } from './marks';

/** A value shown in a text node: the original (restore) or its token (peek), with its offsets. */
export type Shown = RestoredValue & { start: number; end: number };

/** What one text node of a run should hold, and the values shown in it. */
export interface NodePlan {
  text: string;
  values: Shown[];
}

/** The tokens of `text` that `mapping` knows, with their originals and offsets. */
export function resolvedTokens(text: string, mapping: Mapping, decline?: Decline): Shown[] {
  return findTokens(text).flatMap((found) => {
    const value = resolveToken(found, mapping, decline);
    return value === undefined
      ? []
      : [{ token: found.token, value, start: found.start, end: found.end }];
  });
}

/** With `peek` the tokens stay; only the part of each inside the node `[start, end)` is marked. */
function peekNode(replacements: readonly Shown[], start: number, end: number): Shown[] {
  return replacements
    .filter((r) => r.end > start && r.start < end)
    .map(({ token, value, ...at }) => ({
      token,
      value,
      start: Math.max(at.start, start) - start,
      end: Math.min(at.end, end) - start,
    }));
}

/**
 * The node `[start, end)` of `full` with originals in place of tokens. The original goes where
 * the token starts; the token's tail in later nodes is dropped.
 */
function restoreNode(
  full: string,
  replacements: readonly Shown[],
  start: number,
  end: number,
): NodePlan {
  let text = '';
  let position = start;
  const values: Shown[] = [];
  for (const { token, value, ...at } of replacements) {
    if (at.end <= start || at.start >= end) continue;
    text += full.slice(position, Math.max(at.start, start));
    if (at.start >= start) {
      values.push({ token, value, start: text.length, end: text.length + value.length });
      text += value;
    }
    position = Math.min(at.end, end);
  }
  return { text: text + full.slice(position, end), values };
}

/**
 * One plan per node of the run whose current texts are `sources`: the originals written in
 * place of the tokens of `replacements` (offsets in the joined text), or with `peek` the same
 * text with the tokens marked.
 */
export function planRun(
  sources: readonly string[],
  replacements: readonly Shown[],
  peek: boolean,
): NodePlan[] {
  const full = sources.join('');
  let start = 0;
  return sources.map((source) => {
    const end = start + source.length;
    const plan = peek
      ? { text: source, values: peekNode(replacements, start, end) }
      : restoreNode(full, replacements, start, end);
    start = end;
    return plan;
  });
}
