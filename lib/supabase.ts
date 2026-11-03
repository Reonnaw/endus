// Supabase PostgREST over fetch. Server-side only: the env vars are not NEXT_PUBLIC_, and RLS is on with no policies.
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY;

async function rest(path: string, init: RequestInit = {}) {
  if (!URL || !KEY) throw new Error("SUPABASE_URL / SUPABASE_SECRET_KEY belum di-set");
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: KEY, "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res;
}

export async function select<T>(path: string): Promise<T[]> {
  return (await rest(path)).json();
}

export async function insert(table: string, row: object) {
  await rest(table, { method: "POST", body: JSON.stringify(row), headers: { Prefer: "return=minimal" } });
}

export type Reading = {
  id: number;
  device: string;
  ts: string;
  uptime_min: number;
  preheated: boolean;
  label: string;
  hours: number | null;
  note: string;
  counts: number[];
  temp_c: number | null;
  humidity: number | null;
};
