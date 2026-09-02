/* Watch a nearby match — the viewer's side of the live scoreboard.
 *
 * Everything here renders from the bundle the scorer's phone sends, never from
 * this device's own store: the teams and players in a watched match do not
 * exist locally, and must not end up in this phone's records.
 */

import { esc, fixed, initials, shortName, toast } from '../util.js';
import { ballChip, empty } from '../ui.js';
import { computeInnings, resultText } from '../engine.js';
import * as live from '../live.js';
import { scanCodeSheet, showCodeSheet } from '../qr.js';
import { closeSheet } from '../util.js';

let step = 'idle';          // idle -> reply -> watching
let tick = null;

export default {
  nav: 'home',
  back: '/',
  keepAwake: true,          // a scoreboard propped against a water bottle stays on
  title: 'Live scoreboard',
  sub: () => step === 'watching' ? 'Watching a nearby match' : 'Nothing leaves the ground',

  render() {
    if (step === 'watching' && live.viewer.lastBundle) return board(live.viewer.lastBundle);
    if (step === 'reply') return waiting();
    return landing();
  },

  mount(root, ctx) {
    const rr = () => ctx.render();

    live.viewer.onUpdate = () => { if (step !== 'watching') step = 'watching'; rr(); };
    live.viewer.onState = st => {
      if (st === 'open') {
        step = 'watching';
        closeSheet('__dismiss');          // jump to the score the moment it connects
        rr();
      }
      if (st === 'failed' && step === 'reply') { step = 'stuck'; closeSheet('__dismiss'); rr(); }
      if (st === 'closed' && step === 'watching') { step = 'lost'; rr(); }
    };
    // Waiting forever helps nobody: if the channel has not opened well after
    // both codes were exchanged, say so and say what usually fixes it.
    clearTimeout(mount._t);
    if (step === 'reply') mount._t = setTimeout(() => {
      if (step === 'reply') { step = 'stuck'; rr(); }
    }, 30000);
    function mount() {}
    clearInterval(tick);
    tick = setInterval(() => {
      const el = root.querySelector('#liveDot');
      if (!el) return;
      const fresh = Date.now() - live.viewer.lastSeen < 12000;
      el.className = `h-2 w-2 rounded-full ${fresh ? 'bg-emerald-400' : 'bg-amber-400'}`;
    }, 2000);

    root.querySelector('[data-act="join"]')?.addEventListener('click', () => join(ctx));
    root.querySelector('[data-act="rejoin"]')?.addEventListener('click', () => { step = 'idle'; live.viewerLeave(); rr(); });
    root.querySelector('[data-act="leave"]')?.addEventListener('click', () => {
      live.viewerLeave(); step = 'idle'; ctx.go('/');
    });

    return () => {
      clearInterval(tick);
      live.viewer.onUpdate = null;
      live.viewer.onState = null;
    };
  }
};

async function join(ctx) {
  const code = await scanCodeSheet({
    title: 'Scan the scorer’s code',
    subtitle: 'On the scoring phone: menu ⋮ → Live scoreboard → Add a viewer.'
  });
  if (!code) return;
  let reply;
  try {
    reply = await live.viewerJoin(code);
  } catch (err) {
    toast(err.message || 'That code did not work', 'error');
    return;
  }
  step = 'reply';
  ctx.render();
  await showCodeSheet({
    title: 'Now show this reply',
    subtitle: 'The scorer scans it (or you send them the copied code). The score appears here the moment you are connected.',
    code: reply,
    nextLabel: 'They scanned it'
  });
  ctx.render();
}

/* ------------------------------------------------------------------ */

