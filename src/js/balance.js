/* balance.js — split a pool of players into two even sides.
 *
 * The recurring turf argument. Everything needed to settle it is already
 * stored, so rate each player on what they have actually done and deal them
 * out in a snake draft: 1-2-2-1-1-2-2-1. That keeps the two sides close
 * without pretending to be cleverer than the data supports.
 */

import { aggregate } from './stats.js';

/**
 * A single number for how much a player contributes, blending bat and ball.
 * Anyone with no history gets the pool average, so unknowns spread evenly
 * instead of all landing on one side.
 */
export function ratePlayers(ids, matches) {
  const agg = aggregate(matches, () => true, { includeSuperOvers: false });
  const raw = new Map();

  for (const id of ids) {
    const a = agg.get(id);
    if (!a || (!a.inns && !a.bInns)) { raw.set(id, null); continue; }
    const batting = a.inns ? (a.runs / a.inns) * Math.min(1.5, Math.max(0.6, a.sr / 100)) : 0;
    const bowling = a.bInns ? (a.wkts / a.bInns) * 18 - Math.max(0, (a.econ ?? 8) - 8) * 1.5 : 0;
    raw.set(id, Math.max(0, batting + bowling));
  }

  const known = [...raw.values()].filter(v => v != null);
  const avg = known.length ? known.reduce((s, v) => s + v, 0) / known.length : 10;

  const out = new Map();
  for (const [id, v] of raw) out.set(id, v == null ? avg : v);
  return { rating: out, average: avg, knownCount: known.length };
}

/**
 * Deal a rated pool into two sides.
 * @param {string[]} ids
 * @param {object[]} matches  history used for the ratings
 * @param {number} [shuffleSeed]  changes how equal players are ordered
 */
export function balance(ids, matches, shuffleSeed = 0) {
  const { rating, average, knownCount } = ratePlayers(ids, matches);

  // Deterministic jitter so "shuffle again" gives a different but still fair split.
  let seed = shuffleSeed * 2654435761 + 1;
  const jitter = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed / 0x7fffffff - 0.5) * 0.001;
  };

  const ordered = [...ids].sort((a, b) => (rating.get(b) + jitter()) - (rating.get(a) + jitter()));

  const teamA = [], teamB = [];
  // snake: A B B A A B B A …
  ordered.forEach((id, i) => (Math.floor(i / 2) % 2 === (i % 2) ? teamA : teamB).push(id));

  const sum = list => list.reduce((s, id) => s + rating.get(id), 0);
  const a = sum(teamA), b = sum(teamB);

  return {
    teamA, teamB,
    strengthA: a, strengthB: b,
    gap: Math.abs(a - b),
    gapPct: (a + b) ? (Math.abs(a - b) / ((a + b) / 2)) * 100 : 0,
    rating, average, knownCount
  };
}

/** Split names in the order given, no rating — for when people pick sides themselves. */
export function splitEvenly(ids) {
  const half = Math.ceil(ids.length / 2);
  return { teamA: ids.slice(0, half), teamB: ids.slice(half) };
}

/** One name per line, or commas. Trims, drops blanks, removes duplicates. */
export function parseNames(text) {
  const seen = new Set();
  return String(text || '')
    .split(/[\n,]+/)
    .map(s => s.replace(/^\s*\d+[.)]\s*/, '').trim())   // strip "1." / "2)" list numbering
    .filter(Boolean)
    .filter(n => {
      const k = n.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });
}
