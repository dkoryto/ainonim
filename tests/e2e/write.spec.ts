import type { Page } from '@playwright/test';
import type * as Write from '~/lib/content/fields/write';
import { expect, injectLib, test } from './lib-page';

const ORIGINAL = ['Jan Kowalski, PESEL 50810112354', 'tel. 600 100 200'];
// A blank line in the middle: editors must keep it as an empty paragraph.
const MASKED = ['Klient <OSOBA_1>, PESEL <PESEL_1>', '', 'tel. <TELEFON_1>'];

async function open(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await injectLib(page, 'lib/content/fields/write.ts', 'ainonimWrite');
}

/** Type lines into the focused field, pressing Enter between them. */
async function typeLines(page: Page, selector: string, lines: string[]): Promise<void> {
  await page.click(selector);
  for (const [index, line] of lines.entries()) {
    if (index > 0) await page.keyboard.press('Enter');
    await page.keyboard.type(line);
  }
}

function replace(page: Page, selector: string, text: string): Promise<boolean> {
  return page.evaluate(
    ([selector, text]) => {
      const write = (window as unknown as { ainonimWrite: typeof Write }).ainonimWrite;
      const field = document.querySelector<HTMLElement>(selector);
      if (!field) throw new Error(`no field ${selector}`);
      return write.replaceFieldText(field, text);
    },
    [selector, text] as const,
  );
}

function editorBlocks(page: Page): Promise<string[] | undefined> {
  return page.evaluate(() => window.editorBlocks?.());
}

test.describe('plain fields', () => {
  test.beforeEach(async ({ page, fixtureServer }) => {
    await open(page, fixtureServer.url('plain.html'));
  });

  test('textarea: value, events and caret', async ({ page }) => {
    await typeLines(page, '#area', ORIGINAL);

    expect(await replace(page, '#area', MASKED.join('\n'))).toBe(true);

    await expect(page.locator('#area')).toHaveValue(MASKED.join('\n'));
    const state = await page.evaluate(() => {
      const area = document.querySelector('textarea');
      return {
        caret: [area?.selectionStart, area?.selectionEnd],
        length: area?.value.length,
        events: (window as unknown as { fieldEvents: Record<string, number> }).fieldEvents,
      };
    });
    expect(state.caret).toEqual([state.length, state.length]);
    // Typing fired one input event per key; the replacement adds one input and one change.
    expect(state.events['area:change']).toBe(1);
    await expect(page.locator('#other')).toHaveValue('untouched');
  });

  test('input: one line', async ({ page }) => {
    await typeLines(page, '#line', ORIGINAL.slice(0, 1));

    expect(await replace(page, '#line', MASKED[0] ?? '')).toBe(true);

    await expect(page.locator('#line')).toHaveValue(MASKED[0] ?? '');
  });

  test('input refuses a newline it cannot hold', async ({ page }) => {
    expect(await replace(page, '#line', 'a\nb')).toBe(false);
  });

  test('contenteditable: lines become blocks, undo restores the original', async ({ page }) => {
    await typeLines(page, '#editable', ORIGINAL);

    expect(await replace(page, '#editable', MASKED.join('\n'))).toBe(true);

    await expect(page.locator('#editable')).toHaveText(MASKED.join(''));
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.locator('#editable')).toHaveText(ORIGINAL.join(''));
    await expect(page.locator('#other')).toHaveValue('untouched');
  });
});

test.describe('React controlled fields', () => {
  test.beforeEach(async ({ page, fixtureServer }) => {
    await open(page, fixtureServer.url('react.html'));
  });

  for (const [field, lines] of [
    ['area', MASKED],
    ['line', MASKED.slice(0, 1)],
  ] as const) {
    test(`${field}: React state takes the masked text and keeps it`, async ({ page }) => {
      await typeLines(page, `#${field}`, field === 'area' ? ORIGINAL : ORIGINAL.slice(0, 1));
      await expect(page.locator(`#${field}-state`)).toHaveText(
        field === 'area' ? ORIGINAL.join('\n') : (ORIGINAL[0] ?? ''),
      );

      expect(await replace(page, `#${field}`, lines.join('\n'))).toBe(true);

      await expect(page.locator(`#${field}-state`)).toHaveText(lines.join('\n'));
      // The next keystroke re-renders from state: the masked text survives and the caret is at
      // its end.
      await page.keyboard.type('!');
      await expect(page.locator(`#${field}`)).toHaveValue(`${lines.join('\n')}!`);
      await expect(page.locator(`#${field}-state`)).toHaveText(`${lines.join('\n')}!`);
    });
  }
});

for (const [name, selector] of [
  ['prosemirror', '.ProseMirror'],
  ['lexical', '#editor'],
] as const) {
  test.describe(`${name} editor`, () => {
    test.beforeEach(async ({ page, fixtureServer }) => {
      await open(page, fixtureServer.url(`${name}.html`));
      await typeLines(page, selector, ORIGINAL);
      await expect.poll(() => editorBlocks(page)).toEqual(ORIGINAL);
      // Both editors merge edits made in quick succession into one undo step; wait so that the
      // replacement is a step of its own.
      await page.waitForTimeout(600);
    });

    test('multi-line text becomes paragraphs in the editor state', async ({ page }) => {
      expect(await replace(page, selector, MASKED.join('\n'))).toBe(true);

      expect(await editorBlocks(page)).toEqual(MASKED);
      // The caret is at the end: typing continues the last paragraph.
      await page.keyboard.type('!');
      await expect
        .poll(() => editorBlocks(page))
        .toEqual([...MASKED.slice(0, -1), 'tel. <TELEFON_1>!']);
    });

    test('one line replaces all paragraphs', async ({ page }) => {
      expect(await replace(page, selector, 'Klient <OSOBA_1>')).toBe(true);

      expect(await editorBlocks(page)).toEqual(['Klient <OSOBA_1>']);
    });

    test('one undo restores the original text', async ({ page }) => {
      expect(await replace(page, selector, MASKED.join('\n'))).toBe(true);

      await page.keyboard.press('ControlOrMeta+z');

      await expect.poll(() => editorBlocks(page)).toEqual(ORIGINAL);
    });
  });
}
