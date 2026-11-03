# ENDUS Dashboard

Web dashboard for the ENDUS electronic nose (ESP32 + 8 MQ sensors + DHT11, firmware `main.ino`).
Data path: ESP32 → MQTT `i2aspo/<dev>/telemetry` → EMQX → `POST /api/ingest` → Supabase → dashboard (refreshes every 5 s).

## Setup

1. **Supabase**: run `supabase/schema.sql` in the SQL editor.
2. **Env**: copy `.env.example` to `.env.local` and fill it in.
3. **EMQX** (Rule Engine / Data Integration):
   - Rule SQL: `SELECT payload FROM "i2aspo/+/telemetry"`
   - Action: HTTP Server, `POST https://<domain>/api/ingest`
   - Headers: `Content-Type: application/json`, `Authorization: Bearer <INGEST_TOKEN>`
   - Body: `${payload}`
4. `pnpm install && pnpm dev`, then open http://localhost:3000. Use `?dev=i2aspo-XXXXXX` to pick a device; otherwise the latest active one is shown.

## Calibration (required)

MQ sensors only give a resistance, so concentrations need a clean-air baseline per device.
Switch the device on with no food, wait for the 10-minute preheat, then press **Kalibrasi udara bersih**
on the dashboard (token = `CALIBRATE_TOKEN`). Repeat whenever a sensor is replaced or readings drift.

## How the status is decided

- Response per sensor `S = Rs_air / Rs − 1` (same feature as Eq. 1 in the paper).
- Status uses MQ-2, MQ-3, MQ-7, MQ-8 and MQ-135. MQ-4/5/6 (fuel gases) are shown as info only.
- Highest S: `< 0.5` **Layak**, `0.5–1.5` **Waspada**, `≥ 1.5` **Tidak layak** (`lib/enose.ts`, `THRESHOLD`).
  These are provisional and should be replaced with cut-offs from the lab-labelled data.
- ppm values come from the datasheet curves (`ppm = a·(Rs/R0)^b`). They are estimates because MQ sensors are cross-sensitive.

`pnpm test` checks the sensor math.
