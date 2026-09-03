/* New match wizard: format -> toss -> playing XI. Openers and the first
 * bowler are chosen on the scoring screen itself. */

import { esc, toast, initials, sortBy, sheet, closeSheet } from '../util.js';
import * as store from '../store.js';
import { badge, empty, teamName } from '../ui.js';
import { newMatch, defaultMaxOversPerBowler } from '../engine.js';
import { teamForm } from './teams.js';

const PRESETS = [
  { label: 'T20',  overs: 20 }, { label: 'ODI', overs: 50 },
  { label: 'T10',  overs: 10 }, { label: '15',  overs: 15 },
  { label: '8',    overs: 8  }, { label: '6',   overs: 6  }
];

let d = null;   // the draft being built
let key = '';

function fresh(ctx) {
  const s = store.settings();
  const t = ctx.query.t ? store.tournament(ctx.query.t) : null;
  const fx = t ? (t.fixtures || []).find(f => f.id === ctx.query.f) : null;
  return {
    step: 1,
    teamA: ctx.query.a || null,
    teamB: ctx.query.b || null,
    overs: t?.overs || s.defaultOvers,
    playersPerSide: t?.playersPerSide || s.defaultPlayers,
    maxOversPerBowler: null,
    venue: t?.venue || '',
    tournamentId: t?.id || null,
    fixtureId: fx?.id || null,
    stage: fx?.stage || 'Friendly',
    toss: { winnerId: null, decision: 'bat' },
    xi: {},
    rules: {
      widePenalty: 1, noBallPenalty: 1, freeHitOnNoBall: true, lastManStands: false,
      noLbw: false, retireAt: 0, extraBats: 0, everyoneBowls: false, zones: [],
      ...(t?.rules || {})          // a tournament's defaults carry into its fixtures
    }
  };
}

