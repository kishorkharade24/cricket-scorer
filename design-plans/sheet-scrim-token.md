# Bind the sheet scrim to the scrim tokens

Written against: bfc5317

## Evidence chain

- Surface: every bottom sheet, which on `#/score/:id` means every prompt (next batter, next bowler, wicket, innings break, result, match options, live scoreboard).
- Problem: the scrim behind a sheet is `bg-black/70` in both themes; the theme declares a lighter slate scrim for light mode that never reaches the screen.
- Design evidence: `src/css/input.css:29-30` (`--c-scrim: 0 0 0; --c-scrim-alpha: .70`) and `:53-54` (`--c-scrim: 15 23 42; --c-scrim-alpha: .45` under `html[data-theme='light']`); `DESIGN.md` → `colors.scrim`, `components.scrim`, Themes table row `scrim`; no file in `src/` references `--c-scrim`.
- Owner: `src/js/util.js:137` (`sheet()`).
- Scope and affected surfaces: `src/js/util.js:137`; consumers are every `sheet()`, `confirmDlg()` and `promptDlg()` call in the app.
- Uncertainty: none.

## Design decision

Paint the scrim from the declared tokens so light mode gets the designed slate 45% wash and dark mode stays black 70%. The per-theme alpha cannot be expressed through a Tailwind colour alias (`<alpha-value>` is fixed at the call site), so the binding lives in a component class, following `.chrome`.

## Reuse

- `--c-scrim` and `--c-scrim-alpha` from `src/css/input.css`.
- Exemplar: `.chrome { background-color: rgb(var(--c-chrome)); }` at `src/css/input.css:140`.

A new class `.scrim` is required because the existing system cannot express a token with a theme-dependent alpha as a utility. It belongs in `@layer components` next to `.chrome`; its only consumer is `sheet()`.

## Changes

1. `src/css/input.css`, `@layer components`, directly after the `.chrome-bottom` light-mode rules
   - Change: add `.scrim { background-color: rgb(var(--c-scrim) / var(--c-scrim-alpha)); }`.
   - Preserve: everything else in the layer.
   - Verify: `npm run css` emits a `.scrim{…}` rule in `src/css/app.css`.
2. `src/js/util.js:137`
   - Change: replace `bg-black/70` with `scrim` on the backdrop `<div>`.
   - Preserve: `absolute inset-0 backdrop-blur-sm animate-fade-in` and `data-close="__dismiss"`.
   - Verify: opening any sheet in light mode shows a slate wash through which the page is still visible; in dark mode the wash is unchanged.

## Scope

- Inherit: every sheet, confirm and prompt in the app.
- Verify: the scoring prompts, the settings theme picker, the teams editor.
- Exclude: the sheet body colour (`bg-ink-900/95`, already token-bound) and the celebration overlay (`#fx`, no scrim).

## Validation

- Product: in light mode, tap "More options" on the scoring screen; the background dims to slate, not black.
- Interface: any sheet, both themes, phone width and `sm`+ (centred sheet).
- System: one new component class with one consumer; no parallel scrim pattern remains.
- Repository: `grep -n "bg-black/70" src/js/util.js` → no output; `npm run css && grep -c '\.scrim{' src/css/app.css` → `1`; `npm test` → `27 passed, 0 failed`.

## Stop conditions

- Stop if any other element in `src/` uses `bg-black/70` for a purpose other than the sheet scrim (none found at bfc5317).

## Design documentation

- After acceptance and validation: in `DESIGN.md` → Layout, record "the scrim behind a sheet is the `.scrim` class".
