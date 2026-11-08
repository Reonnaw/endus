// Sensor math for the ENDUS firmware (main.ino): 8 MQ sensors on 2x ADS1115 (GAIN_TWOTHIRDS) + DHT11.

const VOLT_PER_COUNT = 6.144 / 32768; // ADS1115 at GAIN_TWOTHIRDS = 0.1875 mV/LSB
const VC = 5.0; // MQ module supply voltage (V)

export type Sensor = {
  key: string;
  gas: string;
  formula: string;
  cleanAir: number; // Rs/R0 in clean air, from the datasheet
  a: number; // ppm = a * (Rs/R0)^b, datasheet curve fit
  b: number;
  offset?: number; // added ppm (ambient CO2 background)
  scale?: number; // unit conversion to ppm
  verdict: boolean; // used for the layak/tidak layak decision
};

// Order matches CHANNELS[] in main.ino. Curves from the Winsen/Hanwei datasheets (MQUnifiedsensor fits).
// MQ-2, MQ-7 and MQ-135 respond most to spoiled rice (Tangtisanon 2025, Sensors and Materials 37:5373);
// MQ-3 (ethanol from fermentation) and MQ-8 (H2) follow microbial growth. MQ-4/5/6 are mainly fuel gases
// (kitchen LPG), so they are shown but kept out of the verdict to avoid false alarms.
export const SENSORS: Sensor[] = [
  { key: "mq2", gas: "VOC mudah terbakar (setara propana)", formula: "C₃H₈-eq", cleanAir: 9.83, a: 658.71, b: -2.168, verdict: true },
  { key: "mq3", gas: "Etanol (fermentasi)", formula: "C₂H₅OH", cleanAir: 60, a: 0.3934, b: -1.504, scale: 531, verdict: true }, // curve in mg/L; 1 mg/L ≈ 531 ppm at 25 °C
  { key: "mq4", gas: "Metana", formula: "CH₄", cleanAir: 4.4, a: 1012.7, b: -2.786, verdict: false },
  { key: "mq5", gas: "LPG", formula: "LPG", cleanAir: 6.5, a: 80.897, b: -2.431, verdict: false },
  { key: "mq6", gas: "Butana / LPG", formula: "C₄H₁₀", cleanAir: 10, a: 1009.2, b: -2.35, verdict: false },
  { key: "mq7", gas: "Karbon monoksida", formula: "CO", cleanAir: 27.5, a: 99.042, b: -1.518, verdict: true },
  { key: "mq8", gas: "Hidrogen", formula: "H₂", cleanAir: 70, a: 976.97, b: -0.688, verdict: true },
  { key: "mq135", gas: "Amonia / amina", formula: "NH₃", cleanAir: 3.6, a: 102.2, b: -2.473, verdict: true },
  // CO2 also comes from MQ-135 (same channel, different curve), added below as a virtual row.
];
const MQ135_CO2 = { gas: "Karbon dioksida (respirasi mikroba)", formula: "CO₂", a: 110.47, b: -2.862, offset: 400 };

// PLACEHOLDER, not a scientific cut-off. shortcut: provisional thresholds on the response S = Rs_air/Rs − 1 (paper Eq. 1); replace with the
// cut-offs of the trained model once lab-labelled data (B. cereus counts) is available.
export const THRESHOLD = { waspada: 0.5, tidakLayak: 1.5 };

/** Sensor resistance relative to the load resistor (Rs/RL). RL cancels out in every ratio we use. */
export function rsOverRl(count: number): number | null {
  if (count <= 0) return null; // -1 = ADS1115 not found
  const v = count * VOLT_PER_COUNT;
  if (v >= VC) return null;
  return (VC - v) / v;
}

export type GasRow = { key: string; gas: string; formula: string; ppm: number | null; response: number | null; verdict: boolean };
export type Verdict = "layak" | "waspada" | "tidak_layak" | "pemanasan" | "belum_kalibrasi" | "sensor_error";

/** rsAir: Rs/RL per channel measured in clean air (from the calibrations table). */
export function analyse(counts: number[], rsAir: number[] | null, preheated: boolean) {
  const rows: GasRow[] = [];
  SENSORS.forEach((s, i) => {
    const rs = rsOverRl(counts[i] ?? -1);
    const air = rsAir?.[i];
    const ok = rs !== null && air != null && air > 0;
    const ratio = ok ? rs / (air / s.cleanAir) : null; // Rs/R0
    const ppm = (c: { a: number; b: number; offset?: number; scale?: number }) =>
      ratio === null ? null : c.a * ratio ** c.b * (c.scale ?? 1) + (c.offset ?? 0);
    const response = ok ? air / rs - 1 : null;
    rows.push({ key: s.key, gas: s.gas, formula: s.formula, ppm: ppm(s), response, verdict: s.verdict });
    if (s.key === "mq135") rows.push({ key: "mq135-co2", ...MQ135_CO2, ppm: ppm(MQ135_CO2), response, verdict: false });
  });

  const scored = rows.filter((r) => r.verdict);
  const score = Math.max(...scored.map((r) => r.response ?? -Infinity));
  let verdict: Verdict;
  if (!rsAir) verdict = "belum_kalibrasi";
  else if (scored.some((r) => r.response === null)) verdict = "sensor_error";
  else if (!preheated) verdict = "pemanasan";
  else verdict = score >= THRESHOLD.tidakLayak ? "tidak_layak" : score >= THRESHOLD.waspada ? "waspada" : "layak";
  return { rows, score: Number.isFinite(score) ? score : null, verdict };
}
