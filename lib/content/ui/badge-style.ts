// The badge's stylesheets. Kept apart from its code because they are long and only change with
// the look; the rules here are the whole styling, as the shadow roots shut out the page's CSS.

import { ICON_STYLE } from './icon';

export const PANEL_STYLE = `
:host { all: initial; }
.panel {
  box-sizing: border-box;
  width: 320px;
  max-width: calc(100vw - 16px);
  border-radius: 8px;
  border: 1px solid #c9ccd1;
  background: #ffffff;
  color: #1f2328;
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.18);
  font: 12px/1.4 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  pointer-events: auto;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-bottom: 1px solid #e3e5e8;
  font-weight: 600;
}
.count {
  min-width: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: #fde8e6;
  color: #912018;
  text-align: center;
}
.note { margin: 0; padding: 8px 10px; color: #59636e; }
.notice { margin: 0; padding: 6px 10px; border-bottom: 1px solid #e3e5e8; background: #eef4ff; }
.notice.blocked { background: #fff1e5; color: #7a2e0e; }
.notice[hidden] { display: none; }
.list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  max-height: 222px;
  overflow-y: auto;
}
.note[hidden], .list[hidden], button[hidden] { display: none; }
.item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: 8px;
  align-items: center;
  padding: 3px 10px;
}
.item:hover { background: rgb(0 0 0 / 0.04); }
.pick {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  column-gap: 8px;
  align-items: center;
  min-width: 0;
  cursor: pointer;
}
.pick input { margin: 0; cursor: pointer; accent-color: #b42318; }
.value { display: flex; flex-direction: column; min-width: 0; }
.original, .meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.meta { color: #59636e; font-size: 11px; }
.out { font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.mode { display: flex; }
.mode button {
  width: 54px;
  padding: 2px 0;
  border: 1px solid #c9ccd1;
  border-radius: 0;
  background: transparent;
  color: #59636e;
  font-size: 10px;
}
.mode button:first-child { border-radius: 5px 0 0 5px; }
.mode button:last-child { border-left: 0; border-radius: 0 5px 5px 0; }
.mode button[aria-pressed='true'] { background: #1d2b4f; border-color: #1d2b4f; color: #ffffff; }
.actions {
  display: flex;
  gap: 6px;
  padding: 8px;
  border-top: 1px solid #e3e5e8;
}
button {
  font: inherit;
  margin: 0;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
}
.mask { flex: 1; padding: 5px 10px; background: #b42318; color: #ffffff; font-weight: 600; }
.mask:hover { background: #912018; }
.mask:disabled { background: #d0d4d9; color: #59636e; cursor: default; }
.revert, .close { padding: 5px 0; background: transparent; color: inherit; }
.revert { width: 64px; border: 1px solid #c9ccd1; }
.close { width: 28px; }
.revert:hover, .close:hover { background: rgb(0 0 0 / 0.08); }
.revert:disabled { color: #8c959f; cursor: default; background: transparent; }
button:focus-visible, .pick input:focus-visible { outline: 2px solid #0969da; outline-offset: 1px; }
@media (prefers-color-scheme: dark) {
  .panel { background: #22272e; color: #e6edf3; border-color: #444c56; }
  .head, .actions { border-color: #373e47; }
  .count { background: #5d0f12; color: #ffb8b0; }
  .note, .meta { color: #9198a1; }
  .notice { background: #1c2c45; border-color: #373e47; }
  .notice.blocked { background: #3d2410; color: #ffc799; }
  .item:hover { background: rgb(255 255 255 / 0.06); }
  .pick input { accent-color: #f47067; }
  .mode button { border-color: #444c56; color: #9198a1; }
  .mode button[aria-pressed='true'] { background: #539bf5; border-color: #539bf5; color: #1c1c1c; }
  .mask { background: #f47067; color: #1c1c1c; }
  .mask:hover { background: #ff938a; }
  .mask:disabled { background: #373e47; color: #9198a1; }
  .revert { border-color: #444c56; }
  .revert:hover, .close:hover { background: rgb(255 255 255 / 0.12); }
  .revert:disabled { color: #636e7b; }
  button:focus-visible, .pick input:focus-visible { outline-color: #539bf5; }
}
`;

export const ICON_HOST_STYLE = `:host { all: initial; }${ICON_STYLE}`;
