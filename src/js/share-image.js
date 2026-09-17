/* share-image.js — draw a scorecard as a PNG for WhatsApp.
 *
 * Turf results travel by screenshot. A picture gets forwarded; a wall of text
 * does not. Everything is drawn on a canvas with no library and no network, so
 * it works with the phone in aeroplane mode like the rest of the app.
 */

import { fixed, shortName } from './util.js';
import * as store from './store.js';
import { statesOf } from './stats.js';
import { resultText, battingRows, bowlingRows } from './engine.js';

const W = 1080;
const PAD = 64;

const FONT = (weight, size) =>
  `${weight} ${size}px Barlow, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;

const DISPLAY = (weight, size) =>
  `${weight} ${size}px "Barlow Condensed", Barlow, ui-sans-serif, system-ui, Arial, sans-serif`;

/* The scoreboard, drawn. Same six roles as the app. */
const C = {
  bg: '#0f1a15', card: '#17251e', line: 'rgba(214,204,182,.16)',
  white: '#f1ead9', dim: '#b5b09e', faint: '#7a776b',
  green: '#f1ead9', amber: '#dba946', rose: '#ef6a58', sky: '#dba946'
};

/* ---------- small drawing helpers ---------- */

function roundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draw text, shortening with an ellipsis if it will not fit. */
function fit(ctx, text, max) {
  let t = String(text ?? '');
  if (ctx.measureText(t).width <= max) return t;
  while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}

function text(ctx, str, x, y, { font, colour = C.white, align = 'left', max } = {}) {
  if (font) ctx.font = font;
  ctx.fillStyle = colour;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(max ? fit(ctx, str, max) : String(str ?? ''), x, y);
}

/* ---------- the picture ---------- */

/**
 * Draw the card. The same routine runs twice: once with `draw` off purely to
 * measure how tall it needs to be, then again for real. Guessing the height
 * with arithmetic is how footers end up printed over the last line.
 *
 * @param {object} match
 * @returns {Promise<Blob>} a PNG
 */
export async function scorecardImage(match) {
  const states = statesOf(match);
  const nameOf = id => store.player(id)?.name || 'Player';
  const teamName = id => store.team(id)?.name || 'Team';
  const teamShort = id => store.team(id)?.short || '—';

  const perInnings = states.map(st => ({
    st,
    bats: battingRows(st, nameOf).filter(r => r.b > 0).sort((a, b) => b.r - a.r).slice(0, 3),
    bowls: bowlingRows(st, nameOf).sort((a, b) => b.w - a.w || a.r - b.r).slice(0, 2)
  }));

  const FOOTER = 132;

  /** Walk the layout. Returns the y the content ended at. */
  function paint(ctx, draw) {
    const T = (str, x, y, opt) => { if (draw) text(ctx, str, x, y, opt); };
    const box = (x, y2, w, h, r, fill, stroke) => {
      if (!draw) return;
      roundRect(ctx, x, y2, w, h, r);
      ctx.fillStyle = fill; ctx.fill();
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
    };

    let y = PAD + 64;

    /* header */
    const t = match.tournamentId ? store.tournament(match.tournamentId) : null;
    const kicker = [t?.name, match.stage, match.venue].filter(Boolean).join(', ');
    if (kicker) {
      T(kicker, PAD, y, { font: FONT(600, 27), colour: C.amber, max: W - PAD * 2 });
      y += 44;
    }
    T(`${teamShort(match.teams[0])} v ${teamShort(match.teams[1])}`, PAD, y + 16,
      { font: DISPLAY(800, 68), colour: C.white, max: W - PAD * 2 });
    const when = new Date(match.createdAt).toLocaleDateString(undefined,
      { day: '2-digit', month: 'short', year: 'numeric' });
    T(`${when}, ${match.overs} overs a side`, PAD, y + 62, { font: FONT(500, 28), colour: C.faint });
    y += 118;

    /* the two innings */
    const res = match.result;
    for (const st of states) {
      const won = res?.winnerId === st.battingTeamId;
      box(PAD, y, W - PAD * 2, 112, 14, won ? 'rgba(241,234,217,.07)' : C.card,
          won ? 'rgba(241,234,217,.30)' : C.line);
      box(PAD + 22, y + 24, 64, 64, 12, 'rgba(241,234,217,.08)');
      T(teamShort(st.battingTeamId), PAD + 54, y + 66,
        { font: DISPLAY(800, 24), colour: won ? C.white : C.dim, align: 'center', max: 60 });
      T(teamName(st.battingTeamId), PAD + 108, y + 68,
        { font: FONT(700, 36), colour: won ? C.white : C.dim, max: 430 });
      T(`${st.runs}/${st.wickets}`, W - PAD - 150, y + 70,
        { font: DISPLAY(800, 52), colour: C.white, align: 'right' });
      T(`(${st.oversText})`, W - PAD - 26, y + 70, { font: DISPLAY(700, 32), colour: C.faint, align: 'right' });
      y += 132;
    }

    /* result */
    const line = resultText(match, states, teamName) ||
      (match.status === 'live' ? 'In progress' : 'No result');
    box(PAD, y, W - PAD * 2, 92, 14, res?.tie ? 'rgba(219,169,70,.14)' : 'rgba(241,234,217,.08)');
    T(line, W / 2, y + 58,
      { font: FONT(700, 34), colour: res?.tie ? C.amber : C.green, align: 'center', max: W - PAD * 2 - 48 });
    y += 118;

    /* key performers — three fixed columns so nothing can collide */
    const NAME_X = PAD + 8, NAME_MAX = 400;
    const DETAIL_X = W - PAD - 178;
    const MAIN_X = W - PAD - 8;

    for (const { st, bats, bowls } of perInnings) {
      T(`${teamShort(st.battingTeamId)} batting`, PAD, y + 28, { font: FONT(600, 25), colour: C.faint });
      y += 50;
      for (const b of bats) {
        T(shortName(b.name), NAME_X, y + 30, { font: FONT(600, 30), colour: C.white, max: NAME_MAX });
        T(`${b.f4}×4  ${b.f6}×6`, DETAIL_X, y + 30, { font: FONT(500, 24), colour: C.faint, align: 'right' });
        T(`${b.r}${b.out ? '' : '*'} (${b.b})`, MAIN_X, y + 30,
          { font: FONT(700, 30), colour: C.white, align: 'right' });
        y += 46;
      }
      if (bowls.length) {
        y += 14;
        T(`${teamShort(st.bowlingTeamId)} bowling`, PAD, y + 24, { font: FONT(600, 25), colour: C.faint });
        y += 46;
        for (const b of bowls) {
          T(shortName(b.name), NAME_X, y + 30, { font: FONT(600, 30), colour: C.dim, max: NAME_MAX });
          T(`${b.o} ov, ${fixed(b.econ)} econ`, DETAIL_X, y + 30,
            { font: FONT(500, 24), colour: C.faint, align: 'right' });
          T(`${b.w}/${b.r}`, MAIN_X, y + 30,
            { font: FONT(700, 30), colour: b.w >= 2 ? C.green : C.dim, align: 'right' });
          y += 46;
        }
      }
      y += 34;
    }

    /* player of the match */
    if (match.motm) {
      box(PAD, y, W - PAD * 2, 64, 12, 'rgba(219,169,70,.12)');
      T(`Player of the match: ${nameOf(match.motm)}`, W / 2, y + 42,
        { font: FONT(700, 28), colour: C.amber, align: 'center', max: W - PAD * 2 - 40 });
      y += 80;
    }
    return y;
  }

  /* measure with a throwaway context, then draw at the right size */
  const probe = (typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(W, 200)
    : Object.assign(document.createElement('canvas'), { width: W, height: 200 })).getContext('2d');
  const contentEnd = paint(probe, false);
  const H = Math.max(1080, Math.round(contentEnd + FOOTER));

  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(W, H)
    : Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  paint(ctx, true);

  /* footer, pinned to the bottom whatever the content did */
  ctx.strokeStyle = C.line; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(PAD, H - 92); ctx.lineTo(W - PAD, H - 92); ctx.stroke();
  text(ctx, 'Cricket Scorer', PAD, H - 42, { font: FONT(700, 26), colour: C.dim });
  text(ctx, 'designed & developed by Kishor Kharade', W - PAD, H - 42,
       { font: FONT(500, 26), colour: C.faint, align: 'right' });

  return canvas.convertToBlob
    ? canvas.convertToBlob({ type: 'image/png' })
    : new Promise(res => canvas.toBlob(res, 'image/png'));
}

/** File name people will recognise in their downloads. */
export function imageFileName(match) {
  const a = store.team(match.teams[0])?.short || 'A';
  const b = store.team(match.teams[1])?.short || 'B';
  const d = new Date(match.createdAt).toISOString().slice(0, 10);
  return `${a}-v-${b}-${d}.png`.replace(/\s+/g, '');
}
