/* Tournaments — list and create. */

import { esc, uid, sheet, closeSheet, toast, sortBy } from '../util.js';
import * as store from '../store.js';
import { empty, ICON, teamName } from '../ui.js';
import { buildFixtures } from '../fixtures.js';
import { pointsTable } from '../stats.js';

export default {
  nav: 'cups',
  title: 'Tournaments',
  sub: () => `${store.tournaments().length} saved`,
  actions: () => `<button data-act="new" class="btn-primary !px-3 !py-2 text-xs">${ICON.plus}New</button>`,

  render() {
    const list = sortBy(store.tournaments(), '-createdAt');
    if (!list.length) {
      return empty('🏆', 'No tournaments yet',
        'Pick your teams and the app builds the fixture list, keeps the points table and works out net run rate for you.',
        `<button data-act="new" class="btn-primary">Create a tournament</button>`);
    }
    return `<div class="grid gap-3">${list.map(card).join('')}</div>
      <button data-act="new" class="mt-4 w-full rounded-2xl border border-dashed border-white/15 py-4 text-sm font-semibold text-slate-400 hover:text-emerald-300 hover:border-emerald-400/40 transition active:scale-[.98]">
        + New tournament</button>`;
  },

  mount(root, ctx) {
    const open = () => createFlow(ctx);
    root.querySelectorAll('[data-act="new"]').forEach(b => b.addEventListener('click', open));
    document.querySelector('#pageActions [data-act="new"]')?.addEventListener('click', open);
  }
};

function card(t) {
  const ms = store.matches().filter(m => m.tournamentId === t.id);
  const played = ms.filter(m => m.status === 'completed').length;
  const total = (t.fixtures || []).length;
  const pct = total ? Math.round((played / total) * 100) : 0;
  const table = pointsTable(t, store.matches());
  const leader = table[0];
  const FMT = { league: 'League', knockout: 'Knockout', groups: 'Groups + knockout', custom: 'Custom schedule' }[t.format] || t.format;

  return `<a href="#/tournament/${t.id}" class="card-h p-4 block animate-slide-up">
    <div class="flex items-start gap-3">
      <span class="h-11 w-11 shrink-0 rounded-xl bg-gradient-to-br from-amber-400/25 to-amber-600/10 border border-amber-500/25 grid place-items-center text-xl">🏆</span>
      <div class="flex-1 min-w-0">
        <p class="font-bold text-white truncate">${esc(t.name)}</p>
        <p class="text-[11px] text-slate-500">${FMT} · ${t.teamIds.length} teams · ${t.overs} ov</p>
      </div>
      <span class="pill ${played === total && total ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/8 text-slate-400'}">
        ${played === total && total ? 'Finished' : `${played}/${total}`}</span>
    </div>
    <div class="mt-3 h-1.5 rounded-full bg-white/8 overflow-hidden">
      <div class="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-400 transition-all duration-700" style="width:${pct}%"></div>
    </div>
    ${leader && leader.p ? `<p class="mt-2.5 text-[11px] text-slate-400">
      🥇 <b class="text-white">${esc(teamName(leader.teamId))}</b> lead with ${leader.pts} pts
      <span class="text-slate-600">· NRR ${leader.nrr >= 0 ? '+' : ''}${leader.nrr.toFixed(3)}</span></p>` : ''}
  </a>`;
}

/* ------------------------------------------------------------------ */

