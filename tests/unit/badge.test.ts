// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Span } from '~/lib/messages';
import { badgeShadowRoot, createBadge, type Badge, type BadgeItem } from '~/lib/ui/badge';

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
  for (const host of document.querySelectorAll('ainonim-badge')) host.remove();
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

/** happy-dom does not lay out, so the panel's size is given here. */
function panelSize(width: number, height: number): void {
  const element = host();
  if (!element) throw new Error('no panel host');
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ x: 0, y: 0, width, height }),
  );
}

function isShown(): boolean {
  return host()?.style.getPropertyValue('display') === 'block';
}

function part(badge: Badge, selector: string): HTMLElement {
  const element = badgeShadowRoot(badge)?.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`no ${selector} in the panel`);
  return element;
}

function checkboxes(badge: Badge): HTMLInputElement[] {
  return [...(badgeShadowRoot(badge)?.querySelectorAll<HTMLInputElement>('input') ?? [])];
}

function item(start: number, original: string, entity_type: string, token: string): BadgeItem {
  const span: Span = { start, end: start + original.length, entity_type, score: 1, token };
  return { span, original, label: entity_type === 'PERSON' ? 'osoba' : entity_type };
}

// "Jan Kowalski, PESEL 50810112354, Anna Nowak"
const JAN = item(0, 'Jan Kowalski', 'PERSON', '<OSOBA_1>');
const PESEL = item(20, '50810112354', 'PESEL', '<PESEL_1>');
const ANNA = item(33, 'Anna Nowak', 'PERSON', '<OSOBA_2>');
const ITEMS = [JAN, PESEL, ANNA];