export default {
  nav: 'new',
  back: true,
  title: 'New match',
  sub: () => d ? `Step ${d.step} of 3` : '',

  render(ctx) {
    const k = JSON.stringify(ctx.query);
    if (!d || key !== k) { d = fresh(ctx); key = k; }

    const teams = sortBy(store.teams(), 'name');
    if (teams.length < 2) {
      return empty('👥', 'This route needs saved teams',
        'Set up two teams with squads, or skip all of it and start a quick match by typing names.',
        `<div class="flex flex-col gap-2 items-stretch">
           <a href="#/match/quick" class="btn-primary">⚡ Quick match instead</a>
           <a href="#/teams" class="btn-ghost">Set up teams</a>
         </div>`);
    }

    return `
      <div class="flex gap-1.5 mb-5">
        ${[1, 2, 3].map(i => `<div class="h-1 flex-1 rounded-full transition-all duration-300 ${i <= d.step ? 'bg-emerald-400' : 'bg-white/10'}"></div>`).join('')}
      </div>
      ${d.step === 1 ? step1(teams) : d.step === 2 ? step2() : step3()}`;
  },

  mount(root, ctx) {
    const rr = () => ctx.render();

    /* ---- step 1 ---- */
    root.querySelectorAll('[data-slot]').forEach(b => b.addEventListener('click', async () => {
      const key = b.dataset.slot;
      const id = await pickTeam(key === 'A' ? 'Team A' : 'Team B', key === 'A' ? d.teamA : d.teamB);
      if (!id) return;
      if (key === 'A') { if (d.teamB === id) d.teamB = d.teamA; d.teamA = id; }
      else { if (d.teamA === id) d.teamA = d.teamB; d.teamB = id; }
      rr();
    }));
    root.querySelector('[data-act="swap"]')?.addEventListener('click', () => {
      [d.teamA, d.teamB] = [d.teamB, d.teamA]; rr();
    });
    root.querySelector('[data-act="newteam"]')?.addEventListener('click', async () => {
      const t = await teamForm(null, ctx);
      if (!t) return;
      const created = store.addTeam(t);
      if (!d.teamA) d.teamA = created.id; else if (!d.teamB) d.teamB = created.id;
      toast('Team created — add players from the Teams screen', 'ok', 3800);
      rr();
    });
    root.querySelectorAll('[data-overs]').forEach(b => b.addEventListener('click', () => {
      d.overs = +b.dataset.overs; d.maxOversPerBowler = null; rr();
    }));
    root.querySelector('#oversCustom')?.addEventListener('change', e => {
      const v = Math.max(1, Math.min(90, +e.target.value || 1));
      d.overs = v; d.maxOversPerBowler = null; rr();
    });
    root.querySelector('#pps')?.addEventListener('change', e => {
      d.playersPerSide = Math.max(2, Math.min(15, +e.target.value || 11)); d.xi = {}; rr();
    });
    root.querySelector('#mopb')?.addEventListener('change', e => {
      d.maxOversPerBowler = Math.max(1, Math.min(d.overs, +e.target.value || 1));
    });
    root.querySelector('#venue')?.addEventListener('input', e => { d.venue = e.target.value; });

    root.querySelector('[data-zadd]')?.addEventListener('click', () => {
      d.rules.zones = [...(d.rules.zones || []), { label: '', runs: (d.rules.zones?.length || 0) + 1 }];
      rr();
    });
    root.querySelectorAll('[data-zdel]').forEach(b => b.addEventListener('click', () => {
      d.rules.zones.splice(+b.dataset.zdel, 1); rr();
    }));
    root.querySelectorAll('[data-zname]').forEach(i => i.addEventListener('input', e => {
      d.rules.zones[+i.dataset.zname].label = e.target.value;
    }));
    root.querySelectorAll('[data-zruns]').forEach(i => i.addEventListener('change', e => {
      d.rules.zones[+i.dataset.zruns].runs = Math.max(1, Math.min(12, +e.target.value || 1));
      rr();
    }));
    root.querySelectorAll('[data-rule]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.rule;
      const pen = k.match(/^__(wide|nb)(\d)$/);
      const ret = k.match(/^__retire(\d+)$/);
      if (pen) { d.rules[pen[1] === 'wide' ? 'widePenalty' : 'noBallPenalty'] = +pen[2]; }
      else if (ret) { d.rules.retireAt = +ret[1]; }
      else if (k === '__extraBat') { d.rules.extraBats = d.rules.extraBats ? 0 : 1; }
      else { d.rules[k] = !d.rules[k]; }
      rr();
    }));

    /* ---- step 2 ---- */
    root.querySelectorAll('[data-toss]').forEach(b => b.addEventListener('click', () => {
      d.toss.winnerId = b.dataset.toss; rr();
    }));
    root.querySelectorAll('[data-dec]').forEach(b => b.addEventListener('click', () => {
      d.toss.decision = b.dataset.dec; rr();
    }));
    root.querySelector('[data-act="flip"]')?.addEventListener('click', () => {
      d.toss.winnerId = Math.random() < 0.5 ? d.teamA : d.teamB;
      toast(`${teamName(d.toss.winnerId)} won the toss`, 'ok');
      rr();
    });

    /* ---- step 3 ---- */
    root.querySelectorAll('[data-xi]').forEach(b => b.addEventListener('click', () => {
      const [tid, pid] = b.dataset.xi.split(':');
      const list = d.xi[tid] || (d.xi[tid] = []);
      const i = list.indexOf(pid);
      if (i >= 0) list.splice(i, 1);
      else list.push(pid);          // sides need not be even — turf teams rarely are
      rr();
    }));
    root.querySelectorAll('[data-autoxi]').forEach(b => b.addEventListener('click', () => {
      const tid = b.dataset.autoxi;
      d.xi[tid] = store.players(tid).map(p => p.id);
      rr();
    }));

    /* ---- navigation ---- */
    root.querySelector('[data-act="next"]')?.addEventListener('click', () => {
      if (d.step === 1) {
        if (!d.teamA || !d.teamB) return toast('Pick both teams', 'warn');
        if (d.teamA === d.teamB) return toast('A team cannot play itself', 'warn');
        d.step = 2;
      } else if (d.step === 2) {
        if (!d.toss.winnerId) return toast('Who won the toss?', 'warn');
        d.step = 3;
        for (const tid of [d.teamA, d.teamB]) {
          const squad = store.players(tid);
          if (!d.xi[tid] && squad.length <= d.playersPerSide) d.xi[tid] = squad.map(p => p.id);
        }
      }
      rr();
    });
    root.querySelector('[data-act="prev"]')?.addEventListener('click', () => { d.step--; rr(); });
    root.querySelector('[data-act="start"]')?.addEventListener('click', () => start(ctx));
  }
};

