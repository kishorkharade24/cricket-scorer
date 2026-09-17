/* Team detail — squad list, add/edit players, batting order. */

import { esc, sheet, closeSheet, toast, confirmDlg, initials, accent } from '../util.js';
import * as store from '../store.js';
import { badge, empty, ICON, iconBtn } from '../ui.js';
import { teamForm } from './teams.js';
import { aggregate } from '../stats.js';

const ROLES = ['Batter', 'Bowler', 'All-rounder', 'Wicket-keeper'];
const BAT = ['RHB', 'LHB'];
const BOWL = ['', 'Right-arm fast', 'Right-arm medium', 'Right-arm off-spin', 'Right-arm leg-spin',
              'Left-arm fast', 'Left-arm medium', 'Left-arm orthodox', 'Left-arm chinaman'];

export default {
  nav: 'home',
  back: '/teams',
  title: ctx => store.team(ctx.id)?.name || 'Team',
  sub: ctx => `${store.players(ctx.id).length} players in the squad`,
  actions: ctx => `${iconBtn('edit', ICON.edit, 'Edit team')}${iconBtn('del', ICON.trash, 'Delete team', 'hover:text-wicket')}`,

  render(ctx) {
    const t = store.team(ctx.id);
    if (!t) return empty(ICON.question, 'Team not found', 'It may have been deleted.', `<a href="#/teams" class="btn-ghost">Back to teams</a>`);

    const squad = store.players(t.id);
    const agg = aggregate(store.matches());
    const a = accent(t.accent);

    return `
      <div class="card ${a.cls} tm-edge p-5 mb-5 border-l-4">
        <div class="flex items-center gap-4">
          ${badge(t.id, 'lg')}
          <div class="min-w-0">
            <h2 class="display text-2xl font-extrabold text-fg truncate">${esc(t.name)}</h2>
            <p class="text-xs text-muted">${squad.length} players, played ${store.matches().filter(m => m.teams.includes(t.id)).length} matches</p>
          </div>
        </div>
      </div>

      <div class="flex items-end justify-between mb-2.5">
        <h2 class="section-label">Squad</h2>
        <p class="text-[11px] text-faint">The arrows set the batting order</p>
      </div>

      ${squad.length ? `<div class="grid gap-2" id="squad">${squad.map((p, i) => playerRow(p, i, agg.get(p.id))).join('')}</div>`
        : empty(ICON.people, 'No players yet', 'Add at least two players so this team can take the field.')}

      <button data-act="addp" class="mt-3 w-full rounded-xl border border-dashed border-rule py-3.5 text-sm font-semibold text-muted hover:text-fg hover:border-action transition active:scale-[.98]">
        + Add player</button>

      <div class="mt-4 flex gap-2">
        <button data-act="bulk" class="btn-ghost flex-1 text-xs">Paste a list of names</button>
      </div>`;
  },

  mount(root, ctx) {
    const t = store.team(ctx.id);
    if (!t) return;

    root.querySelector('[data-act="addp"]')?.addEventListener('click', async () => {
      const d = await playerForm(null);
      if (!d) return;
      store.addPlayer(t.id, d);
      toast(`${d.name} added`, 'ok');
      ctx.render();
    });

    root.querySelector('[data-act="bulk"]')?.addEventListener('click', () => bulkAdd(t.id, ctx));

    root.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', async () => {
      const p = store.player(b.dataset.edit);
      const d = await playerForm(p);
      if (!d) return;
      store.updatePlayer(p.id, d);
      ctx.render();
    }));

    root.querySelectorAll('[data-delp]').forEach(b => b.addEventListener('click', async () => {
      const p = store.player(b.dataset.delp);
      if (!await confirmDlg(`Remove ${p.name}?`, 'Their past scorecards stay intact, but they will no longer appear in this squad.', 'Remove')) return;
      store.deletePlayer(p.id);
      ctx.render();
    }));

    root.querySelectorAll('[data-move]').forEach(b => b.addEventListener('click', () => {
      const [id, dir] = b.dataset.move.split(':');
      const arr = t.players;
      const i = arr.indexOf(id);
      const j = dir === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      store.save();
      ctx.render();
    }));

    document.querySelector('#pageActions [data-act="edit"]')?.addEventListener('click', async () => {
      const d = await teamForm(t, ctx);
      if (!d) return;
      store.updateTeam(t.id, d);
      ctx.render();
    });

    document.querySelector('#pageActions [data-act="del"]')?.addEventListener('click', async () => {
      const used = store.matches().some(m => m.teams.includes(t.id));
      if (!await confirmDlg(`Delete ${t.name}?`,
        used ? 'This team appears in saved matches. Those scorecards will lose the team name.' : 'The squad will be deleted too.', 'Delete')) return;
      store.deleteTeam(t.id);
      toast('Team deleted', 'ok');
      ctx.go('/teams');
    });
  }
};

