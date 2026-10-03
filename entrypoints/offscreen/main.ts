// Plays InkSwap's chime: two soft rising notes, synthesized with Web Audio (no sound file).

import { browser } from 'wxt/browser';
import type { Message } from '@/lib/messages';

const NOTES = [
  { freq: 1046.5, at: 0 }, // C6
  { freq: 1568, at: 0.11 }, // G6
];

function playChime() {
  const ctx = new AudioContext();
  for (const { freq, at } of NOTES) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const start = ctx.currentTime + at;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.18, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.5);
  }
  setTimeout(() => void ctx.close(), 800);
}

browser.runtime.onMessage.addListener((raw) => {
  if ((raw as Message).type === 'playChime') playChime();
});
