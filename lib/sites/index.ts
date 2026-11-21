import { chatgpt } from './chatgpt';
import { claude } from './claude';
import { copilot } from './copilot';
import { deepseek } from './deepseek';
import { gemini } from './gemini';
import { grok } from './grok';
import { kimi } from './kimi';
import { mistral } from './mistral';
import { perplexity } from './perplexity';
import { qwen } from './qwen';
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
