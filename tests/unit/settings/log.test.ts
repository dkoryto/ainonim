import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { LOG_ENABLED_KEY, getLogEnabled, onLogEnabledChange, setLogEnabled } from '~/lib/settings';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('masking log switch', () => {
  it('is on by default and stores only false', async () => {
    const seen: boolean[] = [];
    const stop = onLogEnabledChange((enabled) => seen.push(enabled));
    expect(await getLogEnabled()).toBe(true);

    await setLogEnabled(false);
    expect((await fakeBrowser.storage.sync.get(LOG_ENABLED_KEY))[LOG_ENABLED_KEY]).toBe(false);
    expect(await getLogEnabled()).toBe(false);
    await setLogEnabled(true);

    expect(await fakeBrowser.storage.sync.get(LOG_ENABLED_KEY)).toEqual({});
    expect(seen).toEqual([false, true]);
    stop();
  });
});
