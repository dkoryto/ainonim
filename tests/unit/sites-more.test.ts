// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isExcluded } from '~/lib/fields/editable';
import { gemini } from '~/lib/sites/gemini';
import { grok } from '~/lib/sites/grok';
import { adapterFor } from '~/lib/sites/index';
import { perplexity } from '~/lib/sites/perplexity';

function load(name: string): void {
  document.body.innerHTML = readFileSync(
    resolve(import.meta.dirname, '../fixtures/sites', name),
    'utf8',
  );
}

function element(selector: string): HTMLElement {
  const found = document.querySelector(selector);
  if (!(found instanceof HTMLElement)) throw new Error(`No ${selector} in the fixture`);
  return found;
}

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

describe('gemini', () => {
  it('finds the composer, the answers, the sent message and the send button', () => {
    load('gemini-conversation.html');
    expect(gemini.composer(document)?.getAttribute('aria-label')).toBe('Wpisz prompta dla Gemini');
    expect(gemini.answerRoots(document)).toHaveLength(2);
    expect(gemini.sentMessageRoots(document).map((root) => root.className)).toEqual([
      'query-text gds-body-l',
    ]);
    expect(gemini.sendButton?.(document)?.getAttribute('aria-label')).toBe('Wyślij wiadomość');
  });

  it('tells answers from the user message and the composer', () => {
    load('gemini-conversation.html');
    expect(gemini.isAnswerElement(element('.markdown p'))).toBe(true);
    expect(gemini.isAnswerElement(element('.query-text-line'))).toBe(false);
    expect(gemini.isAnswerElement(element('.ql-editor'))).toBe(false);
  });

  it('streams only the last answer while the stop button is shown', () => {
    load('gemini-conversation.html');
    expect(gemini.answerRoots(document).map((root) => gemini.isStreaming(root))).toEqual([
      false,
      true,
    ]);
    element('button[aria-label="Zatrzymaj odpowiedź"]').remove();
    expect(gemini.answerRoots(document).some((root) => gemini.isStreaming(root))).toBe(false);
  });

  it("never treats Quill's hidden clipboard as a field", () => {
    load('gemini-conversation.html');
    expect(isExcluded(element('.ql-clipboard'))).toBe(true);
    expect(isExcluded(element('.ql-editor'))).toBe(false);
  });
});

describe('grok', () => {
  it('finds the composer, the answer, the sent message and the send button', () => {
    load('grok-conversation.html');
    expect(grok.composer(document)?.tagName).toBe('TEXTAREA');
    expect(grok.answerRoots(document).map((root) => root.dataset.testid)).toEqual([
      'assistant-message',
    ]);
    expect(grok.sentMessageRoots(document).map((root) => root.dataset.testid)).toEqual([
      'user-message',
    ]);
    expect(grok.sendButton?.(document)?.getAttribute('aria-label')).toBe('Wyślij');
  });

  it('falls back to the bubble that is not the user message', () => {
    load('grok-conversation.html');
    element('[data-testid="assistant-message"]').removeAttribute('data-testid');
    expect(grok.answerRoots(document)).toHaveLength(1);
    expect(grok.isAnswerElement(element('.response-content-markdown p'))).toBe(true);
    expect(grok.isAnswerElement(element('[data-testid="user-message"] p'))).toBe(false);
  });
});

describe('perplexity', () => {
  it('finds the composer, the answer, the query and the send button', () => {
    load('perplexity-thread.html');
    expect(perplexity.composer(document)?.id).toBe('ask-input');
    expect(perplexity.answerRoots(document).map((root) => root.id)).toEqual(['markdown-content-0']);
    expect(perplexity.sentMessageRoots(document)).toHaveLength(1);
    expect(perplexity.sendButton?.(document)?.dataset.testid).toBe('submit-button');
    expect(perplexity.isAnswerElement(element('#ask-input'))).toBe(false);
  });
});
