/* Tournament detail — fixtures, points table, bracket and leaderboards. */

import { esc, fixed, confirmDlg, toast, copyText, sheet } from '../util.js';
import * as store from '../store.js';
import { badge, empty, teamName, nameOf, tabs, ICON, iconBtn } from '../ui.js';
import { resolveSlot, playoffFixtures, iplPlayoffs, thirdPlaceFixture } from '../fixtures.js';
import { pointsTable, leaderboards, statesOf } from '../stats.js';
import * as live from '../live.js';
import { renderQR } from '../qr.js';
import { resultText } from '../engine.js';

let tab = 'fixtures';

export default {
  nav: 'cups',
  back: '/tournaments',
  title: ctx => store.tournament(ctx.id)?.name || 'Tournament',
  sub: ctx => {
    const t = store.tournament(ctx.id);
    if (!t) return '';
    const done = store.matches().filter(m => m.tournamentId === t.id && m.status === 'completed').length;
    return `${t.teamIds.length} teams · ${done}/${(t.fixtures || []).length} played · ${t.overs} ov`;
  },
  actions: () => {
    const antenna = '<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 11v9"/><circle cx="12" cy="9.5" r="1.6" fill="currentColor" stroke="none"/><path d="M8.5 6a5 5 0 0 0 0 7M15.5 6a5 5 0 0 1 0 7M5.6 3.4a9 9 0 0 0 0 12.2M18.4 3.4a9 9 0 0 1 0 12.2"/></svg>';
    return `${iconBtn('livecode', antenna, 'Live scoreboard QR')}${iconBtn('share', ICON.share, 'Share standings')}${iconBtn('del', ICON.trash, 'Delete tournament', 'hover:text-rose-300')}`;
  },

  render(ctx) {
    const t = store.tournament(ctx.id);
    if (!t) return empty('❓', 'Tournament not found', 'It may have been deleted.', `<a href="#/tournaments" class="btn-ghost">All tournaments</a>`);

    const isKO = t.format === 'knockout';
    const items = [
      { key: 'fixtures', label: 'Fixtures', count: (t.fixtures || []).length },
      { key: 'table', label: isKO ? 'Results' : 'Points table' },
      ...(isKO ? [{ key: 'bracket', label: 'Bracket' }] : []),
      { key: 'stats', label: 'Leaders' }
    ];
    if (!items.some(i => i.key === tab)) tab = 'fixtures';

    return `${tabs(items, tab)}
      <div class="mt-4">
        ${tab === 'fixtures' ? fixturesView(t)
          : tab === 'table' ? tableView(t)
          : tab === 'bracket' ? bracketView(t)
          : statsView(t)}
      </div>`;
  },

  mount(root, ctx) {
    const t = store.tournament(ctx.id);
    if (!t) return;

    root.querySelectorAll('[data-tab]').forEach(b =>
      b.addEventListener('click', () => { tab = b.dataset.tab; ctx.render(); }));

    root.querySelectorAll('[data-play]').forEach(b => b.addEventListener('click', () => {
      const fx = (t.fixtures || []).find(f => f.id === b.dataset.play);
      const a = resolveSlot(fx.a, t.fixtures, store.match);
      const bb = resolveSlot(fx.b, t.fixtures, store.match);
      if (!a || !bb) return toast('Both sides are not decided yet', 'warn');
      ctx.go(`/match/new?t=${t.id}&f=${fx.id}&a=${a}&b=${bb}`);
    }));

    root.querySelector('[data-act="playoffs"]')?.addEventListener('click', async () => {
      const table = pointsTable(t, store.matches()).filter(r => r.p > 0);
      if (table.length < 2) return toast('Play some league matches first', 'warn');
      const four = table.length >= 4;
      const names = n => table.slice(0, n).map(r => teamName(r.teamId)).join(', ');

      let choice = 'simple';
      if (four) {
        const v = await sheet(`
          <h3 class="text-lg font-bold text-white">How should the playoffs run?</h3>
          <p class="text-xs text-slate-500 mt-1">Top four qualify: ${esc(names(4))}.</p>
          <div class="mt-4 grid gap-2">
            <button data-close="simple" class="w-full rounded-xl bg-white/5 border border-white/10 px-3.5 py-3 text-left hover:bg-white/10 transition">
              <span class="block text-sm font-semibold text-white">Semi-finals + Final</span>
              <span class="block text-[11px] text-slate-500">1st v 4th, 2nd v 3rd — winners meet. Lose once and you are out.</span></button>
            <button data-close="ipl" class="w-full rounded-xl bg-white/5 border border-white/10 px-3.5 py-3 text-left hover:bg-white/10 transition">
              <span class="block text-sm font-semibold text-white">IPL-style Qualifiers</span>
              <span class="block text-[11px] text-slate-500">Qualifier 1 (1st v 2nd), Eliminator (3rd v 4th), then the Qualifier 1
                loser meets the Eliminator winner for the last Final spot.</span></button>
            <button data-close="__dismiss" class="btn-ghost">Cancel</button>
          </div>`, { grab: false });
        if (v !== 'simple' && v !== 'ipl') return;
        choice = v;
      } else if (!await confirmDlg('Add a final?', `The top two qualify: ${names(2)}.`, 'Add the final', false)) {
        return;
      }

      const seeds = table.slice(0, four ? 4 : 2).map(r => r.teamId);
      t.fixtures.push(...(choice === 'ipl' ? iplPlayoffs(seeds) : playoffFixtures(seeds)));
      t.tableStages = t.tableStages || ['League', ...(t.groups || []).map(g => `Group ${g.name}`)];
      store.save(true);
      toast(choice === 'ipl' ? 'Qualifier fixtures added' : 'Playoff fixtures added', 'ok');
      ctx.render();
    });

    root.querySelector('[data-act="third"]')?.addEventListener('click', () => {
      const semis = (t.fixtures || []).filter(f => f.stage === 'Semi-Final');
      const maxRound = Math.max(...t.fixtures.map(f => f.round || 1));
      t.fixtures.push(thirdPlaceFixture(semis[0], semis[1], maxRound));
      store.save(true);
      toast('3rd-place match added', 'ok');
      ctx.render();
    });

    root.querySelectorAll('[data-editfx]').forEach(b => b.addEventListener('click', () => editFixture(t, b.dataset.editfx, ctx)));
    root.querySelectorAll('[data-delfx]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirmDlg('Remove this fixture?', 'Only the unplayed fixture goes — nothing that has been scored is touched.', 'Remove')) return;
      t.fixtures = t.fixtures.filter(f => f.id !== b.dataset.delfx);
      store.save(true);
      ctx.render();
    }));
    root.querySelectorAll('[data-act="addfx"]').forEach(b => b.addEventListener('click', () => editFixture(t, null, ctx)));
    root.querySelectorAll('[data-fxmove]').forEach(b => b.addEventListener('click', () => {
      const [fid, dir] = b.dataset.fxmove.split(':');
      const arr = t.fixtures;
      const i = arr.findIndex(f => f.id === fid);
      const j = dir === 'up' ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      store.save(true);
      ctx.render();
    }));

    document.querySelector('#pageActions [data-act="livecode"]')?.addEventListener('click', () => liveQrSheet(t));

    document.querySelector('#pageActions [data-act="del"]')?.addEventListener('click', async () => {
      if (!await confirmDlg(`Delete ${t.name}?`, 'The fixture list and table go away. Choose whether the matches themselves are also deleted.', 'Delete')) return;
      const also = await confirmDlg('Delete its matches too?', 'Keep them and they become standalone matches in your Matches list.', 'Delete matches too');
      store.deleteTournament(t.id, also);
      toast('Tournament deleted', 'ok');
      ctx.go('/tournaments');
    });

    document.querySelector('#pageActions [data-act="share"]')?.addEventListener('click', async () => {
      const text = standingsText(t);
      if (navigator.share) { try { await navigator.share({ text }); return; } catch { /* cancelled */ } }
      toast(await copyText(text) ? 'Standings copied' : 'Could not copy', 'ok');
    });
  }
};

