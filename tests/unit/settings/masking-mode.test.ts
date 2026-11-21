import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  MASK_MODE_KEY,
  type MaskingMode,
  getMaskingMode,
  onMaskingModeChange,
  setMaskingMode,
} from '~/lib/settings';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('masking mode', () => {
  it("defaults to 'manual', stores only 'auto' and ignores unknown values", async () => {
    expect(await getMaskingMode()).toBe('manual');

    await setMaskingMode('auto');
    expect((await fakeBrowser.storage.sync.get(MASK_MODE_KEY))[MASK_MODE_KEY]).toBe('auto');
    expect(await getMaskingMode()).toBe('auto');

    await setMaskingMode('manual');
    expect(await fakeBrowser.storage.sync.get(MASK_MODE_KEY)).toEqual({});

    await fakeBrowser.storage.sync.set({ [MASK_MODE_KEY]: 'always' });
    expect(await getMaskingMode()).toBe('manual');
  });

  it('rejects an unknown mode', async () => {
    await expect(setMaskingMode('always' as MaskingMode)).rejects.toThrow(TypeError);
  });

  it('reports effective changes only', async () => {
    const seen: MaskingMode[] = [];
    const stop = onMaskingModeChange((mode) => seen.push(mode));

    await setMaskingMode('auto');
    await fakeBrowser.storage.sync.set({ [MASK_MODE_KEY]: 'auto' });
    await fakeBrowser.storage.sync.set({ [MASK_MODE_KEY]: 'nonsense' });
    stop();
    await setMaskingMode('auto');

    expect(seen).toEqual(['auto', 'manual']);
  });
});

describe("masking mode 'typing'", () => {
  it('is stored and read back; the modes stored before it keep working', async () => {
    await setMaskingMode('typing');
    expect((await fakeBrowser.storage.sync.get(MASK_MODE_KEY))[MASK_MODE_KEY]).toBe('typing');
    expect(await getMaskingMode()).toBe('typing');

    await fakeBrowser.storage.sync.set({ [MASK_MODE_KEY]: 'auto' });
    expect(await getMaskingMode()).toBe('auto');
  });
});
