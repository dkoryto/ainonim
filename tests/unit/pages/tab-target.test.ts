import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { describeTabUrl, unsupportedNote } from '~/lib/pages/tab-target';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('describeTabUrl (popup)', () => {
  it.each([
    ['https://chat.example.com/c/1', 'chat.example.com'],
    ['http://LOCALHOST:5173/', 'localhost'],
    ['https://[::1]:8443/', '[::1]'],
    ['https://chrome.google.com/search', 'chrome.google.com'],
  ])('offers the switch on %s', (url, hostname) => {
    expect(describeTabUrl(url)).toEqual({ kind: 'site', hostname });
  });

  it.each([
    ['chrome://extensions/', 'browser-page'],
    ['chrome-extension://abc/popup.html', 'browser-page'],
    ['about:blank', 'browser-page'],
    ['view-source:https://example.com/', 'browser-page'],
    ['https://chromewebstore.google.com/detail/x', 'web-store'],
    ['https://chrome.google.com/webstore/category/extensions', 'web-store'],
    ['file:///home/user/a.html', 'file'],
    ['not a url', 'unknown'],
    [undefined, 'unknown'],
  ] as const)('shows a note on %s', (url, reason) => {
    const target = describeTabUrl(url);

    expect(target).toEqual({ kind: 'unsupported', reason });
    if (target.kind === 'unsupported') expect(unsupportedNote(target)).not.toBe('');
  });
});