function landing() {
  if (step === 'stuck') {
    return `<div class="card p-6 animate-fade-in">
      <div class="mx-auto h-14 w-14 rounded-2xl bg-amber-500/10 border border-amber-500/25 grid place-items-center text-2xl mb-3">🔌</div>
      <h2 class="text-lg font-bold text-white text-center">The phones can’t reach each other</h2>
      <p class="mt-2 text-sm text-slate-400 leading-relaxed">The codes worked, but no direct connection formed. In order of likelihood:</p>
      <ul class="mt-3 space-y-2 text-[13px] text-slate-400 leading-snug list-disc pl-5">
        <li>The two devices are on <b class="text-slate-200">different networks</b> — put both on the same WiFi, or join the scorer’s hotspot.</li>
        <li>Venue WiFi with <b class="text-slate-200">client isolation</b> blocks phone-to-phone traffic — the scorer’s hotspot gets around it.</li>
        <li>A computer’s <b class="text-slate-200">firewall</b> is blocking local connections.</li>
      </ul>
      ${(() => {
        const c = live.candidateSummary();
        if (!c.mine.length && !c.theirs.length) return '';
        const show = list => list.length ? list.join(', ') : 'none';
        const allHidden = list => list.length > 0 && list.every(x => x.startsWith('hidden'));
        return `<div class="mt-4 rounded-xl bg-white/[.04] border border-white/10 p-3">
          <p class="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1.5">What each side offered</p>
          <p class="text-[11px] text-slate-400 num">This phone: ${esc(show(c.mine))}</p>
          <p class="text-[11px] text-slate-400 num">Scorer: ${esc(show(c.theirs))}</p>
          ${allHidden(c.theirs) ? `<p class="mt-1.5 text-[11px] text-amber-300 leading-snug">The scorer's addresses are all hidden — on their device, allowing camera access before creating the code fixes this. Ask them to update the app and try again.</p>` : ''}
        </div>`;
      })()}
      <button data-act="rejoin" class="btn-primary w-full mt-5">Try again</button>
    </div>`;
  }
  if (step === 'lost') {
    return empty('📡', 'Connection lost',
      'The scorer stopped, moved off the network, or this screen was locked for a while. Scan their code again to rejoin.',
      '<button data-act="rejoin" class="btn-primary">Rejoin</button>');
  }
  return `
    <div class="card p-6 text-center animate-slide-up">
      <div class="mx-auto h-14 w-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 grid place-items-center text-2xl mb-3">📡</div>
      <h2 class="text-lg font-bold text-white">Watch a nearby match</h2>
      <p class="mt-2 text-sm text-slate-400 leading-relaxed max-w-xs mx-auto">
        Live, phone to phone over the local network — no internet, no account.
        Best on the same WiFi or the scorer’s hotspot.</p>
      <button data-act="join" class="btn-primary mt-5 w-full">Scan the scorer’s code</button>
      <p class="mt-3 text-[11px] text-slate-600">Keep this screen on while watching — locking it drops the connection.</p>
    </div>`;
}

function waiting() {
  return `<div class="card p-6 text-center animate-fade-in">
    <div class="mx-auto h-10 w-10 rounded-full border-2 border-emerald-400/30 border-t-emerald-400 animate-spin mb-4"></div>
    <p class="text-sm font-semibold text-white">Waiting for the scorer…</p>
    <p class="mt-1 text-xs text-slate-500">Once they scan your reply, the score appears here.</p>
    <button data-act="rejoin" class="btn-ghost mt-5 text-xs">Start over</button>
  </div>`;
}

/* ------------------------------------------------------------------ *
 * The scoreboard itself, computed from the bundle
 * ------------------------------------------------------------------ */

