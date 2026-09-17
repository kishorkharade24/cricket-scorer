---
version: alpha
name: Cricket Scorer
description: Offline-first cricket scoring PWA used one-handed on a phone. Two themes drawn from real cricket objects, a manual scoreboard and a paper scorebook.
colors:
  primary: "#f1ead9"
  ground: "#0f1a15"
  plate: "#17251e"
  fill: "#1f3027"
  rule: "#2a3a31"
  fg: "#f1ead9"
  muted: "#b5b09e"
  faint: "#7a776b"
  wicket: "#ef6a58"
  boundary: "#dba946"
  action: "#f1ead9"
  on-action: "#0f1a15"
  chrome: "#0c1511"
  pure: "#ffffff"
typography:
  sans:
    fontFamily: Barlow
    fontSize: 14px
    lineHeight: 1.45
  display:
    fontFamily: Barlow Condensed
    fontWeight: 800
    letterSpacing: 0.005em
  score:
    fontFamily: Barlow Condensed
    fontSize: 60px
    fontWeight: 800
    lineHeight: 0.85
  label:
    fontFamily: Barlow
    fontSize: 11px
    fontWeight: 600
  body:
    fontFamily: Barlow
    fontSize: 13px
    fontWeight: 400
components:
  page:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.fg}"
    typography: "{typography.sans}"
  chrome:
    backgroundColor: "{colors.chrome}"
  card:
    backgroundColor: "{colors.plate}"
    rounded: 12px
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.on-action}"
    rounded: 8px
    padding: "10px 16px"
  button-ghost:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.fg}"
    rounded: 8px
    padding: "10px 16px"
  run-key:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.fg}"
    rounded: 8px
    height: 64px
    typography: "{typography.display}"
  run-key-boundary:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.boundary}"
    rounded: 8px
    height: 64px
  run-key-six:
    backgroundColor: "{colors.boundary}"
    textColor: "{colors.on-action}"
    rounded: 8px
    height: 64px
  run-key-out:
    backgroundColor: "{colors.wicket}"
    textColor: "{colors.on-action}"
    rounded: 8px
    height: 64px
  field:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.fg}"
    rounded: 8px
    padding: "10px 14px"
  label:
    textColor: "{colors.muted}"
    typography: "{typography.label}"
  pill:
    rounded: 9999px
    padding: "4px 10px"
    textColor: "{colors.muted}"
  icon-button:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.muted}"
    size: 36px
    rounded: 8px
  avatar:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.muted}"
    size: 36px
    rounded: 9999px
  scrim:
    backgroundColor: "{colors.ground}"
  qr-panel:
    backgroundColor: "{colors.pure}"
    rounded: 12px
omitted:
  - section: rounded
    reason: "Radii come from Tailwind's default scale; per-component radii are recorded under components."
  - section: spacing
    reason: "Spacing comes from Tailwind's default scale; the repository names no spacing tokens of its own."
---

# Cricket Scorer

## Overview

Cricket Scorer is a ball-by-ball scoring app used one-handed on a phone, outdoors, while a game is going on. Both themes are drawn from objects a cricketer already reads without thinking. The default is the manual scoreboard at a ground: a dark green board, chalk-white number plates, red only for a wicket. The alternative is the scorebook: cream paper, ink, ruled lines, red ink for dismissals. The scoring pad is sized for one thumb, and the score itself is the largest thing on the screen.

## Colors

Every colour resolves through a CSS variable on the root element, so one `data-theme` attribute swaps the board for the paper. Author colour through the six role names below and never write a literal hex in markup.

- **ground** is the board, or the page of the book. **plate** is a raised number plate, **fill** a plate one step up, **rule** the ruled line. Plates are opaque, not translucent washes, so neither theme needs a second set of surface rules.
- **fg**, **muted** and **faint** are the whole text ramp. Use fg for scores and names, muted for labels and secondary figures, faint only for things that carry no information on their own.
- **wicket** means a wicket fell. It also carries destructive actions, because losing a wicket and deleting a match are the same kind of event to a scorer. Nothing else may use it.
- **boundary** means the ball reached the boundary. A four is outlined in it, a six is filled with it, and the free hit and the tournament leader borrow it. It is the only decorative-looking colour in the app and it always means "more".
- **primary** and **action** are the same colour under two names: the specification expects a `primary`, and the code calls the role `action`. It is the one thing you tap to go on. It is not a hue: on the board it is a chalk plate, on the paper an ink plate. Pair it with **on-action** for its label.
- Team colours are separate from all of the above. Eight club colours live as `tm-*` classes, each setting a single `--tm` variable with a value per theme. A team mark uses `tm` for the colour, `tm-soft` for a tint of it, `tm-edge` for a border and `tm-dot` for a solid swatch.

