/* Matches — everything played or in progress. */

import { sortBy, confirmDlg, toast } from '../util.js';
import * as store from '../store.js';
import { matchCard, empty, tabs } from '../ui.js';

let tab = 'all';

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
      <div class="mt-4 space-y-3">
        ${list.length
          ? list.map(m => `<div class="relative group">
              ${matchCard(m)}
              <button data-del="${m.id}" aria-label="Delete match"
                class="absolute top-3 right-3 h-7 w-7 rounded-lg bg-ink-950/70 border border-white/10 text-slate-500 hover:text-rose-300 hover:border-rose-500/30 grid place-items-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition text-xs">✕</button>
            </div>`).join('')
          : empty('🏏', 'Nothing here yet', tab === 'live' ? 'No match is currently being scored.' : 'Completed matches will show up here.',
              `<a href="#/match/new" class="btn-primary">Start a match</a>`)}
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
