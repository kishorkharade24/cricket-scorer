/* Dev helper: prints a realistic database as JSON for browser screenshots. */
import './dom-stub.mjs';
const store = await import('../src/js/store.js');
const E = await import('../src/js/engine.js');
const F = await import('../src/js/fixtures.js');
const { motmCandidates: MOTM } = await import('../src/js/stats.js');

store.load();
const SQUADS = {
  'Mumbai Mavericks': ['Rohit Sharma','Ishan Kishan','Suryakumar Yadav','Tilak Varma','Tim David','Hardik Pandya','Piyush Chawla','Gerald Coetzee','Jasprit Bumrah','Akash Madhwal','Nuwan Thushara'],
  'Chennai Chargers': ['Ruturaj Gaikwad','Rachin Ravindra','Ajinkya Rahane','Shivam Dube','Ravindra Jadeja','MS Dhoni','Sameer Rizvi','Deepak Chahar','Tushar Deshpande','Maheesh Theekshana','Matheesha Pathirana'],
  'Bangalore Blasters': ['Virat Kohli','Faf du Plessis','Rajat Patidar','Glenn Maxwell','Cameron Green','Dinesh Karthik','Anuj Rawat','Alzarri Joseph','Mohammed Siraj','Yash Dayal','Karn Sharma'],
  'Kolkata Knights': ['Phil Salt','Sunil Narine','Angkrish Raghuvanshi','Shreyas Iyer','Venkatesh Iyer','Rinku Singh','Ramandeep Singh','Andre Russell','Mitchell Starc','Varun Chakravarthy','Harshit Rana']
};
const accents = ['sky','amber','rose','violet'];
const ids = Object.entries(SQUADS).map(([name, players], i) => {
  const t = store.addTeam({ name, short: name.split(' ')[0].slice(0,3).toUpperCase(), accent: accents[i] });
  players.forEach((p, j) => store.addPlayer(t.id, {
    name: p, role: j === 5 ? 'Wicket-keeper' : j > 7 ? 'Bowler' : 'Batter',
    batStyle: j % 4 === 0 ? 'LHB' : 'RHB',
    bowlStyle: j > 6 ? 'Right-arm fast' : ''
  }));
  return t.id;
});

function play(a, b, overs, tid, stage, seed, stopEarly = false) {
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const m = E.newMatch({
    teamA: a, teamB: b, overs, playersPerSide: 11, maxOversPerBowler: Math.ceil(overs/5),
    xi: { [a]: store.players(a).map(p=>p.id), [b]: store.players(b).map(p=>p.id) },
    toss: { winnerId: rnd() < .5 ? a : b, decision: rnd() < .6 ? 'bat' : 'bowl' },
    venue: ['Wankhede Stadium','Chepauk','Chinnaswamy','Eden Gardens'][Math.floor(rnd()*4)],
    tournamentId: tid, stage
  });
  store.addMatch(m);
  let balls = 0;
  for (let g = 0; g < 1200; g++) {
    if (m.status === 'completed') break;
    const st = E.computeInnings(m, m.innings.length - 1);
    if (st.closed) { E.autoAdvance(m); continue; }
    if (st.needsBatter) { E.push(m, { t:'bat', id: st.available[0] }); continue; }
    if (st.needsBowler) { E.push(m, { t:'bowl', id: st.bowlersAvailable[st.bowlersAvailable.length-1] }); continue; }
    if (stopEarly && st.balls >= 33 && st.legalInOver > 0) break;   // leave it mid-over
    const r = rnd();
    if (r < .042) {
      const kinds = ['bowled','caught','lbw','runout','stumped','caught'];
      const type = kinds[Math.floor(rnd()*kinds.length)];
      const fielder = st.bowlingXI[Math.floor(rnd()*11)];
      E.push(m, { t:'ball', r:0, w:{ type, batter: st.striker, fielder } });
    }
    else if (r < .085) E.push(m, { t:'ball', r: rnd()<.7?0:1, wd:true });
    else if (r < .105) E.push(m, { t:'ball', r: [0,1,4,6][Math.floor(rnd()*4)], nb:true });
    else if (r < .135) E.push(m, { t:'ball', r:1, lb:true });
    else if (r < .30)  E.push(m, { t:'ball', r:4 });
    else if (r < .40)  E.push(m, { t:'ball', r:6 });
    else if (r < .62)  E.push(m, { t:'ball', r:1 });
    else if (r < .74)  E.push(m, { t:'ball', r:2 });
    else               E.push(m, { t:'ball', r:0 });
    balls++;
    E.autoAdvance(m);
  }
  if (m.status === 'completed' && !m.motm) m.motm = MOTM(m)[0]?.id || null;
  m.createdAt = Date.now() - Math.floor(rnd()*8)*86400000;
  m.updatedAt = m.createdAt + 7200000;
  return m;
}

const tour = {
  id:'tr_demo', name:'Sunday Premier League', format:'league', teamIds: ids,
  overs: 20, playersPerSide: 11, doubleRound: false,
  points:{win:2,tie:1,noResult:1,loss:0}, groups:[], fixtures:[], createdAt: Date.now()-9*86400000
};
tour.fixtures = F.buildFixtures(tour);
store.addTournament(tour);
tour.fixtures.forEach((f, i) => {
  if (i >= tour.fixtures.length - 1) return;      // leave the last one unplayed
  const mm = play(f.a.id, f.b.id, 20, tour.id, 'League', 101 + i*37);
  f.matchId = mm.id;
});
// one live match, mid-innings
play(ids[0], ids[2], 20, null, 'Friendly', 999, true);
store.save(true);
console.log(store.exportJSON());
