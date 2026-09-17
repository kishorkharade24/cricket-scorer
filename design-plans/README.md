# UI audit — scoring surface (`#/score/:id`)

**Status: historical.** This describes the app at `bfc5317`, before the
scoreboard/scorebook redesign. All three findings were applied, and the redesign
then replaced the token system they refer to, so the class names and the
light-mode accent remap described below no longer exist. Kept as a record of how
the surface was audited and what the evidence was, not as current guidance.

Produced with the `improve-ui` skill (ibelick/ui-skills), read-only on product source.
Written against: `bfc5317`, plus the `DESIGN.md` created in the same session from the
sources listed below.

## Design language
- Audited surface: `src/js/views/score.js` (route `#/score/:id`) rendered inside the shell in `index.html`; its prompts run through `sheet()` and `confirmDlg()` in `src/js/util.js`; it composes `badge()`, `ballChip()`, `livePill()`, `iconBtn()` and `empty()` from `src/js/ui.js`.
- Design sources: `DESIGN.md`; `src/css/input.css` (theme variables, `@layer components`, generated light-mode accent remap); `tailwind.config.cjs` (colour aliases, safelist, shadows, keyframes); `src/js/util.js` `ACCENTS`; `README.md` sections "The shell", "Reading results", "Appearance"; `scripts/gen-light-accents.mjs`.
- Documented decisions: every colour resolves through a CSS variable and `white` is the foreground/overlay role; wash surfaces are `bg-white/<alpha>`; accent text at shades 100–400 is remapped in light mode by generated rules that match the exact class name; the sheet scrim is `--c-scrim` at `--c-scrim-alpha` (dark `#000 @ .70`, light `#0f172a @ .45`).
- Governing owners and consumers: `.card`, `.btn-*`, `.field`, `.label`, `.pill`, `.runbtn`, `.chrome` in `input.css` → every view; `avatar()`, `pill()`, `badge()`, `ballChip()`, `iconBtn()` in `ui.js` → 3–11 views each; `sheet()` in `util.js` → every prompt in the app.
- Explicit exceptions: None documented.

## Findings
| # | Problem | Evidence | Proposed change | Scope | Confidence |
| --- | --- | --- | --- | --- | --- |
| 1 | `bg-white/8` generates no CSS, so the non-striker avatar, the batter/fielder pickers, the "Runs on that ball" keys and the "Result" pill render with no fill at all. | Contract: `avatar()` (`ui.js:24`) and `pill()` (`ui.js:48`) are the shared owners and both specify an 8% `fg` wash; `DESIGN.md` records `avatar.backgroundColor` as `rgb(255 255 255 / 0.08)`. Runtime: `src/css/app.css` contains 0 rules for `.bg-white\/8` and 1 for `.bg-white\/10`; a probe build with the project's `tailwind.config.cjs` on Tailwind 3.4.19 emits `bg-white/[.08]` and `bg-white/10` but nothing for `bg-white/8`, because `8` is not on Tailwind v3's opacity scale. | Replace every `bg-white/8` with `bg-white/[.08]`, the arbitrary-alpha form the codebase already uses for `.card` (`bg-white/[.045]`) and `.card-h` (`bg-white/[.075]`). | 22 sites in 11 files; 6 of them in `score.js` (lines 146, 191, 461, 565, 580, 593); root owners `ui.js:24` and `ui.js:48`. | High |
| 2 | The armed-extra hint ("Wide armed — tap the runs…") is `text-amber-200/90`, which the light-mode remap cannot match, so in light mode it is pale yellow on a white card. | Contract: `input.css` `@layer utilities` comment and `scripts/gen-light-accents.mjs` — accent text is remapped per exact class; `DESIGN.md` Colors: "Write accent text as a plain `text-<hue>-<shade>` class with no opacity modifier". Runtime: `app.css` has `.text-amber-200\/90{color:hsla(48,97%,77%,.9)}` and no `html[data-theme='light']` override for it, while `.text-amber-200` has one (`#92400e`). | Change `text-amber-200/90` to `text-amber-200` at `score.js:317`. The neighbouring notices at `score.js:688` and `:691` already use the plain form. | One site in the whole app. | High |
| 3 | The bottom-sheet scrim is hardcoded `bg-black/70`, so light mode gets a 70% black wash instead of the slate 45% the theme declares. | Contract: `input.css` `:root` and `html[data-theme='light']` declare `--c-scrim` and `--c-scrim-alpha` with different light values; `DESIGN.md` records the `scrim` token and the `scrim` component. Runtime: nothing in `src/` references `--c-scrim`; `sheet()` at `util.js:137` paints `bg-black/70`, and every prompt on the scoring screen opens through `sheet()`. | Add `.scrim { background-color: rgb(var(--c-scrim) / var(--c-scrim-alpha)); }` to `@layer components` beside `.chrome` (the exemplar for a token-bound surface), and use `scrim` in place of `bg-black/70` in `sheet()`. Tailwind's `<alpha-value>` cannot carry a per-theme alpha, which is why a class rather than a colour alias is required. | `util.js:137`; reaches every sheet in the app. | High |

## Improve first
Finding 1. It has the widest reach (22 sites, every avatar and default pill in the app), the most visible consequence (elements drawn with no fill), and a mechanical, deterministic correction with an in-repo exemplar.

## Candidates rejected in vetting
- Eyebrow labels at 9px, 10px and 11px within `score.js`, `ui.js` `section()`, `stat()` and `.label`: no single owner governs the in-card role, and the evidence supports more than one correction.
- `stat()` in `ui.js` has no consumers: not a design finding.
- `--vvh` is declared and unused: no user-facing consequence.
- `.tbl td:first-child` is declared twice in `input.css`: code quality, out of scope.
- Accessibility (9px table headers, 7×7 avatar hit areas): excluded unless requested, per the skill.
- `turf-*` and `ball-*` colour tokens in `tailwind.config.cjs` have no consumers: reported with `DESIGN.md`, not a surface finding.

## Plans
The user was not available to select findings, so one plan was written per finding:
1. `wash-fill-eight-percent.md`
2. `armed-extra-hint-light-mode.md`
3. `sheet-scrim-token.md`
