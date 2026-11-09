import { Suspense } from "react";
import { SENSORS, THRESHOLD, type GasRow, type Verdict } from "@/lib/enose";
import { countsOf, getDashboardData, PAGE_SIZE, RANGES, type RangeKey } from "@/lib/queries";
import { computeStatus } from "@/lib/status";
import type { DeviceStatus, Reading, Session } from "@/lib/supabase";
import { AutoRefresh, CalibrateForm, LineChart, SensorArray3D, type Series } from "./client";
import { Icon, Logo, type IconName } from "./icons";

type Tone = "ok" | "warn" | "bad" | "idle";
const VERDICT: Record<Verdict, { title: string; text: string; icon: IconName; tone: Tone; level: number }> = {
  layak: { title: "Layak dikonsumsi", text: "Aman disajikan. Belum ada tanda pembusukan.", icon: "check", tone: "ok", level: 1 },
  waspada: { title: "Waspada", text: "Sajikan segera, jangan disimpan lagi.", icon: "alert", tone: "warn", level: 2 },
  tidak_layak: { title: "Tidak layak", text: "Risiko basi. Jangan disajikan.", icon: "stop", tone: "bad", level: 3 },
  pemanasan: { title: "Sensor pemanasan", text: "Tunggu 10 menit sampai sensor siap.", icon: "hourglass", tone: "idle", level: 0 },
  belum_kalibrasi: { title: "Kalibrasi belum dilakukan", text: "Kalibrasi dulu di udara bersih, tanpa makanan. Tombolnya ada di bagian Alat.", icon: "help", tone: "idle", level: 0 },
  sensor_error: { title: "Sensor tidak terbaca", text: "Ada sensor gas yang tidak mengirim data. Cek kabel ADS1115 dan modul MQ.", icon: "alert", tone: "bad", level: 0 },
};
const TONE = {
  ok: { text: "text-ok", bg: "bg-ok", wash: "bg-ok-wash" },
  warn: { text: "text-warn", bg: "bg-warn-mark", wash: "bg-warn-wash" },
  bad: { text: "text-bad", bg: "bg-bad", wash: "bg-bad-wash" },
  idle: { text: "text-idle", bg: "bg-idle", wash: "bg-idle-wash" },
};
const LEVELS: { v: Verdict; label: string }[] = [
  { v: "layak", label: "Layak" },
  { v: "waspada", label: "Waspada" },
  { v: "tidak_layak", label: "Tidak layak" },
];
const NAV = [
  ["status", "Status"], ["tren", "Tren gas"], ["riwayat", "Riwayat"], ["gas", "Detail gas"], ["alat", "Alat"], ["cara-kerja", "Cara kerja"],
];
const SAMPLE_MS = 5000;
const GAP_MS = 30_000; // no reading for 30 s = device offline

