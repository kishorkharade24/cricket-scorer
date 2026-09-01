/* Full scorecard for one match. */

import { esc, fixed, oversOf, shortName, copyText, toast, fmtDate, sheet, closeSheet } from '../util.js';
import * as store from '../store.js';
import { badge, empty, teamName, nameOf, tabs, ballChip, ICON, iconBtn } from '../ui.js';
import * as E from '../engine.js';
import { statesOf } from '../stats.js';

let tab = 0;

export default {
  nav: 'matches',
  back: true,
  title: ctx => {
    const m = store.match(ctx.id);
    return m ? `${store.team(m.teams[0])?.short} v ${store.team(m.teams[1])?.short}` : 'Scorecard';
  },
  sub: ctx => {
    const m = store.match(ctx.id);
    if (!m) return '';
    return `${fmtDate(m.createdAt)}${m.venue ? ' · ' + m.venue : ''} · ${m.overs} ov`;
  },
  actions: ctx => {
    const m = store.match(ctx.id);
    const live = m?.status === 'live';
    return `${live ? `<a href="#/score/${ctx.id}" class="btn-primary !px-3 !py-2 text-xs">Resume</a>` : ''}
      ${iconBtn('share', ICON.share, 'Share scorecard')}`;
  },

  render(ctx) {
    const m = store.match(ctx.id);
    if (!m) return empty('❓', 'Scorecard not found', 'This match may have been deleted.', `<a href="#/matches" class="btn-ghost">All matches</a>`);

    const states = statesOf(m);
    if (tab >= states.length) tab = 0;
    const st = states[tab];
    const res = E.resultText(m, states, teamName);

    return `
      ${header(m, states, res)}
      ${tieBreakCard(m)}
      ${states.length > 1 ? tabs(states.map((s, i) => ({
          key: String(i), label: `${store.team(s.battingTeamId)?.short || 'INN'} ${s.runs}/${s.wickets}`
        })), String(tab)) : ''}
      <div class="mt-4 space-y-4">
        ${battingTable(st)}
        ${bowlingTable(st)}
        ${fowRow(st)}
        ${partnerships(st)}
        ${overByOver(st)}
      </div>`;
  },

  mount(root, ctx) {
    root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { tab = +b.dataset.tab; ctx.render(); }));
    root.querySelector('[data-act="tiebreak"]')?.addEventListener('click', () => tieBreakSheet(store.match(ctx.id), ctx));
    document.querySelector('#pageActions [data-act="share"]')?.addEventListener('click', async () => {
      const m = store.match(ctx.id);
      const text = fullText(m);
      if (navigator.share) { try { await navigator.share({ text }); return; } catch { /* cancelled */ } }
      toast(await copyText(text) ? 'Scorecard copied' : 'Could not copy', 'ok');
    });
  }
};

/* ------------------------------------------------------------------ */

/** A tie has to send someone through in a knockout — offer that here too, not
 *  only on the one-off result screen that appears when the match ends. */
function tieBreakCard(m) {
  if (!m.result?.tie) return '';
  const done = m.tieBreak?.winnerId;
  return `<button data-act="tiebreak" class="w-full card-h p-4 mt-4 flex items-center gap-3 text-left">
    <span class="h-10 w-10 shrink-0 rounded-xl bg-amber-500/15 border border-amber-500/25 grid place-items-center text-lg">🤝</span>
    <span class="flex-1 min-w-0">
      <span class="block text-sm font-bold text-white">${done ? 'Tie settled' : 'Scores level — who went through?'}</span>
      <span class="block text-[11px] text-slate-500">${done
        ? `${esc(teamName(m.tieBreak.winnerId))} won the ${esc(m.tieBreak.method)} · tap to change`
        : 'Record a Super Over or bowl-out winner so a knockout bracket can carry on'}</span></span>
    <span class="text-slate-600">›</span></button>`;
}

