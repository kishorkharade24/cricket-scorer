/* Renders every screen against seeded data. Catches broken references and
 * template errors that unit tests on the engine alone would miss. */
import './dom-stub.mjs';
import assert from 'node:assert/strict';

const store   = await import('../src/js/store.js');
const E       = await import('../src/js/engine.js');
const fixtures= await import('../src/js/fixtures.js');
const stats   = await import('../src/js/stats.js');

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n      ')); } };

/* ---------- seed ---------- */
store.load();
const NAMES = [
  ['Rohit Sharma','Shubman Gill','Virat Kohli','Shreyas Iyer','KL Rahul','Hardik Pandya','Ravindra Jadeja','Kuldeep Yadav','Mohammed Siraj','Jasprit Bumrah','Mohammed Shami'],
  ['Kane Williamson','Devon Conway','Rachin Ravindra','Daryl Mitchell','Tom Latham','Glenn Phillips','Mitchell Santner','Matt Henry','Tim Southee','Trent Boult','Lockie Ferguson']
];
const teamIds = ['India', 'New Zealand', 'Australia', 'England'].map((n, i) => {
  const tm = store.addTeam({ name: n, short: n.slice(0, 3).toUpperCase(), accent: ['emerald','sky','amber','violet'][i] });
  (NAMES[i % 2]).forEach((pn, j) => store.addPlayer(tm.id, { name: pn + (i > 1 ? ' ' + (i) : ''), role: j === 4 ? 'Wicket-keeper' : 'Batter' }));
  return tm.id;
});

/** Play a whole match with pseudo-random but deterministic outcomes. */
function playMatch(a, b, overs = 5, tournamentId = null, stage = 'League') {
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const m = E.newMatch({
    teamA: a, teamB: b, overs, playersPerSide: 11, maxOversPerBowler: overs,
    xi: { [a]: store.players(a).map(p => p.id), [b]: store.players(b).map(p => p.id) },
    toss: { winnerId: a, decision: 'bat' }, tournamentId, stage
  });
  store.addMatch(m);

  for (let guard = 0; guard < 900; guard++) {
    if (m.status === 'completed') break;
    const st = E.computeInnings(m, m.innings.length - 1);
    if (st.closed) { E.autoAdvance(m); continue; }
    if (st.needsBatter) { E.push(m, { t: 'bat', id: st.available[0] }); continue; }
    if (st.needsBowler) { E.push(m, { t: 'bowl', id: st.bowlersAvailable[0] }); continue; }
    const r = rnd();
    if (r < 0.05) E.push(m, { t: 'ball', r: 0, w: { type: 'bowled', batter: st.striker } });
    else if (r < 0.10) E.push(m, { t: 'ball', r: 1, wd: true });
    else if (r < 0.13) E.push(m, { t: 'ball', r: 4, nb: true });
    else if (r < 0.17) E.push(m, { t: 'ball', r: 1, lb: true });
    else if (r < 0.30) E.push(m, { t: 'ball', r: 4 });
    else if (r < 0.38) E.push(m, { t: 'ball', r: 6 });
    else E.push(m, { t: 'ball', r: Math.floor(rnd() * 4) });
    E.autoAdvance(m);
  }
  return m;
}

console.log('\nEnd-to-end match');
const m1 = playMatch(teamIds[0], teamIds[1]);
t('a full match reaches a result', () => {
  assert.equal(m1.status, 'completed');
  assert.ok(m1.result, 'no result computed');
  assert.equal(m1.innings.length, 2);
});
t('scorecard numbers add up: batting runs + extras = team total', () => {
  for (const st of stats.statesOf(m1)) {
    const batRuns = st.batOrder.reduce((s, id) => s + st.bat[id].r, 0);
    assert.equal(batRuns + st.extrasTotal, st.runs,
      `bat ${batRuns} + extras ${st.extrasTotal} != total ${st.runs}`);
  }
});
t('bowling runs conceded + byes/leg byes/penalties = team total', () => {
  for (const st of stats.statesOf(m1)) {
    const bowlRuns = st.bowlOrder.reduce((s, id) => s + st.bowl[id].runs, 0);
    const notCharged = st.extras.bye + st.extras.legbye + st.extras.penalty;
    assert.equal(bowlRuns + notCharged, st.runs);
  }
});
t('legal balls bowled by all bowlers = innings balls', () => {
  for (const st of stats.statesOf(m1)) {
    assert.equal(st.bowlOrder.reduce((s, id) => s + st.bowl[id].balls, 0), st.balls);
  }
});
t('wickets in the card match the wicket count', () => {
  for (const st of stats.statesOf(m1)) {
    assert.equal(st.batOrder.filter(id => st.bat[id].out).length, st.wickets);
  }
});
t('no bowler exceeds the over quota and none bowls back-to-back', () => {
  for (const st of stats.statesOf(m1)) {
    for (const id of st.bowlOrder) assert.ok(Math.ceil(st.bowl[id].balls / 6) <= st.maxOversPerBowler);
    for (let i = 1; i < st.overs.length; i++) assert.notEqual(st.overs[i].bowler, st.overs[i - 1].bowler);
  }
});