## Themes

The installed specification has no theme-mode syntax, so the frontmatter carries the Scoreboard values and this table carries the Scorebook values of the same tokens.

| Token | Scoreboard (dark) | Scorebook (light) |
| --- | --- | --- |
| ground | #0f1a15 | #f4eee0 |
| plate | #17251e | #fcf9f1 |
| fill | #1f3027 | #ede6d5 |
| rule | #2a3a31 | #d6ccb6 |
| fg | #f1ead9 | #1e1b15 |
| muted | #b5b09e | #5f5a4c |
| faint | #7a776b | #8a8472 |
| wicket | #ef6a58 | #b3271a |
| boundary | #dba946 | #8a5f0e |
| action | #f1ead9 | #1e1b15 |
| on-action | #0f1a15 | #f4eee0 |
| chrome | #0c1511 | #fcf9f1 |
| scrim alpha | 0.62 | 0.45 |

## Typography

Barlow and Barlow Condensed are bundled as woff2 and precached, so the app keeps its own voice offline. Barlow Condensed is the display face and carries every figure that matters: the score, the overs, team names in headers, table totals. Apply it with the `display` class, which also sets tabular numerals. Barlow carries everything else at 400 for body and 600 for labels; nothing on the sans face is heavier than 600, because no heavier weight is bundled.

Labels are sentence case in the muted colour. The app has no tracked-out capitals and no eyebrow above a heading. Any figure that can change width sits on `num` or `display` so it does not jitter as it counts up.

## Layout

The shell is one flex column pinned with `position: fixed; inset: 0`: top bar, a scrolling main, bottom nav. It is sized by `inset`, never `vh` or `dvh`, because in an installed iOS app those units disagree with the height the web view actually gets. Content sits in `mx-auto max-w-3xl px-4`. The top bar pads by `env(safe-area-inset-top)` and the nav uses `safe-b`.

One plate per screen carries the thing you came for, which on the scoring screen is the live score. Everything else is rows on ruled lines, the way a scorebook is ruled, using `divide-y divide-rule`. Cards are not the unit of layout.

The scoring screen is a cockpit, not a document. The score is pinned to the top of the scroll area and the run pad to the bottom, both with `sticky`, so a scorer never scrolls to reach the keys or loses sight of the total. Only the reference panels move between them: who is at the crease, this over, and recent overs. Anything added to that screen goes in the scrolling middle, never between the two pinned panels. Sticky breaks if an element between the pinned card and `#scroller` sets `overflow`, so that container stays free of it.

Sheets open from the bottom on phones and centre at `sm` and above through `sheet()`. Every prompt in the app is a sheet; destructive ones go through `confirmDlg()`.

## Elevation & Depth

Depth is a step in surface colour and a one-pixel rule, never a shadow or a blur. Ground, plate and fill are the three steps. The two bars are opaque chrome with a single hairline edge. Only sheets and toasts carry a shadow, and nothing in the app uses a backdrop blur or a gradient.

## Shapes

Cards use the larger radius; buttons, fields, run keys and icon buttons one step smaller; chips, pills, avatars and the sheet grab handle are fully round. Bottom sheets round only their top edge on phones.

## Components

Buttons are `btn-primary` (one per view), `btn-ghost` for everything else, `btn-danger` only inside a confirmation, and `btn-chip` for small inline choices. Run keys are `key`, `key-dot`, `key-four`, `key-six` and `key-out`. Icon-only buttons go through `iconBtn()`, which sets the accessible name. Icons come from the `ICON` set in `ui.js` and size themselves to the surrounding text through the `icon` class. Status is a `pill`, `pill-live` or `pill-boundary`. A delivery is a `ballChip()`. Empty screens are `empty()` with one call to action. Feedback is `toast()` with a kind of info, ok, warn or error.

## Do's and Don'ts

- Do keep the score the largest element on the scoring screen.
- Do keep the score and the run pad in view at all times while scoring.
- Do show the winner by dimming the losing row, not by adding a badge the sentence already states.
- Do add a new team colour as a `tm-*` class with both theme values, not as a Tailwind hue.
- Don't use red for anything but a wicket or a destructive action.
- Don't size the shell or the bars with `vh`, `dvh` or `position: fixed`.
- Don't add a gradient, a backdrop blur or a decorative glow.
- Don't animate content on entry. Motion answers a tap and nothing else.
- Don't use emoji in the interface; every symbol comes from the `ICON` set.
- Don't set tracked-out capitals, or put an eyebrow label above a heading.
- Don't add a column legend or a section heading to a panel whose numbers already read plainly. That height is paid on every ball.
