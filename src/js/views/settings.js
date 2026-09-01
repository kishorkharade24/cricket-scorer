/* Settings — defaults, backup, and the honest storage warning. */

import { esc, download, toast, confirmDlg, sheet, fmtDateTime, copyText } from '../util.js';
import * as store from '../store.js';
import { section } from '../ui.js';
import { promptInstall, checkForUpdate } from '../pwa.js';
import * as theme from '../theme.js';

export default {
  nav: 'home',
  back: '/',
  title: 'Settings',
  sub: 'Everything stays on this device',

  render() {
    const s = store.settings();
    const d = store.data();
    const bytes = store.storageUsed();
    const kb = (bytes / 1024).toFixed(1);

    return `
      ${section('Appearance')}
      <div class="card p-4">
        <div class="grid grid-cols-3 gap-2">
          ${theme.THEMES.map(t => `<button data-theme-set="${t.key}"
            class="rounded-xl border px-2 py-3 text-center transition active:scale-95 ${
              (s.theme || 'dark') === t.key
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-white/5 border-white/10 text-slate-400'}">
            <span class="block text-lg leading-none">${t.icon}</span>
            <span class="block mt-1.5 text-xs font-bold">${t.label}</span></button>`).join('')}
        </div>
        <p class="mt-3 text-[11px] text-slate-500">${esc(theme.THEMES.find(t => t.key === (s.theme || 'dark'))?.hint || '')}</p>
      </div>

      ${section('Scoring defaults')}
      <div class="card p-4 grid grid-cols-2 gap-3">
        <div><label class="label" for="defOvers">Overs</label>
          <input id="defOvers" type="number" min="1" max="90" value="${s.defaultOvers}" class="field num"></div>
        <div><label class="label" for="defPlayers">Players / side</label>
          <input id="defPlayers" type="number" min="2" max="15" value="${s.defaultPlayers}" class="field num"></div>
      </div>

      ${section('Behaviour')}
      <div class="card divide-y divide-white/[.06]">
        ${toggle('celebrate', 'Boundary animations', 'Flash FOUR, SIX and OUT on the screen', s.celebrate)}
        ${toggle('haptics', 'Vibrate on each ball', 'Only on phones that support it', s.haptics)}
        ${toggle('keepAwake', 'Keep the screen on while scoring', 'Uses the browser wake lock where available', s.keepAwake)}
        ${toggle('countSuperOverStats', 'Count Super Overs in player stats', 'Official records leave them out; turf sides usually want them in', s.countSuperOverStats)}
      </div>

      ${section('Your data')}
      <div class="card p-4">
        <div class="grid grid-cols-4 gap-2 text-center mb-4">
          ${[['Teams', d.teams.length], ['Players', d.players.length], ['Matches', d.matches.length], ['Cups', d.tournaments.length]]
            .map(([l, v]) => `<div><p class="num text-xl font-extrabold text-white">${v}</p>
              <p class="text-[10px] uppercase tracking-wider text-slate-500 font-bold">${l}</p></div>`).join('')}
        </div>
        <div class="rounded-xl bg-amber-500/10 border border-amber-500/25 p-3 mb-4">
          <p class="text-[11px] text-amber-200 leading-relaxed">
            <b>Nothing is backed up anywhere.</b> Clearing your browser data, using private mode,
            or switching device wipes it. Export a file now and again.</p>
          ${isIOSBrowser() ? `<p class="mt-2 text-[11px] text-amber-200 leading-relaxed border-t border-amber-500/20 pt-2">
            <b>On iPhone or iPad, add this to your Home Screen.</b> Safari can clear a
            website’s saved data after about a week of not visiting it. Home Screen apps are
            not cleared that way.</p>` : ''}
        </div>
        <div class="grid grid-cols-2 gap-3">
          <button data-act="export" class="btn-primary">Export backup</button>
          <button data-act="import" class="btn-ghost">Import backup</button>
        </div>
        <p class="mt-3 text-[11px] text-slate-600">Using ${kb} KB · last saved ${esc(fmtDateTime(d.updatedAt))}</p>
      </div>

      ${section('App')}
      <div class="card divide-y divide-white/[.06]">
        <button data-act="install" class="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/[.03] transition">
          <span class="text-lg">⬇️</span>
          <span class="flex-1"><span class="block text-sm font-semibold text-white">Install on this device</span>
          <span class="block text-[11px] text-slate-500">Runs full screen and works with no connection</span></span></button>
        <button data-act="update" class="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/[.03] transition">
          <span class="text-lg">🔄</span>
          <span class="flex-1"><span class="block text-sm font-semibold text-white">Check for updates</span>
          <span class="block text-[11px] text-slate-500">Fetches the newest version if one has been published</span></span></button>
        <button data-act="display" class="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/[.03] transition">
          <span class="text-lg">📐</span>
          <span class="flex-1"><span class="block text-sm font-semibold text-white">Screen fit</span>
          <span class="block text-[11px] text-slate-500">What this device gives the app, for chasing layout gaps</span></span></button>
        <button data-act="about" class="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/[.03] transition">
          <span class="text-lg">ℹ️</span>
          <span class="flex-1"><span class="block text-sm font-semibold text-white">Scoring rules used</span>
          <span class="block text-[11px] text-slate-500">How extras, maidens and NRR are worked out</span></span></button>
      </div>

      ${section('Danger zone')}
      <div class="card p-4">
        <button data-act="reset" class="btn-danger w-full">Delete everything on this device</button>
      </div>

      <div class="mt-8 text-center">
        <p class="text-[11px] text-slate-500 font-semibold">Version 1.0.0</p>
        <p class="mt-0.5 text-[10px] text-slate-700">Offline PWA · no server, no accounts</p>
      </div>
      <input id="fileIn" type="file" accept="application/json,.json" class="hidden">`;
  },

  mount(root, ctx) {
    root.querySelectorAll('[data-theme-set]').forEach(b => b.addEventListener('click', () => {
      theme.set(b.dataset.themeSet);
      ctx.render();
    }));

    root.querySelector('#defOvers')?.addEventListener('change', e =>
      store.setSetting('defaultOvers', Math.max(1, Math.min(90, +e.target.value || 20))));
    root.querySelector('#defPlayers')?.addEventListener('change', e =>
      store.setSetting('defaultPlayers', Math.max(2, Math.min(15, +e.target.value || 11))));

    root.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.toggle;
      store.setSetting(k, !store.settings()[k]);
      ctx.render();
    }));

    root.querySelector('[data-act="export"]')?.addEventListener('click', () => {
      const stamp = new Date().toISOString().slice(0, 10);
      download(`cricket-scorer-backup-${stamp}.json`, store.exportJSON());
      toast('Backup downloaded', 'ok');
    });

    const fileIn = root.querySelector('#fileIn');
    root.querySelector('[data-act="import"]')?.addEventListener('click', () => fileIn.click());
    fileIn?.addEventListener('change', async () => {
      const f = fileIn.files?.[0];
      if (!f) return;
      const text = await f.text();
      const mode = await sheet(`
        <h3 class="text-lg font-bold text-white">Import backup</h3>
        <p class="mt-2 text-sm text-slate-400 leading-relaxed">Replace everything on this device, or merge the file into what is already here?</p>
        <div class="mt-5 grid gap-2">
          <button class="btn-ghost" data-close="merge">Merge — keep both</button>
          <button class="btn-danger" data-close="replace">Replace everything</button>
          <button class="btn-ghost" data-close="__dismiss">Cancel</button>
        </div>`, { grab: false });
      if (mode !== 'merge' && mode !== 'replace') { fileIn.value = ''; return; }
      try {
        store.importJSON(text, mode);
        toast('Backup restored', 'ok');
        ctx.render();
      } catch (err) {
        toast(err.message || 'That file could not be read', 'error', 4000);
      }
      fileIn.value = '';
    });

    root.querySelector('[data-act="install"]')?.addEventListener('click', promptInstall);
    root.querySelector('[data-act="about"]')?.addEventListener('click', aboutSheet);
    root.querySelector('[data-act="display"]')?.addEventListener('click', displaySheet);

    root.querySelector('[data-act="update"]')?.addEventListener('click', async e => {
      const btn = e.currentTarget;
      btn.style.opacity = '.5';
      const r = await checkForUpdate();
      btn.style.opacity = '';
      if (!r.ok) toast(r.reason, 'warn', 3500);
      else if (r.update) toast('A new version is downloading — reload when it prompts', 'ok', 4000);
      else toast('You are on the latest version', 'ok');
    });

    root.querySelector('[data-act="reset"]')?.addEventListener('click', async () => {
      if (!await confirmDlg('Delete everything?',
        'Every team, player, match and tournament stored in this browser will be erased. Export a backup first if you might want it back.', 'Delete it all')) return;
      store.resetAll();
      toast('All data deleted', 'ok');
      ctx.go('/');
    });
  }
};