function playerRow(p, i, a) {
  const line = a && (a.runs || a.wkts || a.mat)
    ? [a.runs ? `${a.runs} run${a.runs === 1 ? '' : 's'}` : null,
       a.wkts ? `${a.wkts} wicket${a.wkts === 1 ? '' : 's'}` : null,
       `${a.mat} match${a.mat === 1 ? '' : 'es'}`].filter(Boolean).join(', ')
    : (p.bowlStyle || p.role);
  return `<div class="card p-3 flex items-center gap-3 animate-fade-in" style="animation-delay:${i * 18}ms">
    <span class="w-5 text-center text-[11px] font-bold text-faint num">${i + 1}</span>
    <span class="h-9 w-9 shrink-0 grid place-items-center rounded-full bg-plate border border-rule text-[11px] font-bold text-fg">${esc(initials(p.name))}</span>
    <div class="flex-1 min-w-0">
      <p class="text-sm font-semibold text-fg truncate">${esc(p.name)}
        ${p.role === 'Wicket-keeper' ? '<span class="ml-1 text-[9px] font-bold text-boundary">WK</span>' : ''}</p>
      <p class="text-[11px] text-muted truncate">${esc(line)}</p>
    </div>
    <div class="flex items-center gap-1">
      <button data-move="${p.id}:up" class="h-7 w-7 rounded-lg bg-plate text-muted hover:text-fg grid place-items-center text-xs active:scale-90 transition" aria-label="Move up">↑</button>
      <button data-move="${p.id}:down" class="h-7 w-7 rounded-lg bg-plate text-muted hover:text-fg grid place-items-center text-xs active:scale-90 transition" aria-label="Move down">↓</button>
      <button data-edit="${p.id}" class="h-7 w-7 rounded-lg bg-plate text-muted hover:text-fg grid place-items-center active:scale-90 transition" aria-label="Edit">${ICON.edit}</button>
      <button data-delp="${p.id}" class="h-7 w-7 rounded bg-plate text-muted hover:text-wicket grid place-items-center transition-colors" aria-label="Remove">${ICON.close}</button>
    </div>
  </div>`;
}