describe('createBadge', () => {
  it('lists every value with its token and type, all checked', () => {
    const badge = createBadge(textarea(), { onMask: vi.fn() });
    badge.update(ITEMS);
    flushFrames();

    expect(isShown()).toBe(true);
    expect(part(badge, '[role="status"]').textContent).toBe('3');
    const rows = [...(badgeShadowRoot(badge)?.querySelectorAll('li') ?? [])];
    expect(rows.map((row) => row.textContent)).toEqual([
      'Jan Kowalskiosoba→ OSOBA_1',
      '50810112354PESEL→ PESEL_1',
      'Anna Nowakosoba→ OSOBA_2',
    ]);
    expect(checkboxes(badge).every((box) => box.checked)).toBe(true);
    expect(part(badge, 'button.mask').textContent).toBe('Zamaskuj zaznaczone (3)');
  });

  it('shortens a long value and names it in full in the title', () => {
    const long = 'Przedsiębiorstwo Wielobranżowe Kowalski i Synowie';
    const badge = createBadge(textarea(), { onMask: vi.fn() });
    badge.update([item(0, long, 'ORG', '<FIRMA_1:dopełniacz>')]);

    const original = part(badge, '.original');
    expect(original.textContent).toBe(`${long.slice(0, 27)}…`);
    expect(original.title).toBe(long);
    expect(part(badge, '.token').textContent).toBe('→ FIRMA_1');
  });

  it('shows a value found twice once and masks both occurrences', () => {
    const onMask = vi.fn();
    const again = item(40, 'Jan Kowalski', 'PERSON', '<OSOBA_1>');
    const badge = createBadge(textarea(), { onMask });
    badge.update([JAN, PESEL, again]);

    expect(checkboxes(badge)).toHaveLength(2);
    expect(part(badge, '[role="status"]').textContent).toBe('2');
    part(badge, 'button.mask').click();
    expect(onMask).toHaveBeenCalledExactlyOnceWith([JAN.span, PESEL.span, again.span]);
  });

  it('masks only the checked values', () => {
    const onMask = vi.fn();
    const onSelectionChange = vi.fn();
    const badge = createBadge(textarea(), { onMask, onSelectionChange });
    badge.update(ITEMS);
    expect(onSelectionChange).toHaveBeenLastCalledWith([JAN.span, PESEL.span, ANNA.span]);

    checkboxes(badge)[1]?.click();

    expect(onSelectionChange).toHaveBeenLastCalledWith([JAN.span, ANNA.span]);
    expect(part(badge, 'button.mask').textContent).toBe('Zamaskuj zaznaczone (2)');
    part(badge, 'button.mask').click();
    expect(onMask).toHaveBeenCalledExactlyOnceWith([JAN.span, ANNA.span]);
  });

  it('disables the mask button when nothing is checked', () => {
    const onMask = vi.fn();
    const badge = createBadge(textarea(), { onMask });
    badge.update([JAN]);

    checkboxes(badge)[0]?.click();
    const button = part(badge, 'button.mask') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    button.dispatchEvent(new MouseEvent('click'));
    expect(onMask).not.toHaveBeenCalled();

    checkboxes(badge)[0]?.click();
    expect(button.disabled).toBe(false);
  });

  it('keeps a value unchecked when the list is updated for new text', () => {
    const badge = createBadge(textarea(), { onMask: vi.fn() });
    badge.update(ITEMS);
    checkboxes(badge)[2]?.click();

    badge.update([JAN, PESEL, item(36, 'Anna Nowak', 'PERSON', '<OSOBA_2>')]);

    expect(checkboxes(badge).map((box) => box.checked)).toEqual([true, true, false]);
  });

  it('sits just above the top-right corner of the field', () => {
    const badge = createBadge(textarea(250), { onMask: vi.fn() });
    badge.update(ITEMS);
    panelSize(300, 140);
    flushFrames();

    // Viewport 1000×700: right edge on the field's (x 400), bottom edge 4 px above its top (y 250).
    expect(host()?.style.getPropertyValue('right')).toBe('600px');
    expect(host()?.style.getPropertyValue('bottom')).toBe('454px');
    expect(host()?.style.getPropertyValue('top')).toBe('auto');
  });

  it('goes below the field when there is no room above it', () => {
    const badge = createBadge(textarea(100), { onMask: vi.fn() });
    badge.update(ITEMS);
    panelSize(300, 140);
    flushFrames();

    expect(host()?.style.getPropertyValue('top')).toBe('224px');
    expect(host()?.style.getPropertyValue('bottom')).toBe('auto');
  });

  it('stays inside the viewport when the field is narrower than the panel', () => {
    const field = textarea(250, { x: 0, y: 250, width: 100, height: 40 });
    const badge = createBadge(field, { onMask: vi.fn() });
    badge.update(ITEMS);
    panelSize(300, 140);
    flushFrames();

    // The field ends at x 100, but a 300 px panel there would start left of the viewport.
    expect(host()?.style.getPropertyValue('right')).toBe('700px');
  });

  it('is hidden with an empty list, also right after having been shown', () => {
    const badge = createBadge(textarea(), { onMask: vi.fn() });
    badge.update([]);
    flushFrames();
    expect(isShown()).toBe(false);

    badge.update([PESEL]);
    flushFrames();
    expect(isShown()).toBe(true);
    badge.update([]);
    expect(isShown()).toBe(false);
  });

  it('hides while the field is off-screen or detached', () => {
    const field = textarea();
    const badge = createBadge(field, { onMask: vi.fn() });
    badge.update([PESEL]);
    reportOnScreen(false);
    flushFrames();
    expect(isShown()).toBe(false);

    reportOnScreen(true);
    flushFrames();
    expect(isShown()).toBe(true);

    field.remove();
    window.dispatchEvent(new Event('scroll'));
    flushFrames();
    expect(isShown()).toBe(false);
  });

  it('calls onIgnore from "×" and has no "×" without onIgnore', () => {
    const onIgnore = vi.fn();
    const badge = createBadge(textarea(), { onMask: vi.fn(), onIgnore });
    part(badge, 'button[aria-label^="Ignoruj"]').click();
    expect(onIgnore).toHaveBeenCalledOnce();

    const plain = createBadge(textarea(), { onMask: vi.fn() });
    expect(badgeShadowRoot(plain)?.querySelectorAll('button')).toHaveLength(1);
  });

  it('gives every checkbox a label', () => {
    const badge = createBadge(textarea(), { onMask: vi.fn() });
    badge.update(ITEMS);
    for (const box of checkboxes(badge)) {
      expect(box.closest('label')?.textContent).toContain('→');
    }
  });

  it.each(['button.mask', 'input'])('keeps focus in the field when %s is pressed', (selector) => {
    const field = textarea();
    field.focus();
    const badge = createBadge(field, { onMask: vi.fn() });
    badge.update([PESEL]);
    for (const type of ['pointerdown', 'mousedown']) {
      const press = new MouseEvent(type, { bubbles: true, cancelable: true, composed: true });
      part(badge, selector).dispatchEvent(press);
      expect(press.defaultPrevented).toBe(true);
    }
    expect(document.activeElement).toBe(field);
  });

  it('removes the host and stops observing on destroy', () => {
    const removeListener = vi.spyOn(window, 'removeEventListener');
    const badge = createBadge(textarea(), { onMask: vi.fn() });
    badge.update(ITEMS);
    badge.destroy();
    expect(host()).toBeNull();
    expect(intersections.every((observer) => observer.disconnected)).toBe(true);
    expect(resizes.every((observer) => observer.disconnected)).toBe(true);
    expect(removeListener.mock.calls.map(([type]) => type)).toEqual(['scroll', 'resize']);
    expect(frames).toHaveLength(0);
    expect(() => {
      badge.destroy();
    }).not.toThrow();
    badge.update(ITEMS);
    expect(host()).toBeNull();
  });
});
