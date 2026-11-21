// Driving AInonim's icon and panel (lib/content/ui/badge.ts) from Playwright. Both live in closed
// shadow roots, so their controls are clicked by position. The panel's layout: a header (~29 px),
// one row per value (or one line of text when there is none), then the actions bar: 8 px padding
// around "Zamaskuj zaznaczone" (filling the left), "Cofnij" (64 px, when offered) and "×" (28 px),
// 6 px apart. Each row ends, 10 px from the panel's right edge, with "znacznik | ogólnie", two 54
// px buttons.
import { type Locator, type Page, expect } from '@playwright/test';

const HEADER_HEIGHT = 29;
const ACTIONS_HEIGHT = 44;
/** A row is two lines of text (~38 px); the "no values" line is about 33 px. */
const MIN_ROW_HEIGHT = 30;
const BORDER = 1;
const PADDING = 8;
const CLOSE_WIDTH = 28;
const REVERT_WIDTH = 64;
const GAP = 6;
const ROW_PADDING = 10;
const MODE_WIDTH = 54;

/** The panel's host element. Panels of fields masked earlier may stay in the DOM, hidden. */
export function panel(page: Page): Locator {
  return page.locator('ainonim-badge').filter({ visible: true });
}

/** The icon's host element in the field's corner. */
export function icon(page: Page): Locator {
  return page.locator('ainonim-icon').filter({ visible: true });
}

async function box(
  locator: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const found = await locator.boundingBox();
  if (!found) throw new Error('not rendered');
  return found;
}

/** The icon inside `field`; fields typed in earlier keep theirs. */
export async function iconOf(page: Page, field: Locator, timeout = 30_000): Promise<Locator> {
  const fieldBox = await box(field);
  const inside = async (candidate: Locator): Promise<boolean> => {
    const { x, y } = await box(candidate);
    return (
      x >= fieldBox.x &&
      y >= fieldBox.y &&
      x <= fieldBox.x + fieldBox.width &&
      y <= fieldBox.y + fieldBox.height
    );
  };
  let found: Locator | undefined;
  await expect
    .poll(
      async () => {
        for (const candidate of await icon(page).all()) {
          if (await inside(candidate)) found = candidate;
        }
        return found !== undefined;
      },
      { timeout },
    )
    .toBe(true);
  if (!found) throw new Error('no icon in the field');
  return found;
}

/**
 * Wait for the icon in `field`, open the panel with it and wait until the analysis listed `rows`
 * values. A cold Pyodide start takes a while, hence the long timeout.
 */
export async function openPanel(
  page: Page,
  field: Locator,
  rows: number,
  timeout = 30_000,
): Promise<void> {
  const fieldIcon = await iconOf(page, field, timeout);
  await expect(panel(page)).toHaveCount(0);
  await fieldIcon.click();
  await expect(panel(page)).toBeVisible();
  await expect
    .poll(async () => (await box(panel(page))).height, { timeout })
    .toBeGreaterThanOrEqual(HEADER_HEIGHT + ACTIONS_HEIGHT + rows * MIN_ROW_HEIGHT);
}

/** Click "Zamaskuj zaznaczone". */
export async function clickMask(page: Page): Promise<void> {
  const { x, y, height } = await box(panel(page));
  await page.mouse.click(x + 40, y + height - ACTIONS_HEIGHT / 2);
}

/** Click "Cofnij", offered after a masking. */
export async function clickRevert(page: Page): Promise<void> {
  const { x, y, width, height } = await box(panel(page));
  const right = x + width - BORDER - PADDING - CLOSE_WIDTH - GAP;
  await page.mouse.click(right - REVERT_WIDTH / 2, y + height - ACTIONS_HEIGHT / 2);
}

function rowCenter(panelBox: { y: number; height: number }, index: number, rows: number): number {
  const rowHeight = (panelBox.height - HEADER_HEIGHT - ACTIONS_HEIGHT) / rows;
  return panelBox.y + HEADER_HEIGHT + rowHeight * (index + 0.5);
}

/** Click the value of row `index` of `rows` (its label toggles the checkbox). */
export async function clickRow(page: Page, index: number, rows: number): Promise<void> {
  const panelBox = await box(panel(page));
  await page.mouse.click(panelBox.x + 60, rowCenter(panelBox, index, rows));
}

/** Set row `index` of `rows` to "ogólnie". */
export async function clickGeneral(page: Page, index: number, rows: number): Promise<void> {
  const panelBox = await box(panel(page));
  const x = panelBox.x + panelBox.width - BORDER - ROW_PADDING - MODE_WIDTH / 2;
  await page.mouse.click(x, rowCenter(panelBox, index, rows));
}
