import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { isRecord, onSyncChange, syncedSetting } from '~/lib/settings/storage';

const isColour = (value: unknown): value is 'red' | 'blue' => value === 'red' || value === 'blue';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('isRecord', () => {
  it('accepts plain objects only', () => {
    expect(isRecord({ PESEL: 'off' })).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord(['PESEL'])).toBe(false);
    expect(isRecord('PESEL')).toBe(false);
  });
});

describe('syncedSetting', () => {
  const colour = syncedSetting('testColour', isColour, 'red');

  it('stores only a non-default value and reads an invalid one as the default', async () => {
    expect(await colour.get()).toBe('red');
    await colour.set('blue');
    expect(await fakeBrowser.storage.sync.get('testColour')).toEqual({ testColour: 'blue' });
    await colour.set('red');
    expect(await fakeBrowser.storage.sync.get('testColour')).toEqual({});

    await fakeBrowser.storage.sync.set({ testColour: 'green' });
    expect(await colour.get()).toBe('red');
    await expect(colour.set('green' as 'red')).rejects.toThrow(TypeError);
  });

  it('reports a change of the effective value only, in storage.sync only', async () => {
    const seen: string[] = [];
    const stop = colour.onChange((value) => seen.push(value));

    await fakeBrowser.storage.local.set({ testColour: 'blue' });
    await fakeBrowser.storage.sync.set({ otherKey: 'blue' });
    // An invalid value reads as the default, so going from absent to it changes nothing.
    await fakeBrowser.storage.sync.set({ testColour: 'green' });
    await colour.set('blue');
    stop();
    await colour.set('red');

    expect(seen).toEqual(['blue']);
  });
});

describe('onSyncChange', () => {
  it('passes the raw old and new values of its key in storage.sync, until unsubscribed', async () => {
    const seen: unknown[][] = [];
    const stop = onSyncChange('testKey', (oldValue, newValue) => seen.push([oldValue, newValue]));

    await fakeBrowser.storage.local.set({ testKey: 1 });
    await fakeBrowser.storage.sync.set({ otherKey: 1 });
    await fakeBrowser.storage.sync.set({ testKey: 'a' });
    await fakeBrowser.storage.sync.set({ testKey: 'b' });
    stop();
    await fakeBrowser.storage.sync.remove('testKey');

    expect(seen.map(([, newValue]) => newValue)).toEqual(['a', 'b']);
    expect(seen[1]).toEqual(['a', 'b']);
  });
});
