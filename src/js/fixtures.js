/* fixtures.js — schedule generation for tournaments. */

import { uid } from './util.js';

/**
 * Round-robin using the circle method. Every side meets every other once
 * (twice if `double`). A bye is inserted when the team count is odd.
 */
export function roundRobin(teamIds, { double = false } = {}) {
  const ids = [...teamIds];
  const bye = ids.length % 2 === 1;
  if (bye) ids.push(null);
  const n = ids.length;
  const rounds = [];

  let arr = [...ids];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i], b = arr[n - 1 - i];
      if (a && b) pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    // rotate everything except the first slot
    arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
  }

  if (double) {
    const back = rounds.map(p => p.map(([a, b]) => [b, a]));
    rounds.push(...back);
  }
  return rounds;
}

/** Label a knockout round by how many places are still open going into it. */
export function roundLabel(slotsInRound) {
  if (slotsInRound <= 2) return 'Final';
  if (slotsInRound === 4) return 'Semi-Final';
  if (slotsInRound === 8) return 'Quarter-Final';
  return `Round of ${slotsInRound}`;
}

/**
 * Single-elimination bracket. Teams are seeded 1 v N, 2 v N-1 ... and any
 * shortfall to the next power of two becomes a bye (the seed walks through).
 */
export function knockout(teamIds) {
  const n = teamIds.length;
  if (n < 2) return [];
  const size = 2 ** Math.ceil(Math.log2(n));
  const seeds = [...teamIds, ...Array(size - n).fill(null)];

  // standard seeding order for a bracket of `size`
  let order = [0, 1];
  while (order.length < size) {
    const m = order.length * 2 - 1;
    order = order.flatMap(s => [s, m - s]);
  }

  const rounds = [];
  let slots = order.map(i => ({ type: 'team', id: seeds[i] ?? null }));

  while (slots.length > 1) {
    const label = roundLabel(slots.length);
    const fixtures = [];
    const next = [];
    for (let i = 0; i < slots.length; i += 2) {
      const a = slots[i], b = slots[i + 1];
      // a bye: the real side moves straight through
      if (a.type === 'team' && a.id === null) { next.push(b); continue; }
      if (b.type === 'team' && b.id === null) { next.push(a); continue; }
      const f = { id: uid('fx'), a, b, matchId: null };
      fixtures.push(f);
      next.push({ type: 'winner', fixtureId: f.id });
    }
    if (fixtures.length) {
      fixtures.forEach((f, i) => { f.round = rounds.length + 1; f.stage = label; f.no = i + 1; });
      rounds.push(fixtures);
    }
    if (next.length === slots.length) break; // safety: nothing collapsed, stop
    slots = next;
  }
  return rounds;
}

/** Build the flat fixture list a tournament stores. */
export function buildFixtures(tournament) {
  const { format, teamIds, doubleRound } = tournament;
  const out = [];

  if (format === 'custom') return out;   // the whole point: nothing is decided for you

  if (format === 'knockout') {
    knockout(teamIds).forEach(round => round.forEach(f => out.push({ ...f, matchId: null })));
    return out;
  }

  if (format === 'groups') {
    (tournament.groups || []).forEach(g => {
      roundRobin(g.teamIds, { double: doubleRound }).forEach((pairs, ri) => {
        pairs.forEach(([a, b], pi) => out.push({
          id: uid('fx'), round: ri + 1, stage: `Group ${g.name}`, group: g.name,
          no: out.length + 1, order: `${ri + 1}.${pi + 1}`,
          a: { type: 'team', id: a }, b: { type: 'team', id: b }, matchId: null
        }));
      });
    });
    return out;
  }

  // league
  roundRobin(teamIds, { double: doubleRound }).forEach((pairs, ri) => {
    pairs.forEach(([a, b], pi) => out.push({
      id: uid('fx'), round: ri + 1, stage: 'League',
      no: out.length + 1, order: `${ri + 1}.${pi + 1}`,
      a: { type: 'team', id: a }, b: { type: 'team', id: b }, matchId: null
    }));
  });
  return out;
}

/**
 * Resolve a fixture slot to a concrete team id, following knockout winners —
 * and losers, which is what a 3rd-place match and an IPL Qualifier 2 feed on.
 * Returns null when the feeding match has not been decided yet.
 */
export function resolveSlot(slot, fixtures, matchById) {
  if (!slot) return null;
  if (slot.type === 'team') return slot.id;
  const f = fixtures.find(x => x.id === slot.fixtureId);
  if (!f || !f.matchId) return null;
  const m = matchById(f.matchId);
  if (!m || m.status !== 'completed' || !m.result) return null;
  // A tie still sends someone through if a Super Over was recorded.
  const through = m.result.winnerId || (m.result.tie ? m.tieBreak?.winnerId : null) || null;
  if (!through) return null;
  if (slot.type === 'loser') return m.teams.find(t => t !== through) || null;
  return through;
}

const T = id => ({ type: 'team', id });
const W = f => ({ type: 'winner', fixtureId: f.id });
const L = f => ({ type: 'loser', fixtureId: f.id });

/**
 * The IPL shape, for the top four of a league:
 *   Qualifier 1: 1st v 2nd — the winner goes straight to the Final
 *   Eliminator:  3rd v 4th — the loser goes home
 *   Qualifier 2: loser of Q1 v winner of the Eliminator — second life for the top two
 *   Final:       winner of Q1 v winner of Q2
 */
export function iplPlayoffs([s1, s2, s3, s4]) {
  const q1 = { id: uid('fx'), stage: 'Qualifier 1', round: 1, no: 1, a: T(s1), b: T(s2), matchId: null, playoff: true };
  const el = { id: uid('fx'), stage: 'Eliminator',  round: 1, no: 2, a: T(s3), b: T(s4), matchId: null, playoff: true };
  const q2 = { id: uid('fx'), stage: 'Qualifier 2', round: 2, no: 1, a: L(q1), b: W(el), matchId: null, playoff: true };
  const fin = { id: uid('fx'), stage: 'Final',      round: 3, no: 1, a: W(q1), b: W(q2), matchId: null, playoff: true };
  return [q1, el, q2, fin];
}

/** The bronze medal: losers of the two semi-finals. */
export function thirdPlaceFixture(sf1, sf2, round = 99) {
  return { id: uid('fx'), stage: '3rd Place', round, no: 1, a: L(sf1), b: L(sf2), matchId: null, playoff: true };
}

/** Add a knockout stage on top of an existing league table. */
export function playoffFixtures(qualifiedTeamIds) {
  return knockout(qualifiedTeamIds).flat().map(f => ({ ...f, matchId: null, playoff: true }));
}
