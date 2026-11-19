// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditableField } from '~/lib/fields/text';
import { watchFields, type WatchOptions } from '~/lib/fields/watch';

let stop: (() => void) | undefined;
let onText: ReturnType<typeof vi.fn<(field: EditableField, text: string) => void>>;

function watch(options: Partial<WatchOptions> = {}): void {
  stop = watchFields({ onText, ...options });
}

function mount(html: string, selector: string, parent: Node = document.body): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  parent.appendChild(wrapper);
  const element = wrapper.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`No ${selector} in fixture`);
  return element;
}

function control(
  html: string,
  selector: string,
  parent?: Node,
): HTMLInputElement | HTMLTextAreaElement {
  const element = mount(html, selector, parent);
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
    throw new Error(`${selector} is not a text control`);
  }
  return element;
}

function type(field: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
}

beforeEach(() => {
  vi.useFakeTimers();
  onText = vi.fn<(field: EditableField, text: string) => void>();
});

afterEach(() => {
  stop?.();
  stop = undefined;
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('watchFields', () => {
  it('reports the text of a textarea after the default debounce', () => {
    watch();
    const area = control('<textarea></textarea>', 'textarea');
    type(area, 'Jan Kowalski');
    vi.advanceTimersByTime(399);
    expect(onText).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onText).toHaveBeenCalledExactlyOnceWith(area, 'Jan Kowalski');
  });

  it('restarts the debounce on every edit and reports only the settled text', () => {
    watch({ debounceMs: 100 });
    const input = control('<input type="email">', 'input');
    type(input, 'j');
    vi.advanceTimersByTime(90);
    type(input, 'jan@');
    vi.advanceTimersByTime(90);
    type(input, 'jan@example.pl');
    vi.advanceTimersByTime(100);
    expect(onText).toHaveBeenCalledExactlyOnceWith(input, 'jan@example.pl');
  });

  it('debounces each field separately', () => {
    watch({ debounceMs: 100 });
    const first = control('<input id="a">', '#a');
    const second = control('<input id="b">', '#b');
    type(first, 'one');
    vi.advanceTimersByTime(60);
    type(second, 'two');
    vi.advanceTimersByTime(40);
    expect(onText).toHaveBeenCalledExactlyOnceWith(first, 'one');
    vi.advanceTimersByTime(60);
    expect(onText).toHaveBeenLastCalledWith(second, 'two');
    expect(onText).toHaveBeenCalledTimes(2);
  });

  it('reports the root of a contenteditable editor with its text', () => {
    watch();
    const root = mount(
      '<div contenteditable="true"><p>Pan <b>Jan</b></p><p>Kowalski</p></div>',
      '[contenteditable]',
    );
    root.querySelector('b')?.dispatchEvent(new Event('input', { bubbles: true }));
    vi.runAllTimers();
    expect(onText).toHaveBeenCalledExactlyOnceWith(root, 'Pan Jan\nKowalski');
  });

  it('sees fields inside an open shadow root', () => {
    watch();
    const host = mount('<div id="host"></div>', '#host');
    const area = control('<textarea></textarea>', 'textarea', host.attachShadow({ mode: 'open' }));
    type(area, 'PESEL 50810112354');
    vi.runAllTimers();
    expect(onText).toHaveBeenCalledExactlyOnceWith(area, 'PESEL 50810112354');
  });

  it('reports values set by a script that dispatches only change', () => {
    watch();
    const input = control('<input>', 'input');
    input.value = 'Anna Nowak';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    vi.runAllTimers();
    expect(onText).toHaveBeenCalledExactlyOnceWith(input, 'Anna Nowak');
  });

  it('does not report the same text twice for a field', () => {
    watch();
    const area = control('<textarea></textarea>', 'textarea');
    type(area, 'abc');
    vi.runAllTimers();
    type(area, 'abc');
    vi.runAllTimers();
    type(area, 'abcd');
    vi.runAllTimers();
    type(area, 'abc');
    vi.runAllTimers();
    expect(onText.mock.calls.map(([, text]) => text)).toEqual(['abc', 'abcd', 'abc']);
  });

  it('ignores excluded fields and inputs that are not text', () => {
    watch();
    const password = control('<input type="password">', 'input');
    const card = control('<input autocomplete="cc-number">', 'input');
    const number = control('<input type="number">', 'input');
    type(password, 'secret');
    type(card, '4111111111111111');
    type(number, '42');
    vi.runAllTimers();
    expect(onText).not.toHaveBeenCalled();
  });

  it('ignores fields rejected by the exclude option', () => {
    watch({ exclude: (field) => field.closest('[data-answer]') !== null });
    const answer = mount(
      '<div data-answer><div contenteditable="true"></div></div>',
      '[contenteditable]',
    );
    const area = control('<textarea></textarea>', 'textarea');
    answer.textContent = 'Odpowiedź';
    answer.dispatchEvent(new Event('input', { bubbles: true }));
    type(area, 'Jan');
    vi.runAllTimers();
    expect(onText).toHaveBeenCalledExactlyOnceWith(area, 'Jan');
  });

  it('drops a pending report when the field becomes excluded before it fires', () => {
    watch();
    const input = control('<input>', 'input');
    type(input, 'Jan');
    input.disabled = true;
    vi.runAllTimers();
    expect(onText).not.toHaveBeenCalled();
  });

  it('calls onTooLong instead of onText above maxLength', () => {
    const onTooLong = vi.fn();
    watch({ maxLength: 5, onTooLong });
    const area = control('<textarea></textarea>', 'textarea');
    type(area, '12345');
    vi.runAllTimers();
    type(area, '123456');
    vi.runAllTimers();
    expect(onText).toHaveBeenCalledExactlyOnceWith(area, '12345');
    expect(onTooLong).toHaveBeenCalledExactlyOnceWith(area, 6);
  });

  it('uses 50 000 characters as the default maxLength and tolerates a missing onTooLong', () => {
    watch();
    const area = control('<textarea></textarea>', 'textarea');
    type(area, 'x'.repeat(50_000));
    vi.runAllTimers();
    type(area, 'x'.repeat(50_001));
    vi.runAllTimers();
    expect(onText).toHaveBeenCalledOnce();
  });

  it('ignores edits while isEnabled returns false', () => {
    let enabled = false;
    watch({ isEnabled: () => enabled });
    const input = control('<input>', 'input');
    type(input, 'Jan');
    vi.runAllTimers();
    expect(onText).not.toHaveBeenCalled();
    enabled = true;
    type(input, 'Jan');
    vi.runAllTimers();
    expect(onText).toHaveBeenCalledExactlyOnceWith(input, 'Jan');
  });

  it('drops a pending report when disabled before the debounce ends', () => {
    let enabled = true;
    watch({ isEnabled: () => enabled });
    const input = control('<input>', 'input');
    type(input, 'Jan');
    enabled = false;
    vi.runAllTimers();
    expect(onText).not.toHaveBeenCalled();
  });

  it('only watches inside the given root', () => {
    const scope = mount('<div id="scope"><textarea></textarea></div>', '#scope');
    watch({ root: scope });
    const inside = scope.querySelector('textarea');
    const outside = control('<textarea></textarea>', 'textarea');
    if (inside) type(inside, 'in');
    type(outside, 'out');
    vi.runAllTimers();
    expect(onText).toHaveBeenCalledExactlyOnceWith(inside, 'in');
  });

  it('stops listening and cancels pending reports on unsubscribe', () => {
    watch();
    const input = control('<input>', 'input');
    type(input, 'Jan');
    stop?.();
    expect(vi.getTimerCount()).toBe(0);
    type(input, 'Jan Kowalski');
    vi.runAllTimers();
    expect(onText).not.toHaveBeenCalled();
  });
});
