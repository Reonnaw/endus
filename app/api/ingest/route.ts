import { parseTelemetry } from "@/lib/ingest";
import { safeEqual } from "@/lib/secret";
import { rpc } from "@/lib/supabase";

// Target of the EMQX Webhook / rule HTTP action for i2aspo/+/telemetry. See README.
const MAX_BYTES = 64 * 1024;

export async function POST(req: Request) {
  const secret = process.env.INGEST_SECRET;
  if (!secret || !safeEqual(req.headers.get("x-ingest-secret") ?? "", secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES) {
    return Response.json({ error: "body too large" }, { status: 413 });
  }
  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_BYTES) return Response.json({ error: "body too large" }, { status: 413 });

  const parsed = parseTelemetry(text);
  if ("ignored" in parsed) return Response.json({ ok: true, ignored: true });
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });

  try {
    const id = await rpc<number | null>("ingest_telemetry", parsed.args, true);
    return Response.json({ ok: true, device: parsed.dev, reading_id: id, duplicate: id === null });
  } catch (e) {
    console.error("ingest failed:", e instanceof Error ? e.message : e);
    return Response.json({ error: "server error" }, { status: 500 });
  }
}
