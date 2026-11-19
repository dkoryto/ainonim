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
