/* Quick match — from "we're at the ground" to scoring in under a minute.
 *
 * Turf cricket is ad-hoc: whoever turns up gets split on the spot. The normal
 * wizard wants two saved teams with squads first, which is five minutes of
 * typing while everyone waits. This asks for names and nothing else.
 */

import { esc, toast, initials, fixed } from '../util.js';
import * as store from '../store.js';
import { empty } from '../ui.js';
import { newMatch, defaultMaxOversPerBowler } from '../engine.js';
import { balance, parseNames } from '../balance.js';

const PRESETS = [6, 8, 10, 12, 15, 20];

let d = null;
function fresh() {
  const s = store.settings();
  return {
    mode: 'split',                 // 'split' = one list, app makes the sides
    pool: '', nameA: 'Team A', nameB: 'Team B',
    listA: '', listB: '',
    overs: Math.min(s.defaultOvers, 10),
    batsFirst: 'A',
    shuffle: 0,
    noLbw: true,            // turf default — there is no umpire
    retireAt: 0,
    zones: [],
    split: null                    // the result of the last balance
  };
}

export default {
  nav: 'new',
  back: true,
  title: 'Quick match',
  sub: 'No setup — just names',

  render() {
    if (!d) d = fresh();
    return `
      <div class="card p-1.5 flex gap-1.5 mb-4">
        ${[['split', 'One list', 'we’ll split it'], ['manual', 'Two lists', 'you pick sides']]
          .map(([k, l, h]) => `<button data-mode="${k}" class="flex-1 rounded-xl px-3 py-2.5 text-center transition ${
            d.mode === k ? 'bg-emerald-500 text-onaccent' : 'text-slate-400 hover:text-slate-200'}">
            <span class="block text-xs font-bold">${l}</span>
            <span class="block text-[10px] opacity-70">${h}</span></button>`).join('')}
      </div>

      ${d.mode === 'split' ? splitPane() : manualPane()}

      <div class="card p-4 mt-4">
        <p class="label">Overs each</p>
        <div class="flex flex-wrap gap-2">
          ${PRESETS.map(o => `<button data-overs="${o}" class="btn-chip ${d.overs === o ? '!bg-emerald-500 !text-onaccent !border-emerald-400' : ''}">${o}</button>`).join('')}
          <input id="qOvers" type="number" min="1" max="50" value="${d.overs}" class="w-16 rounded-full bg-white/5 border border-white/10 px-3 py-1.5 text-xs text-center num" aria-label="Overs">
        </div>
      </div>

      <div class="card p-4 mt-4">
        <p class="label">Turf rules</p>
        <button data-act="nolbw" class="w-full flex items-center gap-3 rounded-xl bg-white/[.04] border border-white/10 px-3 py-2.5 text-left transition active:scale-[.99]">
          <span class="flex-1"><span class="block text-sm font-semibold text-white">No LBW</span>
          <span class="block text-[11px] text-slate-500">There is no umpire</span></span>
          <span class="shrink-0 h-6 w-10 rounded-full p-0.5 transition-colors ${d.noLbw ? 'bg-emerald-500' : 'bg-white/15'}">
            <span class="block h-5 w-5 rounded-full bg-pure shadow transition-transform ${d.noLbw ? 'translate-x-4' : ''}"></span></span>
        </button>
        <p class="label mt-4">Fixed-run zones</p>
        <p class="text-[11px] text-slate-500 leading-snug mb-2">A marked area worth set runs, with no change of strike.</p>
        <div class="flex flex-wrap gap-2">
          ${[0, 1, 2, 3].map(n => `<button data-zn="${n}" class="btn-chip ${(d.zones.length) === n ? '!bg-emerald-500 !text-onaccent !border-emerald-400' : ''}">${n === 0 ? 'None' : n + (n === 1 ? ' zone' : ' zones')}</button>`).join('')}
        </div>
        ${d.zones.length ? `<div class="grid gap-2 mt-2">
          ${d.zones.map((z, i) => `<div class="flex items-center gap-2">
            <input data-qzname="${i}" class="field !py-2 text-sm flex-1" value="${esc(z.label)}" placeholder="Zone name" maxlength="18">
            <input data-qzruns="${i}" type="number" min="1" max="12" value="${z.runs}" class="field !py-2 w-16 text-center num">
          </div>`).join('')}</div>` : ''}

        <p class="label mt-4">Retire on</p>
        <div class="flex flex-wrap gap-2">
          ${[0, 25, 30, 50].map(n => `<button data-retire="${n}" class="btn-chip ${d.retireAt === n ? '!bg-emerald-500 !text-onaccent !border-emerald-400' : ''}">${n === 0 ? 'Off' : n}</button>`).join('')}
        </div>
        <p class="mt-2 text-[11px] text-slate-500">${d.retireAt ? `Everyone gets a bat — you will be asked to retire on ${d.retireAt}.` : 'Batters carry on until they are out.'}</p>
      </div>

      <div class="card p-4 mt-4">
        <p class="label">Who bats first?</p>
        <div class="grid grid-cols-3 gap-2">
          ${[['A', d.nameA], ['B', d.nameB]].map(([k, n]) => `<button data-bf="${k}"
            class="rounded-xl border px-2 py-2.5 text-xs font-bold truncate transition active:scale-95 ${
              d.batsFirst === k ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'bg-white/5 border-white/10 text-slate-400'}">${esc(n)}</button>`).join('')}
          <button data-bf="flip" class="rounded-xl border bg-white/5 border-white/10 px-2 py-2.5 text-xs font-bold text-slate-400 active:scale-95 transition">🪙 Flip</button>
        </div>
      </div>

      <button data-act="start" class="btn-primary w-full mt-5 !py-3.5">Start scoring 🏏</button>
      <p class="mt-3 text-center text-[11px] text-slate-600 leading-relaxed">
        Teams and players are saved, so career stats build up.<br>
        Reuse a team name next week and it carries on.</p>`;
  },

  mount(root, ctx) {
    const rr = () => ctx.render();

    root.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
      d.mode = b.dataset.mode; d.split = null; rr();
    }));
    root.querySelectorAll('[data-overs]').forEach(b => b.addEventListener('click', () => {
      d.overs = +b.dataset.overs; rr();
    }));
    root.querySelector('#qOvers')?.addEventListener('change', e => {
      d.overs = Math.max(1, Math.min(50, +e.target.value || 6)); rr();
    });

    const bind = (sel, key) => root.querySelector(sel)?.addEventListener('input', e => { d[key] = e.target.value; });
    bind('#qPool', 'pool'); bind('#qA', 'listA'); bind('#qB', 'listB');
    bind('#qNameA', 'nameA'); bind('#qNameB', 'nameB');

    root.querySelector('#qPool')?.addEventListener('input', e => {
      d.pool = e.target.value;
      const n = parseNames(d.pool).length;
      const el = root.querySelector('#qCount');
      if (el) el.textContent = n ? `${n} player${n === 1 ? '' : 's'}` : '';
    });

    root.querySelector('[data-act="split"]')?.addEventListener('click', () => doSplit(ctx));
    root.querySelector('[data-act="reshuffle"]')?.addEventListener('click', () => { d.shuffle++; doSplit(ctx, true); });
    root.querySelector('[data-act="nolbw"]')?.addEventListener('click', () => { d.noLbw = !d.noLbw; rr(); });
    root.querySelectorAll('[data-zn]').forEach(b => b.addEventListener('click', () => {
      const n = +b.dataset.zn;
      d.zones = Array.from({ length: n }, (_, i) => d.zones[i] || { label: `Zone ${i + 1}`, runs: i + 1 });
      rr();
    }));
    root.querySelectorAll('[data-qzname]').forEach(i => i.addEventListener('input', e => {
      d.zones[+i.dataset.qzname].label = e.target.value;
    }));
    root.querySelectorAll('[data-qzruns]').forEach(i => i.addEventListener('change', e => {
      d.zones[+i.dataset.qzruns].runs = Math.max(1, Math.min(12, +e.target.value || 1)); rr();
    }));
    root.querySelectorAll('[data-retire]').forEach(b => b.addEventListener('click', () => {
      d.retireAt = +b.dataset.retire; rr();
    }));
    root.querySelectorAll('[data-bf]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.bf === 'flip') {
        d.batsFirst = Math.random() < 0.5 ? 'A' : 'B';
        toast(`${d.batsFirst === 'A' ? d.nameA : d.nameB} bat first`, 'ok');
      } else d.batsFirst = b.dataset.bf;
      rr();
    }));
    root.querySelector('[data-act="start"]')?.addEventListener('click', () => start(ctx));
    root.querySelectorAll('[data-swap]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.swap;
      const from = d.split.teamA.includes(id) ? 'teamA' : 'teamB';
      const to = from === 'teamA' ? 'teamB' : 'teamA';
      d.split[from] = d.split[from].filter(x => x !== id);
      d.split[to].push(id);
      rr();
    }));
  }
};

/* ------------------------------------------------------------------ */

function splitPane() {
  if (d.split) return splitResult();
  const n = parseNames(d.pool).length;
  return `<div class="card p-4">
    <div class="flex items-end justify-between">
      <p class="label !mb-0">Who turned up?</p>
      <span id="qCount" class="text-[11px] font-semibold text-emerald-400">${n ? `${n} player${n === 1 ? '' : 's'}` : ''}</span>
    </div>
    <textarea id="qPool" rows="8" class="field mt-1.5 font-mono text-xs leading-relaxed"
      placeholder="One name per line — paste the WhatsApp list if you like&#10;&#10;Rohit&#10;Virat&#10;Bumrah&#10;Jadeja">${esc(d.pool)}</textarea>
    <p class="mt-2 text-[11px] text-slate-500 leading-snug">Numbering like “1.” is stripped and repeats are dropped.</p>
    <button data-act="split" class="btn-primary w-full mt-3">Split into two sides</button>
  </div>`;
}

function splitResult() {
  const { teamA, teamB, gapPct, knownCount } = d.split;
  const side = (label, ids, nameKey, other) => `
    <div class="card p-4">
      <input id="${nameKey === 'nameA' ? 'qNameA' : 'qNameB'}" class="field !py-2 text-sm font-bold mb-3"
        value="${esc(d[nameKey])}" maxlength="24" aria-label="${label} name">
      <div class="grid gap-1.5">
        ${ids.map(id => `<div class="flex items-center gap-2.5 rounded-lg bg-white/[.04] px-2.5 py-2">
          <span class="h-7 w-7 shrink-0 grid place-items-center rounded-full bg-white/8 text-[10px] font-bold text-slate-300">${esc(initials(store.playerName(id)))}</span>
          <span class="flex-1 min-w-0 text-xs font-semibold text-white truncate">${esc(store.playerName(id))}</span>
          <button data-swap="${id}" class="h-6 w-6 rounded-md bg-white/5 text-slate-500 hover:text-emerald-300 grid place-items-center text-[11px] active:scale-90 transition" title="Move to ${esc(other)}">⇄</button>
        </div>`).join('')}
      </div>
      <p class="mt-2 text-[10px] text-slate-600">${ids.length} player${ids.length === 1 ? '' : 's'}</p>
    </div>`;

  return `
    <div class="rounded-xl ${gapPct < 12 ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-amber-500/10 border-amber-500/25'} border px-3 py-2.5 mb-3">
      <p class="text-[11px] ${gapPct < 12 ? 'text-emerald-200' : 'text-amber-200'} leading-snug">
        ${knownCount === 0
          ? 'Nobody has played before, so the sides are split evenly by number. They will get smarter as you score matches.'
          : `Sides are within <b>${fixed(gapPct, 0)}%</b> of each other on past form (${knownCount} of ${d.split.teamA.length + d.split.teamB.length} have history).`}
      </p>
    </div>
    <div class="grid gap-3">
      ${side('Team A', d.split.teamA, 'nameA', d.nameB)}
      ${side('Team B', d.split.teamB, 'nameB', d.nameA)}
    </div>
    <div class="grid grid-cols-2 gap-3 mt-3">
      <button data-act="reshuffle" class="btn-ghost text-xs">🔀 Shuffle again</button>
      <button data-mode="split" class="btn-ghost text-xs">← Edit the list</button>
    </div>`;
}

function manualPane() {
  const pane = (nameKey, listKey, inputId, nameId) => {
    const n = parseNames(d[listKey]).length;
    return `<div class="card p-4">
      <input id="${nameId}" class="field !py-2 text-sm font-bold" value="${esc(d[nameKey])}" maxlength="24" aria-label="Team name">
      <div class="flex items-end justify-between mt-3">
        <p class="label !mb-0">Players</p>
        <span class="text-[11px] font-semibold ${n < 2 ? 'text-rose-400' : 'text-emerald-400'}">${n}</span>
      </div>
      <textarea id="${inputId}" rows="6" class="field mt-1.5 font-mono text-xs leading-relaxed"
        placeholder="One name per line">${esc(d[listKey])}</textarea>
    </div>`;
  };
  return `<div class="grid gap-3">
    ${pane('nameA', 'listA', 'qA', 'qNameA')}
    ${pane('nameB', 'listB', 'qB', 'qNameB')}
  </div>`;
}

/* ------------------------------------------------------------------ */

function doSplit(ctx, keepPool = false) {
  const names = parseNames(d.pool);
  if (names.length < 4) return toast('Enter at least four names', 'warn');

  // Players must exist before they can be rated, so create them up front in a
  // holding team, then move them once the sides are known.
  const pool = store.findOrCreateTeam('Turf pool');
  const ids = names.map(n => store.linkPlayer(pool.id, n).id);

  d.split = balance(ids, store.matches(), d.shuffle);
  d.poolTeamId = pool.id;
  if (!keepPool) d.shuffle = 0;
  ctx.render();
}

function start(ctx) {
  let namesA, namesB;

  if (d.mode === 'split') {
    if (!d.split) return toast('Split the list into sides first', 'warn');
    namesA = d.split.teamA.map(id => store.playerName(id));
    namesB = d.split.teamB.map(id => store.playerName(id));
  } else {
    namesA = parseNames(d.listA);
    namesB = parseNames(d.listB);
  }

  if (namesA.length < 2 || namesB.length < 2) return toast('Each side needs at least two players', 'warn');
  const nameA = (d.nameA || 'Team A').trim() || 'Team A';
  const nameB = (d.nameB || 'Team B').trim() || 'Team B';
  if (nameA.toLowerCase() === nameB.toLowerCase()) return toast('Give the two sides different names', 'warn');

  const teamA = store.findOrCreateTeam(nameA, 'emerald');
  const teamB = store.findOrCreateTeam(nameB, 'rose');
  const xiA = namesA.map(n => store.linkPlayer(teamA.id, n).id);
  const xiB = namesB.map(n => store.linkPlayer(teamB.id, n).id);

  // The holding team has done its job; drop it if nothing else uses it.
  if (d.poolTeamId && d.poolTeamId !== teamA.id && d.poolTeamId !== teamB.id) {
    const used = store.matches().some(m => m.teams.includes(d.poolTeamId));
    if (!used) store.deleteTeam(d.poolTeamId);
  }

  const overs = d.overs;
  const m = newMatch({
    teamA: teamA.id, teamB: teamB.id,
    overs,
    playersPerSide: Math.max(xiA.length, xiB.length),
    maxOversPerBowler: defaultMaxOversPerBowler(overs),
    xi: { [teamA.id]: xiA, [teamB.id]: xiB },
    toss: { winnerId: d.batsFirst === 'A' ? teamA.id : teamB.id, decision: 'bat' },
    stage: 'Turf',
    rules: {
      noLbw: d.noLbw, retireAt: d.retireAt, zones: d.zones,
      extraBats: Math.abs(xiA.length - xiB.length) >= 2 ? 1 : 0
    }
  });
  store.addMatch(m);
  d = null;
  ctx.go('/score/' + m.id, true);
}
