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
    'bg-emerald-500 text-onaccent px-4 py-3 shadow-lift animate-slide-up mx-auto max-w-md';
  bar.innerHTML = `
    <span class="text-lg">✨</span>
    <span class="flex-1 text-sm font-bold leading-tight">A newer version is ready
      <span class="block text-[11px] font-semibold opacity-70">Finish the over first — nothing is lost.</span></span>
    <button id="updateNow" class="rounded-lg bg-ink-950/85 text-white px-3 py-1.5 text-xs font-bold active:scale-95 transition">Reload</button>
    <button id="updateLater" aria-label="Dismiss" class="text-onaccent/60 text-lg leading-none px-1">×</button>`;
  document.body.appendChild(bar);
  bar.querySelector('#updateNow').addEventListener('click', () => location.reload());
  bar.querySelector('#updateLater').addEventListener('click', () => bar.remove());
}

export function registerSW() {
  if (typeof navigator === 'undefined') return;
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;

  // Whether a worker was already in charge when this page started. If one was,
  // any worker that installs from here on is an update, not a first install.
  const hadController = !!navigator.serviceWorker.controller;

  const watch = worker => {
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && hadController) showUpdateBanner();
    });
  };

  // Register straight away rather than waiting for window.load. The browser
  // begins its own check for a new sw.js during navigation, and if we register
  // late that check can finish before we are listening — which is exactly how
  // an installed app ends up silently a version behind.
  navigator.serviceWorker.register('./sw.js').then(reg => {
    // Catch a worker that arrived before this code ran.
    if (reg.waiting && hadController) showUpdateBanner();
    watch(reg.installing);
    reg.addEventListener('updatefound', () => watch(reg.installing));

    reg.update().catch(() => { /* offline */ });

    // Home-screen apps are resumed far more often than they are reloaded, so
    // check whenever the app comes back to the foreground.
    let lastCheck = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastCheck < 30e3) return;
      lastCheck = Date.now();
      reg.update().catch(() => { /* offline */ });
    });
  }).catch(err => console.warn('[sw] registration failed', err));

  // The new worker has taken over while this page is still running the old
  // code. Offer the reload rather than swapping underneath someone mid-over.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) showUpdateBanner();
  });
}

/** Manual "check for updates", for the Settings screen. */
export async function checkForUpdate() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return { ok: false, reason: 'This browser cannot install the app.' };
  }
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return { ok: false, reason: 'The app is not installed on this device yet.' };
  try {
    await reg.update();
  } catch {
    return { ok: false, reason: 'No connection — cannot check right now.' };
  }
  if (reg.installing || reg.waiting) { showUpdateBanner(); return { ok: true, update: true }; }
  return { ok: true, update: false };
}
