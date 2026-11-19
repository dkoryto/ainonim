// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { badgeShadowRoot, createBadge, type Badge } from '~/lib/ui/badge';

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
  document.body.replaceChildren();
  for (const host of document.querySelectorAll('ainonim-badge')) host.remove();
});

function textarea(): HTMLTextAreaElement {
  const field = document.createElement('textarea');
  document.body.append(field);
  vi.spyOn(field, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ x: 100, y: 50, width: 300, height: 120 }),
  );
  return field;
}

function host(): HTMLElement | null {
  return document.querySelector('ainonim-badge');
}

function isShown(): boolean {
  return host()?.style.getPropertyValue('display') === 'block';
}

function part(badge: Badge, selector: string): HTMLElement {
  const element = badgeShadowRoot(badge)?.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`no ${selector} in the badge`);
  return element;
}

describe('createBadge', () => {
  it('shows the count and the found types', () => {
    const badge = createBadge(textarea(), { onMask: vi.fn() });
    badge.update({ count: 3, byType: { PERSON: 2, PESEL: 1 } });
    flushFrames();
    expect(part(badge, '[role="status"]').textContent).toBe('3 · osoba ×2, PESEL');
    expect(isShown()).toBe(true);
  });

  it('puts the badge inside the bottom-right corner of the field', () => {
    const badge = createBadge(textarea(), { onMask: vi.fn() });
    badge.update({ count: 1, byType: { EMAIL: 1 } });
    flushFrames();
    const { clientWidth, clientHeight } = document.documentElement;
    expect(host()?.style.getPropertyValue('right')).toBe(`${String(clientWidth - 400 + 4)}px`);
    expect(host()?.style.getPropertyValue('bottom')).toBe(`${String(clientHeight - 170 + 4)}px`);
  });

  it('is hidden at a count of 0, also right after having been shown', () => {
    const badge = createBadge(textarea(), { onMask: vi.fn() });
    badge.update({ count: 0, byType: {} });
    flushFrames();
    expect(isShown()).toBe(false);

    badge.update({ count: 1, byType: { PHONE: 1 } });
    flushFrames();
    badge.update({ count: 0, byType: {} });
    expect(isShown()).toBe(false);
  });

  it('hides while the field is off-screen or detached', () => {
    const field = textarea();
    const badge = createBadge(field, { onMask: vi.fn() });
    badge.update({ count: 1, byType: { PHONE: 1 } });
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

  it('calls onMask and onIgnore from their buttons', () => {
    const onMask = vi.fn();
    const onIgnore = vi.fn();
    const badge = createBadge(textarea(), { onMask, onIgnore });
    part(badge, 'button[aria-label^="Zamaskuj"]').click();
    expect(onMask).toHaveBeenCalledOnce();
    part(badge, 'button[aria-label^="Ignoruj"]').click();
    expect(onIgnore).toHaveBeenCalledOnce();
  });

  it('has no ignore button without onIgnore', () => {
    const badge = createBadge(textarea(), { onMask: vi.fn() });
    expect(badgeShadowRoot(badge)?.querySelectorAll('button')).toHaveLength(1);
  });

  it('keeps focus in the field when a button is pressed', () => {
    const field = textarea();
    field.focus();
    const badge = createBadge(field, { onMask: vi.fn() });
    badge.update({ count: 1, byType: { PHONE: 1 } });
    const press = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
    part(badge, 'button.mask').dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(field);
  });

  it('removes the host and stops observing on destroy', () => {
    const removeListener = vi.spyOn(window, 'removeEventListener');
    const badge = createBadge(textarea(), { onMask: vi.fn() });
    badge.update({ count: 2, byType: { PERSON: 2 } });
    badge.destroy();
    expect(host()).toBeNull();
    expect(intersections.every((observer) => observer.disconnected)).toBe(true);
    expect(resizes.every((observer) => observer.disconnected)).toBe(true);
    expect(removeListener.mock.calls.map(([type]) => type)).toEqual(['scroll', 'resize']);
    expect(frames).toHaveLength(0);
    expect(() => {
      badge.destroy();
    }).not.toThrow();
  });
});
