---
name: ENDUS Dashboard
description: Monitoring kelayakan nasi & mi dari electronic nose ENDUS, dibangun seperti ompreng MBG.
colors:
  moss: "#4a6026"
  moss-deep: "#34451a"
  moss-soft: "#dde6cc"
  on-moss: "#f6f9ef"
  on-moss-2: "#d3dfbd"
  ground: "#e4e9e1"
  tray: "#edf1ea"
  tray-edge: "#c7cfc2"
  well: "#f8faf6"
  ink: "#17200f"
  ink-2: "#455040"
  muted: "#5b6655"
  line: "#d3dacd"
  ok: "#3b7a1e"
  ok-wash: "#e2eed3"
  warn: "#855600"
  warn-mark: "#c98a00"
  warn-wash: "#f5e9c8"
  bad: "#ad3524"
  bad-wash: "#f5dad3"
  idle: "#6f7a68"
  idle-wash: "#e7ebe3"
  series-1: "#2a78d6"
  series-2: "#eb6834"
  series-3: "#1baf7a"
  series-4: "#eda100"
  series-5: "#e87ba4"
typography:
  status:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "3rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.025em"
  section-display:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    letterSpacing: "-0.025em"
  metric:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    fontFeature: "tnum"
  title:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum"
  data-id:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
rounded:
  chip: "8px"
  control: "12px"
  icon-tile: "16px"
  well: "20px"
  tray: "28px"
spacing:
  tray-pad: "10px"
  well-gap: "10px"
  well-pad: "24px"
  band-gap: "24px"
components:
  button-primary:
    backgroundColor: "{colors.moss}"
    textColor: "{colors.on-moss}"
    rounded: "{rounded.control}"
    height: "40px"
    padding: "0 16px"
  button-primary-hover:
    backgroundColor: "{colors.moss-deep}"
    textColor: "{colors.well}"
  input:
    backgroundColor: "{colors.well}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "40px"
  sensor-chip-ok:
    backgroundColor: "{colors.ok-wash}"
    textColor: "{colors.ok}"
    rounded: "{rounded.chip}"
  sensor-chip-bad:
    backgroundColor: "{colors.bad-wash}"
    textColor: "{colors.bad}"
    rounded: "{rounded.chip}"
  top-bar:
    backgroundColor: "{colors.moss}"
    textColor: "{colors.on-moss}"
    height: "64px"
---

# ENDUS Dashboard design system

## Overview

North star: **the MBG ompreng**. The page is a stainless tray with compartments pressed into it. The biggest compartment holds the answer (can this food be served?), and the smaller ones hold the readings that explain it. A moss-green bar runs across the top over a cool brushed-steel ground. The dashboard is an Operate surface: standard controls and navigation. The tray and its compartments are the only world motif.

## Colors

- **Moss** owns the top bar, primary button, step numbers and section icons.
- **Steel neutrals** (`ground`, `tray`, `well`) are greys tinted toward the moss hue, never pure grey.
- **Status colours** come from the kitchen and the field: leaf green `ok`, ripening-rice gold `warn`/`warn-mark`, brick red `bad`, steel `idle` for preheat, uncalibrated and unknown. Each has a `-wash` tint, which fills the whole status compartment. `warn` is the text colour; `warn-mark` is for fills and icon tiles.
- **Chart series** `series-1..5` are validated for colour-blind separation (light and dark). They are used only for the five gas-response lines and never for status.
- Dark mode is a stepped palette of its own (in `app/globals.css`), not an inversion.

## Typography

Geist carries everything; Geist Mono is only for device IDs and sensor codes. All numerals are tabular. Steps: status 3rem (2.25rem on phones) → section display 2.25rem → metric 2.25rem → title 1.125rem → body 0.875rem → caption 0.75rem. No kickers or eyebrows: headings stand on their own, with a drawn icon beside section titles.

## Layout

- Max width 72rem (`max-w-6xl`). Each band is one tray; on desktop it splits into a 1.65fr / 1fr grid of wells, and on phones it stacks to one column.
- Grid children are `min-w-0`, so a wide table scrolls inside its own well and never widens the page.
- On phones the status compartment fills the first screen (capped at 40rem), and a scrollable section nav sits under the bar.
- "Cara kerja" sits outside the trays on the plain ground: quieter, reading-paced prose.

## Elevation & Depth

Exactly two levels:
1. **Tray**: raised, with a soft offset drop shadow (`0 10px 28px -16px`), a 1px edge and a faint brushed grain.
2. **Well**: pressed in, with an inset shade at the top, a light rim at the bottom, and no drop shadow.

Tooltips float above with a soft shadow. There are no other shadows.

## Shapes

Radii nest from outer to inner: tray 28px → well 20px → icon tile 16px → control 12px → chip 8px. Status icons sit in rounded-square tiles. The status ladder is three rounded steps of rising height (14 / 28 / 42px), so the level reads from shape as well as colour.

## Components

- **Status compartment**: online dot and device ID; icon tile and status word in the status colour; one advice line; the ladder; the score, labelled with the provisional thresholds; facts (sample, storage time, status since).
- **Line chart** (`LineChart`): 2px lines, recessive gridlines, dashed threshold lines with labels on the left, pale bands above the thresholds, crosshair and tooltip on hover, arrow keys move through the readings, and a legend whenever there are 2 or more series.
- **Status timeline**: each segment's width equals its duration; gaps in the data are hatched.
- **Gas table**: grouped into "Menentukan status" (decides the status) and "Info saja" (info only). Response bars carry tick marks at the thresholds.
- **Device health**: a list with drawn icons and a Baik/Cek ("OK"/"check this") label plus icon. 8 sensor chips.
- **Logo** (`Logo` in `app/icons.tsx`, favicon `app/icon.svg`): an ompreng seen from above, with a rim outline, the large rice well on the left and three side wells. On moss it uses `on-moss`.
- Icons come from `app/icons.tsx`: one drawn set on a 24px grid with 1.75 stroke. Never unicode glyphs.

## Do's and Don'ts

- Do give every status its icon and its label as well as its colour.
- Do label estimates and provisional thresholds wherever they appear.
- Do keep new panels as wells inside a tray. Don't float white cards on the ground.
- Don't use status colours for chart series, or series colours for status.
- Don't add kickers or eyebrow labels above headings.
- Don't nest wells inside wells.
