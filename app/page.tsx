import { Suspense } from "react";
import { analyse, SENSORS, THRESHOLD, type GasRow, type Verdict } from "@/lib/enose";
import { select, type Reading } from "@/lib/supabase";
import { AutoRefresh, CalibrateForm, LineChart, type Series } from "./client";
import { Icon, Logo, type IconName } from "./icons";

type Tone = "ok" | "warn" | "bad" | "idle";
const VERDICT: Record<Verdict, { title: string; text: string; icon: IconName; tone: Tone; level: number }> = {
  layak: { title: "Layak dikonsumsi", text: "Pola gas masih mendekati udara bersih. Belum ada tanda aktivitas mikroba.", icon: "check", tone: "ok", level: 1 },
  waspada: { title: "Waspada", text: "Gas penanda pembusukan mulai naik. Sajikan segera, jangan disimpan lebih lama.", icon: "alert", tone: "warn", level: 2 },
  tidak_layak: { title: "Tidak layak", text: "Pola gas menunjukkan risiko pembusukan. Jangan disajikan.", icon: "stop", tone: "bad", level: 3 },
  pemanasan: { title: "Sensor pemanasan", text: "Sensor MQ butuh 10 menit pemanasan sebelum hasilnya bisa dipakai.", icon: "hourglass", tone: "idle", level: 0 },
  belum_kalibrasi: { title: "Belum dikalibrasi", text: "Taruh alat di udara bersih tanpa makanan, tunggu pemanasan selesai, lalu kalibrasi di bagian Kesehatan alat.", icon: "help", tone: "idle", level: 0 },
  sensor_error: { title: "Sensor tidak terbaca", text: "Satu atau lebih sensor gas tidak mengirim data. Cek kabel ADS1115 dan modul MQ.", icon: "alert", tone: "bad", level: 0 },
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
      <header className="sticky top-0 z-20 bg-moss text-on-moss shadow-[0_6px_18px_-12px_rgb(0_0_0/0.6)]">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <a href="#status" className="flex items-center gap-2.5 rounded-lg">
            <Logo />
            <span className="text-xl font-bold tracking-tight">ENDUS</span>
            <span className="hidden text-sm text-on-moss-2 lg:inline">Electronic nose untuk nasi &amp; mi</span>
          </a>
          <nav aria-label="Bagian dashboard" className="ml-auto hidden md:block">
            <ul className="flex gap-1 text-sm font-medium">
              {NAV.map(([id, label]) => (
                <li key={id}>
                  <a href={`#${id}`} className="rounded-lg px-3 py-2 text-on-moss-2 transition-colors hover:bg-white/10 hover:text-on-moss">{label}</a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <nav aria-label="Bagian dashboard" className="overflow-x-auto border-t border-white/10 md:hidden">
          <ul className="flex w-max gap-1 px-3 py-1.5 text-sm font-medium">
            {NAV.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="block rounded-lg px-3 py-1.5 whitespace-nowrap text-on-moss-2 hover:bg-white/10 hover:text-on-moss">{label}</a>
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
  const { dev } = await searchParams;
  const filter = typeof dev === "string" ? `&device=eq.${encodeURIComponent(dev)}` : "";
  const [latest] = await select<Reading>(`readings?select=*${filter}&order=ts.desc&limit=1`);
  if (!latest) return <Empty />;

  const device = encodeURIComponent(latest.device);
  const [history, [cal]] = await Promise.all([
    select<Pick<Reading, "ts" | "counts" | "temp_c" | "humidity" | "preheated">>(
      `readings?select=ts,counts,temp_c,humidity,preheated&device=eq.${device}&order=ts.desc&limit=720`,
    ),
    select<{ rs_air: number[]; created_at: string }>(`calibrations?select=rs_air,created_at&device=eq.${device}&order=created_at.desc&limit=1`),
  ]);
  history.reverse();
  const rsAir = cal?.rs_air ?? null;

  const now = analyse(latest.counts, rsAir, latest.preheated);
  const v = VERDICT[now.verdict];
  const times = history.map((r) => Date.parse(r.ts));
  const past = history.map((r) => analyse(r.counts, rsAir, r.preheated));
  const segments = toSegments(times, past.map((p) => p.verdict));
  const current = segments.findLast((s) => s.verdict !== "gap");
  const ageMs = msSince(latest.ts);
  const online = ageMs < GAP_MS;

  const trend: Series[] = SENSORS.filter((s) => s.verdict).map((s, k) => ({
    key: s.key,
    label: `${s.key.toUpperCase().replace("MQ", "MQ-")} ${s.formula}`,
    color: `var(--s${k + 1})`,
    values: past.map((p) => p.rows.find((r) => r.key === s.key)?.response ?? null),
  }));
  const metric = (k: "temp_c" | "humidity"): Series[] => [{ key: k, label: k === "temp_c" ? "Suhu" : "Kelembapan", color: "var(--moss)", values: history.map((r) => r[k]) }];

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Tray 1: the answer */}
      <div className="tray grid gap-2.5 lg:grid-cols-[1.65fr_1fr] [&>*]:min-w-0">
        <section id="status" aria-labelledby="status-h" className={`well flex min-h-[min(calc(100svh-9rem),40rem)] flex-col p-6 sm:p-8 lg:row-span-2 lg:min-h-0 ${TONE[v.tone].wash}`}>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="inline-flex items-center gap-2 font-medium text-ink-2">
              <span className={`size-2.5 rounded-full ${online ? "bg-ok" : "bg-bad"}`} aria-hidden />
              {online ? "Online" : "Offline"} · <span className="font-mono">{latest.device}</span>
            </span>
            <span className="text-muted">Data {ago(ageMs)}</span>
          </div>

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
            {now.score === null ? "Respons gas belum bisa dihitung." : <>Respons gas tertinggi <strong className="font-semibold text-ink">{fmt(now.score, 2)}</strong></>}
            {" "}· batas waspada {fmt(THRESHOLD.waspada, 1)}, tidak layak {fmt(THRESHOLD.tidakLayak, 1)} (sementara)
          </p>
          {now.verdict === "pemanasan" && <Meter value={Math.min(1, latest.uptime_min / 10)} label={`Pemanasan ${latest.uptime_min} dari 10 menit`} />}

          <dl className="mt-auto grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-5 text-sm sm:grid-cols-3">
            <Fact term="Sampel" value={latest.label && latest.label !== "unknown" ? latest.label : "Belum diberi label"} />
            <Fact term="Lama disimpan" value={latest.hours !== null && latest.hours >= 0 ? `${fmt(latest.hours, 1)} jam` : "–"} />
            <Fact term="Status ini sejak" value={current ? `${hhmm(current.start)} (${dur(current.end - current.start)})` : "–"} />
          </dl>
        </section>

        <Metric id="suhu" icon="thermo" title="Suhu" unit="°C" value={latest.temp_c} times={times} series={metric("temp_c")}
          note={latest.temp_c !== null && latest.temp_c > 5 && latest.temp_c < 60 ? "Zona bahaya 5–60 °C: bakteri bisa berkembang." : "Di luar zona bahaya 5–60 °C."} />
        <Metric id="lembap" icon="drop" title="Kelembapan" unit="%" value={latest.humidity} times={times} series={metric("humidity")}
          note="Kelembapan tinggi mempercepat pertumbuhan mikroba dan memengaruhi sensor MQ." />
      </div>

      {/* Tray 2: how it changed */}
      <div className="tray grid gap-2.5 lg:grid-cols-[1.65fr_1fr] [&>*]:min-w-0">
        <section id="tren" aria-labelledby="tren-h" className="well p-5 sm:p-6">
          <Heading id="tren-h" icon="wind" title="Tren respons gas" sub={`Respons tiap sensor terhadap udara bersih, ${span(times)} terakhir. Garis putus-putus adalah batas status.`} />
          {rsAir ? (
            <LineChart label="Tren respons gas" times={times} series={trend} height={260} digits={2} floor={0} ceil={THRESHOLD.tidakLayak + 0.5}
              thresholds={[{ v: THRESHOLD.waspada, label: "Waspada", tone: "warn" }, { v: THRESHOLD.tidakLayak, label: "Tidak layak", tone: "bad" }]} />
          ) : (
            <Notice>Grafik respons muncul setelah alat dikalibrasi di udara bersih.</Notice>
          )}
        </section>

        <section id="riwayat" aria-labelledby="riwayat-h" className="well p-5 sm:p-6">
          <Heading id="riwayat-h" icon="clock" title="Riwayat status" sub="Lebar tiap blok sama dengan lamanya status itu bertahan." />
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
      </div>

      {/* Tray 3: the evidence and the device */}
      <div className="tray grid gap-2.5 lg:grid-cols-[1.65fr_1fr] [&>*]:min-w-0">
        <section id="gas" aria-labelledby="gas-h" className="well p-5 sm:p-6">
          <Heading id="gas-h" icon="flask" title="Detail gas terdeteksi" sub="Perkiraan dari kurva datasheet tiap sensor MQ. Sensor MQ peka silang, jadi ini estimasi, bukan hasil lab." />
          <GasTable rows={now.rows} />
        </section>

        <section id="alat" aria-labelledby="alat-h" className="well p-5 sm:p-6">
          <Heading id="alat-h" icon="chip" title="Kesehatan alat" sub={`Uptime ${dur(latest.uptime_min * 60_000)}`} />
          <DeviceHealth latest={latest} online={online} ageMs={ageMs} />
          <div className="mt-6 border-t border-line pt-5">
            <h3 className="font-semibold">Kalibrasi udara bersih</h3>
            <p className="mt-1 mb-4 text-sm text-ink-2">
              {cal ? `Terakhir ${new Date(cal.created_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: TZ })}.` : "Belum pernah dikalibrasi."}{" "}
              Lakukan tanpa makanan, setelah 10 menit pemanasan.
            </p>
            <CalibrateForm device={latest.device} />
          </div>
        </section>
      </div>
    </div>
  );
}

/* ---------- pieces ---------- */

function Heading({ id, icon, title, sub }: { id: string; icon: IconName; title: string; sub: string }) {
  return (
    <div className="mb-5">
      <h2 id={id} className="flex items-center gap-2 text-lg font-semibold">
        <Icon name={icon} className="text-moss-deep" />
        {title}
      </h2>
      <p className="mt-1 max-w-[70ch] text-sm text-ink-2">{sub}</p>
    </div>
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
              className={`rounded-lg transition-colors duration-500 ${on ? TONE[m.tone].bg : "bg-ink/8 shadow-[inset_0_1px_2px_var(--well-shade)]"}`}
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
  id: string; icon: IconName; title: string; unit: string; value: number | null; times: number[]; series: Series[]; note: string;
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
      <p className="mt-3 text-xs text-ink-2">{note}</p>
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

function DeviceHealth({ latest, online, ageMs }: { latest: Reading; online: boolean; ageMs: number }) {
  const c = latest.counts;
  const adsOk = (from: number) => c.slice(from, from + 4).some((x) => x > 0);
  const items: { label: string; ok: boolean; detail: string; icon: IconName }[] = [
    { label: "Koneksi MQTT", ok: online, detail: online ? "Mengirim tiap 5 detik" : `Terakhir ${ago(ageMs)}`, icon: "wifi" },
    { label: "ADS1115 0x48", ok: adsOk(0), detail: "MQ-2, 3, 4, 5", icon: "chip" },
    { label: "ADS1115 0x49", ok: adsOk(4), detail: "MQ-6, 7, 8, 135", icon: "chip" },
    { label: "DHT11", ok: latest.temp_c !== null && latest.humidity !== null, detail: "Suhu dan kelembapan", icon: "thermo" },
    { label: "Pemanasan", ok: latest.preheated, detail: latest.preheated ? "Selesai" : `${latest.uptime_min} dari 10 menit`, icon: "hourglass" },
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
              {s.key.toUpperCase().replace("MQ", "MQ-")}
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
      <div className="flex h-9 overflow-hidden rounded-xl shadow-[inset_0_1px_3px_var(--well-shade)]" role="img"
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
    { t: "Sampel", d: "Nasi atau mi diletakkan di bawah tutup sensor." },
    { t: "Mengendus", d: "8 sensor gas MQ dan DHT11 membaca udara di atas makanan." },
    { t: "ESP32", d: "ADS1115 mengubah sinyal sensor, ESP32 mengirim tiap 5 detik." },
    { t: "EMQX", d: "Broker MQTT meneruskan data ke server dan database Supabase." },
    { t: "Dashboard", d: "Respons gas dibandingkan dengan udara bersih, lalu jadi status." },
  ];
  return (
    <section id="cara-kerja" aria-labelledby="cara-h" className="mt-16 sm:mt-24">
      <h2 id="cara-h" className="text-3xl font-semibold tracking-tight sm:text-4xl">Cara kerja ENDUS</h2>
      <p className="mt-3 max-w-[65ch] text-lg text-ink-2">
        ENDUS, dari kata <em>mengendus</em>, mencium gas yang dilepas mikroba saat nasi dan mi mulai rusak di suhu ruang.
        Yang dinilai kondisi makanannya, bukan sekadar berapa jam sudah disimpan.
      </p>

      <ol className="mt-10 grid gap-6 sm:grid-cols-5 sm:gap-3">
        {steps.map((s, i) => (
          <li key={s.t} className="relative flex gap-4 sm:flex-col sm:gap-3">
            <div className="flex items-center sm:w-full">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-moss text-sm font-bold text-on-moss">{i + 1}</span>
              {i < steps.length - 1 && <span className="ml-3 hidden h-px flex-1 bg-moss/40 sm:block" aria-hidden />}
            </div>
            <div>
              <h3 className="font-semibold">{s.t}</h3>
              <p className="mt-1 text-sm text-ink-2">{s.d}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-14 grid gap-10 lg:grid-cols-2 lg:gap-16">
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
    <div className="tray grid animate-pulse gap-2.5 lg:grid-cols-[1.65fr_1fr]" aria-busy="true" aria-label="Memuat data sensor">
      <div className="well h-[28rem] lg:row-span-2" />
      <div className="well h-52" />
      <div className="well h-52" />
    </div>
  );
}

/* ---------- helpers ---------- */

type Segment = { verdict: Verdict | "gap"; start: number; end: number };

function toSegments(times: number[], verdicts: Verdict[]): Segment[] {
  const out: Segment[] = [];
  const push = (verdict: Segment["verdict"], start: number, end: number) => {
    const last = out.at(-1);
    if (last && last.verdict === verdict) last.end = end;
    else out.push({ verdict, start, end });
  };
  times.forEach((t, i) => {
    const next = times[i + 1];
    const end = next !== undefined && next - t <= GAP_MS ? next : t + SAMPLE_MS;
    push(verdicts[i], t, end);
    if (next !== undefined && next - t > GAP_MS) push("gap", end, next);
  });
  return out;
}

// Server component renders once per request, so reading the clock here is fine.
const msSince = (ts: string) => Date.now() - new Date(ts).getTime();
const fmt = (n: number, d: number) => (Math.abs(n) < 0.5 * 10 ** -d ? 0 : n).toLocaleString("id-ID", { maximumFractionDigits: d, minimumFractionDigits: d });
// shortcut: server renders in WIB; kitchens in WITA/WIT see WIB times on server-rendered labels (charts use the browser's zone).
const TZ = "Asia/Jakarta";
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