async function tieBreakSheet(m, ctx) {
  if (!m) return;
  const METHODS = ['Super Over', 'Bowl-out', 'Boundary count', 'Coin toss'];
  const v = await sheet(`
    <h3 class="text-lg font-bold text-white">How was the tie settled?</h3>
    <p class="text-xs text-slate-500 mt-1">League points are not affected — a tie stays a tie. This only
      decides who goes through in a knockout.</p>
    <p class="label mt-5">Method</p>
    <div class="grid grid-cols-2 gap-2" id="tbMethod">
      ${METHODS.map((x, i) => `<button type="button" data-tbm="${esc(x)}"
        class="rounded-xl border px-3 py-2.5 text-xs font-bold transition ${(m.tieBreak?.method || 'Super Over') === x
          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'bg-white/5 border-white/10 text-slate-400'}">${esc(x)}</button>`).join('')}
    </div>
    <p class="label mt-5">Winner</p>
    <div class="grid gap-2">
      ${m.teams.map(tid => `<button data-tbwin="${tid}" class="flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition active:scale-[.98] ${
        m.tieBreak?.winnerId === tid ? 'bg-amber-500/15 border-amber-500/35' : 'bg-white/5 border-white/10 hover:bg-white/10'}">
        ${badge(tid, 'sm')}
        <span class="flex-1 text-sm font-semibold text-white truncate">${esc(teamName(tid))}</span>
        ${m.tieBreak?.winnerId === tid ? '<span class="text-amber-300">✓</span>' : ''}</button>`).join('')}
    </div>
    <div class="mt-5 grid ${m.tieBreak?.winnerId ? 'grid-cols-2' : 'grid-cols-1'} gap-3">
      <button class="btn-ghost" data-close="__dismiss">Cancel</button>
      ${m.tieBreak?.winnerId ? '<button class="btn-danger" data-close="clear">Clear</button>' : ''}
    </div>`, { grab: false });

  if (v === 'clear') { E.setTieBreak(m, null); store.save(true); toast('Tie-break cleared', 'ok'); ctx.render(); return; }
  if (!v || !v.startsWith('tbwin:')) return;
  const method = window.__tbMethod || m.tieBreak?.method || 'Super Over';
  E.setTieBreak(m, v.slice(6), method);
  store.save(true);
  toast(`${teamName(m.tieBreak.winnerId)} went through`, 'ok');
  ctx.render();
}

document.addEventListener('click', e => {
  const meth = e.target.closest('#tbMethod [data-tbm]');
  if (meth) {
    meth.parentElement.querySelectorAll('[data-tbm]').forEach(b =>
      b.className = b.className.replace('bg-emerald-500/15 border-emerald-500/40 text-emerald-300', 'bg-white/5 border-white/10 text-slate-400'));
    meth.className = meth.className.replace('bg-white/5 border-white/10 text-slate-400', 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300');
    window.__tbMethod = meth.dataset.tbm;
    return;
  }
  const win = e.target.closest('[data-tbwin]');
  if (win) closeSheet('tbwin:' + win.dataset.tbwin);
});

function header(m, states, res) {
  const t = m.tournamentId ? store.tournament(m.tournamentId) : null;
  const line = s => `<div class="flex items-center gap-3">
      ${badge(s.battingTeamId, 'sm')}
      <span class="flex-1 min-w-0 text-sm font-semibold text-white truncate">${esc(teamName(s.battingTeamId))}</span>
      <span class="num text-base font-extrabold text-white">${s.runs}/${s.wickets}</span>
      <span class="num text-[11px] text-slate-500 w-12 text-right">(${s.oversText})</span>
    </div>`;

  const toss = m.toss?.winnerId
    ? `${teamName(m.toss.winnerId)} won the toss and chose to ${m.toss.decision}`
    : '';

  return `<div class="card p-5 animate-slide-up">
    ${t ? `<a href="#/tournament/${t.id}" class="text-[11px] font-bold text-amber-300">${esc(t.name)}${m.stage ? ' · ' + esc(m.stage) : ''}</a>` : ''}
    <div class="space-y-2.5 ${t ? 'mt-3' : ''}">${states.map(line).join('')}</div>
    ${res ? `<p class="mt-4 pt-3 border-t border-white/[.07] text-sm font-bold ${m.result?.tie ? 'text-amber-300' : 'text-emerald-300'}">${esc(res)}</p>` : ''}
    ${m.motm ? `<p class="mt-1 text-[11px] text-slate-400">🏅 Player of the match — <b class="text-white">${esc(nameOf(m.motm))}</b></p>` : ''}
    ${toss ? `<p class="mt-1 text-[11px] text-slate-600">${esc(toss)}</p>` : ''}
  </div>`;
}

function battingTable(st) {
  const rows = E.battingRows(st, nameOf);
  const dnb = st.battingXI.filter(id => !st.bat[id]);
  return `<div class="card p-4">
    <div class="flex items-center gap-2 mb-3">
      ${badge(st.battingTeamId, 'sm')}
      <h3 class="text-sm font-bold text-white">${esc(teamName(st.battingTeamId))} innings</h3>
      <span class="ml-auto num text-sm font-extrabold text-white">${st.runs}/${st.wickets}</span>
    </div>
    <div class="overflow-x-auto no-scrollbar -mx-1 px-1">
    <table class="tbl w-full min-w-[300px]">
      <thead><tr><th>Batter</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead>
      <tbody>
        ${rows.map(r => `<tr class="${r.out ? '' : 'text-emerald-200'}">
          <td><span class="font-semibold ${r.out ? 'text-slate-200' : 'text-emerald-300'}">${esc(shortName(r.name))}</span>
            <span class="block text-[10px] text-slate-500 leading-tight">${esc(r.how)}</span></td>
          <td class="font-bold text-white">${r.r}</td><td>${r.b}</td><td>${r.f4}</td><td>${r.f6}</td>
          <td class="text-slate-400">${fixed(r.sr, 0)}</td></tr>`).join('')}
        <tr><td class="text-slate-400">Extras</td>
          <td class="font-bold text-white">${st.extrasTotal}</td>
          <td colspan="4" class="text-left pl-2 text-[10px] text-slate-500 !whitespace-normal">
            (b ${st.extras.bye}, lb ${st.extras.legbye}, w ${st.extras.wide}, nb ${st.extras.noball}${st.extras.penalty ? `, p ${st.extras.penalty}` : ''})</td></tr>
        <tr class="bg-white/[.04]"><td class="font-bold text-white">Total</td>
          <td class="font-extrabold text-white">${st.runs}</td>
          <td colspan="4" class="text-left pl-2 text-[11px] text-slate-400 !whitespace-normal">
            ${st.wickets} wkt${st.wickets === 1 ? '' : 's'}, ${st.oversText} ov · RR ${fixed(st.crr)}</td></tr>
      </tbody>
    </table></div>
    ${dnb.length ? `<p class="mt-2.5 text-[11px] text-slate-500"><span class="text-slate-400 font-semibold">Did not bat:</span> ${dnb.map(id => esc(shortName(nameOf(id)))).join(', ')}</p>` : ''}
  </div>`;
}

function bowlingTable(st) {
  const rows = E.bowlingRows(st, nameOf);
  if (!rows.length) return '';
  return `<div class="card p-4">
    <div class="flex items-center gap-2 mb-3">
      ${badge(st.bowlingTeamId, 'sm')}
      <h3 class="text-sm font-bold text-white">${esc(teamName(st.bowlingTeamId))} bowling</h3>
    </div>
    <div class="overflow-x-auto no-scrollbar -mx-1 px-1">
    <table class="tbl w-full min-w-[270px]">
      <thead><tr><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Econ</th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td class="font-semibold text-slate-200">${esc(shortName(r.name))}
          ${r.wd || r.nb ? `<span class="block text-[9px] text-slate-600 leading-tight">${[r.wd ? r.wd + ' wd' : '', r.nb ? r.nb + ' nb' : ''].filter(Boolean).join(', ')}</span>` : ''}</td>
        <td>${r.o}</td><td>${r.m}</td><td>${r.r}</td>
        <td class="font-bold ${r.w >= 3 ? 'text-emerald-300' : 'text-white'}">${r.w}</td>
        <td class="text-slate-400">${fixed(r.econ)}</td></tr>`).join('')}
      </tbody></table></div>
  </div>`;
}

