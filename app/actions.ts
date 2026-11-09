"use server";

import { refresh } from "next/cache";
import { DEVICE_CODE } from "@/lib/ingest";
import { verifyToken } from "@/lib/secret";
import { insert, select, update, type Counts } from "@/lib/supabase";
import { countsOf } from "@/lib/queries";

const WINDOW_MS = 60_000;
const MIN_READINGS = 6;

// Clean-air baseline: device in clean air (no food), after the 10-min preheat. Averages the last minute.
export async function calibrate(_prev: string, form: FormData): Promise<string> {
  const device = String(form.get("device") ?? "");
  const token = String(form.get("token") ?? "");
  if (!DEVICE_CODE.test(device) || !token) return "Isi kode alat dan token kalibrasi.";

  const [dev] = await select<{ id: string; device_secrets: { calibration_token_hash: string } | null }>(
    `devices?select=id,device_secrets(calibration_token_hash)&device_code=eq.${encodeURIComponent(device)}`,
    true,
  );
  // Same message for unknown device, missing secret and wrong token, so the form does not reveal which.
  if (!dev?.device_secrets || !verifyToken(token, dev.device_secrets.calibration_token_hash)) return "Kode alat atau token salah.";

  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const rows = await select<Counts & { temperature_c: number | null; humidity_pct: number | null }>(
    `readings?select=mq2,mq3,mq4,mq5,mq6,mq7,mq8,mq135,temperature_c,humidity_pct&device_id=eq.${dev.id}&preheated=is.true&recorded_at=gte.${encodeURIComponent(since)}`,
    true,
  );
  if (rows.length < MIN_READINGS) {
    return `Butuh minimal ${MIN_READINGS} data setelah pemanasan dalam 1 menit terakhir (ada ${rows.length}). Pastikan alat online dan sudah 10 menit menyala.`;
  }
  const counts = rows.map(countsOf);
  if (counts.some((c) => c.some((x) => x <= 0))) return "Ada sensor yang tidak terbaca. Cek kabel ADS1115 dan modul MQ.";

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const avgOf = (k: "temperature_c" | "humidity_pct") => {
    const v = rows.map((r) => r[k]).filter((x): x is number => x !== null);
    return v.length ? Math.round(mean(v.map(Number)) * 100) / 100 : null;
  };
  await insert("calibrations", {
    device_id: dev.id,
    baseline_counts: counts[0].map((_, i) => Math.round(mean(counts.map((c) => c[i])))),
    temperature_c: avgOf("temperature_c"),
    humidity_pct: avgOf("humidity_pct"),
    note: `rata-rata ${rows.length} data`,
  });
  refresh();
  return "Kalibrasi tersimpan.";
}

const SAMPLES = ["nasi", "mi", "unknown"] as const;

// What is under the sensor. Stored on the device row; ingest_telemetry puts it on every following reading
// and opens or closes the session, so neither EMQX nor the firmware is involved.
export async function setSample(_prev: string, form: FormData): Promise<string> {
  const device = String(form.get("device") ?? "");
  const label = String(form.get("label") ?? "");
  if (!DEVICE_CODE.test(device) || !(SAMPLES as readonly string[]).includes(label)) return "Pilihan tidak valid.";
  await update("devices", `device_code=eq.${encodeURIComponent(device)}`, { sample_label: label });
  return "Tersimpan. Berlaku mulai data berikutnya (±5 detik).";
}
