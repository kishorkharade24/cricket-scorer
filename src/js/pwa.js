/* pwa.js — install prompt and service-worker registration.
 * Kept separate from app.js so views can import it without a circular import. */

import { toast } from './util.js';

let deferred = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferred = e;
    document.dispatchEvent(new CustomEvent('installable'));
  });
  window.addEventListener('appinstalled', () => { deferred = null; toast('Cricket Scorer installed', 'ok'); });
}

export function canInstall() { return !!deferred; }

export async function promptInstall() {
  if (!deferred) {
    toast('Use your browser menu → “Add to Home screen”', 'info', 4200);
    return false;
  }
  deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  if (outcome === 'accepted') toast('Installed — it works offline now', 'ok');
  return outcome === 'accepted';
}

/* ---------- updates ---------- */

/**
 * A hosted copy of the app is only as fresh as its service worker. When a newer
 * one has installed behind the running page, offer a reload rather than silently
 * leaving someone on an old build mid-match.
 */
function showUpdateBanner() {
  if (document.querySelector('#updateBar')) return;
  const bar = document.createElement('div');
  bar.id = 'updateBar';
  bar.className = 'fixed inset-x-3 bottom-24 z-[95] flex items-center gap-3 rounded-2xl ' +
    'bg-emerald-500 text-ink-950 px-4 py-3 shadow-lift animate-slide-up mx-auto max-w-md';
  bar.innerHTML = `
    <span class="text-lg">✨</span>
    <span class="flex-1 text-sm font-bold leading-tight">A newer version is ready
      <span class="block text-[11px] font-semibold opacity-70">Finish the over first — nothing is lost.</span></span>
    <button id="updateNow" class="rounded-lg bg-ink-950/85 text-white px-3 py-1.5 text-xs font-bold active:scale-95 transition">Reload</button>
    <button id="updateLater" aria-label="Dismiss" class="text-ink-950/60 text-lg leading-none px-1">×</button>`;
  document.body.appendChild(bar);
  bar.querySelector('#updateNow').addEventListener('click', () => location.reload());
  bar.querySelector('#updateLater').addEventListener('click', () => bar.remove());
}

export function registerSW() {
  if (typeof navigator === 'undefined') return;
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;

  window.addEventListener('load', async () => {
    let reg;
    try {
      reg = await navigator.serviceWorker.register('./sw.js');
    } catch (err) {
      console.warn('[sw] registration failed', err);
      return;
    }

    reg.addEventListener('updatefound', () => {
      const incoming = reg.installing;
      if (!incoming) return;
      incoming.addEventListener('statechange', () => {
        // "installed" while another worker is already in control means an update,
        // not a first install.
        if (incoming.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner();
      });
    });

    // Look for a new build when the tab comes back to the foreground, at most
    // once an hour, so a long-lived home-screen app does not go stale.
    let lastCheck = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastCheck < 3600e3) return;
      lastCheck = Date.now();
      reg.update().catch(() => { /* offline: nothing to do */ });
    });
  });
}
