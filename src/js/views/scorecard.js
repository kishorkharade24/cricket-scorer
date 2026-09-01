/* Full scorecard for one match. */

import { esc, fixed, oversOf, shortName, copyText, toast, fmtDate, sheet, closeSheet, initials } from '../util.js';
import * as store from '../store.js';
import { badge, empty, teamName, teamShort, nameOf, tabs, ballChip, ICON, iconBtn } from '../ui.js';
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

/** What a tie looks like on the card, and the way out of it. */
function tieBreakCard(m) {
  if (!m.result?.tie) return '';
  const so = store.matches().filter(x => x.parentMatchId === m.id).sort((a, b) => a.superOverNumber - b.superOverNumber);
  const decided = m.tieBreak?.winnerId;

  const soRows = so.map(x => {
    const sts = statesOf(x);
    const line = sts.map(st => `${teamShort(st.battingTeamId)} ${st.runs}/${st.wickets}`).join('  ·  ');
    const done = x.status === 'completed';
    return `<a href="#/${done ? 'scorecard' : 'score'}/${x.id}"
      class="flex items-center gap-2.5 rounded-lg bg-white/[.05] px-3 py-2 mt-2 hover:bg-white/10 transition">
      <span class="text-[10px] font-bold uppercase tracking-wider ${done ? 'text-slate-500' : 'text-rose-300'}">${esc(x.stage)}</span>
      <span class="flex-1 num text-[12px] font-semibold text-white truncate">${esc(line || 'not started')}</span>
      <span class="text-slate-600">${done ? '›' : 'resume ›'}</span></a>`;
  }).join('');

  return `<div class="card p-4 mt-4">
    <div class="flex items-center gap-3">
      <span class="h-10 w-10 shrink-0 rounded-xl bg-amber-500/15 border border-amber-500/25 grid place-items-center text-lg">🤝</span>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-bold text-white">${decided ? 'Tie settled' : 'Scores level — what next?'}</p>
        <p class="text-[11px] text-slate-500">${decided
          ? `${esc(teamName(m.tieBreak.winnerId))} went through on the ${esc(m.tieBreak.method)}`
          : 'A tie is a tie for league points. A knockout still needs someone to go through.'}</p>
      </div>
    </div>
    ${soRows}
    <button data-act="tiebreak" class="btn-ghost w-full mt-3 text-xs">${decided ? 'Change how it was settled' : 'Decide it'}</button>
  </div>`;
}

async function tieBreakSheet(m, ctx) {
  if (!m) return;
  const opt = (act, icon, title, sub) => `
    <button data-tbopt="${act}" class="w-full flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 px-3.5 py-3 text-left hover:bg-white/10 active:scale-[.99] transition">
      <span class="text-lg w-6 text-center">${icon}</span>
      <span class="flex-1 min-w-0"><span class="block text-sm font-semibold text-white">${esc(title)}</span>
      <span class="block text-[11px] text-slate-500 leading-snug">${esc(sub)}</span></span>
      <span class="text-slate-600">›</span></button>`;

  const v = await sheet(`
    <h3 class="text-lg font-bold text-white">The scores are level</h3>
    <p class="text-xs text-slate-500 mt-1 leading-relaxed">In a league this stays a tie and both sides take a point.
      In a knockout somebody has to go through — pick how it was settled.</p>
    <div class="grid gap-2 mt-5">
      ${opt('super', '🏏', 'Play a Super Over', 'One over each, two wickets, scored ball by ball')}
      ${opt('record', '✍️', 'Just record the winner', 'Bowl-out, boundary count or a coin toss')}
      ${m.tieBreak?.winnerId ? opt('clear', '↩️', 'Leave it as a tie', 'Removes whatever was recorded') : ''}
    </div>
    <button class="btn-ghost w-full mt-4" data-close="__dismiss">Cancel</button>`, { grab: false });

  if (!v || !v.startsWith('tbopt:')) return;
  const choice = v.slice(6);

  if (choice === 'clear') {
    E.setTieBreak(m, null); store.save(true); toast('Left as a tie', 'ok'); ctx.render(); return;
  }
  if (choice === 'super') return startSuperOver(m, ctx);
  return recordWinnerSheet(m, ctx);
}

