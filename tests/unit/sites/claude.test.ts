// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { claude } from '~/lib/sites/claude';

function load(name: string): void {
  document.body.innerHTML = readFileSync(
    resolve(import.meta.dirname, '../../fixtures/sites', name),
    'utf8',
  );
}

function element(selector: string): Element {
  const found = document.querySelector(selector);
  if (!found) throw new Error(`No ${selector} in the fixture`);
  return found;
}

describe('claude', () => {
  beforeEach(() => {
    load('claude-conversation.html');
  });

  it('finds the composer and the answers', () => {
    expect(claude.composer(document)?.dataset.testid).toBe('chat-input');
    expect(claude.answerRoots(document)).toHaveLength(2);
  });

  it('tells answers from user messages and the composer', () => {
    expect(claude.isAnswerElement(element('.standard-markdown p'))).toBe(true);
    expect(claude.isAnswerElement(element('[data-testid="user-message"] p'))).toBe(false);
    expect(claude.isAnswerElement(element('[data-testid="chat-input"]'))).toBe(false);
  });

  it('finds sent messages, falling back to the transcript row', () => {
    expect(claude.sentMessageRoots(document).map((root) => root.dataset.testid)).toEqual([
      'user-message',
    ]);
    document.body.innerHTML =
      '<div data-testid="transcript-row" data-perf-row="human"><p>a</p></div>' +
      '<div data-testid="transcript-row" data-perf-row="assistant"><p>b</p></div>';
    expect(claude.sentMessageRoots(document).map((root) => root.dataset.perfRow)).toEqual([
      'human',
    ]);
  });

  it('reads streaming from data-is-streaming', () => {
    expect(claude.answerRoots(document).map((root) => claude.isStreaming(root))).toEqual([
      false,
      true,
    ]);
  });
});

describe('sendButton', () => {
  it('finds the Claude.ai send button by its English or Polish name', () => {
    load('claude-conversation.html');
    expect(claude.sendButton?.(document)?.getAttribute('aria-label')).toBe('Send message');

    document.body.innerHTML =
      '<fieldset><div contenteditable="true" data-testid="chat-input" role="textbox"></div>' +
      '<button aria-label="Wyślij wiadomość">x</button></fieldset>';
    expect(claude.sendButton?.(document)?.getAttribute('aria-label')).toBe('Wyślij wiadomość');
  });
});
