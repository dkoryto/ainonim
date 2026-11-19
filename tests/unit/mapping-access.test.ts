import { describe, expect, it } from 'vitest';
import { mayUseConversation } from '~/lib/mapping/access';

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