/** Pick three a side, then score it like any other match. */
async function startSuperOver(m, ctx) {
  const states = statesOf(m);
  // Default to the three who scored most in the match — the usual choice.
  const topThree = teamId => {
    const st = states.find(x => x.battingTeamId === teamId);
    const xi = m.xi[teamId] || [];
    const ranked = [...xi].sort((a, b) => ((st?.bat[b]?.r) || 0) - ((st?.bat[a]?.r) || 0));
    return ranked.slice(0, 3);
  };
  const picked = { [m.teams[0]]: topThree(m.teams[0]), [m.teams[1]]: topThree(m.teams[1]) };
  window.__soPick = picked;

  const pane = teamId => `
    <div class="mt-4">
      <div class="flex items-center gap-2 mb-2">
        ${badge(teamId, 'sm')}
        <p class="flex-1 text-sm font-bold text-white truncate">${esc(teamName(teamId))}</p>
        <span class="num text-[11px] font-bold text-emerald-400" data-socount="${teamId}">${picked[teamId].length}/3</span>
      </div>
      <div class="grid gap-1.5 max-h-40 overflow-y-auto no-scrollbar">
        ${(m.xi[teamId] || []).map(id => {
          const on = picked[teamId].includes(id);
          return `<button data-sopick="${teamId}:${id}" class="flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition ${
            on ? 'bg-emerald-500/12 border-emerald-500/35' : 'bg-white/[.03] border-white/8'}">
            <span class="h-6 w-6 shrink-0 grid place-items-center rounded-full bg-white/8 text-[9px] font-bold text-slate-300">${esc(initials(nameOf(id)))}</span>
            <span class="flex-1 min-w-0 text-xs font-semibold truncate ${on ? 'text-white' : 'text-slate-400'}">${esc(nameOf(id))}</span>
            ${on ? '<span class="text-emerald-400 text-xs">✓</span>' : ''}</button>`;
        }).join('')}
      </div>
    </div>`;

  const chased = m.innings[1]?.battingTeamId || m.teams[1];
  const v = await sheet(`
    <h3 class="text-lg font-bold text-white">Super Over</h3>
    <p class="text-xs text-slate-500 mt-1 leading-relaxed">One over each and two wickets ends an innings.
      <b class="text-slate-300">${esc(teamName(chased))}</b> bat first, having chased.
      Three batters a side — the bowler is chosen when you start.</p>
    ${pane(m.teams[0])}
    ${pane(m.teams[1])}
    <div class="mt-5 grid grid-cols-2 gap-3">
      <button class="btn-ghost" data-close="__dismiss">Cancel</button>
      <button class="btn-primary" data-close="go">Start Super Over</button>
    </div>`, { grab: false });

  if (v !== 'go') return;
  const sel = window.__soPick;
  if (m.teams.some(t => (sel[t] || []).length < 2)) { toast('Pick at least two players a side', 'warn'); return; }

  const previous = store.matches().filter(x => x.parentMatchId === m.id).length;
  const so = E.newSuperOver(m, { [m.teams[0]]: sel[m.teams[0]], [m.teams[1]]: sel[m.teams[1]] },
                            { number: previous + 1 });
  store.addMatch(so);
  ctx.go('/score/' + so.id);
}

/** The short path: no ball-by-ball, just who went through and how. */
async function recordWinnerSheet(m, ctx) {
  const METHODS = ['Bowl-out', 'Boundary count', 'Coin toss', 'Super Over'];
  const v = await sheet(`
    <h3 class="text-lg font-bold text-white">Who went through?</h3>
    <p class="label mt-5">Settled by</p>
    <div class="grid grid-cols-2 gap-2" id="tbMethod">
      ${METHODS.map((x, i) => `<button type="button" data-tbm="${esc(x)}"
        class="rounded-xl border px-3 py-2.5 text-xs font-bold transition ${(m.tieBreak?.method || METHODS[0]) === x
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
    <button class="btn-ghost w-full mt-5" data-close="__dismiss">Cancel</button>`, { grab: false });

  if (!v || !v.startsWith('tbwin:')) return;
  E.setTieBreak(m, v.slice(6), window.__tbMethod || m.tieBreak?.method || 'Bowl-out');
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
  const opt = e.target.closest('[data-tbopt]');
  if (opt) { closeSheet('tbopt:' + opt.dataset.tbopt); return; }

  const pick = e.target.closest('[data-sopick]');
  if (pick) {
    const [tid, pid] = pick.dataset.sopick.split(':');
    const sel = window.__soPick;
    if (!sel) return;
    const list = sel[tid] || (sel[tid] = []);
    const i = list.indexOf(pid);
    if (i >= 0) list.splice(i, 1);
    else if (list.length >= 3) { toast('Three a side in a Super Over', 'warn'); return; }
    else list.push(pid);
    // repaint just this row and the counter
    const on = list.includes(pid);
    pick.className = pick.className
      .replace('bg-emerald-500/12 border-emerald-500/35', 'bg-white/[.03] border-white/8')
      .replace('bg-white/[.03] border-white/8', on ? 'bg-emerald-500/12 border-emerald-500/35' : 'bg-white/[.03] border-white/8');
    const label = pick.querySelector('span:nth-child(2)');
    if (label) label.classList.toggle('text-white', on);
    const counter = document.querySelector(`[data-socount="${tid}"]`);
    if (counter) counter.textContent = `${list.length}/3`;
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