/**
 * The tournament's standing live-scoreboard QR. It exists before a ball is
 * bowled, so it can go on the poster or in the group chat: scan it any time,
 * and when a match in this tournament goes live the scorer taps Accept.
 */
async function liveQrSheet(t) {
  let code;
  try { code = await live.roomCodeOf(t); }
  catch (err) { console.error(err); toast('Could not create the code', 'error'); return; }

  const p = sheet(`
    <h3 class="text-lg font-bold text-white">Live scoreboard QR</h3>
    <p class="text-xs text-slate-500 mt-1 leading-snug">One code for the whole tournament — print it, put it in the
      group, stick it by the pitch. Anyone can scan it <b class="text-slate-300">before play even starts</b>, from the ground or from home;
      when a match goes live, the scorer taps Accept and they are in. Needs internet on both sides
      (a hotspot counts).</p>
    <div class="mt-3 rounded-2xl bg-pure p-2.5 grid place-items-center">
      <canvas id="tQr" class="w-full max-w-[300px] aspect-square [image-rendering:pixelated]"></canvas>
    </div>
    <div class="mt-3 grid grid-cols-3 gap-2">
      <button data-close="copy" class="btn-ghost text-xs">Copy code</button>
      <button data-close="save" class="btn-ghost text-xs">Save image</button>
      <button data-close="__dismiss" class="btn-primary text-xs">Done</button>
    </div>`, { grab: false });

  const canvas = document.querySelector('#tQr');
  await renderQR(code, { canvas });
  canvas.dataset.code = code;

  const v = await p;
  if (v === 'copy') {
    toast(await copyText(code) ? 'Code copied' : 'Could not copy', 'ok');
    return liveQrSheet(t);
  }
  if (v === 'save') {
    const out = document.createElement('canvas');
    const Q = 840, PADQ = 60;
    out.width = Q; out.height = Q + 110;
    const cx = out.getContext('2d');
    cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, out.width, out.height);
    cx.imageSmoothingEnabled = false;
    cx.drawImage(canvas, PADQ, PADQ, Q - PADQ * 2, Q - PADQ * 2);
    cx.fillStyle = '#0f172a'; cx.textAlign = 'center';
    cx.font = '700 40px system-ui, sans-serif';
    cx.fillText(t.name, Q / 2, Q + 8, Q - 80);
    cx.font = '500 26px system-ui, sans-serif';
    cx.fillStyle = '#64748b';
    cx.fillText('Scan to watch live — Cricket Scorer', Q / 2, Q + 52, Q - 80);
    out.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${t.name.replace(/\s+/g, '-')}-live-qr.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    }, 'image/png');
    toast('QR image saved — print it or share it', 'ok');
    return liveQrSheet(t);
  }
}

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

