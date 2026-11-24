// Demo video of the real extension (1920×1080, H.264): `npm run video` builds the e2e package and
// runs this script (set-up in scripts/store-kit.js). Frames are taken losslessly (PNG) through the DevTools screencast and encoded with ffmpeg at a constant frame rate. A
// cursor, captions and the title cards are drawn over the page; the chat page, the model's answer
// and the sending are stand-ins; the icon, panel, masking, restoring, automatic masking and the
// options page are the extension's own. All data is fictitious. Needs ffmpeg on PATH.
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  ROOT,
  chatUrl,
  closeButtonPoint,
  drawTooltip,
  iconOf,
  launch,
  maskButtonPoint,
  removeTooltip,
  streamAnswer,
  waitForAnswerText,
  waitForPanelRows,
} from './store-kit.js';

const OUT = resolve(ROOT, 'assets/store/demo.mp4');
// 960×540 CSS pixels at 2× gives 1080p with the panel large enough to read on a phone.
const VIEWPORT = { width: 960, height: 540 };
const SCALE = 2;
const FPS = 60;

const FIRST_MESSAGE =
  'Napisz krótką odpowiedź do klienta: Jan Kowalski, PESEL 50810112354, prosi o zwrot ' +
  'pieniędzy na konto PL61109010140000071219812874.';
const FIRST_ANSWER = [
  'Dzień dobry, <OSOBA_1:wołacz>,',
  'dziękujemy za zgłoszenie. Zwrot pieniędzy trafi na rachunek <IBAN_1> w ciągu 14 dni.',
  'Pozdrawiamy, Dział Obsługi Klienta',
];
const SECOND_MESSAGE =
  'Umów spotkanie z Anną Nowak, telefon 601 234 567, e-mail anna.nowak@example.pl.';
const SECOND_ANSWER = [
  'Jasne. Oto wiadomość do wysłania na <EMAIL_1>:',
  'Dzień dobry, <OSOBA_1:wołacz>, proponuję spotkanie w czwartek o 10:00. ' +
    'W razie zmian proszę o telefon pod numer <TELEFON_1>.',
];

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// ---------------------------------------------------------------------------------------------
// Recording: the screencast sends a frame whenever the page changes; each is saved with its time
// and shown until the next one. The screencast gives frames in device-independent pixels, so the
// window is 1920×1080 at 1× and the tab is zoomed to 200% (see zoomTabs): the page is laid out
// in 960×540 CSS pixels and rendered sharp at full size.

class Recorder {
  constructor(page, dir) {
    this.page = page;
    this.dir = dir;
    this.frames = [];
    this.writes = [];
  }

  async start() {
    this.cdp = await this.page.context().newCDPSession(this.page);
    this.cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
      const file = join(this.dir, `f${String(this.frames.length).padStart(5, '0')}.png`);
      this.frames.push({ file, at: metadata.timestamp ?? Date.now() / 1000 });
      this.writes.push(writeFile(file, Buffer.from(data, 'base64')));
      this.cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    });
    await this.cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  }

  /** A navigation can move the page to another renderer, so the screencast is started again. */
  async restart() {
    await this.cdp.send('Page.stopScreencast').catch(() => {});
    await this.cdp.detach().catch(() => {});
    await this.start();
  }

  async stop() {
    await this.cdp.send('Page.stopScreencast');
    this.end = Date.now() / 1000;
    await Promise.all(this.writes);
  }

  /** Encode the frames, each lasting until the next one, into an MP4 at a constant rate. */
  async encode(path) {
    if (this.frames.length === 0) throw new Error('no frames were recorded');
    const lines = [];
    this.frames.forEach(({ file, at }, index) => {
      const next = this.frames[index + 1]?.at ?? this.end;
      lines.push(`file '${file}'`, `duration ${Math.max(next - at, 0.001).toFixed(4)}`);
    });
    // The concat demuxer ignores the last duration unless the last file is listed again.
    lines.push(`file '${this.frames.at(-1).file}'`);
    const list = join(this.dir, 'frames.txt');
    await writeFile(list, `${lines.join('\n')}\n`);
    const width = VIEWPORT.width * SCALE;
    const height = VIEWPORT.height * SCALE;
    const result = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-loglevel',
        'error',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        list,
        '-vf',
        `scale=${String(width)}:${String(height)}:flags=lanczos,fps=${String(FPS)},format=yuv420p`,
        '-c:v',
        'libx264',
        '-preset',
        'slow',
        '-crf',
        '14',
        '-profile:v',
        'high',
        '-movflags',
        '+faststart',
        path,
      ],
      { stdio: 'inherit' },
    );
    if (result.status !== 0) throw new Error('ffmpeg failed');
  }
}

