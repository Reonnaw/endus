import "server-only";

// Supabase PostgREST over fetch. Dashboard reads use the anon key, so RLS decides what is public.
// Writes (ingest, calibration) and device_secrets use the service role key, which never leaves the server.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function rest(path: string, init: RequestInit = {}, admin = false) {
  const key = admin ? SERVICE : ANON;
  if (!URL || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / Supabase key belum di-set");
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res;
}

export async function select<T>(path: string, admin = false): Promise<T[]> {
  return (await rest(path, {}, admin)).json();
}

export async function insert(table: string, row: object) {
  await rest(table, { method: "POST", body: JSON.stringify(row), headers: { Prefer: "return=minimal" } }, true);
}

export async function update(table: string, filter: string, row: object) {
  await rest(`${table}?${filter}`, { method: "PATCH", body: JSON.stringify(row), headers: { Prefer: "return=minimal" } }, true);
}

export async function rpc<T>(fn: string, args: object, admin = false): Promise<T> {
  return (await rest(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) }, admin)).json();
}

/* ---------- row types (supabase/schema.sql) ---------- */

export type Counts = { mq2: number | null; mq3: number | null; mq4: number | null; mq5: number | null; mq6: number | null; mq7: number | null; mq8: number | null; mq135: number | null };

export type Reading = Counts & {
  id: number;
  device_id: string;
  session_id: string | null;
  recorded_at: string;
  uptime_ms: number;
  uptime_min: number | null;
  preheated: boolean;
  temperature_c: number | null;
  humidity_pct: number | null;
  raw_payload: Record<string, unknown>;
  created_at: string;
  device_code: string;
  session_label: string | null;
};

export type Bucket = Counts & { t: string; temperature_c: number | null; humidity_pct: number | null; preheated: boolean };

export type DeviceStatus = {
  id: string;
  device_code: string;
  name: string | null;
  location: string | null;
  is_active: boolean;
  last_seen_at: string | null;
  online: boolean;
  session_id: string | null;
  session_label: string | null;
  session_note: string | null;
  session_planned_hours: number | null;
  session_started_at: string | null;
};

export type Session = { id: string; device_id: string; label: string; note: string | null; planned_hours: number | null; started_at: string; ended_at: string | null };

export type Calibration = { id: string; device_id: string; baseline_counts: number[]; temperature_c: number | null; humidity_pct: number | null; note: string | null; calibrated_at: string };