console.log('\nTournament');
const tour = {
  id: 'tr_test', name: 'Test Cup', format: 'league', teamIds,
  overs: 5, playersPerSide: 11, doubleRound: false,
  points: { win: 2, tie: 1, noResult: 1, loss: 0 }, groups: [], fixtures: [], createdAt: Date.now()
};
tour.fixtures = fixtures.buildFixtures(tour);
store.addTournament(tour);
tour.fixtures.forEach(f => {
  const mm = playMatch(f.a.id, f.b.id, 5, tour.id, 'League');
  f.matchId = mm.id;
});
const table = stats.pointsTable(tour, store.matches());
t('every team appears in the points table', () => assert.equal(table.length, 4));
t('total points equal 2 per completed fixture', () => {
  const total = table.reduce((s, r) => s + r.pts, 0);
  assert.equal(total, tour.fixtures.length * 2);
});
t('played counts equal fixtures x 2 team-slots', () => {
  assert.equal(table.reduce((s, r) => s + r.p, 0), tour.fixtures.length * 2);
});
t('wins + losses + ties = matches played', () => {
  table.forEach(r => assert.equal(r.w + r.l + r.t + r.nr, r.p));
});
t('net run rate is a finite number', () => table.forEach(r => assert.ok(Number.isFinite(r.nrr))));
t('aggregate stats produce sane batting averages', () => {
  const agg = stats.aggregate(store.matches());
  assert.ok(agg.size > 10);
  for (const a of agg.values()) {
    if (a.avg != null) assert.ok(a.avg >= 0 && Number.isFinite(a.avg));
    assert.ok(a.runs >= 0 && a.balls >= 0);
    assert.ok(a.hs <= a.runs);
  }
});

console.log('\nEvery screen renders');
const VIEWS = {
  home: '../src/js/views/home.js', matches: '../src/js/views/matches.js',
  teams: '../src/js/views/teams.js', 'team-detail': '../src/js/views/team-detail.js',
  setup: '../src/js/views/setup.js', score: '../src/js/views/score.js',
  scorecard: '../src/js/views/scorecard.js', tournaments: '../src/js/views/tournaments.js',
  'tournament-detail': '../src/js/views/tournament-detail.js',
  stats: '../src/js/views/stats.js', settings: '../src/js/views/settings.js'
};
const CTX = {
  home: {}, matches: {}, teams: {}, 'team-detail': { id: teamIds[0] },
  setup: { query: {} }, score: { id: m1.id }, scorecard: { id: m1.id },
  tournaments: {}, 'tournament-detail': { id: tour.id }, stats: {}, settings: {}
};
for (const [name, path] of Object.entries(VIEWS)) {
  const mod = (await import(path)).default;
  const ctx = { query: {}, ...CTX[name], go() {}, render() {} };
  t(`${name} renders`, () => {
    const html = mod.render(ctx);
    assert.equal(typeof html, 'string');
    assert.ok(html.length > 40, 'suspiciously short output');
    assert.ok(!html.includes('undefined<'), 'an undefined leaked into the markup');
    assert.ok(!/\[object Object\]/.test(html), '[object Object] leaked into the markup');
    // chrome accessors must not throw either
    ['title', 'sub', 'actions', 'back', 'nav'].forEach(k => {
      const v = mod[k]; if (typeof v === 'function') v(ctx);
    });
  });
}

console.log('\nLive match (mid-innings) also renders');
const m2 = E.newMatch({
  teamA: teamIds[2], teamB: teamIds[3], overs: 5, playersPerSide: 11, maxOversPerBowler: 5,
  xi: { [teamIds[2]]: store.players(teamIds[2]).map(p => p.id), [teamIds[3]]: store.players(teamIds[3]).map(p => p.id) },
  toss: { winnerId: teamIds[2], decision: 'bat' }
});
store.addMatch(m2);
E.push(m2, { t: 'bat', id: store.players(teamIds[2])[0].id });
E.push(m2, { t: 'bat', id: store.players(teamIds[2])[1].id });
E.push(m2, { t: 'bowl', id: store.players(teamIds[3])[10].id });
E.push(m2, { t: 'ball', r: 4 });
E.push(m2, { t: 'ball', r: 1, wd: true });
for (const name of ['score', 'scorecard']) {
  const mod = (await import(VIEWS[name])).default;
  t(`${name} renders a match in progress`, () => {
    const html = mod.render({ id: m2.id, query: {}, go() {}, render() {} });
    assert.ok(html.includes('5') || html.length > 100);
  });
}

console.log('\nBackup round-trip');
t('export then import restores the same data', () => {
  const json = store.exportJSON();
  const before = store.data().matches.length;
  store.resetAll();
  assert.equal(store.data().matches.length, 0);
  store.importJSON(json, 'replace');
  assert.equal(store.data().matches.length, before);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
