// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Span } from '~/lib/shared/messages';
import {
  badgeIconRoot,
  badgeShadowRoot,
  createBadge,
  type Badge,
  type BadgeItem,
  type BadgeOptions,
  type BadgeState,
} from '~/lib/content/ui/badge';

// happy-dom neither lays out nor reports intersections, so the observers and the animation frame
// are driven by hand.
let frames: FrameRequestCallback[] = [];
let intersections: { callback: IntersectionObserverCallback; disconnected: boolean }[] = [];
let resizes: { disconnected: boolean }[] = [];

function flushFrames(): void {
  const pending = frames;
  frames = [];
  for (const callback of pending) callback(0);
}

function reportOnScreen(isIntersecting: boolean): void {
  for (const observer of intersections) {
    observer.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
  }
}

beforeEach(() => {
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1000);
  vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(700);
  frames = [];
  intersections = [];
  resizes = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    frames = [];
  });
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      private readonly record;
      constructor(callback: IntersectionObserverCallback) {
        this.record = { callback, disconnected: false };
        intersections.push(this.record);
      }
      observe(): void {}
      disconnect(): void {
        this.record.disconnected = true;
      }
    },
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      private readonly record = { disconnected: false };
      constructor() {
        resizes.push(this.record);
      }
      observe(): void {}
      disconnect(): void {
        this.record.disconnected = true;
      }
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
  for (const host of document.querySelectorAll('ainonim-badge, ainonim-icon')) host.remove();
});

/** A textarea at x 100..400, y `top`..`top + 120` unless another box is given. */
function textarea(top = 250, box: DOMRectInit = { x: 100, y: top, width: 300, height: 120 }) {
  const field = document.createElement('textarea');
  document.body.append(field);
  vi.spyOn(field, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect(box));
  return field;
}

function host(): HTMLElement | null {
  return document.querySelector('ainonim-badge');
}

function iconHost(): HTMLElement | null {
  return document.querySelector('ainonim-icon');
}

/** happy-dom does not lay out, so the panel's size is given here. */
function panelSize(width: number, height: number): void {
  const element = host();
  if (!element) throw new Error('no panel host');
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ x: 0, y: 0, width, height }),
  );
}

const isShown = (element: HTMLElement | null): boolean =>
  element?.style.getPropertyValue('display') === 'block';

function part(badge: Badge, selector: string): HTMLElement {
  const element = badgeShadowRoot(badge)?.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`no ${selector} in the panel`);
  return element;
}

function button(badge: Badge, selector: string): HTMLButtonElement {
  return part(badge, selector) as HTMLButtonElement;
}

function icon(badge: Badge): HTMLButtonElement {
  const element = badgeIconRoot(badge)?.querySelector('button');
  if (!element) throw new Error('no icon');
  return element;
}

function checkboxes(badge: Badge): HTMLInputElement[] {
  return [...(badgeShadowRoot(badge)?.querySelectorAll<HTMLInputElement>('input') ?? [])];
}

/** The "znacznik" (0) or "ogólnie" (1) button of row `row`. */
function modeButton(badge: Badge, row: number, mode: 0 | 1): HTMLButtonElement {
  const rows = badgeShadowRoot(badge)?.querySelectorAll('li') ?? [];
  const element = rows[row]?.querySelectorAll('.mode button')[mode];
  if (!(element instanceof HTMLButtonElement))
    throw new Error(`no mode button in row ${String(row)}`);
  return element;
}

function item(start: number, original: string, entity_type: string, token: string): BadgeItem {
  const span: Span = { start, end: start + original.length, entity_type, score: 1, token };
  const label = entity_type === 'PERSON' ? 'osoba' : entity_type;
  return { span, original, label, general: `[${label}]` };
}

// "Jan Kowalski, PESEL 50810112354, Anna Nowak"
const JAN = item(0, 'Jan Kowalski', 'PERSON', '<OSOBA_1>');
const PESEL = item(20, '50810112354', 'PESEL', '<PESEL_1>');
const ANNA = item(33, 'Anna Nowak', 'PERSON', '<OSOBA_2>');
const ITEMS = [JAN, PESEL, ANNA];

function found(items: readonly BadgeItem[], revert: BadgeState['revert'] = 'none'): BadgeState {
  return { status: 'done', items, revert };
}

