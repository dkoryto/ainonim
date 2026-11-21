import { browser } from 'wxt/browser';
import { manageClient } from '~/lib/manage-client';
import { getSiteLevel, isSiteLevel, onSiteLevelChange, setSiteLevel } from '~/lib/settings';
import { conversationKeyOfUrl, createStoredMappingsView } from '~/lib/ui/stored-mappings';
import { describeTabUrl, unsupportedNote } from './tab-target';

function element<T extends HTMLElement>(id: string, type: new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof type)) throw new Error(`popup: missing #${id}`);
  return found;
}

function showLevel(fieldset: HTMLFieldSetElement, level: string): void {
  for (const input of fieldset.querySelectorAll<HTMLInputElement>('input[name="level"]')) {
    input.checked = input.value === level;
  }
}

async function init(): Promise<void> {
  const hostLine = element('host', HTMLParagraphElement);
  const fieldset = element('level', HTMLFieldSetElement);
  const note = element('note', HTMLParagraphElement);
  const stored = element('stored', HTMLElement);

  // The popup is opened by the user's click, so activeTab exposes this tab's URL without `tabs`.
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const target = describeTabUrl(tab?.url);

  void createStoredMappingsView(stored, manageClient, conversationKeyOfUrl(tab?.url)).reload();

  if (target.kind === 'unsupported') {
    note.textContent = unsupportedNote(target);
    note.hidden = false;
    return;
  }

  const { hostname } = target;
  hostLine.textContent = hostname;
  showLevel(fieldset, await getSiteLevel(hostname));
  fieldset.hidden = false;

  fieldset.addEventListener('change', (event) => {
    const value = (event.target as HTMLInputElement).value;
    if (!isSiteLevel(value)) return;
    setSiteLevel(hostname, value).catch((error: unknown) => {
      console.error('AInonim: saving the site level failed', error);
      void getSiteLevel(hostname).then((level) => {
        showLevel(fieldset, level);
      });
    });
  });

  onSiteLevelChange((change) => {
    if (change.hostname === hostname) showLevel(fieldset, change.level);
  });
}

void init();