function board(b) {
  const m = b.match;
  const teamOf = Object.fromEntries((b.teams || []).map(t => [t.id, t]));
  const playerOf = Object.fromEntries((b.players || []).map(p => [p.id, p]));
  const tName = id => teamOf[id]?.name || 'Team';
  const pName = id => playerOf[id]?.name || 'Player';

  const states = m.innings.map((_, i) => computeInnings(m, i));
  const st = states[states.length - 1];
  const done = m.status === 'completed';
  const res = done ? resultText(m, states, tName) : null;

  const batRow = (id, onStrike) => {
    if (!id) return '';
    const bt = st.bat[id] || { r: 0, b: 0 };
    return `<div class="flex items-center gap-2.5 py-1 ${onStrike ? '' : 'opacity-60'}">
      <span class="h-6 w-6 shrink-0 grid place-items-center rounded-full text-[9px] font-bold ${onStrike ? 'bg-emerald-500 text-onaccent' : 'bg-white/8 text-slate-300'}">${esc(initials(pName(id)))}</span>
      <span class="flex-1 min-w-0 text-[13px] font-semibold text-white truncate">${esc(shortName(pName(id)))}${onStrike ? '<span class="text-emerald-400">*</span>' : ''}</span>
      <span class="num text-[13px] font-bold text-white">${bt.r}<span class="text-slate-500 font-medium"> (${bt.b})</span></span>
    </div>`;
  };
  const bwl = st.bowler ? st.bowl[st.bowler] : null;

  return `
    <div class="card p-5 relative overflow-hidden animate-fade-in">
      <div class="flex items-center gap-2 mb-3">
        <span id="liveDot" class="h-2 w-2 rounded-full bg-emerald-400"></span>
        <span class="text-[11px] font-bold uppercase tracking-wider ${done ? 'text-slate-500' : 'text-emerald-400'}">${done ? 'Final' : 'Live'}</span>
        <span class="text-[11px] text-slate-500 truncate">${esc(tName(m.teams[0]))} v ${esc(tName(m.teams[1]))}</span>
      </div>
      <div class="flex items-end gap-2">
        <span class="text-6xl font-black num text-white leading-none tracking-tight">${st.runs}</span>
        <span class="text-3xl font-black num text-slate-500 leading-none">/${st.wickets}</span>
        <div class="ml-auto text-right">
          <p class="num text-2xl font-extrabold text-white leading-none">${st.oversText}</p>
          <p class="text-[10px] text-slate-500 font-semibold">of ${st.maxOvers} ov</p>
        </div>
      </div>
      <p class="mt-2 text-sm font-semibold ${done ? 'text-emerald-300' : 'text-slate-400'}">
        ${esc(done ? (res || 'Match over')
          : st.target != null
            ? `${tName(st.battingTeamId)} need ${st.need} from ${st.ballsLeft} ball${st.ballsLeft === 1 ? '' : 's'}`
            : `${tName(st.battingTeamId)} batting · CRR ${fixed(st.crr)}`)}</p>
    </div>

    ${!done ? `<div class="card p-4 mt-3">
      ${batRow(st.striker, true)}
      ${batRow(st.nonStriker, false)}
      ${bwl ? `<div class="border-t border-white/[.07] mt-2 pt-2 flex items-center gap-2.5">
        <span class="h-6 w-6 shrink-0 grid place-items-center rounded-full bg-rose-500/20 text-rose-300 text-[9px] font-bold">${esc(initials(pName(st.bowler)))}</span>
        <span class="flex-1 min-w-0 text-[13px] font-semibold text-white truncate">${esc(shortName(pName(st.bowler)))}</span>
        <span class="num text-[13px] font-bold text-white">${bwl.wkts}-${bwl.runs}</span>
      </div>` : ''}
    </div>` : ''}

    <div class="card p-3 mt-3">
      <div class="flex items-center gap-2">
        <span class="text-[10px] uppercase tracking-wider text-slate-500 font-bold shrink-0">This over</span>
        <div class="flex gap-1.5 overflow-x-auto no-scrollbar flex-1">
          ${(st.thisOver || []).map((c, i) => ballChip(c, i)).join('') || '<span class="text-[11px] text-slate-600 py-1.5">—</span>'}
        </div>
      </div>
    </div>

    ${states.length > 1 ? `<div class="card p-4 mt-3">
      ${states.map(s2 => `<div class="flex items-center gap-3 py-1">
        <span class="flex-1 min-w-0 text-[13px] font-semibold text-slate-300 truncate">${esc(tName(s2.battingTeamId))}</span>
        <span class="num text-[14px] font-bold text-white">${s2.runs}/${s2.wickets}</span>
        <span class="num text-[11px] text-slate-500 w-10 text-right">${s2.oversText}</span>
      </div>`).join('')}
    </div>` : ''}

    <button data-act="leave" class="btn-ghost w-full mt-4 text-xs">Stop watching</button>`;
}