function options(overrides: Partial<BadgeOptions> = {}): BadgeOptions {
  return { onMask: vi.fn(), onRevert: vi.fn(), ...overrides };
}

/** A badge for a field with the panel open on `state`. */
function openBadge(state: BadgeState, overrides: Partial<BadgeOptions> = {}, field = textarea()) {
  const badge = createBadge(field, options(overrides));
  badge.update(state);
  badge.setOpen(true);
  flushFrames();
  return badge;
}

describe('the icon', () => {
  it('stays hidden until the field has text', () => {
    const badge = createBadge(textarea(), options());
    flushFrames();
    expect(isShown(iconHost())).toBe(false);

    badge.update({ status: 'analysing', items: [], revert: 'none' });
    flushFrames();
    expect(isShown(iconHost())).toBe(true);

    badge.update({ status: 'idle', items: [], revert: 'none' });
    expect(isShown(iconHost())).toBe(false);
  });

  it('sits inside the bottom-right corner of the field', () => {
    const badge = createBadge(textarea(250), options());
    badge.update(found(ITEMS));
    flushFrames();

    // The field spans x 100..400 and y 250..370; the 20 px icon keeps 4 px from both edges.
    expect(iconHost()?.style.getPropertyValue('left')).toBe('376px');
    expect(iconHost()?.style.getPropertyValue('top')).toBe('346px');
  });

  it('is centred vertically in a field too low for the corner', () => {
    const field = textarea(250, { x: 100, y: 250, width: 300, height: 24 });
    const badge = createBadge(field, options());
    badge.update(found(ITEMS));
    flushFrames();

    expect(iconHost()?.style.getPropertyValue('top')).toBe('252px');
  });

  it.each<[string, BadgeState, string, string]>([
    [
      'analysing',
      { status: 'analysing', items: [], revert: 'none' },
      '',
      'AInonim: trwa analiza pola',
    ],
    ['found', found(ITEMS), '3', 'AInonim: znalezione dane osobowe (3)'],
    ['clear', found([]), '✓', 'AInonim: nie znaleziono danych osobowych'],
    [
      'failed',
      { status: 'failed', items: [], revert: 'none' },
      '!',
      'AInonim: analiza nie powiodła się',
    ],
  ])('shows the state "%s"', (kind, state, bubble, label) => {
    const badge = createBadge(textarea(), options());
    badge.update(state);

    expect(icon(badge).classList.contains(kind)).toBe(true);
    expect(icon(badge).getAttribute('aria-label')).toBe(label);
    const count = icon(badge).querySelector<HTMLElement>('.bubble');
    expect(count?.hidden).toBe(bubble === '');
    expect(count?.textContent).toBe(bubble);
  });

  it('counts distinct values and caps the bubble at 9+', () => {
    const badge = createBadge(textarea(), options());
    const many = Array.from({ length: 12 }, (_, index) =>
      item(index * 20, `Osoba ${String(index)}`, 'PERSON', `<OSOBA_${String(index)}>`),
    );
    badge.update(found(many));

    expect(icon(badge).querySelector('.bubble')?.textContent).toBe('9+');
    expect(icon(badge).getAttribute('aria-label')).toBe('AInonim: znalezione dane osobowe (12)');
  });

  it('keeps the previous values while the new text is analysed', () => {
    const badge = openBadge(found(ITEMS));
    badge.update({ status: 'analysing', items: ITEMS, revert: 'none' });

    expect(checkboxes(badge)).toHaveLength(3);
    expect(button(badge, 'button.mask').disabled).toBe(true);
    expect(icon(badge).classList.contains('analysing')).toBe(true);
  });
});

