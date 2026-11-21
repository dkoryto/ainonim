// Hostnames and hostname patterns the user types into the "Strony" tab. A pattern is a hostname
// (`example.com`, `127.0.0.1`, `[::1]`) or, on the allow-list, `*.example.com`, which matches
// example.com itself and every subdomain (the way Chrome's match patterns read `*.`).

export type SitePatternProblem = 'empty' | 'invalid' | 'wildcard' | 'too-broad';

export type SitePatternResult =
  { ok: true; pattern: string } | { ok: false; problem: SitePatternProblem };

export const SITE_PATTERN_PROBLEMS: Record<SitePatternProblem, string> = {
  empty: 'Wpisz adres strony.',
  invalid: 'To nie jest poprawny adres strony, np. example.com albo *.example.com.',
  wildcard: 'Tutaj wpisz jedną stronę, bez „*.”.',
  'too-broad': 'Gwiazdka obejmuje całą domenę najwyższego poziomu – podaj np. *.example.com.',
};

const MAX_HOSTNAME_LENGTH = 253;
const LABEL = /^(?!-)[a-z0-9_-]{1,63}(?<!-)$/;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//;

/** The canonical hostname of `text` (lowercase, punycode, no port), or undefined. */
function canonicalHost(text: string): string | undefined {
  if (text === '' || /[\s@\\]/.test(text)) return undefined;
  let host: string;
  try {
    host = new URL(`http://${text}`).hostname;
  } catch {
    return undefined;
  }
  host = host.replace(/\.$/, '');
  if (host === '' || host.length > MAX_HOSTNAME_LENGTH) return undefined;
  if (host.startsWith('[')) return host;
  return host.split('.').every((label) => LABEL.test(label)) ? host : undefined;
}

/**
 * Read what the user typed or pasted: a hostname, `*.hostname` (when `allowWildcard`), or a whole
 * address, of which only the host counts. Returns the canonical pattern or why it is not usable.
 */
export function parseSitePattern(input: string, allowWildcard = true): SitePatternResult {
  let text = input.trim().toLowerCase();
  if (text === '') return { ok: false, problem: 'empty' };

  if (SCHEME.test(text)) {
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      return { ok: false, problem: 'invalid' };
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { ok: false, problem: 'invalid' };
    }
    if (url.username !== '' || url.password !== '') return { ok: false, problem: 'invalid' };
    text = url.host;
  } else {
    text = text.replace(/[/?#].*$/, '');
  }

  const wildcard = text.startsWith('*.');
  if (wildcard) {
    if (!allowWildcard) return { ok: false, problem: 'wildcard' };
    text = text.slice(2);
  }
  const host = canonicalHost(text);
  if (host === undefined) return { ok: false, problem: 'invalid' };
  if (!wildcard) return { ok: true, pattern: host };

  if (host.startsWith('[') || IPV4.test(host)) return { ok: false, problem: 'invalid' };
  if (!host.includes('.')) return { ok: false, problem: 'too-broad' };
  return { ok: true, pattern: `*.${host}` };
}

/** Whether `hostname` (already normalised) is covered by the canonical `pattern`. */
export function matchesSitePattern(hostname: string, pattern: string): boolean {
  const host = hostname.replace(/\.$/, '');
  if (!pattern.startsWith('*.')) return host === pattern;
  const base = pattern.slice(2);
  return host === base || host.endsWith(`.${base}`);
}
