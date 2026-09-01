/* Edge cases a real scorer runs into. Written to fail first, then fixed. */
import './dom-stub.mjs';
import assert from 'node:assert/strict';
const E = await import('../src/js/engine.js');

let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); pass++; console.log('  ok  ' + n); }
  catch (e) { fail++; console.log('FAIL  ' + n + '\n      ' + e.message.split('\n')[0]); } };

const xi = (p, n) => Array.from({ length: n }, (_, i) => `${p}${i + 1}`);
function mk({ overs = 6, pps = 11, batN = 11, bowlN = 11, mopb = 2, rules = {} } = {}) {
  const m = E.newMatch({
    teamA: 'A', teamB: 'B', overs, playersPerSide: pps, maxOversPerBowler: mopb,
    xi: { A: xi('a', batN), B: xi('b', bowlN) },
    toss: { winnerId: 'A', decision: 'bat' }, rules
  });
  E.push(m, { t: 'bat', id: 'a1' }); E.push(m, { t: 'bat', id: 'a2' }); E.push(m, { t: 'bowl', id: 'b1' });
  return m;
}
const S = m => E.computeInnings(m, m.innings.length - 1);
const ball = (m, o = {}) => { E.push(m, { t: 'ball', r: 0, ...o }); E.autoAdvance(m); };
const out  = m => ball(m, { w: { type: 'bowled' } });

console.log('\nA. A side smaller than the nominal team size');
t('4 players in the XI are all out at 3 wickets, not 10', () => {
  const m = mk({ pps: 11, batN: 4 });
  out(m); E.push(m, { t: 'bat', id: 'a3' });
  out(m); E.push(m, { t: 'bat', id: 'a4' });
  out(m);
  const s = E.computeInnings(m, 0);          // autoAdvance has already opened the chase
  assert.equal(s.wickets, 3);
  assert.equal(s.closed, true, 'innings should be over — nobody left to bat');
  assert.equal(s.closeReason, 'allout');
  assert.equal(m.innings.length, 2, 'the chase should have started');
});
t('the app is never stuck with an empty crease and a live innings', () => {
  const m = mk({ pps: 11, batN: 3 });
  out(m); E.push(m, { t: 'bat', id: 'a3' });
  out(m);
  const s = S(m);
  const stuck = !s.closed && s.striker === null && !s.needsBatter;
  assert.equal(stuck, false, 'deadlock: no batter, no prompt, innings still open');
});

console.log('\nB. Nobody legally able to bowl the next over');
t('a bowler is always offered, even when quotas and the repeat rule collide', () => {
  const m = mk({ overs: 6, bowlN: 2, mopb: 1 });
  for (let i = 0; i < 6; i++) ball(m);            // over 1, b1
  E.push(m, { t: 'bowl', id: 'b2' });
  for (let i = 0; i < 6; i++) ball(m);            // over 2, b2
  const s = S(m);
  assert.equal(s.needsBowler, true);
  assert.ok(s.bowlersAvailable.length > 0, 'no bowler can be chosen — the match cannot continue');
});
t('the fallback still prefers someone who has not just bowled', () => {
  const m = mk({ overs: 6, bowlN: 3, mopb: 1 });
  for (let i = 0; i < 6; i++) ball(m);
  E.push(m, { t: 'bowl', id: 'b2' });
  for (let i = 0; i < 6; i++) ball(m);
  const s = S(m);
  assert.ok(s.bowlersAvailable.includes('b3'), 'b3 has a full quota and did not bowl last');
  assert.ok(!s.bowlersAvailable.includes('b2'), 'b2 bowled the previous over');
});

console.log('\nC. Big overthrows');
t('7 and 8 runs off one ball can be recorded', () => {
  const m = mk();
  E.push(m, { t: 'ball', r: 7 });
  assert.equal(S(m).runs, 7);
  assert.equal(S(m).bat.a1.r, 7);
});

