# 🏏 Cricket Scorer

A ball-by-ball cricket scoring app with tournaments, built as an **offline-first PWA**.
No backend, no accounts, no network calls of any kind — everything lives in the
browser's `localStorage` on the device you score on.

Plain HTML + ES modules + Tailwind. No framework, no runtime dependencies —
not one line of third-party code ships to the browser.
Source is ~44 KB of CSS and ~197 KB of JS, which is **~61 KB gzipped over the
wire**, all of it precached on first load.

---

## Run it locally

**No build step.** `src/css/app.css` is committed and there are no runtime
dependencies, so the folder is already a working site:

```bash
cd cricket-scorer
npm run serve          # http-server on http://localhost:4173
```

`npm run serve` uses `http-server` with caching off (`-c-1`), which matters when
you are testing service-worker behaviour — otherwise you are fighting the browser
cache and the service worker at the same time. If you would rather not install it,
`npm run serve:py` uses Python's built-in server instead.

> A service worker needs `https://` or `localhost`. Opening `index.html` from the
> filesystem (`file://`) will not work — ES modules and service workers are both
> blocked on that scheme.

### The scripts

| | |
|---|---|
| `npm run serve` | static server on :4173 (`serve:py` for the Python one) |
| `npm run dev` | server **+** ngrok tunnel + QR code, for phone testing |
| `npm run css` | rebuild the stylesheet (`watch` to rebuild on save) |
| `npm run release` | rebuild CSS and stamp a new service-worker build id |
| `npm test` | scoring-engine assertions |
| `npm run test:views` | plays full matches, then renders every screen |

### Why is there a package.json at all?

One **build-time-only** dev dependency: `tailwindcss`. It compiles the utility
classes into `src/css/app.css`, which is committed. `dependencies` is empty —
**nothing from npm reaches the browser**, and there is no external `<script>` or
`<link>` anywhere in the shipped code. Delete `node_modules` and the app still
runs, fully styled. The tests need nothing either; they use Node's built-in
`assert`.

Installing is only needed to restyle:

```bash
npm install && npm run css
```

---

## Testing on a real phone

A service worker only runs on `https://` or `localhost`. That means opening
`http://192.168.x.x:4173` on your phone **will not work** — the app loads but
never installs and never goes offline. You need an HTTPS tunnel.

```bash
npm run dev
```

That serves the folder and opens an ngrok tunnel in one go, then prints the
public HTTPS URL and a QR code to scan with the phone's camera. `Ctrl-C` stops
both. (Needs ngrok installed and authenticated once:
`ngrok config add-authtoken <token>` from dashboard.ngrok.com.)

Prefer to run the two halves yourself:

```bash
npm run serve      # terminal 1 — http://localhost:4173
npm run tunnel     # terminal 2 — ngrok http 4173
```

**The one wrinkle:** a free ngrok URL shows a "You are about to visit…" warning
page on the first request. Tap **Visit Site** once; after that every request —
including the manifest and the service worker — passes through normally. I
checked this specifically, because until you click through, the manifest itself
returns that warning page as HTML and the install prompt will not appear.

Once through: Chrome menu → **Install app**, or Safari → Share → **Add to Home
Screen**. Then turn on aeroplane mode and reopen it — that is the real test.

While iterating, remember the service worker serves the cached copy first and
refreshes in the background, so a change usually shows on the **second** reload.
Run `npm run release` to force it, or use the reload banner.

> The tunnel puts this whole folder on the public internet for anyone with the
> URL. It is a static app with no secrets, but stop the tunnel when you are done.

---

## Publishing to GitHub Pages

The repo ships a workflow at `.github/workflows/pages.yml` that builds and
deploys on every push to `main`. It rebuilds the Tailwind CSS from source, runs
the tests, stamps a fresh service-worker build id, and publishes only the files
the app needs — tests, tooling and `node_modules` never reach the site.

**One-time setup**

```bash
# 1. create an empty repo on github.com (public, no README/licence)
# 2. from this folder:
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
# 3. on GitHub: Settings -> Pages -> Source: "GitHub Actions"
```

That's it. The first push triggers a deploy and the app appears at
`https://<you>.github.io/<repo>/`.

**After that**, every `git push` to `main` redeploys. You do not need to
remember `npm run css` or `npm run release` — the workflow does both. People
with the app already open get a *"A newer version is ready — Reload"* banner.

Serving from a repo subfolder like `/<repo>/` is fully supported: every path in
the app is relative, and I validated the exact artifact the workflow publishes
at a subpath — manifest, icon downloads, service-worker scope and offline all
resolve correctly.

<details>
<summary>Prefer no CI? Deploy straight from the branch instead.</summary>

`src/css/app.css` is committed, so *Settings → Pages → Deploy from a branch →
`main` / root* works with no workflow at all. A `.nojekyll` file is included so
Pages serves the files untouched. The trade-off is that you must remember to run
`npm run release` (rebuilds the CSS **and** stamps the service worker) before
each push, or people will keep seeing the old version.
</details>

### Other free hosts

