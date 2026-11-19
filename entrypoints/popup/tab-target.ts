import { normalizeHostname } from '~/lib/settings';

/** What the popup can offer for the active tab. */
export type TabTarget =
  | { kind: 'site'; hostname: string }
  | { kind: 'unsupported'; reason: 'browser-page' | 'web-store' | 'file' | 'unknown' };

// Chrome blocks content scripts on its Web Store regardless of host permissions.
const WEB_STORE_HOSTS = new Set(['chromewebstore.google.com']);

/**
 * Classify the active tab's URL. A per-site switch only makes sense for http(s) pages, where the
 * content script runs; local files have no hostname to key the setting by.
 */
export function describeTabUrl(url: string | undefined): TabTarget {
  if (url === undefined) return { kind: 'unsupported', reason: 'unknown' };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: 'unsupported', reason: 'unknown' };
  }
  if (parsed.protocol === 'file:') return { kind: 'unsupported', reason: 'file' };
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { kind: 'unsupported', reason: 'browser-page' };
  }
  const hostname = normalizeHostname(parsed.hostname);
  if (hostname === '') return { kind: 'unsupported', reason: 'unknown' };
  if (
    WEB_STORE_HOSTS.has(hostname) ||
    (hostname === 'chrome.google.com' && parsed.pathname.startsWith('/webstore'))
  ) {
    return { kind: 'unsupported', reason: 'web-store' };
  }
  return { kind: 'site', hostname };
}

const UNSUPPORTED_NOTES: Record<Extract<TabTarget, { kind: 'unsupported' }>['reason'], string> = {
  'browser-page': 'Na stronach przeglądarki AInonim nie działa.',
  'web-store': 'Chrome nie pozwala rozszerzeniom działać w Chrome Web Store.',
  file: 'Na plikach otwartych z dysku AInonim nie działa.',
  unknown: 'Nie udało się odczytać adresu tej karty.',
};

export function unsupportedNote(target: Extract<TabTarget, { kind: 'unsupported' }>): string {
  return UNSUPPORTED_NOTES[target.reason];
}