describe('opening the panel', () => {
  it('does not open by itself when values are found', () => {
    const badge = createBadge(textarea(), options());
    badge.update(found(ITEMS));
    flushFrames();

    expect(isShown(iconHost())).toBe(true);
    expect(isShown(host())).toBe(false);
    expect(badge.isOpen()).toBe(false);
    expect(icon(badge).getAttribute('aria-expanded')).toBe('false');
  });

  it('opens and closes from the icon', () => {
    const badge = createBadge(textarea(), options());
    badge.update(found(ITEMS));

    icon(badge).click();
    flushFrames();
    expect(isShown(host())).toBe(true);
    expect(icon(badge).getAttribute('aria-expanded')).toBe('true');

    icon(badge).click();
    expect(isShown(host())).toBe(false);
    expect(icon(badge).getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on "×" and on Escape', () => {
    const badge = openBadge(found(ITEMS));
    part(badge, 'button.close').click();
    expect(badge.isOpen()).toBe(false);

    badge.setOpen(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(badge.isOpen()).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(badge.isOpen()).toBe(false);
    expect(isShown(host())).toBe(false);
  });

  it('moves focus into the panel when opened from the keyboard and back on Escape', () => {
    const badge = createBadge(textarea(), options());
    badge.update(found(ITEMS));
    flushFrames();

    icon(badge).focus();
    icon(badge).click();
    flushFrames();
    expect(badgeShadowRoot(badge)?.activeElement).toBe(checkboxes(badge)[0]);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(badgeIconRoot(badge)?.activeElement).toBe(icon(badge));
  });

  it('closes when the field has no text any more', () => {
    const badge = openBadge(found(ITEMS));
    badge.update({ status: 'idle', items: [], revert: 'none' });

    expect(badge.isOpen()).toBe(false);
    expect(isShown(host())).toBe(false);
  });

  it.each<[string, BadgeState, string]>([
    ['nothing was found', found([]), 'Nie znaleziono danych osobowych.'],
    ['the analysis runs', { status: 'analysing', items: [], revert: 'none' }, 'Trwa analiza…'],
    ['the analysis failed', { status: 'failed', items: [], revert: 'none' }, 'Analiza nie'],
  ])('says so when %s', (_, state, note) => {
    const badge = openBadge(state);

    expect(part(badge, '.note').hidden).toBe(false);
    expect(part(badge, '.note').textContent).toContain(note);
    expect(part(badge, '.list').hidden).toBe(true);
    expect(button(badge, 'button.mask').disabled).toBe(true);
  });
});

describe('the list', () => {
  it('lists every value with its type, token and switch, all checked', () => {
    const badge = openBadge(found(ITEMS));

    expect(part(badge, '[role="status"]').textContent).toBe('3');
    expect(part(badge, '.note').hidden).toBe(true);
    const rows = [...(badgeShadowRoot(badge)?.querySelectorAll('li') ?? [])];
    expect(rows.map((row) => row.textContent)).toEqual([
      'Jan Kowalskiosoba → OSOBA_1znacznikogólnie',
      '50810112354PESEL → PESEL_1znacznikogólnie',
      'Anna Nowakosoba → OSOBA_2znacznikogólnie',
    ]);
    expect(checkboxes(badge).every((box) => box.checked)).toBe(true);
    expect(modeButton(badge, 0, 0).getAttribute('aria-pressed')).toBe('true');
    expect(modeButton(badge, 0, 1).getAttribute('aria-pressed')).toBe('false');
    expect(part(badge, 'button.mask').textContent).toBe('Zamaskuj zaznaczone (3)');
  });

  it('shortens a long value and names it in full in the title', () => {
    const long = 'Przedsiębiorstwo Wielobranżowe Kowalski i Synowie';
    const badge = openBadge(found([item(0, long, 'ORG', '<FIRMA_1:dopełniacz>')]));

    const original = part(badge, '.original');
    expect(original.textContent).toBe(`${long.slice(0, 27)}…`);
    expect(original.title).toBe(long);
    expect(part(badge, '.out').textContent).toBe('→ FIRMA_1');
    expect(part(badge, '.out').title).toBe('<FIRMA_1:dopełniacz>');
  });

  it('shows a value found twice once and masks both occurrences', () => {
    const onMask = vi.fn();
    const again = item(40, 'Jan Kowalski', 'PERSON', '<OSOBA_1>');
    const badge = openBadge(found([JAN, PESEL, again]), { onMask });

    expect(checkboxes(badge)).toHaveLength(2);
    expect(part(badge, '[role="status"]').textContent).toBe('2');
    part(badge, 'button.mask').click();
    expect(onMask).toHaveBeenCalledExactlyOnceWith([
      { span: JAN.span, mode: 'token' },
      { span: PESEL.span, mode: 'token' },
      { span: again.span, mode: 'token' },
    ]);
  });

  it('masks only the checked values', () => {
    const onMask = vi.fn();
    const onSelectionChange = vi.fn();
    const badge = openBadge(found(ITEMS), { onMask, onSelectionChange });
    expect(onSelectionChange).toHaveBeenLastCalledWith([JAN.span, PESEL.span, ANNA.span]);

    checkboxes(badge)[1]?.click();

    expect(onSelectionChange).toHaveBeenLastCalledWith([JAN.span, ANNA.span]);
    expect(part(badge, 'button.mask').textContent).toBe('Zamaskuj zaznaczone (2)');
    part(badge, 'button.mask').click();
    expect(onMask).toHaveBeenCalledExactlyOnceWith([
      { span: JAN.span, mode: 'token' },
      { span: ANNA.span, mode: 'token' },
    ]);
  });

  it('toggles a checkbox from a click on its row without focusing it', () => {
    const field = textarea();
    field.focus();
    const badge = openBadge(found([PESEL]), {}, field);

    part(badge, '.original').click();

    expect(checkboxes(badge)[0]?.checked).toBe(false);
    expect(document.activeElement).toBe(field);
  });

  it('masks a value set to "ogólnie" with its generalised text', () => {
    const onMask = vi.fn();
    const badge = openBadge(found(ITEMS), { onMask });

    modeButton(badge, 0, 1).click();

    expect(modeButton(badge, 0, 1).getAttribute('aria-pressed')).toBe('true');
    expect(modeButton(badge, 0, 0).getAttribute('aria-pressed')).toBe('false');
    expect(badgeShadowRoot(badge)?.querySelectorAll('.out')[0]?.textContent).toBe('→ [osoba]');
    expect(checkboxes(badge)[0]?.checked).toBe(true);
    part(badge, 'button.mask').click();
    expect(onMask).toHaveBeenCalledExactlyOnceWith([
      { span: JAN.span, mode: 'general' },
      { span: PESEL.span, mode: 'token' },
      { span: ANNA.span, mode: 'token' },
    ]);

    modeButton(badge, 0, 0).click();
    expect(badgeShadowRoot(badge)?.querySelectorAll('.out')[0]?.textContent).toBe('→ OSOBA_1');
  });

  it('disables the mask button when nothing is checked', () => {
    const onMask = vi.fn();
    const badge = openBadge(found([JAN]), { onMask });

    checkboxes(badge)[0]?.click();
    const mask = button(badge, 'button.mask');
    expect(mask.disabled).toBe(true);
    mask.dispatchEvent(new MouseEvent('click'));
    expect(onMask).not.toHaveBeenCalled();

    checkboxes(badge)[0]?.click();
    expect(mask.disabled).toBe(false);
  });

  it('keeps unchecked and generalised values when the list is updated for new text', () => {
    const badge = openBadge(found(ITEMS));
    checkboxes(badge)[2]?.click();
    modeButton(badge, 1, 1).click();

    badge.update(found([JAN, PESEL, item(36, 'Anna Nowak', 'PERSON', '<OSOBA_2>')]));

    expect(checkboxes(badge).map((box) => box.checked)).toEqual([true, true, false]);
    expect(modeButton(badge, 1, 1).getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps the rows (and focus in them) when the same values are shown again', () => {
    const badge = openBadge(found(ITEMS));
    const first = checkboxes(badge)[0];

    badge.update(found(ITEMS, 'ready'));

    expect(checkboxes(badge)[0]).toBe(first);
  });

  it('gives every checkbox a label and every switch a name', () => {
    const badge = openBadge(found(ITEMS));
    for (const box of checkboxes(badge)) {
      expect(box.closest('label')?.textContent).toContain('→');
    }
    const groups = [...(badgeShadowRoot(badge)?.querySelectorAll('.mode') ?? [])];
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual([
      'Zamień „Jan Kowalski” na',
      'Zamień „50810112354” na',
      'Zamień „Anna Nowak” na',
    ]);
  });
});

describe('"Cofnij"', () => {
  it('is hidden when there is nothing to undo', () => {
    const badge = openBadge(found(ITEMS));
    expect(button(badge, 'button.revert').hidden).toBe(true);
  });

  it('calls onRevert when the field still holds the masked text', () => {
    const onRevert = vi.fn();
    const badge = openBadge(found([], 'ready'), { onRevert });

    const revert = button(badge, 'button.revert');
    expect(revert.hidden).toBe(false);
    expect(revert.disabled).toBe(false);
    revert.click();
    expect(onRevert).toHaveBeenCalledOnce();
  });

  it('is disabled once the field changed since the masking', () => {
    const onRevert = vi.fn();
    const badge = openBadge(found([], 'stale'), { onRevert });

    const revert = button(badge, 'button.revert');
    expect(revert.hidden).toBe(false);
    expect(revert.disabled).toBe(true);
    expect(revert.title).toBe('Tekst w polu zmienił się od maskowania');
    revert.dispatchEvent(new MouseEvent('click'));
    expect(onRevert).not.toHaveBeenCalled();
  });
});

describe('placing the panel', () => {
  it('sits just above the top-right corner of the field', () => {
    const badge = openBadge(found(ITEMS), {}, textarea(250));
    panelSize(300, 140);
    badge.update(found(ITEMS));
    flushFrames();

    // Viewport 1000×700: right edge on the field's (x 400), bottom edge 4 px above its top (y 250).
    expect(host()?.style.getPropertyValue('right')).toBe('600px');
    expect(host()?.style.getPropertyValue('bottom')).toBe('454px');
    expect(host()?.style.getPropertyValue('top')).toBe('auto');
  });

  it('goes below the field when there is no room above it', () => {
    const badge = openBadge(found(ITEMS), {}, textarea(100));
    panelSize(300, 140);
    badge.update(found(ITEMS));
    flushFrames();

    expect(host()?.style.getPropertyValue('top')).toBe('224px');
    expect(host()?.style.getPropertyValue('bottom')).toBe('auto');
  });

  it('stays inside the viewport when the field is narrower than the panel', () => {
    const field = textarea(250, { x: 0, y: 250, width: 100, height: 40 });
    const badge = openBadge(found(ITEMS), {}, field);
    panelSize(300, 140);
    badge.update(found(ITEMS));
    flushFrames();

    // The field ends at x 100, but a 300 px panel there would start left of the viewport.
    expect(host()?.style.getPropertyValue('right')).toBe('700px');
  });

  it('hides the icon and the panel while the field is off-screen or detached', () => {
    const field = textarea();
    openBadge(found([PESEL]), {}, field);
    reportOnScreen(false);
    flushFrames();
    expect(isShown(host())).toBe(false);
    expect(isShown(iconHost())).toBe(false);

    reportOnScreen(true);
    flushFrames();
    expect(isShown(host())).toBe(true);
    expect(isShown(iconHost())).toBe(true);

    field.remove();
    window.dispatchEvent(new Event('scroll'));
    flushFrames();
    expect(isShown(host())).toBe(false);
    expect(isShown(iconHost())).toBe(false);
  });
});

describe('focus and cleanup', () => {
  it.each(['button.mask', 'input', '.mode button', 'button.close'])(
    'keeps focus in the field when %s is pressed',
    (selector) => {
      const field = textarea();
      field.focus();
      const badge = openBadge(found([PESEL]), {}, field);
      for (const type of ['pointerdown', 'mousedown']) {
        const press = new MouseEvent(type, { bubbles: true, cancelable: true, composed: true });
        part(badge, selector).dispatchEvent(press);
        expect(press.defaultPrevented).toBe(true);
      }
      expect(document.activeElement).toBe(field);
    },
  );

  it('keeps focus in the field when the icon is pressed', () => {
    const field = textarea();
    field.focus();
    const badge = createBadge(field, options());
    badge.update(found([PESEL]));
    for (const type of ['pointerdown', 'mousedown']) {
      const press = new MouseEvent(type, { bubbles: true, cancelable: true, composed: true });
      icon(badge).dispatchEvent(press);
      expect(press.defaultPrevented).toBe(true);
    }
    icon(badge).click();
    flushFrames();
    expect(document.activeElement).toBe(field);
    expect(badgeShadowRoot(badge)?.activeElement).toBeNull();
  });

  it('removes both hosts and stops observing on destroy', () => {
    const removeListener = vi.spyOn(window, 'removeEventListener');
    const badge = openBadge(found(ITEMS));
    badge.destroy();
    expect(host()).toBeNull();
    expect(iconHost()).toBeNull();
    expect(intersections.every((observer) => observer.disconnected)).toBe(true);
    expect(resizes.every((observer) => observer.disconnected)).toBe(true);
    expect(removeListener.mock.calls.map(([type]) => type)).toEqual([
      'scroll',
      'resize',
      'keydown',
    ]);
    expect(frames).toHaveLength(0);
    expect(() => {
      badge.destroy();
    }).not.toThrow();
    badge.update(found(ITEMS));
    badge.setOpen(true);
    expect(host()).toBeNull();
  });
});

describe('automatic masking', () => {
  it('applies the panel choices to the values of a newer text', () => {
    const badge = openBadge(found(ITEMS));
    checkboxes(badge)[1]?.click();
    modeButton(badge, 2, 1).click();
    // The same values, moved by text typed in front of them.
    const moved = [JAN, PESEL, ANNA].map((value) =>
      item(value.span.start + 5, value.original, value.span.entity_type, value.span.token),
    );

    expect(badge.choicesFor(moved)).toEqual([
      { span: moved[0]?.span, mode: 'token' },
      { span: moved[2]?.span, mode: 'general' },
    ]);
  });

  it('starts each row from its category default, and a click still overrides it', () => {
    const generalPesel: BadgeItem = { ...PESEL, defaultMode: 'general' };
    const badge = openBadge(found([JAN, generalPesel]));

    expect(modeButton(badge, 1, 1).getAttribute('aria-pressed')).toBe('true');
    expect(part(badge, 'li:nth-child(2) .out').textContent).toBe('→ [PESEL]');
    expect(badge.choicesFor([JAN, generalPesel])).toEqual([
      { span: JAN.span, mode: 'token' },
      { span: PESEL.span, mode: 'general' },
    ]);

    modeButton(badge, 1, 0).click();
    expect(modeButton(badge, 1, 0).getAttribute('aria-pressed')).toBe('true');
    expect(badge.choicesFor([JAN, generalPesel])[1]).toEqual({ span: PESEL.span, mode: 'token' });
  });

  it('follows a changed default for rows the user did not switch', () => {
    const badge = openBadge(found([JAN, PESEL]));

    badge.update(found([JAN, { ...PESEL, defaultMode: 'general' }]));

    expect(modeButton(badge, 1, 1).getAttribute('aria-pressed')).toBe('true');
  });

  it('masks every value with its token while the panel was never touched', () => {
    const badge = createBadge(textarea(), options());

    expect(badge.choicesFor([PESEL, JAN])).toEqual([
      { span: JAN.span, mode: 'token' },
      { span: PESEL.span, mode: 'token' },
    ]);
  });

  it('shows on the icon and in the panel that values were masked automatically', () => {
    const badge = createBadge(textarea(), options());
    badge.update({
      status: 'analysing',
      items: [],
      revert: 'ready',
      notice: { kind: 'auto-masked', count: 2 },
    });
    flushFrames();

    expect(icon(badge).classList.contains('masked')).toBe(true);
    expect(icon(badge).querySelector('.bubble')?.textContent).toBe('2');
    expect(icon(badge).title).toBe('AInonim: zamaskowano automatycznie (2)');
    expect(badge.isOpen()).toBe(false);
    badge.setOpen(true);
    expect(part(badge, '.notice').textContent).toContain('Zamaskowano automatycznie (2)');
    expect(part(badge, 'button.revert').hidden).toBe(false);
  });

  it('opens the panel to explain a send held back and says how to send anyway', () => {
    const badge = createBadge(textarea(), options());
    badge.update({
      status: 'failed',
      items: [],
      revert: 'none',
      notice: { kind: 'send-blocked', retryMs: 5_000 },
    });
    flushFrames();

    expect(badge.isOpen()).toBe(true);
    expect(icon(badge).classList.contains('failed')).toBe(true);
    expect(icon(badge).title).toContain('Wyślij ponownie w ciągu 5 s');
    const notice = part(badge, '.notice');
    expect(notice.hidden).toBe(false);
    expect(notice.classList.contains('blocked')).toBe(true);
    expect(notice.textContent).toBe(
      'Nie wysłano: nie udało się zamaskować danych (analiza nie powiodła się albo trwała ' +
        'za długo). ' +
        'Wyślij ponownie w ciągu 5 s, aby wysłać tekst bez maskowania.',
    );

    badge.update({ status: 'failed', items: [], revert: 'none' });
    expect(notice.hidden).toBe(true);
  });
});
