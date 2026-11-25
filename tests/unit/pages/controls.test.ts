// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { button, confirmPrompt } from '~/lib/pages/controls';

beforeEach(() => {
  document.body.replaceChildren();
});

describe('button', () => {
  it('is a non-submitting button with the given text and class', () => {
    const element = button(document, 'Usuń', 'danger');
    expect(element.type).toBe('button');
    expect(element.textContent).toBe('Usuń');
    expect(element.className).toBe('danger');
  });

  it('has no class when none is given', () => {
    expect(button(document, 'Anuluj').hasAttribute('class')).toBe(false);
  });
});

describe('confirmPrompt', () => {
  const setup = (noClass?: string) => {
    const trigger = button(document, 'Wyczyść');
    const prompt = confirmPrompt(document, trigger, {
      question: 'Na pewno?',
      yes: 'Tak',
      yesClass: 'danger',
      noClass,
    });
    document.body.append(trigger, prompt.box);
    const no = prompt.box.querySelectorAll('button')[1];
    if (!no) throw new Error('no "Anuluj" button');
    return { trigger, prompt, no };
  };

  it('starts hidden, as a group with the question, "yes" and "Anuluj"', () => {
    const { prompt, no } = setup('secondary');
    expect(prompt.box.hidden).toBe(true);
    expect(prompt.box.className).toBe('confirm');
    expect(prompt.box.getAttribute('role')).toBe('group');
    expect(prompt.box.querySelector('.confirm-question')?.textContent).toBe('Na pewno?');
    expect(prompt.yes.textContent).toBe('Tak');
    expect(prompt.yes.className).toBe('danger');
    expect(no.textContent).toBe('Anuluj');
    expect(no.className).toBe('secondary');
  });

  it('takes the place of the trigger while open and gives the focus back on "Anuluj"', () => {
    const { trigger, prompt, no } = setup();
    trigger.click();
    expect(prompt.box.hidden).toBe(false);
    expect(trigger.hidden).toBe(true);
    expect(document.activeElement).toBe(no);

    no.click();
    expect(prompt.box.hidden).toBe(true);
    expect(trigger.hidden).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('can close without moving the focus', () => {
    const { trigger, prompt, no } = setup();
    trigger.click();
    prompt.show(false, false);
    expect(prompt.box.hidden).toBe(true);
    expect(trigger.hidden).toBe(false);
    expect(document.activeElement).toBe(no);
  });
});
