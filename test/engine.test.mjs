/* Plain-node assertions for the scoring engine. Run: npm test */
import assert from 'node:assert/strict';
import { newMatch, computeInnings, push, undo, autoAdvance, computeResult, oversLeftFor } from '../src/js/engine.js';

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + e.message); } };

const A = 'A', B = 'B';
const xiOf = (p, n) => Array.from({ length: n }, (_, i) => `${p}${i + 1}`);

function mk(overs = 2, pps = 4, rules = {}) {
  const m = newMatch({
    teamA: A, teamB: B, overs, playersPerSide: pps, maxOversPerBowler: overs,
    xi: { [A]: xiOf('a', pps), [B]: xiOf('b', pps) },
    toss: { winnerId: A, decision: 'bat' }, rules
  });
  push(m, { t: 'bat', id: 'a1' });
  push(m, { t: 'bat', id: 'a2' });
  push(m, { t: 'bowl', id: 'b1' });
  return m;
}
const S = m => computeInnings(m, m.innings.length - 1);
const ball = (m, o = {}) => push(m, { t: 'ball', r: 0, ...o });

console.log('\nBall accounting');
t('dot ball counts a legal ball and nothing else', () => {
  const m = mk(); ball(m); const s = S(m);
  assert.equal(s.balls, 1); assert.equal(s.runs, 0);
  assert.equal(s.bat.a1.b, 1); assert.equal(s.bowl.b1.balls, 1);
});
t('runs off the bat go to batter, bowler and team', () => {
  const m = mk(); ball(m, { r: 4 }); const s = S(m);
  assert.equal(s.runs, 4); assert.equal(s.bat.a1.r, 4);
  assert.equal(s.bat.a1.f4, 1); assert.equal(s.bowl.b1.runs, 4);
});
t('odd runs rotate the strike', () => {
  const m = mk(); ball(m, { r: 1 }); const s = S(m);
  assert.equal(s.striker, 'a2'); assert.equal(s.nonStriker, 'a1');
});
t('even runs keep the strike', () => {
  const m = mk(); ball(m, { r: 2 }); assert.equal(S(m).striker, 'a1');
});

console.log('\nExtras');
t('wide: +1 team run, charged to bowler, no legal ball, batter faces nothing', () => {
  const m = mk(); ball(m, { wd: true }); const s = S(m);
  assert.equal(s.runs, 1); assert.equal(s.balls, 0);
  assert.equal(s.extras.wide, 1); assert.equal(s.bowl.b1.runs, 1);
  assert.equal(s.bat.a1.b, 0);
});
t('wide + 2 run = 3 wides, strike unchanged (even)', () => {
  const m = mk(); ball(m, { wd: true, r: 2 }); const s = S(m);
  assert.equal(s.runs, 3); assert.equal(s.extras.wide, 3); assert.equal(s.striker, 'a1');
});
t('no ball + 4 off the bat: team 5, batter 4, free hit armed', () => {
  const m = mk(); ball(m, { nb: true, r: 4 }); const s = S(m);
  assert.equal(s.runs, 5); assert.equal(s.bat.a1.r, 4); assert.equal(s.bat.a1.b, 1);
  assert.equal(s.extras.noball, 1); assert.equal(s.balls, 0);
  assert.equal(s.freeHit, true);
});
t('free hit survives a following wide, clears on a legal ball', () => {
  const m = mk(); ball(m, { nb: true }); ball(m, { wd: true });
  assert.equal(S(m).freeHit, true);
  ball(m, { r: 1 }); assert.equal(S(m).freeHit, false);
});
t('byes: team runs but bowler is not charged, batter faces the ball', () => {
  const m = mk(); ball(m, { b: true, r: 2 }); const s = S(m);
  assert.equal(s.runs, 2); assert.equal(s.extras.bye, 2);
  assert.equal(s.bowl.b1.runs, 0); assert.equal(s.bat.a1.b, 1);
  assert.equal(s.bat.a1.r, 0); assert.equal(s.balls, 1);
});
t('leg byes off a no ball are extras, not batter runs', () => {
  const m = mk(); ball(m, { nb: true, lb: true, r: 1 }); const s = S(m);
  assert.equal(s.runs, 2); assert.equal(s.extras.legbye, 1);
  assert.equal(s.bat.a1.r, 0); assert.equal(s.striker, 'a2');
});

console.log('\nOvers, maidens, strike');
t('six legal balls close the over and swap the strike', () => {
  const m = mk(); for (let i = 0; i < 6; i++) ball(m);
  const s = S(m);
  assert.equal(s.balls, 6); assert.equal(s.oversText, '1.0');
  assert.equal(s.striker, 'a2');
  assert.equal(s.needsBowler, true);
  assert.equal(s.bowl.b1.maidens, 1);
});
t('a wide in the over kills the maiden', () => {
  const m = mk(); ball(m, { wd: true }); for (let i = 0; i < 6; i++) ball(m);
  assert.equal(S(m).bowl.b1.maidens, 0);
});
t('byes do not kill a maiden', () => {
  const m = mk(); ball(m, { b: true, r: 2 }); for (let i = 0; i < 5; i++) ball(m);
  assert.equal(S(m).bowl.b1.maidens, 1);
});
t('same bowler cannot bowl the next over', () => {
  const m = mk(); for (let i = 0; i < 6; i++) ball(m);
  assert.ok(!S(m).bowlersAvailable.includes('b1'));
});
t('bowler quota is enforced', () => {
  const m = mk(2, 4); for (let i = 0; i < 6; i++) ball(m);
  assert.equal(oversLeftFor(S(m), 'b1'), 1);
});