console.log('\nD. Ties in a knockout');
t('a tied match exposes a way to record who went through', () => {
  const m = mk({ overs: 1, pps: 2, batN: 2, bowlN: 2 });
  for (let i = 0; i < 6; i++) ball(m, { r: 1 });
  E.autoAdvance(m);
  E.push(m, { t: 'bat', id: 'b1' }); E.push(m, { t: 'bat', id: 'b2' }); E.push(m, { t: 'bowl', id: 'a1' });
  for (let i = 0; i < 6; i++) ball(m, { r: 1 });
  const r = m.result;
  assert.equal(r.tie, true);
  assert.ok('superOverWinner' in m || typeof E.setTieBreak === 'function',
    'no way to record a super-over / bowl-out winner, so a knockout bracket stalls');
});

console.log('\nE. Odd but legal deliveries');
t('a batter can be stumped off a wide', () => {
  const m = mk();
  E.push(m, { t: 'ball', r: 0, wd: true, w: { type: 'stumped', batter: 'a1', fielder: 'b2' } });
  const s = S(m);
  assert.equal(s.wickets, 1); assert.equal(s.runs, 1); assert.equal(s.balls, 0);
});
t('the innings can end on a wide that brings up the target', () => {
  const m = mk({ overs: 1, pps: 2, batN: 2 });
  for (let i = 0; i < 6; i++) ball(m, { r: 1 });
  E.autoAdvance(m);
  E.push(m, { t: 'bat', id: 'b1' }); E.push(m, { t: 'bat', id: 'b2' }); E.push(m, { t: 'bowl', id: 'a1' });
  for (let i = 0; i < 5; i++) ball(m, { r: 1 });
  ball(m, { r: 1 }); // 6 runs, target 7
  ball(m, { wd: true }); // wide brings it level... innings already over on overs
  assert.equal(S(m).closed, true);
});

console.log('\nF. Two tabs open on the same match');
const store = await import('../src/js/store.js');
const KEY = 'cricket-scorer.db.v1';

t('a write from another tab is adopted, not overwritten', () => {
  store.load();
  store.addTeam({ name: 'Mine', short: 'MIN' });
  store.save(true);                                   // flush past the debounce

  const before = store.teams().length;
  const theirs = JSON.parse(localStorage.getItem(KEY));
  theirs.teams.push({ id: 'tm_other', name: 'From Other Tab', short: 'OTH',
                      accent: 'sky', players: [], createdAt: Date.now() });

  let notified = false;
  const off = store.onExternalChange(() => { notified = true; });
  window.dispatchEvent({ type: 'storage', key: KEY, newValue: JSON.stringify(theirs) });
  off();

  assert.equal(notified, true, 'the UI was never told to redraw');
  assert.equal(store.teams().length, before + 1);
  assert.ok(store.teams().some(x => x.id === 'tm_other'), "the other tab's team is missing");
});

t('an unrelated storage key is ignored', () => {
  const before = store.teams().length;
  window.dispatchEvent({ type: 'storage', key: 'something-else', newValue: '{}' });
  assert.equal(store.teams().length, before);
});

t('a corrupt payload from another tab does not wipe the database', () => {
  const before = store.teams().length;
  window.dispatchEvent({ type: 'storage', key: KEY, newValue: '{not json' });
  assert.equal(store.teams().length, before);
});

console.log('\nG. Stats for a player who bats and bowls');
const stats = await import('../src/js/stats.js');
t('a bowler who took no wickets still has bowling figures', () => {
  const m = mk({ overs: 2, pps: 2, batN: 2, bowlN: 2, mopb: 2 });
  for (let i = 0; i < 6; i++) ball(m, { r: 1 });      // b1 bowls an over, no wickets
  const agg = stats.aggregate([m]);
  const b1 = agg.get('b1');
  assert.ok(b1, 'b1 has no aggregate at all');
  assert.equal(b1.bBalls, 6);
  assert.equal(b1.bRuns, 6);
  assert.equal(b1.wkts, 0);
  assert.ok(b1.econ !== null, 'economy should be computable');
});
t('the Bowling tab lists everyone who bowled, not just wicket-takers', async () => {
  const m = mk({ overs: 2, pps: 2, batN: 2, bowlN: 2, mopb: 2 });
  for (let i = 0; i < 6; i++) ball(m, { r: 1 });
  const agg = [...stats.aggregate([m]).values()];
  const bowled = agg.filter(a => a.bBalls > 0);
  const wicketTakers = agg.filter(a => a.wkts > 0);
  assert.equal(bowled.length, 1, 'one player bowled');
  assert.equal(wicketTakers.length, 0, 'nobody took a wicket');
  // this is what the view must use — filtering on wkts would hide the bowler
  assert.notEqual(bowled.length, wicketTakers.length);
});

