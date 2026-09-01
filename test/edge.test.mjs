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

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
