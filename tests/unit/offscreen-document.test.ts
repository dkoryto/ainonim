import { describe, expect, it, vi } from 'vitest';
import { createOffscreenKeeper } from '~/lib/offscreen-document';

/** Behaves like Chrome: one document at most, creating a second one throws. */
function fakeChrome() {
  const chrome = {
    open: false,
    hasDocument: vi.fn(() => Promise.resolve(chrome.open)),
    createDocument: vi.fn(async () => {
      await Promise.resolve();
      if (chrome.open) throw new Error('Only a single offscreen document may be created.');
      chrome.open = true;
    }),
    closeDocument: vi.fn(() => {
      chrome.open = false;
      return Promise.resolve();
    }),
  };
  return chrome;
}

describe('createOffscreenKeeper', () => {
  it('creates the document once for concurrent first requests', async () => {
    const chrome = fakeChrome();
    const keeper = createOffscreenKeeper(chrome);

    await Promise.all([keeper.ensure(), keeper.ensure(), keeper.ensure()]);

    expect(chrome.createDocument).toHaveBeenCalledTimes(1);
    expect(chrome.open).toBe(true);
  });

  it('reuses an open document', async () => {
    const chrome = fakeChrome();
    chrome.open = true;

    await createOffscreenKeeper(chrome).ensure();

    expect(chrome.createDocument).not.toHaveBeenCalled();
  });

  it('creates the document again after it was closed', async () => {
    const chrome = fakeChrome();
    const keeper = createOffscreenKeeper(chrome);
    await keeper.ensure();

    await keeper.close();
    await keeper.ensure();

    expect(chrome.createDocument).toHaveBeenCalledTimes(2);
    expect(chrome.open).toBe(true);
  });

  it('accepts a document another caller created in the meantime', async () => {
    const chrome = fakeChrome();
    chrome.createDocument.mockImplementationOnce(() => {
      chrome.open = true;
      return Promise.reject(new Error('Only a single offscreen document may be created.'));
    });

    await expect(createOffscreenKeeper(chrome).ensure()).resolves.toBeUndefined();
  });

  it('passes on a creation error when no document exists', async () => {
    const chrome = fakeChrome();
    chrome.createDocument.mockRejectedValueOnce(new Error('no permission'));
    const keeper = createOffscreenKeeper(chrome);

    await expect(keeper.ensure()).rejects.toThrow('no permission');
    await expect(keeper.ensure()).resolves.toBeUndefined();
  });
});