function fixturesView(t) {
  const fixtures = t.fixtures || [];
  if (!fixtures.length) {
    return empty('📅', t.format === 'custom' ? 'Your schedule, your rules' : 'No fixtures',
      t.format === 'custom'
        ? 'Add fixtures one by one — any pairing, any stage, any order. Nothing is decided for you.'
        : 'Something went wrong building the schedule.',
      '<button data-act="addfx" class="btn-primary">+ Add the first fixture</button>');
  }

  const groups = new Map();
  for (const f of fixtures) {
    const key = f.playoff ? `Playoffs · ${f.stage}` : (f.group ? `Group ${f.group} · Round ${f.round}` : `${f.stage === 'League' ? 'Round' : f.stage} ${f.stage === 'League' ? f.round : ''}`.trim());
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }

  const leagueDone = t.format !== 'knockout' &&
    fixtures.filter(f => !f.playoff).every(f => store.match(f.matchId)?.status === 'completed') &&
    !fixtures.some(f => f.playoff);

  const semis = fixtures.filter(f => f.stage === 'Semi-Final');
  const thirdPossible = semis.length === 2 &&
    semis.every(f => store.match(f.matchId)?.status === 'completed') &&
    !fixtures.some(f => f.stage === '3rd Place');

  return `
    ${leagueDone ? `<button data-act="playoffs" class="w-full card-h p-4 mb-4 flex items-center gap-3 text-left">
      <span class="h-10 w-10 rounded-xl bg-amber-500/15 border border-amber-500/25 grid place-items-center text-lg">🏅</span>
      <span class="flex-1"><span class="block text-sm font-bold text-white">League complete — add playoffs</span>
      <span class="block text-[11px] text-slate-500">Semi-finals and a final from the top of the table</span></span>
      <span class="text-slate-600">›</span></button>` : ''}
    ${thirdPossible ? `<button data-act="third" class="w-full card-h p-4 mb-4 flex items-center gap-3 text-left">
      <span class="h-10 w-10 rounded-xl bg-amber-500/15 border border-amber-500/25 grid place-items-center text-lg">🥉</span>
      <span class="flex-1"><span class="block text-sm font-bold text-white">Add a 3rd-place match</span>
      <span class="block text-[11px] text-slate-500">The two semi-final losers play for bronze</span></span>
      <span class="text-slate-600">›</span></button>` : ''}
    ${[...groups.entries()].map(([label, list]) => `
      <div class="mb-5">
        <h3 class="text-[11px] font-bold uppercase tracking-[.12em] text-slate-500 mb-2.5">${esc(label)}</h3>
        <div class="grid gap-2">${list.map(f => fixtureRow(f, t)).join('')}</div>
      </div>`).join('')}
    <button data-act="addfx" class="w-full rounded-2xl border border-dashed border-white/15 py-3 text-xs font-semibold text-slate-400 hover:text-emerald-300 hover:border-emerald-400/40 transition">
      + Add a fixture of your own</button>`;
}

