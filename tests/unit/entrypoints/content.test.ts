// The content script's entry: it starts and stops on the effective level of the page.
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setAllowedSites, setSiteLevel, setSiteScope } from '~/lib/settings';

const masking = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }));

vi.mock('~/lib/content/masking', () => ({
  startMasking: (...args: unknown[]) => {
    masking.start(...args);
    return { stop: masking.stop };
  },
}));

const { default: contentScript } = await import('~/entrypoints/content');

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function run(): () => void {
  let invalidate = (): void => undefined;
  const ctx = {
    onInvalidated: (callback: () => void) => {
      invalidate = callback;
    },
  };
  void contentScript.main(ctx as never);
  return () => {
    invalidate();
  };
}

beforeEach(() => {
  fakeBrowser.reset();
  masking.start.mockClear();
  masking.stop.mockClear();
});

describe('content script', () => {
  it('starts on a page within the scope', async () => {
    run();
    await flush();
    expect(masking.start).toHaveBeenCalledTimes(1);
  });

  it('stays off outside the allow-list and starts once the site is added', async () => {
    const host = location.hostname;
    await setSiteScope('list');
    run();
    await flush();
    expect(masking.start).not.toHaveBeenCalled();

    await setAllowedSites([host]);
    await flush();
    expect(masking.start).toHaveBeenCalledTimes(1);

    await setSiteLevel(host, 'off');
    await flush();
    expect(masking.stop).toHaveBeenCalledTimes(1);

    await setSiteScope('all');
    await flush();
    expect(masking.start).toHaveBeenCalledTimes(1);
  });

  it('stops when the scope narrows to chat sites, and when invalidated', async () => {
    const invalidate = run();
    await flush();
    expect(masking.start).toHaveBeenCalledTimes(1);

    await setSiteScope('chats');
    await flush();
    expect(masking.stop).toHaveBeenCalledTimes(1);

    await setSiteScope('all');
    await flush();
    expect(masking.start).toHaveBeenCalledTimes(2);
    invalidate();
    expect(masking.stop).toHaveBeenCalledTimes(2);

    await setSiteScope('chats');
    await setSiteScope('all');
    await flush();
    expect(masking.start).toHaveBeenCalledTimes(2);
  });
});