/* ------------------------------------------------------------------ */

function step1(teams) {
  const slot = (key, id) => {
    const label = key === 'A' ? 'Team A' : 'Team B';
    if (!id) {
      return `<button data-slot="${key}" class="w-full flex items-center gap-3 rounded-xl border border-dashed border-white/15 px-3.5 py-3 text-left hover:border-emerald-400/40 transition active:scale-[.99]">
        <span class="h-10 w-10 shrink-0 grid place-items-center rounded-xl bg-white/5 border border-white/10 text-slate-600">?</span>
        <span class="flex-1"><span class="block text-[10px] uppercase tracking-wider text-slate-500 font-bold">${label}</span>
        <span class="block text-sm font-semibold text-slate-400">Choose a team</span></span>
        <span class="text-slate-600">›</span></button>`;
    }
    const n = store.players(id).length;
    return `<button data-slot="${key}" class="w-full flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 px-3.5 py-3 text-left hover:bg-white/10 transition active:scale-[.99]">
      ${badge(id)}
      <span class="flex-1 min-w-0"><span class="block text-[10px] uppercase tracking-wider text-slate-500 font-bold">${label}</span>
      <span class="block text-sm font-bold text-white truncate">${esc(teamName(id))}</span>
      <span class="block text-[10px] ${n < 2 ? 'text-amber-400' : 'text-slate-500'}">${n} player${n === 1 ? '' : 's'}${n < 2 ? ' — add more first' : ''}</span></span>
      <span class="text-slate-600">›</span></button>`;
  };

  const mopb = d.maxOversPerBowler ?? defaultMaxOversPerBowler(d.overs);

  return `
    <div class="card p-4">
      <div class="space-y-2">
        ${slot('A', d.teamA)}
        <div class="flex items-center gap-3">
          <div class="h-px flex-1 bg-white/8"></div>
          <button data-act="swap" class="h-8 w-8 rounded-lg bg-white/5 border border-white/10 grid place-items-center text-[11px] font-bold text-slate-400 hover:text-emerald-300 active:rotate-180 transition-transform duration-300" aria-label="Swap the two teams">⇄</button>
          <div class="h-px flex-1 bg-white/8"></div>
        </div>
        ${slot('B', d.teamB)}
      </div>
      <button data-act="newteam" class="mt-3 w-full rounded-xl border border-dashed border-white/15 py-2.5 text-xs font-semibold text-slate-400 hover:text-emerald-300 hover:border-emerald-400/40 transition">+ New team</button>
    </div>

    <div class="card p-4 mt-4">
      <p class="label">Overs per innings</p>
      <div class="flex flex-wrap gap-2">
        ${PRESETS.map(p => `<button data-overs="${p.overs}" class="btn-chip ${d.overs === p.overs ? '!bg-emerald-500 !text-onaccent !border-emerald-400' : ''}">${p.label}</button>`).join('')}
        <input id="oversCustom" type="number" min="1" max="90" value="${d.overs}" class="w-16 rounded-full bg-white/5 border border-white/10 px-3 py-1.5 text-xs text-center num" aria-label="Custom overs">
      </div>
      <div class="grid grid-cols-2 gap-3 mt-4">
        <div><label class="label" for="pps">Players a side <span class="normal-case text-slate-600">(default)</span></label>
          <input id="pps" type="number" min="2" max="15" value="${d.playersPerSide}" class="field num"></div>
        <div><label class="label" for="mopb">Max overs / bowler</label>
          <input id="mopb" type="number" min="1" max="${d.overs}" value="${mopb}" class="field num"></div>
      </div>
      <label class="label mt-4" for="venue">Venue <span class="normal-case text-slate-600">(optional)</span></label>
      <input id="venue" class="field" value="${esc(d.venue)}" placeholder="Ground name">
    </div>

    <div class="card p-4 mt-4">
      <p class="label">Match rules</p>
      <div class="space-y-2">
        ${toggle('freeHitOnNoBall', 'Free hit after a no ball', 'Only a run out can dismiss the batter on the next legal ball')}
        ${toggle('lastManStands', 'Last man stands', 'The final batter carries on alone instead of the innings ending')}
      </div>
      <div class="mt-4 pt-4 border-t border-white/[.07]">
        <p class="label">Turf &amp; gully rules</p>
        <div class="space-y-2">
          ${toggle('noLbw', 'No LBW', 'There is no umpire, so leave it out of the list')}
          ${toggle('everyoneBowls', 'Everyone bowls an over', 'Warns you when players still need a turn')}
          ${toggle('__extraBat', 'Short side bats one player twice', 'Their best batter gets a second knock')}
        </div>
        <p class="label mt-4">Fixed-run zones</p>
        <p class="text-[11px] text-slate-500 leading-snug mb-2">Hit a marked part of the ground and it is worth a set number of runs.
          The batters do not run, so the same one keeps the strike.</p>
        <div class="grid gap-2">
          ${(d.rules.zones || []).map((z, i) => `<div class="flex items-center gap-2">
            <input data-zname="${i}" class="field !py-2 text-sm flex-1" value="${esc(z.label || '')}" placeholder="e.g. Side net" maxlength="18">
            <input data-zruns="${i}" type="number" min="1" max="12" value="${+z.runs || 1}" class="field !py-2 w-16 text-center num">
            <button data-zdel="${i}" class="h-9 w-9 shrink-0 rounded-lg bg-white/5 border border-white/10 text-slate-500 hover:text-rose-300 grid place-items-center active:scale-90 transition">✕</button>
          </div>`).join('')}
        </div>
        <button data-zadd class="mt-2 w-full rounded-xl border border-dashed border-white/15 py-2.5 text-xs font-semibold text-slate-400 hover:text-emerald-300 hover:border-emerald-400/40 transition">
          + Add a zone</button>

        <p class="label mt-4">Retire a batter on</p>
        <div class="flex flex-wrap gap-2">
          ${[0, 25, 30, 50].map(n => `<button data-rule="__retire${n}" class="btn-chip ${d.rules.retireAt === n ? '!bg-emerald-500 !text-onaccent !border-emerald-400' : ''}">${n === 0 ? 'Off' : n}</button>`).join('')}
        </div>
        <p class="mt-2 text-[11px] text-slate-500 leading-snug">${d.rules.retireAt
          ? `You will be asked to retire a batter when they reach ${d.rules.retireAt}. They can come back later if the side runs short.`
          : 'Nobody is asked to retire.'}</p>
      </div>

      <div class="grid grid-cols-2 gap-3 mt-4">
        <div><p class="label">Runs for a wide</p>
          <div class="flex gap-2">${[1, 2].map(n => `<button data-rule="__wide${n}" class="btn-chip flex-1 ${d.rules.widePenalty === n ? '!bg-emerald-500 !text-onaccent' : ''}">${n}</button>`).join('')}</div></div>
        <div><p class="label">Runs for a no ball</p>
          <div class="flex gap-2">${[1, 2].map(n => `<button data-rule="__nb${n}" class="btn-chip flex-1 ${d.rules.noBallPenalty === n ? '!bg-emerald-500 !text-onaccent' : ''}">${n}</button>`).join('')}</div></div>
      </div>
    </div>

    <button data-act="next" class="btn-primary w-full mt-5 !py-3.5">Continue to the toss →</button>`;
}

