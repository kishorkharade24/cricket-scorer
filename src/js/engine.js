/* engine.js — pure cricket scoring engine.
 *
 * An innings is stored as a list of events. All numbers (score, wickets, every
 * batting and bowling figure) are re-derived from that list. Undo is therefore
 * exact: drop the last event and recompute. Nothing here touches the DOM or
 * storage, so it is easy to reason about and easy to test.
 */

import { uid, oversOf, rate, strikeRate } from './util.js';

/* ------------------------------------------------------------------ *
 * Dismissal catalogue
 * ------------------------------------------------------------------ */

export const DISMISSALS = [
  { code: 'bowled',     label: 'Bowled',            short: 'b',        credit: true,  fielder: false, strikerOnly: true,  offBat: false },
  { code: 'caught',     label: 'Caught',            short: 'c',        credit: true,  fielder: true,  strikerOnly: true,  offBat: true  },
  { code: 'lbw',        label: 'LBW',               short: 'lbw',      credit: true,  fielder: false, strikerOnly: true,  offBat: false },
  { code: 'runout',     label: 'Run Out',           short: 'run out',  credit: false, fielder: true,  strikerOnly: false, offBat: true  },
  { code: 'stumped',    label: 'Stumped',           short: 'st',       credit: true,  fielder: true,  strikerOnly: true,  offBat: false },
  { code: 'hitwicket',  label: 'Hit Wicket',        short: 'hit wkt',  credit: true,  fielder: false, strikerOnly: true,  offBat: false },
  { code: 'cab',        label: 'Caught & Bowled',   short: 'c & b',    credit: true,  fielder: false, strikerOnly: true,  offBat: true  },
  { code: 'obstruct',   label: 'Obstructing Field', short: 'obs',      credit: false, fielder: false, strikerOnly: false, offBat: true  },
  { code: 'hitTwice',   label: 'Hit Ball Twice',    short: 'hit 2x',   credit: false, fielder: false, strikerOnly: true,  offBat: false },
  { code: 'timedout',   label: 'Timed Out',         short: 'timed out',credit: false, fielder: false, strikerOnly: false, offBat: false },
  { code: 'retiredout', label: 'Retired Out',       short: 'ret out',  credit: false, fielder: false, strikerOnly: false, offBat: false },
  { code: 'retired',    label: 'Retired Hurt',      short: 'ret hurt', credit: false, fielder: false, strikerOnly: false, offBat: false, notOut: true }
];

export const dismissal = code => DISMISSALS.find(d => d.code === code) || DISMISSALS[0];

/** The ways out that apply to this match — turf usually drops LBW. */
export function dismissalsFor(rules = {}) {
  return rules.noLbw ? DISMISSALS.filter(d => d.code !== 'lbw') : DISMISSALS;
}

/** On a no-ball / free hit only these are possible. */
export const FREE_HIT_OUTS = ['runout', 'obstruct', 'hitTwice'];

export const BAT_ROLES = ['Batter', 'Bowler', 'All-rounder', 'Wicket-keeper', 'WK-Batter'];

/* ------------------------------------------------------------------ *
 * Match creation
 * ------------------------------------------------------------------ */

export function defaultMaxOversPerBowler(overs) {
  return Math.max(1, Math.ceil(overs / 5));
}

