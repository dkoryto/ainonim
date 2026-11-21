import { browser } from 'wxt/browser';
import { manageClient } from '~/lib/manage-client';
import {
  getChatDisplay,
  getMaskingMode,
  getSiteLevel,
  isChatDisplay,
  isMaskingMode,
  isSiteLevel,
  onChatDisplayChange,
  onMaskingModeChange,
  onSiteLevelChange,
  setChatDisplay,
  setMaskingMode,
  setSiteLevel,
} from '~/lib/settings';
import { conversationKeyOfUrl, createStoredMappingsView } from '~/lib/ui/stored-mappings';
import { describeTabUrl, unsupportedNote } from './tab-target';

function element<T extends HTMLElement>(id: string, type: new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof type)) throw new Error(`popup: missing #${id}`);
  return found;
}

function check(fieldset: HTMLFieldSetElement, name: string, value: string): void {
  for (const input of fieldset.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)) {
    input.checked = input.value === value;
  }
}

function showLevel(fieldset: HTMLFieldSetElement, level: string): void {
  check(fieldset, 'level', level);
}

/** The chat display switch: one setting for every chat site, so it is shown on any tab. */
async function initDisplay(fieldset: HTMLFieldSetElement): Promise<void> {
  check(fieldset, 'display', await getChatDisplay());
  fieldset.addEventListener('change', (event) => {
    const value = (event.target as HTMLInputElement).value;
    if (!isChatDisplay(value)) return;
    setChatDisplay(value).catch((error: unknown) => {
      console.error('AInonim: saving the chat display failed', error);
      void getChatDisplay().then((display) => {
        check(fieldset, 'display', display);
      });
    });
  });
  onChatDisplayChange((display) => {
    check(fieldset, 'display', display);
  });
}

/** Manual or automatic masking: one setting for every site, like the chat display. */
async function initMaskingMode(fieldset: HTMLFieldSetElement): Promise<void> {
  check(fieldset, 'mask-mode', await getMaskingMode());
  fieldset.addEventListener('change', (event) => {
    const value = (event.target as HTMLInputElement).value;
    if (!isMaskingMode(value)) return;
    setMaskingMode(value).catch((error: unknown) => {
      console.error('AInonim: saving the masking mode failed', error);
      void getMaskingMode().then((mode) => {
        check(fieldset, 'mask-mode', mode);
      });
    });
  });
  onMaskingModeChange((mode) => {
    check(fieldset, 'mask-mode', mode);
  });
}

async function init(): Promise<void> {
  const hostLine = element('host', HTMLParagraphElement);
  const fieldset = element('level', HTMLFieldSetElement);
  const note = element('note', HTMLParagraphElement);
  const stored = element('stored', HTMLElement);
  void initMaskingMode(element('mask-mode', HTMLFieldSetElement));
  void initDisplay(element('display', HTMLFieldSetElement));
  element('settings', HTMLAnchorElement).addEventListener('click', (event) => {
    event.preventDefault();
    void browser.runtime.openOptionsPage();
  });

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
