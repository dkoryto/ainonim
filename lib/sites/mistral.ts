// Mistral Le Chat. The composer was seen on 2026-11-22 without an account; answers and sent
// messages follow the site's known markup, with generic fallbacks, because reading them needs an
// account. Check them on the live site.

import { simpleChat } from './simple';

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
