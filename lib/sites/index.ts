import { chatgpt } from './chatgpt';
import { claude } from './claude';
import type { SiteAdapter } from './types';

export type { SiteAdapter } from './types';

export const adapters: readonly SiteAdapter[] = [chatgpt, claude];

/** The adapter for the page at `url`, or null on a site AInonim has no adapter for. */
export function adapterFor(url: URL | string): SiteAdapter | null {
  let parsed: URL;
  try {
    parsed = typeof url === 'string' ? new URL(url) : url;
  } catch {
    return null;
  }
  return adapters.find((adapter) => adapter.matches(parsed)) ?? null;
}
