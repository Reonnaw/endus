import { timingSafeEqual } from "node:crypto";
import { insert } from "@/lib/supabase";

// EMQX HTTP action target. Body = the telemetry JSON published by main.ino on i2aspo/<dev>/telemetry.
function authorized(req: Request) {
  const token = process.env.INGEST_TOKEN;
  const got = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  return !!token && got.length === token.length && timingSafeEqual(Buffer.from(got), Buffer.from(token));
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });

  let p: Record<string, unknown>;
  try {
    p = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const dev = str(p.dev, 32);
  const c = p.c;
  if (!/^[\w-]+$/.test(dev) || !Array.isArray(c) || c.length !== 8 || !c.every(Number.isInteger)) {
    return Response.json({ error: "payload must have dev and c[8]" }, { status: 422 });
  }

  // Buffered rows are replayed after reconnect, so prefer the device clock once NTP has synced.
  const ep = num(p.ep);
  const ts = ep && ep > 1_600_000_000 ? new Date(ep * 1000) : new Date();

  await insert("readings", {
    device: dev,
    ts: ts.toISOString(),
    esp_ms: num(p.ms),
    uptime_min: num(p.up),
    preheated: p.pre === 1,
    label: str(p.lbl, 16),
    hours: num(p.hrs),
    note: str(p.note, 40),
    counts: c,
    temp_c: num(p.t),
    humidity: num(p.h),
  });
  return Response.json({ ok: true });
}
