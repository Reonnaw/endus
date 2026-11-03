"use server";

import { refresh } from "next/cache";
import { baseline } from "@/lib/enose";
import { insert, select, type Reading } from "@/lib/supabase";

// Store the clean-air baseline: put the device in clean air (no food) after the 10-min preheat, then run.
export async function calibrate(_prev: string, form: FormData): Promise<string> {
  const token = process.env.CALIBRATE_TOKEN;
  if (!token || form.get("token") !== token) return "Token kalibrasi salah.";
  const device = String(form.get("device") ?? "");

  const rows = await select<Pick<Reading, "counts">>(
    `readings?select=counts&device=eq.${encodeURIComponent(device)}&preheated=is.true&order=ts.desc&limit=12`,
  );
  if (rows.length < 6) return "Butuh minimal 6 data setelah pemanasan sensor (±30 detik).";
  const rsAir = baseline(rows.map((r) => r.counts));
  if (!rsAir) return "Ada sensor yang tidak terbaca. Cek kabel ADS1115.";

  await insert("calibrations", { device, rs_air: rsAir });
  refresh();
  return "Kalibrasi tersimpan.";
}
