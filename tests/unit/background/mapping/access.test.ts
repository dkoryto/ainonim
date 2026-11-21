import { describe, expect, it } from 'vitest';
import { isExtensionPage, mayUseConversation } from '~/lib/background/mapping/access';

describe('mayUseConversation', () => {
  it.each([
    ['chatgpt:abc', 'https://chatgpt.com/c/abc'],
    ['chatgpt:tmp~1', 'https://chatgpt.com/'],
    ['claude:abc', 'https://claude.ai/chat/abc'],
  ])('lets %s be used from %s', (key, url) => {
    expect(mayUseConversation(key, url)).toBe(true);
  });

  it.each([
    ['a site without an adapter', 'chatgpt:abc', 'https://example.com/c/abc'],
    ['a look-alike host', 'chatgpt:abc', 'https://chatgpt.com.example.com/'],
    ['the other chat site', 'chatgpt:abc', 'https://claude.ai/chat/abc'],
    ['the other chat site', 'claude:abc', 'https://chatgpt.com/'],
    ['a key without a site', 'abc', 'https://chatgpt.com/'],
    ['a key with an empty site', ':abc', 'https://chatgpt.com/'],
    ['a key of an unknown site', 'unknown:abc', 'https://chatgpt.com/'],
    ['a malformed sender URL', 'chatgpt:abc', 'not a url'],
    ['a sender without a URL', 'chatgpt:abc', undefined],
  ])('refuses %s: %s from %s', (_case, key, url) => {
    expect(mayUseConversation(key, url)).toBe(false);
  });
});

describe('isExtensionPage', () => {
  const ID = 'abcdefghijklmnopabcdefghijklmnop';
  const ORIGIN = `chrome-extension://${ID}/`;

  it.each([
    ['the popup', `chrome-extension://${ID}/popup.html`],
    ['the popup opened in a tab', `chrome-extension://${ID}/popup.html?tab=1`],
  ])('accepts %s', (_case, url) => {
    expect(isExtensionPage({ id: ID, url }, ID, ORIGIN)).toBe(true);
  });

  it.each([
    ['a content script on a chat site', { id: ID, url: 'https://chatgpt.com/c/abc' }],
    ['a content script on any page', { id: ID, url: 'http://127.0.0.1/' }],
    ['another extension', { id: 'other', url: 'chrome-extension://other/popup.html' }],
    ['another extension claiming our URL', { id: 'other', url: `${ORIGIN}popup.html` }],
    ['our id with another extension URL', { id: ID, url: 'chrome-extension://other/popup.html' }],
    ['a look-alike host', { id: ID, url: `chrome-extension://${ID}.example.com/` }],
    ['an other scheme with our host', { id: ID, url: `https://${ID}/popup.html` }],
    ['a sender without a URL', { id: ID }],
    ['a sender without an id', { url: `${ORIGIN}popup.html` }],
    ['a malformed URL', { id: ID, url: 'not a url' }],
  ])('refuses %s', (_case, sender) => {
    expect(isExtensionPage(sender, ID, ORIGIN)).toBe(false);
  });

  it('refuses everything when the extension origin is malformed', () => {
    expect(isExtensionPage({ id: ID, url: `${ORIGIN}popup.html` }, ID, 'nonsense')).toBe(false);
  });
});
