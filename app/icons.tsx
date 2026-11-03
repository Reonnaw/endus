import type { SVGProps } from "react";

// One drawn set: 24px grid, 1.75 stroke, round caps.
const PATHS = {
  check: "M5 12.5l4.5 4.5L19 7.5",
  alert: "M12 3.8 21.2 19.5H2.8ZM12 9.5v4.5M12 16.8v.01",
  stop: "M8.2 3h7.6L21 8.2v7.6L15.8 21H8.2L3 15.8V8.2ZM9 9l6 6M15 9l-6 6",
  hourglass: "M6.5 3h11M6.5 21h11M8 3v3.5a4 4 0 0 0 1.8 3.3L12 12l2.2-2.2A4 4 0 0 0 16 6.5V3M8 21v-3.5a4 4 0 0 1 1.8-3.3L12 12l2.2 2.2a4 4 0 0 1 1.8 3.3V21",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.4v.6M12 16.8v.01",
  thermo: "M10 13.8V5a2 2 0 1 1 4 0v8.8a4 4 0 1 1-4 0ZM12 9v6.5",
  drop: "M12 3.2s6 6.4 6 10.8a6 6 0 0 1-12 0c0-4.4 6-10.8 6-10.8Z",
  wifi: "M2 8.8a15 15 0 0 1 20 0M5.2 12.3a10 10 0 0 1 13.6 0M8.6 15.8a5 5 0 0 1 6.8 0M12 19.3v.01",
  chip: "M7 7h10v10H7ZM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4",
  wind: "M3 8h10.5a2.5 2.5 0 1 0-2.5-2.5M3 12h15.5a2.5 2.5 0 1 1-2.5 2.5M3 16h7",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3.2 2",
  flask: "M9 3h6M10 3v6.2L4.6 18.4A1.8 1.8 0 0 0 6.2 21h11.6a1.8 1.8 0 0 0 1.6-2.6L14 9.2V3M7 15h10",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 12v.01",
} as const;

/** ENDUS mark: an MBG ompreng seen from above, rice well on the left, three side wells. */
export function Logo(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={32} height={32} fill="currentColor" aria-hidden {...p}>
      <rect x="1.25" y="3.75" width="21.5" height="16.5" rx="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="4" y="6.5" width="8.5" height="11" rx="2" />
      <rect x="14" y="6.5" width="2.5" height="4.75" rx="1" />
      <rect x="17.5" y="6.5" width="2.5" height="4.75" rx="1" />
      <rect x="14" y="12.75" width="6" height="4.75" rx="1" />
    </svg>
  );
}

export type IconName = keyof typeof PATHS;

export function Icon({ name, ...p }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
      <path d={PATHS[name]} />
    </svg>
  );
}
