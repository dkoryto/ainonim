// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { AUTHOR, mountAbout } from '~/lib/pages/options/about';

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
});

describe('mountAbout', () => {
  it('names the author and the installed version, and links to the store page', () => {
    vi.spyOn(fakeBrowser.runtime, 'getManifest').mockReturnValue({
      manifest_version: 3,
      name: 'AInonim',
      version: '9.8.7',
    });
    const panel = document.createElement('section');
    panel.append('stale content');

    mountAbout(panel);

    expect(panel.querySelector('h2')?.textContent).toBe('O autorze');
    const terms = [...panel.querySelectorAll('dt')].map((dt) => dt.textContent);
    const values = [...panel.querySelectorAll('dd')].map((dd) => dd.textContent);
    expect(terms).toEqual(['Autor', 'Wersja']);
    expect(values).toEqual([AUTHOR, '9.8.7']);
    expect(panel.textContent).not.toContain('stale content');
    const review = [...panel.querySelectorAll('a')].find((a) => a.textContent === 'Oceń');
    expect(review?.href).toBe(
      `https://chromewebstore.google.com/detail/${fakeBrowser.runtime.id}/reviews`,
    );
  });
});
