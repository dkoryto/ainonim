// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mapText, rangeFor, readText } from '~/lib/content/fields/text';

function editor(html: string): HTMLElement {
  const root = document.createElement('div');
  root.contentEditable = 'true';
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

describe('readText', () => {
  it('reads the value of a textarea', () => {
    const area = document.createElement('textarea');
    area.value = 'Jan Kowalski\nPESEL 50810112354';
    expect(readText(area)).toBe('Jan Kowalski\nPESEL 50810112354');
  });

  it('joins paragraphs with a newline and keeps blank lines', () => {
    const root = editor(
      '<p>Jan Kowalski</p><p><br class="ProseMirror-trailingBreak"></p><p>PESEL 1</p>',
    );
    expect(readText(root)).toBe('Jan Kowalski\n\nPESEL 1');
  });

  it('keeps inline formatting inside one line', () => {
    const root = editor('<p>Pan <strong>Jan</strong> Kowalski</p>');
    expect(readText(root)).toBe('Pan Jan Kowalski');
  });
});

describe('rangeFor', () => {
  it('covers a span across inline elements', () => {
    const root = editor('<p>Pan <strong>Jan</strong> Kowalski, tel.</p>');
    const map = mapText(root);
    const start = map.text.indexOf('Jan');
    const range = rangeFor(map, start, start + 'Jan Kowalski'.length);
    expect(range?.toString()).toBe('Jan Kowalski');
  });

  it('covers a span in a later paragraph', () => {
    const root = editor('<p>Dzień dobry</p><p>PESEL 50810112354</p>');
    const map = mapText(root);
    const start = map.text.indexOf('5081');
    expect(rangeFor(map, start, start + 11)?.toString()).toBe('50810112354');
  });

  it('counts UTF-16 units like polanon spans do', () => {
    const root = editor('<p>😀 Jan Kowalski</p>');
    const map = mapText(root);
    expect(rangeFor(map, 3, 15)?.toString()).toBe('Jan Kowalski');
  });

  it('returns null outside the text', () => {
    const map = mapText(editor('<p>abc</p>'));
    expect(rangeFor(map, 2, 10)).toBeNull();
  });
});
