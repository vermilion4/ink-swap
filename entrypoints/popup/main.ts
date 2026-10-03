import { browser } from 'wxt/browser';
import type { Message } from '@/lib/messages';
import { getApiKey, setApiKey, type TabState } from '@/lib/settings';

const onToggle = document.querySelector<HTMLInputElement>('#on')!;
const hint = document.querySelector<HTMLParagraphElement>('#hint')!;
const keyInput = document.querySelector<HTMLInputElement>('#key')!;
const saveBtn = document.querySelector<HTMLButtonElement>('#save')!;
const saved = document.querySelector<HTMLParagraphElement>('#saved')!;

async function currentTabId() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

function reflectKey(key: string) {
  onToggle.disabled = !key;
  hint.hidden = !!key;
}

async function init() {
  const key = await getApiKey();
  keyInput.value = key;
  reflectKey(key);

  const tabId = await currentTabId();
  if (tabId != null) {
    const state = (await browser.runtime.sendMessage({ type: 'getTabStateFor', tabId } satisfies Message)) as TabState | null;
    onToggle.checked = !!state?.on;
  }
}

onToggle.addEventListener('change', async () => {
  const tabId = await currentTabId();
  if (tabId == null) return;
  await browser.runtime.sendMessage({ type: 'setTabOn', tabId, on: onToggle.checked } satisfies Message);
});

saveBtn.addEventListener('click', async () => {
  await setApiKey(keyInput.value);
  reflectKey(keyInput.value.trim());
  saved.hidden = false;
  setTimeout(() => (saved.hidden = true), 1800);
});

void init();