// ---------------------------------------------------------------------------------------------
// The overlay: a cursor that follows the real mouse events, a caption and full-screen cards. It
// lives in its own shadow root and lets every click through.

async function installOverlay(page, icon, cursor) {
  await page.evaluate(
    ({ icon, cursor }) => {
      document.getElementById('demo-overlay')?.remove();
      const host = document.createElement('div');
      host.id = 'demo-overlay';
      Object.assign(host.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '2147483647',
        pointerEvents: 'none',
      });
      const root = host.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>
          * { box-sizing: border-box; }
          .cursor { position: fixed; left: 0; top: 0; width: 22px; height: 22px;
            transform: translate(${String(cursor.x)}px, ${String(cursor.y)}px);
            filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.35)); }
          .ring { position: fixed; width: 36px; height: 36px; margin: -18px 0 0 -18px;
            border-radius: 50%; background: rgb(29 78 216 / 0.28); opacity: 0;
            transform: scale(0.4); }
          .ring.on { animation: ring 450ms ease-out; }
          @keyframes ring { from { opacity: 1; transform: scale(0.4); }
            to { opacity: 0; transform: scale(1.4); } }
          .caption { position: fixed; left: 50%; top: 12px; width: max-content; max-width: 880px;
            transform: translate(-50%, -8px); opacity: 0;
            padding: 9px 18px; border-radius: 12px;
            font: 600 17px/1.35 system-ui, -apple-system, 'Segoe UI', sans-serif;
            color: #ffffff; background: rgb(17 24 39 / 0.9); text-align: center;
            box-shadow: 0 6px 20px rgb(0 0 0 / 0.18);
            transition: opacity 250ms ease, transform 250ms ease; }
          .caption.on { opacity: 1; transform: translate(-50%, 0); }
          .caption small { display: block; font-weight: 400; font-size: 14px; color: #d1d5db; }
          .card { position: fixed; inset: 0; display: flex; flex-direction: column;
            align-items: center; justify-content: center; gap: 10px;
            background: #ffffff; color: #111827; opacity: 0; transition: opacity 400ms ease;
            font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; text-align: center; }
          .card.on { opacity: 1; }
          .card img { width: 96px; height: 96px; margin-bottom: 8px; }
          .card h1 { margin: 0; font-size: 44px; letter-spacing: -0.5px; }
          .card p { margin: 0; font-size: 21px; color: #374151; }
          .card .small { font-size: 15px; color: #6b7280; margin-top: 6px; }
        </style>
        <div class="card"></div>
        <div class="caption"></div>
        <div class="ring"></div>
        <svg class="cursor" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 2 L3 19 L7.6 14.8 L10.6 21.4 L13.4 20.2 L10.5 13.7 L16.6 13.4 Z"
            fill="#111827" stroke="#ffffff" stroke-width="1.4" stroke-linejoin="round"/>
        </svg>`;
      document.documentElement.append(host);
      const pointer = root.querySelector('.cursor');
      const ring = root.querySelector('.ring');
      const caption = root.querySelector('.caption');
      const card = root.querySelector('.card');
      window.addEventListener(
        'mousemove',
        (event) => {
          pointer.style.transform = `translate(${String(event.clientX - 3)}px, ${String(event.clientY - 2)}px)`;
        },
        true,
      );
      window.addEventListener(
        'mousedown',
        (event) => {
          ring.style.left = `${String(event.clientX)}px`;
          ring.style.top = `${String(event.clientY)}px`;
          ring.classList.remove('on');
          void ring.offsetWidth;
          ring.classList.add('on');
        },
        true,
      );
      window.demo = {
        caption(title, detail) {
          if (!title) {
            caption.classList.remove('on');
            return;
          }
          caption.textContent = title;
          if (detail) {
            const small = document.createElement('small');
            small.textContent = detail;
            caption.append(small);
          }
          caption.classList.add('on');
        },
        card(title, lines, small) {
          if (!title) {
            card.classList.remove('on');
            return;
          }
          card.replaceChildren();
          const image = document.createElement('img');
          image.src = icon;
          image.alt = '';
          const heading = document.createElement('h1');
          heading.textContent = title;
          card.append(image, heading);
          for (const line of lines) {
            const paragraph = document.createElement('p');
            paragraph.textContent = line;
            card.append(paragraph);
          }
          if (small) {
            const note = document.createElement('p');
            note.className = 'small';
            note.textContent = small;
            card.append(note);
          }
          card.classList.add('on');
        },
        cursor(visible) {
          pointer.style.visibility = visible ? 'visible' : 'hidden';
        },
      };
    },
    { icon, cursor },
  );
}

// ---------------------------------------------------------------------------------------------
// Directing helpers.

const mouse = { x: VIEWPORT.width * 0.62, y: VIEWPORT.height * 0.55 };

/** Move the mouse to (x, y) along an eased path, as a hand would. */
async function moveTo(page, x, y, duration = 700) {
  const from = { ...mouse };
  const steps = Math.max(8, Math.round(duration / 16));
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const ease = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    mouse.x = from.x + (x - from.x) * ease;
    mouse.y = from.y + (y - from.y) * ease;
    await page.mouse.move(mouse.x, mouse.y);
    await sleep(16);
  }
}

async function clickAt(page, point, duration) {
  await moveTo(page, point.x, point.y, duration);
  await sleep(150);
  await page.mouse.down();
  await sleep(90);
  await page.mouse.up();
}

async function centreOf(locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('element not rendered');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const caption = (page, title, detail) =>
  page.evaluate(([title, detail]) => window.demo.caption(title, detail), [title, detail]);

const card = (page, title, lines = [], small = '') =>
  page.evaluate(
    ([title, lines, small]) => window.demo.card(title, lines, small),
    [title, lines, small],
  );

/** Type like a person: steady, with a short pause after punctuation. */
async function typeText(page, text) {
  for (const char of text) {
    await page.keyboard.type(char);
    await sleep(/[,.:]/.test(char) ? 160 : 38);
  }
}

// ---------------------------------------------------------------------------------------------

const icon = `data:image/svg+xml;base64,${(await readFile(resolve(ROOT, 'assets/icon.svg'))).toString('base64')}`;
const frames = await mkdtemp(join(tmpdir(), 'ainonim-video-'));
const { context, worker, extensionId } = await launch({
  viewport: { width: VIEWPORT.width * SCALE, height: VIEWPORT.height * SCALE },
  deviceScaleFactor: 1,
});

/** Zoom every tab to SCALE; zoom is kept per site, so this is repeated after each navigation. */
async function zoomTabs(page) {
  await worker.evaluate(async (scale) => {
    for (const tab of await globalThis.chrome.tabs.query({})) {
      await globalThis.chrome.tabs.setZoom(tab.id, scale).catch(() => {});
    }
  }, SCALE);
  await page.waitForFunction((width) => window.innerWidth === width, VIEWPORT.width);
}

try {
  const page = await context.newPage();
  await page.goto(chatUrl('6823f1c4-5b0e-8a2d-9e41-7c3a0d52b1f8'));
  await zoomTabs(page);
  await installOverlay(page, icon, mouse);
  await page.evaluate(() => window.demo.cursor(false));
  await card(page, 'AInonim', ['Chroni dane osobowe w czatach AI'], 'Rozszerzenie do Chrome');
  // Let the engine load behind the title card, so the recording has no waiting.
  const composer = page.getByRole('textbox', { name: 'Wiadomość' });
  await composer.click();
  await page.keyboard.type('Jan Kowalski');
  await page.waitForFunction(() => CSS.highlights?.get('ainonim-pii')?.size > 0, undefined, {
    timeout: 90_000,
  });
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  await page.evaluate(() => {
    document.activeElement?.blur();
  });
  await page.waitForTimeout(800);

  const recorder = new Recorder(page, frames);
  await recorder.start();
  await sleep(2600);
  await card(page, '');
  await page.evaluate(() => window.demo.cursor(true));
  await sleep(600);

  // 1. Typing a message with personal data.
  await caption(page, 'Piszesz wiadomość z danymi osobowymi');
  await clickAt(page, await centreOf(composer), 900);
  await sleep(300);
  await typeText(page, FIRST_MESSAGE);

  // 2. Detection, in the browser.
  await iconOf(page).waitFor({ state: 'visible' });
  await page.waitForFunction(() => CSS.highlights?.get('ainonim-pii')?.size > 0, undefined, {
    timeout: 30_000,
  });
  await caption(
    page,
    'AInonim od razu je wykrywa',
    'Lokalnie, w przeglądarce – tekst nigdzie nie wychodzi',
  );
  await moveTo(page, mouse.x + 40, mouse.y - 60, 500);
  await sleep(2200);

  // 3. The panel.
  await caption(page, 'W panelu widzisz, co znalazł', 'I wybierasz: znacznik albo opis ogólny');
  await clickAt(page, await centreOf(iconOf(page)), 900);
  await waitForPanelRows(page, 3);
  await sleep(2400);

  // 4. Masking.
  await caption(page, 'Jedno kliknięcie zamienia dane na znaczniki');
  await clickAt(page, await maskButtonPoint(page), 800);
  await page.waitForFunction(() => document.body.innerText.includes('<OSOBA_1>'));
  await sleep(700);
  await clickAt(page, await closeButtonPoint(page), 600);
  await sleep(1800);

  // 5. Sending; the model answers with tokens.
  await caption(
    page,
    'Wysyłasz – model dostaje tylko znaczniki',
    'A na Twoim ekranie AInonim pokazuje oryginały',
  );
  await clickAt(page, await centreOf(page.getByRole('button', { name: 'Wyślij' })), 700);
  await sleep(900);
  await moveTo(page, VIEWPORT.width * 0.86, VIEWPORT.height * 0.45, 700);
  await streamAnswer(page, FIRST_ANSWER, 85);

  // 6. Restored on screen.
  await waitForAnswerText(page, 'Kowalski');
  await caption(
    page,
    'A Ty widzisz prawdziwe dane',
    'Nawet w odmianie: <OSOBA_1:wołacz> → „Janie Kowalski”',
  );
  await sleep(1200);
  // The restored name is marked with a highlight, not an element, so its place comes from a range.
  const name = await page.evaluate(() => {
    const body = [...document.querySelectorAll('[data-response-body]')].at(-1);
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.data.indexOf('Janie Kowalski');
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + 'Janie Kowalski'.length);
      const rect = range.getBoundingClientRect();
      return { x: rect.left + rect.width * 0.6, y: rect.top + rect.height * 0.6 };
    }
    throw new Error('the restored name is not on the page');
  });
  await moveTo(page, name.x, name.y, 800);
  await sleep(500);
  await drawTooltip(page, 'OSOBA', 0, { x: name.x - 6, y: name.y + 20 });
  await sleep(3000);
  await removeTooltip(page);

  // 7. Automatic masking, switched on in the options.
  await caption(page, 'Możesz też maskować automatycznie');
  await sleep(1400);
  await page.goto(`chrome-extension://${extensionId}/options.html#general`);
  await page.locator('#panel-general').waitFor({ state: 'visible' });
  await zoomTabs(page);
  await installOverlay(page, icon, mouse);
  await recorder.restart();
  await caption(page, 'Ustawienia → Maskowanie → Automatycznie przy wysyłce');
  await sleep(900);
  await clickAt(
    page,
    await centreOf(
      page.locator('#panel-general .choice-label', { hasText: 'Automatycznie przy wysyłce' }),
    ),
    900,
  );
  await sleep(2200);

  // 8. Enter masks, then sends.
  await page.goto(chatUrl('9b27c0e1-3f4a-4d6e-8c1b-2a5f7e90d3c4'));
  await zoomTabs(page);
  await installOverlay(page, icon, mouse);
  await recorder.restart();
  await caption(page, 'Teraz wystarczy nacisnąć Enter');
  const second = page.getByRole('textbox', { name: 'Wiadomość' });
  await clickAt(page, await centreOf(second), 800);
  await sleep(300);
  await typeText(page, SECOND_MESSAGE);
  await page.waitForFunction(() => CSS.highlights?.get('ainonim-pii')?.size >= 3, undefined, {
    timeout: 30_000,
  });
  await sleep(900);
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-message-author-role="user"]', { timeout: 15_000 });
  await caption(page, 'Dane zamaskowane przy wysyłce – bez klikania');
  await sleep(900);
  await moveTo(page, VIEWPORT.width * 0.86, VIEWPORT.height * 0.45, 700);
  await streamAnswer(page, SECOND_ANSWER, 85);
  await waitForAnswerText(page, 'Nowak');
  await sleep(3000);

  // End card.
  await caption(page, '');
  await page.evaluate(() => window.demo.cursor(false));
  await card(
    page,
    'AInonim',
    ['Twoje dane zostają u Ciebie'],
    'ChatGPT · Claude · Gemini · Grok · Perplexity i inne czaty AI',
  );
  await sleep(3600);
  await recorder.stop();
  await mkdir(resolve(OUT, '..'), { recursive: true });
  await recorder.encode(OUT);
  console.log(OUT, `${String(recorder.frames.length)} frames`);
} finally {
  await context.close();
  await rm(frames, { recursive: true, force: true });
}
