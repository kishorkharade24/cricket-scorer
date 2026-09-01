/* ui.js — small presentational pieces shared across the views. */

import { esc, initials, accent, oversOf, fixed, relTime } from './util.js';
import * as store from './store.js';
import { statesOf } from './stats.js';
import { computeResult, resultText } from './engine.js';

/** Shown at the foot of every screen. Defined once, injected by the router. */
export const CREDIT = `
  <footer class="mt-10 mb-1 flex flex-col items-center gap-1 select-none" aria-label="Credits">
    <div class="h-px w-16 bg-gradient-to-r from-transparent via-white/12 to-transparent"></div>
    <p class="text-[10px] tracking-wide text-slate-600">
      <span class="font-semibold text-slate-500">Cricket&nbsp;Scorer</span>
      <span class="mx-1 opacity-50">·</span>
      designed &amp; developed by
      <span class="font-semibold text-slate-400">Kishor&nbsp;Kharade</span>
    </p>
  </footer>`;

export const teamName  = id => store.team(id)?.name || 'TBD';
export const teamShort = id => store.team(id)?.short || '—';
export const nameOf    = id => store.player(id)?.name || 'Player';

/** Round team badge with the team's accent colour. */
export function badge(teamId, size = 'md') {
  const t = store.team(teamId);
  const a = accent(t?.accent);
  const s = { sm: 'h-7 w-7 text-[10px]', md: 'h-10 w-10 text-xs', lg: 'h-14 w-14 text-base' }[size];
  return `<span class="${s} shrink-0 grid place-items-center rounded-xl ${a.soft} border ${a.bd} ${a.text} font-extrabold tracking-tight">
    ${esc(t ? t.short : '?')}</span>`;
}

export function avatar(playerId, size = 'md') {
  const p = store.player(playerId);
  const s = { sm: 'h-7 w-7 text-[10px]', md: 'h-9 w-9 text-[11px]' }[size];
  return `<span class="${s} shrink-0 grid place-items-center rounded-full bg-white/8 border border-white/10 text-slate-300 font-bold">
    ${esc(initials(p?.name))}</span>`;
}

export function section(title, right = '') {
  return `<div class="flex items-end justify-between mb-3 mt-6 first:mt-0">
    <h2 class="text-[11px] font-bold uppercase tracking-[.12em] text-slate-500">${esc(title)}</h2>
    ${right}</div>`;
}

export function empty(icon, title, msg, cta = '') {
  return `<div class="card p-8 text-center animate-fade-in">
    <div class="mx-auto h-14 w-14 rounded-2xl bg-white/5 border border-white/10 grid place-items-center text-2xl mb-3">${icon}</div>
    <p class="font-bold text-white">${esc(title)}</p>
    <p class="mt-1 text-sm text-slate-500 max-w-xs mx-auto leading-relaxed">${esc(msg)}</p>
    ${cta ? `<div class="mt-5">${cta}</div>` : ''}</div>`;
}

export function stat(label, value, tone = 'text-white') {
  return `<div class="text-center">
    <p class="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">${esc(label)}</p>
    <p class="mt-0.5 text-lg font-extrabold num ${tone}">${value}</p></div>`;
}

export function pill(text, cls = 'bg-white/8 text-slate-300') {
  return `<span class="pill ${cls}">${esc(text)}</span>`;
}

export function livePill() {
  return `<span class="pill bg-rose-500/15 text-rose-300 border border-rose-500/25">
    <span class="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse-ring"></span>LIVE</span>`;
}

/** One line of score, e.g. "148/6 (18.4)". */
export function scoreLine(st) {
  return `${st.runs}/${st.wickets} <span class="text-slate-500 font-medium">(${st.oversText})</span>`;
}

/** Compact match card used on Home, Matches and Tournament screens. */
export function matchCard(m, { showTournament = true } = {}) {
  const states = statesOf(m);
  const live = m.status === 'live';
  const res = m.result || computeResult(m, states);
  const t = m.tournamentId ? store.tournament(m.tournamentId) : null;

  const row = (teamId, st) => {
    const isWinner = res?.winnerId === teamId;
    return `<div class="flex items-center gap-3 ${!isWinner && res && !res.tie ? 'opacity-60' : ''}">
      ${badge(teamId, 'sm')}
      <span class="flex-1 min-w-0 truncate text-sm font-semibold ${isWinner ? 'text-white' : 'text-slate-300'}">${esc(teamName(teamId))}</span>
      <span class="num text-sm font-bold text-white">${st ? `${st.runs}/${st.wickets}` : '<span class="text-slate-600">—</span>'}</span>
      <span class="num text-[11px] text-slate-500 w-10 text-right">${st ? `(${st.oversText})` : ''}</span>
    </div>`;
  };

  const stOf = teamId => states.find(s => s.battingTeamId === teamId) || null;
  const summary = live
    ? liveSummary(m, states)
    : (resultText(m, states, teamName) || 'Not started');

  return `<a href="#/${live ? 'score' : 'scorecard'}/${m.id}" class="card-h block p-4 animate-slide-up">
    <div class="flex items-center justify-between gap-2 mb-3">
      <div class="flex items-center gap-2 min-w-0">
        ${live ? livePill() : pill(m.isSuperOver ? (m.stage || 'Super Over') : (m.status === 'completed' ? 'Result' : 'Setup'),
            m.isSuperOver ? 'bg-amber-500/15 text-amber-300' : 'bg-white/8 text-slate-400')}
        ${showTournament && t ? `<span class="text-[11px] text-slate-500 truncate">${esc(t.name)}${m.stage ? ' · ' + esc(m.stage) : ''}</span>` : ''}
      </div>
      <span class="text-[11px] text-slate-600 shrink-0">${esc(relTime(m.updatedAt || m.createdAt))}</span>
    </div>
    <div class="space-y-2">
      ${row(m.teams[0], stOf(m.teams[0]))}
      ${row(m.teams[1], stOf(m.teams[1]))}
    </div>
    <p class="mt-3 pt-3 border-t border-white/[.06] text-[12px] font-semibold ${live ? 'text-emerald-300' : res?.tie ? 'text-amber-300' : 'text-slate-400'}">
      ${esc(summary)}</p>
  </a>`;
}

