// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { chatgpt } from '~/lib/sites/chatgpt';
import { claude } from '~/lib/sites/claude';
import { adapterFor } from '~/lib/sites';

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

describe('chatgpt', () => {
  beforeEach(() => {
    load('chatgpt-writing-block.html');
  });

  it('finds the composer, not the editor in the writing block', () => {
    expect(chatgpt.composer(document)?.getAttribute('aria-label')).toBe('Zapytaj ChatGPT');
  });

  it('finds the answer roots', () => {
    expect(chatgpt.answerRoots(document).map((root) => root.dataset.responseBody)).toEqual([
      'msg-b1',
    ]);
  });

  it('counts the editable writing block as part of the answer', () => {
    expect(chatgpt.isAnswerElement(element('[aria-label="Zacznij pisać"] p'))).toBe(true);
    expect(chatgpt.isAnswerElement(element('[aria-label="Zapytaj ChatGPT"]'))).toBe(false);
    const editor = element('[aria-label="Zacznij pisać"]') as HTMLElement;
    expect(chatgpt.editableAnswerBlock?.(editor)?.dataset.testid).toBe('chatgpt-writing-block');
  });

  it('does not count user messages as answers', () => {
    load('chatgpt-conversation.html');
    expect(chatgpt.isAnswerElement(element('[data-user-message-bubble] div'))).toBe(false);
    expect(chatgpt.isAnswerElement(element('[data-response-body] li'))).toBe(true);
  });

  it('finds sent messages, by role first and by the bubble on older markup', () => {
    load('chatgpt-conversation.html');
    expect(
      chatgpt.sentMessageRoots(document).map((root) => root.dataset.userMessageBubble),
    ).toEqual(['true']);
    document.body.innerHTML =
      '<div data-message-author-role="user"><div data-user-message-bubble="true">a</div></div>' +
      '<div data-message-author-role="assistant"><p>b</p></div>';
    expect(
      chatgpt.sentMessageRoots(document).map((root) => root.dataset.messageAuthorRole),
    ).toEqual(['user']);
  });

  it('never takes the composer, an editor or an answer for a sent message', () => {
    document.body.innerHTML =
      '<article data-turn="user"><div contenteditable="true" id="prompt-textarea"></div></article>' +
      '<div contenteditable="true"><div data-user-message-bubble="true"></div></div>' +
      '<div data-message-author-role="assistant"><div data-user-message-bubble="true"></div></div>';
    expect(chatgpt.sentMessageRoots(document)).toEqual([]);
    document.body.innerHTML =
      '<article data-turn="user"><div contenteditable="true" id="prompt-textarea"></div></article>';
    expect(chatgpt.sentMessageRoots(document)).toEqual([]);
  });

  it('reports streaming from the stop button for the last answer only', () => {
    load('chatgpt-conversation.html');
    const [answer] = chatgpt.answerRoots(document);
    if (!answer) throw new Error('no answer');
    expect(chatgpt.isStreaming(answer)).toBe(false);
    element('form').insertAdjacentHTML('beforeend', '<button data-testid="stop-button"></button>');
    expect(chatgpt.isStreaming(answer)).toBe(true);
  });

  it('falls back to older selectors', () => {
    document.body.innerHTML =
      '<div data-message-author-role="assistant"><p>a</p></div>' +
      '<textarea id="prompt-textarea"></textarea>';
    expect(chatgpt.answerRoots(document)).toHaveLength(1);
    expect(chatgpt.composer(document)?.id).toBe('prompt-textarea');
  });

  it('finds nothing on an unknown layout', () => {
    document.body.innerHTML = '<div><p>nothing here</p></div>';
    expect(chatgpt.answerRoots(document)).toEqual([]);
    expect(chatgpt.sentMessageRoots(document)).toEqual([]);
    expect(chatgpt.composer(document)).toBeNull();
  });
});

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
  it('finds the ChatGPT send button by its test id', () => {
    load('chatgpt-conversation.html');

    expect(chatgpt.sendButton?.(document)?.dataset.testid).toBe('send-button');
  });

  it('falls back to the ChatGPT submit id, then to the submit button of the composer form', () => {
    document.body.innerHTML =
      '<form><div contenteditable="true" id="prompt-textarea"></div>' +
      '<button id="composer-submit-button">x</button></form>';
    expect(chatgpt.sendButton?.(document)?.id).toBe('composer-submit-button');

    document.body.innerHTML =
      '<form id="search"><button type="submit" id="wrong">x</button></form>' +
      '<form><div contenteditable="true" id="prompt-textarea"></div>' +
      '<button type="button">+</button><button type="submit" id="send">x</button></form>';
    expect(chatgpt.sendButton?.(document)?.id).toBe('send');
  });

  it('finds the Claude.ai send button by its English or Polish name', () => {
    load('claude-conversation.html');
    expect(claude.sendButton?.(document)?.getAttribute('aria-label')).toBe('Send message');

    document.body.innerHTML =
      '<fieldset><div contenteditable="true" data-testid="chat-input" role="textbox"></div>' +
      '<button aria-label="Wyślij wiadomość">x</button></fieldset>';
    expect(claude.sendButton?.(document)?.getAttribute('aria-label')).toBe('Wyślij wiadomość');
  });

  it('finds nothing without a send button or a composer', () => {
    document.body.innerHTML = '<form><button type="submit">x</button></form>';

    expect(chatgpt.sendButton?.(document)).toBeNull();
    expect(claude.sendButton?.(document)).toBeNull();
  });
});
