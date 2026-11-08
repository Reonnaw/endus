import { SENSORS } from "./enose";
import { rpc, select, type Bucket, type Calibration, type Counts, type DeviceStatus, type Reading, type Session } from "./supabase";

// Dashboard reads (anon key, RLS select-only). Every call is no-store, so telemetry is never cached.
const q = encodeURIComponent;

export const countsOf = (r: Counts) => SENSORS.map((s) => r[s.key as keyof Counts] ?? -1);

/** Chart ranges; bucket sizes keep every range at ~720 points. */
export const RANGES = {
  "1h": { label: "1 jam", ms: 3_600_000, bucket: 5 },
  "6h": { label: "6 jam", ms: 6 * 3_600_000, bucket: 30 },
  "24h": { label: "24 jam", ms: 24 * 3_600_000, bucket: 120 },
} as const;
export type RangeKey = keyof typeof RANGES;
export const PAGE_SIZE = 20;

export const getDevices = () => select<DeviceStatus>("v_device_status?select=*&order=last_seen_at.desc.nullslast");

export async function getDeviceByCode(deviceCode: string) {
  return (await select<DeviceStatus>(`v_device_status?select=*&device_code=eq.${q(deviceCode)}`))[0] ?? null;
}

export async function getLatestReading(deviceCode: string) {
  return (await select<Reading>(`v_latest_readings?select=*&device_code=eq.${q(deviceCode)}`))[0] ?? null;
}

export function getReadings(deviceCode: string, o: { from?: string; to?: string; sessionId?: string; limit?: number; offset?: number } = {}) {
  let path = `v_reading_series?select=*&device_code=eq.${q(deviceCode)}&order=recorded_at.desc&limit=${o.limit ?? PAGE_SIZE}&offset=${o.offset ?? 0}`;
  if (o.from) path += `&recorded_at=gte.${q(o.from)}`;
  if (o.to) path += `&recorded_at=lt.${q(o.to)}`;
  if (o.sessionId) path += `&session_id=eq.${q(o.sessionId)}`;
  return select<Reading>(path);
}

export const getSessions = (deviceCode: string, limit = 20) =>
  select<Session>(`sessions?select=*,devices!inner(device_code)&devices.device_code=eq.${q(deviceCode)}&order=started_at.desc&limit=${limit}`);

export async function getCalibration(deviceCode: string) {
  const rows = await select<Calibration>(
    `calibrations?select=*,devices!inner(device_code)&devices.device_code=eq.${q(deviceCode)}&order=calibrated_at.desc&limit=1`,
  );
  return rows[0] ?? null;
}

export const getBuckets = (deviceCode: string, range: RangeKey) =>
  rpc<Bucket[]>("reading_buckets", {
    p_device_code: deviceCode,
    p_from: new Date(Date.now() - RANGES[range].ms).toISOString(),
    p_bucket_seconds: RANGES[range].bucket,
  });

/** Everything the dashboard page needs for one device; null until the first reading arrives. */
export async function getDashboardData(
  deviceCode: string | undefined,
  o: { range: RangeKey; page: number; date?: string; sessionId?: string },
) {
  const devices = await getDevices();
  const device = devices.find((d) => d.device_code === deviceCode) ?? devices[0];
  if (!device) return null;
  const code = device.device_code;
  // date filter is a calendar day in WIB (Asia/Jakarta, UTC+7, no DST)
  const day = o.date ? Date.parse(`${o.date}T00:00:00+07:00`) : NaN;
  const [latest, buckets, calibration, sessions, history] = await Promise.all([
    getLatestReading(code),
    getBuckets(code, o.range),
    getCalibration(code),
    getSessions(code),
    getReadings(code, {
      from: Number.isNaN(day) ? undefined : new Date(day).toISOString(),
      to: Number.isNaN(day) ? undefined : new Date(day + 86_400_000).toISOString(),
      sessionId: o.sessionId,
      limit: PAGE_SIZE + 1, // one extra row tells whether a next page exists
      offset: o.page * PAGE_SIZE,
    }),
  ]);
  if (!latest) return null;
  return { devices, device, latest, buckets, calibration, sessions, history };
}
