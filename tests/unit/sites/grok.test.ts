// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { grok } from '~/lib/sites/grok';

function load(name: string): void {
  document.body.innerHTML = readFileSync(
    resolve(import.meta.dirname, '../../fixtures/sites', name),
    'utf8',
  );
}

function element(selector: string): HTMLElement {
  const found = document.querySelector(selector);
  if (!(found instanceof HTMLElement)) throw new Error(`No ${selector} in the fixture`);
  return found;
}

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
    expect(grok.isAnswerElement(element('.response-content-markdown p'))).toBe(true);
    expect(grok.isAnswerElement(element('textarea'))).toBe(false);
  });

  it('falls back to the bubble that is not the user message', () => {
    load('grok-conversation.html');
    element('[data-testid="assistant-message"]').removeAttribute('data-testid');
    expect(grok.answerRoots(document)).toHaveLength(1);
    expect(grok.isAnswerElement(element('.response-content-markdown p'))).toBe(true);
    expect(grok.isAnswerElement(element('[data-testid="user-message"] p'))).toBe(false);
  });

  it('streams only the last answer, and only while the stop button is shown', () => {
    load('grok-conversation.html');
    const [answer] = grok.answerRoots(document);
    if (!answer) throw new Error('no answer');
    expect(grok.isStreaming(answer)).toBe(false);

    element('form').insertAdjacentHTML('beforeend', '<button aria-label="Stop">■</button>');
    expect(grok.isStreaming(answer)).toBe(true);

    element('form').insertAdjacentHTML(
      'beforebegin',
      '<div class="message-bubble" data-testid="assistant-message"><p>Nowa</p></div>',
    );
    expect(grok.isStreaming(answer)).toBe(false);
  });
});
