/* theme.js — dark / light / follow-the-system.
 *
 * Everything the app paints resolves through CSS variables, so switching is a
 * single attribute on <html>. Applied before first paint (see index.html) so
 * there is never a flash of the wrong theme.
 */

import * as store from './store.js';

const ic = d => `<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

export const THEMES = [
  { key: 'dark',   label: 'Scoreboard', icon: ic('<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>'),
    hint: 'A dark board with chalk numbers. Best under lights and at dusk.' },
  { key: 'light',  label: 'Scorebook',  icon: ic('<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"/>'),
    hint: 'Cream paper and ink. Easier to read in bright sunlight.' },
  { key: 'system', label: 'Automatic',  icon: ic('<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>'),
    hint: 'Follows your phone\u2019s setting.' }
];

/* iOS paints the area around an installed app's web view in this colour. The
   bars are what meet the screen edges, so it has to match them — using the page
   colour is what made a strip appear under the navigation. Keep in step with
   --c-chrome in input.css. */
const BAR = { dark: '#0c1511', light: '#fcf9f1' };

export function prefersLight() {
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: light)').matches === true;
}

/** The theme actually in force right now: 'dark' or 'light'. */
export function effective(pref = store.settings().theme) {
  if (pref === 'light') return 'light';
  if (pref === 'system') return prefersLight() ? 'light' : 'dark';
  return 'dark';
}

export function apply(pref = store.settings().theme) {
  if (typeof document === 'undefined') return 'dark';
  const mode = effective(pref);
  document.documentElement.setAttribute('data-theme', mode);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[mode]);
  return mode;
}

export function set(pref) {
  store.setSetting('theme', pref);
  return apply(pref);
}

/** Keep "System" honest when the phone flips at sunset. */
export function watchSystem(onChange) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  const handler = () => {
    if (store.settings().theme !== 'system') return;
    apply('system');
    onChange?.();
  };
  mq.addEventListener?.('change', handler);
  return () => mq.removeEventListener?.('change', handler);
}