function fowRow(st) {
  if (!st.fow.length) return '';
  return `<div class="card p-4">
    <h3 class="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2.5">Fall of wickets</h3>
    <div class="flex flex-wrap gap-x-3 gap-y-1.5 text-[11px]">
      ${st.fow.map(f => `<span class="num text-slate-400">
        <b class="text-white">${f.runs}-${f.w}</b> (${esc(shortName(nameOf(f.batter)))}, ${oversOf(f.balls)})</span>`).join('')}
    </div></div>`;
}

function partnerships(st) {
  const list = [...st.partnerships];
  if (st.partner && st.partner.balls) list.push({ ...st.partner, out: null });
  if (!list.length) return '';
  const max = Math.max(...list.map(p => p.runs), 1);
  return `<div class="card p-4">
    <h3 class="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3">Partnerships</h3>
    <div class="space-y-2">
      ${list.map((p, i) => `<div>
        <div class="flex items-center gap-2 text-[11px] mb-1">
          <span class="num text-slate-600 w-4">${i + 1}</span>
          <span class="flex-1 truncate text-slate-400">${esc(shortName(nameOf(p.a)))} &amp; ${esc(shortName(nameOf(p.b)))}</span>
          <span class="num font-bold text-white">${p.runs}</span>
          <span class="num text-slate-600">(${p.balls})</span>
        </div>
        <div class="h-1.5 rounded-full bg-white/[.06] overflow-hidden">
          <div class="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-400 transition-all duration-500" style="width:${(p.runs / max) * 100}%"></div>
        </div></div>`).join('')}
    </div></div>`;
}