/** Change who plays whom, for a fixture nobody has scored yet. */
async function editFixture(t, fixtureId, ctx) {
  const fx = fixtureId ? t.fixtures.find(f => f.id === fixtureId) : null;
  const cur = k => (fx?.[k]?.type === 'team' ? fx[k].id : '');
  const opts = sel => t.teamIds.map(id =>
    `<option value="${id}" ${id === sel ? 'selected' : ''}>${esc(teamName(id))}</option>`).join('');

  const p = sheet(`
    <h3 class="text-lg font-bold text-white">${fx ? 'Edit fixture' : 'Add a fixture'}</h3>
    <p class="text-xs text-slate-500 mt-1">You decide who goes against whom — the auto-draw is only a starting point.</p>
    <label class="label mt-4">Team A</label>
    <select id="fxA" class="field">${opts(cur('a'))}</select>
    <label class="label mt-3">Team B</label>
    <select id="fxB" class="field">${opts(cur('b') || t.teamIds.find(id => id !== (cur('a') || t.teamIds[0])))}</select>
    <label class="label mt-3">Stage <span class="normal-case text-slate-600">(labels the fixture; a Final crowns the champion)</span></label>
    <select id="fxStage" class="field">
      ${['League', 'Quarter-Final', 'Semi-Final', 'Qualifier 1', 'Eliminator', 'Qualifier 2', '3rd Place', 'Final']
        .map(st => `<option ${st === (fx?.stage || 'League') ? 'selected' : ''}>${st}</option>`).join('')}
    </select>
    <div class="mt-5 grid grid-cols-2 gap-3">
      <button class="btn-ghost" data-close="__dismiss">Cancel</button>
      <button class="btn-primary" data-close="savefx">${fx ? 'Save' : 'Add'}</button>
    </div>`, { grab: false });

  // Read the selects while they exist — the sheet's close wipes its DOM before
  // any later listener gets a look at it.
  let a = document.querySelector('#fxA')?.value;
  let b = document.querySelector('#fxB')?.value;
  let stage = document.querySelector('#fxStage')?.value || 'League';
  document.querySelector('#fxA')?.addEventListener('change', e => { a = e.target.value; });
  document.querySelector('#fxB')?.addEventListener('change', e => { b = e.target.value; });
  document.querySelector('#fxStage')?.addEventListener('change', e => { stage = e.target.value; });

  const v = await p;
  if (v !== 'savefx') return;

  if (!a || !b || a === b) return toast('Pick two different teams', 'warn');
  if (fx) {
    fx.a = { type: 'team', id: a };
    fx.b = { type: 'team', id: b };
    fx.stage = stage;
  } else {
    const { uid } = await import('../util.js');
    t.fixtures.push({ id: uid('fx'), stage, round: Math.max(1, ...t.fixtures.map(x => x.round || 1)),
      no: t.fixtures.length + 1, a: { type: 'team', id: a }, b: { type: 'team', id: b }, matchId: null });
  }
  store.save(true);
  ctx.render();
}

