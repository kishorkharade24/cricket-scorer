/* Live scoring — the screen a scorer actually uses. */

import { esc, fixed, oversOf, sheet, closeSheet, toast, haptic, confirmDlg, initials, shortName } from '../util.js';
import * as store from '../store.js';
import { badge, ballChip, empty, teamName, nameOf, ICON, iconBtn, livePill } from '../ui.js';
import * as E from '../engine.js';
import { motmCandidates } from '../stats.js';

let armed = null;         // 'wd' | 'nb' | 'b' | 'lb'
let busy = false;         // a prompt sheet is open
let shownResultFor = null;
let breakShown = null;    // stops the innings-break sheet reopening forever
let lastMatchId = null;

export default {
  keepAwake: true,
  nav: 'matches',
  back: true,
  hideNav: true,
  title: ctx => {
    const m = store.match(ctx.id);
    return m ? `${store.team(m.teams[0])?.short} v ${store.team(m.teams[1])?.short}` : 'Scoring';
  },
  sub: ctx => {
    const m = store.match(ctx.id);
    if (!m) return '';
    return `${m.overs} ov · ${m.stage || 'Friendly'}${m.venue ? ' · ' + m.venue : ''}`;
  },
  actions: ctx => `<a href="#/scorecard/${ctx.id}" class="h-9 w-9 rounded-xl bg-white/5 border border-white/10 grid place-items-center text-slate-300 hover:bg-white/10 active:scale-90 transition" aria-label="Scorecard">${ICON.card}</a>
    ${iconBtn('more', '<svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>', 'More options')}`,

  render(ctx) {
    const m = store.match(ctx.id);
    if (!m) return empty('❓', 'Match not found', 'It may have been deleted.', `<a href="#/matches" class="btn-ghost">All matches</a>`);
    if (lastMatchId !== ctx.id) { armed = null; lastMatchId = ctx.id; }

    const st = E.computeInnings(m, m.innings.length - 1);
    const first = m.innings.length > 1 ? E.computeInnings(m, 0) : null;

    return `
      ${scoreboard(m, st, first)}
      ${crease(m, st)}
      ${overStrip(st)}
      ${m.status === 'completed' ? finishedBanner(m, st) : pad(st)}
      ${lastOvers(st)}`;
  },

  mount(root, ctx) {
    const m = store.match(ctx.id);
    if (!m) return;
    const rr = () => ctx.render();

    root.querySelectorAll('[data-run]').forEach(b => b.addEventListener('click', () => runTap(m, +b.dataset.run, ctx)));
    root.querySelectorAll('[data-extra]').forEach(b => b.addEventListener('click', () => {
      armed = armed === b.dataset.extra ? null : b.dataset.extra;
      haptic(8); rr();
    }));
    root.querySelector('[data-act="wicket"]')?.addEventListener('click', () => wicketFlow(m, ctx));
    root.querySelector('[data-act="undo"]')?.addEventListener('click', () => undoBall(m, ctx));
    root.querySelector('[data-act="swap"]')?.addEventListener('click', () => {
      E.push(m, { t: 'swap' }); store.save(); haptic(); rr();
    });
    root.querySelector('[data-act="scorecard"]')?.addEventListener('click', () => ctx.go('/scorecard/' + m.id));
    root.querySelectorAll('[data-act="pickbowler"]').forEach(b => b.addEventListener('click', () => askBowler(m, ctx, true)));
    document.querySelector('#pageActions [data-act="more"]')?.addEventListener('click', () => moreMenu(m, ctx));

    if (!busy) ensurePrompts(m, ctx);
  }
};

/* ------------------------------------------------------------------ *
 * Scoreboard
 * ------------------------------------------------------------------ */

