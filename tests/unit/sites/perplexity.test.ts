// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { perplexity } from '~/lib/sites/perplexity';

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
