import { describe, expect, it } from 'vitest';
import { conversationKey } from '~/lib/shared/conversation-key';

describe('conversationKey', () => {
  it('joins the site and the conversation id', () => {
    expect(conversationKey('chatgpt', 'abc')).toBe('chatgpt:abc');
  });

  it.each([
    ['', 'abc'],
    ['chat:gpt', 'abc'],
    ['chatgpt', ''],
  ])('rejects site %j with conversation %j', (site, id) => {
    expect(() => conversationKey(site, id)).toThrow(TypeError);
  });
});
