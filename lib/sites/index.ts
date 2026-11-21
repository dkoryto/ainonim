import { chatgpt } from './chatgpt';
import { claude } from './claude';
import { gemini } from './gemini';
import { grok } from './grok';
import { copilot, deepseek, kimi, mistral, qwen } from './more-chats';
import { perplexity } from './perplexity';
import type { SiteAdapter } from './types';

export type { SiteAdapter } from './types';

export const adapters: readonly SiteAdapter[] = [
  chatgpt,
  claude,
  gemini,
  grok,
  perplexity,
  kimi,
  deepseek,
  mistral,
  copilot,
  qwen,
];

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
