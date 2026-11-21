// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { readText } from '~/lib/content/fields/text';
import { replaceFieldText } from '~/lib/content/fields/write';

function control<K extends 'textarea' | 'input'>(tag: K, value = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.value = value;
  document.body.append(element);
  return element;
}

/** Record the events of the given types that bubble up to the field's parent. */
function recordEvents(field: HTMLElement, ...types: string[]): Event[] {
  const events: Event[] = [];
  for (const type of types) {
    field.parentElement?.addEventListener(type, (event) => events.push(event));
  }
  return events;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('replaceFieldText on text controls', () => {
  it('replaces the value of a textarea, newlines included, and puts the caret at the end', async () => {
    const area = control('textarea', 'Jan Kowalski\nPESEL 50810112354');

    const ok = await replaceFieldText(area, 'Klient <OSOBA_1>\nPESEL <PESEL_1>');

    expect(ok).toBe(true);
    expect(area.value).toBe('Klient <OSOBA_1>\nPESEL <PESEL_1>');
    expect([area.selectionStart, area.selectionEnd]).toEqual([
      area.value.length,
      area.value.length,
    ]);
  });

  it('fires one bubbling input event, then one change event', async () => {
    const line = control('input', 'Jan Kowalski');
    const events = recordEvents(line, 'input', 'change');

    await replaceFieldText(line, '<OSOBA_1>');

    expect(events.map((event) => event.type)).toEqual(['input', 'change']);
    const [input] = events;
    expect(input).toBeInstanceOf(InputEvent);
    expect((input as InputEvent).inputType).toBe('insertReplacementText');
    expect(input?.target).toBe(line);
  });

  it('sets the value past a setter defined on the element, as React tracks it', async () => {
    const line = control('input', 'Jan Kowalski');
    let tracked = line.value;
    const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    Object.defineProperty(line, 'value', {
      configurable: true,
      get: () => native?.get?.call(line) as string,
      set: (value: string) => {
        tracked = value;
        native?.set?.call(line, value);
      },
    });

    expect(await replaceFieldText(line, '<OSOBA_1>')).toBe(true);

    expect(line.value).toBe('<OSOBA_1>');
    // The tracker still holds the old value, so React sees a change on the input event.
    expect(tracked).toBe('Jan Kowalski');
  });

  it('leaves a field that already holds the text alone', async () => {
    const area = control('textarea', '<OSOBA_1>');
    const events = recordEvents(area, 'input', 'change');

    expect(await replaceFieldText(area, '<OSOBA_1>')).toBe(true);

    expect(events).toEqual([]);
  });

  it('does not touch other fields', async () => {
    const first = control('input', 'Jan Kowalski');
    const second = control('textarea', 'Anna Nowak');

    await replaceFieldText(first, '<OSOBA_1>');

    expect(second.value).toBe('Anna Nowak');
  });
});

describe('replaceFieldText on text controls that cannot hold the text', () => {
  it('reports failure when a single-line input drops the newlines', async () => {
    const line = control('input', 'Jan Kowalski');

    expect(await replaceFieldText(line, '<OSOBA_1>\nPESEL <PESEL_1>')).toBe(false);
  });

  it('writes into an input type without a text selection', async () => {
    const email = control('input');
    email.type = 'email';
    email.value = 'jan.kowalski@example.com';
    email.setSelectionRange = () => {
      throw new DOMException('No selection for this input type.', 'InvalidStateError');
    };

    expect(await replaceFieldText(email, '<EMAIL_1>')).toBe(true);
    expect(email.value).toBe('<EMAIL_1>');
  });
});

/**
 * A contenteditable editor driven by `document.execCommand`, which happy-dom lacks. It keeps its
 * text as lines and draws each as a paragraph, as ProseMirror and Lexical do. A command replaces
 * the whole text while it is selected (after `selectAllChildren`) and appends at the caret
 * otherwise. An empty editor has no paragraph.
 */
interface EditorOptions {
  /** Lexical drops the newlines of `insertText`; ProseMirror makes paragraphs of them. */
  insertTextKeepsNewlines?: boolean;
  /** The editor handles a plain-text paste itself (Lexical). */
  handlesPaste?: boolean;
  /** The editor ignores every edit. */
  readOnly?: boolean;
}

interface FakeEditor {
  root: HTMLElement;
  /** Commands and events the editor received, in order. */
  log: string[];
}

function fakeEditor(initial: string, options: EditorOptions = {}): FakeEditor {
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.append(root);
  const log: string[] = [];
  let lines = initial.split('\n');
  const history: string[][] = [];

  const render = (): void => {
    const empty = lines.length === 1 && lines[0] === '';
    root.replaceChildren(
      ...(empty ? [] : lines).map((line) => {
        const paragraph = document.createElement('p');
        if (line) paragraph.textContent = line;
        else paragraph.append(document.createElement('br'));
        return paragraph;
      }),
    );
    document.getSelection()?.collapse(root, root.childNodes.length);
  };
  const selectedAll = (): boolean => document.getSelection()?.isCollapsed === false;
  const edit = (change: (current: string[]) => string[]): void => {
    if (options.readOnly) return;
    history.push(lines);
    lines = change(selectedAll() ? [''] : lines);
    render();
  };
  const appendText = (current: string[], text: string): string[] => [
    ...current.slice(0, -1),
    (current.at(-1) ?? '') + text,
  ];

  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    value: (command: string, _showUi: boolean, value?: string) => {
      log.push(value === undefined ? command : `${command}:${value}`);
      if (command === 'insertText') {
        const text = value ?? '';
        if (options.insertTextKeepsNewlines) {
          const [first = '', ...rest] = text.split('\n');
          edit((current) => [...appendText(current, first), ...rest]);
        } else {
          edit((current) => appendText(current, text.replaceAll('\n', '')));
        }
      } else if (command === 'insertParagraph') {
        edit((current) => [...current, '']);
      } else if (command === 'delete') {
        edit(() => ['']);
      }
      return !options.readOnly;
    },
  });
  root.addEventListener('beforeinput', (event) => {
    if (!(event instanceof InputEvent) || event.inputType !== 'historyUndo') return;
    log.push(`undo:${lines.join('\n')}`);
    lines = history.pop() ?? lines;
    render();
  });
  root.addEventListener('paste', (event) => {
    if (!(event instanceof ClipboardEvent)) return;
    const pasted = event.clipboardData?.getData('text/plain') ?? '';
    log.push(`paste:${pasted}`);
    if (!options.handlesPaste) return;
    event.preventDefault();
    edit(() => pasted.split('\n'));
  });
  render();
  return { root, log };
}

