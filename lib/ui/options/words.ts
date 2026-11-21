// Tab "Własne słowa": the user's own words and patterns to mask. (Filled in by feat/categories-words.)
import { heading } from './dom';

export function mountWords(panel: HTMLElement): void {
  panel.replaceChildren(...heading(panel.ownerDocument, 'Własne słowa'));
}
