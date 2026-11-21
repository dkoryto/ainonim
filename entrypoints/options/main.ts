// The options page: one tab per area. Each tab's content is drawn by its own module in
// lib/ui/options/, which gets the empty panel and owns everything inside it.
import { mountAbout } from '~/lib/ui/options/about';
import { mountCategories } from '~/lib/ui/options/categories';
import { mountGeneral } from '~/lib/ui/options/general';
import { mountLog } from '~/lib/ui/options/log';
import { mountWords } from '~/lib/ui/options/words';
import { setupTabs } from './tabs';

const MOUNTS: Record<string, (panel: HTMLElement) => void | Promise<void>> = {
  general: mountGeneral,
  categories: mountCategories,
  words: mountWords,
  log: mountLog,
  about: mountAbout,
};

for (const [name, mount] of Object.entries(MOUNTS)) {
  const panel = document.getElementById(`panel-${name}`);
  if (panel) void mount(panel);
}
setupTabs(document, Object.keys(MOUNTS));