export function newMatch(cfg) {
  const {
    teamA, teamB, overs = 20, playersPerSide = 11,
    maxOversPerBowler = defaultMaxOversPerBowler(overs),
    xi = {}, toss, venue = '', dateISO = new Date().toISOString(),
    tournamentId = null, stage = 'League', rules = {}
  } = cfg;

  const r = {
    widePenalty: 1,
    noBallPenalty: 1,
    freeHitOnNoBall: true,
    lastManStands: false,
    noLbw: false,          // turf has no umpire, so LBW usually is not played
    retireAt: 0,           // 0 = off; otherwise offer to retire a batter on N
    extraBats: 0,          // how many players may bat a second time (short side)
    everyoneBowls: false,  // nudge the scorer so nobody is left out
    zones: [],             // fixed-run areas of the ground; batters do not cross
    ...rules
  };

  // Toss decides who bats first.
  const winner = toss.winnerId;
  const loser = winner === teamA ? teamB : teamA;
  const batFirst = toss.decision === 'bat' ? winner : loser;
  const bowlFirst = batFirst === teamA ? teamB : teamA;

  return {
    id: uid('mt'),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tournamentId, stage,
    teams: [teamA, teamB],
    xi,
    overs, playersPerSide, maxOversPerBowler,
    rules: r,
    toss, venue, dateISO,
    status: 'live',
    motm: null,
    notes: '',
    result: null,
    innings: [ newInnings(batFirst, bowlFirst, overs, null) ]
  };
}

export function newInnings(battingTeamId, bowlingTeamId, overs, target) {
  return { battingTeamId, bowlingTeamId, overs, target, events: [], closed: false, closeReason: null };
}

/* ------------------------------------------------------------------ *
 * The reducer
 * ------------------------------------------------------------------ */

function blankBat(order) {
  return { r: 0, b: 0, f4: 0, f6: 0, out: false, how: null, byBowler: null, fielder: null,
           retired: false, order, dots: 0, stints: 0, outs: 0 };
}
function blankBowl(order) {
  return { balls: 0, runs: 0, wkts: 0, maidens: 0, wides: 0, noballs: 0, dots: 0, order };
}

/**
 * Rebuild the full state of one innings from its events.
 * @param {object} match
 * @param {number} idx  innings index
 */
