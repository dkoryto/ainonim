// The masking session's state of each watched field, and how it is shown in the field's badge.
//
// Privacy rule for this file: nothing of the text is logged.

import { type EditableField, readText } from '~/lib/content/fields/text';
import {
  type Badge,
  type BadgeItem,
  type BadgeNotice,
  type BadgeStatus,
  type MaskChoice,
  type RevertState,
  createBadge,
} from '~/lib/content/ui/badge';
import { clearSpans, paintSpans } from '~/lib/content/ui/highlight';
import type { AnalyzeResult } from '~/lib/shared/messages';
import type { MaskingOptions } from './masking';
import { itemsOf } from './masking-choices';
import type { TypingMasker } from './typing-mask';

export interface FieldState {
  badge: Badge | null;
  /** Bumped on every new text, so an answer for an older text is dropped. */
  generation: number;
  preview: { text: string; result: AnalyzeResult } | null;
  status: BadgeStatus;
  items: BadgeItem[];
  /**
   * For "Cofnij": the text before the last masking with its analysis, and the text it wrote.
   * Undoing puts that analysis back, so the panel lists the values again at once.
   */
  lastMask: { before: string; result: AnalyzeResult; after: string } | null;
  /** A masking or an undo is writing into the field. */
  busy: boolean;
  /** Shown at the field while it holds `forText` (a send held back, or masked automatically). */
  notice: { value: BadgeNotice; forText: string } | null;
}

/** What the session's steps share: its options, its fields and how to show a field's state. */
export interface MaskingContext {
  readonly options: MaskingOptions;
  readonly fields: Map<EditableField, FieldState>;
  /** Set once at the start, when masking mode `typing` is offered. */
  typing: TypingMasker | null;
  /** A function, so checks after an `await` read the current value. */
  isStopped: () => boolean;
  render: (field: EditableField, state: FieldState) => void;
}

/** How long after DOM removals the fields are checked for having left the page. */
const SWEEP_DELAY_MS = 200;

/** The state of `field`, created on first use. */
export function stateOf(fields: Map<EditableField, FieldState>, field: EditableField): FieldState {
  let state = fields.get(field);
  if (!state) {
    state = {
      badge: null,
      generation: 0,
      preview: null,
      status: 'idle',
      items: [],
      lastMask: null,
      busy: false,
      notice: null,
    };
    fields.set(field, state);
  }
  return state;
}

/** The field holds `text`, analysed as `result`: the panel lists what was found. */
export function showResult(
  ctx: MaskingContext,
  state: FieldState,
  text: string,
  result: AnalyzeResult,
): void {
  state.preview = { text, result };
  state.status = 'done';
  state.items = itemsOf(text, result, ctx.options.defaultMode);
}

/** Forget the analysis of the field's previous text; the next one is on its way (or not). */
export function invalidate(field: EditableField, state: FieldState, status: BadgeStatus): void {
  state.generation++;
  state.preview = null;
  state.status = status;
  state.items = [];
  clearSpans(field);
}

function revertStateOf(field: EditableField, state: FieldState): RevertState {
  if (!state.lastMask) return 'none';
  return readText(field) === state.lastMask.after ? 'ready' : 'stale';
}

/** Show the field's state in its badge, creating the badge for a field that has some text. */
export function renderField(
  field: EditableField,
  state: FieldState,
  actions: { mask: (choices: readonly MaskChoice[]) => void; revert: () => void },
): void {
  if (!state.badge && state.status === 'idle') return;
  state.badge ??= createBadge(field, {
    onMask: actions.mask,
    onRevert: actions.revert,
    onSelectionChange: (selected) => {
      // Only while the spans still belong to the field's text (see lib/content/ui/highlight.ts).
      if (state.preview?.text === readText(field)) paintSpans(field, selected);
    },
  });
  if (state.notice && readText(field) !== state.notice.forText) state.notice = null;
  state.badge.update({
    status: state.status,
    items: state.items,
    revert: revertStateOf(field, state),
    notice: state.notice?.value,
  });
}

/** Remove the field's badge and highlights; an answer still on its way is dropped. */
export function forgetField(fields: Map<EditableField, FieldState>, field: EditableField): void {
  const state = fields.get(field);
  if (!state) return;
  state.generation++;
  state.badge?.destroy();
  clearSpans(field);
  fields.delete(field);
}

/**
 * Forget the fields that left the page, checked a little after DOM removals, so a burst of
 * removals costs one pass. Returns a function that stops watching.
 */
export function sweepRemovedFields(
  doc: Document,
  fields: Map<EditableField, FieldState>,
): () => void {
  let sweepTimer: ReturnType<typeof setTimeout> | undefined;
  const sweep = (): void => {
    sweepTimer = undefined;
    for (const field of [...fields.keys()]) if (!field.isConnected) forgetField(fields, field);
  };
  const removals = new MutationObserver((records) => {
    if (sweepTimer !== undefined || fields.size === 0) return;
    if (records.some((record) => record.removedNodes.length > 0)) {
      sweepTimer = setTimeout(sweep, SWEEP_DELAY_MS);
    }
  });
  removals.observe(doc, { childList: true, subtree: true });
  return () => {
    removals.disconnect();
    clearTimeout(sweepTimer);
  };
}