Netlify, Cloudflare Pages and Vercel all work the same way — connect the repo,
build command `npm run release`, publish directory `.` (or drag the folder onto
Netlify Drop and skip the build entirely). All of them serve HTTPS, which a
service worker requires.

---

## What it does

### Turf cricket
- **Quick match** — type or paste the names of whoever turned up and start
  scoring. No teams to create first. Teams and players are still saved, so
  career figures build up, and reusing a team name next week carries on the
  same record.
- **Split the sides for me** — the app rates everyone on what they have
  actually done and deals them out in a snake draft, then tells you how close
  the two sides are. Players it has never seen are treated as average so they
  spread out rather than stacking on one side.
- **One player, one record** — a regular who turns out for either side keeps a
  single career history instead of a copy per team.
- **Uneven sides** are normal: each team is all out one short of its own size.
- **Turf rule pack** — no LBW (there is no umpire), retire on 25/30/50 so
  everyone gets a bat, a short side may send one player back in for a second
  knock, and a nudge when players still need to bowl their over.

### Scoring
- Big tap targets for **0 1 2 3 4 5 6** plus **OUT**, sized for one thumb.
- Extras armed as toggles: **wide, no ball, bye, leg bye**, each combining with a
  run count (wide + 2 run, no ball + 4 off the bat, 2 leg byes, and so on).
- **12 dismissal types** — bowled, caught, LBW, run out, stumped, hit wicket,
  caught & bowled, obstructing the field, hit the ball twice, timed out,
  retired out and retired hurt (which is not a wicket and lets the batter return).
- **Free hit** after a no ball, with the dismissal list restricted accordingly.
- Automatic strike rotation, end-of-over changeover, bowler quota and the
  "no two overs in a row" rule.
- Prompts for the next batter and next bowler at exactly the right moment.
- Innings break screen, target, required run rate, and a result + player-of-the-match
  screen at the end.
- **Undo** removes the last delivery exactly — including across an innings break
  or after the match has finished.
- Retire a batter, award penalty runs, swap the strike, change bowler mid-over,
  declare an innings closed, or abandon the match.

### The shell
Header, a scrolling middle, then the navigation bar — laid out as a flex column
rather than positioned. Nothing is `position: fixed`, because on iOS a fixed
element tracks a viewport that moves as the address bar hides, which is how a
bottom bar ends up floating in the middle of a page. The bars carry their own
surface tone so content clearly passes behind them.

### Reading results
The results list is deliberately plain: two teams, two scores, who won. The
competition name is a heading over the group rather than a line on every card,
anything being scored right now sorts to the top, and the winning side is the
one that is not dimmed. Toss, venue and the rules a match was played under sit
at the foot of its scorecard, out of the way.

### Sharing
Any scorecard can go out as a **picture** — 1080px wide, drawn on a canvas with
no library, sized so WhatsApp will not crop it badly. Scores, the result, top
three batters and best two bowlers per innings, and the player of the match.
Text sharing is still there for anyone who wants the full card.

### Scorecards
Full batting card with dismissal wording (`c & b Bumrah`, `st Pant b Chahal`),
extras breakdown, bowling figures with maidens and economy, fall of wickets,
partnership bars and an over-by-over ball map.

### Tournaments
- **League** (single or double round-robin), **knockout** brackets, or **groups**.
- Fixtures generated for you — round-robin uses the circle method, knockouts seed
  1 v N with byes, and `n` teams always produce `n − 1` knockout matches.
- **Points table** with wins, losses, ties, form guide and **net run rate**.
- Add semi-finals and a final from the top of the table once the league is done.
- Orange cap / purple cap and five more leaderboards.

### Appearance
Dark by default, with a light theme and a "follow the system" option. The theme
is applied before the first paint, so there is no flash of the wrong one.

### Stats
Career batting, bowling and fielding aggregates across every match on the device,
searchable, with a per-player record sheet (average, strike rate, best figures,
fifties, hundreds, ducks, 3- and 5-wicket hauls, catches, stumpings, run outs).

---

## How the scoring rules are applied