console.log('\nWickets');
t('bowled: wicket to bowler, striker vacates, FoW recorded', () => {
  const m = mk(); ball(m, { w: { type: 'bowled' } }); const s = S(m);
  assert.equal(s.wickets, 1); assert.equal(s.bowl.b1.wkts, 1);
  assert.equal(s.bat.a1.out, true); assert.equal(s.striker, null);
  assert.equal(s.needsBatter, true);
  assert.equal(s.fow[0].w, 1);
});
t('run out is not credited to the bowler', () => {
  const m = mk(); ball(m, { r: 1, w: { type: 'runout', batter: 'a1' } }); const s = S(m);
  assert.equal(s.wickets, 1); assert.equal(s.bowl.b1.wkts, 0);
  assert.equal(s.runs, 1);
  assert.equal(s.nonStriker, null);  // a1 crossed to the non-striker end, then went
  assert.equal(s.striker, 'a2');
});
t('new batter fills the empty end', () => {
  const m = mk(); ball(m, { w: { type: 'bowled' } });
  push(m, { t: 'bat', id: 'a3' });
  assert.equal(S(m).striker, 'a3');
});
t('wicket on the last ball of an over: survivor faces the new over', () => {
  const m = mk();
  for (let i = 0; i < 5; i++) ball(m);
  ball(m, { w: { type: 'bowled' } });
  push(m, { t: 'bat', id: 'a3' });
  const s = S(m);
  assert.equal(s.striker, 'a2'); assert.equal(s.nonStriker, 'a3');
});
t('retired hurt does not count as a wicket and the player can return', () => {
  const m = mk(); push(m, { t: 'retire', id: 'a1', out: false });
  const s = S(m);
  assert.equal(s.wickets, 0);
  assert.ok(s.available.includes('a1'));
});

console.log('\nInnings & match close');
t('innings ends when the overs run out', () => {
  const m = mk(1, 4); for (let i = 0; i < 6; i++) ball(m);
  assert.equal(S(m).closed, true);
  assert.equal(S(m).closeReason, 'overs');
});
t('innings ends when the side is all out', () => {
  const m = mk(5, 3);           // 3 a side -> all out at 2 wickets
  ball(m, { w: { type: 'bowled' } }); push(m, { t: 'bat', id: 'a3' });
  ball(m, { w: { type: 'bowled' } });
  const s = S(m);
  assert.equal(s.wickets, 2); assert.equal(s.closed, true); assert.equal(s.closeReason, 'allout');
});
t('second innings ends the moment the target is passed', () => {
  const m = mk(1, 4);
  for (let i = 0; i < 6; i++) ball(m, { r: 1 });
  autoAdvance(m);
  assert.equal(m.innings.length, 2);
  assert.equal(m.innings[1].target, 7);
  push(m, { t: 'bat', id: 'b1' }); push(m, { t: 'bat', id: 'b2' }); push(m, { t: 'bowl', id: 'a1' });
  for (let i = 0; i < 4; i++) ball(m, { r: 2 });
  const s = S(m);
  assert.equal(s.runs, 8); assert.equal(s.closed, true); assert.equal(s.closeReason, 'target');
});

console.log('\nResults');
function chase(first, second, overs = 2, pps = 4) {
  const m = mk(overs, pps);
  let scored = 0;
  while (scored < first) { ball(m, { wd: true, r: Math.min(5, first - scored - 1) }); scored += Math.min(6, first - scored); }
  push(m, { t: 'end', reason: 'manual' });
  autoAdvance(m);
  push(m, { t: 'bat', id: 'b1' }); push(m, { t: 'bat', id: 'b2' }); push(m, { t: 'bowl', id: 'a1' });
  let s2 = 0;
  while (s2 < second) { ball(m, { wd: true, r: Math.min(5, second - s2 - 1) }); s2 += Math.min(6, second - s2); }
  if (!S(m).closed) { push(m, { t: 'end', reason: 'manual' }); }
  autoAdvance(m);
  return m;
}
t('chasing side falls short -> win by runs', () => {
  const m = chase(30, 20);
  const r = computeResult(m, m.innings.map((_, i) => computeInnings(m, i)));
  assert.equal(r.winnerId, A); assert.equal(r.type, 'runs'); assert.equal(r.margin, 10);
});
t('scores level -> tie', () => {
  const m = chase(30, 30);
  const r = computeResult(m, m.innings.map((_, i) => computeInnings(m, i)));
  assert.equal(r.tie, true);
});
t('chasing side passes the target -> win by wickets', () => {
  const m = chase(20, 21);
  const r = computeResult(m, m.innings.map((_, i) => computeInnings(m, i)));
  assert.equal(r.winnerId, B); assert.equal(r.type, 'wickets');
});

console.log('\nUndo');
t('undo removes exactly the last delivery', () => {
  const m = mk(); ball(m, { r: 4 }); ball(m, { r: 6 });
  assert.equal(S(m).runs, 10);
  undo(m);
  const s = S(m);
  assert.equal(s.runs, 4); assert.equal(s.balls, 1); assert.equal(s.bat.a1.f6, 0);
});
t('undo across an innings break reopens the first innings', () => {
  const m = mk(1, 4);
  for (let i = 0; i < 6; i++) ball(m);
  autoAdvance(m);
  assert.equal(m.innings.length, 2);
  undo(m);
  assert.equal(m.innings.length, 1);
  assert.equal(S(m).balls, 5);
});
t('undo after the match finishes puts it back to live', () => {
  const m = chase(20, 21);
  assert.equal(m.status, 'completed');
  undo(m);
  assert.equal(m.status, 'live');
  assert.equal(m.result, null);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
