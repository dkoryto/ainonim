// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { closestMatch, firstMatch, outermostMatches, queryAll } from '~/lib/sites/types';

// A selector a newer browser accepts may be invalid in an older one; it must not break a page.
const INVALID = 'div:has-unknown-pseudo(';

describe('selector helpers', () => {
  it('treat a selector the browser rejects as matching nothing', () => {
    document.body.innerHTML = '<div class="answer"><p>Jan Kowalski</p></div>';
    const paragraph = document.querySelector('p');
    if (!paragraph) throw new Error('no paragraph');

    expect(queryAll(document, INVALID)).toEqual([]);
    expect(closestMatch(paragraph, INVALID)).toBeNull();
    expect(firstMatch(document, [INVALID, '.answer'])?.className).toBe('answer');
    expect(outermostMatches(document, [INVALID, '.answer, .answer p'])).toHaveLength(1);
  });
});
