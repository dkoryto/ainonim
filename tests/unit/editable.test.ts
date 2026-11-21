// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { findField, isExcluded } from '~/lib/content/fields/editable';

function mount(html: string, selector: string, parent: Node = document.body): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  parent.appendChild(wrapper);
  const element = wrapper.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`No ${selector} in fixture`);
  return element;
}

/** Dispatch an `input` event from `target` and return what findField sees for it. */
function fieldFor(target: Element): Element | null {
  let found: Element | null = null;
  const listener = (event: Event): void => {
    found = findField(event);
  };
  document.addEventListener('input', listener, true);
  target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  document.removeEventListener('input', listener, true);
  return found;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('findField', () => {
  it('finds a textarea', () => {
    const area = mount('<textarea></textarea>', 'textarea');
    expect(fieldFor(area)).toBe(area);
  });

  it.each(['text', 'search', 'email', 'tel', 'url'])('finds an input of type %s', (type) => {
    const input = mount(`<input type="${type}">`, 'input');
    expect(fieldFor(input)).toBe(input);
  });

  it('treats an input without a type as text', () => {
    const input = mount('<input>', 'input');
    expect(fieldFor(input)).toBe(input);
  });

  it.each(['number', 'date', 'checkbox', 'range', 'color', 'password'])(
    'ignores an input of type %s',
    (type) => {
      expect(fieldFor(mount(`<input type="${type}">`, 'input'))).toBeNull();
    },
  );

  it('ignores elements that are not editable', () => {
    expect(fieldFor(mount('<p><span>x</span></p>', 'span'))).toBeNull();
  });

  it('returns the root of a contenteditable editor for a nested target', () => {
    const root = mount(
      '<div contenteditable="true"><p>Pan <strong><em>Jan</em></strong></p></div>',
      '[contenteditable]',
    );
    const em = root.querySelector('em');
    expect(em && fieldFor(em)).toBe(root);
    expect(fieldFor(root)).toBe(root);
  });

  it('returns the outermost editable element when editors are nested', () => {
    const outer = mount(
      '<section><div id="outer" contenteditable="true"><div contenteditable="true"><p>x</p></div></div></section>',
      '#outer',
    );
    const p = outer.querySelector('p');
    expect(p && fieldFor(p)).toBe(outer);
  });

  it('finds the editor root from a non-editable island inside it', () => {
    const root = mount(
      '<div contenteditable="true"><span contenteditable="false"><b>chip</b></span></div>',
      '[contenteditable="true"]',
    );
    const chip = root.querySelector('b');
    expect(chip && fieldFor(chip)).toBe(root);
  });

  it('finds fields inside an open shadow root', () => {
    const host = mount('<div id="host"></div>', '#host');
    const shadow = host.attachShadow({ mode: 'open' });
    const area = mount('<textarea></textarea>', 'textarea', shadow);
    const editor = mount('<div contenteditable="true"><p>x</p></div>', '[contenteditable]', shadow);
    const p = editor.querySelector('p');
    expect(fieldFor(area)).toBe(area);
    expect(p && fieldFor(p)).toBe(editor);
  });
});

describe('isExcluded', () => {
  it('allows an ordinary text field', () => {
    expect(isExcluded(mount('<textarea></textarea>', 'textarea'))).toBe(false);
    expect(isExcluded(mount('<input autocomplete="name">', 'input'))).toBe(false);
    expect(isExcluded(mount('<div contenteditable="true"></div>', 'div > div'))).toBe(false);
  });

  it('excludes password inputs', () => {
    expect(isExcluded(mount('<input type="password">', 'input'))).toBe(true);
  });

  it.each([
    'cc-number',
    'cc-csc',
    'cc-exp',
    'billing cc-name',
    'current-password',
    'new-password',
    'one-time-code',
    'section-login One-Time-Code',
  ])('excludes autocomplete="%s"', (autocomplete) => {
    expect(isExcluded(mount(`<input autocomplete="${autocomplete}">`, 'input'))).toBe(true);
  });

  it('excludes a contenteditable with a secret autocomplete hint', () => {
    expect(
      isExcluded(
        mount('<div contenteditable="true" autocomplete="cc-number"></div>', '[contenteditable]'),
      ),
    ).toBe(true);
  });

  it('excludes disabled and read-only controls', () => {
    expect(isExcluded(mount('<input disabled>', 'input'))).toBe(true);
    expect(isExcluded(mount('<textarea readonly></textarea>', 'textarea'))).toBe(true);
  });

  it('excludes hidden fields and fields in hidden ancestors', () => {
    expect(isExcluded(mount('<textarea hidden></textarea>', 'textarea'))).toBe(true);
    expect(isExcluded(mount('<div hidden><input></div>', 'input'))).toBe(true);
  });

  it('excludes fields inside aria-hidden="true", also across a shadow boundary', () => {
    expect(
      isExcluded(mount('<div aria-hidden="true"><textarea></textarea></div>', 'textarea')),
    ).toBe(true);
    expect(
      isExcluded(mount('<div aria-hidden="false"><textarea></textarea></div>', 'textarea')),
    ).toBe(false);
    const host = mount('<div aria-hidden="true"><span id="host"></span></div>', '#host');
    const shadow = host.attachShadow({ mode: 'open' });
    expect(isExcluded(mount('<textarea></textarea>', 'textarea', shadow))).toBe(true);
  });
});
