// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyToClipboard, createSupportLinks, reviewUrl, storeUrl } from '~/lib/pages/support';

describe('support links', () => {
  it('builds the store and review URLs from the extension id', () => {
    expect(storeUrl('abc')).toBe('https://chromewebstore.google.com/detail/abc');
    expect(reviewUrl('abc')).toBe('https://chromewebstore.google.com/detail/abc/reviews');
  });

  it('hides the coffee link until a page is set', () => {
    const box = createSupportLinks(document, { extensionId: 'abc', coffeeUrl: '', copy: vi.fn() });
    expect(box.textContent).toBe('Podoba Ci się AInonim? Oceń · Poleć znajomym');
    const withCoffee = createSupportLinks(document, {
      extensionId: 'abc',
      coffeeUrl: 'https://example.com/kawa',
      copy: vi.fn(),
    });
    const coffee = withCoffee.querySelector('a');
    expect(coffee?.textContent).toBe('Postaw kawę autorowi');
    expect(coffee?.rel).toBe('noopener noreferrer');
  });

  it('copies the store link and says whether it worked', async () => {
    const copy = vi.fn().mockResolvedValue(true);
    const box = createSupportLinks(document, { extensionId: 'abc', coffeeUrl: '', copy });
    const share = box.querySelector('button');
    share?.click();
    await vi.waitFor(() => {
      expect(share?.textContent).toBe('Skopiowano link');
    });
    expect(copy).toHaveBeenCalledWith('https://chromewebstore.google.com/detail/abc');
  });
});

describe('sharing when the clipboard is refused', () => {
  it('says the link could not be copied', async () => {
    const copy = vi.fn().mockResolvedValue(false);
    const box = createSupportLinks(document, { extensionId: 'abc', coffeeUrl: '', copy });
    const share = box.querySelector('button');
    share?.click();
    await vi.waitFor(() => {
      expect(share?.textContent).toBe('Nie udało się skopiować');
    });
  });
});

describe('copyToClipboard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes the text and reports success', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    expect(await copyToClipboard('https://chromewebstore.google.com/detail/abc')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://chromewebstore.google.com/detail/abc');
  });

  it('reports false when the browser refuses (no focus, no permission)', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
      new DOMException('Document is not focused.', 'NotAllowedError'),
    );
    expect(await copyToClipboard('x')).toBe(false);
  });
});
