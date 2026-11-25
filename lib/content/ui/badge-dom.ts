// Small DOM helpers for the badge: elements, buttons and the hosts that hold its shadow roots.

export function setStyles(element: HTMLElement, styles: Record<string, string>): void {
  for (const [name, value] of Object.entries(styles)) {
    element.style.setProperty(name, value, 'important');
  }
}

export function hide(host: HTMLElement): void {
  host.style.setProperty('display', 'none', 'important');
}

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function makeButton(className: string, text: string, ariaLabel: string): HTMLButtonElement {
  const button = element('button', className, text);
  button.type = 'button';
  button.setAttribute('aria-label', ariaLabel);
  return button;
}

/** A host element with inline !important styles, so page rules matching its tag cannot move or
 * show it, and a closed shadow root holding `style`. */
export function makeHost(tag: string, style: string): { host: HTMLElement; root: ShadowRoot } {
  const host = document.createElement(tag);
  setStyles(host, {
    all: 'initial',
    position: 'fixed',
    'z-index': '2147483647',
    display: 'none',
    margin: '0',
    padding: '0',
    border: '0',
    'pointer-events': 'none',
  });
  const root = host.attachShadow({ mode: 'closed' });
  const sheet = document.createElement('style');
  sheet.textContent = style;
  root.append(sheet);
  return { host, root };
}

/**
 * Pressing a control would normally move focus to it and blur the editor first. Editors react to
 * blur (ProseMirror drops its selection, some chats collapse the input), and masking needs the
 * field as the user left it, so presses keep focus where it is. `click` still fires (checkboxes
 * toggle, buttons act), and every control stays reachable with Tab and works with Space and Enter.
 */
export function keepFocus(target: HTMLElement): void {
  for (const type of ['pointerdown', 'mousedown']) {
    target.addEventListener(type, (event) => {
      event.preventDefault();
    });
  }
}