| Situation | What the app does |
|---|---|
| Wide | 1 run (configurable to 2) + anything run. Charged to the bowler. Not a legal ball; the batter is not credited with facing it. |
| No ball | 1 run (configurable) + whatever is scored. Runs off the bat go to the batter; byes/leg byes off a no ball go to extras. Not a legal ball. |
| Free hit | Only run out, obstructing the field or hitting the ball twice can dismiss. A wide keeps the free hit alive; a legal ball clears it. |
| Byes / leg byes | Runs to the team, **not** charged to the bowler. Legal ball, and the batter is credited with facing it. |
| Maiden | Six legal balls conceding nothing off the bowler. Byes and leg byes still allow a maiden; a wide or no ball does not. |
| Bowler's wicket | Credited for bowled, caught, LBW, stumped, hit wicket and caught & bowled. Not for run outs, retirements, obstruction or timed out. |
| Strike | Batters cross on odd runs and change ends at the end of an over. After a catch the new batter takes strike. |
| Innings ends | Overs completed, side all out, or the target passed — whichever comes first. Manual close is available for a declaration or rain. |
| Net run rate | `(runs scored ÷ overs faced) − (runs conceded ÷ overs bowled)`. A side bowled out is charged its **full quota** of overs, per ICC practice. |
| Short squads | A side of six is all out at five, not ten. The innings closes as soon as an end falls vacant with nobody left to walk in. |
| Nobody left to bowl | If quotas and the no-consecutive-overs rule between them rule everyone out, the app relaxes one rule rather than stalling, and says on screen which one it had to give up. |
| Overthrows | 7 to 10 runs off a single ball can be recorded, on their own or on top of a wide or no ball. |
| Uneven sides | Each team is all out one short of **its own** size. Nine against eleven is fine — the nine-a-side team is all out at eight. |
| No LBW | Turf has no umpire, so LBW can be dropped from the list of ways out. |
| Retire on N | You are asked once, on the ball that takes a batter past the mark. They keep their runs and can come back if the side runs short. |
| Second knock | A short side can name one player to bat twice. Both knocks add into the same record, and the side is all out one wicket later. |
| Everyone bowls | Optional. The bowler list puts those still waiting first and warns when there are fewer overs left than players still to bowl. |
| Fixed-run zones | Many turf grounds award set runs for hitting a marked area — a net, a wall, past a line. Name them and give each a value; the runs go to the batter but nobody runs, so the strike does not change. Marked with a `z` in the over strip. |
| Super Over stats | Official records leave them out. Turf sides usually want them in, so it is a setting, on by default. League points are never affected. |
| Tied matches | Stay a tie for league points. To settle a knockout you can play a full **Super Over** — one over each, two wickets, scored ball by ball, with the side that chased batting first — or just record a bowl-out / boundary-count / coin-toss winner. A Super Over is linked to the match it decided and is left out of career figures and the points table. |

Configurable per match: overs, players per side, overs per bowler, wide and
no-ball penalty, free hit on/off, and "last man stands".

---

## How it is built

Every innings is stored as a **list of events**, and the entire scorecard is
recalculated from that list on demand:

```
innings.events = [ {t:'bat'}, {t:'bowl'}, {t:'ball', r:4}, {t:'ball', wd:true}, … ]
                                   │
                        computeInnings()  ← pure function
                                   ↓
   score, wickets, every batting and bowling figure, over map, FoW, partnerships
```

Nothing is stored twice, so nothing can drift out of sync, and undo is just
"drop the last event and recompute". That is why undo is exact even three balls
and an innings break later.

```
cricket-scorer/
├── index.html              app shell (top bar, router outlet, bottom nav)
├── manifest.webmanifest    PWA manifest
├── sw.js                   service worker — precaches the shell, cache-first
├── icons/                  generated PNG + SVG icons
├── src/
│   ├── css/input.css       Tailwind source  →  app.css (built, committed)
│   └── js/
│       ├── app.js          boot + hash router
│       ├── engine.js       ★ the scoring engine (pure, no DOM, no storage)
│       ├── store.js        localStorage persistence + backup/restore
│       ├── stats.js        aggregates, points table, NRR, leaderboards
│       ├── fixtures.js     round-robin and knockout generation
│       ├── ui.js           shared presentational pieces
│       ├── util.js         DOM helpers, formatting, sheets, toasts
│       ├── pwa.js          install prompt + service worker registration
│       └── views/          one module per screen
└── test/                   node test scripts (no framework, no dependencies)
```

---

## Your data

Everything is one JSON blob under the `localStorage` key `cricket-scorer.db.v1`.

- A full 20-over match is roughly **8–10 KB**, so the usual ~5 MB budget holds
  around **500 matches**.
- **It is not backed up anywhere.** Clearing browser data, using a private
  window, or switching device or browser loses it.
- **Settings → Export backup** writes a JSON file; **Import** restores it, either
  replacing everything or merging.

---

## Tests

```bash
npm test                # all three suites (66 assertions)
npm run test:engine     # 29 — ball accounting, extras, maidens, strike, undo
npm run test:edge       # 11 — the awkward cases below
npm run test:views      # 26 — plays full matches, then renders every screen
```

**Engine** covers ball accounting, extras, maidens, strike rotation, dismissals
and bowler credit, innings and match close conditions, results and undo.

**Edge** covers the things that break real scoring: squads smaller than the
nominal team size, quotas and the repeat-over rule leaving nobody able to bowl,
overthrows above six, ties in a knockout, a stumping off a wide, and two browser
tabs writing to the same database.

**Views** play complete matches and assert the books balance — batting runs +
extras = team total, bowler runs + byes = team total, balls bowled = balls faced,
card wickets = wicket count, no bowler over quota or bowling twice in a row —
then render every screen against that data.

Beyond these, the scoring loop, install, subpath hosting and update flows were
each driven in a real headless browser during development.

`node test/seed-gen.mjs > demo.json` produces a realistic four-team league you
can load through **Settings → Import backup** to look around.

---

## Browser support

Chrome, Edge, Firefox and Safari 16.4+ (that is the first Safari with service
worker + manifest install on iOS). Wake lock and haptics degrade quietly where
they are unavailable.
