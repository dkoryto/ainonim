// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isExcluded } from '~/lib/content/fields/editable';
import { gemini } from '~/lib/sites/gemini';

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
