/* theme.js — dark / light / follow-the-system.
 *
 * Everything the app paints resolves through CSS variables, so switching is a
 * single attribute on <html>. Applied before first paint (see index.html) so
 * there is never a flash of the wrong theme.
 */

import * as store from './store.js';

export const THEMES = [
  { key: 'dark',   label: 'Dark',   icon: '🌙', hint: 'Best under lights and outdoors at dusk' },
  { key: 'light',  label: 'Light',  icon: '☀️', hint: 'Easier to read in bright sunlight' },
  { key: 'system', label: 'System', icon: '🖥️', hint: 'Follows your phone’s setting' }
];

/* iOS paints the area around an installed app's web view in this colour. The
   bars are what meet the screen edges, so it has to match them — using the page
   colour is what made a strip appear under the navigation. */
const BAR = { dark: '#111928', light: '#ffffff' };

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
