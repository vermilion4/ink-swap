import { browser } from 'wxt/browser';
import type { Message } from '@/lib/messages';
import { getApiKey, getPrefs, setApiKey, setPrefs, type Language, type TabState } from '@/lib/settings';

const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;
const power = $<HTMLLabelElement>('#power');
const powerTitle = $<HTMLElement>('#power-title');
const powerSub = $<HTMLElement>('#power-sub');
const onToggle = $<HTMLInputElement>('#on');
const hint = $<HTMLParagraphElement>('#hint');
const languages = [...document.querySelectorAll<HTMLInputElement>('input[name="language"]')];
const opacity = $<HTMLInputElement>('#opacity');
const opacityValue = $<HTMLOutputElement>('#opacity-value');
const previewFill = $<HTMLElement>('#preview-fill');
const chime = $<HTMLInputElement>('#chime');
const toasts = $<HTMLInputElement>('#toasts');
const keyInput = $<HTMLInputElement>('#key');
const saveBtn = $<HTMLButtonElement>('#save');
const saved = $<HTMLParagraphElement>('#saved');
const savedCount = $<HTMLElement>('#saved-count');
const clearSaved = $<HTMLButtonElement>('#clear-saved');

function renderSavedCount(count: number) {
  savedCount.textContent =
    count === 0 ? 'None yet. Pages you translate come back free' : `${count} ${count === 1 ? 'page' : 'pages'} saved, free to reread`;
  clearSaved.disabled = count === 0;
}

const READER_SITES = ['https://mangadex.org/', 'https://shonenjumpplus.com/'];
let tabId: number | null = null;
let onReaderSite = false;
let hasKey = false;

/** The power bubble's words and whether it can be used, from the tab and the key. */
function renderPower() {
  const on = onToggle.checked;
  power.classList.toggle('is-on', on);
  onToggle.disabled = !hasKey || (!onReaderSite && !on);
  hint.hidden = hasKey;
  if (on) {
    powerTitle.textContent = 'Translating this tab';
    powerSub.textContent = 'Pages translate as you read';
  } else if (!onReaderSite) {
    powerTitle.textContent = 'Off for this tab';
    powerSub.textContent = 'Open a chapter on MangaDex or Shonen Jump+';
  } else {
    powerTitle.textContent = 'Off for this tab';
    powerSub.textContent = 'Switch on to translate this chapter';
  }
}

function renderOpacity(value: number) {
  opacityValue.value = `${Math.round(value * 100)}%`;
  // How much of the slider's track is filled with the gradient.
  opacity.style.setProperty('--fill', `${((value - 0.5) / 0.5) * 100}%`);
  previewFill.style.opacity = String(value);
}

async function init() {
  const [key, prefs, [tab]] = await Promise.all([
    getApiKey(),
    getPrefs(),
    browser.tabs.query({ active: true, currentWindow: true }),
  ]);
  hasKey = !!key;
  keyInput.value = key;
  tabId = tab?.id ?? null;
  onReaderSite = READER_SITES.some((site) => tab?.url?.startsWith(site));

  let state: TabState | null = null;
  if (tabId != null) {
    state = (await browser.runtime.sendMessage({ type: 'getTabStateFor', tabId } satisfies Message)) as TabState | null;
  }
  onToggle.checked = !!state?.on;
  // The tab's own language when it's on; otherwise the one new tabs will use.
  const language = state?.on ? state.language : prefs.language;
  for (const input of languages) input.checked = input.value === language;
  opacity.value = String(prefs.opacity);
  renderOpacity(prefs.opacity);
  renderSavedCount((await browser.runtime.sendMessage({ type: 'savedCount' } satisfies Message)) as number);
  chime.checked = prefs.chime;
  toasts.checked = prefs.toasts;
  renderPower();
}

onToggle.addEventListener('change', async () => {
  renderPower();
  power.classList.remove('pop');
  void power.offsetWidth; // restart the pop animation
  power.classList.add('pop');
  if (tabId == null) return;
  await browser.runtime.sendMessage({ type: 'setTabOn', tabId, on: onToggle.checked } satisfies Message);
});

for (const input of languages) {
  input.addEventListener('change', () => {
    if (!input.checked) return;
    void browser.runtime.sendMessage({ type: 'setLanguage', tabId, language: input.value as Language } satisfies Message);
  });
}

opacity.addEventListener('input', () => {
  const value = Number(opacity.value);
  renderOpacity(value);
  void setPrefs({ opacity: value }); // labels on the page follow live
});

chime.addEventListener('change', () => void setPrefs({ chime: chime.checked }));
toasts.addEventListener('change', () => void setPrefs({ toasts: toasts.checked }));

clearSaved.addEventListener('click', async () => {
  renderSavedCount((await browser.runtime.sendMessage({ type: 'clearSaved' } satisfies Message)) as number);
});

saveBtn.addEventListener('click', async () => {
  await setApiKey(keyInput.value);
  hasKey = !!keyInput.value.trim();
  renderPower();
  saved.hidden = false;
  setTimeout(() => (saved.hidden = true), 1800);
});

// Keep the toolbar icon matching the system's light/dark setting.
void browser.runtime.sendMessage({
  type: 'colorScheme',
  dark: matchMedia('(prefers-color-scheme: dark)').matches,
} satisfies Message);

void init();
