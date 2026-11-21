// Links that let a happy user support the author: a coffee, a review, a recommendation. The store
// page is built from the extension's own id, so it is right once AInonim is published (an
// unpacked copy has another id and its links lead nowhere).

/** The author's "buy me a coffee" page; empty hides the link until the owner sets it. */
export const COFFEE_URL = '';

export function storeUrl(extensionId: string): string {
  return `https://chromewebstore.google.com/detail/${encodeURIComponent(extensionId)}`;
}

export function reviewUrl(extensionId: string): string {
  return `${storeUrl(extensionId)}/reviews`;
}

export interface SupportLinksOptions {
  extensionId: string;
  coffeeUrl?: string;
  /** Copies text to the clipboard; resolves false when the browser refused. */
  copy: (text: string) => Promise<boolean>;
}

/**
 * "Podoba Ci się AInonim?" with: Postaw kawę autorowi (only when a coffee page is set), Oceń
 * (the store's review page), Poleć znajomym (copies the store link and says so).
 */
export function createSupportLinks(doc: Document, options: SupportLinksOptions): HTMLElement {
  const coffeeUrl = options.coffeeUrl ?? COFFEE_URL;
  const box = doc.createElement('p');
  box.className = 'support';
  box.append(doc.createTextNode('Podoba Ci się AInonim? '));

  const link = (href: string, text: string): HTMLAnchorElement => {
    const anchor = doc.createElement('a');
    anchor.href = href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.textContent = text;
    return anchor;
  };
  const parts: HTMLElement[] = [];
  if (coffeeUrl !== '') parts.push(link(coffeeUrl, 'Postaw kawę autorowi'));
  parts.push(link(reviewUrl(options.extensionId), 'Oceń'));

  const share = doc.createElement('button');
  share.type = 'button';
  share.className = 'link-button';
  share.textContent = 'Poleć znajomym';
  share.title = 'Kopiuje link do AInonim w Chrome Web Store';
  share.addEventListener('click', () => {
    void options.copy(storeUrl(options.extensionId)).then((ok) => {
      share.textContent = ok ? 'Skopiowano link' : 'Nie udało się skopiować';
    });
  });
  parts.push(share);

  parts.forEach((part, index) => {
    if (index > 0) box.append(doc.createTextNode(' · '));
    box.append(part);
  });
  return box;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
