import { DEVICE_CODE } from "@/lib/ingest";
import { getReadings } from "@/lib/queries";
import type { Reading } from "@/lib/supabase";

// CSV of one device's readings: ?dev=…&tgl=YYYY-MM-DD (WIB day) or &sesi=<uuid>, otherwise the last 24 h.
const PAGE = 1000; // Supabase's default max rows per request
const MAX_ROWS = 50_000; // shortcut: hard cap so one export stays fast, raise or stream if a range ever needs more
const COLS = ["recorded_at", "mq2", "mq3", "mq4", "mq5", "mq6", "mq7", "mq8", "mq135", "temperature_c", "humidity_pct", "preheated", "uptime_min", "session_label"] as const;

const wib = (iso: string) => new Date(iso).toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" });
const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const dev = sp.get("dev") ?? "";
  if (!DEVICE_CODE.test(dev)) return Response.json({ error: "dev must look like i2aspo-XXXXXX" }, { status: 400 });
  const tgl = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("tgl") ?? "") ? sp.get("tgl")! : undefined;
  const sesi = /^[0-9a-f-]{36}$/i.test(sp.get("sesi") ?? "") ? sp.get("sesi")! : undefined;

  const now = Date.now();
  const day = tgl ? Date.parse(`${tgl}T00:00:00+07:00`) : NaN;
  // A fixed upper bound keeps offset paging stable while new readings keep arriving.
  const to = new Date(tgl ? day + 86_400_000 : now).toISOString();
  const from = tgl ? new Date(day).toISOString() : sesi ? undefined : new Date(now - 86_400_000).toISOString();

  const rows: Reading[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    const page = await getReadings(dev, { from, to, sessionId: sesi, limit: PAGE, offset });
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  rows.reverse(); // oldest first

  const lines = [["waktu_wib", ...COLS].join(",")];
  for (const r of rows) lines.push([wib(r.recorded_at), ...COLS.map((c) => r[c])].map(cell).join(","));
  const name = `${dev}_${tgl ?? (sesi ? `sesi-${sesi.slice(0, 8)}` : "24jam")}.csv`;
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
