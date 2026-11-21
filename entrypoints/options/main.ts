// The options page: one tab per area. Each tab's content is drawn by its own module in
// lib/pages/options/, which gets the empty panel and owns everything inside it.
import { mountAbout } from '~/lib/pages/options/about';
import { mountCategories } from '~/lib/pages/options/categories';
import { mountGeneral } from '~/lib/pages/options/general';
import { mountLog } from '~/lib/pages/options/log';
import { mountSites } from '~/lib/pages/options/sites';
import { mountWords } from '~/lib/pages/options/words';
import { setupTabs } from '~/lib/pages/options/tabs';

const MOUNTS: Record<string, (panel: HTMLElement) => void | Promise<void>> = {
  general: mountGeneral,
  sites: mountSites,
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
