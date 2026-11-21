// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSpans, HIGHLIGHT_NAME, paintSpans } from '~/lib/content/ui/highlight';

// happy-dom has neither `Highlight` nor `CSS.highlights` (and returns a new `CSS` object on every
// read); a Highlight is a set of ranges and the registry a map from name to Highlight, which is all
// the module relies on.
class FakeHighlight extends Set<AbstractRange> {}

function installApi(): Map<string, FakeHighlight> {
  const registry = new Map<string, FakeHighlight>();
  vi.stubGlobal('Highlight', FakeHighlight);
  vi.stubGlobal('CSS', { highlights: registry });
  return registry;
}

function removeApi(): void {
  vi.unstubAllGlobals();
}

function editor(html: string): HTMLElement {
  const root = document.createElement('div');
  root.contentEditable = 'true';
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

function spanOf(field: HTMLElement, value: string, entity_type = 'OSOBA') {
  const start = textIndex(field, value);
  return { start, end: start + value.length, entity_type };
}

// Offsets in the text model: paragraphs are joined with "\n", which textContent omits.
function textIndex(field: HTMLElement, value: string): number {
  const text = [...field.children].map((child) => child.textContent).join('\n');
  return text.indexOf(value);
}

function painted(registry: Map<string, FakeHighlight>): string[] {
  return [...(registry.get(HIGHLIGHT_NAME) ?? [])].map((range) => (range as Range).toString());
}

let registry: Map<string, FakeHighlight>;

beforeEach(() => {
  registry = installApi();
});

afterEach(() => {
  removeApi();
  document.body.replaceChildren();
});

describe('paintSpans', () => {
  it('covers exactly the span text across inline formatting and paragraphs', () => {
    const field = editor(
      '<p>Pan <strong>Jan</strong> <em>Kowal</em>ski</p><p>PESEL 50810112354</p>',
    );
    const ok = paintSpans(field, [
      spanOf(field, 'Jan Kowalski'),
      spanOf(field, '50810112354', 'PESEL'),
    ]);
    expect(ok).toBe(true);
    expect(painted(registry)).toEqual(['Jan Kowalski', '50810112354']);
  });

  it('replaces the ranges of an earlier paint of the same field', () => {
    const field = editor('<p>Jan Kowalski, tel. 600 100 200</p>');
    paintSpans(field, [spanOf(field, 'Jan Kowalski')]);
    paintSpans(field, [spanOf(field, '600 100 200', 'TELEFON')]);
    expect(painted(registry)).toEqual(['600 100 200']);
  });

  it('keeps the ranges of other fields', () => {
    const first = editor('<p>Jan Kowalski</p>');
    const second = editor('<p>Anna Nowak</p>');
    paintSpans(first, [spanOf(first, 'Jan Kowalski')]);
    paintSpans(second, [spanOf(second, 'Anna Nowak')]);
    paintSpans(first, [spanOf(first, 'Kowalski')]);
    expect(painted(registry).sort()).toEqual(['Anna Nowak', 'Kowalski']);
  });

  it('skips spans that do not map onto text nodes', () => {
    // Text "Jan\n\nX": offset 4 lies between the two newlines of the empty paragraph.
    const field = editor('<p>Jan</p><p><br></p><p>X</p>');
    expect(paintSpans(field, [{ start: 4, end: 5, entity_type: 'X' }])).toBe(true);
    expect(painted(registry)).toEqual([]);
  });

  it('skips empty and reversed spans', () => {
    const field = editor('<p>Jan Kowalski</p>');
    const jan = spanOf(field, 'Jan');

    expect(
      paintSpans(field, [
        { ...jan, end: jan.start },
        { ...jan, start: jan.end, end: jan.start },
        jan,
      ]),
    ).toBe(true);
    expect(painted(registry)).toEqual(['Jan']);
  });

  it('does not change the DOM', () => {
    const field = editor('<p>Pan <strong>Jan</strong> Kowalski</p><p><br></p><p>PESEL 1</p>');
    const before = document.body.innerHTML;
    paintSpans(field, [spanOf(field, 'Jan Kowalski')]);
    clearSpans(field);
    expect(document.body.innerHTML).toBe(before);
    expect(document.head.querySelector('style')).toBeNull();
  });

  it('adopts one stylesheet styling the highlight', async () => {
    // happy-dom drops ::highlight() rules when parsing, so read the CSS the module hands over.
    vi.resetModules();
    const replaceSync = vi.spyOn(CSSStyleSheet.prototype, 'replaceSync');
    const fresh = await import('~/lib/content/ui/highlight');
    const adopted = document.adoptedStyleSheets.length;
    const field = editor('<p>Jan Kowalski</p>');
    fresh.paintSpans(field, [spanOf(field, 'Jan')]);
    fresh.paintSpans(field, [spanOf(field, 'Kowalski')]);
    expect(document.adoptedStyleSheets).toHaveLength(adopted + 1);
    expect(replaceSync).toHaveBeenCalledOnce();
    expect(replaceSync.mock.calls[0]?.[0]).toContain(`::highlight(${HIGHLIGHT_NAME})`);
    replaceSync.mockRestore();
  });

  it('returns false for input and textarea', () => {
    const input = document.createElement('input');
    input.value = 'Jan Kowalski';
    const area = document.createElement('textarea');
    area.value = 'Jan Kowalski';
    const span = { start: 0, end: 3, entity_type: 'OSOBA' };
    expect(paintSpans(input, [span])).toBe(false);
    expect(paintSpans(area, [span])).toBe(false);
    expect(painted(registry)).toEqual([]);
  });

  it('returns false without the Custom Highlight API', () => {
    removeApi();
    const field = editor('<p>Jan Kowalski</p>');
    expect(paintSpans(field, [spanOf(field, 'Jan')])).toBe(false);
    expect(() => {
      clearSpans(field);
    }).not.toThrow();
  });
});

describe('clearSpans', () => {
  it('removes only the ranges of the given field', () => {
    const first = editor('<p>Jan Kowalski</p>');
    const second = editor('<p>Anna Nowak</p>');
    paintSpans(first, [spanOf(first, 'Jan Kowalski')]);
    paintSpans(second, [spanOf(second, 'Anna Nowak')]);
    clearSpans(first);
    expect(painted(registry)).toEqual(['Anna Nowak']);
  });
});