export default function Page({ searchParams }: PageProps<"/">) {
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-well/90 text-ink backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <a href="#status" className="flex items-center gap-2.5 rounded-lg">
            <Logo className="text-moss" />
            <span className="text-xl font-bold tracking-tight text-moss-deep">ENDUS</span>
            <span className="hidden text-sm text-muted lg:inline">Electronic nose untuk nasi &amp; mi</span>
          </a>
          <nav aria-label="Bagian dashboard" className="ml-auto hidden md:block">
            <ul className="flex gap-1 text-sm font-medium">
              {NAV.map(([id, label]) => (
                <li key={id}>
                  <a href={`#${id}`} className="rounded-lg px-3 py-2 text-ink-2 transition-colors hover:bg-moss-soft hover:text-moss-deep">{label}</a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <nav aria-label="Bagian dashboard" className="overflow-x-auto border-t border-line md:hidden">
          <ul className="flex w-max gap-1 px-3 py-1.5 text-sm font-medium">
            {NAV.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="block rounded-lg px-3 py-1.5 whitespace-nowrap text-ink-2 hover:bg-moss-soft hover:text-moss-deep">{label}</a>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl px-3 pt-4 pb-16 sm:px-6 sm:pt-6">
        <Suspense fallback={<Skeleton />}>
          <Dashboard searchParams={searchParams} />
        </Suspense>
        <HowItWorks />
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted sm:flex-row sm:justify-between sm:px-6">
          <p>ENDUS · Universitas Negeri Surabaya · I2ASPO 2026, kategori IoT and Its Applications</p>
          <p>Alat skrining, bukan pengganti uji laboratorium.</p>
        </div>
      </footer>
      <AutoRefresh ms={SAMPLE_MS} />
    </>
  );
}

async function Dashboard({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const raw = await searchParams;
  const sp: Params = Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === "string"));
  const range: RangeKey = sp.range && sp.range in RANGES ? (sp.range as RangeKey) : "1h";
  const page = Math.max(1, Math.floor(Number(sp.hal)) || 1);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.tgl ?? "") ? sp.tgl : undefined;
  const sessionId = /^[0-9a-f-]{36}$/i.test(sp.sesi ?? "") ? sp.sesi : undefined;
  const data = await getDashboardData(sp.dev, { range, page: page - 1, date, sessionId });
  if (!data) return <Empty />;

  const { devices, device, latest, buckets, calibration: cal, sessions, history } = data;
  const baseline = cal?.baseline_counts ?? null;
  const counts = countsOf(latest);
  const now = computeStatus({ counts, preheated: latest.preheated }, baseline);
  const v = VERDICT[now.verdict];
  const times = buckets.map((b) => Date.parse(b.t));
  const past = buckets.map((b) => computeStatus({ counts: countsOf(b), preheated: b.preheated }, baseline));
  const step = RANGES[range].bucket * 1000;
  const segments = toSegments(times, past.map((p) => p.verdict), step);
  const current = segments.findLast((s) => s.verdict !== "gap");
  const ageMs = msSince(device.last_seen_at ?? latest.created_at);
  const online = ageMs < GAP_MS;
  const session = sessions.find((s) => s.id === latest.session_id);
  const href = (patch: Params) => hrefWith(sp, patch);

  // Before calibration there is no response yet, so the chart shows the raw ADS1115 counts instead.
  const trend: Series[] = SENSORS.map((s, k) => ({
    key: s.key,
    label: `${sensorName(s.key)} ${s.formula}`,
    color: `var(--s${k + 1})`,
    values: baseline
      ? past.map((p) => p.rows.find((r) => r.key === s.key)?.response ?? null)
      : buckets.map((b) => { const c = countsOf(b)[k]; return c > 0 ? c : null; }),
  }));
  const metric = (k: "temperature_c" | "humidity_pct"): Series[] => [
    { key: k, label: k === "temperature_c" ? "Suhu" : "Kelembapan", color: "var(--moss)", values: buckets.map((r) => r[k]) },
  ];

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Tray 1: the answer */}
      <div className="tray grid gap-4 lg:grid-cols-[1.65fr_1fr] [&>*]:min-w-0">
        <section id="status" aria-labelledby="status-h" className={`well flex min-h-[min(calc(100svh-9rem),40rem)] flex-col p-6 sm:p-8 lg:row-span-2 lg:min-h-0 ${TONE[v.tone].wash}`}>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="inline-flex items-center gap-2 font-medium text-ink-2">
              <span className={`size-2.5 rounded-full ${online ? "bg-ok" : "bg-bad"}`} aria-hidden />
              {online ? "Online" : "Offline"} · <span className="font-mono">{device.device_code}</span>
            </span>
            <span className="text-muted">Data {ago(ageMs)} · {stamp(latest.recorded_at)}</span>
          </div>
          {devices.length > 1 && (
            <nav aria-label="Pilih alat" className="mt-3">
              <ul className="flex flex-wrap gap-1.5 text-xs">
                {devices.map((d) => (
                  <li key={d.id}>
                    <a href={hrefWith({}, { dev: d.device_code })} aria-current={d.id === device.id ? "page" : undefined}
                      className={`inline-block rounded-lg px-2.5 py-1.5 font-mono ${d.id === device.id ? "bg-moss text-on-moss" : "bg-ink/8 text-ink-2 hover:text-ink"}`}>
                      {d.name ?? d.device_code}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          <div className="mt-8 flex items-start gap-4 sm:mt-10 sm:gap-5">
            <span className={`grid size-14 shrink-0 place-items-center rounded-2xl text-well sm:size-16 ${TONE[v.tone].bg}`}>
              <Icon name={v.icon} width={32} height={32} strokeWidth={2.25} />
            </span>
            <div>
              <h1 id="status-h" className={`text-4xl font-semibold tracking-tight text-balance sm:text-5xl ${TONE[v.tone].text}`}>
                <span className="sr-only">Status makanan: </span>{v.title}
              </h1>
              <p className="mt-3 max-w-[48ch] text-lg text-ink">{v.text}</p>
            </div>
          </div>

          <Ladder level={v.level} />
          <p className="mt-3 text-sm text-ink-2">
            {now.reason} <span className="text-muted">· batas masih sementara</span>
          </p>
          {now.verdict === "pemanasan" && <Meter value={Math.min(1, (latest.uptime_min ?? 0) / 10)} label={`Pemanasan ${latest.uptime_min ?? 0} dari 10 menit`} />}

          <dl className="mt-auto grid grid-cols-2 gap-x-6 gap-y-4 border-t border-ink/10 pt-5 text-sm sm:grid-cols-3">
            <Fact term="Sampel" value={session?.label ?? "Belum diberi label"} />
            <Fact term="Lama disimpan" value={session?.planned_hours != null ? `${fmt(Number(session.planned_hours), 1)} jam` : "–"} />
            <Fact term="Status ini sejak" value={current ? `${hhmm(current.start)} (${dur(current.end - current.start)})` : "–"} />
          </dl>
        </section>

        <Metric id="suhu" icon="thermo" title="Suhu" unit="°C" value={latest.temperature_c} times={times} series={metric("temperature_c")}
          note={latest.temperature_c !== null && latest.temperature_c > 5 && latest.temperature_c < 60 ? "Di zona bahaya 5–60 °C" : "Di luar zona bahaya 5–60 °C"} />
        <Metric id="lembap" icon="drop" title="Kelembapan" unit="%" value={latest.humidity_pct} times={times} series={metric("humidity_pct")} />
      </div>

      {/* Tray 2: how it changed */}
      <div className="tray grid gap-4 lg:grid-cols-[1.65fr_1fr] [&>*]:min-w-0">
        <section id="tren" aria-labelledby="tren-h" className="well p-5 sm:p-6">
          <Heading id="tren-h" icon="wind" title="Tren gas" sub={baseline
            ? "Garis putus-putus = batas status."
            : "Nilai mentah, sebelum kalibrasi."} />
          <nav aria-label="Rentang waktu" className="-mt-2 mb-4">
            <ul className="flex gap-1.5 text-xs font-medium">
              {(Object.keys(RANGES) as RangeKey[]).map((k) => (
                <li key={k}>
                  <a href={`${href({ range: k })}#tren`} aria-current={k === range ? "true" : undefined}
                    className={`inline-block rounded-lg px-2.5 py-1.5 ${k === range ? "bg-moss text-on-moss" : "bg-ink/8 text-ink-2 hover:text-ink"}`}>
                    {RANGES[k].label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          {baseline ? (
            <LineChart label="Tren respons gas" times={times} series={trend} height={260} digits={2} floor={0} ceil={THRESHOLD.tidakLayak + 0.5}
              thresholds={[{ v: THRESHOLD.waspada, label: "Waspada", tone: "warn" }, { v: THRESHOLD.tidakLayak, label: "Tidak layak", tone: "bad" }]} />
          ) : (
            <LineChart label="Tren nilai mentah sensor gas" times={times} series={trend} height={260} digits={0} />
          )}
        </section>

        <section id="riwayat" aria-labelledby="riwayat-h" className="well p-5 sm:p-6">
          <Heading id="riwayat-h" icon="clock" title="Riwayat status" />
          <Timeline segments={segments} />
          <ol className="mt-5 divide-y divide-line text-sm">
            {segments.filter((s) => s.verdict !== "gap").reverse().slice(0, 6).map((s) => {
              const m = VERDICT[s.verdict as Verdict];
              return (
                <li key={s.start} className="flex items-center gap-3 py-2.5">
                  <span className={`grid size-6 place-items-center rounded-md text-well ${TONE[m.tone].bg}`}><Icon name={m.icon} width={14} height={14} strokeWidth={2.5} /></span>
                  <span className="font-medium">{m.title}</span>
                  <span className="ml-auto text-muted">{hhmm(s.start)} · {dur(s.end - s.start)}</span>
                </li>
              );
            })}
          </ol>
        </section>

        <section aria-labelledby="riwayat-data-h" className="well p-5 sm:p-6 lg:col-span-2">
          <More open={!!(sp.tgl || sp.sesi || sp.hal)} title={<h2 id="riwayat-data-h" className="text-base font-semibold text-ink">Semua pembacaan <span className="font-normal text-muted">(WIB, terbaru di atas)</span></h2>}>
            <HistoryTable rows={history.slice(0, PAGE_SIZE)} baseline={baseline} sessions={sessions} sp={sp} page={page}
              hasNext={history.length > PAGE_SIZE} />
          </More>
        </section>
      </div>

      {/* Tray 3: the evidence and the device */}
      <div className="tray grid gap-4 lg:grid-cols-[1.65fr_1fr] [&>*]:min-w-0">
        <section id="gas" aria-labelledby="gas-h" className="well p-5 sm:p-6">
          <Heading id="gas-h" icon="flask" title="Detail gas" sub="Estimasi dari datasheet sensor MQ, bukan hasil lab." />
          <SensorArray3D
            calibrated={!!baseline} warn={THRESHOLD.waspada} bad={THRESHOLD.tidakLayak}
            sensors={SENSORS.map((s, i) => ({
              key: s.key, name: sensorName(s.key), formula: s.formula, verdict: s.verdict,
              value: baseline ? now.rows.find((r) => r.key === s.key)?.response ?? null : counts[i] > 0 ? counts[i] : null,
            }))}
          />
          <GasTable rows={now.rows} />
          <div className="mt-5">
            <More title="Nilai mentah per sensor">
              <SensorCards counts={counts} baseline={baseline} />
            </More>
          </div>
        </section>

        <section id="alat" aria-labelledby="alat-h" className="well p-5 sm:p-6">
          <Heading id="alat-h" icon="chip" title="Kesehatan alat" sub={`Uptime ${dur((latest.uptime_min ?? 0) * 60_000)}`} />
          <DeviceHealth latest={latest} counts={counts} online={online} ageMs={ageMs} />
          {devices.length > 1 && <DeviceList devices={devices} current={device.id} />}
          <div className="mt-6 border-t border-line pt-4">
            <More open={!cal} title={<>Kalibrasi udara bersih <span className="font-normal text-muted">· {cal ? `terakhir ${stamp(cal.calibrated_at)}` : "belum pernah"}</span></>}>
              <p className="mb-3 text-sm text-ink-2">Tanpa makanan, setelah 10 menit pemanasan.</p>
              <CalibrateForm device={device.device_code} />
            </More>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ---------- pieces ---------- */

function Heading({ id, icon, title, sub }: { id: string; icon: IconName; title: string; sub?: string }) {
  return (
    <div className="mb-5">
      <h2 id={id} className="flex items-center gap-2 text-lg font-semibold">
        <Icon name={icon} className="text-moss-deep" />
        {title}
      </h2>
      {sub && <p className="mt-1 max-w-[70ch] text-sm text-muted">{sub}</p>}
    </div>
  );
}

/** Collapsed-by-default extra detail, so each panel leads with one answer. */
function More({ title, open, children }: { title: React.ReactNode; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg py-1 text-sm font-medium text-moss-deep hover:text-ink [&::-webkit-details-marker]:hidden">
        <Icon name="chevron" width={16} height={16} strokeWidth={2.25} className="shrink-0 transition-transform group-open:rotate-90" />
        {title}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function Ladder({ level }: { level: number }) {
  return (
    <div className="mt-8 grid max-w-md grid-cols-3 items-end gap-2" role="img"
      aria-label={level ? `Tingkat ${level} dari 3: ${LEVELS[level - 1].label}` : "Belum ada tingkat status"}>
      {LEVELS.map((l, i) => {
        const on = i + 1 === level;
        const m = VERDICT[l.v];
        return (
          <div key={l.v} className="flex flex-col gap-1.5">
            <div
              className={`rounded-lg transition-colors duration-500 ${on ? TONE[m.tone].bg : "bg-ink/8"}`}
              style={{ height: 14 + i * 14 }}
            />
            <span className={`text-xs ${on ? `font-semibold ${TONE[m.tone].text}` : "text-muted"}`}>{l.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div className="mt-4 max-w-md">
      <p className="mb-1.5 text-sm text-ink-2">{label}</p>
      <div className="h-2 rounded-full bg-ink/8" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full bg-moss transition-[width] duration-500" style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  );
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{term}</dt>
      <dd className="mt-0.5 font-semibold text-ink">{value}</dd>
    </div>
  );
}

function Metric({ id, icon, title, unit, value, times, series, note }: {
  id: string; icon: IconName; title: string; unit: string; value: number | null; times: number[]; series: Series[]; note?: string;
}) {
  return (
    <section aria-labelledby={id} className="well p-5 sm:p-6">
      <h2 id={id} className="flex items-center gap-2 text-sm font-semibold text-ink-2">
        <Icon name={icon} width={18} height={18} className="text-moss-deep" />{title}
      </h2>
      <p className="mt-2 mb-3 text-4xl font-semibold tracking-tight">
        {value === null ? <span className="text-xl text-bad">Sensor tidak terbaca</span> : fmt(value, 1)}
        {value !== null && <span className="ml-1 text-lg font-medium text-muted">{unit}</span>}
      </p>
      <LineChart label={`${title} ${span(times)} terakhir`} times={times} series={series} height={110} guess={300} unit={` ${unit}`} />
      {note && <p className="mt-3 text-xs text-muted">{note}</p>}
    </section>
  );
}

function GasTable({ rows }: { rows: GasRow[] }) {
  const groups = [
    { title: "Menentukan status", rows: rows.filter((r) => r.verdict) },
    { title: "Info saja: gas bakar dan CO₂", rows: rows.filter((r) => !r.verdict) },
  ];
  const max = THRESHOLD.tidakLayak * 1.4;
  return (
    <div className="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
      <table className="w-full min-w-[600px] text-left text-sm">
        <thead className="text-xs text-muted">
          <tr className="border-b border-line">
            <th scope="col" className="py-2 pr-3 font-medium">Gas</th>
            <th scope="col" className="py-2 pr-3 font-medium">Sensor</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">ppm</th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">% vol</th>
            <th scope="col" className="py-2 font-medium">Respons</th>
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.title}>
            <tr><th colSpan={5} scope="colgroup" className="pt-4 pb-1 text-xs font-semibold text-moss-deep">{g.title}</th></tr>
            {g.rows.map((r) => {
              const s = r.response;
              const tone: Tone = !r.verdict || s === null ? "idle" : s >= THRESHOLD.tidakLayak ? "bad" : s >= THRESHOLD.waspada ? "warn" : "ok";
              const pct = (x: number) => `${Math.min(100, Math.max(0, (x / max) * 100))}%`;
              return (
                <tr key={r.key} className="border-b border-line last:border-0">
                  <td className="py-2.5 pr-3"><span className="font-semibold">{r.formula}</span> <span className="text-ink-2">{r.gas}</span></td>
                  <td className="py-2.5 pr-3 font-mono text-xs text-ink-2">{r.key.replace("-co2", "").toUpperCase()}</td>
                  <td className="py-2.5 pr-3 text-right">{r.ppm === null ? "–" : fmt(r.ppm, r.ppm < 10 ? 1 : 0)}</td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-right">{r.ppm === null ? "–" : `${fmt(r.ppm / 10_000, 4)} %`}</td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="relative h-2 w-28 rounded-full bg-ink/8" aria-hidden>
                        <div className={`h-full rounded-full ${TONE[tone].bg}`} style={{ width: s === null ? 0 : `max(4px, ${pct(s)})` }} />
                        {[THRESHOLD.waspada, THRESHOLD.tidakLayak].map((t) => (
                          <span key={t} className="absolute -top-0.5 h-3 w-px bg-ink-2/60" style={{ left: pct(t) }} />
                        ))}
                      </div>
                      <span className="w-10 text-right">{s === null ? "–" : fmt(s, 2)}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function SensorCards({ counts, baseline }: { counts: number[]; baseline: number[] | null }) {
  const card = "rounded-xl bg-ink/5 px-3 py-2.5";
  return (
    <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
      {SENSORS.map((s, i) => {
        const now = counts[i], base = baseline?.[i];
        const delta = now > 0 && base ? ((now - base) / base) * 100 : null;
        return (
          <li key={s.key} className={card}>
            <p className="font-mono text-xs font-medium text-ink-2">{sensorName(s.key)} <span className="font-sans text-muted">{s.formula}</span></p>
            <p className="mt-1 text-xl font-semibold tracking-tight">{now > 0 ? fmt(now, 0) : <span className="text-base text-bad">Tidak terbaca</span>}</p>
            <p className="text-xs text-muted">Baseline {base ? fmt(base, 0) : "–"}</p>
            <p className="text-xs font-medium text-ink-2">Δ {delta === null ? "–" : `${delta > 0 ? "+" : ""}${fmt(delta, 1)} %`}</p>
          </li>
        );
      })}
    </ul>
  );
}

function HistoryTable({ rows, baseline, sessions, sp, page, hasNext }: {
  rows: Reading[]; baseline: number[] | null; sessions: Session[]; sp: Params; page: number; hasNext: boolean;
}) {
  const field = "h-9 rounded-xl border border-line bg-well px-2.5 text-sm text-ink hover:border-muted focus-visible:border-moss";
  const pager = "rounded-lg px-3 py-1.5 font-medium bg-ink/8 text-ink-2 hover:text-ink";
  return (
    <>
      <form method="get" action="#riwayat-data-h" className="mb-4 flex flex-wrap items-end gap-2 text-sm">
        {sp.dev && <input type="hidden" name="dev" value={sp.dev} />}
        {sp.range && <input type="hidden" name="range" value={sp.range} />}
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
          Tanggal
          <input type="date" name="tgl" defaultValue={sp.tgl} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
          Sesi
          <select name="sesi" defaultValue={sp.sesi ?? ""} className={field}>
            <option value="">Semua sesi</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>{s.label} · {stamp(s.started_at)}{s.ended_at ? "" : " (aktif)"}</option>
            ))}
          </select>
        </label>
        <button className="h-9 rounded-xl bg-moss px-4 font-semibold text-on-moss transition-colors hover:bg-moss-deep hover:text-well">Terapkan</button>
        {(sp.tgl || sp.sesi) && <a href={`${hrefWith(sp, { tgl: undefined, sesi: undefined, hal: undefined })}#riwayat-data-h`} className="px-2 py-2 text-ink-2 underline underline-offset-2 hover:text-ink">Reset</a>}
      </form>
      {rows.length === 0 ? (
        <Notice>Tidak ada data untuk filter ini.</Notice>
      ) : (
        <div className="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-line">
                <th scope="col" className="py-2 pr-3 font-medium">Waktu</th>
                <th scope="col" className="py-2 pr-3 font-medium">Sesi</th>
                <th scope="col" className="py-2 pr-3 font-medium">Status</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Suhu</th>
                <th scope="col" className="py-2 text-right font-medium">Kelembapan</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                // shortcut: rows are judged with the current baseline, not the one active at that time; fine until recalibrations are frequent.
                const m = VERDICT[computeStatus({ counts: countsOf(r), preheated: r.preheated }, baseline).verdict];
                return (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="whitespace-nowrap py-2 pr-3">{stamp(r.recorded_at, true)}</td>
                    <td className="py-2 pr-3 text-ink-2">{r.session_label ?? "–"}</td>
                    <td className={`py-2 pr-3 font-medium ${TONE[m.tone].text}`}>{m.title}</td>
                    <td className="py-2 pr-3 text-right">{r.temperature_c === null ? "–" : `${fmt(Number(r.temperature_c), 1)} °C`}</td>
                    <td className="py-2 text-right">{r.humidity_pct === null ? "–" : `${fmt(Number(r.humidity_pct), 0)} %`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <nav aria-label="Halaman riwayat" className="mt-4 flex items-center gap-2 text-sm">
        {page > 1 && <a href={`${hrefWith(sp, { hal: String(page - 1) })}#riwayat-data-h`} className={pager}>‹ Sebelumnya</a>}
        <span className="text-muted">Halaman {page}</span>
        {hasNext && <a href={`${hrefWith(sp, { hal: String(page + 1) })}#riwayat-data-h`} className={pager}>Berikutnya ›</a>}
      </nav>
    </>
  );
}

function DeviceList({ devices, current }: { devices: DeviceStatus[]; current: string }) {
  return (
    <div className="mt-6 border-t border-line pt-5">
      <h3 className="font-semibold">Daftar alat</h3>
      <ul className="mt-2 divide-y divide-line text-sm">
        {devices.map((d) => {
          const online = d.last_seen_at !== null && msSince(d.last_seen_at) < GAP_MS;
          return (
            <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2.5">
              <span className={`size-2.5 rounded-full ${online ? "bg-ok" : "bg-bad"}`} aria-hidden />
              <a href={hrefWith({}, { dev: d.device_code })} aria-current={d.id === current ? "page" : undefined}
                className={`font-mono font-medium underline-offset-2 hover:underline ${d.id === current ? "text-moss-deep" : ""}`}>
                {d.name ?? d.device_code}
              </a>
              <span className="text-xs text-ink-2">{online ? "Online" : "Offline"}</span>
              <span className="ml-auto text-right text-xs text-ink-2">
                {d.session_label ? `Sesi ${d.session_label}` : "Tanpa sesi"} · {d.last_seen_at ? `terlihat ${ago(msSince(d.last_seen_at))}` : "belum pernah"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DeviceHealth({ latest, counts: c, online, ageMs }: { latest: Reading; counts: number[]; online: boolean; ageMs: number }) {
  const adsOk = (from: number) => c.slice(from, from + 4).some((x) => x > 0);
  const items: { label: string; ok: boolean; detail: string; icon: IconName }[] = [
    { label: "Koneksi MQTT", ok: online, detail: online ? "Mengirim tiap 5 detik" : `Terakhir ${ago(ageMs)}`, icon: "wifi" },
    { label: "ADS1115 0x48", ok: adsOk(0), detail: "MQ-2, 3, 4, 5", icon: "chip" },
    { label: "ADS1115 0x49", ok: adsOk(4), detail: "MQ-6, 7, 8, 135", icon: "chip" },
    { label: "DHT11", ok: latest.temperature_c !== null && latest.humidity_pct !== null, detail: "Suhu dan kelembapan", icon: "thermo" },
    { label: "Pemanasan", ok: latest.preheated, detail: latest.preheated ? "Selesai" : `${latest.uptime_min ?? 0} dari 10 menit`, icon: "hourglass" },
  ];
  return (
    <>
      <ul className="divide-y divide-line text-sm">
        {items.map((it) => (
          <li key={it.label} className="flex items-center gap-3 py-2.5">
            <Icon name={it.icon} width={18} height={18} className="text-muted" />
            <span className="font-medium">{it.label}</span>
            <span className="ml-auto text-right text-ink-2">{it.detail}</span>
            <span className={`inline-flex w-20 items-center justify-end gap-1 text-xs font-semibold ${it.ok ? "text-ok" : "text-bad"}`}>
              <Icon name={it.ok ? "check" : "alert"} width={14} height={14} strokeWidth={2.5} />{it.ok ? "Baik" : "Cek"}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 mb-2 text-xs font-semibold text-muted">8 sensor gas</p>
      <ul className="grid grid-cols-4 gap-1.5">
        {SENSORS.map((s, i) => {
          const ok = (c[i] ?? -1) > 0;
          return (
            <li key={s.key} title={ok ? "Terbaca" : "Tidak terbaca"}
              className={`rounded-lg px-2 py-1.5 text-center font-mono text-xs font-medium ${ok ? "bg-ok-wash text-ok" : "bg-bad-wash text-bad"}`}>
              {sensorName(s.key)}
              <span className="sr-only">{ok ? " terbaca" : " tidak terbaca"}</span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Timeline({ segments }: { segments: Segment[] }) {
  if (segments.length === 0) return <Notice>Belum ada riwayat.</Notice>;
  const total = segments.at(-1)!.end - segments[0].start;
  return (
    <div>
      <div className="flex h-9 overflow-hidden rounded-xl" role="img"
        aria-label={`Riwayat status ${dur(total)} terakhir`}>
        {segments.map((s) => {
          const tone = s.verdict === "gap" ? null : TONE[VERDICT[s.verdict].tone];
          return (
            <div key={s.start} style={{ flexGrow: s.end - s.start }}
              title={`${s.verdict === "gap" ? "Tidak ada data" : VERDICT[s.verdict].title} · ${hhmm(s.start)}–${hhmm(s.end)}`}
              className={`min-w-px border-r-2 border-well last:border-r-0 ${tone ? tone.bg : "bg-[repeating-linear-gradient(135deg,var(--line)_0_4px,transparent_4px_8px)]"}`} />
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-muted">
        <span>{hhmm(segments[0].start)}</span>
        <span>sekarang</span>
      </div>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-2">{children}</p>;
}

function HowItWorks() {
  const steps = [
    { t: "Mengendus", d: "8 sensor gas MQ dan DHT11 membaca udara di atas nasi atau mi." },
    { t: "ESP32", d: "Mengirim data lewat MQTT tiap 5 detik." },
    { t: "EMQX", d: "Broker meneruskan pesan ke server ENDUS." },
    { t: "API", d: "Memeriksa kunci dan data, lalu menyimpannya." },
    { t: "Supabase", d: "Menyimpan alat, sesi, pembacaan, dan kalibrasi." },
    { t: "Dashboard", d: "Membandingkan gas dengan udara bersih, lalu jadi status." },
  ];
  return (
    <section id="cara-kerja" aria-labelledby="cara-h" className="mt-16 sm:mt-24">
      <h2 id="cara-h" className="text-3xl font-semibold tracking-tight sm:text-4xl">Cara kerja ENDUS</h2>
      <p className="mt-3 max-w-[60ch] text-lg text-ink-2">
        ENDUS mencium gas dari mikroba saat nasi dan mi mulai rusak. Yang dinilai kondisi makanannya, bukan lama disimpan.
      </p>

      <ol className="mt-10 grid gap-6 lg:grid-cols-6 lg:gap-3">
        {steps.map((s, i) => (
          <li key={s.t} className="relative flex gap-4 lg:flex-col lg:gap-3">
            <div className="flex items-center lg:w-full">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-moss text-sm font-bold text-on-moss">{i + 1}</span>
              {i < steps.length - 1 && <span className="ml-3 hidden h-px flex-1 bg-moss/40 lg:block" aria-hidden />}
            </div>
            <div>
              <h3 className="font-semibold">{s.t}</h3>
              <p className="mt-1 text-sm text-ink-2">{s.d}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-12">
      <More title="Kenapa bukan aturan 2 jam? Dasar status dan rujukan">
      <div className="mt-4 grid gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <h3 className="text-xl font-semibold">Kenapa bukan aturan 2 jam?</h3>
          <div className="mt-3 space-y-3 text-ink-2">
            <p>
              Spora <em>Bacillus cereus</em> tahan dimasak. Kalau nasi atau mi dibiarkan hangat terlalu lama, bakteri berkembang dan
              sebagian galur membentuk toksin cereulide yang tahan panas, jadi dipanaskan ulang pun tidak membuatnya aman.
            </p>
            <p>
              Makanan bisa terlihat dan tercium normal padahal sudah berisiko. Aturan waktu tetap tidak melihat kondisi makanan:
              sering diabaikan di dapur yang sibuk, dan kalau dipatuhi, banyak makanan yang masih aman ikut terbuang.
            </p>
          </div>
        </div>
        <div>
          <h3 className="text-xl font-semibold">Dasar status</h3>
          <p className="mt-3 text-ink-2">Label pelatihan ENDUS mengikuti kriteria mikrobiologi makanan siap saji (HPA, 2009):</p>
          <table className="mt-4 w-full text-left text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-line"><th scope="col" className="py-2 font-medium"><em>B. cereus</em> (CFU/g)</th><th scope="col" className="py-2 font-medium">Status ENDUS</th></tr>
            </thead>
            <tbody>
              {([["< 10³", "layak"], ["10³ – 10⁵", "waspada"], ["> 10⁵", "tidak_layak"]] as const).map(([r, k]) => (
                <tr key={k} className="border-b border-line">
                  <td className="py-2.5 font-medium">{r}</td>
                  <td className="py-2.5">
                    <span className={`inline-flex items-center gap-1.5 font-semibold ${TONE[VERDICT[k].tone].text}`}>
                      <Icon name={VERDICT[k].icon} width={16} height={16} strokeWidth={2.25} />{VERDICT[k].title}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-sm text-ink-2">
            Batas respons gas di dashboard masih sementara. Batas akhirnya diambil dari model yang dilatih dengan hasil hitung koloni di laboratorium.
          </p>
        </div>
      </div>

      <div className="mt-14 border-t border-line pt-6">
        <h3 className="text-sm font-semibold text-ink-2">Rujukan</h3>
        <ul className="mt-3 grid gap-2 text-sm text-ink-2 md:grid-cols-2">
          <li>Tangtisanon &amp; Grodniyomchai (2025). A portable electronic nose for real-time monitoring of food spoilage. <a className="text-moss-deep underline underline-offset-2 hover:text-ink" href="https://sensors.myu-group.co.jp/sm_pdf/SM4250.pdf">Sensors and Materials 37</a>.</li>
          <li>Lab-made electronic nose for fast detection of <em>Listeria monocytogenes</em> and <em>Bacillus cereus</em> (2020). <a className="text-moss-deep underline underline-offset-2 hover:text-ink" href="https://pmc.ncbi.nlm.nih.gov/articles/PMC7158669">Veterinary Sciences</a>.</li>
          <li><a className="text-moss-deep underline underline-offset-2 hover:text-ink" href="https://www.mdpi.com/2304-8158/11/9/1181">Foods 11(9):1181</a> (MDPI, 2022).</li>
          <li>Health Protection Agency (2009). Guidelines for assessing the microbiological safety of ready-to-eat foods.</li>
        </ul>
      </div>
      </More>
      </div>
    </section>
  );
}

function Empty() {
  return (
    <div className="tray">
      <section className="well p-6 sm:p-10">
        <h1 className="text-3xl font-semibold tracking-tight">Menunggu data pertama</h1>
        <p className="mt-2 max-w-[60ch] text-ink-2">Belum ada pembacaan yang masuk. Begitu alat mengirim data, status makanan muncul di sini.</p>
        <ol className="mt-6 space-y-3 text-sm">
          <li className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-moss text-xs font-bold text-on-moss">1</span>Nyalakan ESP32 dan pastikan terhubung ke WiFi dan broker EMQX.</li>
          <li className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-moss text-xs font-bold text-on-moss">2</span>Di EMQX, teruskan topik <code className="rounded bg-ink/8 px-1 font-mono">i2aspo/+/telemetry</code> ke <code className="rounded bg-ink/8 px-1 font-mono">/api/ingest</code>.</li>
          <li className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-moss text-xs font-bold text-on-moss">3</span>Tunggu 10 menit pemanasan, lalu kalibrasi di udara bersih.</li>
        </ol>
      </section>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="tray grid animate-pulse gap-4 lg:grid-cols-[1.65fr_1fr]" aria-busy="true" aria-label="Memuat data sensor">
      <div className="well h-[28rem] lg:row-span-2" />
      <div className="well h-52" />
      <div className="well h-52" />
    </div>
  );
}

/* ---------- helpers ---------- */

type Segment = { verdict: Verdict | "gap"; start: number; end: number };

function toSegments(times: number[], verdicts: Verdict[], step: number): Segment[] {
  const gap = step + GAP_MS; // a missing bucket plus the offline allowance
  const out: Segment[] = [];
  const push = (verdict: Segment["verdict"], start: number, end: number) => {
    const last = out.at(-1);
    if (last && last.verdict === verdict) last.end = end;
    else out.push({ verdict, start, end });
  };
  times.forEach((t, i) => {
    const next = times[i + 1];
    const end = next !== undefined && next - t <= gap ? next : t + step;
    push(verdicts[i], t, end);
    if (next !== undefined && next - t > gap) push("gap", end, next);
  });
  return out;
}

// Server component renders once per request, so reading the clock here is fine.
const msSince = (ts: string) => Date.now() - new Date(ts).getTime();
const fmt = (n: number, d: number) => (Math.abs(n) < 0.5 * 10 ** -d ? 0 : n).toLocaleString("id-ID", { maximumFractionDigits: d, minimumFractionDigits: d });
// shortcut: server renders in WIB; kitchens in WITA/WIT see WIB times on server-rendered labels (charts use the browser's zone).
const TZ = "Asia/Jakarta";
const stamp = (iso: string, seconds = false) =>
  new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", ...(seconds && { second: "2-digit" }), timeZone: TZ });
const sensorName = (key: string) => key.toUpperCase().replace("MQ", "MQ-");
type Params = Record<string, string | undefined>;
/** Current query string with some keys replaced or removed (undefined). */
function hrefWith(sp: Params, patch: Params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "?";
}
const hhmm = (t: number) => new Date(t).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
function dur(ms: number) {
  const m = Math.round(ms / 60_000);
  if (m < 1) return "< 1 mnt";
  return m < 60 ? `${m} mnt` : `${Math.floor(m / 60)} j ${m % 60} mnt`;
}
function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s} dtk lalu` : `${dur(ms)} lalu`;
}
const span = (times: number[]) => (times.length > 1 ? dur(times.at(-1)! - times[0]) : "–");
