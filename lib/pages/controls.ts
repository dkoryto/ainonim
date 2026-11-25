// Controls shared by the popup and the options tabs: a plain button, and the "are you sure?" step
// in front of a destructive action.
import { make } from './options/dom';

/** A `type="button"` button, so that inside a form it never submits it. */
export function button(doc: Document, text: string, className?: string): HTMLButtonElement {
  const element = make(doc, 'button', className, text);
  element.type = 'button';
  return element;
}

export interface ConfirmPrompt {
  box: HTMLElement;
  yes: HTMLButtonElement;
  /** Swap `trigger` for the question (or back); `focus: false` leaves focus where it is. */
  show: (visible: boolean, focus?: boolean) => void;
}

/**
 * A hidden question with "yes" and "Anuluj" that takes the place of `trigger` while open. Clicking
 * `trigger` opens it and "Anuluj" closes it; the caller handles "yes" and closes it when done.
 */
export function confirmPrompt(
  doc: Document,
  trigger: HTMLButtonElement,
  texts: { question: string; yes: string; yesClass: string; noClass?: string },
): ConfirmPrompt {
  const box = make(doc, 'div', 'confirm');
  box.setAttribute('role', 'group');
  const yes = button(doc, texts.yes, texts.yesClass);
  const no = button(doc, 'Anuluj', texts.noClass);
  box.append(make(doc, 'span', 'confirm-question', texts.question), yes, no);
  box.hidden = true;

  const show = (visible: boolean, focus = true): void => {
    box.hidden = !visible;
    trigger.hidden = visible;
    if (focus) (visible ? no : trigger).focus();
  };
  trigger.addEventListener('click', () => {
    show(true);
  });
  no.addEventListener('click', () => {
    show(false);
  });
  return { box, yes, show };
}
