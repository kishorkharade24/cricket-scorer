/* Teams — list and create. */

import { esc, sheet, closeSheet, toast, ACCENTS, accent, sortBy } from '../util.js';
import * as store from '../store.js';
import { empty, badge, ICON } from '../ui.js';

export default {
  nav: 'home',
  title: 'Teams',
  back: '/',
  sub: () => `${store.teams().length} teams, ${store.players().length} players`,
  actions: () => `<button data-act="add" class="btn-primary !px-3 !py-2 text-xs">${ICON.plus}<span class="hidden xs:inline">Team</span></button>`,

  render() {
    const teams = sortBy(store.teams(), 'name');
    if (!teams.length) {
      return empty(ICON.people, 'No teams yet', 'A team needs a name and a squad. You can add players now or while setting up a match.',
        `<button data-act="add" class="btn-primary">Create a team</button>`);
    }
    return `<div class="grid gap-3">${teams.map(row).join('')}</div>
      <button data-act="add" class="mt-4 w-full rounded-xl border border-dashed border-rule py-4 text-sm font-semibold text-muted hover:text-fg hover:border-action transition active:scale-[.98]">
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
      <p class="font-bold text-fg truncate">${esc(t.name)}</p>
      <p class="text-[11px] text-muted">${squad.length} player${squad.length === 1 ? '' : 's'}${squad.length < 2 ? ', needs more' : ''}</p>
    </div>
    <div class="flex -space-x-2">
      ${squad.slice(0, 4).map(p => `<span class="${a.cls} tm tm-soft h-7 w-7 rounded-full border border-ground grid place-items-center text-[9px] font-semibold">${esc((p.name[0] || '?').toUpperCase())}</span>`).join('')}
      ${squad.length > 4 ? `<span class="h-7 w-7 rounded-full bg-plate border border-ground grid place-items-center text-[9px] font-bold text-muted">+${squad.length - 4}</span>` : ''}
    </div>
    <span class="text-faint">${ICON.chevron}</span>
  </a>`;
}

/** Create / edit sheet. Shared with team-detail. */
export async function teamForm(team, ctx) {
  const editing = !!team;
  const cur = team || { name: '', short: '', accent: 'navy' };
  const v = await sheet(`
    <h3 class="text-lg font-bold text-fg mb-4">${editing ? 'Edit team' : 'New team'}</h3>
    <label class="label">Team name</label>
    <input id="tName" class="field" value="${esc(cur.name)}" placeholder="e.g. Mumbai Mavericks" autocomplete="off" maxlength="40">
    <label class="label mt-4">Short code <span class="font-normal text-faint">(2–4 letters, shown on scorecards)</span></label>
    <input id="tShort" class="field uppercase" value="${esc(cur.short)}" placeholder="MUM" maxlength="4" autocomplete="off">
    <label class="label mt-4">Colour</label>
    <div class="grid grid-cols-4 gap-2" id="tAcc">
      ${ACCENTS.map(a => `<button type="button" data-acc="${a.key}" aria-label="${esc(a.label)}" title="${esc(a.label)}"
        class="${a.cls} tm-dot h-10 rounded-lg border-2 ${a.key === cur.accent ? 'border-fg' : 'border-transparent opacity-55'} transition-all"></button>`).join('')}
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
      b.classList.remove('border-fg');
      b.classList.add('border-transparent', 'opacity-55');
    });
    acc.classList.add('border-fg');
    acc.classList.remove('border-transparent', 'opacity-55');
    return;
  }
  if (e.target.closest('#tSave')) {
    const name = document.querySelector('#tName')?.value.trim();
    const short = document.querySelector('#tShort')?.value.trim();
    const accKey = document.querySelector('#tAcc [data-acc].border-fg')?.dataset.acc || 'navy';
    if (!name) { toast('Give the team a name', 'warn'); return; }
    window.__teamResult = { name, short: (short || name).slice(0, 4).toUpperCase(), accent: accKey };
    closeSheet('saved');
  }
});
