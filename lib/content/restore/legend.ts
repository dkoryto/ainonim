// The read-only legend "token → original" shown just before an editable block in an answer
// (ChatGPT's e-mail "writing block" is a ProseMirror editor), which AInonim never writes to.
// It lives in a shadow root so the site's styles do not reach it.

export const LEGEND_ATTRIBUTE = 'data-ainonim-legend';

// Closed shadow roots are unreachable from outside; tests read them through this map.
const legendRoots = new WeakMap<Element, ShadowRoot>();

/** The legend's shadow root. Only for tests: the page cannot get at it. */
export function legendShadowRoot(host: Element): ShadowRoot | undefined {
  return legendRoots.get(host);
}

/** The legends on the page, one per editable block. */
export interface Legends {
  /** Show `entries` (token, original) before `block`; none removes its legend. */
  render(block: HTMLElement, entries: [string, string][]): void;
  /** Remove the legends of blocks that left the page. */
  prune(): void;
  /** Remove every legend. */
  clear(): void;
}

function legendBox(doc: Document, entries: readonly [string, string][]): HTMLElement {
  const box = doc.createElement('div');
  box.setAttribute('part', 'legend');
  box.style.cssText =
    'font: 12px/1.4 system-ui, sans-serif; margin: 4px 0; padding: 4px 8px; ' +
    'border-left: 3px solid #888; opacity: 0.85; user-select: text;';
  const heading = doc.createElement('div');
  heading.textContent = 'AInonim – oryginały danych w bloku poniżej:';
  box.append(heading);
  for (const [token, original] of entries) {
    const line = doc.createElement('div');
    line.textContent = `${token} → ${original}`;
    box.append(line);
  }
  return box;
}

export function createLegends(doc: Document): Legends {
  const hosts = new Map<HTMLElement, HTMLElement>();
  // What each host shows, so an unchanged legend is not rebuilt on every pass.
  const content = new WeakMap<HTMLElement, string>();

  const remove = (block: HTMLElement): void => {
    hosts.get(block)?.remove();
    hosts.delete(block);
  };

  const hostFor = (block: HTMLElement): { host: HTMLElement; root: ShadowRoot } => {
    let host = hosts.get(block);
    let root = host ? legendRoots.get(host) : undefined;
    if (!host || !root) {
      host = doc.createElement('div');
      host.setAttribute(LEGEND_ATTRIBUTE, '');
      root = host.attachShadow({ mode: 'closed' });
      legendRoots.set(host, root);
      hosts.set(block, host);
    }
    if (host.nextElementSibling !== block) block.before(host);
    return { host, root };
  };

  return {
    render(block, entries) {
      if (entries.length === 0) {
        remove(block);
        return;
      }
      const { host, root } = hostFor(block);
      const key = JSON.stringify(entries);
      if (content.get(host) === key) return;
      content.set(host, key);
      root.replaceChildren(legendBox(doc, entries));
    },
    prune() {
      for (const block of hosts.keys()) if (!block.isConnected) remove(block);
    },
    clear() {
      for (const host of hosts.values()) host.remove();
      hosts.clear();
    },
  };
}
