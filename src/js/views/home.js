/* Home — resume a live game, quick actions, recent results. */

import { esc, sortBy } from '../util.js';
import * as store from '../store.js';
import { matchCard, section, empty, ICON } from '../ui.js';
import { promptInstall, canInstall } from '../pwa.js';

export default {
  nav: 'home',
  title: 'Cricket Scorer',
  sub: () => {
    const d = store.data();
    const live = d.matches.filter(m => m.status === 'live').length;
    return live ? `${live} match${live > 1 ? 'es' : ''} in progress` : 'Score offline. Nothing leaves this device.';
  },
  actions: () => `<a href="#/settings" class="h-9 w-9 rounded-xl bg-white/5 border border-white/10 grid place-items-center text-slate-300 hover:bg-white/10 active:scale-90 transition" aria-label="Settings">${ICON.cog}</a>`,

  render() {
    const d = store.data();
    const live = sortBy(d.matches.filter(m => m.status === 'live'), '-updatedAt');
    const done = sortBy(d.matches.filter(m => m.status === 'completed'), '-updatedAt').slice(0, 5);
    const tours = sortBy(d.tournaments, '-createdAt').slice(0, 4);
    const fresh = d.teams.length === 0;

    return `
      ${fresh ? welcome() : ''}
      ${live.length ? `${section('In progress')}<div class="space-y-3">${live.map(m => matchCard(m)).join('')}</div>` : ''}

      ${section('Quick start')}
      <div class="grid grid-cols-2 gap-3">
        ${tile('#/match/new', '🏏', 'New match', 'Toss, XI, then score', 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/25')}
        ${tile('#/tournaments', '🏆', 'Tournament', 'Fixtures & points table', 'from-amber-500/20 to-amber-500/5 border-amber-500/25')}
        ${tile('#/teams', '👥', 'Teams', `${d.teams.length} saved`, 'from-sky-500/20 to-sky-500/5 border-sky-500/25')}
        ${tile('#/stats', '📊', 'Player stats', `${d.players.length} players`, 'from-violet-500/20 to-violet-500/5 border-violet-500/25')}
      </div>

      ${tours.length ? `${section('Tournaments', `<a href="#/tournaments" class="text-[11px] font-bold text-emerald-400">See all</a>`)}
        <div class="grid gap-3">${tours.map(tourRow).join('')}</div>` : ''}

      ${done.length ? `${section('Recent results', `<a href="#/matches" class="text-[11px] font-bold text-emerald-400">See all</a>`)}
        <div class="space-y-3">${done.map(m => matchCard(m)).join('')}</div>` : ''}

      ${!fresh && !live.length && !done.length ? empty('🏏', 'No matches yet', 'Set up your teams, then start scoring your first game.',
        `<a href="#/match/new" class="btn-primary">Start a match</a>`) : ''}

      <div id="installRow" class="mt-6 ${canInstall() ? '' : 'hidden'}">
        <button data-act="install" class="w-full card-h p-4 flex items-center gap-3 text-left">
          <span class="h-10 w-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25 grid place-items-center text-lg">⬇️</span>
          <span class="flex-1"><span class="block text-sm font-bold text-white">Install on this device</span>
          <span class="block text-[11px] text-slate-500">Full screen, opens offline, no browser bar</span></span>
        </button>
      </div>

      <p class="mt-8 text-center text-[11px] text-slate-600 leading-relaxed">
        All data lives in this browser only.<br>Back it up from Settings before clearing site data.
      </p>`;
  },

  mount(root) {
    root.querySelector('[data-act="install"]')?.addEventListener('click', promptInstall);
    const onInstallable = () => root.querySelector('#installRow')?.classList.remove('hidden');
    document.addEventListener('installable', onInstallable);
    return () => document.removeEventListener('installable', onInstallable);
  }
};

function welcome() {
  return `<div class="card p-6 mb-6 relative overflow-hidden animate-slide-up">
    <div class="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-emerald-500/20 blur-2xl"></div>
    <div class="relative">
      <p class="text-[11px] font-bold uppercase tracking-widest text-emerald-400">Welcome</p>
      <h2 class="mt-1 text-xl font-extrabold text-white">Score a full game, offline</h2>
      <p class="mt-2 text-sm text-slate-400 leading-relaxed">
        Ball-by-ball scoring with extras, wickets, free hits and undo — plus proper scorecards,
        tournament points tables and career stats. Nothing is uploaded anywhere.</p>
      <div class="mt-4 flex flex-wrap gap-2">
        <a href="#/teams" class="btn-primary">Create your first team</a>
        <a href="#/match/new" class="btn-ghost">Skip to a match</a>
      </div>
    </div></div>`;
}

function tile(href, icon, title, sub, grad) {
  return `<a href="${href}" class="rounded-2xl border bg-gradient-to-br ${grad} p-4 transition active:scale-[.97] hover:brightness-110">
    <div class="text-2xl">${icon}</div>
    <p class="mt-2 text-sm font-bold text-white">${esc(title)}</p>
    <p class="text-[11px] text-slate-400">${esc(sub)}</p></a>`;
}

function tourRow(t) {
  const played = store.matches().filter(m => m.tournamentId === t.id && m.status === 'completed').length;
  const total = (t.fixtures || []).length;
  const pct = total ? Math.round((played / total) * 100) : 0;
  return `<a href="#/tournament/${t.id}" class="card-h p-4 block">
    <div class="flex items-center gap-3">
      <span class="h-10 w-10 rounded-xl bg-amber-500/15 border border-amber-500/25 grid place-items-center text-lg">🏆</span>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-bold text-white truncate">${esc(t.name)}</p>
        <p class="text-[11px] text-slate-500">${t.teamIds.length} teams · ${played}/${total} played</p>
      </div>
      <span class="num text-xs font-bold text-amber-300">${pct}%</span>
    </div>
    <div class="mt-3 h-1.5 rounded-full bg-white/8 overflow-hidden">
      <div class="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-400 transition-all duration-500" style="width:${pct}%"></div>
    </div></a>`;
}
