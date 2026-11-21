// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { adapterFor } from '~/lib/sites/index';
import { copilot, deepseek, kimi, mistral, qwen } from '~/lib/sites/more-chats';

describe('more chats', () => {
  it('picks each adapter by host', () => {
    expect(adapterFor('https://www.kimi.com/chat/abc')?.id).toBe('kimi');
    expect(adapterFor('https://kimi.moonshot.cn/')?.id).toBe('kimi');
    expect(adapterFor('https://chat.deepseek.com/a/chat/s/abc')?.id).toBe('deepseek');
    expect(adapterFor('https://chat.mistral.ai/chat/abc')?.id).toBe('mistral');
    expect(adapterFor('https://copilot.microsoft.com/chats/abc')?.id).toBe('copilot');
    expect(adapterFor('https://chat.qwen.ai/c/abc')?.id).toBe('qwen');
  });

  it('reads the conversation ids', () => {
    expect(kimi.conversationId(new URL('https://www.kimi.com/chat/d1a2-b3'))).toBe('d1a2-b3');
    expect(deepseek.conversationId(new URL('https://chat.deepseek.com/a/chat/s/9f8e'))).toBe(
      '9f8e',
    );
    expect(mistral.conversationId(new URL('https://chat.mistral.ai/chat/7c6b'))).toBe('7c6b');
    expect(copilot.conversationId(new URL('https://copilot.microsoft.com/chats/AbC1'))).toBe(
      'AbC1',
    );
    expect(qwen.conversationId(new URL('https://chat.qwen.ai/c/5d4e'))).toBe('5d4e');
    expect(qwen.conversationId(new URL('https://chat.qwen.ai/'))).toBeNull();
  });

  it('finds the Kimi composer, answers, sent messages and send button', () => {
    document.body.innerHTML = `
      <div class="segment-user"><div class="user-content">Do &lt;OSOBA_1&gt;</div></div>
      <div class="segment-assistant"><div class="markdown-container"><p>Dzień dobry, &lt;OSOBA_1&gt;</p></div></div>
      <div class="chat-input-editor" contenteditable="true" role="textbox"><p>x</p></div>
      <div class="send-button-container"></div>`;
    expect(kimi.composer(document)?.className).toBe('chat-input-editor');
    expect(kimi.answerRoots(document)).toHaveLength(1);
    expect(kimi.sentMessageRoots(document)).toHaveLength(1);
    expect(kimi.sendButton?.(document)?.className).toBe('send-button-container');
    expect(kimi.isAnswerElement(document.querySelector('.markdown-container p') as Element)).toBe(
      true,
    );
  });

  it('finds the Qwen textarea and leaves DeepSeek without a send button', () => {
    document.body.innerHTML =
      '<textarea class="message-input-textarea" placeholder="Ask Qwen"></textarea>' +
      '<button id="send-message-button">↑</button>';
    expect(qwen.composer(document)?.tagName).toBe('TEXTAREA');
    expect(qwen.sendButton?.(document)?.id).toBe('send-message-button');
    expect(deepseek.sendButton?.(document)).toBeNull();
  });

  it('never streams without a stop button', () => {
    document.body.innerHTML = '<div data-message-author-role="assistant"><p>a</p></div>';
    const [answer] = mistral.answerRoots(document);
    expect(answer && mistral.isStreaming(answer)).toBe(false);
  });
});
