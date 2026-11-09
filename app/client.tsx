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
          // Not type="password": browsers then autofill the saved EMQX dashboard login (same host) and offer to overwrite it with this token.
          id="cal-token" name="token" type="text" required autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
          data-1p-ignore data-lpignore="true" data-bwignore
          className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-well px-3 text-ink transition-colors [-webkit-text-security:disc] hover:border-muted focus-visible:border-moss"
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

export type Sensor3D = { key: string; name: string; formula: string; value: number | null; verdict: boolean };
type Scene3D = { update: (sensors: Sensor3D[], calibrated: boolean) => void };

const MAX_H = 3;
const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";

/**
 * The 8 MQ sensors as cans on a steel tray. Height = response S (or raw count before calibration), live via AutoRefresh.
 * Decorative: GasTable below carries the same numbers as text, so the canvas is aria-hidden.
 */
export function SensorArray3D({ sensors, calibrated, warn, bad }: { sensors: Sensor3D[]; calibrated: boolean; warn: number; bad: number }) {
  const box = useRef<HTMLDivElement>(null);
  const scene = useRef<Scene3D | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tip, setTip] = useState<{ i: number; x: number; y: number; w: number } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let cleanup = () => {};
    let gone = false;
    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      if (gone) return;
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch {
        setFailed(true); // no WebGL: GasTable still shows everything
        return;
      }
      const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const size = () => [el.clientWidth || 1, el.clientHeight || 1] as const;
      let [w, h] = size();
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setSize(w, h);
      renderer.domElement.setAttribute("aria-hidden", "true");
      renderer.domElement.style.display = "block";
      el.appendChild(renderer.domElement);

      const s = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(32, w / h, 0.1, 100);
      camera.position.set(7, 6.5, 9);
      s.add(new THREE.HemisphereLight(0xffffff, 0x3a4630, 1.7));
      const sun = new THREE.DirectionalLight(0xffffff, 2);
      sun.position.set(4, 9, 6);
      s.add(sun);

      const steel = new THREE.MeshStandardMaterial({ metalness: 0.55, roughness: 0.4 });
      const tray = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.25, 4.6), steel);
      tray.position.y = -0.125;
      s.add(tray);

      const baseGeo = new THREE.CylinderGeometry(0.66, 0.7, 0.2, 40);
      const barGeo = new THREE.CylinderGeometry(0.44, 0.44, 1, 40).translate(0, 0.5, 0); // grows up from y=0
      const bars = Array.from({ length: 8 }, (_, i) => {
        const x = ((i % 4) - 1.5) * 2, z = (Math.floor(i / 4) - 0.5) * 2.1;
        const base = new THREE.Mesh(baseGeo, steel);
        base.position.set(x, 0.1, z);
        const bar = new THREE.Mesh(barGeo, new THREE.MeshStandardMaterial({ metalness: 0.1, roughness: 0.45 }));
        bar.position.set(x, 0.2, z);
        bar.scale.y = 0.05;
        bar.userData.i = base.userData.i = i;
        s.add(base, bar);
        return bar;
      });

      const plane = () => {
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(8.6, 4.6).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
        );
        s.add(m);
        return m;
      };
      const warnPlane = plane(), badPlane = plane();
      const scaleMax = bad * 1.4; // same scale as the GasTable bars
      warnPlane.position.y = 0.2 + (warn / scaleMax) * MAX_H;
      badPlane.position.y = 0.2 + (bad / scaleMax) * MAX_H;

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 1, 0);
      controls.enableZoom = false; // the wheel must keep scrolling the page
      controls.enablePan = false;
      controls.enableDamping = !still;
      controls.minPolarAngle = 0.35;
      controls.maxPolarAngle = 1.3;
      controls.autoRotate = !still;
      controls.autoRotateSpeed = 0.6;
      controls.update();

      let target = bars.map(() => 0.05);
      let hovered = -1;
      let dirty = true;
      let raf = 0, visible = true;
      const barMat = (i: number) => bars[i].material as InstanceType<typeof THREE.MeshStandardMaterial>;
      const paint = () => {
        bars.forEach((_, i) => (barMat(i).emissiveIntensity = i === hovered ? 0.45 : 0));
        dirty = true;
      };

      // Render loop only runs while on screen and the tab is visible; a frame is drawn only when something moved.
      const tick = () => {
        raf = 0;
        if (!visible || document.hidden) return;
        controls.update();
        bars.forEach((b, i) => {
          const d = target[i] - b.scale.y;
          if (Math.abs(d) > 0.002) { b.scale.y += d * 0.12; dirty = true; }
        });
        if (dirty) { renderer.render(s, camera); dirty = false; }
        raf = requestAnimationFrame(tick);
      };
      const start = () => { if (!raf) raf = requestAnimationFrame(tick); };
      controls.addEventListener("change", () => { dirty = true; });
      controls.addEventListener("start", () => { controls.autoRotate = false; });

      scene.current = {
        update(list, cal) {
          steel.color.set(css("--tray-edge"));
          warnPlane.material.color.set(css("--warn-mark"));
          badPlane.material.color.set(css("--bad"));
          warnPlane.visible = badPlane.visible = cal;
          const maxCount = Math.max(1, ...list.map((x) => x.value ?? 0));
          target = list.map((x) => {
            if (x.value === null) return 0.05;
            return Math.max(0.05, Math.min(1, x.value / (cal ? scaleMax : maxCount)) * MAX_H);
          });
          list.forEach((x, i) => {
            // Before calibration: series colours like the trend chart. After: status tones like GasTable.
            const tone = !cal ? `--s${i + 1}` : !x.verdict || x.value === null ? "--idle"
              : x.value >= bad ? "--bad" : x.value >= warn ? "--warn-mark" : "--ok";
            barMat(i).color.set(css(tone));
            barMat(i).emissive.set(css(tone));
          });
          if (still) bars.forEach((b, i) => (b.scale.y = target[i]));
          paint();
          start();
        },
      };

      const ray = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      const pickable = s.children.filter((o) => o.userData.i !== undefined);
      const onMove = (e: PointerEvent) => {
        const r = renderer.domElement.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const hit = ray.intersectObjects(pickable)[0];
        const i = hit ? (hit.object.userData.i as number) : -1;
        if (i !== hovered) { hovered = i; paint(); start(); }
        setTip(i < 0 ? null : { i, x: e.clientX - r.left, y: e.clientY - r.top, w: r.width });
      };
      const onLeave = () => { hovered = -1; paint(); start(); setTip(null); };
      renderer.domElement.addEventListener("pointermove", onMove);
      renderer.domElement.addEventListener("pointerleave", onLeave);

      const ro = new ResizeObserver(() => {
        [w, h] = size();
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        dirty = true;
        start();
      });
      ro.observe(el);
      const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; start(); });
      io.observe(el);
      document.addEventListener("visibilitychange", start);

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        io.disconnect();
        document.removeEventListener("visibilitychange", start);
        controls.dispose();
        s.traverse((o) => {
          if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as InstanceType<typeof THREE.Material>).dispose(); }
        });
        renderer.dispose();
        renderer.domElement.remove();
        scene.current = null;
      };
      setReady(true);
    })();
    return () => { gone = true; cleanup(); };
  }, [warn, bad]);

  useEffect(() => {
    if (ready) scene.current?.update(sensors, calibrated);
  }, [ready, sensors, calibrated]);

  if (failed) return null;
  const t = tip && sensors[tip.i];
  return (
    <figure className="mb-6">
      <div ref={box} className="relative h-[260px] cursor-grab overflow-hidden rounded-xl bg-ink/5 active:cursor-grabbing sm:h-[300px]">
        {tip && t && (
          <div
            className="pointer-events-none absolute z-10 min-w-36 rounded-xl border border-line bg-well px-3 py-2 text-sm shadow-[0_6px_20px_-8px_rgb(0_0_0/0.35)]"
            style={{ top: Math.max(8, tip.y - 76), ...(tip.x > tip.w / 2 ? { right: tip.w - tip.x + 12 } : { left: tip.x + 12 }) }}
          >
            <p className="font-mono text-xs font-medium text-ink-2">{t.name} <span className="font-sans text-muted">{t.formula}</span></p>
            <p className="mt-0.5 font-semibold">
              {t.value === null ? "Tidak terbaca" : calibrated ? `Respons ${num(t.value, 2)}` : `${num(t.value, 0)} count`}
            </p>
            {calibrated && !t.verdict && <p className="text-xs text-muted">Info saja, tidak menentukan status</p>}
          </div>
        )}
      </div>
      <figcaption className="mt-2 text-xs text-muted">
        Seret untuk memutar.{" "}
        {calibrated ? "Bidang kuning dan merah = batas Waspada dan Tidak layak." : "Belum dikalibrasi: tinggi = nilai mentah."}
      </figcaption>
    </figure>
  );
}
