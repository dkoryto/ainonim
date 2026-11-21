// Tab "Kategorie": which kinds of data AInonim looks for. (Filled in by feat/categories-words.)
import { heading } from './dom';

export function mountCategories(panel: HTMLElement): void {
  panel.replaceChildren(...heading(panel.ownerDocument, 'Kategorie'));
}
