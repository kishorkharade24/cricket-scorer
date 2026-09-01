/* stats.js — everything derived from a set of finished matches:
 * career/tournament aggregates, points tables, net run rate, leaderboards.
 */

import { computeInnings, computeResult } from './engine.js';
import { oversOf, strikeRate } from './util.js';

/** All innings states of a match, computed once. */
export function statesOf(match) {
  return match.innings.map((_, i) => computeInnings(match, i));
}

/* ------------------------------------------------------------------ *
 * Player aggregates
 * ------------------------------------------------------------------ */

function blankAgg(id) {
  return {
    id,
    mat: 0, inns: 0, no: 0, runs: 0, balls: 0, f4: 0, f6: 0, hs: 0, hsNo: false,
    fifties: 0, hundreds: 0, ducks: 0,
    bInns: 0, bBalls: 0, bRuns: 0, wkts: 0, maidens: 0, bbW: 0, bbR: 0,
    threeFers: 0, fiveFers: 0,
    catches: 0, runouts: 0, stumpings: 0,
    won: 0, lost: 0
  };
}

/**
 * Roll up batting / bowling / fielding numbers for every player who appears.
 * @param {object[]} matches
 * @param {(m:object)=>boolean} [filter]
 */
export function aggregate(matches, filter = () => true) {
  const out = new Map();
  const get = id => { if (!out.has(id)) out.set(id, blankAgg(id)); return out.get(id); };

  for (const m of matches) {
    if (!filter(m)) continue;
    if (m.status === 'setup') continue;
    const states = statesOf(m);
    const played = new Set();

    for (const st of states) {
      // batting
      for (const id of st.batOrder) {
        const b = st.bat[id];
        const a = get(id); played.add(id);
        a.inns++;
        a.runs += b.r; a.balls += b.b; a.f4 += b.f4; a.f6 += b.f6;
        if (!b.out) a.no++;
        if (b.r > a.hs || (b.r === a.hs && !b.out && !a.hsNo)) { a.hs = b.r; a.hsNo = !b.out; }
        if (b.r >= 100) a.hundreds++; else if (b.r >= 50) a.fifties++;
        if (b.r === 0 && b.out && b.b > 0) a.ducks++;
      }
      // bowling
      for (const id of st.bowlOrder) {
        const w = st.bowl[id];
        const a = get(id); played.add(id);
        a.bInns++;
        a.bBalls += w.balls; a.bRuns += w.runs; a.wkts += w.wkts; a.maidens += w.maidens;
        if (w.wkts > a.bbW || (w.wkts === a.bbW && w.wkts > 0 && w.runs < a.bbR)) { a.bbW = w.wkts; a.bbR = w.runs; }
        if (w.wkts >= 5) a.fiveFers++; else if (w.wkts >= 3) a.threeFers++;
      }
      // fielding
      for (const id of st.batOrder) {
        const b = st.bat[id];
        if (!b.out || !b.fielder) continue;
        const f = get(b.fielder);
        if (b.how === 'caught') f.catches++;
        else if (b.how === 'stumped') f.stumpings++;
        else if (b.how === 'runout') f.runouts++;
      }
    }

    // XI members who never batted or bowled still played the match
    for (const tid of m.teams) (m.xi[tid] || []).forEach(id => played.add(id));

    const res = m.result || computeResult(m, states);
    for (const id of played) {
      const a = get(id); a.mat++;
      if (res && res.winnerId) {
        const side = m.teams.find(tid => (m.xi[tid] || []).includes(id));
        if (side === res.winnerId) a.won++; else if (side) a.lost++;
      }
    }
  }

  // derived rates
  for (const a of out.values()) {
    a.avg = (a.inns - a.no) > 0 ? a.runs / (a.inns - a.no) : null;
    a.sr = strikeRate(a.runs, a.balls);
    a.overs = oversOf(a.bBalls);
    a.econ = a.bBalls ? (a.bRuns * 6) / a.bBalls : null;
    a.bowlAvg = a.wkts ? a.bRuns / a.wkts : null;
    a.bowlSr = a.wkts ? a.bBalls / a.wkts : null;
    a.bb = a.bbW || a.bbR ? `${a.bbW}/${a.bbR}` : '-';
    a.dismissals = a.catches + a.stumpings + a.runouts;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Points table & net run rate
 * ------------------------------------------------------------------ */

const DEFAULT_POINTS = { win: 2, tie: 1, noResult: 1, loss: 0, bonus: 0 };

function blankRow(teamId) {
  return {
    teamId, p: 0, w: 0, l: 0, t: 0, nr: 0, pts: 0,
    forRuns: 0, forBalls: 0, agRuns: 0, agBalls: 0, nrr: 0,
    form: []
  };
}

/**
 * Standings for a tournament.
 * Net run rate follows the ICC rule: a side bowled out is charged its full
 * quota of overs, not the overs it actually faced.
 */
export function pointsTable(tournament, allMatches) {
  const cfg = { ...DEFAULT_POINTS, ...(tournament.points || {}) };
  const rows = new Map();
  const groupOf = tid => (tournament.groups || []).find(g => g.teamIds.includes(tid))?.name || null;
  (tournament.teamIds || []).forEach(tid => rows.set(tid, { ...blankRow(tid), group: groupOf(tid) }));

  const inTourney = allMatches.filter(m =>
    m.tournamentId === tournament.id && (m.status === 'completed' || m.result));

  for (const m of inTourney) {
    if (tournament.tableStages && !tournament.tableStages.includes(m.stage)) continue;
    const states = statesOf(m);
    if (states.length < 2) continue;
    const res = m.result || computeResult(m, states);
    const [i1, i2] = states;

    for (const st of [i1, i2]) {
      if (!rows.has(st.battingTeamId)) rows.set(st.battingTeamId, { ...blankRow(st.battingTeamId), group: groupOf(st.battingTeamId) });
    }
    const r1 = rows.get(i1.battingTeamId);
    const r2 = rows.get(i2.battingTeamId);

    // Balls used for run rate: full quota when a side is bowled out.
    const quota = st => st.maxOvers * 6;
    const b1 = i1.closeReason === 'allout' ? quota(i1) : i1.balls;
    const b2 = i2.closeReason === 'allout' ? quota(i2) : i2.balls;

    r1.p++; r2.p++;
    r1.forRuns += i1.runs; r1.forBalls += b1; r1.agRuns += i2.runs; r1.agBalls += b2;
    r2.forRuns += i2.runs; r2.forBalls += b2; r2.agRuns += i1.runs; r2.agBalls += b1;

    if (res?.abandoned) { r1.nr++; r2.nr++; r1.pts += cfg.noResult; r2.pts += cfg.noResult; r1.form.push('N'); r2.form.push('N'); }
    else if (res?.tie)  { r1.t++; r2.t++; r1.pts += cfg.tie; r2.pts += cfg.tie; r1.form.push('T'); r2.form.push('T'); }
    else if (res?.winnerId) {
      const win = rows.get(res.winnerId), lose = rows.get(res.winnerId === r1.teamId ? r2.teamId : r1.teamId);
      win.w++; win.pts += cfg.win; win.form.push('W');
      lose.l++; lose.pts += cfg.loss; lose.form.push('L');
    }
  }

  const list = [...rows.values()].map(r => {
    const rf = r.forBalls ? (r.forRuns * 6) / r.forBalls : 0;
    const ra = r.agBalls ? (r.agRuns * 6) / r.agBalls : 0;
    return { ...r, rf, ra, nrr: r.p ? rf - ra : 0, form: r.form.slice(-5) };
  });

  list.sort((a, b) => b.pts - a.pts || b.nrr - a.nrr || b.w - a.w || a.teamId.localeCompare(b.teamId));
  list.forEach((r, i) => { r.pos = i + 1; });
  return list;
}

/* ------------------------------------------------------------------ *
 * Leaderboards
 * ------------------------------------------------------------------ */

export function leaderboards(matches, filter, minBalls = 20, minBowlBalls = 12) {
  const agg = [...aggregate(matches, filter).values()];
  const top = (list, n = 10) => list.slice(0, n);
  return {
    runs:     top(agg.filter(a => a.runs > 0).sort((a, b) => b.runs - a.runs || b.sr - a.sr)),
    wickets:  top(agg.filter(a => a.wkts > 0).sort((a, b) => b.wkts - a.wkts || a.econ - b.econ)),
    sixes:    top(agg.filter(a => a.f6 > 0).sort((a, b) => b.f6 - a.f6)),
    fours:    top(agg.filter(a => a.f4 > 0).sort((a, b) => b.f4 - a.f4)),
    sr:       top(agg.filter(a => a.balls >= minBalls).sort((a, b) => b.sr - a.sr)),
    econ:     top(agg.filter(a => a.bBalls >= minBowlBalls).sort((a, b) => a.econ - b.econ)),
    avg:      top(agg.filter(a => a.avg != null && a.inns >= 2).sort((a, b) => b.avg - a.avg)),
    fielding: top(agg.filter(a => a.dismissals > 0).sort((a, b) => b.dismissals - a.dismissals)),
    all: agg
  };
}

/** Simple "player of the match" suggestion: batting + bowling + fielding impact. */
export function motmCandidates(match) {
  const states = statesOf(match);
  const score = new Map();
  const bump = (id, v) => score.set(id, (score.get(id) || 0) + v);
  for (const st of states) {
    for (const id of st.batOrder) {
      const b = st.bat[id];
      bump(id, b.r + b.f4 * 1 + b.f6 * 2 + (b.b ? Math.max(0, (strikeRate(b.r, b.b) - 100) / 10) : 0));
    }
    for (const id of st.bowlOrder) {
      const w = st.bowl[id];
      bump(id, w.wkts * 22 + w.maidens * 8 - (w.balls ? Math.max(0, ((w.runs * 6) / w.balls - 8)) * 2 : 0));
    }
    for (const id of st.batOrder) {
      const b = st.bat[id];
      if (b.out && b.fielder) bump(b.fielder, 8);
    }
  }
  const res = match.result;
  if (res?.winnerId) {
    for (const id of (match.xi[res.winnerId] || [])) bump(id, 6);
  }
  return [...score.entries()].map(([id, v]) => ({ id, v })).sort((a, b) => b.v - a.v);
}
