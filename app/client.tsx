"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { calibrate } from "./actions";

export function AutoRefresh({ ms }: { ms: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), ms);
    return () => clearInterval(id);
  }, [router, ms]);
  return null;
}

export type Series = { key: string; label: string; color: string; values: (number | null)[] };
type Threshold = { v: number; label: string; tone: "warn" | "bad" };

const hhmm = (t: number) => new Date(t).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
const num = (n: number, d: number) => (Math.abs(n) < 0.5 * 10 ** -d ? 0 : n).toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });

function niceStep(span: number) {
  const raw = span / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? raw;
}

export function LineChart({
  times, series, height = 200, unit = "", digits = 1, thresholds = [], floor, ceil, label, guess = 640,
}: {
  times: number[]; series: Series[]; height?: number; unit?: string; digits?: number;
  thresholds?: Threshold[]; floor?: number; ceil?: number; label: string; guess?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(guess); // server-render width guess; ResizeObserver corrects it after hydration
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  if (times.length < 2 || all.length < 2) {
    return <p className="grid place-items-center rounded-xl border border-dashed border-line text-sm text-muted" style={{ height }}>Belum cukup data untuk grafik.</p>;
  }

  const dataMin = Math.min(...all);
  // Sensor noise sits a hair below a floor like 0; don't let it pull the axis down a whole step.
  let lo = floor !== undefined && dataMin > floor - 0.05 ? floor : Math.min(dataMin, floor ?? Infinity), hi = Math.max(...all, ceil ?? -Infinity);
  if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
  const step = niceStep(hi - lo);
  lo = Math.floor(lo / step + 1e-9) * step;
  hi = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(v);

  const L = 40, R = 12, T = 10, B = 24;
  const iw = Math.max(1, w - L - R), ih = height - T - B;
  const t0 = times[0], t1 = times[times.length - 1];
  const x = (i: number) => L + ((times[i] - t0) / (t1 - t0 || 1)) * iw;
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * ih;
  const path = (vals: (number | null)[]) =>
    vals.map((v, i) => (v === null ? "" : `${i && vals[i - 1] !== null ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)).join("");
  const xTicks = [0, 1, 2, 3].map((k) => Math.round((k / 3) * (times.length - 1)));
  const band = (a: number, b: number) => ({ y: y(Math.min(Math.max(b, lo), hi)), h: Math.max(0, y(Math.max(a, lo)) - y(Math.min(b, hi))) });

  const nearest = (clientX: number, rect: DOMRect) => {
    const t = t0 + ((clientX - rect.left - L) / iw) * (t1 - t0);
    let best = 0;
    times.forEach((ti, i) => { if (Math.abs(ti - t) < Math.abs(times[best] - t)) best = i; });
    return best;
  };
  const h = hover;
  const tipLeft = h !== null && x(h) > w / 2;

  return (
    <div>
      {series.length > 1 && (
        <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
          {series.map((s) => (
            <li key={s.key} className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} aria-hidden />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <div ref={box} className="relative" style={{ height }}>
        <svg
            width="100%" height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" role="img" tabIndex={0}
            aria-label={`${label}, ${hhmm(t0)}–${hhmm(t1)}. Gunakan panah kiri/kanan untuk membaca nilai.`}
            className="touch-none select-none rounded-lg"
            onPointerMove={(e) => setHover(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
            onPointerLeave={() => setHover(null)}
            onBlur={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              const d = e.key === "ArrowLeft" ? -1 : 1;
              setHover((p) => Math.min(times.length - 1, Math.max(0, (p ?? times.length - 1) + d)));
            }}
          >
            {thresholds.map((th, i) => {
              const next = thresholds[i + 1]?.v ?? hi;
              const b = band(th.v, next);
              return <rect key={th.v} x={L} width={iw} y={b.y} height={b.h} fill={`var(--${th.tone}-wash)`} opacity={0.7} />;
            })}
            {ticks.map((v) => (
              <g key={v}>
                <line x1={L} x2={L + iw} y1={y(v)} y2={y(v)} stroke="var(--line)" />
                <text x={L - 8} y={y(v)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--muted)">{num(v, step < 1 ? 1 : 0)}</text>
              </g>
            ))}
            {thresholds.map((th) => (
              <g key={th.v}>
                <line x1={L} x2={L + iw} y1={y(th.v)} y2={y(th.v)} stroke={`var(--${th.tone})`} strokeDasharray="4 4" />
                <text x={L + 6} y={y(th.v) - 5} fontSize={11} fontWeight={600} fill={`var(--${th.tone})`}>{th.label}</text>
              </g>
            ))}
            {xTicks.map((i, k) => (
              <text key={k} x={x(i)} y={height - 6} fontSize={11} fill="var(--muted)" textAnchor={k === 0 ? "start" : k === 3 ? "end" : "middle"}>{hhmm(times[i])}</text>
            ))}
            {series.map((s) => (
              <path key={s.key} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {h !== null && (
              <g>
                <line x1={x(h)} x2={x(h)} y1={T} y2={T + ih} stroke="var(--ink-2)" strokeOpacity={0.5} />
                {series.map((s) => s.values[h] !== null && (
                  <circle key={s.key} cx={x(h)} cy={y(s.values[h]!)} r={4.5} fill={s.color} stroke="var(--well)" strokeWidth={2} />
                ))}
              </g>
            )}
          </svg>
        {h !== null && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-36 rounded-xl border border-line bg-well px-3 py-2 text-sm shadow-[0_6px_20px_-8px_rgb(0_0_0/0.35)]"
            style={tipLeft ? { right: w - x(h) + 10 } : { left: x(h) + 10 }}
          >
            <p className="mb-1 text-xs text-muted">{new Date(times[h]).toLocaleTimeString("id-ID")}</p>
            {series.map((s) => (
              <p key={s.key} className="flex items-center justify-between gap-4">
                <span className="inline-flex items-center gap-1.5 text-ink-2">
                  <span className="size-2 rounded-full" style={{ background: s.color }} aria-hidden />
                  {s.label}
                </span>
                <span className="font-medium">{s.values[h] === null ? "–" : `${num(s.values[h]!, digits)}${unit}`}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function CalibrateForm({ device }: { device: string }) {
  const [msg, action, pending] = useActionState(calibrate, "");
  const ok = msg === "Kalibrasi tersimpan.";
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="device" value={device} />
      <label htmlFor="cal-token" className="text-sm font-medium text-ink-2">Token kalibrasi</label>
      <div className="flex gap-2">
        <input
          id="cal-token" name="token" type="password" required autoComplete="off"
          className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-well px-3 text-ink shadow-[inset_0_1px_2px_var(--well-shade)] transition-colors hover:border-muted focus-visible:border-moss"
        />
        <button
          disabled={pending}
          className="h-10 shrink-0 rounded-xl bg-moss px-4 text-sm font-semibold text-on-moss transition-colors hover:bg-moss-deep hover:text-well active:translate-y-px disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? "Menyimpan…" : "Kalibrasi"}
        </button>
      </div>
      {msg && <p role="status" className={`text-sm font-medium ${ok ? "text-ok" : "text-bad"}`}>{msg}</p>}
    </form>
  );
}
