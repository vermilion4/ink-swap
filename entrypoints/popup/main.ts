import { browser } from 'wxt/browser';
import type { Message } from '@/lib/messages';
import { getOwnApiKey, getPrefs, hasSharedKey, setApiKey, setPrefs, type Language, type TabState } from '@/lib/settings';

const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;
const power = $<HTMLLabelElement>('#power');
const powerTitle = $<HTMLElement>('#power-title');
const powerSub = $<HTMLElement>('#power-sub');
const onToggle = $<HTMLInputElement>('#on');
const languages = [...document.querySelectorAll<HTMLInputElement>('input[name="language"]')];
const opacity = $<HTMLInputElement>('#opacity');
const opacityValue = $<HTMLOutputElement>('#opacity-value');
const previewFill = $<HTMLElement>('#preview-fill');
const chime = $<HTMLInputElement>('#chime');
const toasts = $<HTMLInputElement>('#toasts');
const savedCount = $<HTMLElement>('#saved-count');
const keyChip = $<HTMLElement>('#key-chip');
const keyChipLabel = $<HTMLElement>('#key-chip-label');
const keyEdit = $<HTMLButtonElement>('#key-edit');
const keyPanel = $<HTMLElement>('#key-panel');
const keyTitle = $<HTMLElement>('#key-title');
const keyCancel = $<HTMLButtonElement>('#key-cancel');
const keyForm = $<HTMLFormElement>('#key-form');
const keyInput = $<HTMLInputElement>('#key');
const keyNote = $<HTMLParagraphElement>('#key-note');
const clearSaved = $<HTMLButtonElement>('#clear-saved');

function renderSavedCount(count: number) {
  savedCount.textContent =
    count === 0 ? 'None yet. Pages you translate come back free' : `${count} ${count === 1 ? 'page' : 'pages'} saved, free to reread`;
  clearSaved.disabled = count === 0;
}

const READER_SITES = ['https://mangadex.org/', 'https://shonenjumpplus.com/'];
let tabId: number | null = null;
let onReaderSite = false;
/** The key the user saved ('' if none). A shared key built into this copy never shows here. */
let ownKey = '';
const hasKey = () => !!ownKey || hasSharedKey;

/** The power bubble's words and whether it can be used, from the tab and the key. */
function renderPower() {
  const on = onToggle.checked;
  power.classList.toggle('is-on', on);
  onToggle.disabled = !hasKey() || (!onReaderSite && !on);
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

/**
 * With no key at all, the popup is just the welcome: the key field and how to get a key. With a
 * key, it's the full popup with a small key chip in the header; Edit opens the key panel under it.
 */
function renderKey(editing = false) {
  const ready = hasKey();
  document.body.classList.toggle('needs-key', !ready);
  keyChip.hidden = !ready;
  keyChipLabel.textContent = ownKey ? 'Key' : 'Demo key';
  keyPanel.hidden = ready && !editing;
  keyPanel.dataset.mode = ready ? 'edit' : 'welcome';
  keyTitle.textContent = ready ? 'Your Claude key' : 'First, your Claude key';
  keyInput.value = ownKey;
  keyNote.replaceChildren(...keyNoteParts());
  renderPower();
}

function keyNoteParts(): (string | Node)[] {
  if (!hasKey()) {
    const cost = document.createElement('span');
    cost.style.whiteSpace = 'nowrap';
    cost.textContent = 'About 1–3¢ a page';
    return ['Stored only in this browser. ', cost, '; rereading saved pages is free.'];
  }
  if (!ownKey) return ['This copy comes with a key. Paste your own to use it instead.'];
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'key-remove';
  remove.textContent = 'Remove key';
  remove.addEventListener('click', async () => {
    await setApiKey('');
    ownKey = '';
    renderKey();
    if (!hasKey()) keyInput.focus();
  });
  return ['Saving replaces the old key. ', remove];
}

function openKeyEditor() {
  renderKey(true);
  keyInput.focus();
  keyInput.select();
}

function renderOpacity(value: number) {
  opacityValue.value = `${Math.round(value * 100)}%`;
  // How much of the slider's track is filled with the gradient.
  opacity.style.setProperty('--fill', `${((value - 0.5) / 0.5) * 100}%`);
  previewFill.style.opacity = String(value);
}

async function init() {
  const [key, prefs, [tab]] = await Promise.all([
    getOwnApiKey(),
    getPrefs(),
    browser.tabs.query({ active: true, currentWindow: true }),
  ]);
  ownKey = key;
  renderKey();
  if (!hasKey()) keyInput.focus();
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

keyForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const value = keyInput.value.trim();
  if (!value) {
    // Nothing to save: a little shake, and the cursor back in the field.
    keyPanel.classList.remove('shake');
    void keyPanel.offsetWidth;
    keyPanel.classList.add('shake');
    keyInput.focus();
    return;
  }
  await setApiKey(value);
  ownKey = value;
  renderKey();
  // Confirm on the chip, where the key now lives.
  keyChipLabel.textContent = 'Saved ✓';
  keyChip.classList.remove('pop');
  void keyChip.offsetWidth;
  keyChip.classList.add('pop');
  setTimeout(() => (keyChipLabel.textContent = ownKey ? 'Key' : 'Demo key'), 1800);
});

keyEdit.addEventListener('click', openKeyEditor);
keyCancel.addEventListener('click', () => renderKey());
keyPanel.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && hasKey()) {
    e.preventDefault();
    renderKey();
  }
});

// Keep the toolbar icon matching the system's light/dark setting.
void browser.runtime.sendMessage({
  type: 'colorScheme',
  dark: matchMedia('(prefers-color-scheme: dark)').matches,
} satisfies Message);

void init();