function fixtureRow(f, t) {
  const m = f.matchId ? store.match(f.matchId) : null;
  const a = resolveSlot(f.a, t.fixtures, store.match);
  const b = resolveSlot(f.b, t.fixtures, store.match);
  const slotLabel = s => {
    if (s.type === 'team') return s.id ? teamName(s.id) : 'BYE';
    const feed = t.fixtures.find(x => x.id === s.fixtureId);
    const which = s.type === 'loser' ? 'Loser' : 'Winner';
    return `${which} of ${feed?.stage || 'previous'}${feed?.stage === 'Semi-Final' || feed?.stage === 'League' ? ' ' + (feed?.no || '') : ''}`.trim();
  };

  if (m) {
    const states = statesOf(m);
    const res = resultText(m, states, teamName);
    const live = m.status === 'live';
    return `<a href="#/${live ? 'score' : 'scorecard'}/${m.id}" class="card-h p-3 block">
      <div class="flex items-center gap-2 mb-2">
        ${live ? '<span class="pill bg-rose-500/15 text-rose-300"><span class="h-1.5 w-1.5 rounded-full bg-rose-400"></span>LIVE</span>'
               : '<span class="pill bg-emerald-500/12 text-emerald-300">Result</span>'}
        <span class="text-[10px] text-slate-600">${esc(f.stage)}${f.no ? ' ' + f.no : ''}</span>
      </div>
      ${[m.teams[0], m.teams[1]].map(tid => {
        const st = states.find(s => s.battingTeamId === tid);
        const won = m.result?.winnerId === tid;
        return `<div class="flex items-center gap-2.5 py-1 ${m.result && !won && !m.result.tie ? 'opacity-55' : ''}">
          ${badge(tid, 'sm')}
          <span class="flex-1 min-w-0 text-[13px] font-semibold text-white truncate">${esc(teamName(tid))}</span>
          <span class="num text-[13px] font-bold text-white">${st ? `${st.runs}/${st.wickets}` : '—'}</span>
          <span class="num text-[10px] text-slate-500 w-10 text-right">${st ? `(${st.oversText})` : ''}</span></div>`;
      }).join('')}
      <p class="mt-1.5 text-[11px] font-semibold ${live ? 'text-emerald-300' : 'text-slate-400'}">${esc(live ? 'In progress' : (res || ''))}</p>
    </a>`;
  }

  const ready = a && b;
  return `<div class="card p-3">
    <div class="flex items-center gap-3">
      <div class="flex-1 min-w-0 space-y-1.5">
        ${[[f.a, a], [f.b, b]].map(([slot, id]) => `<div class="flex items-center gap-2.5">
          ${id ? badge(id, 'sm') : '<span class="h-7 w-7 shrink-0 grid place-items-center rounded-xl bg-white/5 border border-white/10 text-slate-600 text-[10px]">?</span>'}
          <span class="text-[13px] font-semibold truncate ${id ? 'text-white' : 'text-slate-500'}">${esc(id ? teamName(id) : slotLabel(slot))}</span>
        </div>`).join('')}
      </div>
      <div class="flex flex-col items-end gap-1.5 shrink-0">
        <button data-play="${f.id}" ${ready ? '' : 'disabled'}
          class="btn-primary !px-3 !py-2 text-xs">Score</button>
        <div class="flex gap-1">
          <button data-fxmove="${f.id}:up" class="h-7 w-7 rounded-lg bg-white/5 border border-white/10 text-slate-500 hover:text-white grid place-items-center active:scale-90 transition text-xs" aria-label="Play earlier">↑</button>
          <button data-fxmove="${f.id}:down" class="h-7 w-7 rounded-lg bg-white/5 border border-white/10 text-slate-500 hover:text-white grid place-items-center active:scale-90 transition text-xs" aria-label="Play later">↓</button>
          <button data-editfx="${f.id}" class="h-7 w-7 rounded-lg bg-white/5 border border-white/10 text-slate-500 hover:text-white grid place-items-center active:scale-90 transition" aria-label="Edit fixture">${ICON.edit}</button>
          <button data-delfx="${f.id}" class="h-7 w-7 rounded-lg bg-white/5 border border-white/10 text-slate-500 hover:text-rose-300 grid place-items-center active:scale-90 transition text-xs" aria-label="Remove fixture">✕</button>
        </div>
      </div>
    </div>
  </div>`;
}

/* ------------------------------------------------------------------ *
 * Points table
 * ------------------------------------------------------------------ */

