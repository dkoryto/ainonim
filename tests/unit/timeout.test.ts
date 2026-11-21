import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimeoutError, describeError, withTimeout } from '~/lib/shared/timeout';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('withTimeout', () => {
  it('rejects with a TimeoutError once the time is up', async () => {
    const result = withTimeout(new Promise(() => undefined), 5000, 'too slow');
    const assertion = expect(result).rejects.toThrow(new TimeoutError('too slow'));

    await vi.advanceTimersByTimeAsync(5000);

    await assertion;
  });

  it('settles with the promise when it is faster', async () => {
    const result = withTimeout(Promise.resolve('done'), 5000, 'too slow');

    await expect(result).resolves.toBe('done');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('passes on the rejection of the promise', async () => {
    const result = withTimeout(Promise.reject(new Error('broken')), 5000, 'too slow');

    await expect(result).rejects.toThrow('broken');
  });
});

describe('describeError', () => {
  it('names the stage and the error, and keeps the last line of the message', () => {
    expect(describeError('offscreen', new Error('Traceback\n  line\nKeyError: x\n'))).toBe(
      'offscreen: Error: KeyError: x',
    );
  });

  it('is never empty, also for an error without a message or a non-error value', () => {
    expect(describeError('worker', new Error(''))).toBe('worker: Error');
    expect(describeError('worker', undefined)).toBe('worker: undefined');
  });
});
