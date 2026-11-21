// Tab "Dziennik": the log of maskings, metadata only. (Filled in by feat/auto-log.)
import { heading } from './dom';

export function mountLog(panel: HTMLElement): void {
  panel.replaceChildren(...heading(panel.ownerDocument, 'Dziennik maskowania'));
}