describe('replaceFieldText on contenteditable editors', () => {
  afterEach(() => {
    Reflect.deleteProperty(document, 'execCommand');
  });

  it('replaces the text with one insertText when the editor keeps newlines (ProseMirror)', async () => {
    const { root, log } = fakeEditor('Jan Kowalski\nPESEL 50810112354', {
      insertTextKeepsNewlines: true,
    });

    const ok = await replaceFieldText(root, '<OSOBA_1>\nPESEL <PESEL_1>');

    expect(ok).toBe(true);
    expect(readText(root)).toBe('<OSOBA_1>\nPESEL <PESEL_1>');
    expect(log).toEqual(['insertText:<OSOBA_1>\nPESEL <PESEL_1>']);
  });

  it('leaves the caret at the end of the new text', async () => {
    const { root } = fakeEditor('Jan Kowalski', { insertTextKeepsNewlines: true });

    await replaceFieldText(root, '<OSOBA_1>');

    const selection = document.getSelection();
    expect(selection?.isCollapsed).toBe(true);
    expect(selection?.toString()).toBe('');
    expect(root.contains(selection?.focusNode ?? null)).toBe(true);
  });

  it('clears the editor with delete when the new text is empty', async () => {
    const { root, log } = fakeEditor('Jan Kowalski', { insertTextKeepsNewlines: true });

    expect(await replaceFieldText(root, '')).toBe(true);

    expect(readText(root)).toBe('');
    expect(log).toEqual(['delete']);
  });

  it('undoes a newline-dropping insert and pastes instead (Lexical)', async () => {
    const { root, log } = fakeEditor('Jan Kowalski\nPESEL 50810112354', { handlesPaste: true });

    const ok = await replaceFieldText(root, '<OSOBA_1>\nPESEL <PESEL_1>');

    expect(ok).toBe(true);
    expect(readText(root)).toBe('<OSOBA_1>\nPESEL <PESEL_1>');
    // The paste starts from the original text, so a single undo afterwards brings it back.
    expect(log).toEqual([
      'insertText:<OSOBA_1>\nPESEL <PESEL_1>',
      'undo:<OSOBA_1>PESEL <PESEL_1>',
      'paste:<OSOBA_1>\nPESEL <PESEL_1>',
    ]);
  });

  it('types line by line when the editor neither keeps newlines nor handles a paste', async () => {
    const { root, log } = fakeEditor('Jan Kowalski\nIBAN PL61109010140000071219812874');

    const ok = await replaceFieldText(root, '<OSOBA_1>\n\nIBAN <IBAN_1>');

    expect(ok).toBe(true);
    expect(readText(root)).toBe('<OSOBA_1>\n\nIBAN <IBAN_1>');
    expect(log.slice(log.indexOf('paste:<OSOBA_1>\n\nIBAN <IBAN_1>') + 1)).toEqual([
      'insertText:<OSOBA_1>',
      'insertParagraph',
      'insertParagraph',
      'insertText:IBAN <IBAN_1>',
    ]);
  });

  it('starts line by line with delete when the first line is blank', async () => {
    const { root } = fakeEditor('Jan Kowalski');

    expect(await replaceFieldText(root, '\nPESEL <PESEL_1>')).toBe(true);

    expect(readText(root)).toBe('\nPESEL <PESEL_1>');
  });

  it('reports failure and asks for no undo when the editor takes no edit', async () => {
    const { root, log } = fakeEditor('Jan Kowalski\nPESEL 50810112354', { readOnly: true });

    const ok = await replaceFieldText(root, '<OSOBA_1>\nPESEL <PESEL_1>');

    expect(ok).toBe(false);
    expect(readText(root)).toBe('Jan Kowalski\nPESEL 50810112354');
    expect(log.some((entry) => entry.startsWith('undo:'))).toBe(false);
  });
});
