// Further AI chats. Composers were seen on 2026-11-22 where the site shows one without an account
// (Kimi, Qwen, Mistral); answers and sent messages follow each site's known markup, with generic
// fallbacks, because reading them needs an account. Check them on the live sites.

import { simpleChat } from './simple';

export const kimi = simpleChat({
  id: 'kimi',
  hosts: ['www.kimi.com', 'kimi.com', 'kimi.moonshot.cn'],
  conversationPath: /^\/chat\/([0-9a-z-]+)/i,
  composer: [
    'div.chat-input-editor[contenteditable="true"]',
    '[role="textbox"][contenteditable="true"]',
  ],
  answers: [
    '.segment-assistant .markdown-container',
    '.segment-assistant',
    '.chat-content-item-assistant',
  ],
  sent: ['.segment-user .user-content', '.segment-user', '.chat-content-item-user'],
  send: ['.send-button-container', '.send-button'],
  stop: ['.send-button-container.stop', '.stop-button'],
});

export const deepseek = simpleChat({
  id: 'deepseek',
  hosts: ['chat.deepseek.com'],
  conversationPath: /^\/a\/chat\/s\/([0-9a-z-]+)/i,
  composer: ['textarea#chat-input', 'textarea[placeholder]'],
  answers: ['.ds-markdown', '[class*="ds-message"] .ds-markdown'],
  sent: ['[class*="ds-message"]:not(:has(.ds-markdown))'],
  // No reliable send button selector known: automatic masking sends again with Enter.
  send: [],
  stop: [],
});

export const mistral = simpleChat({
  id: 'mistral',
  hosts: ['chat.mistral.ai'],
  conversationPath: /^\/chat\/([0-9a-z-]+)/i,
  composer: [
    'form div.ProseMirror[contenteditable="true"]',
    'div.ProseMirror[contenteditable="true"]',
    'textarea',
  ],
  answers: ['[data-message-author-role="assistant"]', '.markdown-container-style', '.prose'],
  sent: ['[data-message-author-role="user"]'],
  send: ['form button[type="submit"]'],
  stop: [
    'button[aria-label="Zatrzymaj"]',
    'button[aria-label="Stop"]',
    'button[aria-label="Stop generation"]',
  ],
});

export const copilot = simpleChat({
  id: 'copilot',
  hosts: ['copilot.microsoft.com', 'copilot.com', 'www.copilot.com'],
  conversationPath: /\/chats\/([0-9a-z-]+)/i,
  composer: ['textarea#userInput', 'textarea[data-testid="composer-input"]', 'textarea'],
  answers: ['[data-content="ai-message"]', '[data-testid="ai-message"]'],
  sent: ['[data-content="user-message"]', '[data-testid="user-message"]'],
  send: [
    'button[data-testid="submit-button"]',
    'button[aria-label="Prześlij wiadomość"]',
    'button[aria-label="Submit message"]',
  ],
  stop: ['button[data-testid="stop-button"]', 'button[aria-label="Interrupt message"]'],
});

export const qwen = simpleChat({
  id: 'qwen',
  hosts: ['chat.qwen.ai'],
  conversationPath: /^\/c\/([0-9a-z-]+)/i,
  composer: ['textarea.message-input-textarea', 'textarea#chat-input', 'textarea'],
  answers: ['.response-message-content', '.chat-response-message', '[class*="response-message"]'],
  sent: ['.user-message-content', '.chat-user-message', '[class*="user-message"]'],
  send: ['#send-message-button', 'button.send-button'],
  stop: ['button.stop-button', '#stop-message-button'],
});
