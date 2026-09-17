/* ui.js — small presentational pieces shared across the views. */

import { esc, initials, accent, fixed, relTime } from './util.js';
import * as store from './store.js';
import { statesOf } from './stats.js';
import { computeResult, resultText } from './engine.js';

export const teamName  = id => store.team(id)?.name || 'TBD';
export const teamShort = id => store.team(id)?.short || '—';
export const nameOf    = id => store.player(id)?.name || 'Player';

/* ---------- icons ----------------------------------------------------
   One line-drawn set. Icons carry the app's own weight; emoji carry
   whichever typeface the phone happens to ship, which is why the app used
   to look different on every device. */

const svg = (d, w = 1.8) =>
  `<svg viewBox="0 0 24 24" class="icon" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

export const ICON = {
  plus:    svg('<path d="M12 5v14M5 12h14"/>', 2.2),
  edit:    svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  trash:   svg('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>'),
  share:   svg('<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M12 15V3M8 7l4-4 4 4"/>'),
  cog:     svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/>'),
  undo:    svg('<path d="M3 7v6h6"/><path d="M3.5 13a9 9 0 1 0 2.2-6.3L3 10"/>', 2),
  card:    svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h6"/>'),
  people:  svg('<path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="3.2"/><path d="M22 20v-2a4 4 0 0 0-3-3.9M16.5 3.7a4 4 0 0 1 0 7"/>'),
  /* the game's own objects */
  ball:    svg('<circle cx="12" cy="12" r="9"/><path d="M8.4 4.2c2.6 2.4 2.6 13.2 0 15.6M15.6 4.2c-2.6 2.4-2.6 13.2 0 15.6"/>'),
  bat:     svg('<path d="M15.5 3.5 20 8 9.5 18.5 5 14 15.5 3.5Z"/><path d="m5 14-2 5 5-2"/>'),
  trophy:  svg('<path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/><path d="M10 14h4l.6 3.5H9.4L10 14ZM7.5 20.5h9"/>'),
  medal:   svg('<circle cx="12" cy="15" r="5"/><path d="m8.5 11-2.5-7M15.5 11 18 4M12 13.4l.8 1.6 1.7.2-1.3 1.2.4 1.7-1.6-.9-1.6.9.4-1.7-1.3-1.2 1.7-.2.8-1.6Z"/>'),
  calendar:svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  chart:   svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  target:  svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>'),
  antenna: svg('<path d="M12 11v9"/><circle cx="12" cy="9.5" r="1.6" fill="currentColor" stroke="none"/><path d="M8.5 6a5 5 0 0 0 0 7M15.5 6a5 5 0 0 1 0 7M5.6 3.4a9 9 0 0 0 0 12.2M18.4 3.4a9 9 0 0 1 0 12.2"/>', 2),
  coin:    svg('<ellipse cx="12" cy="7" rx="7" ry="3.2"/><path d="M5 7v10c0 1.8 3.1 3.2 7 3.2s7-1.4 7-3.2V7"/><path d="M5 12c0 1.8 3.1 3.2 7 3.2s7-1.4 7-3.2"/>'),
  /* actions */
  download:svg('<path d="M12 3v12M8 11l4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>'),
  refresh: svg('<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 4v5h-5"/>'),
  info:    svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
  ruler:   svg('<rect x="2" y="7" width="20" height="10" rx="2"/><path d="M7 7v4M12 7v6M17 7v4"/>'),
  pen:     svg('<path d="M3 21l3.5-.8L20 6.7a2.3 2.3 0 0 0-3.2-3.2L3.3 17 3 21Z"/><path d="m15.5 5 3.2 3.2"/>'),
  image:   svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5"/>'),
  stop:    svg('<rect x="5" y="5" width="14" height="14" rx="2.5"/>'),
  ban:     svg('<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>'),
  scales:  svg('<path d="M12 4v16M7 20h10M3 9h18"/><path d="M6 9 3 15h6L6 9ZM18 9l-3 6h6l-3-6Z"/>'),
  exit:    svg('<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 16l-4-4 4-4M6 12h10"/>'),
  equals:  svg('<path d="M5 9h14M5 15h14"/>', 2),
  plug:    svg('<path d="M9 3v6M15 3v6"/><path d="M6 9h12v3a6 6 0 0 1-12 0V9ZM12 18v3"/>'),
  hand:    svg('<path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11m0-.5V4.5a1.5 1.5 0 0 1 3 0V11m0-.5V6a1.5 1.5 0 0 1 3 0v7a7 7 0 0 1-7 7h-.5a6.5 6.5 0 0 1-6.5-6.5V13a1.5 1.5 0 0 1 3 0"/>'),
  shuffle: svg('<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>'),
  pause:   svg('<path d="M9 5v14M15 5v14"/>', 2),
  question:svg('<circle cx="12" cy="12" r="9"/><path d="M9.2 9.3A2.9 2.9 0 0 1 14.8 10c0 2-2.8 2.4-2.8 4M12 17h.01"/>'),
  chevron: svg('<path d="M9 6l6 6-6 6"/>', 2.2),
  check:   svg('<path d="M4.5 12.5 9.5 17.5 19.5 6.5"/>', 2.4),
  close:   svg('<path d="M6 6l12 12M18 6 6 18"/>', 2.2)
};

/* ---------- team & player marks ---------- */

/** Round team badge in the team's own colour. */
export function badge(teamId, size = 'md') {
  const t = store.team(teamId);
  const a = accent(t?.accent);
  const s = { sm: 'h-7 w-7 text-[10px]', md: 'h-10 w-10 text-xs', lg: 'h-14 w-14 text-base' }[size];
  return `<span class="${s} ${a.cls} tm tm-soft tm-edge shrink-0 grid place-items-center rounded-lg border font-display font-extrabold">
    ${esc(t ? t.short : '?')}</span>`;
}

export function avatar(playerId, size = 'md') {
  const p = store.player(playerId);
  const s = { sm: 'h-7 w-7 text-[10px]', md: 'h-9 w-9 text-[11px]' }[size];
  return `<span class="${s} shrink-0 grid place-items-center rounded-full bg-fill border border-rule text-muted font-semibold">
    ${esc(initials(p?.name))}</span>`;
}

/* ---------- structure ---------- */

/** A section heading. Sentence case — the app has no tracked-out capitals. */
export function section(title, right = '') {
  return `<div class="flex items-end justify-between mb-2.5 mt-6 first:mt-0">
    <h2 class="section-label">${esc(title)}</h2>
    ${right}</div>`;
}

export function empty(icon, title, msg, cta = '') {
  return `<div class="card p-8 text-center">
    <span class="mx-auto h-11 w-11 rounded-lg bg-fill border border-rule grid place-items-center text-muted mb-3 [&_.icon]:h-5 [&_.icon]:w-5">${icon}</span>
    <p class="font-semibold text-fg">${esc(title)}</p>
    <p class="mt-1 text-sm text-muted max-w-xs mx-auto leading-relaxed">${esc(msg)}</p>
    ${cta ? `<div class="mt-5">${cta}</div>` : ''}</div>`;
}

export function stat(label, value, tone = 'text-fg') {
  return `<div class="text-center">
    <p class="text-xs text-muted">${esc(label)}</p>
    <p class="mt-0.5 display text-lg font-extrabold ${tone}">${value}</p></div>`;
}

export function pill(text, cls = '') {
  return `<span class="pill ${cls}">${esc(text)}</span>`;
}

export function livePill() {
  return `<span class="pill-live">
    <span class="h-1.5 w-1.5 rounded-full bg-wicket animate-pulse-ring"></span>Live</span>`;
}

/** One line of score, e.g. "148/6 (18.4)". */
export function scoreLine(st) {
  return `${st.runs}/${st.wickets} <span class="text-muted font-medium">(${st.oversText})</span>`;
}

/**
 * A result is three facts: who played, what they made, who won. The winner is
 * the side that is not dimmed — no badge says it a second time.
 */
export function matchCard(m, { showTournament = true } = {}) {
  const states = statesOf(m);
  const live = m.status === 'live';
  const res = m.result || computeResult(m, states);
  const t = m.tournamentId ? store.tournament(m.tournamentId) : null;
  const decided = !!res && !live;

  const row = teamId => {
    const st = states.find(s => s.battingTeamId === teamId) || null;
    const lost = decided && res.winnerId && res.winnerId !== teamId;
    return `<div class="flex items-center gap-2.5 ${lost ? 'opacity-45' : ''}">
      ${badge(teamId, 'sm')}
      <span class="flex-1 min-w-0 truncate text-[13px] font-semibold text-fg">${esc(teamName(teamId))}</span>
      <span class="display text-[15px] font-extrabold text-fg">${st ? `${st.runs}/${st.wickets}` : '<span class="text-faint">—</span>'}</span>
      <span class="num text-[11px] text-muted w-11 text-right">${st ? st.oversText : ''}</span>
    </div>`;
  };

  const summary = live
    ? liveSummary(m, states)
    : (resultText(m, states, id => store.team(id)?.name?.split(' ')[0] || 'Team', { brief: true }) || 'Not started');

  return `<a href="#/${live ? 'score' : 'scorecard'}/${m.id}" class="card-h block p-4">
    ${live || m.isSuperOver || (showTournament && t) ? `<div class="flex items-center gap-2 mb-2.5">
      ${live ? livePill() : ''}
      ${m.isSuperOver ? pill(m.stage || 'Super Over', 'border-boundary/40 text-boundary') : ''}
      ${showTournament && t ? `<span class="text-[11px] text-muted truncate">${esc(t.name)}</span>` : ''}
    </div>` : ''}
    <div class="space-y-2">
      ${row(m.teams[0])}
      ${row(m.teams[1])}
    </div>
    <div class="mt-2.5 pt-2.5 border-t border-rule flex items-baseline gap-3">
      <p class="flex-1 min-w-0 text-[12px] font-semibold ${res?.tie ? 'text-boundary' : 'text-muted'}">
        ${esc(summary)}</p>
      <span class="shrink-0 text-[11px] text-faint">${esc(relTime(m.updatedAt || m.createdAt))}</span>
    </div>
  </a>`;
}

function liveSummary(m, states) {
  const st = states[states.length - 1];
  if (states.length === 1) {
    return `${teamShort(st.battingTeamId)} batting, run rate ${fixed(st.crr)}`;
  }
  if (st.need > 0) {
    return `${teamShort(st.battingTeamId)} need ${st.need} from ${st.ballsLeft} ball${st.ballsLeft === 1 ? '' : 's'}`;
  }
  return `${teamShort(st.battingTeamId)} chasing ${st.target}`;
}

/**
 * One delivery in the over strip. Three roles, not eight colours: gold means
 * the ball went to the boundary, red means a wicket fell, everything else is
 * the plain run count. A six is the filled version of a four — more, not
 * different.
 */
export function ballChip(c, i = 0, compact = false) {
  // Each tone sets its own background. A shared `bg-plate` in the base class
  // would win or lose against these purely on Tailwind's emission order, which
  // is how a six ended up as cream text on a cream plate.
  const tone = {
    dot:   'bg-plate border-rule text-faint',
    run:   'bg-plate border-rule text-fg',
    four:  'bg-plate border-boundary/60 text-boundary',
    six:   'bg-boundary border-boundary text-onaction',
    wkt:   'bg-wicket border-wicket text-onaction',
    extra: 'bg-plate border-rule text-muted',
    bye:   'bg-plate border-rule text-muted',
    zone:  'bg-plate border-boundary/60 text-boundary'
  }[c.k] || 'bg-plate border-rule text-fg';
  const size = compact
    ? `${c.t.length > 2 ? 'px-1 min-w-[1.7rem]' : 'w-6'} h-6 text-[10px]`
    : `${c.t.length > 2 ? 'px-1.5 min-w-[2.1rem]' : 'w-8'} h-8 text-[12px]`;
  return `<span style="animation-delay:${i * 20}ms"
    class="animate-ball-in ${size} shrink-0 grid place-items-center rounded border font-display font-extrabold ${tone}">${esc(c.t)}</span>`;
}

/* ---------- controls ---------- */

export function segmented(name, options, activeValue) {
  return `<div class="inline-flex rounded-lg bg-plate border border-rule p-1 gap-1">
    ${options.map(o => `<button type="button" data-seg="${esc(name)}" data-value="${esc(o.value)}"
      class="px-3 py-1.5 rounded text-xs font-semibold transition-colors ${o.value === activeValue
        ? 'bg-action text-onaction' : 'text-muted hover:text-fg'}">${esc(o.label)}</button>`).join('')}
  </div>`;
}

export function tabs(items, active) {
  return `<div class="flex gap-4 border-b border-rule -mx-4 px-4">
    ${items.map(i => `<button data-tab="${esc(i.key)}"
      class="shrink-0 pb-2.5 pt-1 text-sm font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap ${i.key === active
        ? 'border-action text-fg' : 'border-transparent text-muted hover:text-fg'}">
      ${esc(i.label)}${i.count != null ? ` <span class="num text-muted">${i.count}</span>` : ''}</button>`).join('')}
  </div>`;
}

export function iconBtn(act, icon, label, extra = '') {
  return `<button data-act="${esc(act)}" aria-label="${esc(label)}" title="${esc(label)}"
    class="h-9 w-9 rounded-lg bg-plate border border-rule grid place-items-center text-muted hover:bg-fill hover:text-fg transition-colors ${extra}">
    ${icon}</button>`;
}