export async function playerForm(p) {
  const cur = p || { name: '', role: 'Batter', batStyle: 'RHB', bowlStyle: '' };
  const v = await sheet(`
    <h3 class="text-lg font-bold text-fg mb-4">${p ? 'Edit player' : 'Add player'}</h3>
    <label class="label">Name</label>
    <input id="pName" class="field" value="${esc(cur.name)}" placeholder="e.g. Rohit Sharma" autocomplete="off" maxlength="34">
    <label class="label mt-4">Role</label>
    <div class="grid grid-cols-2 gap-2" id="pRole">
      ${ROLES.map(r => `<button type="button" data-role="${r}"
        class="rounded-xl border px-3 py-2.5 text-xs font-bold transition ${r === cur.role
          ? 'bg-action/15 border-action text-fg' : 'bg-plate border-rule text-muted'}">${r}</button>`).join('')}
    </div>
    <label class="label mt-4">Batting hand</label>
    <div class="grid grid-cols-2 gap-2" id="pBat">
      ${BAT.map(b => `<button type="button" data-bat="${b}"
        class="rounded-xl border px-3 py-2.5 text-xs font-bold transition ${b === cur.batStyle
          ? 'bg-action/15 border-action text-fg' : 'bg-plate border-rule text-muted'}">${b === 'RHB' ? 'Right hand' : 'Left hand'}</button>`).join('')}
    </div>
    <label class="label mt-4">Bowling style <span class="font-normal text-faint">(optional)</span></label>
    <select id="pBowl" class="field">
      ${BOWL.map(b => `<option value="${esc(b)}" ${b === cur.bowlStyle ? 'selected' : ''}>${b || '— none —'}</option>`).join('')}
    </select>
    <div class="mt-6 grid grid-cols-2 gap-3">
      <button class="btn-ghost" data-close="__dismiss">Cancel</button>
      <button class="btn-primary" id="pSave">${p ? 'Save' : 'Add player'}</button>
    </div>`, { grab: false });
  if (v !== 'saved') return null;
  return window.__playerResult || null;
}

async function bulkAdd(teamId, ctx) {
  const v = await sheet(`
    <h3 class="text-lg font-bold text-fg mb-1">Paste a squad</h3>
    <p class="text-xs text-muted mb-3">One name per line. Add <span class="text-boundary font-semibold">*</span> after a name to mark the wicket-keeper.</p>
    <textarea id="bulkTa" rows="9" class="field font-mono text-xs leading-relaxed" placeholder="Rohit Sharma&#10;Shubman Gill&#10;Virat Kohli&#10;Rishabh Pant *"></textarea>
    <div class="mt-5 grid grid-cols-2 gap-3">
      <button class="btn-ghost" data-close="__dismiss">Cancel</button>
      <button class="btn-primary" id="bulkSave">Add players</button>
    </div>`, { grab: false });
  if (v !== 'saved') return;
  const lines = (window.__bulkVal || '').split('\n').map(s => s.trim()).filter(Boolean);
  let n = 0;
  for (const line of lines) {
    const wk = /\*\s*$/.test(line);
    const name = line.replace(/\*\s*$/, '').trim();
    if (!name) continue;
    store.addPlayer(teamId, { name, role: wk ? 'Wicket-keeper' : 'Batter', batStyle: 'RHB', bowlStyle: '' });
    n++;
  }
  toast(`${n} player${n === 1 ? '' : 's'} added`, 'ok');
  ctx.render();
}

/* sheet internals */
document.addEventListener('click', e => {
  const pick = (sel, attr) => {
    const b = e.target.closest(`[${attr}]`);
    if (!b || !b.closest(sel)) return false;
    b.parentElement.querySelectorAll(`[${attr}]`).forEach(x =>
      x.className = x.className.replace('bg-action/15 border-action text-fg', 'bg-plate border-rule text-muted'));
    b.className = b.className.replace('bg-plate border-rule text-muted', 'bg-action/15 border-action text-fg');
    return true;
  };
  if (pick('#pRole', 'data-role')) return;
  if (pick('#pBat', 'data-bat')) return;

  if (e.target.closest('#pSave')) {
    const name = document.querySelector('#pName')?.value.trim();
    if (!name) { toast('Enter a name', 'warn'); return; }
    window.__playerResult = {
      name,
      role: document.querySelector('#pRole [data-role].text-fg')?.dataset.role || 'Batter',
      batStyle: document.querySelector('#pBat [data-bat].text-fg')?.dataset.bat || 'RHB',
      bowlStyle: document.querySelector('#pBowl')?.value || ''
    };
    closeSheet('saved');
  }
  if (e.target.closest('#bulkSave')) {
    window.__bulkVal = document.querySelector('#bulkTa')?.value || '';
    closeSheet('saved');
  }
});