function liveSummary(m, states) {
  const st = states[states.length - 1];
  if (states.length === 1) {
    return `${teamShort(st.battingTeamId)} batting · CRR ${fixed(st.crr)}`;
  }
  if (st.need > 0) {
    return `${teamShort(st.battingTeamId)} need ${st.need} from ${st.ballsLeft} ball${st.ballsLeft === 1 ? '' : 's'}`;
  }
  return `${teamShort(st.battingTeamId)} chasing ${st.target}`;
}

/** Coloured chip for one delivery in the over strip. */
export function ballChip(c, i = 0, compact = false) {
  const tone = {
    dot:   'bg-white/[.06] text-slate-400 border-white/10',
    run:   'bg-white/10 text-slate-100 border-white/15',
    four:  'bg-sky-500/20 text-sky-300 border-sky-500/40',
    six:   'bg-violet-500/25 text-violet-200 border-violet-500/45',
    wkt:   'bg-rose-500/25 text-rose-200 border-rose-500/50',
    extra: 'bg-amber-500/20 text-amber-200 border-amber-500/40',
    bye:   'bg-teal-500/15 text-teal-200 border-teal-500/30',
    zone:  'bg-lime-500/20 text-lime-200 border-lime-500/40'
  }[c.k] || 'bg-white/10 text-slate-200 border-white/15';
  const size = compact
    ? `${c.t.length > 2 ? 'px-1 min-w-[1.7rem]' : 'w-6'} h-6 text-[9px] rounded-md`
    : `${c.t.length > 2 ? 'px-1.5 min-w-[2.1rem]' : 'w-8'} h-8 text-[11px] rounded-lg`;
  return `<span style="animation-delay:${i * 25}ms"
    class="animate-ball-in ${size} shrink-0 grid place-items-center border font-bold num ${tone}">${esc(c.t)}</span>`;
}

/** Horizontal segmented control. */
export function segmented(name, options, activeValue) {
  return `<div class="inline-flex rounded-xl bg-white/5 border border-white/10 p-1 gap-1">
    ${options.map(o => `<button type="button" data-seg="${esc(name)}" data-value="${esc(o.value)}"
      class="px-3 py-1.5 rounded-lg text-xs font-bold transition ${o.value === activeValue
        ? 'bg-emerald-500 text-onaccent shadow' : 'text-slate-400 hover:text-slate-200'}">${esc(o.label)}</button>`).join('')}
  </div>`;
}

export function tabs(items, active) {
  return `<div class="flex gap-1 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
    ${items.map(i => `<button data-tab="${esc(i.key)}"
      class="shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${i.key === active
        ? 'bg-white/12 text-white border border-white/15' : 'text-slate-500 hover:text-slate-300 border border-transparent'}">
      ${esc(i.label)}${i.count != null ? ` <span class="opacity-50 num">${i.count}</span>` : ''}</button>`).join('')}
  </div>`;
}

export function iconBtn(act, svg, label, extra = '') {
  return `<button data-act="${esc(act)}" aria-label="${esc(label)}" title="${esc(label)}"
    class="h-9 w-9 rounded-xl bg-white/5 border border-white/10 grid place-items-center text-slate-300 hover:bg-white/10 active:scale-90 transition ${extra}">
    ${svg}</button>`;
}

export const ICON = {
  plus:  '<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  edit:  '<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>',
  share: '<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M12 15V3M8 7l4-4 4 4"/></svg>',
  cog:   '<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/></svg>',
  undo:  '<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M3.5 13a9 9 0 1 0 2.2-6.3L3 10"/></svg>',
  card:  '<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h6"/></svg>',
  people:'<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="3.2"/><path d="M22 20v-2a4 4 0 0 0-3-3.9M16.5 3.7a4 4 0 0 1 0 7"/></svg>'
};