function scoreboard(m, st, first) {
  const chasing = st.target != null;
  const eq = chasing && st.need > 0
    ? `Need <b class="text-white">${st.need}</b> from <b class="text-white">${st.ballsLeft}</b> ball${st.ballsLeft === 1 ? '' : 's'}`
    : chasing ? 'Target reached' : `Projected <b class="text-white">${st.projected}</b>`;

  return `<div class="card p-5 relative overflow-hidden animate-slide-up">
    <div class="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-emerald-500/12 blur-3xl"></div>
    <div class="relative">
      <div class="flex items-center gap-2 mb-3">
        ${m.status === 'live' ? livePill() : `<span class="pill bg-white/8 text-slate-400">Result</span>`}
        <span class="text-[11px] text-slate-400 truncate">${esc(teamName(st.battingTeamId))} ${m.innings.length > 1 ? '(2nd inns)' : '(1st inns)'}</span>
        ${st.freeHit ? `<span class="pill bg-amber-400 text-ink-950 animate-pop ml-auto">FREE HIT</span>` : ''}
      </div>

      <div class="flex items-end gap-3">
        ${badge(st.battingTeamId, 'md')}
        <div class="flex items-end gap-1.5">
          <span class="text-5xl font-black num text-white leading-none tracking-tight animate-count-up">${st.runs}</span>
          <span class="text-2xl font-black num text-slate-500 leading-none">/${st.wickets}</span>
        </div>
        <div class="ml-auto text-right">
          <p class="num text-xl font-extrabold text-white leading-none">${st.oversText}</p>
          <p class="text-[10px] text-slate-500 font-semibold">of ${st.maxOvers} ov</p>
        </div>
      </div>

      <div class="mt-4 grid grid-cols-3 gap-2 text-center">
        <div class="rounded-xl bg-white/[.05] py-2">
          <p class="text-[9px] uppercase tracking-wider text-slate-500 font-bold">CRR</p>
          <p class="num text-sm font-extrabold text-white">${fixed(st.crr)}</p></div>
        <div class="rounded-xl bg-white/[.05] py-2">
          <p class="text-[9px] uppercase tracking-wider text-slate-500 font-bold">${chasing ? 'RRR' : 'Extras'}</p>
          <p class="num text-sm font-extrabold ${chasing && st.rrr > st.crr + 2 ? 'text-rose-300' : 'text-white'}">${chasing ? (isFinite(st.rrr) ? fixed(st.rrr) : '—') : st.extrasTotal}</p></div>
        <div class="rounded-xl bg-white/[.05] py-2">
          <p class="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Wkts left</p>
          <p class="num text-sm font-extrabold text-white">${st.wicketsLeft}</p></div>
      </div>

      <p class="mt-3 text-center text-xs text-slate-400">${eq}
        ${first ? `<span class="block mt-0.5 text-[11px] text-slate-600">${esc(teamName(first.battingTeamId))} made ${first.runs}/${first.wickets} (${first.oversText})</span>` : ''}</p>
    </div>
  </div>`;
}

/* ------------------------------------------------------------------ *
 * Batters + bowler
 * ------------------------------------------------------------------ */

function crease(m, st) {
  const bat = (id, onStrike) => {
    if (!id) return `<div class="flex items-center gap-2.5 py-2 opacity-40"><span class="text-xs text-slate-500">— waiting for a batter —</span></div>`;
    const b = st.bat[id] || { r: 0, b: 0, f4: 0, f6: 0 };
    return `<div class="flex items-center gap-2.5 py-1.5 ${onStrike ? '' : 'opacity-70'}">
      <span class="h-7 w-7 shrink-0 grid place-items-center rounded-full text-[10px] font-bold ${onStrike ? 'bg-emerald-500 text-ink-950' : 'bg-white/8 text-slate-300'}">${esc(initials(nameOf(id)))}</span>
      <span class="flex-1 min-w-0 text-[13px] font-semibold text-white truncate">${esc(shortName(nameOf(id)))}${onStrike ? '<span class="text-emerald-400">*</span>' : ''}</span>
      <span class="num text-[13px] font-bold text-white">${b.r}<span class="text-slate-500 font-medium"> (${b.b})</span></span>
      <span class="num text-[10px] text-slate-500 w-16 text-right">${b.f4}×4 ${b.f6}×6</span>
      <span class="num text-[10px] text-slate-500 w-9 text-right">${b.b ? fixed((b.r / b.b) * 100, 0) : '—'}</span>
    </div>`;
  };

  const bowlerRow = () => {
    if (!st.bowler) {
      return `<button data-act="pickbowler" class="w-full flex items-center gap-2.5 py-2 text-left">
        <span class="h-7 w-7 grid place-items-center rounded-full bg-amber-500/20 text-amber-300 text-xs">?</span>
        <span class="flex-1 text-[13px] font-semibold text-amber-300">Choose the next bowler</span>
        <span class="text-slate-600">›</span></button>`;
    }
    const w = st.bowl[st.bowler];
    const left = E.oversLeftFor(st, st.bowler);
    return `<div class="flex items-center gap-2.5 py-1.5">
      <span class="h-7 w-7 shrink-0 grid place-items-center rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-bold">${esc(initials(nameOf(st.bowler)))}</span>
      <span class="flex-1 min-w-0 text-[13px] font-semibold text-white truncate">${esc(shortName(nameOf(st.bowler)))}</span>
      <span class="num text-[13px] font-bold text-white">${w.wkts}-${w.runs}</span>
      <span class="num text-[10px] text-slate-500 w-16 text-right">${oversOf(w.balls)} ov · ${w.maidens}m</span>
      <span class="num text-[10px] text-slate-500 w-9 text-right">${w.balls ? fixed((w.runs * 6) / w.balls) : '—'}</span>
    </div>
    <p class="text-[10px] text-slate-600 pl-10">${left} over${left === 1 ? '' : 's'} left in the quota</p>`;
  };

  return `<div class="card p-4 mt-3">
    <div class="flex items-center justify-between mb-1">
      <p class="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Batting</p>
      <span class="num text-[10px] text-slate-600">R (B) &nbsp; 4s 6s &nbsp; SR</span>
    </div>
    ${bat(st.striker, true)}
    ${bat(st.nonStriker, false)}
    ${st.partner ? `<p class="text-[10px] text-slate-600 mt-1">Partnership ${st.partner.runs} (${st.partner.balls})</p>` : ''}
    <div class="border-t border-white/[.07] mt-2.5 pt-2">
      <p class="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Bowling</p>
      ${bowlerRow()}
    </div>
  </div>`;
}