export function computeInnings(match, idx) {
  const inn = match.innings[idx];
  const rules = match.rules || {};
  const battingXI = match.xi[inn.battingTeamId] || [];
  const bowlingXI = match.xi[inn.bowlingTeamId] || [];

  const st = {
    idx,
    battingTeamId: inn.battingTeamId,
    bowlingTeamId: inn.bowlingTeamId,
    battingXI, bowlingXI,
    maxOvers: inn.overs,
    maxBalls: inn.overs * 6,
    target: inn.target,
    playersPerSide: match.playersPerSide,
    maxOversPerBowler: match.maxOversPerBowler,
    rules,

    runs: 0, wickets: 0, balls: 0,
    extras: { wide: 0, noball: 0, bye: 0, legbye: 0, penalty: 0 },
    bat: {}, bowl: {},
    batOrder: [], bowlOrder: [],
    striker: null, nonStriker: null, bowler: null, lastBowler: null,
    overs: [], curOver: null,
    fow: [], partnerships: [], partner: null,
    commentary: [],
    freeHit: false,
    closed: false, closeReason: null,
    lastEventType: null
  };

  const ensureBat = id => {
    if (!st.bat[id]) { st.bat[id] = blankBat(st.batOrder.length); st.batOrder.push(id); }
    return st.bat[id];
  };
  const ensureBowl = id => {
    if (!st.bowl[id]) { st.bowl[id] = blankBowl(st.bowlOrder.length); st.bowlOrder.push(id); }
    return st.bowl[id];
  };

  const openOver = bowlerId => {
    st.curOver = { n: st.overs.length + 1, bowler: bowlerId, balls: [], runs: 0, bowlerRuns: 0, wkts: 0, legal: 0 };
  };
  const closeOver = () => {
    if (!st.curOver) return;
    const o = st.curOver;
    if (o.legal >= 6 && o.bowlerRuns === 0) ensureBowl(o.bowler).maidens++;
    st.overs.push(o);
    st.curOver = null;
  };

  const startPartnership = () => {
    st.partner = { runs: 0, balls: 0, a: st.striker, b: st.nonStriker, startRuns: st.runs, startWkts: st.wickets };
  };
  const closePartnership = outId => {
    if (!st.partner) return;
    st.partnerships.push({ ...st.partner, out: outId, wicket: st.wickets });
    st.partner = null;
  };

  const swapEnds = () => {
    if (st.nonStriker === null && rules.lastManStands) return; // lone batter keeps strike
    const t = st.striker; st.striker = st.nonStriker; st.nonStriker = t;
  };

  const doublesUsed = () => Object.values(st.bat).filter(b => b.stints > 1).length;

  const canBatAgain = id => {
    const b = st.bat[id];
    if (id === st.striker || id === st.nonStriker) return false;
    if (!b) return true;                       // has not batted yet
    if (b.retired && !b.out) return true;      // retired hurt, can resume
    // A short side may send someone back in for a second knock.
    return b.out && (rules.extraBats || 0) > doublesUsed();
  };

  const battersLeft = () => battingXI.filter(canBatAgain).length;

  // Turf and gully sides are rarely even. The team that batted is however many
  // players were actually named, not the nominal match size — so a nine-a-side
  // team is all out at eight even when the match is set up as eleven.
  const sideSize = battingXI.length || st.playersPerSide;

  const checkClose = () => {
    if (st.closed) return;
    // A Super Over ends at two wickets down regardless of how many are named.
    const slots = sideSize + (rules.extraBats || 0);
    const allOutAt = rules.maxWickets != null
      ? rules.maxWickets
      : (rules.lastManStands ? slots : slots - 1);
    if (st.target != null && st.runs >= st.target) { st.closed = true; st.closeReason = 'target'; return; }
    if (st.wickets >= allOutAt) { st.closed = true; st.closeReason = 'allout'; return; }
    if (st.balls >= st.maxBalls) { st.closed = true; st.closeReason = 'overs'; return; }

    // A squad can be smaller than the nominal team size — eight a side, or a
    // couple of players missing. The innings is over when an end falls vacant
    // and there is nobody left to walk in, whatever the wicket count says.
    const endVacant = st.striker === null || st.nonStriker === null;
    const loneBatterCarriesOn = rules.lastManStands && st.striker !== null && st.nonStriker === null;
    if (endVacant && battersLeft() === 0 && !loneBatterCarriesOn) {
      st.closed = true; st.closeReason = 'allout';
    }
  };

  /* ---- walk the events ---- */
  for (const e of inn.events) {
    if (st.closed && e.t !== 'end') break;
    st.lastEventType = e.t;

    if (e.t === 'bat') {
      const b = ensureBat(e.id);
      b.retired = false;
      b.stints = (b.stints || 0) + 1;
      if (b.out) { b.out = false; b.how = null; b.byBowler = null; b.fielder = null; }  // batting again
      if (st.striker === null) st.striker = e.id;
      else if (st.nonStriker === null) st.nonStriker = e.id;
      if (st.striker && st.nonStriker && !st.partner) startPartnership();
      if (st.striker && st.nonStriker === null && rules.lastManStands && battersLeft() === 0 && !st.partner) startPartnership();
      continue;
    }

    if (e.t === 'bowl') {
      ensureBowl(e.id);
      st.bowler = e.id;
      openOver(e.id);
      continue;
    }

    if (e.t === 'swap') { swapEnds(); continue; }

    if (e.t === 'pen') {
      // Penalty runs awarded to the batting side (5-run penalties etc.)
      st.runs += e.runs;
      st.extras.penalty += e.runs;
      st.commentary.unshift({ over: oversOf(st.balls), text: `${e.runs} penalty runs`, kind: 'extra' });
      checkClose();
      continue;
    }

    if (e.t === 'retire') {
      const id = e.id;
      const b = ensureBat(id);
      if (e.out) {
        b.out = true; b.outs = (b.outs || 0) + 1; b.how = 'retiredout';
        st.wickets++;
        st.fow.push({ w: st.wickets, runs: st.runs, balls: st.balls, batter: id });
      } else {
        b.retired = true;
      }
      closePartnership(id);
      if (st.striker === id) st.striker = null;
      else if (st.nonStriker === id) st.nonStriker = null;
      st.commentary.unshift({ over: oversOf(st.balls), text: `${e.out ? 'Retired out' : 'Retired hurt'}`, kind: 'wicket', player: id });
      checkClose();
      continue;
    }

    if (e.t === 'end') {
      st.closed = true; st.closeReason = e.reason || 'manual';
      closeOver();
      continue;
    }

    if (e.t !== 'ball') continue;

    /* ---------------- a delivery ---------------- */
    if (!st.bowler || !st.striker) continue; // defensive: malformed stream
    if (!st.curOver) openOver(st.bowler);

    const bat = ensureBat(st.striker);
    const bwl = ensureBowl(st.bowler);
    const strikerAtBall = st.striker;
    const runsBeforeBall = bat.r;

    const wd = !!e.wd, nb = !!e.nb, bye = !!e.b, lb = !!e.lb;
    const legal = !wd && !nb;
    const n = e.r | 0;

    let teamRuns = 0, bowlerRuns = 0, ranRuns = 0, batRuns = 0;

    if (wd) {
      const pen = rules.widePenalty ?? 1;
      teamRuns = pen + n; bowlerRuns = teamRuns;
      st.extras.wide += teamRuns;
      bwl.wides++;
      ranRuns = n;
    } else if (nb) {
      const pen = rules.noBallPenalty ?? 1;
      teamRuns = pen; bowlerRuns = pen;
      st.extras.noball += pen;
      bwl.noballs++;
      bat.b++;
      if (bye || lb) {
        teamRuns += n;
        if (bye) st.extras.bye += n; else st.extras.legbye += n;
        ranRuns = n;
      } else {
        teamRuns += n; bowlerRuns += n; batRuns = n;
        bat.r += n; if (n === 4) bat.f4++; if (n === 6) bat.f6++;
        ranRuns = n;
      }
    } else if (bye || lb) {
      teamRuns = n;
      if (bye) st.extras.bye += n; else st.extras.legbye += n;
      bat.b++; ranRuns = n;
    } else {
      teamRuns = n; bowlerRuns = n; batRuns = n;
      bat.r += n; bat.b++;
      if (n === 4) bat.f4++; if (n === 6) bat.f6++;
      if (n === 0) { bat.dots++; }
      ranRuns = n;
    }

    st.runs += teamRuns;
    bwl.runs += bowlerRuns;
    if (legal) { st.balls++; bwl.balls++; st.curOver.legal++; }
    if (legal && teamRuns === 0) bwl.dots++;
    st.curOver.runs += teamRuns;
    st.curOver.bowlerRuns += bowlerRuns;

    if (st.partner) {
      st.partner.runs += teamRuns;
      if (legal) st.partner.balls++;
    }

    // Odd runs mean the batters crossed — unless the ball found a fixed-run
    // area of the ground, where the runs are awarded and nobody runs. The same
    // batter keeps the strike, which is the whole point of the rule.
    if (ranRuns % 2 === 1 && !e.nr) swapEnds();

    /* ---- wicket on this delivery ---- */
    let outId = null;
    if (e.w) {
      const d = dismissal(e.w.type);
      outId = e.w.batter || strikerAtBall;
      const ob = ensureBat(outId);
      if (d.notOut) {
        ob.retired = true;
      } else {
        ob.out = true;
        ob.outs = (ob.outs || 0) + 1;
        ob.how = e.w.type;
        ob.fielder = e.w.fielder || null;
        ob.byBowler = d.credit ? st.bowler : null;
        st.wickets++;
        if (d.credit) bwl.wkts++;
        st.curOver.wkts++;
        st.fow.push({ w: st.wickets, runs: st.runs, balls: st.balls, batter: outId, how: e.w.type });
      }
      closePartnership(outId);
      if (st.striker === outId) st.striker = null;
      else if (st.nonStriker === outId) st.nonStriker = null;
    }

    /* ---- ball chip for the over strip ---- */
    st.curOver.balls.push(chip({ n, wd, nb, bye, lb, nr: !!e.nr,
      wicket: !!e.w && !dismissal(e.w?.type).notOut, freeHit: st.freeHit }));

    st.commentary.unshift(commentaryLine(st, {
      over: oversOf(legal ? st.balls : st.balls), bowler: st.bowler, striker: strikerAtBall,
      n, wd, nb, bye, lb, nr: !!e.nr, w: e.w, batRuns, teamRuns
    }));

    /* ---- free hit bookkeeping ---- */
    if (nb && rules.freeHitOnNoBall !== false) st.freeHit = true;
    else if (legal) st.freeHit = false;
    // A wide during a free hit keeps the free hit alive.

    /* ---- end of over ---- */
    if (legal && st.balls % 6 === 0 && st.balls < st.maxBalls) {
      closeOver();
      swapEnds();
      st.lastBowler = st.bowler;
      st.bowler = null;
    } else if (legal && st.balls >= st.maxBalls) {
      closeOver();
      st.lastBowler = st.bowler;
    }

    // A lone batter under "last man stands" always keeps strike.
    if (rules.lastManStands && st.striker === null && st.nonStriker !== null && battersLeft() === 0) {
      st.striker = st.nonStriker; st.nonStriker = null;
    }

    // "Retire on 25" so everyone gets a bat. Flag only the delivery that takes
    // them past the mark, so the prompt appears once rather than every ball.
    const mark = rules.retireAt || 0;
    st.retireDue = (mark && runsBeforeBall < mark && bat.r >= mark && !bat.out && !bat.retired)
      ? { id: strikerAtBall, runs: bat.r, mark }
      : null;

    checkClose();
  }

  if (inn.closed) { st.closed = true; st.closeReason = st.closeReason || inn.closeReason; }
  if (st.closed) closeOver();

  /* ---- derived numbers the UI wants ---- */
  st.available = battingXI.filter(canBatAgain);
  st.needsBatter = !st.closed && (st.striker === null || st.nonStriker === null) && st.available.length > 0 &&
                   !(st.nonStriker === null && st.striker !== null && rules.lastManStands && st.available.length === 0);
  if (!st.closed && rules.lastManStands && st.striker && st.nonStriker === null && st.available.length === 0) st.needsBatter = false;
  st.needsBowler = !st.closed && st.bowler === null && st.striker !== null;

  st.yetToBowl = bowlingXI.filter(id => !(st.bowl[id]?.balls));
  st.oversLeft = Math.max(0, Math.ceil((st.maxBalls - st.balls) / 6));
  st.legalInOver = st.curOver ? st.curOver.legal : 0;
  st.thisOver = st.curOver ? st.curOver.balls : (st.overs[st.overs.length - 1]?.balls || []);
  st.prevOver = st.overs[st.overs.length - 1] || null;
  st.oversText = oversOf(st.balls);
  st.crr = rate(st.runs, st.balls);
  st.ballsLeft = Math.max(0, st.maxBalls - st.balls);
  st.sideSize = sideSize;
  st.wicketsLeft = (rules.maxWickets != null
    ? rules.maxWickets
    : (rules.lastManStands ? sideSize + (rules.extraBats || 0) : sideSize + (rules.extraBats || 0) - 1)) - st.wickets;
  st.extrasTotal = st.extras.wide + st.extras.noball + st.extras.bye + st.extras.legbye + st.extras.penalty;

  if (st.target != null) {
    st.need = Math.max(0, st.target - st.runs);
    st.rrr = st.ballsLeft > 0 ? (st.need * 6) / st.ballsLeft : Infinity;
  }
  st.projected = st.balls > 0 ? Math.round(st.crr * st.maxOvers) : 0;

  /* Who can bowl the next over.
   *
   * Normally: not the bowler who just bowled, and not anyone who has used up
   * their quota. In a short-handed game those two rules can rule everybody out
   * (two bowlers with a one-over quota each, say) and the match would simply
   * stop. So we relax them in order rather than offering an empty list, and
   * tell the UI which rule had to give way. */
  const underQuota = id => {
    const b = st.bowl[id];
    return !b || Math.ceil(b.balls / 6) < st.maxOversPerBowler;
  };
  const strict  = bowlingXI.filter(id => id !== st.lastBowler && underQuota(id));
  const noRepeatRule = bowlingXI.filter(underQuota);              // quota kept, repeat allowed
  const noQuotaRule  = bowlingXI.filter(id => id !== st.lastBowler); // repeat kept, quota broken

  if (strict.length)            { st.bowlersAvailable = strict;      st.bowlerRuleRelaxed = null; }
  else if (noRepeatRule.length) { st.bowlersAvailable = noRepeatRule; st.bowlerRuleRelaxed = 'repeat'; }
  else if (noQuotaRule.length)  { st.bowlersAvailable = noQuotaRule;  st.bowlerRuleRelaxed = 'quota'; }
  else                          { st.bowlersAvailable = [...bowlingXI]; st.bowlerRuleRelaxed = 'both'; }

  return st;
}

