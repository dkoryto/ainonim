// Content script side of the masking log: hands each masking's counts to the service worker,
// which adds the time and the site and stores the entry (lib/log/store.ts).

import { browser } from 'wxt/browser';
import { LOG_APPEND_TYPE, type LogAppendRequest, isDoneResponse } from '~/lib/shared/messages';
import { TimeoutError, withTimeout } from '~/lib/shared/timeout';
import type { MaskingReport } from '~/lib/shared/log-entries';

const LOG_TIMEOUT_MS = 5_000;

export type SendLogMessage = (message: LogAppendRequest) => Promise<unknown>;

/**
 * Send `report` to the log. Best effort: a masking is never held up or undone because it could
 * not be logged, so this only warns, with the failure code and nothing from the report.
 */
export async function logMasking(
  report: MaskingReport,
  send: SendLogMessage = (message) => browser.runtime.sendMessage(message),
): Promise<void> {
  const id = Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  try {
    const response = await withTimeout(
      send({ type: LOG_APPEND_TYPE, id, ...report }),
      LOG_TIMEOUT_MS,
      'No answer from the extension.',
    );
    if (!isDoneResponse(response) || response.id !== id) console.warn('AInonim: log (malformed)');
    else if (!response.ok) console.warn(`AInonim: log (${response.code})`);
  } catch (error) {
    console.warn(`AInonim: log (${error instanceof TimeoutError ? 'timeout' : 'engine'})`);
  }
}
