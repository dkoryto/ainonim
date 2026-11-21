// Qwen Chat. The composer was seen on 2026-11-22 without an account; answers and sent messages
// follow the site's known markup, with generic fallbacks, because reading them needs an account.
// Check them on the live site.

import { simpleChat } from './simple';

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
