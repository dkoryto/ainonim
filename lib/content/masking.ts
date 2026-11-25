// Analyses what the user types, lists what was found in a panel, masks the values the user
// checked there (with their token or a generalised text) and undoes the last masking on request.
// The steps live in sibling modules: masking-analyse.ts (previews), masking-write.ts (masking and
// "Cofnij"), masking-field.ts (each field's state and badge); this file wires them to the page.
//
// Privacy rule for these files: no text of a field, no span and no mapping value is ever logged.
// Warnings name the failure code and at most an error message checked by safeDetail.

import { type EditableField, readText } from '~/lib/content/fields/text';
import { watchFields } from '~/lib/content/fields/watch';
import type { MaskingReport } from '~/lib/shared/log-entries';
import type { AnalyzeResponse } from '~/lib/shared/messages';
import type { MaskMode } from '~/lib/content/ui/badge';
import { previewText } from './masking-analyse';
import { itemsOf } from './masking-choices';
import {
  type FieldState,
  type MaskingContext,
  forgetField,
  invalidate,
  renderField,
  stateOf,
  sweepRemovedFields,
} from './masking-field';
import { canSendAsIs, maskChecked, maskForSend, maskTyped, revertMask } from './masking-write';
import { startTypingMask } from './typing-mask';

export { maskSpans } from '~/lib/shared/spans';
export { applyChoices } from './masking-choices';
export { safeDetail } from './masking-warn';

export interface MaskingOptions {
  /**
   * Analyse `text`. `persist` is true when the result is about to be written into the field, so
   * a chat conversation stores its new tokens; previews while typing pass false.
   */
  analyze: (text: string, persist: boolean) => Promise<AnalyzeResponse>;
  /**
   * Whether "Zamaskuj" may write the preview's result when the text did not change. On chat sites
   * it may not: the preview did not store its tokens, so masking analyses again with `persist`.
   */
  reusePreview: boolean;
  /** Fields to leave alone besides passwords and the like (e.g. editors inside chat answers). */
  exclude?: (field: EditableField) => boolean;
  /** Pause after the last keystroke before analysing. */
  debounceMs?: number;
  /** Called after each masking that was written into a field, with its counts (for the log). */
  onMasked?: (report: MaskingReport) => void;
  /** What a value of this type is replaced with unless the panel says otherwise; else its token. */
  defaultMode?: (entityType: string) => MaskMode;
  /** Mask on its own once the user pauses typing, while `isActive()` (masking mode `typing`). */
  typing?: { isActive: () => boolean; pauseMs?: number };
}

/** What automatic masking did before a send (see `MaskingSession.maskForSend`). */
export type SendOutcome =
  | { kind: 'clean' }
  | { kind: 'masked'; count: number }
  | { kind: 'failed'; reason: 'analysis' | 'timeout' | 'write' };

export interface MaskingSession {
  /** Remove every trace from the page. Safe to call twice. */
  stop: () => void;
  /**
   * True when the field's text can be sent as it is without waiting: it is empty, or its current
   * analysis found nothing that the panel's choices would mask.
   */
  canSendAsIs(field: EditableField): boolean;
  /**
   * Mask what the field's text holds before it is sent: every value the panel has checked (all of
   * them if the panel was never touched), each as the panel says (token or "ogólnie"). Waits for
   * an analysis of the current text for at most `timeoutMs`. Writes like "Zamaskuj zaznaczone"
   * does, so "Cofnij" works afterwards, and shows the count on the field's icon.
   */
  maskForSend(field: EditableField, timeoutMs: number): Promise<SendOutcome>;
  /** Tell at the field that a send was held back; another send within `retryMs` goes as is. */
  showSendBlocked(field: EditableField, retryMs: number): void;
  /** The category defaults changed: list the values found so far with the new ones. */
  refreshDefaults(): void;
}

/** Start watching the page's fields. */
export function startMasking(options: MaskingOptions): MaskingSession {
  const fields = new Map<EditableField, FieldState>();
  let stopped = false;

  const ctx: MaskingContext = {
    options,
    fields,
    typing: null,
    isStopped: () => stopped,
    render: (field, state) => {
      renderField(field, state, {
        mask: (choices) => {
          void maskChecked(ctx, field, choices);
        },
        revert: () => {
          void revertMask(ctx, field);
        },
      });
    },
  };

  if (options.typing) {
    ctx.typing = startTypingMask({
      doc: document,
      isActive: options.typing.isActive,
      pauseMs: options.typing.pauseMs,
      mask: (field, text) => maskTyped(ctx, field, text),
    });
  }

  const stopSweeping = sweepRemovedFields(document, fields);

  const stopWatching = watchFields({
    onText: (field, text) => {
      void previewText(ctx, field, text);
    },
    onTooLong: (field) => {
      const state = stateOf(fields, field);
      invalidate(field, state, 'idle');
      ctx.render(field, state);
    },
    exclude: options.exclude,
    isEnabled: () => !stopped,
    debounceMs: options.debounceMs,
  });

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      stopWatching();
      ctx.typing?.stop();
      stopSweeping();
      for (const field of [...fields.keys()]) forgetField(fields, field);
    },
    canSendAsIs: (field) => canSendAsIs(ctx, field),
    maskForSend: (field, timeoutMs) => maskForSend(ctx, field, timeoutMs),
    showSendBlocked(field, retryMs) {
      if (stopped) return;
      const state = stateOf(fields, field);
      state.notice = { value: { kind: 'send-blocked', retryMs }, forText: readText(field) };
      if (state.status === 'idle') state.status = 'failed';
      ctx.render(field, state);
    },
    refreshDefaults() {
      for (const [field, state] of fields) {
        if (!state.preview) continue;
        state.items = itemsOf(state.preview.text, state.preview.result, options.defaultMode);
        ctx.render(field, state);
      }
    },
  };
}