async function pickTeam(label, current) {
  const teams = sortBy(store.teams(), 'name');
  const v = await sheet(`
    <h3 class="text-lg font-bold text-white mb-4">${esc(label)}</h3>
    <div class="grid gap-1.5 max-h-[60vh] overflow-y-auto no-scrollbar">
      ${teams.map(t => {
        const n = store.players(t.id).length;
        return `<button data-teamsel="${t.id}" class="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition active:scale-[.98] ${
          t.id === current ? 'bg-emerald-500/15 border-emerald-500/40' : 'bg-white/5 border-white/10 hover:bg-white/10'}">
          ${badge(t.id, 'sm')}
          <span class="flex-1 min-w-0"><span class="block text-sm font-semibold text-white truncate">${esc(t.name)}</span>
          <span class="block text-[10px] ${n < 2 ? 'text-amber-400' : 'text-slate-500'}">${n} player${n === 1 ? '' : 's'}</span></span>
          ${t.id === current ? '<span class="text-emerald-400">✓</span>' : ''}</button>`;
      }).join('')}
    </div>`, { grab: false });
  return v && v.startsWith('team:') ? v.slice(5) : null;
}

function toggle(key, title, sub) {
  const on = key === '__extraBat' ? !!d.rules.extraBats : !!d.rules[key];
  return `<button data-rule="${key}" class="w-full flex items-center gap-3 rounded-xl bg-white/[.04] border border-white/10 px-3 py-2.5 text-left transition active:scale-[.99]">
    <span class="flex-1 min-w-0">
      <span class="block text-sm font-semibold text-white">${esc(title)}</span>
      <span class="block text-[11px] text-slate-500 leading-snug">${esc(sub)}</span></span>
    <span class="shrink-0 h-6 w-10 rounded-full p-0.5 transition-colors ${on ? 'bg-emerald-500' : 'bg-white/15'}">
      <span class="block h-5 w-5 rounded-full bg-pure shadow transition-transform ${on ? 'translate-x-4' : ''}"></span></span>
  </button>`;
}