/** iOS Safari applies a 7-day cap on stored data for sites, but not for
 *  apps added to the Home Screen — worth saying so, on iOS only. */
function isIOSBrowser() {
  const ua = navigator.userAgent || '';
  const iOS = /iPad|iPhone|iPod/.test(ua) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.navigator.standalone === true ||
                     window.matchMedia?.('(display-mode: standalone)').matches;
  return iOS && !standalone;
}

function toggle(key, title, sub, on) {
  return `<button data-toggle="${key}" class="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/[.03] transition">
    <span class="flex-1 min-w-0"><span class="block text-sm font-semibold text-white">${esc(title)}</span>
    <span class="block text-[11px] text-slate-500">${esc(sub)}</span></span>
    <span class="shrink-0 h-6 w-10 rounded-full p-0.5 transition-colors ${on ? 'bg-emerald-500' : 'bg-white/15'}">
      <span class="block h-5 w-5 rounded-full bg-pure shadow transition-transform ${on ? 'translate-x-4' : ''}"></span></span>
  </button>`;
}

/**
 * Layout gaps on a phone are hard to chase from a desktop browser. This reports
 * what the device actually hands the app, so the numbers can be read off rather
 * than guessed at.
 */
async function displaySheet() {
  const shell = document.body.getBoundingClientRect();
  const nav = document.querySelector('#nav')?.getBoundingClientRect();
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;' +
    'padding-top:env(safe-area-inset-top,0px);padding-right:env(safe-area-inset-right,0px);' +
    'padding-bottom:env(safe-area-inset-bottom,0px);padding-left:env(safe-area-inset-left,0px);';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const safe = {
    top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0
  };
  probe.remove();

  const gap = nav ? Math.round(window.innerHeight - nav.bottom) : null;
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches ||
                     window.navigator.standalone === true;

  const row = (k, v, warn) => `<div class="flex justify-between py-1.5 border-b border-white/[.05] text-[13px]">
    <span class="text-slate-500">${esc(k)}</span>
    <span class="num font-semibold ${warn ? 'text-rose-300' : 'text-white'}">${esc(v)}</span></div>`;

  const text = [
    `window ${window.innerWidth}x${window.innerHeight}`,
    `screen ${window.screen?.width}x${window.screen?.height} @${window.devicePixelRatio}x`,
    `visualViewport ${Math.round(window.visualViewport?.width || 0)}x${Math.round(window.visualViewport?.height || 0)}`,
    `shell ${Math.round(shell.width)}x${Math.round(shell.height)}`,
    `safe area t${safe.top} r${safe.right} b${safe.bottom} l${safe.left}`,
    `gap under bar ${gap}`,
    `standalone ${standalone}`
  ].join('\n');

  const v = await sheet(`
    <h3 class="text-lg font-bold text-white mb-1">Screen fit</h3>
    <p class="text-xs text-slate-500 mb-4">The shell should be exactly the window height, and the gap under the bar should be 0.</p>
    ${row('Window', `${window.innerWidth} x ${window.innerHeight}`)}
    ${row('Visual viewport', `${Math.round(window.visualViewport?.width || 0)} x ${Math.round(window.visualViewport?.height || 0)}`)}
    ${row('Screen', `${window.screen?.width} x ${window.screen?.height} @${window.devicePixelRatio}x`)}
    ${row('App shell', `${Math.round(shell.width)} x ${Math.round(shell.height)}`, Math.round(shell.height) !== window.innerHeight)}
    ${row('Gap under the bar', gap == null ? '—' : `${gap} px`, !!gap)}
    ${row('Safe area', `${safe.top} / ${safe.right} / ${safe.bottom} / ${safe.left}`)}
    ${row('Installed to home screen', standalone ? 'yes' : 'no')}
    <div class="mt-5 grid grid-cols-2 gap-3">
      <button class="btn-ghost" data-close="__dismiss">Close</button>
      <button class="btn-primary" data-close="copy">Copy</button>
    </div>`, { grab: false });
  if (v === 'copy') toast(await copyText(text) ? 'Copied — paste it to me' : 'Could not copy', 'ok');
}

