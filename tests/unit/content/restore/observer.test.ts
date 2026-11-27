// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LEGEND_ATTRIBUTE,
  RESTORED_ATTRIBUTE,
  type StopObserving,
  legendShadowRoot,
  observeMessages,
} from '~/lib/content/restore/observer';
import { RESTORED_HIGHLIGHT } from '~/lib/content/restore/marks';
import { createDeclensionCache } from '~/lib/shared/tokens';
import { chatgpt } from '~/lib/sites/chatgpt';
import type { SiteAdapter } from '~/lib/sites/types';
import { claude } from '~/lib/sites/claude';

const mapping = {
  '<OSOBA_1>': 'Jan Kowalski',
  '<PESEL_1>': '50810112354',
  '<IBAN_1>': 'PL61109010140000071219812874',
};

let stop: StopObserving | undefined;

// happy-dom lacks the Custom Highlight API; a Highlight is a set of ranges, the registry a map.
class FakeHighlight extends Set<AbstractRange> {}
let registry: Map<string, FakeHighlight>;

beforeEach(() => {
  registry = new Map();
  vi.stubGlobal('Highlight', FakeHighlight);
  vi.stubGlobal('CSS', { highlights: registry });
});

afterEach(() => {
  stop?.();
  stop = undefined;
  vi.unstubAllGlobals();
});

/** The text under each restored-value highlight inside `within`, in insertion order. */
function highlighted(within: Node = document.body): string[] {
  return [...(registry.get(RESTORED_HIGHLIGHT) ?? [])]
    .filter((range) => within.contains(range.startContainer))
    .map((range) => (range as Range).toString());
}

function load(name: string): void {
  document.body.innerHTML = readFileSync(
    resolve(import.meta.dirname, '../../../fixtures/sites', name),
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
    stop = observeMessages(chatgpt, document, () => mapping);
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
    stop = observeMessages(chatgpt, document, () => mapping);
    expect(paragraph.firstChild).toBe(textNode);
    expect(paragraph.childNodes).toHaveLength(1);
    expect(paragraph.hasAttribute(RESTORED_ATTRIBUTE)).toBe(true);
    expect(paragraph.title).toBe('AInonim\nJan Kowalski – model napisał <OSOBA_1>');
  });

  it('highlights exactly the restored values, adding no character to copy', () => {
    load('chatgpt-conversation.html');
    stop = observeMessages(chatgpt, document, () => mapping);
    const answer = element('[data-response-body]');
    expect(highlighted(answer)).toEqual(['Jan Kowalski', '50810112354']);
    expect(answer.querySelector('strong')?.childNodes).toHaveLength(1);
    expect(answer.querySelectorAll('span')).toHaveLength(0);
  });

  it('never touches the composer', () => {
    load('chatgpt-conversation.html');
    const composer = element('[data-composer-markdown]').innerHTML;
    stop = observeMessages(chatgpt, document, () => mapping);
    expect(element('[data-composer-markdown]').innerHTML).toBe(composer);
    expect(element('[data-composer-markdown]').hasAttribute('title')).toBe(false);
  });

  it('is idempotent across refreshes', () => {
    load('chatgpt-conversation.html');
    stop = observeMessages(chatgpt, document, () => mapping);
    const html = element('[data-response-body]').innerHTML;
    stop.refresh();
    stop.refresh();
    expect(element('[data-response-body]').innerHTML).toBe(html);
  });

  it('puts the tokens back and removes the highlight when stopped', () => {
    load('chatgpt-conversation.html');
    const html = document.body.innerHTML;
    observeMessages(chatgpt, document, () => mapping)();
    expect(document.body.innerHTML).toBe(html);
    expect(registry.has(RESTORED_HIGHLIGHT)).toBe(false);
  });

  it('restores without highlights when the browser lacks the Highlight API', () => {
    vi.unstubAllGlobals();
    load('chatgpt-conversation.html');
    stop = observeMessages(chatgpt, document, () => mapping);
    expect(element('[data-response-body] p').textContent).toBe('Dzień dobry, Jan Kowalski!');
  });
});

