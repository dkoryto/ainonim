// Microsoft Copilot. Answers and sent messages follow the site's known markup, with generic
// fallbacks, because reading them needs an account. Check them on the live site.

import { simpleChat } from './simple';

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
