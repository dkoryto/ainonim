// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  LEGEND_ATTRIBUTE,
  RESTORED_ATTRIBUTE,
  type StopObserving,
  observeAnswers,
} from '~/lib/restore/observer';
import { createDeclensionCache } from '~/lib/restore/tokens';
import { chatgpt } from '~/lib/sites/chatgpt';
import { claude } from '~/lib/sites/claude';

const mapping = {
  '<OSOBA_1>': 'Jan Kowalski',
  '<PESEL_1>': '50810112354',
  '<IBAN_1>': 'PL61109010140000071219812874',
};

let stop: StopObserving | undefined;

afterEach(() => {
  stop?.();
  stop = undefined;
});

function load(name: string): void {
  document.body.innerHTML = readFileSync(
    resolve(import.meta.dirname, '../fixtures/sites', name),
    'utf8',
  );
}

function element(selector: string): HTMLElement {
  const found = document.querySelector(selector);
  if (!(found instanceof HTMLElement)) throw new Error(`No ${selector} in the fixture`);
  return found;
}

/** Let the MutationObserver deliver its records. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('a static answer', () => {
  it('restores tokens in the answer text and leaves unknown ones', () => {
    load('chatgpt-conversation.html');
    stop = observeAnswers(chatgpt, document, () => mapping);
    const answer = element('[data-response-body]');
    expect(answer.querySelector('p')?.textContent).toBe('Dzień dobry, Jan Kowalski!');
    expect(answer.querySelectorAll('p')[1]?.textContent).toBe(
      'Pana PESEL to 50810112354, a <NIEZNANY_9> zostaje.',
    );
  });

  it('keeps the DOM structure and marks restored text with the token for hover', () => {
    load('chatgpt-conversation.html');
    const paragraph = element('[data-response-body] p');
    const textNode = paragraph.firstChild;
    stop = observeAnswers(chatgpt, document, () => mapping);
    expect(paragraph.firstChild).toBe(textNode);
    expect(paragraph.childNodes).toHaveLength(1);
    expect(paragraph.hasAttribute(RESTORED_ATTRIBUTE)).toBe(true);
    expect(paragraph.title).toBe('AInonim: <OSOBA_1>');
  });

  it('never touches the composer or the user message', () => {
    load('chatgpt-conversation.html');
    const composer = element('[data-composer-markdown]').innerHTML;
    const user = element('[data-user-message-bubble]').innerHTML;
    stop = observeAnswers(chatgpt, document, () => mapping);
    expect(element('[data-composer-markdown]').innerHTML).toBe(composer);
    expect(element('[data-user-message-bubble]').innerHTML).toBe(user);
  });

  it('is idempotent across refreshes', () => {
    load('chatgpt-conversation.html');
    stop = observeAnswers(chatgpt, document, () => mapping);
    const html = element('[data-response-body]').innerHTML;
    stop.refresh();
    stop.refresh();
    expect(element('[data-response-body]').innerHTML).toBe(html);
  });

  it('puts the tokens back when stopped', () => {
    load('chatgpt-conversation.html');
    const html = element('[data-response-body]').innerHTML;
    observeAnswers(chatgpt, document, () => mapping)();
    expect(element('[data-response-body]').innerHTML).toBe(html);
  });
});

describe('cased tokens', () => {
  it('repaints when the declension arrives', async () => {
    load('chatgpt-conversation.html');
    const requested: string[] = [];
    const declensions = createDeclensionCache((token, original) => {
      requested.push(`${token} ${original}`);
      return Promise.resolve('Janie Kowalski');
    });
    stop = observeAnswers(chatgpt, document, () => mapping, { declensions });
    const item = element('[data-response-body] li');
    expect(item.textContent).toBe('Witaj, <OSOBA_1:wołacz>.');
    await settle();
    expect(item.textContent).toBe('Witaj, Janie Kowalski.');
    expect(requested).toEqual(['<OSOBA_1:wołacz> Jan Kowalski']);
  });
});

describe('a streamed answer', () => {
  function streamingParagraph(): HTMLElement {
    load('claude-conversation.html');
    return element('[data-is-streaming="true"] p');
  }

  it('restores a token streamed in chunks of one text node', async () => {
    const paragraph = streamingParagraph();
    const node = document.createTextNode('');
    paragraph.append(node);
    stop = observeAnswers(claude, document, () => mapping);
    // The framework keeps its own copy of the text and writes the whole of it on every chunk.
    let written = '';
    for (const chunk of ['Dzień dobry, <OSO', 'BA_1>! PESEL: <PES', 'EL_1>.']) {
      written += chunk;
      node.data = written;
      await settle();
    }
    expect(paragraph.textContent).toBe('Dzień dobry, Jan Kowalski! PESEL: 50810112354.');
  });

  it('shows a half-streamed token as written until it is complete', async () => {
    const paragraph = streamingParagraph();
    stop = observeAnswers(claude, document, () => mapping);
    paragraph.append('Dzień dobry, <OSO');
    await settle();
    expect(paragraph.textContent).toBe('Dzień dobry, <OSO');
  });

  it('restores a token split across text nodes', async () => {
    const paragraph = streamingParagraph();
    stop = observeAnswers(claude, document, () => mapping);
    paragraph.append(document.createTextNode('Witaj <OSO'));
    await settle();
    paragraph.append(document.createTextNode('BA_1>, PESEL <PESEL_1>'));
    await settle();
    expect(paragraph.textContent).toBe('Witaj Jan Kowalski, PESEL 50810112354');
    expect(paragraph.title).toBe('AInonim: <OSOBA_1>, <PESEL_1>');
  });

  it('restores an answer added after the observer started', async () => {
    load('claude-conversation.html');
    stop = observeAnswers(claude, document, () => mapping);
    element('main').insertAdjacentHTML(
      'beforeend',
      '<div data-testid="assistant-message" data-is-streaming="true">' +
        '<div class="standard-markdown"><p>Nowa: &lt;OSOBA_1&gt;</p></div></div>',
    );
    await settle();
    expect(document.querySelectorAll('[data-testid="assistant-message"] p')[2]?.textContent).toBe(
      'Nowa: Jan Kowalski',
    );
  });
});

describe('a re-rendered answer', () => {
  it('restores again when the framework rewrites a text node', async () => {
    load('claude-conversation.html');
    stop = observeAnswers(claude, document, () => mapping);
    const paragraph = element('.standard-markdown p');
    const node = paragraph.firstChild as Text;
    node.data = 'Ponownie: <OSOBA_1>';
    await settle();
    expect(paragraph.textContent).toBe('Ponownie: Jan Kowalski');
  });

  it('restores again when the framework replaces the element', async () => {
    load('claude-conversation.html');
    stop = observeAnswers(claude, document, () => mapping);
    const markdown = element('.standard-markdown');
    markdown.innerHTML = '<p>Odświeżone: &lt;PESEL_1&gt;</p>';
    await settle();
    expect(markdown.textContent).toBe('Odświeżone: 50810112354');
  });

  it('leaves the composer and the user message alone while streaming', async () => {
    load('claude-conversation.html');
    const composer = element('[data-testid="chat-input"] p');
    const user = element('[data-testid="user-message"] p');
    stop = observeAnswers(claude, document, () => mapping);
    composer.append(document.createTextNode(' i <PESEL_1>'));
    user.append(document.createTextNode(' <PESEL_1>'));
    await settle();
    expect(composer.textContent).toContain('<OSOBA_1> i <PESEL_1>');
    expect(user.textContent).toContain('PESEL <PESEL_1>. <PESEL_1>');
  });
});

describe('the ChatGPT writing block', () => {
  it('leaves the editor and the copy text unmutated and shows a legend outside the block', async () => {
    load('chatgpt-writing-block.html');
    const block = element('[data-testid="chatgpt-writing-block"]');
    const editor = element('[aria-label="Zacznij pisać"]');
    const editorHtml = editor.innerHTML;
    const copyText = block.dataset.markdownCopyText;

    stop = observeAnswers(chatgpt, document, () => mapping);

    expect(editor.innerHTML).toBe(editorHtml);
    expect(block.dataset.markdownCopyText).toBe(copyText);
    expect(element('.markdown > p').textContent).toBe('Oto e-mail do Jan Kowalski:');
    const legend = block.previousElementSibling;
    expect(legend?.hasAttribute(LEGEND_ATTRIBUTE)).toBe(true);
    expect(legend?.shadowRoot?.textContent).toContain('<OSOBA_1> → Jan Kowalski');
    expect(legend?.shadowRoot?.textContent).toContain('<IBAN_1> → PL61109010140000071219812874');
    expect(chatgpt.isAnswerElement(legend as Element)).toBe(true);

    // Text streamed into the editor updates the legend, still without touching the editor.
    editor.insertAdjacentHTML('beforeend', '<p>PESEL &lt;PESEL_1&gt;</p>');
    await settle();
    expect(editor.textContent).toContain('PESEL <PESEL_1>');
    expect(legend?.shadowRoot?.textContent).toContain('<PESEL_1> → 50810112354');

    stop();
    stop = undefined;
    expect(document.querySelector(`[${LEGEND_ATTRIBUTE}]`)).toBeNull();
  });
});
