import { syncedSetting } from './storage';

/**
 * When AInonim masks: `manual` only from the panel at the field; `auto` also on its own when a
 * message is sent from a chat site's composer (lib/content/auto-mask.ts), other pages working
 * manually; `typing` on every page as soon as the user pauses typing (lib/content/typing-mask.ts),
 * and on chat sites again on send, should anything be left. One setting for every site, synced
 * like the others. A version that does not know a stored mode reads it as the default.
 */
export const MASKING_MODES = ['manual', 'auto', 'typing'] as const;
export type MaskingMode = (typeof MASKING_MODES)[number];

export const DEFAULT_MASKING_MODE: MaskingMode = 'manual';

/** storage.sync key holding the MaskingMode; absent means the default. */
export const MASK_MODE_KEY = 'maskMode';

export function isMaskingMode(value: unknown): value is MaskingMode {
  return typeof value === 'string' && (MASKING_MODES as readonly string[]).includes(value);
}

const maskingMode = syncedSetting(MASK_MODE_KEY, isMaskingMode, DEFAULT_MASKING_MODE);

export const getMaskingMode = maskingMode.get;
export const setMaskingMode = maskingMode.set;
/** Calls `callback` with the new mode whenever it changes. Returns an unsubscribe. */
export const onMaskingModeChange = maskingMode.onChange;