describe('peek display', () => {
  it('keeps the tokens, highlights them and names the originals on hover', () => {
    load('chatgpt-conversation.html');
    const html = element('[data-response-body]').innerHTML;
    stop = observeMessages(chatgpt, document, () => mapping, { peek: () => true });
    const answer = element('[data-response-body]');
    expect(answer.innerHTML.replace(/ (title|data-ainonim-restored)="[^"]*"/g, '')).toBe(html);
    expect(highlighted(answer)).toEqual(['<OSOBA_1>', '<PESEL_1>']);
    expect(element('[data-response-body] p').title).toBe('AInonim\n<OSOBA_1> = Jan Kowalski');
  });

  it('switches between originals and tokens on refresh', () => {
    load('chatgpt-conversation.html');
    let peek = false;
    stop = observeMessages(chatgpt, document, () => mapping, { peek: () => peek });
    const paragraph = element('[data-response-body] p');
    expect(paragraph.textContent).toBe('Dzień dobry, Jan Kowalski!');

    peek = true;
    stop.refresh();
    expect(paragraph.textContent).toBe('Dzień dobry, <OSOBA_1>!');
    expect(paragraph.title).toBe('AInonim\n<OSOBA_1> = Jan Kowalski');

    peek = false;
    stop.refresh();
    expect(paragraph.textContent).toBe('Dzień dobry, Jan Kowalski!');
    expect(paragraph.title).toBe('AInonim\nJan Kowalski – model napisał <OSOBA_1>');
  });

  it('marks a token split across two text nodes in both of them', () => {
    document.body.innerHTML =
      '<div data-message-author-role="assistant"><div data-response-body><p></p></div></div>';
    const paragraph = element('[data-response-body] p');
    paragraph.append('Pan <OSO', 'BA_1> pisze');
    stop = observeMessages(chatgpt, document, () => mapping, { peek: () => true });
    expect(paragraph.textContent).toBe('Pan <OSOBA_1> pisze');
    expect(highlighted(paragraph)).toEqual(['<OSO', 'BA_1>']);
  });

  it('removes highlights and titles when stopped', () => {
    load('chatgpt-conversation.html');
    const html = document.body.innerHTML;
    observeMessages(chatgpt, document, () => mapping, { peek: () => true })();
    expect(document.body.innerHTML).toBe(html);
    expect(registry.has(RESTORED_HIGHLIGHT)).toBe(false);
  });
});

describe('a sent message', () => {
  it('restores the ChatGPT user bubble and labels it with the tokens sent', () => {
    load('chatgpt-conversation.html');
    stop = observeMessages(chatgpt, document, () => mapping);
    const text = element('[data-user-message-bubble] div');
    expect(text.textContent).toBe('Napisz do Jan Kowalski, PESEL 50810112354.');
    expect(text.title).toBe(
      'AInonim\nJan Kowalski – wysłano jako <OSOBA_1>\n50810112354 – wysłano jako <PESEL_1>',
    );
    expect(text.hasAttribute(RESTORED_ATTRIBUTE)).toBe(true);
  });

  it('restores the Claude.ai user message, also one added later', async () => {
    load('claude-conversation.html');
    stop = observeMessages(claude, document, () => mapping);
    expect(element('[data-testid="user-message"] p').textContent).toBe(
      'Napisz do Jan Kowalski, PESEL 50810112354.',
    );
    element('main').insertAdjacentHTML(
      'beforeend',
      '<div data-testid="user-message"><p id="later">Jeszcze &lt;PESEL_1&gt;</p></div>',
    );
    await settle();
    expect(element('#later').textContent).toBe('Jeszcze 50810112354');
    expect(element('#later').title).toBe('AInonim\n50810112354 – wysłano jako <PESEL_1>');
  });

  it('only replaces tokens of the conversation mapping', () => {
    load('chatgpt-conversation.html');
    stop = observeMessages(chatgpt, document, () => ({ '<OSOBA_1>': 'Jan Kowalski' }));
    expect(element('[data-user-message-bubble] div').textContent).toBe(
      'Napisz do Jan Kowalski, PESEL <PESEL_1>.',
    );
  });

  it('leaves an editor inside the message (edit mode) alone, without a legend', () => {
    document.body.innerHTML =
      '<div data-message-author-role="user">' +
      '<p id="sent">Do &lt;OSOBA_1&gt;</p>' +
      '<div id="edit" contenteditable="true"><p>Do &lt;OSOBA_1&gt;</p></div>' +
      '<textarea id="area">&lt;OSOBA_1&gt;</textarea></div>';
    stop = observeMessages(chatgpt, document, () => mapping);
    expect(element('#sent').textContent).toBe('Do Jan Kowalski');
    expect(element('#edit').textContent).toBe('Do <OSOBA_1>');
    expect((element('#area') as HTMLTextAreaElement).value).toBe('<OSOBA_1>');
    expect(document.querySelector(`[${LEGEND_ATTRIBUTE}]`)).toBeNull();
  });

  it('puts the tokens back when stopped', () => {
    load('claude-conversation.html');
    const html = element('[data-testid="user-message"]').innerHTML;
    observeMessages(claude, document, () => mapping)();
    expect(element('[data-testid="user-message"]').innerHTML).toBe(html);
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
    stop = observeMessages(chatgpt, document, () => mapping, { declensions });
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
    stop = observeMessages(claude, document, () => mapping);
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
    stop = observeMessages(claude, document, () => mapping);
    paragraph.append('Dzień dobry, <OSO');
    await settle();
    expect(paragraph.textContent).toBe('Dzień dobry, <OSO');
  });

  it('restores a token split across text nodes', async () => {
    const paragraph = streamingParagraph();
    stop = observeMessages(claude, document, () => mapping);
    paragraph.append(document.createTextNode('Witaj <OSO'));
    await settle();
    paragraph.append(document.createTextNode('BA_1>, PESEL <PESEL_1>'));
    await settle();
    expect(paragraph.textContent).toBe('Witaj Jan Kowalski, PESEL 50810112354');
    expect(paragraph.title).toBe(
      'AInonim\nJan Kowalski – model napisał <OSOBA_1>\n50810112354 – model napisał <PESEL_1>',
    );
    expect(highlighted(paragraph)).toEqual(['Jan Kowalski', '50810112354']);
  });

  it('restores an answer added after the observer started', async () => {
    load('claude-conversation.html');
    stop = observeMessages(claude, document, () => mapping);
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
    stop = observeMessages(claude, document, () => mapping);
    const paragraph = element('.standard-markdown p');
    const node = paragraph.firstChild as Text;
    node.data = 'Ponownie: <OSOBA_1>';
    await settle();
    expect(paragraph.textContent).toBe('Ponownie: Jan Kowalski');
    expect(highlighted(paragraph)).toEqual(['Jan Kowalski']);
  });

  it('restores again when the framework replaces the element', async () => {
    load('claude-conversation.html');
    stop = observeMessages(claude, document, () => mapping);
    const markdown = element('.standard-markdown');
    markdown.innerHTML = '<p>Odświeżone: &lt;PESEL_1&gt;</p>';
    await settle();
    expect(markdown.textContent).toBe('Odświeżone: 50810112354');
  });

  it('leaves the composer alone while streaming and skips re-querying roots', async () => {
    load('claude-conversation.html');
    const answerRoots = vi.spyOn(claude, 'answerRoots');
    const sentRoots = vi.spyOn(claude, 'sentMessageRoots');
    const composer = element('[data-testid="chat-input"] p');
    stop = observeMessages(claude, document, () => mapping);
    answerRoots.mockClear();
    sentRoots.mockClear();

    composer.append(document.createTextNode(' i <PESEL_1>'));
    await settle();
    expect(composer.textContent).toBe('Pytanie o <OSOBA_1> i <PESEL_1>');
    expect(answerRoots).not.toHaveBeenCalled();
    expect(sentRoots).not.toHaveBeenCalled();

    // Streaming characterData in an existing answer reuses known roots without re-querying DOM.
    const streamed = element('.standard-markdown p').firstChild as Text;
    streamed.data = 'Streaming: <OSOBA_1>';
    await settle();
    expect(element('.standard-markdown p').textContent).toBe('Streaming: Jan Kowalski');
    expect(answerRoots).not.toHaveBeenCalled();
    expect(sentRoots).not.toHaveBeenCalled();
  });

  it('drops the highlight of a removed message', async () => {
    load('claude-conversation.html');
    stop = observeMessages(claude, document, () => mapping);
    expect(highlighted()).toContain('Jan Kowalski');
    element('main').replaceChildren();
    await settle();
    expect(highlighted()).toEqual([]);
  });
});

describe('the ChatGPT writing block', () => {
  it('leaves the editor and the copy text unmutated and shows a legend outside the block', async () => {
    load('chatgpt-writing-block.html');
    const block = element('[data-testid="chatgpt-writing-block"]');
    const editor = element('[aria-label="Zacznij pisać"]');
    const editorHtml = editor.innerHTML;
    const copyText = block.dataset.markdownCopyText;

    stop = observeMessages(chatgpt, document, () => mapping);

    expect(editor.innerHTML).toBe(editorHtml);
    expect(block.dataset.markdownCopyText).toBe(copyText);
    expect(element('.markdown > p').textContent).toBe('Oto e-mail do Jan Kowalski:');
    const legend = block.previousElementSibling;
    expect(legend?.hasAttribute(LEGEND_ATTRIBUTE)).toBe(true);
    expect(legend?.shadowRoot).toBeNull();
    expect(legend && legendShadowRoot(legend)?.textContent).toContain('<OSOBA_1> → Jan Kowalski');
    expect(legend && legendShadowRoot(legend)?.textContent).toContain(
      '<IBAN_1> → PL61109010140000071219812874',
    );
    expect(chatgpt.isAnswerElement(legend as Element)).toBe(true);

    // Text streamed into the editor updates the legend, still without touching the editor.
    editor.insertAdjacentHTML('beforeend', '<p>PESEL &lt;PESEL_1&gt;</p>');
    await settle();
    expect(editor.textContent).toContain('PESEL <PESEL_1>');
    expect(legend && legendShadowRoot(legend)?.textContent).toContain('<PESEL_1> → 50810112354');

    stop();
    stop = undefined;
    expect(document.querySelector(`[${LEGEND_ATTRIBUTE}]`)).toBeNull();
  });
});

describe('a mapping that changes', () => {
  it('puts the tokens back and drops labels and legends once the mapping is deleted', () => {
    load('chatgpt-writing-block.html');
    let current: Record<string, string> = mapping;
    stop = observeMessages(chatgpt, document, () => current);
    const paragraph = element('.markdown > p');
    expect(paragraph.title).not.toBe('');

    current = {};
    stop.refresh();

    expect(paragraph.textContent).toBe('Oto e-mail do <OSOBA_1>:');
    expect(paragraph.hasAttribute('title')).toBe(false);
    expect(paragraph.hasAttribute(RESTORED_ATTRIBUTE)).toBe(false);
    expect(document.querySelector(`[${LEGEND_ATTRIBUTE}]`)).toBeNull();
  });

  it('keeps one legend for the block across refreshes', () => {
    load('chatgpt-writing-block.html');
    stop = observeMessages(chatgpt, document, () => mapping);
    const legend = document.querySelector(`[${LEGEND_ATTRIBUTE}]`);
    const content = legend ? legendShadowRoot(legend)?.textContent : undefined;

    stop.refresh();

    expect(document.querySelectorAll(`[${LEGEND_ATTRIBUTE}]`)).toHaveLength(1);
    expect(document.querySelector(`[${LEGEND_ATTRIBUTE}]`)).toBe(legend);
    expect(legend && legendShadowRoot(legend)?.textContent).toBe(content);
  });

  it('removes the legend of a block that left the page', async () => {
    load('chatgpt-writing-block.html');
    stop = observeMessages(chatgpt, document, () => mapping);
    expect(document.querySelector(`[${LEGEND_ATTRIBUTE}]`)).not.toBeNull();

    element('[data-testid="chatgpt-writing-block"]').remove();
    await settle();

    expect(document.querySelector(`[${LEGEND_ATTRIBUTE}]`)).toBeNull();
  });
});

describe('pages the adapters did not foresee', () => {
  /** An adapter over hand-written markup: `.answer` and `.sent` elements, no composer. */
  const plain: SiteAdapter = {
    id: 'plain',
    matches: () => true,
    conversationId: () => null,
    composer: () => null,
    answerRoots: (doc) => [...doc.querySelectorAll<HTMLElement>('.answer')],
    sentMessageRoots: (doc) => [...doc.querySelectorAll<HTMLElement>('.sent')],
    isAnswerElement: () => false,
    isStreaming: () => false,
  };

  it('never takes over a title the site set itself', () => {
    document.body.innerHTML =
      '<div class="answer"><p title="Odpowiedź">Pan &lt;OSOBA_1&gt;</p></div>';
    stop = observeMessages(plain, document, () => mapping);

    const paragraph = element('.answer p');
    expect(paragraph.textContent).toBe('Pan Jan Kowalski');
    expect(paragraph.title).toBe('Odpowiedź');
  });

  it('restores around comments and SVG icons', () => {
    document.body.innerHTML =
      '<div class="answer"><p>Pan <!-- x --><svg></svg>&lt;OSOBA_1&gt;</p></div>';
    stop = observeMessages(plain, document, () => mapping);

    expect(element('.answer p').textContent).toBe('Pan Jan Kowalski');
  });

  it('puts the legend right before an editor in an answer when the site has no block for it', () => {
    document.body.innerHTML =
      '<div class="answer"><div contenteditable="true"><p>&lt;PESEL_1&gt;</p></div></div>';
    stop = observeMessages(plain, document, () => mapping);

    const editor = element('[contenteditable]');
    expect(editor.textContent).toBe('<PESEL_1>');
    const legend = editor.previousElementSibling;
    expect(legend?.hasAttribute(LEGEND_ATTRIBUTE)).toBe(true);
    expect(legend && legendShadowRoot(legend)?.textContent).toContain('<PESEL_1> → 50810112354');
  });

  it('annotates an answer that is itself inside an editor, and leaves a sent one there alone', () => {
    document.body.innerHTML =
      '<div contenteditable="true"><div class="answer">&lt;OSOBA_1&gt;</div>' +
      '<div class="sent">&lt;PESEL_1&gt;</div></div>';
    stop = observeMessages(plain, document, () => mapping);

    expect(element('.answer').textContent).toBe('<OSOBA_1>');
    expect(element('.sent').textContent).toBe('<PESEL_1>');
    const legends = document.querySelectorAll(`[${LEGEND_ATTRIBUTE}]`);
    expect(legends).toHaveLength(1);
    expect(legends[0] && legendShadowRoot(legends[0])?.textContent).toContain(
      '<OSOBA_1> → Jan Kowalski',
    );
  });

  it('leaves the page as it is when reading the mapping fails', () => {
    document.body.innerHTML = '<div class="answer"><p>Pan &lt;OSOBA_1&gt;</p></div>';
    stop = observeMessages(plain, document, () => {
      throw new Error('Extension context invalidated.');
    });

    expect(element('.answer p').textContent).toBe('Pan <OSOBA_1>');
  });
});

describe('after stopping', () => {
  it('ignores refreshes and a second stop', () => {
    load('chatgpt-conversation.html');
    const html = document.body.innerHTML;
    const stopped = observeMessages(chatgpt, document, () => mapping);

    stopped();
    stopped.refresh();
    stopped();

    expect(document.body.innerHTML).toBe(html);
  });
});
