// Tab "O autorze": who makes AInonim and what it is built on.
import { browser } from 'wxt/browser';
import { heading, make } from './dom';

export const AUTHOR = 'Dariusz Koryto';
export const POLANON_URL = 'https://github.com/dkoryto/polanon';

function row(doc: Document, term: string, value: Node | string): HTMLElement[] {
  const dd = make(doc, 'dd');
  dd.append(value);
  return [make(doc, 'dt', undefined, term), dd];
}

function link(doc: Document, href: string, text: string): HTMLAnchorElement {
  const anchor = make(doc, 'a', undefined, text);
  anchor.href = href;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  return anchor;
}

export function mountAbout(panel: HTMLElement): void {
  const doc = panel.ownerDocument;
  const version = browser.runtime.getManifest().version;
  const details = make(doc, 'dl', 'about');
  details.append(
    ...row(doc, 'Autor', AUTHOR),
    ...row(doc, 'Wersja', version),
    ...row(doc, 'Silnik', link(doc, POLANON_URL, 'polanon – wykrywanie polskich danych osobowych')),
  );
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
  );
}
