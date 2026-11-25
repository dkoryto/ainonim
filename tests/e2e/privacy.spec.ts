// Evidence for the privacy policy: personal data typed into a page never leaves the browser.
//
// The test types fictitious personal data into a textarea and a contenteditable on a local page,
// lets the extension analyse it, masks it with "Zamaskuj", then masks a message and restores an
// answer on a stand-in for chatgpt.com. Meanwhile it records the network requests of every
// context involved:
//
// - pages: Playwright's `context.on('request')` and, independently, CDP (see network-recorder.ts);
// - the extension service worker: CDP auto-attach (Playwright's request events do not report the
//   requests of an extension's service worker);
// - the offscreen document running Pyodide: CDP auto-attach only, since Playwright does not expose
//   offscreen documents. It is created on the first analysis, while recording is already on, and
//   stays paused until its network recording is enabled.
//
// The test proves each context is actually recorded (the offscreen document's own load of the
// polanon wheel, a canary fetch from the service worker, the pages' own documents) and then
// asserts that:
// 1. every request goes to the extension package (chrome-extension://<id>/), the local test
//    server or the chatgpt.com stand-in that the test itself answers (`context.route`; plus the
//    browser's own favicon request for it, see below), and
// 2. no request URL, header or body contains any typed value, raw or URL-encoded.
//
// A control test checks that the same recording and search do catch a value a page sends.
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { test as base, expect, launchWithExtension, serviceWorker } from './fixtures';
import { type FixtureServer, startFixtureServer } from './lib-page';
import { NetworkRecorder, type RecordedRequest } from './network-recorder';
import { clickMask, openPanel, panel } from './panel';

declare const chrome: { runtime: { getURL: (path: string) => string } };

const NAME = 'Jan Kowalski';
const PESEL = '50810112354';
const ACCOUNT = 'PL61109010140000071219812874';
const TYPED = `${NAME}, PESEL ${PESEL}, konto ${ACCOUNT}`;
/** What must never appear in a request; parts too, so a partial leak is caught as well. */
const VALUES = [NAME, 'Kowalski', PESEL, ACCOUNT, ACCOUNT.slice(2)];

const CHATGPT_PAGE = resolve(import.meta.dirname, 'pages/chatgpt.html');

