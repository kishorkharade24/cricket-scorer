/* Teams — list and create. */

import { esc, sheet, closeSheet, toast, ACCENTS, accent, sortBy } from '../util.js';
import * as store from '../store.js';
import { empty, badge, ICON } from '../ui.js';

export default {
  nav: 'home',
  title: 'Teams',
  back: '/',
  sub: () => `${store.teams().length} teams · ${store.players().length} players`,
  actions: () => `<button data-act="add" class="btn-primary !px-3 !py-2 text-xs">${ICON.plus}<span class="hidden xs:inline">Team</span></button>`,

  render() {
    const teams = sortBy(store.teams(), 'name');
    if (!teams.length) {
      return empty('👥', 'No teams yet', 'A team needs a name and a squad. You can add players now or while setting up a match.',
        `<button data-act="add" class="btn-primary">Create a team</button>`);
    }
    return `<div class="grid gap-3">${teams.map(row).join('')}</div>
      <button data-act="add" class="mt-4 w-full rounded-2xl border border-dashed border-white/15 py-4 text-sm font-semibold text-slate-400 hover:text-emerald-300 hover:border-emerald-400/40 transition active:scale-[.98]">
        + Add another team</button>`;
  },

  mount(root, ctx) {
    const open = async () => {
      const d = await teamForm(null, ctx);
      if (!d) return;
      const t = store.addTeam(d);
      toast(`${t.name} created — now add players`, 'ok');
      ctx.go('/team/' + t.id);
    };
    root.querySelectorAll('[data-act="add"]').forEach(b => b.addEventListener('click', open));
    document.querySelector('#pageActions [data-act="add"]')?.addEventListener('click', open);
  }
};

function row(t) {
  const squad = store.players(t.id);
  const a = accent(t.accent);
  return `<a href="#/team/${t.id}" class="card-h p-4 flex items-center gap-3">
    ${badge(t.id)}
    <div class="flex-1 min-w-0">
      <p class="font-bold text-white truncate">${esc(t.name)}</p>
      <p class="text-[11px] text-slate-500">${squad.length} player${squad.length === 1 ? '' : 's'}${squad.length < 2 ? ' · needs more' : ''}</p>
    </div>
    <div class="flex -space-x-2">
      ${squad.slice(0, 4).map(p => `<span class="h-7 w-7 rounded-full ${a.soft} border border-ink-950 grid place-items-center text-[9px] font-bold ${a.text}">${esc((p.name[0] || '?').toUpperCase())}</span>`).join('')}
      ${squad.length > 4 ? `<span class="h-7 w-7 rounded-full bg-white/8 border border-ink-950 grid place-items-center text-[9px] font-bold text-slate-400">+${squad.length - 4}</span>` : ''}
    </div>
    <svg viewBox="0 0 24 24" class="h-4 w-4 text-slate-600" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>
  </a>`;
}

/** Create / edit sheet. Shared with team-detail. */
export async function teamForm(team, ctx) {
  const editing = !!team;
  const cur = team || { name: '', short: '', accent: 'emerald' };
  const v = await sheet(`
    <h3 class="text-lg font-bold text-white mb-4">${editing ? 'Edit team' : 'New team'}</h3>
    <label class="label">Team name</label>
    <input id="tName" class="field" value="${esc(cur.name)}" placeholder="e.g. Mumbai Mavericks" autocomplete="off" maxlength="40">
    <label class="label mt-4">Short code <span class="normal-case text-slate-600">(2–4 letters, shown on scorecards)</span></label>
    <input id="tShort" class="field uppercase" value="${esc(cur.short)}" placeholder="MUM" maxlength="4" autocomplete="off">
    <label class="label mt-4">Colour</label>
    <div class="grid grid-cols-6 gap-2" id="tAcc">
      ${ACCENTS.map(a => `<button type="button" data-acc="${a.key}"
        class="h-10 rounded-xl border-2 ${a.dot} ${a.key === cur.accent ? 'border-white scale-105' : 'border-transparent opacity-60'} transition-all active:scale-95"></button>`).join('')}
    </div>
    <div class="mt-6 grid grid-cols-2 gap-3">
      <button class="btn-ghost" data-close="__dismiss">Cancel</button>
      <button class="btn-primary" id="tSave">${editing ? 'Save' : 'Create team'}</button>
    </div>`, { grab: false });

  if (v !== 'saved') return null;
  return window.__teamResult || null;
}

/* Wire up the sheet's internals once, using delegation on the sheet host. */
document.addEventListener('click', e => {
  const acc = e.target.closest('[data-acc]');
  if (acc) {
    acc.parentElement.querySelectorAll('[data-acc]').forEach(b => {
      b.classList.remove('border-white', 'scale-105');
      b.classList.add('border-transparent', 'opacity-60');
    });
    acc.classList.add('border-white', 'scale-105');
    acc.classList.remove('border-transparent', 'opacity-60');
    return;
  }
  if (e.target.closest('#tSave')) {
    const name = document.querySelector('#tName')?.value.trim();
    const short = document.querySelector('#tShort')?.value.trim();
    const accKey = document.querySelector('#tAcc [data-acc].border-white')?.dataset.acc || 'emerald';
    if (!name) { toast('Give the team a name', 'warn'); return; }
    window.__teamResult = { name, short: (short || name).slice(0, 4).toUpperCase(), accent: accKey };
    closeSheet('saved');
  }
});
