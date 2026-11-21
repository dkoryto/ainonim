export class TimeoutError extends Error {
  override name = 'TimeoutError';
}

/** Settle like `promise`, or reject with a TimeoutError carrying `message` after `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new TimeoutError(message));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

/** A readable message for anything caught at a messaging boundary. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * `error` for a failure message, never empty: the stage where it happened, the error's name and
 * the last line of its message (a Python exception's message is the whole traceback), e.g.
 * "offscreen: PythonError: KeyError: 'x'". The stage tells apart failures that look alike.
 */
export function describeError(stage: string, error: unknown): string {
  const name = error instanceof Error ? error.name : typeof error;
  const message = errorMessage(error).trimEnd().split('\n').at(-1)?.trim() ?? '';
  return message === '' || message === name ? `${stage}: ${name}` : `${stage}: ${name}: ${message}`;
}