/** A request as seen by either recorder, reduced to what the assertions read. */
interface Seen {
  recorder: 'cdp' | 'playwright';
  context: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** Every spelling of `value` a request could carry: raw, percent-encoded, form-encoded. */
function spellings(value: string): string[] {
  const encoded = encodeURIComponent(value);
  return [...new Set([value, encoded, encoded.replaceAll('%20', '+'), encodeURI(value)])];
}

/** The requests that contain one of `values` in their URL, a header or the body. */
function findLeaks(requests: readonly Seen[], values: readonly string[]): string[] {
  const needles = values.flatMap(spellings).map((needle) => needle.toLowerCase());
  const leaks: string[] = [];
  for (const request of requests) {
    const haystack = [request.url, ...Object.entries(request.headers).flat(), request.body]
      .join('\n')
      .toLowerCase();
    // Also decoded, in case a value was encoded in a way not listed in `spellings`.
    let decoded = haystack;
    try {
      decoded = decodeURIComponent(haystack.replaceAll('+', ' '));
    } catch {
      // Not valid percent-encoding: the raw text is searched anyway.
    }
    const hit = needles.find((needle) => haystack.includes(needle) || decoded.includes(needle));
    if (hit) leaks.push(`${request.recorder}/${request.context}: ${request.url} contains "${hit}"`);
  }
  return leaks;
}

function cdpSeen(request: RecordedRequest, extensionOrigin: string): Seen {
  const { target } = request;
  let context = `${target.type} ${target.url}`;
  if (target.type === 'service_worker' && target.url.startsWith(extensionOrigin)) {
    context = 'service worker';
  } else if (target.url === `${extensionOrigin}/offscreen.html`) {
    context = 'offscreen';
  }
  return {
    recorder: 'cdp',
    context,
    url: request.url,
    headers: request.headers,
    body: request.postData,
  };
}

/** Records requests through Playwright, which sees the pages' requests. */
function recordWithPlaywright(context: BrowserContext): {
  requests: Seen[];
  settle: () => Promise<void>;
} {
  const requests: Seen[] = [];
  const pending: Promise<void>[] = [];
  context.on('request', (request) => {
    pending.push(
      request.allHeaders().then((headers) => {
        requests.push({
          recorder: 'playwright',
          context: request.serviceWorker() ? 'page service worker' : 'page',
          url: request.url(),
          headers,
          body: request.postData() ?? '',
        });
      }),
    );
  });
  return {
    requests,
    settle: async () => {
      await Promise.all(pending);
    },
  };
}

interface Recording {
  context: BrowserContext;
  cdp: NetworkRecorder;
  playwright: ReturnType<typeof recordWithPlaywright>;
}

const test = base.extend<{ recording: Recording }>({
  recording: async ({}, use) => {
    const userDataDir = await mkdtemp(join(tmpdir(), 'ainonim-privacy-'));
    // Port 0: Chromium picks a free port and writes it to the profile, where the recorder reads it.
    const context = await launchWithExtension({
      userDataDir,
      args: ['--remote-debugging-port=0'],
    });
    const cdp = await NetworkRecorder.start(userDataDir);
    const playwright = recordWithPlaywright(context);
    await use({ context, cdp, playwright });
    cdp.close();
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  },
});

let server: FixtureServer;

test.beforeAll(async () => {
  server = await startFixtureServer();
});

test.afterAll(async () => {
  await server.close();
});

/**
 * Type into `field`, open the panel from the field's icon once the analysis found the three
 * values, click "Zamaskuj zaznaczone" and close the panel again (see tests/e2e/panel.ts).
 */
async function typeAndMask(page: Page, field: Locator): Promise<void> {
  await field.click();
  await page.keyboard.type(TYPED);
  await openPanel(page, field, 3);
  await clickMask(page);
  await expect.poll(() => fieldText(field)).toContain('<PESEL_1>');
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
}

async function fieldText(field: Locator): Promise<string> {
  return field.evaluate((element) =>
    element instanceof HTMLTextAreaElement ? element.value : element.textContent,
  );
}

function expectMasked(text: string): void {
  expect(text).toContain('<OSOBA_1>');
  expect(text).toContain('<PESEL_1>');
  for (const value of VALUES) expect(text).not.toContain(value);
}

test('typed personal data never leaves the browser', async ({ recording }) => {
  test.setTimeout(120_000);
  const { context, cdp, playwright } = recording;
  const worker = await serviceWorker(context);
  // `URL.origin` is "null" for chrome-extension: URLs in Node, so the origin is built by hand.
  const extensionOrigin = `chrome-extension://${new URL(worker.url()).host}`;
  const serverOrigin = new URL(server.url('fields.html')).origin;

  // The chatgpt.com stand-in is answered here; the URLs are kept to allow exactly those.
  const routed = new Set<string>();
  const chatHtml = await readFile(CHATGPT_PAGE, 'utf8');
  await context.route(
    (url) => url.hostname === 'chatgpt.com',
    (route) => {
      routed.add(route.request().url());
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: chatHtml });
    },
  );

  // Canary: a request the service worker makes itself must show up in the recording.
  const canaryUrl = await worker.evaluate(async () => {
    const url = chrome.runtime.getURL('manifest.json');
    await fetch(url);
    return url;
  });

  // A plain page: textarea and contenteditable.
  const page = await context.newPage();
  await page.goto(server.url('fields.html'));
  for (const selector of ['#plain', '#rich']) {
    const field = page.locator(selector);
    await typeAndMask(page, field);
    expectMasked(await fieldText(field));
  }

  // The chat stand-in: mask the message, then an answer with tokens is shown with the originals.
  const chat = await context.newPage();
  await chat.goto('https://chatgpt.com/c/privacy-test');
  const composer = chat.getByRole('textbox', { name: 'Zapytaj ChatGPT' });
  await typeAndMask(chat, composer);
  expectMasked(await fieldText(composer));
  await chat.evaluate(() => {
    const article = document.createElement('article');
    article.dataset.turn = 'assistant';
    const body = document.createElement('div');
    body.setAttribute('data-response-body', 'msg-privacy');
    const paragraph = document.createElement('p');
    paragraph.id = 'answer';
    paragraph.textContent = 'Dzień dobry, <OSOBA_1>. Twój PESEL to <PESEL_1>.';
    body.append(paragraph);
    article.append(body);
    document.querySelector('main')?.prepend(article);
  });
  await expect(chat.locator('#answer')).toHaveText(`Dzień dobry, ${NAME}. Twój PESEL to ${PESEL}.`);

