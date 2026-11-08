// Turns an EMQX request body into ingest_telemetry() arguments. Accepts the raw telemetry JSON
// (rule HTTP action with body ${payload}) or the Webhook envelope ({ event, topic, payload: "<json string>" }).

export const DEVICE_CODE = /^i2aspo-[A-Za-z0-9_-]{1,32}$/;
const TOPIC = /^i2aspo\/[^/]+\/telemetry$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const inRange = (v: unknown, lo: number, hi: number) => {
  const n = num(v);
  return n !== null && n >= lo && n <= hi ? n : null;
};
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export type Parsed =
  | { ignored: true }
  | { error: string }
  | { dev: string; args: Record<string, unknown> };

export function parseTelemetry(text: string, now = Date.now()): Parsed {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { error: "invalid json" };
  }
  if (!isObj(body)) return { error: "body must be a JSON object" };

  let p: unknown = body;
  if ("event" in body || ("payload" in body && !("dev" in body))) {
    // Anything else EMQX forwards (connect events, other topics) is acknowledged so it is not retried.
    if (body.event !== undefined && body.event !== "message.publish") return { ignored: true };
    if (typeof body.topic === "string" && !TOPIC.test(body.topic)) return { ignored: true };
    p = body.payload;
    if (typeof p === "string") {
      try {
        p = JSON.parse(p);
      } catch {
        return { error: "payload is not JSON" };
      }
    }
  }
  if (!isObj(p)) return { error: "payload must be a JSON object" };

  const dev = typeof p.dev === "string" ? p.dev : "";
  if (!DEVICE_CODE.test(dev)) return { error: "dev must look like i2aspo-XXXXXX" };
  const c = p.c;
  if (!Array.isArray(c) || c.length !== 8 || !c.every((x) => Number.isInteger(x) && x >= -32768 && x <= 32767)) {
    return { error: "c must be 8 integer counts" };
  }

  // Buffered rows are replayed after reconnect, so trust the device clock once NTP has synced.
  const ep = num(p.ep);
  const recordedAt = ep !== null && ep > 1_600_000_000 && ep * 1000 < now + 86_400_000 ? ep * 1000 : now;
  const ms = num(p.ms);
  const hrs = num(p.hrs);

  return {
    dev,
    args: {
      p_device_code: dev,
      p_recorded_at: new Date(recordedAt).toISOString(),
      p_uptime_ms: ms !== null && ms >= 0 ? Math.round(ms) : 0,
      p_uptime_min: Number.isInteger(p.up) ? p.up : null,
      p_preheated: p.pre === 1 || p.pre === true,
      p_label: str(p.lbl, 32).toLowerCase() || "unknown",
      p_planned_hours: hrs !== null && hrs > 0 && hrs < 10_000 ? hrs : null,
      p_note: str(p.note, 200),
      p_counts: c,
      // A DHT11 glitch should not throw away the gas reading, so out-of-range values become null.
      p_temperature_c: inRange(p.t, -40, 125),
      p_humidity_pct: inRange(p.h, 0, 100),
      p_raw: p,
    },
  };
}
