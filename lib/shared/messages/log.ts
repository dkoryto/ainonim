// Content script -> service worker: one entry for the masking log.

import { type MaskingReport, isMaskingReport } from '~/lib/shared/log-entries';
import { isRecord } from './guards';

/**
 * Content script -> service worker: append one entry to the masking log (lib/log/). It carries
 * counts only; the worker adds the time and the hostname of the sending frame, and answers with
 * a DoneResponse. There is no message to read the log: only extension pages read it, from storage.
 */
export interface LogAppendRequest extends MaskingReport {
  type: 'ainonim/log-append';
  id: string;
}

export const LOG_APPEND_TYPE: LogAppendRequest['type'] = 'ainonim/log-append';

export function isLogAppendRequest(value: unknown): value is LogAppendRequest {
  return (
    isRecord(value) &&
    value.type === LOG_APPEND_TYPE &&
    typeof value.id === 'string' &&
    isMaskingReport(value)
  );
}
