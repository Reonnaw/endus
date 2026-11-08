// Run: pnpm test   (Node 22.18+ strips TypeScript types natively)
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyse, rsOverRl } from "./enose.ts";
import { computeStatus } from "./status.ts";

const at = (volts) => Math.round(volts / (6.144 / 32768));
const air = Array(8).fill(at(1)); // 1 V on every channel in clean air
const rsAir = air.map(rsOverRl);

test("rsOverRl", () => {
  assert.equal(rsOverRl(-1), null);
  assert.ok(Math.abs(rsOverRl(at(2.5)) - 1) < 1e-3); // Rs = RL at Vc/2
});

test("clean air is layak and NH3 sits at the datasheet clean-air point", () => {
  const r = analyse(air, rsAir, true);
  assert.equal(r.verdict, "layak");
  assert.ok(Math.abs(r.score) < 1e-9);
  const nh3 = r.rows.find((x) => x.key === "mq135").ppm;
  assert.ok(Math.abs(nh3 - 102.2 * 3.6 ** -2.473) < 1e-6);
  assert.equal(r.rows.length, 9); // 8 sensors + CO2 from MQ-135
});

test("verdict levels", () => {
  const spoiled = [...air];
  spoiled[1] = at(2); // MQ-3 Rs: 4 -> 1.5, S = 1.67
  assert.equal(analyse(spoiled, rsAir, true).verdict, "tidak_layak");
  const lpg = [...air];
  lpg[3] = at(3); // MQ-5 is info-only
  assert.equal(analyse(lpg, rsAir, true).verdict, "layak");
  assert.equal(analyse(air, null, true).verdict, "belum_kalibrasi");
  assert.equal(analyse(air, rsAir, false).verdict, "pemanasan");
  const broken = [...air];
  broken[0] = -1;
  assert.equal(analyse(broken, rsAir, true).verdict, "sensor_error");
});

test("computeStatus uses baseline counts and names the worst sensor", () => {
  assert.equal(computeStatus({ counts: air, preheated: true }, null).reason, "Kalibrasi belum dilakukan.");
  const spoiled = [...air];
  spoiled[1] = at(2);
  const s = computeStatus({ counts: spoiled, preheated: true }, air);
  assert.equal(s.verdict, "tidak_layak");
  assert.match(s.reason, /^Paling menyimpang: MQ-3 \(etanol/);
  const broken = [...air];
  broken[7] = -1;
  assert.equal(computeStatus({ counts: broken, preheated: true }, air).reason, "MQ-135 tidak terbaca.");
});
