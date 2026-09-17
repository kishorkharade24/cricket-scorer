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
  actions: () => `<a href="#/settings" class="h-9 w-9 rounded-xl bg-plate border border-rule grid place-items-center text-fg hover:bg-fill active:scale-90 transition" aria-label="Settings">${ICON.cog}</a>`,

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
        ${tile('#/match/quick', ICON.bat, 'Quick match', 'Type names, start scoring')}
        ${tile('#/tournaments', ICON.trophy, 'Tournament', 'Fixtures & points table')}
        ${tile('#/match/new', ICON.ball, 'Full setup', 'Saved teams, toss, XI')}
        ${tile('#/teams', ICON.people, 'Teams', `${d.teams.length} saved, ${d.players.length} players`)}
      </div>

      <a href="#/live" class="card-h mt-3 p-3.5 flex items-center gap-3">
        <span class="h-9 w-9 shrink-0 rounded-xl bg-action/10 border border-action grid place-items-center text-base">${ICON.antenna}</span>
        <span class="flex-1 min-w-0"><span class="block text-sm font-semibold text-fg">Watch a live match</span>
        <span class="block text-[11px] text-muted">From the phone that is scoring — at the ground or from anywhere</span></span>
        <span class="text-faint">${ICON.chevron}</span>
      </a>

      ${tours.length ? `${section('Tournaments', `<a href="#/tournaments" class="text-[11px] font-bold text-fg">See all</a>`)}
        <div class="grid gap-3">${tours.map(tourRow).join('')}</div>` : ''}

      ${done.length ? `${section('Recent results', `<a href="#/matches" class="text-[11px] font-bold text-fg">See all</a>`)}
        <div class="space-y-3">${done.map(m => matchCard(m)).join('')}</div>` : ''}

      ${!fresh && !live.length && !done.length ? empty(ICON.ball, 'No matches yet', 'Set up your teams, then start scoring your first game.',
        `<a href="#/match/new" class="btn-primary">Start a match</a>`) : ''}

      <div id="installRow" class="mt-6 ${canInstall() ? '' : 'hidden'}">
        <button data-act="install" class="w-full card-h p-4 flex items-center gap-3 text-left">
          <span class="h-10 w-10 rounded-xl bg-action/15 border border-action grid place-items-center text-lg">${ICON.download}</span>
          <span class="flex-1"><span class="block text-sm font-bold text-fg">Install on this device</span>
          <span class="block text-[11px] text-muted">Full screen, opens offline, no browser bar</span></span>
        </button>
      </div>

      <p class="mt-8 text-center text-[11px] text-faint leading-relaxed">
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
  return `<div class="card p-6 mb-6">
    <div>
      <h2 class="display text-2xl font-extrabold text-fg">Score a full game, offline</h2>
      <p class="mt-2 text-sm text-muted leading-relaxed">
        Ball-by-ball scoring with extras, wickets, free hits and undo — plus proper scorecards,
        tournament points tables and career stats. Nothing is uploaded anywhere.</p>
      <div class="mt-4 flex flex-wrap gap-2">
        <a href="#/teams" class="btn-ghost">Set up saved teams</a>
        <a href="#/match/quick" class="btn-primary">Quick match — just names</a>
      </div>
    </div></div>`;
}

function tile(href, icon, title, sub) {
  return `<a href="${href}" class="card-h p-4 block">
    <span class="text-xl text-muted">${icon}</span>
    <p class="mt-2 text-sm font-semibold text-fg">${esc(title)}</p>
    <p class="text-[11px] text-muted leading-snug">${esc(sub)}</p></a>`;
}

function tourRow(t) {
  const played = store.matches().filter(m => m.tournamentId === t.id && m.status === 'completed').length;
  const total = (t.fixtures || []).length;
  const pct = total ? Math.round((played / total) * 100) : 0;
  return `<a href="#/tournament/${t.id}" class="card-h p-4 block">
    <div class="flex items-center gap-3">
      <span class="h-10 w-10 rounded-lg bg-fill border border-rule grid place-items-center text-base text-muted">${ICON.trophy}</span>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-bold text-fg truncate">${esc(t.name)}</p>
        <p class="text-[11px] text-muted">${t.teamIds.length} teams, ${played}/${total} played</p>
      </div>
      <span class="display text-base font-extrabold text-fg">${pct}%</span>
    </div>
    <div class="mt-3 h-1.5 rounded-full bg-plate overflow-hidden">
      <div class="h-full rounded-full bg-action transition-all duration-500" style="width:${pct}%"></div>
    </div></a>`;
}