async function aboutSheet() {
  const rule = (t, d) => `<div class="py-2.5 border-b border-white/[.05]">
    <p class="text-[13px] font-semibold text-white">${t}</p>
    <p class="text-[11px] text-slate-500 leading-relaxed mt-0.5">${d}</p></div>`;
  await sheet(`
    <h3 class="text-lg font-bold text-white mb-3">Scoring rules used</h3>
    ${rule('Wide', 'One run to the batting side plus anything run. Charged to the bowler. Not a legal ball, so the over does not advance and the batter faces nothing.')}
    ${rule('No ball', 'One run plus whatever is scored. Runs off the bat go to the batter; byes and leg byes off a no ball go to extras. Not a legal ball. A free hit follows if the rule is switched on.')}
    ${rule('Free hit', 'Only a run out (or obstructing the field / hitting the ball twice) can dismiss the batter. A wide keeps the free hit alive; a legal delivery clears it.')}
    ${rule('Byes &amp; leg byes', 'Runs to the team, not to the batter, and <b>not</b> charged to the bowler. The ball is legal and the batter is credited with facing it.')}
    ${rule('Maiden over', 'Six legal balls in which the bowler concedes nothing. Byes and leg byes still allow a maiden; a wide or no ball does not.')}
    ${rule('Bowler credit', 'Bowled, caught, LBW, stumped, hit wicket and caught &amp; bowled count for the bowler. Run outs, retirements, obstruction and timed out do not.')}
    ${rule('Strike rotation', 'The batters cross on odd runs and change ends at the end of every over. After a catch, the new batter takes strike.')}
    ${rule('Innings end', 'Overs completed, the side all out, or the target passed — whichever comes first. You can also end an innings by hand for a declaration or rain.')}
    ${rule('Net run rate', '(runs scored ÷ overs faced) − (runs conceded ÷ overs bowled). A side bowled out is charged its full quota of overs, per ICC practice.')}
    ${rule('Fixed-run zones', 'Some turf grounds award set runs for hitting a marked area — the net, a wall, past a line. The runs go to the batter, but nobody runs, so the strike does not change. The over strip marks them with a z.')}
    ${rule('Undo', 'Every ball is stored as an event and the scorecard is recalculated from scratch, so undo puts the match back exactly — even across an innings break.')}
    <button class="btn-ghost w-full mt-4" data-close="__dismiss">Close</button>`);
}