/* ---- ball chip for the over strip ---- */
function chip({ n, wd, nb, bye, lb, nr, wicket, freeHit }) {
  if (wicket) {
    let t = 'W';
    if (wd) t = 'W' + (n ? n : '') + 'wd';
    else if (nb) t = 'Wnb';
    else if (n) t = `${n}+W`;
    return { t, k: 'wkt' };
  }
  if (wd) return { t: n ? `${n + 1}wd` : 'wd', k: 'extra' };
  if (nb) return { t: n ? `nb${n}` : 'nb', k: 'extra', fh: freeHit };
  if (bye) return { t: `${n}b`, k: 'bye' };
  if (lb) return { t: `${n}lb`, k: 'bye' };
  if (nr) return { t: `${n}z`, k: 'zone' };
  if (n === 4) return { t: '4', k: 'four' };
  if (n === 6) return { t: '6', k: 'six' };
  if (n === 0) return { t: '•', k: 'dot' };
  return { t: String(n), k: 'run' };
}

function commentaryLine(st, d) {
  let text;
  if (d.w && !dismissal(d.w.type).notOut) text = `OUT — ${dismissal(d.w.type).label}`;
  else if (d.wd) text = d.n ? `wide, ${d.n} run${d.n > 1 ? 's' : ''}` : 'wide';
  else if (d.nb) text = `no ball, ${d.n || 0} run${d.n === 1 ? '' : 's'}`;
  else if (d.bye) text = `${d.n} bye${d.n > 1 ? 's' : ''}`;
  else if (d.lb) text = `${d.n} leg bye${d.n > 1 ? 's' : ''}`;
  else if (d.nr) text = `${d.n} off the zone, no change of ends`;
  else if (d.n === 6) text = 'SIX!';
  else if (d.n === 4) text = 'FOUR';
  else if (d.n === 0) text = 'no run';
  else text = `${d.n} run${d.n > 1 ? 's' : ''}`;
  const kind = (d.w && !dismissal(d.w.type).notOut) ? 'wicket'
    : d.n === 6 ? 'six' : d.n === 4 ? 'four'
    : (d.wd || d.nb || d.bye || d.lb) ? 'extra' : 'run';
  return { over: d.over, bowler: d.bowler, striker: d.striker, text, kind };
}

