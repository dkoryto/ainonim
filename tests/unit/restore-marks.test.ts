// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RESTORED_HIGHLIGHT,
  createRestoredMarks,
  restoredTitle,
} from '~/lib/content/restore/marks';

// happy-dom lacks the Custom Highlight API; a Highlight is a set of ranges, the registry a map.
class FakeHighlight extends Set<AbstractRange> {}

function installApi(): Map<string, FakeHighlight> {
  const registry = new Map<string, FakeHighlight>();
  vi.stubGlobal('Highlight', FakeHighlight);
  vi.stubGlobal('CSS', { highlights: registry });
  return registry;
}

function textNode(text: string): Text {
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  document.body.append(paragraph);
  return paragraph.firstChild as Text;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('restoredTitle', () => {
  it('names the token behind each value of a sent message', () => {
    expect(
      restoredTitle('sent', [
        { token: '<OSOBA_1>', value: 'Jan Kowalski' },
        { token: '<PESEL_1>', value: '50810112354' },
      ]),
    ).toBe('AInonim\nJan Kowalski – wysłano jako <OSOBA_1>\n50810112354 – wysłano jako <PESEL_1>');
  });

  it('lists a token repeated in the same element once', () => {
    const value = { token: '<OSOBA_1:wołacz>', value: 'Janie Kowalski' };
    expect(restoredTitle('answer', [value, value])).toBe(
      'AInonim\nJanie Kowalski – model napisał <OSOBA_1:wołacz>',
    );
  });

  it('names the original behind each token when the tokens stay on screen', () => {
    expect(restoredTitle('answer', [{ token: '<OSOBA_1>', value: 'Jan Kowalski' }], true)).toBe(
      'AInonim\n<OSOBA_1> = Jan Kowalski',
    );
  });
});

describe('createRestoredMarks', () => {
  it('marks the given offsets of a node and replaces them on the next set', () => {
    const registry = installApi();
    const marks = createRestoredMarks();
    const node = textNode('Do Jan Kowalski, PESEL 50810112354.');
    const painted = () =>
      [...(registry.get(RESTORED_HIGHLIGHT) ?? [])].map((range) => (range as Range).toString());

    marks.set(node, [{ start: 3, end: 15 }]);
    expect(painted()).toEqual(['Jan Kowalski']);
    marks.set(node, [{ start: 23, end: 34 }]);
    expect(painted()).toEqual(['50810112354']);
    marks.delete(node);
    expect(painted()).toEqual([]);
  });

  it('adopts one stylesheet styling the highlight', async () => {
    // happy-dom drops ::highlight() rules when parsing, so read the CSS the module hands over.
    installApi();
    vi.resetModules();
    const replaceSync = vi.spyOn(CSSStyleSheet.prototype, 'replaceSync');
    const fresh = await import('~/lib/content/restore/marks');
    const adopted = document.adoptedStyleSheets.length;
    const marks = fresh.createRestoredMarks();
    marks.set(textNode('Jan'), [{ start: 0, end: 3 }]);
    marks.set(textNode('Ewa'), [{ start: 0, end: 3 }]);
    expect(document.adoptedStyleSheets).toHaveLength(adopted + 1);
    expect(replaceSync).toHaveBeenCalledOnce();
    expect(replaceSync.mock.calls[0]?.[0]).toContain(`::highlight(${RESTORED_HIGHLIGHT})`);
    replaceSync.mockRestore();
  });

  it('unregisters its own highlight on clear, never a foreign one', () => {
    const registry = installApi();
    const marks = createRestoredMarks();
    marks.set(textNode('Jan'), [{ start: 0, end: 3 }]);
    marks.clear();
    expect(registry.has(RESTORED_HIGHLIGHT)).toBe(false);

    const foreign = new FakeHighlight();
    registry.set(RESTORED_HIGHLIGHT, foreign);
    marks.clear();
    expect(registry.get(RESTORED_HIGHLIGHT)).toBe(foreign);
  });

  it('does nothing without the Highlight API', () => {
    const marks = createRestoredMarks();
    const node = textNode('Jan');
    expect(() => {
      marks.set(node, [{ start: 0, end: 3 }]);
      marks.delete(node);
      marks.clear();
    }).not.toThrow();
  });
});
