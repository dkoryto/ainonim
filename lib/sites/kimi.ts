// Kimi (Moonshot AI). The composer was seen on 2026-11-22 without an account; answers and sent
// messages follow the site's known markup, with generic fallbacks, because reading them needs an
// account. Check them on the live site.

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