/* ------------------------------------------------------------------ *
 * Match level
 * ------------------------------------------------------------------ */

export function computeMatch(match) {
  const innings = match.innings.map((_, i) => computeInnings(match, i));
  const cur = innings.length - 1;
  return { match, innings, cur, state: innings[cur], result: match.result || computeResult(match, innings) };
}

export function computeResult(match, innings) {
  if (innings.length < 2) return null;
  const [i1, i2] = innings;
  if (!i2.closed) return null;
  const target = i2.target;
  if (i2.runs >= target) {
    return {
      winnerId: i2.battingTeamId,
      loserId: i1.battingTeamId,
      type: 'wickets',
      margin: i2.wicketsLeft,
      ballsLeft: i2.ballsLeft,
      tie: false
    };
  }
  if (i2.runs === target - 1) {
    return { winnerId: null, tie: true, type: 'tie', margin: 0 };
  }
  return {
    winnerId: i1.battingTeamId,
    loserId: i2.battingTeamId,
    type: 'runs',
    margin: target - 1 - i2.runs,
    tie: false
  };
}

/**
 * A tie still has to send someone through in a knockout. Record how it was
 * settled without pretending the match itself was won.
 */
export function setTieBreak(match, winnerId, method = 'Super Over') {
  match.tieBreak = winnerId ? { winnerId, method } : null;
  match.updatedAt = Date.now();
  return match.tieBreak;
}