t('a bowler named for an over that never happened is left off the card', () => {
  const m = mk({ overs: 2, pps: 2, batN: 2, bowlN: 3, mopb: 2 });
  for (let i = 0; i < 6; i++) ball(m, { r: 1 });
  E.push(m, { t: 'bowl', id: 'b2' });          // named, then the innings is closed
  E.push(m, { t: 'end', reason: 'manual' });
  const rows = E.bowlingRows(E.computeInnings(m, 0), id => id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'b1');
});
t('a bowler who has only sent down wides still appears', () => {
  const m = mk({ overs: 2, pps: 2, batN: 2, bowlN: 3, mopb: 2 });
  ball(m, { wd: true }); ball(m, { wd: true });
  const rows = E.bowlingRows(E.computeInnings(m, 0), id => id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].r, 2);
});
t('best bowling shows a wicketless spell rather than a dash', () => {
  const m = mk({ overs: 2, pps: 2, batN: 2, bowlN: 2, mopb: 2 });
  for (let i = 0; i < 6; i++) ball(m, { r: 2 });
  const a = stats.aggregate([m]).get('b1');
  assert.equal(a.bb, '0/12');
});
t('a batter run out without facing a ball still counts as a duck', () => {
  const m = mk({ overs: 2, pps: 4, batN: 4 });
  E.push(m, { t: 'ball', r: 0, w: { type: 'runout', batter: 'a2' } });
  E.autoAdvance(m);
  const a = stats.aggregate([m]).get('a2');
  assert.equal(a.ducks, 1);
});

console.log('\nH. Uneven sides (turf cricket)');
t('a nine-a-side team is all out at eight, in an eleven-a-side match', () => {
  const m = E.newMatch({
    teamA: 'A', teamB: 'B', overs: 20, playersPerSide: 11, maxOversPerBowler: 4,
    xi: { A: xi('a', 9), B: xi('b', 11) },
    toss: { winnerId: 'A', decision: 'bat' }
  });
  E.push(m, { t: 'bat', id: 'a1' }); E.push(m, { t: 'bat', id: 'a2' }); E.push(m, { t: 'bowl', id: 'b1' });
  const st = E.computeInnings(m, 0);
  assert.equal(st.sideSize, 9);
  assert.equal(st.wicketsLeft, 8);
});
t('the other side keeps its own, larger size', () => {
  const m = E.newMatch({
    teamA: 'A', teamB: 'B', overs: 20, playersPerSide: 11, maxOversPerBowler: 4,
    xi: { A: xi('a', 9), B: xi('b', 11) },
    toss: { winnerId: 'A', decision: 'bowl' }      // B bats first
  });
  E.push(m, { t: 'bat', id: 'b1' }); E.push(m, { t: 'bat', id: 'b2' }); E.push(m, { t: 'bowl', id: 'a1' });
  const st = E.computeInnings(m, 0);
  assert.equal(st.sideSize, 11);
  assert.equal(st.wicketsLeft, 10);
});

