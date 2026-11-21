// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { chatgpt } from '~/lib/sites/chatgpt';
import { claude } from '~/lib/sites/claude';
import { gemini } from '~/lib/sites/gemini';
import { grok } from '~/lib/sites/grok';
import { perplexity } from '~/lib/sites/perplexity';
import { adapterFor } from '~/lib/sites';

describe('adapterFor', () => {
  it('picks the adapter by host', () => {
    expect(adapterFor('https://chatgpt.com/c/abc')?.id).toBe('chatgpt');
    expect(adapterFor(new URL('https://claude.ai/new'))?.id).toBe('claude');
    expect(adapterFor('https://example.com/')).toBeNull();
    expect(adapterFor('not a url')).toBeNull();
  });
});

describe('conversationId', () => {
  it('reads the ChatGPT conversation from the path', () => {
    const id = '0f4e2a10-1111-4c2b-9d3e-5a6b7c8d9e0f';
    expect(chatgpt.conversationId(new URL(`https://chatgpt.com/c/${id}`))).toBe(id);
    expect(chatgpt.conversationId(new URL(`https://chatgpt.com/g/g-abc-tutor/c/${id}`))).toBe(id);
    expect(chatgpt.conversationId(new URL('https://chatgpt.com/'))).toBeNull();
  });

  it('reads the Claude.ai conversation from the path', () => {
    const id = '7a1b2c3d-0000-4e5f-8a9b-0c1d2e3f4a5b';
    expect(claude.conversationId(new URL(`https://claude.ai/chat/${id}`))).toBe(id);
    expect(claude.conversationId(new URL('https://claude.ai/new'))).toBeNull();
  });
});

describe('adapterFor (more sites)', () => {
  it('picks Gemini, Grok and Perplexity by host', () => {
    expect(adapterFor('https://gemini.google.com/app')?.id).toBe('gemini');
    expect(adapterFor('https://grok.com/c/abc')?.id).toBe('grok');
    expect(adapterFor('https://www.perplexity.ai/search/abc')?.id).toBe('perplexity');
    expect(adapterFor('https://google.com/')).toBeNull();
  });
});

describe('conversationId (more sites)', () => {
  it('reads the Gemini conversation, also with an account prefix or in a Gem', () => {
    expect(gemini.conversationId(new URL('https://gemini.google.com/app/9b3f5ee16827c4d1'))).toBe(
      '9b3f5ee16827c4d1',
    );
    expect(gemini.conversationId(new URL('https://gemini.google.com/u/1/app/abc123'))).toBe(
      'abc123',
    );
    expect(gemini.conversationId(new URL('https://gemini.google.com/gem/coder/abc123'))).toBe(
      'abc123',
    );
    expect(gemini.conversationId(new URL('https://gemini.google.com/app'))).toBeNull();
  });

  it('reads the Grok and Perplexity conversations', () => {
    expect(grok.conversationId(new URL('https://grok.com/c/1a2b-3c'))).toBe('1a2b-3c');
    expect(grok.conversationId(new URL('https://grok.com/'))).toBeNull();
    expect(
      perplexity.conversationId(new URL('https://www.perplexity.ai/search/napisz-maila-AbC.12')),
    ).toBe('napisz-maila-AbC.12');
    expect(perplexity.conversationId(new URL('https://www.perplexity.ai/'))).toBeNull();
  });
});

describe('sendButton', () => {
  it('finds nothing without a send button or a composer', () => {
    document.body.innerHTML = '<form><button type="submit">x</button></form>';

    expect(chatgpt.sendButton?.(document)).toBeNull();
    expect(claude.sendButton?.(document)).toBeNull();
  });
});