/**
 * Build a Super Over off the back of a tied match.
 *
 * One over each, two wickets and you are out of batters, and the side that
 * chased in the main match bats first. It is a real match under the hood, so
 * it is scored ball by ball with everything the app already does — it simply
 * does not count towards anyone's career figures or the league table.
 */
export function newSuperOver(parent, xi, { number = 1 } = {}) {
  const chased = parent.innings[1]?.battingTeamId || parent.teams[1];
  const other = parent.teams.find(t => t !== chased);

  const m = newMatch({
    teamA: chased, teamB: other,
    overs: 1,
    playersPerSide: 3,
    maxOversPerBowler: 1,
    xi,
    toss: { winnerId: chased, decision: 'bat' },
    venue: parent.venue,
    tournamentId: parent.tournamentId,
    stage: number > 1 ? `Super Over ${number}` : 'Super Over',
    rules: { ...(parent.rules || {}), maxWickets: 2, lastManStands: false }
  });
  m.parentMatchId = parent.id;
  m.isSuperOver = true;
  m.superOverNumber = number;
  return m;
}

/** The side that progresses: the winner, or the tie-break winner. */
export function advancingTeam(match) {
  if (match.result?.winnerId) return match.result.winnerId;
  if (match.result?.tie && match.tieBreak?.winnerId) return match.tieBreak.winnerId;
  return null;
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.brief] drop the trailing detail, for narrow cards
 *   where "(16 balls left)" is what pushes the line onto a second row.
 */
