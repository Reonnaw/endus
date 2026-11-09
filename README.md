# ENDUS Dashboard

Web dashboard for the ENDUS electronic nose (ESP32 + 8 MQ sensors + DHT11, firmware `main.ino`).

```
ESP32 --MQTT i2aspo/<dev>/telemetry--> EMQX --Webhook POST--> /api/ingest (Vercel) --service role--> Supabase
                                                                       dashboard <--anon key, RLS select-only--
```

The dashboard is server-rendered on every request and refreshes every 5 s.

## 1. Supabase

1. Create a project, open **SQL Editor**, paste all of `supabase/schema.sql`, and run it. You can run it again safely.
   If the first version's tables are there (`readings.counts`, `calibrations.rs_air`), they are renamed to `*_legacy` and nothing is dropped.
2. This creates `devices`, `device_secrets`, `sessions`, `readings`, `calibrations`, the views `v_latest_readings`,
   `v_reading_series` and `v_device_status`, and the functions `ingest_telemetry` (service role only) and `reading_buckets` (chart data).
3. RLS is on for every table. anon/authenticated can only `select` devices, sessions, readings and calibrations. `device_secrets` has no policy and no grants.

## 2. Env (Vercel → Settings → Environment Variables, and `.env.local` for dev)

| Name | Where to get it | Exposed to browser? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | yes (just the URL) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | API Keys → publishable / legacy anon | yes, it can only read (RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | API Keys → secret / legacy service_role | **no**, server only |
| `INGEST_SECRET` | `openssl rand -hex 32` | **no**, server only |

The service role key is only read in `lib/supabase.ts`, which imports `server-only`, so a client component that imports it fails the build.
Redeploy after changing env vars.

## 3. EMQX (5.8, either way works; `/api/ingest` accepts both bodies)

**A. Webhook** (Integration → Webhooks → Create)
- Name: `endus_supabase`
- Trigger: Messages → **Message Publish**, Add Topic: `i2aspo/+/telemetry`
- Method: `POST`, URL: `https://endusku.vercel.app/api/ingest`
- Headers: `content-type: application/json` and `x-ingest-secret: <INGEST_SECRET>`
- Leave the body at its default. EMQX then sends the envelope `{ "event": "message.publish", "topic": ..., "payload": "<telemetry JSON>" }`.
- Save, then publish a test message (below) and check Supabase → Table Editor → `readings`.
  The **Test** button next to the URL only checks that EMQX can reach the host.

**B. Rule + HTTP Server action** (Integration → Rules → Create)
- SQL: `SELECT * FROM "i2aspo/+/telemetry"`
- Add Action → HTTP Server, `POST https://endusku.vercel.app/api/ingest`
- Headers: `Content-Type: application/json`, `x-ingest-secret: <INGEST_SECRET>`
- Body: `${payload}` (the raw telemetry JSON)

Use only one of A or B. If both run, every message is posted twice. The second copy is dropped as a duplicate, but each copy still costs a request.

Responses: `200 {ok, device, reading_id, duplicate}`, `200 {ok, ignored}` for other events/topics, `401` wrong secret,
`400` invalid payload, `413` body over 64 KB, `500` server error. Details only go to the Vercel logs.

## 4. Test

```bash
URL=https://endusku.vercel.app/api/ingest   # or http://localhost:3000/api/ingest
S=<INGEST_SECRET>
BODY='{"dev":"i2aspo-TEST01","ms":123456,"up":2,"pre":0,"ep":0,"lbl":"nasi","hrs":2.5,"note":"suhu ruang","c":{"mq2":100,"mq3":200,"mq4":300,"mq5":400,"mq6":500,"mq7":600,"mq8":700,"mq135":800},"t":27.5,"h":60,"cal":0,"rg":1,"s":0}'
curl -s -XPOST $URL -H "content-type: application/json" -H "x-ingest-secret: $S" -d "$BODY"            # 200
curl -s -XPOST $URL -H "content-type: application/json" -H "x-ingest-secret: $S" -d "$BODY"            # 200 again; with ep>0 it says duplicate:true
curl -s -XPOST $URL -H "content-type: application/json" -H "x-ingest-secret: salah" -d "$BODY"         # 401
curl -s -XPOST $URL -H "content-type: application/json" -H "x-ingest-secret: $S" -d '{"dev":"x"}'     # 400
```

`c` may be an object keyed by sensor (`mq2`…`mq135`, as sent by `sketch_nov8a.ino`) or an 8-element array in
`mq2, mq3, mq4, mq5, mq6, mq7, mq8, mq135` order (older firmware). The firmware's `cal`, `rg` and `s` fields are
kept in `readings.raw_payload`; the dashboard still computes its own status from the clean-air calibration.

End to end with MQTTX: publish `$BODY` to `i2aspo/i2aspo-TEST01/telemetry`. A row appears in `readings` and the dashboard shows the device within 5 s.

The anon key must not be able to write:

```bash
curl -s -XPOST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/devices" -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "content-type: application/json" -d '{"device_code":"i2aspo-HACK"}'   # 401/403, permission denied
```

`pnpm test` checks payload parsing, token hashing and the sensor math. `pnpm lint && pnpm build` must pass.

## Sessions

The sample label comes from the dashboard buttons (**Nasi / Mi / Tidak ada**, stored in `devices.sample_label`) and
replaces the firmware's `lbl`. Hours and note still come from the device (`hrs`, `note`).
A reading whose label is not `unknown` joins the device's open session. If the label, hours or note change, the open session is closed and a new one starts.
Readings with `unknown` get no session and close the open one.

## Calibration (required)

MQ sensors only give a resistance, so the status needs a clean-air baseline per device.

1. Pick a long random token per device and hash it (the plaintext is never stored):
   ```bash
   node -e "const c=require('crypto'),s=c.randomBytes(16).toString('hex');console.log('scrypt$'+s+'$'+c.scryptSync(process.argv[1],s,32).toString('hex'))" "<token>"
   ```
2. After the device has sent at least one message (so it exists in `devices`), run in the SQL editor:
   ```sql
   insert into device_secrets (device_id, calibration_token_hash)
   select id, '<hash>' from devices where device_code = 'i2aspo-XXXXXX'
   on conflict (device_id) do update set calibration_token_hash = excluded.calibration_token_hash, updated_at = now();
   ```
3. Switch the device on with no food, wait for the 10-minute preheat, then enter the token in **Alat → Kalibrasi udara bersih**.
   The baseline is the average of the preheated readings from the last minute (at least 6). Repeat when a sensor is replaced or readings drift.

## How the status is decided (`lib/status.ts`, `lib/enose.ts`)

- Response per sensor `S = Rs_air / Rs − 1` (Eq. 1 in the paper), with `Rs_air` from the baseline counts.
- Status uses MQ-2, MQ-3, MQ-7, MQ-8 and MQ-135. MQ-4/5/6 (fuel gases) are shown as info only.
- Highest S: `< 0.5` **Layak dikonsumsi**, `0.5–1.5` **Waspada**, `≥ 1.5` **Tidak layak** (`THRESHOLD`).
  **These are PLACEHOLDER values, not scientific cut-offs.** Replace them with cut-offs from the lab-labelled data.
- Without a baseline the status is "Kalibrasi belum dilakukan". The status line names the sensor that deviates most.
- ppm values come from the datasheet curves (`ppm = a·(Rs/R0)^b`). They are estimates, because MQ sensors are cross-sensitive.
