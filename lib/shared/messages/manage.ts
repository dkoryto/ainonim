// Extension pages -> service worker: list and delete the stored mappings of every site.

import { type DoneResponse, type Failure, type Mapping, isMapping } from './common';
import { isRecord, isResponse } from './guards';

/** Popup -> service worker: every stored conversation with its mapping, most recent first. */
export interface MappingsListRequest {
  type: 'ainonim/mappings-list';
  id: string;
}

/** Popup -> service worker: delete the stored mapping of one conversation. */
export interface MappingDeleteRequest {
  type: 'ainonim/mapping-delete';
  id: string;
  conversationKey: string;
}

/** Popup -> service worker: delete every stored mapping. */
export interface MappingsClearRequest {
  type: 'ainonim/mappings-clear';
  id: string;
}

/**
 * Requests that see or delete the mappings of every site. Only extension pages may send them
 * (lib/background/mapping/access.ts); a content script gets `forbidden`.
 */
export type ManageRequest = MappingsListRequest | MappingDeleteRequest | MappingsClearRequest;

export const MANAGE_REQUEST_TYPES: readonly string[] = [
  'ainonim/mappings-list',
  'ainonim/mapping-delete',
  'ainonim/mappings-clear',
] satisfies ManageRequest['type'][];

export interface StoredConversation {
  /** The conversation key, e.g. `chatgpt:<conversation id>`. */
  key: string;
  mapping: Mapping;
}

export type MappingsListResponse =
  { id: string; ok: true; conversations: StoredConversation[] } | Failure;

export type ManageResponse = MappingsListResponse | DoneResponse;

export function isManageRequest(value: unknown): value is ManageRequest {
  if (!isRecord(value) || typeof value.id !== 'string') return false;
  switch (value.type) {
    case 'ainonim/mappings-list':
    case 'ainonim/mappings-clear':
      return true;
    case 'ainonim/mapping-delete':
      return typeof value.conversationKey === 'string';
    default:
      return false;
  }
}

function isStoredConversation(value: unknown): value is StoredConversation {
  return isRecord(value) && typeof value.key === 'string' && isMapping(value.mapping);
}

export function isMappingsListResponse(value: unknown): value is MappingsListResponse {
  return isResponse(
    value,
    (response) =>
      Array.isArray(response.conversations) && response.conversations.every(isStoredConversation),
  );
}