export function resultText(match, innings, nameOf, opts = {}) {
  const r = match.result || computeResult(match, innings);
  if (!r) return null;
  if (r.abandoned) return 'Match abandoned';
  if (r.tie) {
    return match.tieBreak?.winnerId
      ? `Match tied — ${nameOf(match.tieBreak.winnerId)} won the ${match.tieBreak.method}`
      : 'Match tied';
  }
  if (r.type === 'wickets') {
    return `${nameOf(r.winnerId)} won by ${r.margin} wicket${r.margin === 1 ? '' : 's'}` +
           (!opts.brief && r.ballsLeft ? ` (${r.ballsLeft} ball${r.ballsLeft === 1 ? '' : 's'} left)` : '');
  }
  return `${nameOf(r.winnerId)} won by ${r.margin} run${r.margin === 1 ? '' : 's'}`;
}

/* ------------------------------------------------------------------ *
 * Mutations — every one of these just appends/removes an event
 * ------------------------------------------------------------------ */

export function push(match, event) {
  const inn = match.innings[match.innings.length - 1];
  inn.events.push(event);
  match.updatedAt = Date.now();
  return match;
}

export function undo(match) {
  for (let i = match.innings.length - 1; i >= 0; i--) {
    const inn = match.innings[i];
    if (inn.events.length) {
      const removed = inn.events.pop();
      inn.closed = false; inn.closeReason = null;
      // Dropping back into a finished innings reopens the match.
      match.innings.length = i + 1;
      if (match.status === 'completed') { match.status = 'live'; match.result = null; match.motm = null; }
      match.updatedAt = Date.now();
      return removed;
    }
    if (i > 0) { match.innings.pop(); match.status = 'live'; match.result = null; }
  }
  return null;
}

export function canUndo(match) {
  return match.innings.some(i => i.events.length > 0);
}