function step2() {
  const opt = id => `<button data-toss="${id}" class="flex-1 rounded-2xl border p-4 text-center transition active:scale-95 ${
    d.toss.winnerId === id ? 'bg-emerald-500/15 border-emerald-500/40' : 'bg-white/5 border-white/10'}">
    <div class="flex justify-center mb-2">${badge(id, 'md')}</div>
    <p class="text-sm font-bold text-white truncate">${esc(teamName(id))}</p></button>`;

  const dec = (v, label, icon) => `<button data-dec="${v}" class="flex-1 rounded-2xl border p-4 text-center transition active:scale-95 ${
    d.toss.decision === v ? 'bg-emerald-500/15 border-emerald-500/40 text-white' : 'bg-white/5 border-white/10 text-slate-400'}">
    <div class="text-2xl">${icon}</div><p class="mt-1 text-sm font-bold">${label}</p></button>`;

  const batFirst = d.toss.winnerId
    ? (d.toss.decision === 'bat' ? d.toss.winnerId : (d.toss.winnerId === d.teamA ? d.teamB : d.teamA))
    : null;

  return `
    <div class="card p-5">
      <p class="label">Who won the toss?</p>
      <div class="flex gap-3">${opt(d.teamA)}${opt(d.teamB)}</div>
      <button data-act="flip" class="mt-3 w-full btn-ghost text-xs">🪙 Flip a coin for me</button>

      <p class="label mt-6">And they chose to…</p>
      <div class="flex gap-3">${dec('bat', 'Bat', '🏏')}${dec('bowl', 'Bowl', '🎯')}</div>

      ${batFirst ? `<div class="mt-5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-4 py-3 text-center animate-pop">
        <p class="text-sm font-bold text-emerald-300">${esc(teamName(batFirst))} bat first</p>
        <p class="text-[11px] text-slate-400 mt-0.5">${d.overs} overs · ${d.playersPerSide} a side</p></div>` : ''}
    </div>
    <div class="grid grid-cols-2 gap-3 mt-5">
      <button data-act="prev" class="btn-ghost !py-3.5">← Back</button>
      <button data-act="next" class="btn-primary !py-3.5">Pick the XI →</button>
    </div>`;
}

