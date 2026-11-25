// The types of the badge's public API (lib/content/ui/badge.ts re-exports them). In their own
// module so the badge's parts can share them without importing badge.ts, which imports them.

import type { Span } from '~/lib/shared/messages';

/** One detected value: its span, the text it covers, the Polish name of its type and the text
 * that "ogólnie" writes for it. */
export interface BadgeItem {
  span: Span;
  original: string;
  label: string;
  general: string;
  /** What the value is replaced with until the user picks otherwise; the token when absent. */
  defaultMode?: MaskMode;
}

/** What a checked value is replaced with: its token or its generalised text. */
export type MaskMode = 'token' | 'general';

export interface MaskChoice {
  span: Span;
  mode: MaskMode;
}

/**
 * `idle`: the field has no text, nothing is shown. `analysing`: the text changed and its analysis
 * is running. `done`: `items` is what the analysis found. `failed`: the analysis did not finish.
 */
export type BadgeStatus = 'idle' | 'analysing' | 'done' | 'failed';

/** `ready`: "Cofnij" restores the text before the last masking. `stale`: the field changed since
 * that masking, so "Cofnij" is shown disabled. `none`: nothing to undo. */
export type RevertState = 'none' | 'ready' | 'stale';

/**
 * A message about sending, from automatic masking: `auto-masked` after it masked `count` values
 * before a send; `send-blocked` when it held a send back because the analysis failed, and a
 * second send within `retryMs` goes through unmasked.
 */
export type BadgeNotice =
  { kind: 'auto-masked'; count: number } | { kind: 'send-blocked'; retryMs: number };

export interface BadgeState {
  status: BadgeStatus;
  items: readonly BadgeItem[];
  revert: RevertState;
  notice?: BadgeNotice | undefined;
}

export interface BadgeOptions {
  /** Mask these values: every occurrence of each checked value, in text order. */
  onMask(choices: MaskChoice[]): void;
  /** Put back the text from before the last masking. */
  onRevert(): void;
  /** Called with the checked spans after every update that lists values and every checkbox change. */
  onSelectionChange?(selected: Span[]): void;
}

export interface Badge {
  /** Show this state. Values the user unchecked or set to "ogólnie" keep that choice. */
  update(state: BadgeState): void;
  /** Open or close the panel (the icon toggles it as well). */
  setOpen(open: boolean): void;
  isOpen(): boolean;
  /**
   * What "Zamaskuj zaznaczone" would mask among `items` (which may be of a newer text than the
   * list shows): values the user unchecked are left out, values set to "ogólnie" keep that.
   */
  choicesFor(items: readonly BadgeItem[]): MaskChoice[];
  /** Remove the icon, the panel and every listener and observer they set up. Safe to call twice. */
  destroy(): void;
}