/** Close the current innings and, if this was the first, open the chase. */
export function endInnings(match, reason = 'manual') {
  const idx = match.innings.length - 1;
  const inn = match.innings[idx];
  inn.closed = true;
  inn.closeReason = reason;
  const st = computeInnings(match, idx);
  if (idx === 0) {
    match.innings.push(newInnings(inn.bowlingTeamId, inn.battingTeamId, inn.overs, st.runs + 1));
  } else {
    finishMatch(match);
  }
  match.updatedAt = Date.now();
}

export function finishMatch(match) {
  const innings = match.innings.map((_, i) => computeInnings(match, i));
  match.result = computeResult(match, innings);
  match.status = 'completed';
  match.updatedAt = Date.now();
  return match.result;
}

/** Called after every ball — rolls the innings/match forward when it is done. */
export function autoAdvance(match) {
  const idx = match.innings.length - 1;
  const st = computeInnings(match, idx);
  if (!st.closed) return null;
  const inn = match.innings[idx];
  inn.closed = true;
  inn.closeReason = st.closeReason;
  if (idx === 0) {
    match.innings.push(newInnings(inn.bowlingTeamId, inn.battingTeamId, inn.overs, st.runs + 1));
    match.updatedAt = Date.now();
    return { phase: 'innings-break', st };
  }
  finishMatch(match);
  return { phase: 'match-over', st };
}

/* ------------------------------------------------------------------ *
 * Scorecard helpers
 * ------------------------------------------------------------------ */

export function dismissalText(st, batterId, nameOf) {
  const b = st.bat[batterId];
  if (!b) return 'did not bat';
  if (b.retired && !b.out) return 'retired hurt';
  if (!b.out) return 'not out';
  const d = dismissal(b.how);
  const bowler = b.byBowler ? nameOf(b.byBowler) : null;
  switch (b.how) {
    case 'bowled':     return `b ${bowler}`;
    case 'lbw':        return `lbw b ${bowler}`;
    case 'caught':     return b.fielder && b.fielder === b.byBowler
                         ? `c & b ${bowler}`
                         : `c ${b.fielder ? nameOf(b.fielder) : 'sub'} b ${bowler}`;
    case 'cab':        return `c & b ${bowler}`;
    case 'stumped':    return `st ${b.fielder ? nameOf(b.fielder) : 'wk'} b ${bowler}`;
    case 'hitwicket':  return `hit wicket b ${bowler}`;
    case 'runout':     return `run out${b.fielder ? ` (${nameOf(b.fielder)})` : ''}`;
    default:           return d.short;
  }
}

export function battingRows(st, nameOf) {
  return st.batOrder.map(id => {
    const b = st.bat[id];
    return {
      id, name: nameOf(id),
      out: b.out, retired: b.retired,
      how: dismissalText(st, id, nameOf),
      r: b.r, b: b.b, f4: b.f4, f6: b.f6,
      sr: strikeRate(b.r, b.b)
    };
  });
}

export function bowlingRows(st, nameOf) {
  // Someone can be named for an over that never happened (the innings closed
  // first). Leave them out — but keep anyone who bowled only wides, since they
  // have no legal balls yet still conceded runs.
  return st.bowlOrder.filter(id => {
    const w = st.bowl[id];
    return w && (w.balls > 0 || w.runs > 0 || w.wkts > 0);
  }).map(id => {
    const w = st.bowl[id];
    return {
      id, name: nameOf(id),
      o: oversOf(w.balls), balls: w.balls,
      m: w.maidens, r: w.runs, w: w.wkts,
      wd: w.wides, nb: w.noballs, dots: w.dots,
      econ: w.balls ? (w.runs * 6) / w.balls : 0
    };
  });
}

/** Overs a bowler still has in hand. */
export function oversLeftFor(st, id) {
  const b = st.bowl[id];
  const used = b ? Math.ceil(b.balls / 6) : 0;
  return Math.max(0, st.maxOversPerBowler - used);
}
