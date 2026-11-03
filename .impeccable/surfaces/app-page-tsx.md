---
version: 1
slug: "app-page-tsx"
primary_target: "app/page.tsx"
related_targets: ["app/client.tsx","app/globals.css"]
---

# Surface brief: ENDUS monitoring dashboard (app/page.tsx)

Mode: Operate. Audience: kitchen staff on phone/tablet (bright kitchen) and I2ASPO judges on laptop/projector, equally weighted.
Task: know at a glance whether the food can still be served; judges also learn how ENDUS works.
Sections (confirmed): status, temperature & humidity, gas trend chart, status history, gas detail, device health, how ENDUS works, calibration.
Constraints: moss green primary; Indonesian copy; provisional thresholds and ppm estimates labelled; no invented results.

## Direction contract

THESIS: The dashboard is an MBG ompreng: one pressed stainless tray whose largest compartment holds the serve/don't-serve answer and whose smaller compartments hold the supporting readings. Refuses the default grid of identical floating white cards on grey.

OWN-WORLD: Moss-green top bar over a cool brushed-steel ground (grey tinted green). Panels are inset compartments: soft inner shadow, inner radius, a thin lighter rim, sitting inside one raised tray plate. Status colours from the kitchen field: leaf green (Layak), ripening-rice gold (Waspada), brick red (Tidak layak), each with its own drawn icon and step height. One workhorse sans (Geist), tabular numerals, mono only for device id and raw data.

STORY: Visitor sees the status first, then why (temperature, gases), then how it changed (trend, history), then whether the device is healthy, and judges finish on how it works and its scientific basis.

FIRST VIEWPORT: Moss bar with ENDUS wordmark, section links, online pill. Below, the tray: large status compartment left (icon, status word at ~3rem, one-line advice, three-step ladder marking the current score, sample label and storage hours, time in current status); right column two compartments for Suhu and Kelembapan with values and 1-hour line. On phone the status compartment fills the first screen.

FORM: Ompreng MBG, candidate 1 on the ordered list (IMPECCABLE'S PICK, chosen by user). seed:6c1669017d636085

Signature move: the tray: compartments pressed into one steel plate, the status compartment largest like the rice well.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
