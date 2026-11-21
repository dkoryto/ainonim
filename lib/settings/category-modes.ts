import { browser } from 'wxt/browser';
import { CUSTOM_ENTITY_TYPE, ENGINE_ENTITY_TYPES } from '~/lib/shared/labels';
import { isRecord, onSyncChange } from './storage';

/**
 * What a value of each category is replaced with by default ("Kategorie" tab): its token or a
 * generalised text. The panel's "znacznik | ogólnie" switch starts from it, and automatic masking
 * uses it. The user's own words count as the category CUSTOM_ENTITY_TYPE.
 */
export const CATEGORY_MODES = ['token', 'general'] as const;
export type CategoryMode = (typeof CATEGORY_MODES)[number];

export const DEFAULT_CATEGORY_MODE: CategoryMode = 'token';

/** storage.sync key holding `{ [entityType]: mode }`. Only non-default modes are stored. */
export const CATEGORY_MODES_KEY = 'categoryModes';

export function isCategoryMode(value: unknown): value is CategoryMode {
  return typeof value === 'string' && (CATEGORY_MODES as readonly string[]).includes(value);
}

/** The types a mode can be set for: polanon's and the user's own words. */
export const MODE_ENTITY_TYPES: readonly string[] = [...ENGINE_ENTITY_TYPES, CUSTOM_ENTITY_TYPE];

/** Non-default modes of known types from a stored value; anything else is dropped. */
export function parseCategoryModes(raw: unknown): Map<string, CategoryMode> {
  const modes = new Map<string, CategoryMode>();
  if (!isRecord(raw)) return modes;
  for (const entityType of MODE_ENTITY_TYPES) {
    const mode = raw[entityType];
    if (isCategoryMode(mode) && mode !== DEFAULT_CATEGORY_MODE) modes.set(entityType, mode);
  }
  return modes;
}

/** The mode of `entityType` in `modes`; a type without one gets the default. */
export function categoryModeOf(
  modes: ReadonlyMap<string, CategoryMode>,
  entityType: string,
): CategoryMode {
  return modes.get(entityType) ?? DEFAULT_CATEGORY_MODE;
}

async function readCategoryModesRaw(): Promise<Record<string, unknown>> {
  const raw = (await browser.storage.sync.get(CATEGORY_MODES_KEY))[CATEGORY_MODES_KEY];
  return isRecord(raw) ? raw : {};
}

export async function getCategoryModes(): Promise<Map<string, CategoryMode>> {
  return parseCategoryModes(await readCategoryModesRaw());
}

let pendingCategoryModeWrite: Promise<void> = Promise.resolve();

/** Store the mode of one type; writes are serialised like the site levels'. */
export function setCategoryMode(entityType: string, mode: CategoryMode): Promise<void> {
  if (!MODE_ENTITY_TYPES.includes(entityType))
    return Promise.reject(new TypeError(`unknown entity type: ${entityType}`));
  if (!isCategoryMode(mode))
    return Promise.reject(new TypeError(`unknown category mode: ${String(mode)}`));

  const write = pendingCategoryModeWrite.then(async () => {
    // Entries this version does not understand (a newer type or mode) are kept as they are.
    const next = Object.create(null) as Record<string, unknown>;
    for (const [name, value] of Object.entries(await readCategoryModesRaw())) {
      if (name !== entityType) next[name] = value;
    }
    if (mode !== DEFAULT_CATEGORY_MODE) next[entityType] = mode;

    if (Object.keys(next).length === 0) await browser.storage.sync.remove(CATEGORY_MODES_KEY);
    else await browser.storage.sync.set({ [CATEGORY_MODES_KEY]: next });
  });
  pendingCategoryModeWrite = write.catch(() => undefined);
  return write;
}

/** Calls `callback` with the modes whenever they change. Returns an unsubscribe. */
export function onCategoryModesChange(
  callback: (modes: Map<string, CategoryMode>) => void,
): () => void {
  return onSyncChange(CATEGORY_MODES_KEY, (_oldValue, newValue) => {
    callback(parseCategoryModes(newValue));
  });
}
