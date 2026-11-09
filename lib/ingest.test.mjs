import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTelemetry } from "./ingest.ts";
import { hashToken, safeEqual, verifyToken } from "./secret.ts";

const NOW = Date.parse("2026-11-08T12:00:00Z");
const raw = { dev: "i2aspo-ABC123", ms: 123456, up: 2, pre: 0, ep: 1760000000, lbl: "Nasi", hrs: -1, note: "", c: [100, 200, 300, 400, 500, 600, 700, 800], t: 27.5, h: 60 };
// Shape published by sketch_nov8a.ino: counts as an object keyed by sensor, in CHANNELS[] order.
const firmware = {
  dev: "i2aspo-ABC123", ms: 123456, up: 2, pre: 1, ep: 1760000000, lbl: "Nasi", hrs: 2.5, note: "suhu ruang",
  c: { mq6: 500, mq7: 600, mq8: 700, mq135: 800, mq2: 100, mq3: 200, mq4: 300, mq5: 400 },
  t: 27.5, h: 60, cal: 1, rg: 1, s: 2.34,
};
const parse = (body) => parseTelemetry(JSON.stringify(body), NOW);

test("raw payload", () => {
  const p = parse(raw);
  assert.equal(p.dev, "i2aspo-ABC123");
  assert.equal(p.args.p_recorded_at, "2025-10-09T08:53:20.000Z");
  assert.equal(p.args.p_label, "nasi");
  assert.equal(p.args.p_planned_hours, null);
  assert.equal(p.args.p_preheated, false);
  assert.deepEqual(p.args.p_raw, raw);
});

test("firmware payload with counts as an object", () => {
  const p = parse(firmware);
  assert.equal(p.dev, "i2aspo-ABC123");
  assert.deepEqual(p.args.p_counts, [100, 200, 300, 400, 500, 600, 700, 800]);
  assert.equal(p.args.p_preheated, true);
  assert.equal(p.args.p_planned_hours, 2.5);
  assert.equal(p.args.p_note, "suhu ruang");
  assert.deepEqual(p.args.p_raw, firmware); // cal/rg/s are kept in raw_payload
});

test("webhook envelope with string payload", () => {
  const p = parse({ event: "message.publish", topic: "i2aspo/i2aspo-ABC123/telemetry", clientid: "x", timestamp: 1, payload: JSON.stringify(raw) });
  assert.equal(p.dev, "i2aspo-ABC123");
  assert.deepEqual(parse({ event: "client.connected", clientid: "x" }), { ignored: true });
  assert.deepEqual(parse({ event: "message.publish", topic: "i2aspo/i2aspo-ABC123/session", payload: "nasi|2|x" }), { ignored: true });
  assert.deepEqual(parse({ event: "message.publish", topic: "i2aspo/i2aspo-ABC123/telemetry", payload: "nope" }), { error: "payload is not JSON" });
});

test("clock and sensor fallbacks", () => {
  const p = parse({ ...raw, ep: 0, t: null, h: 255, hrs: 2.5 });
  assert.equal(p.args.p_recorded_at, new Date(NOW).toISOString());
  assert.equal(p.args.p_temperature_c, null);
  assert.equal(p.args.p_humidity_pct, null);
  assert.equal(p.args.p_planned_hours, 2.5);
  assert.equal(parse({ ...raw, ep: NOW / 1000 + 10 * 86400 }).args.p_recorded_at, new Date(NOW).toISOString());
});

test("invalid payloads", () => {
  assert.ok("error" in parseTelemetry("{", NOW));
  assert.ok("error" in parse([1]));
  assert.ok("error" in parse({ ...raw, dev: "esp32" }));
  assert.ok("error" in parse({ ...raw, dev: "i2aspo-a/b" }));
  assert.ok("error" in parse({ ...raw, c: [1, 2, 3] }));
  assert.ok("error" in parse({ ...raw, c: [1, 2, 3, 4, 5, 6, 7, "8"] }));
  assert.ok("error" in parse({ ...firmware, c: { mq2: 1, mq3: 2, mq4: 3 } }));
  assert.ok("error" in parse({ ...firmware, c: { ...firmware.c, mq135: 40000 } }));
  assert.ok("error" in parse({ ...firmware, c: "mq2=1" }));
});

test("token hash", () => {
  const h = hashToken("rahasia-kalibrasi");
  assert.ok(h.startsWith("scrypt$") && !h.includes("rahasia"));
  assert.ok(verifyToken("rahasia-kalibrasi", h));
  assert.ok(!verifyToken("salah", h));
  assert.ok(!verifyToken("x", "plaintext"));
  assert.ok(safeEqual("abc", "abc") && !safeEqual("abc", "abcd"));
});
