// Small DOM helpers shared by the options tabs.

export function make<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = doc.createElement(tag);
  if (className !== undefined) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function heading(doc: Document, text: string, hint?: string): HTMLElement[] {
  const parts: HTMLElement[] = [make(doc, 'h2', 'panel-title', text)];
  if (hint !== undefined) parts.push(make(doc, 'p', 'hint', hint));
  return parts;
}