function overByOver(st) {
  const overs = [...st.overs];
  if (st.curOver && st.curOver.balls.length) overs.push(st.curOver);
  if (!overs.length) return '';
  let running = 0;
  return `<div class="card p-4">
    <h3 class="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3">Over by over</h3>
    <div class="space-y-2.5">
      ${overs.map(o => {
        running += o.runs;
        return `<div class="flex items-start gap-2">
          <span class="num text-[11px] font-bold text-slate-500 w-4 pt-0.5">${o.n}</span>
          <div class="flex flex-wrap gap-1 flex-1 min-w-0">${o.balls.map(c => ballChip(c, 0, true)).join('')}</div>
          <span class="num text-[11px] font-bold text-white w-6 text-right pt-0.5">${o.runs}</span>
          <span class="num text-[10px] text-slate-600 w-8 text-right pt-0.5">${running}</span>
        </div>`;
      }).join('')}
    </div></div>`;
}

/* ------------------------------------------------------------------ */

export function fullText(m) {
  const states = statesOf(m);
  const L = [];
  L.push(`${teamName(m.teams[0])} v ${teamName(m.teams[1])}`);
  if (m.venue) L.push(m.venue);
  L.push(`${fmtDate(m.createdAt)} · ${m.overs} overs a side`);
  L.push('');
  for (const st of states) {
    L.push(`${teamName(st.battingTeamId)} — ${st.runs}/${st.wickets} (${st.oversText})`);
    E.battingRows(st, nameOf).forEach(r => L.push(`  ${r.name.padEnd(20)} ${r.how.padEnd(22)} ${String(r.r).padStart(3)} (${r.b})`));
    L.push(`  Extras: ${st.extrasTotal} (b ${st.extras.bye}, lb ${st.extras.legbye}, w ${st.extras.wide}, nb ${st.extras.noball})`);
    L.push('');
    E.bowlingRows(st, nameOf).forEach(r => L.push(`  ${r.name.padEnd(20)} ${r.o}-${r.m}-${r.r}-${r.w}`));
    L.push('');
  }
  const res = E.resultText(m, states, teamName);
  if (res) L.push(res);
  if (m.motm) L.push(`Player of the match: ${nameOf(m.motm)}`);
  L.push('', 'Scored with Cricket Scorer — by Kishor Kharade');
  return L.join('\n');
}
