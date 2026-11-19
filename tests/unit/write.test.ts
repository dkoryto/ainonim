// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { replaceFieldText } from '~/lib/fields/write';

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
