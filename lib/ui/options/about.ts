// Tab "O autorze": who makes AInonim and which version this is.
import { browser } from 'wxt/browser';
import { copyToClipboard, createSupportLinks } from '~/lib/support';
import { heading, make } from './dom';

export const AUTHOR = 'Dariusz Koryto';

function row(doc: Document, term: string, value: Node | string): HTMLElement[] {
  const dd = make(doc, 'dd');
  dd.append(value);
  return [make(doc, 'dt', undefined, term), dd];
}

export function mountAbout(panel: HTMLElement): void {
  const doc = panel.ownerDocument;
  const version = browser.runtime.getManifest().version;
  const details = make(doc, 'dl', 'about');
  details.append(...row(doc, 'Autor', AUTHOR), ...row(doc, 'Wersja', version));
  panel.replaceChildren(
    ...heading(doc, 'O autorze'),
    make(
      doc,
      'p',
      undefined,
      'AInonim wykrywa i maskuje polskie dane osobowe, zanim trafią do czatu AI. Całe ' +
        'wykrywanie działa lokalnie w przeglądarce: wtyczka nie wysyła tekstu, nie zbiera ' +
        'statystyk i nie łączy się z żadnym serwerem.',
    ),
    details,
    createSupportLinks(doc, { extensionId: browser.runtime.id, copy: copyToClipboard }),
  );
}