  // Let late requests (and bodies the recorder asked for) arrive before judging.
  await chat.waitForTimeout(1_000);
  await cdp.settle();
  await playwright.settle();
  const seen = [...cdp.requests.map((r) => cdpSeen(r, extensionOrigin)), ...playwright.requests];

  // Each context was really recorded.
  const fromContext = (name: string) => seen.filter((request) => request.context === name);
  expect(
    cdp.targets.some((t) => t.type === 'service_worker' && t.url.startsWith(extensionOrigin)),
  ).toBe(true);
  expect(fromContext('service worker').map((r) => r.url)).toContain(canaryUrl);
  expect(cdp.targets.map((t) => t.url)).toContain(`${extensionOrigin}/offscreen.html`);
  expect(fromContext('offscreen').map((r) => r.url)).toEqual(
    expect.arrayContaining([expect.stringMatching(/\/python\/polanon-[^/]+\.whl$/)]),
  );
  const pageUrls = seen.filter((r) => r.recorder === 'playwright').map((r) => r.url);
  expect(pageUrls).toEqual(
    expect.arrayContaining([server.url('fields.html'), 'https://chatgpt.com/c/privacy-test']),
  );

  // 1. Nothing went anywhere but the extension package, the local server and the routed stand-in.
  // Chrome fetches a tab's favicon itself, past `context.route`; for the stand-in it is
  // https://chatgpt.com/favicon.ico, a request the real site gets from any visit, and here it ends
  // in the host resolver rule (no DNS). Chrome's own UI (e.g. the omnibox popup on Linux) loads
  // chrome:// resources and, at times, icons as data: URLs; neither touches the network. All of
  // them are still searched for values below.
  const browserFavicon = 'https://chatgpt.com/favicon.ico';
  const fromBrowserUi = (context: string) => context.startsWith('browser_ui chrome://');
  const outside = seen
    .filter(
      ({ url, context }) =>
        !url.startsWith(`${extensionOrigin}/`) &&
        !url.startsWith(`${serverOrigin}/`) &&
        !routed.has(url) &&
        url !== browserFavicon &&
        !url.startsWith('chrome://') &&
        !(url.startsWith('data:') && fromBrowserUi(context)),
    )
    .map((r) => `${r.recorder}/${r.context}: ${r.url}`);
  expect(outside).toEqual([]);

  // 2. No typed value in any request.
  expect(findLeaks(seen, VALUES)).toEqual([]);
});

test('control: the recording catches values a page sends', async ({ recording }) => {
  const { context, cdp, playwright } = recording;
  const page = await context.newPage();
  await page.goto(server.url('fields.html'));
  // A large body: CDP may leave it out of the event, and the recorder then asks for it.
  const padding = 'x'.repeat(200_000);

  await page.evaluate(
    async ({ name, pesel, padding }) => {
      await fetch(`/report?q=${encodeURIComponent(name)}`);
      await fetch('/report', { method: 'POST', body: new URLSearchParams({ padding, name }) });
      await fetch('/report', { method: 'POST', headers: { 'x-value': pesel } });
    },
    { name: NAME, pesel: PESEL, padding },
  );

  // Events arrive asynchronously over the second connection.
  const leaks = async (recorder: 'cdp' | 'playwright') => {
    await cdp.settle();
    await playwright.settle();
    const requests =
      recorder === 'cdp' ? cdp.requests.map((r) => cdpSeen(r, '')) : playwright.requests;
    return findLeaks(requests, VALUES).length;
  };
  await expect.poll(() => leaks('cdp')).toBe(3);
  await expect.poll(() => leaks('playwright')).toBe(3);
  expect(findLeaks(playwright.requests, [ACCOUNT])).toEqual([]);
});
