// The small AInonim button in the bottom-right corner of a field the user typed in. Its look tells
// the state of the analysis at a glance: pulsing while analysing, a red bubble with the number of
// values found, a green tick when nothing was found. Pressing it opens and closes the panel
// (lib/content/ui/badge.ts), which places and shows it.

/** Width and height of the icon, in CSS pixels. */
export const ICON_SIZE = 20;

export type IconState =
  | { kind: 'analysing' }
  | { kind: 'found'; count: number }
  | { kind: 'clear' }
  | { kind: 'failed' }
  | { kind: 'masked'; count: number };

export const ICON_STYLE = `
.icon {
  position: relative;
  box-sizing: border-box;
  display: block;
  width: ${String(ICON_SIZE)}px;
  height: ${String(ICON_SIZE)}px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  cursor: pointer;
  opacity: 0.88;
  pointer-events: auto;
  font: 700 9px/12px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}
.icon:hover, .icon[aria-expanded='true'] { opacity: 1; }
.icon:focus-visible { outline: 2px solid #0969da; outline-offset: 1px; }
.icon svg { display: block; width: 100%; height: 100%; }
.icon.analysing svg { animation: ainonim-pulse 1.1s ease-in-out infinite; }
@keyframes ainonim-pulse { 50% { opacity: 0.4; } }
@media (prefers-reduced-motion: reduce) {
  .icon.analysing svg { animation: none; opacity: 0.55; }
}
.bubble {
  position: absolute;
  top: -5px;
  right: -5px;
  box-sizing: border-box;
  min-width: 13px;
  height: 13px;
  padding: 0 3px;
  border-radius: 999px;
  border: 1px solid #ffffff;
  color: #ffffff;
  text-align: center;
  font: inherit;
  line-height: 11px;
}
.bubble[hidden] { display: none; }
.icon.found .bubble { background: #cf222e; }
.icon.clear .bubble { background: #1a7f37; }
.icon.failed .bubble { background: #6e7781; }
.icon.masked .bubble { background: #0969da; }
@media (prefers-color-scheme: dark) {
  .icon:focus-visible { outline-color: #539bf5; }
  .bubble { border-color: #22272e; }
}
`;

const SVG_NS = 'http://www.w3.org/2000/svg';

// The extension's icon (assets/icon.svg): a field whose middle line is covered by a mask bar.
const SHAPES: readonly Record<string, string>[] = [
  {
    x: '5',
    y: '5',
    width: '118',
    height: '118',
    rx: '27',
    fill: '#1d2b4f',
    stroke: '#4a5f96',
    'stroke-width': '4',
  },
  { x: '24', y: '28', width: '80', height: '16', rx: '8', fill: '#ffffff' },
  { x: '24', y: '56', width: '18', height: '16', rx: '8', fill: '#ffffff' },
  { x: '50', y: '54', width: '54', height: '20', rx: '6', fill: '#ff6b4a' },
  { x: '24', y: '84', width: '52', height: '16', rx: '8', fill: '#ffffff' },
];

/** Built node by node: pages that enforce Trusted Types refuse markup strings. */
function iconSvg(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 128 128');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const shape of SHAPES) {
    const rect = document.createElementNS(SVG_NS, 'rect');
    for (const [name, value] of Object.entries(shape)) rect.setAttribute(name, value);
    svg.append(rect);
  }
  return svg;
}

export interface FieldIcon {
  readonly button: HTMLButtonElement;
  /** Show `state`; a non-empty `note` is added to the button's name and title. */
  set(state: IconState, note?: string): void;
}

/** What the bubble says and how a screen reader names the button. */
function describe(state: IconState): { bubble: string | null; label: string } {
  switch (state.kind) {
    case 'analysing':
      return { bubble: null, label: 'AInonim: trwa analiza pola' };
    case 'found':
      return {
        bubble: state.count > 9 ? '9+' : String(state.count),
        label: `AInonim: znalezione dane osobowe (${String(state.count)})`,
      };
    case 'clear':
      return { bubble: '✓', label: 'AInonim: nie znaleziono danych osobowych' };
    case 'failed':
      return { bubble: '!', label: 'AInonim: analiza nie powiodła się' };
    case 'masked':
      return {
        bubble: state.count > 9 ? '9+' : String(state.count),
        label: `AInonim: zamaskowano automatycznie (${String(state.count)})`,
      };
  }
}

export function createIcon(): FieldIcon {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon';
  button.setAttribute('aria-expanded', 'false');
  const bubble = document.createElement('span');
  bubble.className = 'bubble';
  bubble.setAttribute('aria-hidden', 'true');
  button.append(iconSvg(), bubble);

  return {
    button,
    set(state, note) {
      const { bubble: text, label: name } = describe(state);
      const label = note ? `${name}. ${note}` : name;
      button.className = `icon ${state.kind}`;
      button.setAttribute('aria-label', label);
      button.title = label;
      bubble.hidden = text === null;
      bubble.textContent = text ?? '';
    },
  };
}
