import { analyse, rsOverRl, SENSORS } from "./enose.ts";

// Food status from one reading and the device's clean-air baseline (calibrations.baseline_counts).
// The cut-offs live in enose.ts THRESHOLD and are PLACEHOLDER values, not final scientific thresholds.

const name = (key: string) => key.toUpperCase().replace("MQ", "MQ-");
const fmt = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

export function computeStatus(reading: { counts: number[]; preheated: boolean }, baseline: number[] | null) {
  const rsAir = baseline ? baseline.map((c) => rsOverRl(c) ?? 0) : null; // 0 = unusable baseline channel
  const a = analyse(reading.counts, rsAir, reading.preheated);
  const scored = a.rows.filter((r) => r.verdict);

  let reason: string;
  if (a.verdict === "belum_kalibrasi") reason = "Kalibrasi belum dilakukan.";
  else if (a.verdict === "sensor_error") reason = `${scored.filter((r) => r.response === null).map((r) => name(r.key)).join(", ")} tidak terbaca.`;
  else if (a.verdict === "pemanasan") reason = "Sensor masih pemanasan.";
  else {
    const worst = scored.reduce((m, r) => ((r.response ?? -Infinity) > (m.response ?? -Infinity) ? r : m));
    const gas = SENSORS.find((s) => s.key === worst.key)!.gas;
    reason = `Paling menyimpang: ${name(worst.key)} (${gas.toLowerCase()}), respons ${fmt(worst.response!)}.`;
  }
  return { ...a, reason };
}
