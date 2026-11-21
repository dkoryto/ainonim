// DeepSeek. Answers and sent messages follow the site's known markup, with generic fallbacks,
// because reading them needs an account. Check them on the live site.

import { simpleChat } from './simple';

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
