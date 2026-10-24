// InkSwap landing page: the page "translates itself" the way InkSwap does. Section headings start
// in Japanese and are re-lettered in English as they scroll into view; the header's switch turns
// that off and on. Plus the scroll-driven walkthrough, the language picker and the demo video.

const STORE_URL = 'https://chromewebstore.google.com/detail/inkswap/pineaamjmibhbanmmobglijopnhepppb';
const YOUTUBE_ID = 'qlhnsUQ9Y28';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- links ----------

for (const a of document.querySelectorAll('[data-store]')) a.href = STORE_URL;
for (const a of document.querySelectorAll('[data-youtube]')) a.href = `https://youtu.be/${YOUTUBE_ID}`;

// Links that leave the site open in a new tab. That also keeps them working when this page is
// shown inside another site's frame (the Chrome Web Store, YouTube and GitHub refuse to be framed).
for (const a of document.querySelectorAll('a[href^="http"]')) {
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
}

// ---------- the toast, as InkSwap shows it ----------

const toasts = document.querySelector('.toasts');
function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = '<span class="badge" aria-hidden="true">✓</span>';
  el.append(text);
  toasts.append(el);
  setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 300);
  }, 2600);
}

// InkSwap's own chime: two soft rising notes (C6, then G6). Played only after a click.
function chime() {
  const ctx = new AudioContext();
  for (const [freq, at] of [[1046.5, 0], [1568, 0.11]]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const start = ctx.currentTime + at;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.12, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.5);
  }
  setTimeout(() => void ctx.close(), 800);
}

// ---------- the swap ----------

const swaps = [...document.querySelectorAll('.swap')];
for (const el of swaps) {
  const english = el.textContent.trim();
  const ja = document.createElement('span');
  ja.className = 'ja';
  ja.lang = 'ja';
  ja.setAttribute('aria-hidden', 'true'); // screen readers get the English heading only
  ja.textContent = el.dataset.ja;
  const en = document.createElement('span');
  en.className = 'en';
  en.textContent = english;
  el.replaceChildren(ja, en);
  el.dataset.state = reduceMotion ? 'done' : 'raw';
}

let translating = true;
let celebrated = false; // "Page translated" once per switch-on, like the extension
let withChime = false;
const inView = new Set();
const timers = new Map();

function translate(el) {
  if (el.dataset.state !== 'raw') return;
  if (reduceMotion) {
    el.dataset.state = 'done';
    return;
  }
  el.dataset.state = 'busy';
  timers.set(
    el,
    setTimeout(() => {
      timers.delete(el);
      if (!translating) return;
      el.dataset.state = 'done';
      if (!celebrated) {
        celebrated = true;
        toast('Page translated');
        if (withChime) chime();
      }
    }, 300 + Math.random() * 150),
  );
}

const watcher = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) inView.add(e.target);
      else inView.delete(e.target);
      if (e.isIntersecting && translating) translate(e.target);
    }
  },
  { threshold: 0.9, rootMargin: '-70px 0px -8% 0px' },
);
// Let the hero headline sit in Japanese for a beat before it's translated.
setTimeout(() => swaps.forEach((el) => watcher.observe(el)), reduceMotion ? 0 : 150);

const power = document.getElementById('power');
const powerTitle = document.getElementById('power-title');
power.addEventListener('change', () => {
  translating = power.checked;
  powerTitle.textContent = translating ? 'Translating this page' : 'Off for this page';
  if (translating) {
    celebrated = false;
    withChime = true;
    for (const el of inView) translate(el);
  } else {
    for (const [el, t] of timers) clearTimeout(t), timers.delete(el);
    for (const el of swaps) el.dataset.state = 'raw';
  }
});

// ---------- how a page gets swapped: the step in the middle of the screen drives the page ----------

const figure = document.querySelector('.how-figure');
const steps = [...document.querySelectorAll('.step')];
function setStep(n) {
  figure.dataset.step = n;
  for (const s of steps) s.classList.toggle('is-active', s.dataset.step === String(n));
}
setStep(1);
const stepWatcher = new IntersectionObserver(
  (entries) => {
    for (const e of entries) if (e.isIntersecting) setStep(e.target.dataset.step);
  },
  // On phones the page sticks to the top half, so a step counts once it reaches the lower part.
  { rootMargin: matchMedia('(max-width: 900px)').matches ? '-72% 0px -16% 0px' : '-45% 0px -45% 0px' },
);
steps.forEach((s) => stepWatcher.observe(s));

// ---------- languages: the page is translated again, with the overlay's glow and spinner ----------

const LANG_ALT = {
  en: 'A manga page with its bubbles in English.',
  es: 'The same manga page with its bubbles in Spanish.',
  fr: 'The same manga page with its bubbles in French.',
};
for (const l of Object.keys(LANG_ALT)) new Image().src = `assets/lang-${l}.jpg`; // ready before they're picked
const langPage = document.getElementById('lang-page');
const langFrame = langPage.parentElement;
let langTimer;
for (const input of document.querySelectorAll('input[name="lang"]')) {
  input.addEventListener('change', () => {
    clearTimeout(langTimer);
    const show = () => {
      langPage.src = `assets/lang-${input.value}.jpg`;
      langPage.alt = LANG_ALT[input.value];
      langFrame.dataset.busy = 'false';
    };
    if (reduceMotion) return show();
    langFrame.dataset.busy = 'true';
    langTimer = setTimeout(show, 500);
  });
}

// ---------- hero video: still for people who prefer less motion ----------

const heroVideo = document.querySelector('.hero-video');
if (reduceMotion) {
  heroVideo.removeAttribute('autoplay');
  heroVideo.pause();
}

// ---------- the demo video (YouTube loads only when opened) ----------

const dialog = document.querySelector('dialog.demo');
const frame = dialog.querySelector('.demo-frame');
for (const b of document.querySelectorAll('[data-demo]')) {
  b.addEventListener('click', () => {
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${YOUTUBE_ID}?autoplay=1&rel=0`;
    iframe.title = 'InkSwap demo video';
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    iframe.allowFullscreen = true;
    frame.replaceChildren(iframe);
    dialog.showModal();
  });
}
dialog.addEventListener('close', () => frame.replaceChildren()); // stops playback
dialog.addEventListener('click', (e) => {
  if (e.target === dialog) dialog.close(); // a click on the backdrop closes it
});
