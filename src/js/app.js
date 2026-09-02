/* app.js — boot, hash router and the app shell. */

import { $, $$, toast, closeSheet, sheetOpen } from './util.js';
import * as store from './store.js';
import { registerSW } from './pwa.js';
import * as theme from './theme.js';

import home        from './views/home.js';
import teams       from './views/teams.js';
import teamDetail  from './views/team-detail.js';
import setup       from './views/setup.js';
import quick       from './views/quick.js';
import liveView    from './views/live.js';
import score       from './views/score.js';
import scorecard   from './views/scorecard.js';
import matches     from './views/matches.js';
import tournaments from './views/tournaments.js';
import tourDetail  from './views/tournament-detail.js';
import statsView   from './views/stats.js';
import settings    from './views/settings.js';

const ROUTES = [
  ['',              home],
  ['matches',       matches],
  ['teams',         teams],
  ['team/:id',      teamDetail],
  ['match/new',     setup],
  ['match/quick',   quick],
  ['live',          liveView],
  ['score/:id',     score],
  ['scorecard/:id', scorecard],
  ['tournaments',   tournaments],
  ['tournament/:id', tourDetail],
  ['stats',         statsView],
  ['settings',      settings]
];

let current = null;
let cleanup = null;

/* ---------- routing ---------- */

function parseHash() {
  const raw = (location.hash || '#/').replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const segs = path.split('/').filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  for (const [pattern, view] of ROUTES) {
    const pSegs = pattern.split('/').filter(Boolean);
    if (pSegs.length !== segs.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < pSegs.length; i++) {
      if (pSegs[i][0] === ':') params[pSegs[i].slice(1)] = decodeURIComponent(segs[i]);
      else if (pSegs[i] !== segs[i]) { ok = false; break; }
    }
    if (ok) return { view, params, query, path: raw };
  }
  return { view: home, params: {}, query: {}, path: '' };
}

export function go(path, replace = false) {
  const h = path.startsWith('#') ? path : '#' + (path.startsWith('/') ? path : '/' + path);
  if (replace) location.replace(h); else location.hash = h;
}

export function back(fallback = '/') {
  if (history.length > 1) history.back(); else go(fallback);
}

const val = (v, ctx) => (typeof v === 'function' ? v(ctx) : v);

export function render() {
  const route = parseHash();
  const ctx = { ...route.params, query: route.query, go, render, store };

  if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
  current = route.view;

  const root = $('#app');
  let html;
  try {
    html = current.render(ctx);
  } catch (err) {
    console.error('[render]', err);
    html = `<div class="card p-6 text-center">
        <p class="text-rose-300 font-semibold">Something went wrong drawing this screen.</p>
        <p class="mt-1 text-xs text-slate-500">${err.message}</p>
        <a href="#/" class="btn-ghost mt-4">Back to home</a></div>`;
  }
  root.innerHTML = html;
  const scroller = $('#scroller');
  if (scroller) scroller.scrollTop = 0;
  root.scrollTop = 0;

  // shell chrome
  $('#pageTitle').textContent = val(current.title, ctx) || 'Cricket Scorer';
  const sub = val(current.sub, ctx) || '';
  $('#pageSub').textContent = sub;
  $('#pageSub').classList.toggle('hidden', !sub);
  $('#pageActions').innerHTML = val(current.actions, ctx) || '';

  const backTo = val(current.back, ctx);
  const bb = $('#backBtn');
  bb.classList.toggle('hidden', !backTo);
  bb.onclick = () => (backTo === true ? back() : go(backTo));
  // The mark takes the back arrow's place on the top-level screens, so the
  // header never shows both and the title never shifts around.
  $('#brandLogo').classList.toggle('hidden', !!backTo);

  const hideNav = val(current.hideNav, ctx);
  $('#nav').classList.toggle('hidden', !!hideNav);

  const navKey = val(current.nav, ctx);
  $$('#nav [data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === navKey));

  if (current.mount) {
    try { cleanup = current.mount(root, ctx) || null; }
    catch (err) { console.error('[mount]', err); }
  }
  wakeLock(!!current.keepAwake);
}

/* ---------- screen wake lock while scoring ---------- */

let lock = null;
async function wakeLock(want) {
  try {
    if (want && store.settings().keepAwake && 'wakeLock' in navigator) {
      if (!lock) lock = await navigator.wakeLock.request('screen');
    } else if (lock) { await lock.release(); lock = null; }
  } catch { lock = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && current?.keepAwake) wakeLock(true);
  else store.save(true);
});

/* ---------- boot ---------- */

window.addEventListener('hashchange', () => { if (sheetOpen()) closeSheet('__dismiss'); render(); });
window.addEventListener('error', e => console.error('[app]', e.error || e.message));

store.load();
theme.apply();
theme.watchSystem(() => render());
render();

// Another tab changed the data — redraw so this one is never showing a stale score.
store.onExternalChange(() => {
  toast('Updated in another tab', 'info', 2200);
  render();
});

/* ---------- PWA ---------- */

registerSW();

// Expose a tiny surface for debugging from the console.
window.CS = { store, go, render };