function step3() {
  const panel = tid => {
    const squad = store.players(tid);
    const picked = d.xi[tid] || [];
    const short = picked.length < 2;
    return `<div class="card p-4">
      <div class="flex items-center gap-2.5 mb-3">
        ${badge(tid, 'sm')}
        <p class="flex-1 text-sm font-bold text-white truncate">${esc(teamName(tid))}</p>
        <span class="num text-xs font-bold ${short ? 'text-rose-400' : picked.length === d.playersPerSide ? 'text-emerald-400' : 'text-amber-400'}">${picked.length}
          <span class="font-medium text-slate-600">player${picked.length === 1 ? '' : 's'}</span></span>
      </div>
      ${squad.length ? `<div class="grid gap-1.5 max-h-72 overflow-y-auto no-scrollbar">
        ${squad.map(p => {
          const i = picked.indexOf(p.id);
          const on = i >= 0;
          return `<button data-xi="${tid}:${p.id}" class="flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition active:scale-[.98] ${
            on ? 'bg-emerald-500/12 border-emerald-500/35' : 'bg-white/[.03] border-white/8'}">
            <span class="w-5 text-center text-[10px] font-bold num ${on ? 'text-emerald-400' : 'text-slate-600'}">${on ? i + 1 : '·'}</span>
            <span class="h-7 w-7 shrink-0 grid place-items-center rounded-full bg-white/8 text-[10px] font-bold text-slate-300">${esc(initials(p.name))}</span>
            <span class="flex-1 min-w-0 text-xs font-semibold truncate ${on ? 'text-white' : 'text-slate-400'}">${esc(p.name)}
              ${p.role === 'Wicket-keeper' ? '<span class="ml-1 text-[9px] text-amber-300">WK</span>' : ''}</span>
          </button>`;
        }).join('')}</div>
        <button data-autoxi="${tid}" class="mt-2.5 w-full btn-chip">Pick all ${squad.length}</button>`
        : `<p class="text-xs text-amber-400 py-3">No players in this squad. <a href="#/team/${tid}" class="underline">Add some</a> first.</p>`}
    </div>`;
  };

  const nA = (d.xi[d.teamA] || []).length, nB = (d.xi[d.teamB] || []).length;
  const ready = nA >= 2 && nB >= 2;
  const uneven = ready && nA !== nB;
  return `
    <p class="text-xs text-slate-500 mb-3 leading-relaxed">Tap players in batting order. At least 2 a side;
    the numbers become the order new batters come in.</p>
    ${uneven ? `<div class="rounded-xl bg-amber-500/10 border border-amber-500/25 px-3 py-2.5 mb-3">
      <p class="text-[11px] text-amber-200 leading-snug"><b>${nA} v ${nB}</b> — the sides are uneven, which is fine.
      Each team is all out one short of its own size, so ${esc(teamName(nA < nB ? d.teamA : d.teamB))} is all out at
      ${Math.min(nA, nB) - 1} wicket${Math.min(nA, nB) - 1 === 1 ? '' : 's'}.</p></div>` : ''}
    <div class="grid gap-4">${panel(d.teamA)}${panel(d.teamB)}</div>
    <div class="grid grid-cols-2 gap-3 mt-5">
      <button data-act="prev" class="btn-ghost !py-3.5">← Back</button>
      <button data-act="start" class="btn-primary !py-3.5" ${ready ? '' : 'disabled'}>Start scoring 🏏</button>
    </div>`;
}

function start(ctx) {
  const m = newMatch({
    teamA: d.teamA, teamB: d.teamB,
    overs: d.overs, playersPerSide: d.playersPerSide,
    maxOversPerBowler: d.maxOversPerBowler ?? defaultMaxOversPerBowler(d.overs),
    xi: { [d.teamA]: d.xi[d.teamA] || [], [d.teamB]: d.xi[d.teamB] || [] },
    toss: d.toss, venue: d.venue, tournamentId: d.tournamentId,
    stage: d.stage, rules: d.rules
  });
  store.addMatch(m);

  if (d.tournamentId && d.fixtureId) {
    const t = store.tournament(d.tournamentId);
    const fx = (t?.fixtures || []).find(f => f.id === d.fixtureId);
    if (fx) { fx.matchId = m.id; store.save(true); }
  }

  store.setSetting('defaultOvers', d.overs);
  store.setSetting('defaultPlayers', d.playersPerSide);
  d = null; key = '';
  ctx.go('/score/' + m.id, true);
}

/* team picker sheet plumbing */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-teamsel]');
  if (b) closeSheet('team:' + b.dataset.teamsel);
});
