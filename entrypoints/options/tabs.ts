// Tabs of the options page (WAI-ARIA tabs pattern). The open tab is kept in the URL hash
// (#kategorie works as well as #categories), so the popup can link straight to one.

const ALIASES: Record<string, string> = {
  ogolne: 'general',
  kategorie: 'categories',
  slowa: 'words',
  dziennik: 'log',
  'o-autorze': 'about',
};

export function tabFromHash(hash: string, names: readonly string[]): string {
  const raw = decodeURIComponent(hash.replace(/^#/, '')).toLowerCase();
  const name = ALIASES[raw] ?? raw;
  return names.includes(name) ? name : (names[0] ?? '');
}

export function setupTabs(doc: Document, names: readonly string[]): void {
  const tabs = names.flatMap((name) => {
    const tab = doc.getElementById(`tab-${name}`);
    const panel = doc.getElementById(`panel-${name}`);
    return tab && panel ? [{ name, tab, panel }] : [];
  });

  const select = (name: string, focus = false): void => {
    for (const entry of tabs) {
      const selected = entry.name === name;
      entry.tab.setAttribute('aria-selected', String(selected));
      entry.tab.tabIndex = selected ? 0 : -1;
      entry.panel.hidden = !selected;
      if (selected && focus) entry.tab.focus();
    }
    if (doc.defaultView && doc.defaultView.location.hash !== `#${name}`) {
      doc.defaultView.history.replaceState(null, '', `#${name}`);
    }
  };

  tabs.forEach((entry, index) => {
    entry.tab.addEventListener('click', () => {
      select(entry.name);
    });
    entry.tab.addEventListener('keydown', (event) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (step === undefined) return;
      event.preventDefault();
      const next = tabs[(index + step + tabs.length) % tabs.length];
      if (next) select(next.name, true);
    });
  });

  select(tabFromHash(doc.defaultView?.location.hash ?? '', names));
  doc.defaultView?.addEventListener('hashchange', () => {
    select(tabFromHash(doc.defaultView?.location.hash ?? '', names));
  });
}