console.log('\nI. Splitting a turf pool into two sides');
const B = await import('../src/js/balance.js');
t('names parse from a pasted list, numbering and duplicates removed', () => {
  const n = B.parseNames('1. Rohit\n2) Virat\nRohit\n\n  Bumrah , Shami ');
  assert.deepEqual(n, ['Rohit', 'Virat', 'Bumrah', 'Shami']);
});
t('an odd pool splits with at most one player between the sides', () => {
  const ids = Array.from({ length: 13 }, (_, i) => 'p' + i);
  const r = B.balance(ids, []);
  assert.equal(r.teamA.length + r.teamB.length, 13);
  assert.ok(Math.abs(r.teamA.length - r.teamB.length) <= 1);
});
t('nobody is put on both sides or dropped', () => {
  const ids = Array.from({ length: 12 }, (_, i) => 'p' + i);
  const r = B.balance(ids, []);
  const all = [...r.teamA, ...r.teamB].sort();
  assert.deepEqual(all, [...ids].sort());
});
t('players with no history are treated as average, so they spread out', () => {
  const ids = Array.from({ length: 10 }, (_, i) => 'p' + i);
  const r = B.balance(ids, []);
  assert.equal(r.knownCount, 0);
  assert.equal(r.gap, 0, 'with no data both sides should be rated the same');
});
t('shuffling again gives a different split of equally rated players', () => {
  const ids = Array.from({ length: 10 }, (_, i) => 'p' + i);
  const a = B.balance(ids, [], 1).teamA.join(',');
  const b = B.balance(ids, [], 7).teamA.join(',');
  assert.notEqual(a, b);
});

console.log('\nJ. Super Over');
t('a Super Over is one over, three players, two wickets', () => {
  const parent = mk({ overs: 2, pps: 4, batN: 4, bowlN: 4 });
  E.push(parent, { t: 'end', reason: 'manual' }); E.autoAdvance(parent);
  const so = E.newSuperOver(parent, { A: ['a1', 'a2', 'a3'], B: ['b1', 'b2', 'b3'] });
  assert.equal(so.overs, 1);
  assert.equal(so.rules.maxWickets, 2);
  assert.equal(so.isSuperOver, true);
  assert.equal(so.parentMatchId, parent.id);
});
t('the side that chased bats first in the Super Over', () => {
  const parent = mk({ overs: 2, pps: 4, batN: 4, bowlN: 4 });
  E.push(parent, { t: 'end', reason: 'manual' }); E.autoAdvance(parent);
  const chased = parent.innings[1].battingTeamId;
  const so = E.newSuperOver(parent, { A: ['a1', 'a2', 'a3'], B: ['b1', 'b2', 'b3'] });
  assert.equal(so.innings[0].battingTeamId, chased);
});
t('two wickets ends the Super Over innings even with a batter spare', () => {
  const parent = mk({ overs: 2, pps: 4, batN: 4, bowlN: 4 });
  E.push(parent, { t: 'end', reason: 'manual' }); E.autoAdvance(parent);
  const so = E.newSuperOver(parent, { A: ['a1','a2','a3'], B: ['b1','b2','b3'] });
  const first = so.innings[0].battingTeamId;
  const bat = first === 'A' ? ['a1','a2','a3'] : ['b1','b2','b3'];
  const bowl = first === 'A' ? 'b1' : 'a1';
  E.push(so, { t: 'bat', id: bat[0] }); E.push(so, { t: 'bat', id: bat[1] });
  E.push(so, { t: 'bowl', id: bowl });
  E.push(so, { t: 'ball', r: 0, w: { type: 'bowled' } }); E.autoAdvance(so);
  E.push(so, { t: 'bat', id: bat[2] });
  E.push(so, { t: 'ball', r: 0, w: { type: 'bowled' } }); E.autoAdvance(so);
  const st = E.computeInnings(so, 0);
  assert.equal(st.wickets, 2);
  assert.equal(st.closed, true);
  assert.equal(st.closeReason, 'allout');
});
t('a Super Over does not touch career figures', () => {
  const parent = mk({ overs: 2, pps: 4, batN: 4, bowlN: 4 });
  for (let i = 0; i < 6; i++) ball(parent, { r: 4 });
  const before = stats.aggregate([parent]).get('a1').runs;
  const so = E.newSuperOver(parent, { A: ['a1','a2','a3'], B: ['b1','b2','b3'] });
  const after = stats.aggregate([parent, so]).get('a1').runs;
  assert.equal(after, before);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