function overStrip(st) {
  const balls = st.thisOver || [];
  const left = 6 - st.legalInOver;
  return `<div class="card p-3 mt-3">
    <div class="flex items-center gap-2">
      <span class="text-[10px] uppercase tracking-wider text-slate-500 font-bold shrink-0">This over</span>
      <div class="flex gap-1.5 overflow-x-auto no-scrollbar flex-1">
        ${balls.length ? balls.map((c, i) => ballChip(c, i)).join('')
          : '<span class="text-[11px] text-slate-600 py-1.5">no balls bowled yet</span>'}
        ${Array.from({ length: Math.max(0, left) }, () => '<span class="w-8 h-8 shrink-0 rounded-lg border border-dashed border-white/10"></span>').join('')}
      </div>
      <span class="num text-[11px] font-bold text-slate-500 shrink-0">${st.curOver ? st.curOver.runs : 0}</span>
    </div>
  </div>`;
}

function lastOvers(st) {
  const recent = st.overs.slice(-4).reverse();
  if (!recent.length) return '';
  return `<div class="card p-4 mt-3">
    <p class="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2.5">Recent overs</p>
    <div class="space-y-2.5">
      ${recent.map(o => `<div class="flex items-start gap-2">
        <span class="num text-[11px] font-bold text-slate-500 w-4 pt-0.5">${o.n}</span>
        <div class="flex flex-wrap gap-1 flex-1 min-w-0">${o.balls.map(c => ballChip(c, 0, true)).join('')}</div>
        <span class="num text-[11px] font-bold text-white w-7 text-right pt-0.5">${o.runs}</span>
        <span class="text-[10px] text-slate-600 w-16 truncate text-right pt-0.5">${esc(shortName(nameOf(o.bowler)))}</span>
      </div>`).join('')}
    </div>
  </div>`;
}

function finishedBanner(m, st) {
  const states = m.innings.map((_, i) => E.computeInnings(m, i));
  return `<div class="card p-6 mt-3 text-center animate-pop">
    <p class="text-3xl">🏆</p>
    <p class="mt-2 text-base font-extrabold text-white">${esc(E.resultText(m, states, teamName) || 'Match over')}</p>
    ${m.motm ? `<p class="mt-1 text-xs text-amber-300 font-semibold">Player of the match — ${esc(nameOf(m.motm))}</p>` : ''}
    <div class="mt-4 grid grid-cols-2 gap-3">
      <button data-act="undo" class="btn-ghost">${ICON.undo} Undo last ball</button>
      <button data-act="scorecard" class="btn-primary">Full scorecard</button>
    </div>
  </div>`;
}

/* ------------------------------------------------------------------ *
 * The run pad
 * ------------------------------------------------------------------ */

