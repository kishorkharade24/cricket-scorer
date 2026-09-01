/* Matches — everything played or in progress. */

import { sortBy, confirmDlg, toast } from '../util.js';
import * as store from '../store.js';
import { matchCard, empty, tabs, section } from '../ui.js';

let tab = 'all';

/**
 * Rows are grouped by competition so its name is printed once as a heading
 * rather than on every single card, which is most of what made this list feel
 * busy. Groups keep the order of their most recent match.
 */
function grouped(list) {
  const groups = new Map();
  for (const m of list) {
    const key = m.tournamentId ? (store.tournament(m.tournamentId)?.name || 'Tournament') : 'Friendlies';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }
  // Anything being scored right now goes first — it is the reason the app is open.
  const order = [...groups.entries()].sort((a, b) => {
    const liveIn = g => g[1].some(x => x.status === 'live') ? 0 : 1;
    return liveIn(a) - liveIn(b);
  });

  return order.map(([label, ms]) => `
    ${groups.size > 1 ? section(label) : ''}
    <div class="space-y-3">
      ${sortBy(ms, '-updatedAt').sort((a, b) => (a.status === 'live' ? 0 : 1) - (b.status === 'live' ? 0 : 1))
        .map(m => `<div class="relative group">
          ${matchCard(m, { showTournament: false })}
          <button data-del="${m.id}" aria-label="Delete match"
            class="absolute top-2.5 right-2.5 h-7 w-7 rounded-lg bg-ink-950/70 border border-white/10 text-slate-500 hover:text-rose-300 hover:border-rose-500/30 grid place-items-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition text-xs">✕</button>
        </div>`).join('')}
    </div>`).join('');
}

export default {
  nav: 'matches',
  title: 'Matches',
  sub: () => `${store.matches().length} total`,

  render() {
    const all = sortBy(store.matches(), '-updatedAt');
    const live = all.filter(m => m.status === 'live');
    const done = all.filter(m => m.status === 'completed');
    const list = tab === 'live' ? live : tab === 'done' ? done : all;

    return `
      ${tabs([
        { key: 'all',  label: 'All',        count: all.length },
        { key: 'live', label: 'In progress', count: live.length },
        { key: 'done', label: 'Completed',  count: done.length }
      ], tab)}
      <div class="mt-4">
        ${list.length ? grouped(list) : empty('🏏', 'Nothing here yet',
            tab === 'live' ? 'No match is currently being scored.' : 'Completed matches will show up here.',
            `<a href="#/match/quick" class="btn-primary">Start a match</a>`)}
      </div>`;
  },

  mount(root, ctx) {
    root.querySelectorAll('[data-tab]').forEach(b =>
      b.addEventListener('click', () => { tab = b.dataset.tab; ctx.render(); }));
    root.querySelectorAll('[data-del]').forEach(b =>
      b.addEventListener('click', async e => {
        e.preventDefault(); e.stopPropagation();
        const m = store.match(b.dataset.del);
        if (!m) return;
        const ok = await confirmDlg('Delete this match?', 'The scorecard and every ball recorded in it will be removed. This cannot be undone.', 'Delete');
        if (!ok) return;
        store.deleteMatch(b.dataset.del);
        toast('Match deleted', 'ok');
        ctx.render();
      }));
  }
};