function tableView(t) {
  const rows = pointsTable(t, store.matches());
  if (!rows.some(r => r.p)) {
    return empty('📊', 'No results yet', 'Play a fixture and the table fills in automatically, net run rate included.');
  }
  const byGroup = new Map();
  rows.forEach(r => {
    const k = r.group || '';
    if (!byGroup.has(k)) byGroup.set(k, []);
    byGroup.get(k).push(r);
  });

  const anyTies = rows.some(r => r.t + r.nr > 0);

  const render = (label, list) => `
    ${label ? `<h3 class="text-[11px] font-bold uppercase tracking-[.12em] text-slate-500 mb-2.5 mt-4 first:mt-0">Group ${esc(label)}</h3>` : ''}
    <div class="card p-3 overflow-x-auto no-scrollbar">
      <table class="tbl w-full min-w-[290px]">
        <thead><tr><th>#&nbsp;&nbsp;Team</th><th>P</th><th>W</th><th>L</th>${anyTies ? '<th>T</th>' : ''}<th>Pts</th><th>NRR</th></tr></thead>
        <tbody>${list.map((r, i) => `<tr class="${i < 2 && list.length > 2 ? 'bg-emerald-500/[.05]' : ''}">
          <td>
            <div class="flex items-center gap-2">
              <span class="num w-3 shrink-0 text-[11px] font-bold ${i === 0 ? 'text-amber-300' : 'text-slate-600'}">${i + 1}</span>
              ${badge(r.teamId, 'sm')}
              <div class="min-w-0">
                <span class="block font-semibold text-white truncate leading-tight">${esc(teamName(r.teamId))}</span>
                ${r.form.length ? `<span class="flex gap-0.5 mt-1">${r.form.map(f => `<span class="h-3.5 w-3.5 rounded-[3px] text-[8px] font-bold grid place-items-center ${
                  f === 'W' ? 'bg-emerald-500 text-onaccent' : f === 'L' ? 'bg-rose-500/70 text-white' : 'bg-white/15 text-slate-300'}">${f}</span>`).join('')}</span>` : ''}
              </div>
            </div></td>
          <td>${r.p}</td><td class="text-emerald-300 font-semibold">${r.w}</td><td>${r.l}</td>
          ${anyTies ? `<td>${r.t + r.nr}</td>` : ''}
          <td class="font-extrabold text-white">${r.pts}</td>
          <td class="${r.nrr >= 0 ? 'text-emerald-300' : 'text-rose-300'}">${r.nrr >= 0 ? '+' : ''}${r.nrr.toFixed(3)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;

  return `${[...byGroup.entries()].map(([g, list]) => render(g, list)).join('')}
    <p class="mt-3 text-[11px] text-slate-600 leading-relaxed">
      Win ${t.points?.win ?? 2} pts · Tie / no result ${t.points?.tie ?? 1} pt.
      Net run rate = (runs scored ÷ overs faced) − (runs conceded ÷ overs bowled).
      A side bowled out is charged its full quota of overs.</p>`;
}

/* ------------------------------------------------------------------ *
 * Knockout bracket
 * ------------------------------------------------------------------ */

function bracketView(t) {
  const rounds = new Map();
  (t.fixtures || []).forEach(f => {
    if (!rounds.has(f.round)) rounds.set(f.round, []);
    rounds.get(f.round).push(f);
  });
  if (!rounds.size) return empty('🏆', 'No bracket', 'This tournament has no knockout fixtures.');

  return `<div class="flex gap-3 overflow-x-auto no-scrollbar pb-2">
    ${[...rounds.entries()].map(([r, list]) => `
      <div class="shrink-0 w-56">
        <h3 class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 text-center">${esc(list[0].stage)}</h3>
        <div class="grid gap-2 h-full content-around">
          ${list.map(f => {
            const m = f.matchId ? store.match(f.matchId) : null;
            const a = resolveSlot(f.a, t.fixtures, store.match);
            const b = resolveSlot(f.b, t.fixtures, store.match);
            const winner = m?.result?.winnerId || (m?.result?.tie ? m?.tieBreak?.winnerId : null);
            const side = (id) => `<div class="flex items-center gap-2 px-2.5 py-2 ${winner && winner === id ? 'bg-emerald-500/12' : ''} ${winner && winner !== id ? 'opacity-45' : ''}">
              ${id ? badge(id, 'sm') : '<span class="h-7 w-7 rounded-xl bg-white/5 border border-white/10 grid place-items-center text-slate-600 text-[10px]">?</span>'}
              <span class="flex-1 min-w-0 text-[11px] font-semibold truncate ${id ? 'text-white' : 'text-slate-600'}">${esc(id ? teamName(id) : 'TBD')}</span>
              ${m ? `<span class="num text-[10px] font-bold text-slate-400">${scoreFor(m, id)}</span>` : ''}</div>`;
            return `<a href="${m ? `#/${m.status === 'live' ? 'score' : 'scorecard'}/${m.id}` : '#'}"
              class="block rounded-xl border border-white/10 bg-white/[.03] overflow-hidden divide-y divide-white/[.06] ${m ? 'hover:border-white/25' : ''} transition">
              ${side(a)}${side(b)}</a>`;
          }).join('')}
        </div></div>`).join('')}
  </div>
  ${champion(t)}`;
}

function scoreFor(m, teamId) {
  if (!teamId) return '';
  const st = statesOf(m).find(s => s.battingTeamId === teamId);
  return st ? `${st.runs}/${st.wickets}` : '';
}

function champion(t) {
  const finals = (t.fixtures || []).filter(f => f.stage === 'Final');
  const f = finals[finals.length - 1];
  const m = f?.matchId ? store.match(f.matchId) : null;
  const champ = m?.result?.winnerId || (m?.result?.tie ? m?.tieBreak?.winnerId : null);
  if (!champ) return '';
  return `<div class="card p-6 mt-4 text-center animate-pop">
    <p class="text-4xl">🏆</p>
    <p class="text-[11px] uppercase tracking-widest text-amber-400 font-bold mt-2">Champions</p>
    <p class="text-xl font-extrabold text-white mt-0.5">${esc(teamName(champ))}</p></div>`;
}

/* ------------------------------------------------------------------ *
 * Leaderboards
 * ------------------------------------------------------------------ */

function statsView(t) {
  const inT = m => m.tournamentId === t.id;
  const lb = leaderboards(store.matches(), inT);
  if (!lb.all.length) return empty('📈', 'No stats yet', 'Player numbers appear once a fixture has been scored.');

  const board = (title, icon, list, fmt, accentCls) => list.length ? `
    <div class="card p-4">
      <h3 class="text-sm font-bold text-white mb-3">${icon} ${esc(title)}</h3>
      <div class="space-y-1.5">
        ${list.slice(0, 5).map((a, i) => `<div class="flex items-center gap-2.5">
          <span class="num w-4 text-[11px] font-bold ${i === 0 ? accentCls : 'text-slate-600'}">${i + 1}</span>
          <span class="flex-1 min-w-0 text-[12px] font-semibold text-slate-200 truncate">${esc(nameOf(a.id))}</span>
          <span class="text-[10px] text-slate-600 truncate max-w-[5rem]">${esc(store.team(store.player(a.id)?.teamId)?.short || '')}</span>
          <span class="num text-[12px] font-extrabold ${accentCls}">${fmt(a)}</span>
        </div>`).join('')}
      </div></div>` : '';

  return `<div class="grid gap-3">
    ${board('Orange cap — most runs', '🟠', lb.runs, a => a.runs, 'text-orange-300')}
    ${board('Purple cap — most wickets', '🟣', lb.wickets, a => a.wkts, 'text-violet-300')}
    ${board('Most sixes', '💥', lb.sixes, a => a.f6, 'text-sky-300')}
    ${board('Best strike rate', '⚡', lb.sr, a => fixed(a.sr, 1), 'text-emerald-300')}
    ${board('Best economy', '🎯', lb.econ, a => fixed(a.econ), 'text-teal-300')}
    ${board('Most dismissals in the field', '🧤', lb.fielding, a => a.dismissals, 'text-amber-300')}
  </div>`;
}

/* ------------------------------------------------------------------ */

function standingsText(t) {
  const rows = pointsTable(t, store.matches());
  const L = [t.name, ''];
  L.push('Pos  Team                 P  W  L  Pts   NRR');
  rows.forEach((r, i) => L.push(
    `${String(i + 1).padStart(2)}   ${teamName(r.teamId).padEnd(20).slice(0, 20)} ${String(r.p).padStart(2)} ${String(r.w).padStart(2)} ${String(r.l).padStart(2)}  ${String(r.pts).padStart(3)}  ${(r.nrr >= 0 ? '+' : '') + r.nrr.toFixed(3)}`));
  return L.join('\n');
}