async function createFlow(ctx) {
  const teams = sortBy(store.teams(), 'name');
  if (teams.length < 2) {
    toast('Create at least two teams first', 'warn');
    ctx.go('/teams');
    return;
  }

  const s = store.settings();
  const v = await sheet(`
    <h3 class="text-lg font-bold text-white mb-4">New tournament</h3>

    <label class="label">Name</label>
    <input id="tuName" class="field" placeholder="e.g. Sunday Premier League" maxlength="44" autocomplete="off">

    <label class="label mt-4">Format</label>
    <div class="grid grid-cols-2 gap-2" id="tuFmt">
      ${[['league', 'League', 'Everyone plays everyone'],
         ['knockout', 'Knockout', 'Single elimination'],
         ['groups', 'Groups', 'Pools, then a bracket'],
         ['custom', 'Custom', 'Empty schedule — you build every fixture']].map(([v2, l, d], i) =>
        `<button type="button" data-fmt="${v2}" class="rounded-xl border px-2 py-2.5 text-center transition ${i === 0
          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'bg-white/5 border-white/10 text-slate-400'}">
          <span class="block text-xs font-bold">${l}</span>
          <span class="block text-[9px] opacity-70 leading-tight mt-0.5">${d}</span></button>`).join('')}
    </div>

    <label class="label mt-4">Teams <span class="normal-case text-slate-600">(tap to include)</span></label>
    <div class="grid grid-cols-2 gap-1.5 max-h-52 overflow-y-auto no-scrollbar" id="tuTeams">
      ${teams.map(t => `<button type="button" data-tt="${t.id}"
        class="flex items-center gap-2 rounded-lg border bg-white/[.03] border-white/8 px-2 py-2 text-left transition">
        <span class="h-6 w-6 grid place-items-center rounded-md bg-white/8 text-[9px] font-bold text-slate-300">${esc(t.short)}</span>
        <span class="flex-1 min-w-0 text-[11px] font-semibold text-slate-400 truncate">${esc(t.name)}</span>
        <span class="tick text-emerald-400 opacity-0 text-xs">✓</span></button>`).join('')}
    </div>

    <div class="grid grid-cols-2 gap-3 mt-4">
      <div><label class="label" for="tuOvers">Overs</label>
        <input id="tuOvers" type="number" min="1" max="90" value="${s.defaultOvers}" class="field num"></div>
      <div><label class="label" for="tuPps">Players / side</label>
        <input id="tuPps" type="number" min="2" max="15" value="${s.defaultPlayers}" class="field num"></div>
    </div>

    <label class="flex items-center gap-2.5 mt-4 cursor-pointer">
      <input id="tuDouble" type="checkbox" class="h-4 w-4 rounded accent-emerald-500">
      <span class="text-xs text-slate-300">Home and away <span class="text-slate-600">(each pair plays twice)</span></span>
    </label>

    <div class="mt-6 grid grid-cols-2 gap-3">
      <button class="btn-ghost" data-close="__dismiss">Cancel</button>
      <button class="btn-primary" id="tuSave">Create &amp; build fixtures</button>
    </div>`, { grab: false });

  if (v !== 'saved') return;
  const cfg = window.__tourResult;
  if (!cfg) return;

  const t = {
    id: uid('tr'),
    name: cfg.name,
    format: cfg.format,
    teamIds: cfg.teamIds,
    overs: cfg.overs,
    playersPerSide: cfg.playersPerSide,
    doubleRound: cfg.doubleRound,
    points: { win: 2, tie: 1, noResult: 1, loss: 0 },
    groups: cfg.format === 'groups' ? autoGroups(cfg.teamIds) : [],
    fixtures: [],
    createdAt: Date.now()
  };
  t.fixtures = buildFixtures(t);
  store.addTournament(t);
  toast(t.format === 'custom'
    ? 'Empty schedule — add fixtures as you like'
    : `${t.fixtures.length} fixtures scheduled`, 'ok');
  ctx.go('/tournament/' + t.id);
}

/** Split teams into two balanced pools for the "groups" format. */
function autoGroups(ids) {
  const n = ids.length;
  const perGroup = Math.ceil(n / 2);
  return [
    { name: 'A', teamIds: ids.slice(0, perGroup) },
    { name: 'B', teamIds: ids.slice(perGroup) }
  ].filter(g => g.teamIds.length);
}

/* sheet internals */
document.addEventListener('click', e => {
  const f = e.target.closest('#tuFmt [data-fmt]');
  if (f) {
    f.parentElement.querySelectorAll('[data-fmt]').forEach(b =>
      b.className = b.className.replace('bg-emerald-500/15 border-emerald-500/40 text-emerald-300', 'bg-white/5 border-white/10 text-slate-400'));
    f.className = f.className.replace('bg-white/5 border-white/10 text-slate-400', 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300');
    return;
  }
  const tt = e.target.closest('#tuTeams [data-tt]');
  if (tt) {
    const on = tt.classList.toggle('picked');
    tt.classList.toggle('bg-emerald-500/12', on);
    tt.classList.toggle('border-emerald-500/35', on);
    tt.querySelector('.tick').classList.toggle('opacity-0', !on);
    tt.querySelector('span:nth-child(2)').classList.toggle('text-white', on);
    return;
  }
  if (e.target.closest('#tuSave')) {
    const name = document.querySelector('#tuName')?.value.trim();
    const picked = [...document.querySelectorAll('#tuTeams .picked')].map(b => b.dataset.tt);
    if (!name) return toast('Give the tournament a name', 'warn');
    if (picked.length < 2) return toast('Pick at least two teams', 'warn');
    window.__tourResult = {
      name,
      format: document.querySelector('#tuFmt [data-fmt].text-emerald-300')?.dataset.fmt || 'league',
      teamIds: picked,
      overs: Math.max(1, Math.min(90, +document.querySelector('#tuOvers').value || 20)),
      playersPerSide: Math.max(2, Math.min(15, +document.querySelector('#tuPps').value || 11)),
      doubleRound: !!document.querySelector('#tuDouble')?.checked
    };
    closeSheet('saved');
  }
});