function pad(st) {
  const blocked = st.needsBatter || st.needsBowler || st.closed;
  const EX = [
    { k: 'wd', label: 'Wide',   cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30', on: 'bg-amber-500 text-ink-950 border-amber-400' },
    { k: 'nb', label: 'No ball',cls: 'bg-orange-500/15 text-orange-300 border-orange-500/30', on: 'bg-orange-500 text-ink-950 border-orange-400' },
    { k: 'b',  label: 'Bye',    cls: 'bg-teal-500/15 text-teal-300 border-teal-500/30', on: 'bg-teal-500 text-ink-950 border-teal-400' },
    { k: 'lb', label: 'Leg bye',cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30', on: 'bg-cyan-500 text-ink-950 border-cyan-400' }
  ];

  const hint = armed === 'wd' ? 'Wide armed — tap the runs the batters <b>ran</b> (0 for a plain wide)'
    : armed === 'nb' ? 'No ball armed — tap the runs scored <b>off the bat</b>'
    : armed === 'b'  ? 'Byes armed — tap how many byes were run'
    : armed === 'lb' ? 'Leg byes armed — tap how many leg byes were run'
    : null;

  const runBtn = n => {
    const tone = n === 6 ? 'bg-violet-500/20 text-violet-200 border-violet-500/40'
      : n === 4 ? 'bg-sky-500/20 text-sky-200 border-sky-500/40'
      : n === 0 ? 'bg-white/[.05] text-slate-400 border-white/10'
      : 'bg-white/10 text-white border-white/15';
    return `<button data-run="${n}" class="runbtn h-16 text-2xl ${tone}" ${blocked ? 'disabled' : ''}>${n === 0 && !armed ? '•' : n}</button>`;
  };

  return `<div class="card p-3 mt-3 ${blocked ? 'opacity-60 pointer-events-none' : ''}">
    <div class="grid grid-cols-4 gap-2 mb-2">
      ${EX.map(x => `<button data-extra="${x.k}" class="runbtn h-11 text-[11px] uppercase tracking-wide border ${armed === x.k ? x.on + ' animate-pop' : x.cls}">${x.label}</button>`).join('')}
    </div>
    ${hint ? `<p class="text-[11px] text-center text-amber-200/90 mb-2 leading-snug">${hint}</p>` : ''}
    <div class="grid grid-cols-4 gap-2">
      ${[0, 1, 2, 3].map(runBtn).join('')}
      ${[4, 5, 6].map(runBtn).join('')}
      <button data-act="wicket" class="runbtn h-16 text-xl bg-rose-500/20 text-rose-200 border-rose-500/45" ${blocked ? 'disabled' : ''}>OUT</button>
    </div>
    <div class="grid grid-cols-3 gap-2 mt-2">
      <button data-act="undo" class="btn-ghost !py-3 text-xs">${ICON.undo} Undo</button>
      <button data-act="swap" class="btn-ghost !py-3 text-xs">⇄ Swap</button>
      <button data-act="scorecard" class="btn-ghost !py-3 text-xs">${ICON.card} Card</button>
    </div>
  </div>`;
}

/* ------------------------------------------------------------------ *
 * Recording a delivery
 * ------------------------------------------------------------------ */

function runTap(m, n, ctx) {
  const ev = { t: 'ball', r: n };
  if (armed === 'wd') ev.wd = true;
  if (armed === 'nb') ev.nb = true;
  if (armed === 'b')  ev.b = true;
  if (armed === 'lb') ev.lb = true;
  armed = null;
  commit(m, ev, ctx);
}

function commit(m, ev, ctx) {
  E.push(m, ev);
  const phase = E.autoAdvance(m);
  store.save();
  haptic(ev.w ? 40 : 12);
  celebrate(ev);
  ctx.render();          // mount() then runs ensurePrompts() for the new phase
  return phase;
}

function celebrate(ev) {
  if (!store.settings().celebrate) return;
  const fx = document.querySelector('#fx');
  let text = null, cls = '';
  if (ev.w && !E.dismissal(ev.w.type).notOut) { text = 'OUT!'; cls = 'text-rose-400'; }
  else if (ev.r === 6 && !ev.b && !ev.lb) { text = 'SIX!'; cls = 'text-violet-300'; }
  else if (ev.r === 4 && !ev.b && !ev.lb) { text = 'FOUR'; cls = 'text-sky-300'; }
  if (!text) return;
  fx.innerHTML = `<span class="animate-celebrate text-6xl font-black tracking-tighter ${cls} drop-shadow-[0_0_30px_currentColor]">${text}</span>`;
  fx.classList.remove('hidden');
  setTimeout(() => { fx.classList.add('hidden'); fx.innerHTML = ''; }, 1000);
}

function undoBall(m, ctx) {
  if (!E.canUndo(m)) return toast('Nothing to undo', 'info');
  let removed = null;
  for (let i = 0; i < 60; i++) {
    const ev = E.undo(m);
    if (!ev) break;
    removed = ev;
    if (ev.t === 'ball') break;
  }
  store.save(true);
  haptic(20);
  toast(removed?.t === 'ball' ? 'Last ball removed' : 'Last action removed', 'ok', 1600);
  ctx.render();
}

/* ------------------------------------------------------------------ *
 * Prompts: new batter, new bowler, innings break, result
 * ------------------------------------------------------------------ */

async function ensurePrompts(m, ctx) {
  const st = E.computeInnings(m, m.innings.length - 1);

  if (m.status === 'completed') {
    if (shownResultFor !== m.id) { shownResultFor = m.id; await resultSheet(m, ctx); }
    return;
  }
  shownResultFor = null;

  if (m.innings.length > 1 && !m.innings[1].events.length && m.innings[0].closed) {
    const key = `${m.id}:${m.innings.length}`;
    if (breakShown !== key) { breakShown = key; await inningsBreak(m, ctx); return; }
  }
  if (st.needsBatter) { await askBatter(m, ctx); return; }
  if (st.needsBowler) { await askBowler(m, ctx); return; }
}

async function askBatter(m, ctx) {
  busy = true;
  const st = E.computeInnings(m, m.innings.length - 1);
  const list = st.available;
  if (!list.length) { busy = false; return; }

  const body = `
    <h3 class="text-lg font-bold text-white">Next batter in</h3>
    <p class="text-xs text-slate-500 mt-1">${st.wickets} down · ${st.runs}/${st.wickets} after ${st.oversText} overs</p>
    <div class="mt-4 grid gap-1.5 max-h-[52vh] overflow-y-auto no-scrollbar">
      ${list.map((id, i) => {
        const b = st.bat[id];
        return `<button data-pickbat="${id}" class="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-left hover:bg-white/10 active:scale-[.98] transition">
          <span class="w-5 text-center text-[11px] font-bold num text-slate-600">${st.battingXI.indexOf(id) + 1}</span>
          <span class="h-8 w-8 grid place-items-center rounded-full bg-white/8 text-[11px] font-bold text-slate-300">${esc(initials(nameOf(id)))}</span>
          <span class="flex-1 min-w-0 text-sm font-semibold text-white truncate">${esc(nameOf(id))}</span>
          ${b?.retired ? '<span class="pill bg-amber-500/15 text-amber-300">resuming</span>' : ''}
        </button>`;
      }).join('')}
    </div>`;

  const v = await sheet(body, { grab: false });
  busy = false;
  if (!v || !v.startsWith('bat:')) { ctx.render(); return; }
  E.push(m, { t: 'bat', id: v.slice(4) });
  store.save();
  ctx.render();
}

async function askBowler(m, ctx, midOver = false) {
  busy = true;
  const st = E.computeInnings(m, m.innings.length - 1);
  const xi = st.bowlingXI;

  const row = id => {
    const w = st.bowl[id];
    const overs = w ? Math.ceil(w.balls / 6) : 0;
    const quotaOut = overs >= st.maxOversPerBowler;
    const consecutive = id === st.lastBowler && !midOver;
    const off = quotaOut || consecutive;
    const why = quotaOut ? 'quota done' : consecutive ? 'bowled last over' : '';
    return `<button data-pickbowl="${id}" ${off ? 'disabled' : ''}
      class="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${off
        ? 'bg-white/[.02] border-white/5 opacity-40 cursor-not-allowed'
        : 'bg-white/5 border-white/10 hover:bg-white/10 active:scale-[.98]'}">
      <span class="h-8 w-8 grid place-items-center rounded-full bg-rose-500/15 text-[11px] font-bold text-rose-300">${esc(initials(nameOf(id)))}</span>
      <span class="flex-1 min-w-0">
        <span class="block text-sm font-semibold text-white truncate">${esc(nameOf(id))}</span>
        <span class="block text-[10px] text-slate-500 num">${w ? `${oversOf(w.balls)}-${w.maidens}-${w.runs}-${w.wkts}` : 'yet to bowl'}${why ? ' · ' + why : ''}</span>
      </span>
      ${w && w.balls ? `<span class="num text-[11px] font-bold text-slate-400">${fixed((w.runs * 6) / w.balls)}</span>` : ''}
    </button>`;
  };

  const v = await sheet(`
    <h3 class="text-lg font-bold text-white">${midOver ? 'Change bowler' : `Bowler for over ${Math.floor(st.balls / 6) + 1}`}</h3>
    <p class="text-xs text-slate-500 mt-1">Max ${st.maxOversPerBowler} over${st.maxOversPerBowler === 1 ? '' : 's'} each${midOver ? '' : ' · the previous over’s bowler cannot continue'}</p>
    <div class="mt-4 grid gap-1.5 max-h-[52vh] overflow-y-auto no-scrollbar">${xi.map(row).join('')}</div>`, { grab: false });

  busy = false;
  if (!v || !v.startsWith('bowl:')) { ctx.render(); return; }
  E.push(m, { t: 'bowl', id: v.slice(5) });
  store.save();
  ctx.render();
}

async function wicketFlow(m, ctx) {
  busy = true;
  const st = E.computeInnings(m, m.innings.length - 1);
  const allowed = st.freeHit ? E.DISMISSALS.filter(x => E.FREE_HIT_OUTS.includes(x.code) || x.code === 'retired')
                             : E.DISMISSALS;

  const v = await sheet(`
    <h3 class="text-lg font-bold text-white">How were they out?</h3>
    ${st.freeHit ? '<p class="text-xs text-amber-300 mt-1">Free hit — only a run out (or obstruction) counts</p>' : ''}
    <div class="mt-4 grid grid-cols-2 gap-2">
      ${allowed.map(x => `<button data-out="${x.code}" class="rounded-xl bg-white/5 border border-white/10 px-3 py-3 text-xs font-bold text-slate-200 hover:bg-rose-500/15 hover:border-rose-500/30 active:scale-95 transition">${esc(x.label)}</button>`).join('')}
    </div>
    <button class="btn-ghost w-full mt-4" data-close="__dismiss">Cancel</button>`, { grab: false });

  if (!v || !v.startsWith('out:')) { busy = false; ctx.render(); return; }
  const type = v.slice(4);
  const d = E.dismissal(type);

  // who is out?
  let batter = st.striker;
  if (!d.strikerOnly && st.nonStriker) {
    const w = await sheet(`
      <h3 class="text-lg font-bold text-white">Which batter is out?</h3>
      <div class="mt-4 grid gap-2">
        ${[st.striker, st.nonStriker].filter(Boolean).map(id => `<button data-who="${id}"
          class="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 px-3 py-3 text-left hover:bg-white/10 active:scale-[.98] transition">
          <span class="h-8 w-8 grid place-items-center rounded-full bg-white/8 text-[11px] font-bold text-slate-300">${esc(initials(nameOf(id)))}</span>
          <span class="flex-1 text-sm font-semibold text-white">${esc(nameOf(id))}</span>
          <span class="text-[10px] text-slate-500">${id === st.striker ? 'on strike' : 'non-striker'}</span></button>`).join('')}
      </div>`, { grab: false });
    if (!w || !w.startsWith('who:')) { busy = false; ctx.render(); return; }
    batter = w.slice(4);
  }

  // fielder?
  let fielder = null;
  if (d.fielder) {
    const f = await sheet(`
      <h3 class="text-lg font-bold text-white">${type === 'stumped' ? 'Stumped by' : type === 'runout' ? 'Run out by' : 'Caught by'}</h3>
      <div class="mt-4 grid gap-1.5 max-h-[50vh] overflow-y-auto no-scrollbar">
        ${st.bowlingXI.map(id => `<button data-field="${id}" class="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-left hover:bg-white/10 active:scale-[.98] transition">
          <span class="h-8 w-8 grid place-items-center rounded-full bg-white/8 text-[11px] font-bold text-slate-300">${esc(initials(nameOf(id)))}</span>
          <span class="flex-1 text-sm font-semibold text-white truncate">${esc(nameOf(id))}</span>
          ${id === st.bowler ? '<span class="text-[10px] text-slate-500">bowler</span>' : ''}</button>`).join('')}
      </div>
      <button class="btn-ghost w-full mt-3" data-field="">Not recorded</button>`, { grab: false });
    if (f && f.startsWith('field:')) fielder = f.slice(6) || null;
  }

  // runs completed / extras on the same ball
  const r = await sheet(`
    <h3 class="text-lg font-bold text-white">Runs on that ball</h3>
    <p class="text-xs text-slate-500 mt-1">Runs completed before the dismissal. Usually 0.</p>
    <div class="grid grid-cols-4 gap-2 mt-4">
      ${[0, 1, 2, 3].map(n => `<button data-wr="${n}" class="runbtn h-14 text-xl bg-white/8 text-white border-white/15">${n}</button>`).join('')}
    </div>
    <div class="grid grid-cols-3 gap-2 mt-2">
      <button data-wr="nb0" class="runbtn h-12 text-xs bg-orange-500/15 text-orange-300 border-orange-500/30">No ball</button>
      <button data-wr="wd0" class="runbtn h-12 text-xs bg-amber-500/15 text-amber-300 border-amber-500/30">Wide</button>
      <button data-wr="b1" class="runbtn h-12 text-xs bg-teal-500/15 text-teal-300 border-teal-500/30">1 bye</button>
    </div>`, { grab: false });

  busy = false;
  if (!r || !r.startsWith('wr:')) { ctx.render(); return; }
  const code = r.slice(3);
  const ev = { t: 'ball', r: 0, w: { type, batter, fielder } };
  if (code === 'nb0') { ev.nb = true; }
  else if (code === 'wd0') { ev.wd = true; }
  else if (code === 'b1') { ev.b = true; ev.r = 1; }
  else ev.r = +code || 0;

  commit(m, ev, ctx);
}

async function inningsBreak(m, ctx) {
  busy = true;
  const first = E.computeInnings(m, 0);
  const top = first.batOrder.map(id => ({ id, ...first.bat[id] })).sort((a, b) => b.r - a.r)[0];
  const best = first.bowlOrder.map(id => ({ id, ...first.bowl[id] })).sort((a, b) => b.wkts - a.wkts || a.runs - b.runs)[0];

  await sheet(`
    <div class="text-center">
      <p class="text-3xl">🍵</p>
      <h3 class="mt-2 text-xl font-extrabold text-white">Innings break</h3>
      <p class="mt-1 text-sm text-slate-400">${esc(teamName(first.battingTeamId))} made
        <b class="text-white">${first.runs}/${first.wickets}</b> in ${first.oversText} overs</p>
    </div>
    <div class="mt-5 grid grid-cols-2 gap-3">
      <div class="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
        <p class="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Top scorer</p>
        <p class="mt-1 text-sm font-bold text-white truncate">${top ? esc(shortName(nameOf(top.id))) : '—'}</p>
        <p class="num text-[11px] text-slate-400">${top ? `${top.r} (${top.b})` : ''}</p></div>
      <div class="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
        <p class="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Best bowler</p>
        <p class="mt-1 text-sm font-bold text-white truncate">${best ? esc(shortName(nameOf(best.id))) : '—'}</p>
        <p class="num text-[11px] text-slate-400">${best ? `${best.wkts}/${best.runs}` : ''}</p></div>
    </div>
    <div class="mt-5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 p-4 text-center">
      <p class="text-[11px] uppercase tracking-wider text-emerald-400 font-bold">Target</p>
      <p class="num text-3xl font-black text-white mt-0.5">${first.runs + 1}</p>
      <p class="text-[11px] text-slate-400">${esc(teamName(first.bowlingTeamId))} need ${first.runs + 1} from ${m.innings[1].overs * 6} balls</p>
    </div>
    <button class="btn-primary w-full mt-5 !py-3.5" data-close="go">Start the chase 🏏</button>`, { grab: false });

  busy = false;
  ctx.render();
}

async function resultSheet(m, ctx) {
  busy = true;
  const states = m.innings.map((_, i) => E.computeInnings(m, i));
  const text = E.resultText(m, states, teamName) || 'Match complete';
  const cands = motmCandidates(m).slice(0, 6);

  const v = await sheet(`
    <div class="text-center">
      <p class="text-4xl animate-pop">🏆</p>
      <h3 class="mt-2 text-xl font-extrabold text-white leading-snug">${esc(text)}</h3>
      <p class="mt-1 text-xs text-slate-500">${states.map(s => `${teamName(s.battingTeamId)} ${s.runs}/${s.wickets} (${s.oversText})`).join(' · ')}</p>
    </div>
    <p class="label mt-6">Player of the match</p>
    <div class="grid gap-1.5 max-h-56 overflow-y-auto no-scrollbar">
      ${cands.map(c => `<button data-motm="${c.id}" class="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-left hover:bg-amber-500/10 hover:border-amber-500/30 active:scale-[.98] transition">
        <span class="h-8 w-8 grid place-items-center rounded-full bg-amber-500/15 text-[11px] font-bold text-amber-300">${esc(initials(nameOf(c.id)))}</span>
        <span class="flex-1 text-sm font-semibold text-white truncate">${esc(nameOf(c.id))}</span>
        <span class="text-[10px] text-slate-500">${esc(motmLine(states, c.id))}</span></button>`).join('')}
    </div>
    <div class="grid grid-cols-2 gap-3 mt-5">
      <button class="btn-ghost" data-close="skip">Skip</button>
      <button class="btn-primary" data-close="card">Full scorecard</button>
    </div>`, { grab: false });

  busy = false;
  if (v && v.startsWith('motm:')) {
    m.motm = v.slice(5);
    store.save(true);
    toast(`${nameOf(m.motm)} — player of the match`, 'ok');
  }
  ctx.go('/scorecard/' + m.id);
}

function motmLine(states, id) {
  const parts = [];
  for (const s of states) {
    const b = s.bat[id];
    if (b && b.b) parts.push(`${b.r}${b.out ? '' : '*'} (${b.b})`);
    const w = s.bowl[id];
    if (w && w.balls) parts.push(`${w.wkts}/${w.runs}`);
  }
  return parts.join(' · ') || '—';
}

/* ------------------------------------------------------------------ *
 * Overflow menu
 * ------------------------------------------------------------------ */

async function moreMenu(m, ctx) {
  const st = E.computeInnings(m, m.innings.length - 1);
  const item = (act, icon, label, sub, tone = 'text-white') => `
    <button data-menu="${act}" class="w-full flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 px-3.5 py-3 text-left hover:bg-white/10 active:scale-[.99] transition">
      <span class="text-lg w-6 text-center">${icon}</span>
      <span class="flex-1 min-w-0"><span class="block text-sm font-semibold ${tone}">${esc(label)}</span>
      <span class="block text-[11px] text-slate-500">${esc(sub)}</span></span></button>`;

  const v = await sheet(`
    <h3 class="text-lg font-bold text-white mb-4">Match options</h3>
    <div class="grid gap-2">
      ${m.status === 'live' ? item('bowler', '🎯', 'Change bowler', 'Injury or a mid-over switch') : ''}
      ${m.status === 'live' ? item('retire', '🚑', 'Retire a batter', 'Hurt (can return) or retired out') : ''}
      ${m.status === 'live' ? item('penalty', '⚖️', 'Penalty runs', 'Award 5 runs to the batting side') : ''}
      ${m.status === 'live' ? item('endinn', '⏹️', 'End this innings', 'Declaration, rain or agreement') : ''}
      ${item('card', '📋', 'Full scorecard', 'Batting, bowling, fall of wickets')}
      ${item('share', '📤', 'Share the score', 'Copy a text summary')}
      ${m.status === 'live' ? item('abandon', '🚫', 'Abandon the match', 'No result recorded', 'text-rose-300') : ''}
    </div>`, { grab: false });

  if (!v || !v.startsWith('menu:')) return;
  const act = v.slice(5);

  if (act === 'bowler') return askBowler(m, ctx, true);
  if (act === 'card')   return ctx.go('/scorecard/' + m.id);
  if (act === 'share')  return shareScore(m);

  if (act === 'retire') {
    const who = [st.striker, st.nonStriker].filter(Boolean);
    if (!who.length) return;
    const r = await sheet(`
      <h3 class="text-lg font-bold text-white mb-4">Retire a batter</h3>
      <div class="grid gap-2">
        ${who.map(id => `<div class="rounded-xl bg-white/5 border border-white/10 p-3">
          <p class="text-sm font-semibold text-white mb-2">${esc(nameOf(id))}</p>
          <div class="grid grid-cols-2 gap-2">
            <button data-ret="${id}:hurt" class="btn-chip">Retired hurt</button>
            <button data-ret="${id}:out" class="btn-chip">Retired out</button>
          </div></div>`).join('')}
      </div>`, { grab: false });
    if (!r || !r.startsWith('ret:')) return;
    const [id, kind] = r.slice(4).split(':');
    E.push(m, { t: 'retire', id, out: kind === 'out' });
    E.autoAdvance(m);
    store.save(); ctx.render();
    return;
  }

  if (act === 'penalty') {
    E.push(m, { t: 'pen', runs: 5 });
    E.autoAdvance(m);
    store.save(); toast('5 penalty runs added', 'ok'); ctx.render();
    return;
  }

  if (act === 'endinn') {
    if (!await confirmDlg('End this innings?',
      m.innings.length === 1 ? 'The chase will start with the target set from this score.' : 'The match result will be worked out from the current scores.', 'End innings')) return;
    E.endInnings(m, 'manual');
    store.save(true); ctx.render();
    return;
  }

  if (act === 'abandon') {
    if (!await confirmDlg('Abandon this match?', 'It will be saved with no result. You can still see the scorecard.', 'Abandon')) return;
    m.status = 'completed';
    m.result = { abandoned: true, winnerId: null, tie: false, type: 'abandoned', margin: 0 };
    store.save(true);
    toast('Match abandoned', 'info');
    ctx.go('/scorecard/' + m.id);
  }
}

export function scoreSummaryText(m) {
  const states = m.innings.map((_, i) => E.computeInnings(m, i));
  const lines = [`${teamName(m.teams[0])} v ${teamName(m.teams[1])}${m.venue ? ' · ' + m.venue : ''}`];
  states.forEach(s => lines.push(`${teamName(s.battingTeamId)}  ${s.runs}/${s.wickets} (${s.oversText} ov)`));
  const r = E.resultText(m, states, teamName);
  if (r) lines.push(r);
  const st = states[states.length - 1];
  if (m.status === 'live' && st.striker) {
    lines.push(`${shortName(nameOf(st.striker))} ${st.bat[st.striker].r}* (${st.bat[st.striker].b})`);
  }
  lines.push('', 'Scored with Cricket Scorer — by Kishor Kharade');
  return lines.join('\n');
}

async function shareScore(m) {
  const text = scoreSummaryText(m);
  if (navigator.share) { try { await navigator.share({ text }); return; } catch { /* cancelled */ } }
  const { copyText } = await import('../util.js');
  toast(await copyText(text) ? 'Score copied' : 'Could not copy', 'ok');
}

/* sheet result plumbing — every button just closes with a prefixed value */
document.addEventListener('click', e => {
  const map = ['pickbat:bat', 'pickbowl:bowl', 'out:out', 'who:who', 'field:field', 'wr:wr',
               'motm:motm', 'menu:menu', 'ret:ret'];
  for (const pair of map) {
    const [attr, prefix] = pair.split(':');
    const b = e.target.closest(`[data-${attr}]`);
    if (b && !b.disabled) { closeSheet(`${prefix}:${b.dataset[attr]}`); return; }
  }
});
