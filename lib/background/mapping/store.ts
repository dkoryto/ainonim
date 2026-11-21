// Per-conversation token -> original mapping, so the same person keeps the same token
// (`<OSOBA_1>`) for the whole chat and answers can be restored.
//
// The mapping is as sensitive as the original data. It lives in `browser.storage.session`
// (memory only, cleared when the browser closes) and this module is meant to run only in the
// service worker: `storage.session` keeps its default TRUSTED_CONTEXTS access level, so content
// scripts reach a mapping only through messages that the background can check per sender.
//
// At most MAX_CONVERSATIONS conversations are kept; using one (get, merge, rename) marks it
// as most recently used and the least recently used ones are dropped beyond the cap.
//
// Never log mapping values or include them in errors.

import { browser } from 'wxt/browser';
import { MAX_KEY_LENGTH, assertKey } from '~/lib/shared/conversation-key';
import type { StoredConversation } from '~/lib/shared/messages';

export type Mapping = Record<string, string>;

export const STORAGE_KEY = 'ainonim/mappings';
export const MAX_CONVERSATIONS = 50;

interface Entry {
  usedAt: number;
  mapping: Map<string, string>;
}

type State = Map<string, Entry>;

/** Thrown when a token already maps to a different original. Carries tokens only, never values. */
export class MappingConflictError extends Error {
  readonly tokens: string[];

  constructor(tokens: string[]) {
    super(`Token already mapped to a different value: ${tokens.join(', ')}`);
    this.name = 'MappingConflictError';
    this.tokens = tokens;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPair(entry: [string, unknown]): entry is [string, string] {
  return entry[0] !== '' && typeof entry[1] === 'string' && entry[1] !== '';
}

/** Valid token -> original pairs only; anything else is dropped. */
function parseMapping(value: unknown): Map<string, string> {
  if (!isRecord(value)) return new Map();
  return new Map(Object.entries(value).filter(isPair));
}

function parseEntry(value: unknown): Entry | undefined {
  if (!isRecord(value) || typeof value.usedAt !== 'number' || !Number.isFinite(value.usedAt)) {
    return undefined;
  }
  const mapping = parseMapping(value.mapping);
  return mapping.size > 0 ? { usedAt: value.usedAt, mapping } : undefined;
}

/** Reads the stored state, ignoring malformed conversations and pairs. */
async function load(): Promise<State> {
  const stored: unknown = (await browser.storage.session.get(STORAGE_KEY))[STORAGE_KEY];
  const state: State = new Map();
  if (!isRecord(stored)) return state;
  for (const [key, value] of Object.entries(stored)) {
    const entry = key.length <= MAX_KEY_LENGTH ? parseEntry(value) : undefined;
    if (entry) state.set(key, entry);
  }
  return state;
}

async function save(state: State): Promise<void> {
  const byRecency = [...state].sort(([, a], [, b]) => b.usedAt - a.usedAt);
  const kept = byRecency.slice(0, MAX_CONVERSATIONS);
  const value = Object.fromEntries(
    kept.map(([key, entry]) => [
      key,
      { usedAt: entry.usedAt, mapping: Object.fromEntries(entry.mapping) },
    ]),
  );
  await browser.storage.session.set({ [STORAGE_KEY]: value });
}

/** Strictly increasing within the stored state, even if the clock stands still or goes back. */
function nextUsedAt(state: State): number {
  let latest = 0;
  for (const entry of state.values()) latest = Math.max(latest, entry.usedAt);
  return Math.max(Date.now(), latest + 1);
}

function toRecord(mapping: Map<string, string> | undefined): Mapping {
  return Object.fromEntries(mapping ?? []);
}

/** Adds `incoming` to `target` in place; throws without changing anything on a conflict. */
function mergeInto(target: Map<string, string>, incoming: Map<string, string>): void {
  const conflicts = [...incoming]
    .filter(([token, original]) => target.has(token) && target.get(token) !== original)
    .map(([token]) => token);
  if (conflicts.length > 0) throw new MappingConflictError(conflicts);
  for (const [token, original] of incoming) target.set(token, original);
}

// Every operation (including its argument checks, so they reject instead of throwing) reads, changes and writes the whole state; running them one at a time keeps
// concurrent messages from overwriting each other's changes.
let queue: Promise<unknown> = Promise.resolve();

function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(operation);
  queue = result.catch(() => undefined);
  return result;
}

/** The mapping of a conversation, `{}` when there is none. */
export function getMapping(key: string): Promise<Mapping> {
  return serialized(async () => {
    assertKey(key);
    const state = await load();
    const entry = state.get(key);
    if (!entry) return {};
    entry.usedAt = nextUsedAt(state);
    await save(state);
    return toRecord(entry.mapping);
  });
}

/**
 * Adds new tokens to a conversation and returns its whole mapping. A token that is already
 * mapped keeps its original; a different original for it is a MappingConflictError and nothing
 * is stored.
 */
export function mergeMapping(key: string, mapping: Mapping): Promise<Mapping> {
  return serialized(async () => {
    assertKey(key);
    if (!isRecord(mapping) || !Object.entries(mapping).every(isPair)) {
      throw new TypeError('Invalid mapping');
    }
    const incoming = new Map(Object.entries(mapping));
    const state = await load();
    const entry = state.get(key) ?? { usedAt: 0, mapping: new Map<string, string>() };
    mergeInto(entry.mapping, incoming);
    if (entry.mapping.size === 0) return {};
    entry.usedAt = nextUsedAt(state);
    state.set(key, entry);
    await save(state);
    return toRecord(entry.mapping);
  });
}

/**
 * Moves a mapping from a temporary key (a new chat without an id yet) to the real one, merging
 * into the target if it exists. On a conflict nothing changes and MappingConflictError is
 * thrown. Returns the target's mapping.
 */
export function renameMapping(fromKey: string, toKey: string): Promise<Mapping> {
  return serialized(async () => {
    assertKey(fromKey);
    assertKey(toKey);
    const state = await load();
    const source = state.get(fromKey);
    const target = state.get(toKey);
    if (fromKey === toKey || !source) return toRecord(target?.mapping);
    const merged = new Map(target?.mapping);
    mergeInto(merged, source.mapping);
    state.delete(fromKey);
    state.set(toKey, { usedAt: nextUsedAt(state), mapping: merged });
    await save(state);
    return toRecord(merged);
  });
}

/**
 * Every stored conversation, most recently used first. Listing does not count as using a
 * conversation, so the order and the LRU cap stay as they were.
 */
export function listMappings(): Promise<StoredConversation[]> {
  return serialized(async () => {
    const state = await load();
    return [...state]
      .sort(([, a], [, b]) => b.usedAt - a.usedAt)
      .map(([key, entry]) => ({ key, mapping: toRecord(entry.mapping) }));
  });
}

/** Removes one conversation; returns whether it was stored. */
export function clearMapping(key: string): Promise<boolean> {
  return serialized(async () => {
    assertKey(key);
    const state = await load();
    if (!state.delete(key)) return false;
    await save(state);
    return true;
  });
}

export function clearAll(): Promise<void> {
  return serialized(() => browser.storage.session.remove(STORAGE_KEY));
}
