# Restore the 8% foreground wash on avatars, pills and keys

Written against: bfc5317

## Evidence chain

- Surface: `#/score/:id` — the non-striker avatar in the crease card, the "Result" pill in the scoreboard, and the batter / who-is-out / fielder pickers and "Runs on that ball" keys inside sheets; the same defect appears wherever `avatar()` or `pill()` render.
- Problem: elements written as `bg-white/8` have no background, because Tailwind v3 does not generate a rule for an opacity modifier of `8`.
- Design evidence: `src/js/ui.js:24` (`avatar()`) and `src/js/ui.js:48` (`pill()` default) specify an 8% `fg` wash; `DESIGN.md` → `components.avatar.backgroundColor: rgb(255 255 255 / 0.08)`; `src/css/app.css` contains no `.bg-white\/8` rule; a probe build on Tailwind 3.4.19 with the project config confirms the class is not emitted.
- Owner: `src/js/ui.js` (`avatar`, `pill`) for the shared pieces; inline copies in the views listed under Scope.
- Scope and affected surfaces: `src/js/ui.js:24,48`; `src/js/views/score.js:146,191,461,565,580,593`; `src/js/views/setup.js:211,213,363`; `src/js/views/tournaments.js:50,53,95`; `src/js/views/stats.js:69,121`; `src/js/views/home.js:110`; `src/js/views/live.js:216`; `src/js/views/quick.js:194`; `src/js/views/scorecard.js:149`; `src/js/views/team-detail.js:123`; `src/js/views/teams.js:49`.
- Uncertainty: none.

## Design decision

Keep the intended 8% wash and write it in the form Tailwind v3 compiles. This resolves the root problem (an uncompilable class) rather than the symptom (unfilled discs on one screen).

## Reuse

- `bg-white/[.08]` — the arbitrary-alpha form of the `fg` wash already used by `.card` (`bg-white/[.045]`) and `.card-h` (`bg-white/[.075]`) in `src/css/input.css`.
- Exemplar: `src/css/input.css:104` (`.card`).

No new primitive. Consolidating the inline avatar spans onto `avatar()` is a separate decision (their sizes differ from its `sm`/`md` variants) and is excluded here.

## Changes

1. Every file under Scope
   - Change: replace the class token `bg-white/8` (whole token, not `bg-white/80` or similar) with `bg-white/[.08]`.
   - Preserve: every other class on those elements, and the `hover:` / `active:` variants around them.
   - Verify: after `npm run css`, `src/css/app.css` contains one `.bg-white\/\[\.08\]` rule and no `.bg-white\/8` reference remains in `src/js` or `index.html`.

## Scope

- Inherit: every consumer of `avatar()` and `pill()` (11 views).
- Verify: the scoring screen's crease card and sheets; the teams and tournaments lists; setup and quick-match pickers.
- Exclude: `bg-white/80`, `bg-white/[.045]`, `bg-white/[.05]`, `bg-white/[.075]`, `bg-white/10` and any `text-` or `border-` wash.

## Validation

- Product: start a quick match and open the "Next batter in" sheet; every player row shows a filled initials disc, and the non-striker's disc in the crease card is filled.
- Interface: `#/score/:id` in dark and light themes; `#/teams`, `#/tournaments`, `#/match/new`.
- System: no new class shape is introduced; the wash uses the same arbitrary-alpha form as `.card`.
- Repository: `grep -rn "bg-white/8\b" src/js index.html` → no output; `npm run css && grep -c '\.bg-white\\/\[\.08\]{' src/css/app.css` → `1`; `npm test` → `27 passed, 0 failed`.

## Stop conditions

- Stop if `src/css/app.css` already contains a `.bg-white\/8` rule (the premise would be false).
- Stop if a replacement would touch a class other than the exact token `bg-white/8`.

## Design documentation

- After acceptance and validation: none — `DESIGN.md` already records the avatar wash as 8%.
