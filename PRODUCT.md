# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Two audiences, equally important:
- Judges at I2ASPO 2026 (IoT and Its Applications category): online judging on Zoom (14–15 Dec 2026) and offline judging at UGM (21–22 Dec 2026), viewed on a laptop or projector. They need to understand what the device does and why it matters within seconds.
- Kitchen staff in school-meal (MBG), catering and warung kitchens, checking on a phone or tablet while working. They need one answer: can this food still be served.

## Product Purpose
ENDUS ("mengendus", to sniff) is a low-cost IoT electronic nose that screens cooked rice and noodles stored at room temperature for spoilage risk (Bacillus cereus hazard). The dashboard turns raw gas readings into a serve / don't-serve decision, shows temperature and humidity, and lists the estimated gases. Success: a correct status at a glance, and judges grasp the mechanism without a walkthrough.

## Positioning
A food-condition reading instead of a fixed time rule (e.g. "discard after 2 hours"): it judges the food itself, so it can flag risky food that still looks and smells fine and avoid throwing away food that is still safe. The paper's labels come from microbiological counts, not storage time.

## Operating Context
Data path: ESP32 + 8 MQ gas sensors (MQ-2/3/4/5/6/7/8/135) on 2x ADS1115 + DHT11 → MQTT (EMQX) → Next.js `/api/ingest` → Supabase → dashboard, every 5 s. A session topic carries a sample label (e.g. "nasi") and storage hours. Sensors need a 10-minute preheat and a clean-air calibration per device.

## Capabilities and Constraints
- Status levels: Layak / Waspada / Tidak layak (paper's Safe / Declining / Risky), plus preheat, uncalibrated and sensor-error states.
- Status thresholds are provisional until lab-labelled data trains the model; must be presented as such.
- Gas ppm / % vol values are datasheet-curve estimates (MQ sensors are cross-sensitive), not lab measurements.
- The device is a screening tool and does not replace laboratory testing.
- UI language: Indonesian.

## Brand Commitments
- Primary colour: moss green (hijau lumut), set by the team.
- Name: ENDUS. Team from Universitas Negeri Surabaya (UNESA).

## Evidence on Hand
- Paper: ENDUS full paper (results tables are still placeholders: no accuracy, recall or sample counts yet). Must not invent results.
- References used: Tangtisanon & Grodniyomchai 2025 (Sensors and Materials 37:5373, portable e-nose, MQ-2/MQ-7/MQ-135, spoiled rice); PMC7158669 (lab e-nose detecting B. cereus, Vet. Sci. 2020); Foods 11(9):1181 (MDPI, 2022); HPA 2009 B. cereus criteria (<10³ satisfactory, 10³–10⁵ borderline, >10⁵ CFU/g unsatisfactory).
- Product photo: breadboard prototype in a clear plastic box (no product renders).

## Product Principles
- The status answer comes first; everything else explains or supports it.
- Never overstate: estimates and provisional thresholds are labelled as such.
- Safety-first: when unsure (preheat, uncalibrated, sensor error), say so rather than show "Layak".
- Readable by a cook on a phone and a judge on a projector.
