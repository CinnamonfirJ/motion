"use client";

import { useEffect, useMemo, useId, useState, type ButtonHTMLAttributes, type ReactNode, type SVGProps } from "react";

// Building blocks ported from the main ENNOIA web app (apps/web/src/components).

// ---------- scaffold ----------

export function PlusMark({ className = "" }: { className?: string }) {
  return <span className={`plusmark ${className}`} aria-hidden />;
}

export function PlusFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative border border-border ${className}`}>
      <PlusMark className="-left-[6px] -top-[6px]" />
      <PlusMark className="-right-[6px] -top-[6px]" />
      <PlusMark className="-left-[6px] -bottom-[6px]" />
      <PlusMark className="-right-[6px] -bottom-[6px]" />
      {children}
    </div>
  );
}

export function SectionIndex({ index, total, label }: { index: number; total: number; label: string }) {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="eyebrow text-micro text-text-muted">
      [ {p(index)} OF {p(total)} ] · {label}
    </div>
  );
}

export function TagChip({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 border border-border bg-surface1 px-3 py-1.5 eyebrow text-micro text-text-secondary ${className}`}>
      <span className="h-2 w-2 bg-lime" aria-hidden />
      {children}
    </span>
  );
}

export function Hatch({ className = "" }: { className?: string }) {
  return <div className={`hatch ${className}`} aria-hidden />;
}

export function Button({
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`relative inline-flex min-h-[46px] items-center justify-center gap-2 bg-brand px-5 font-mono text-label uppercase tracking-[0.14em] text-white transition-all duration-quick hover:bg-brandHover active:translate-y-px active:bg-brandPressed disabled:pointer-events-none disabled:opacity-40 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <span className="relative h-8 w-8 overflow-hidden" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/ennoia-mark.png`} alt="" className="absolute left-1/2 top-1/2 h-20 w-20 max-w-none -translate-x-1/2 -translate-y-1/2 object-contain" />
      </span>
      <span className="text-h3 font-bold tracking-[0.08em]">ENNOIA</span>
    </div>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
  }, []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("ennoia_theme", next);
    } catch {
      /* private mode — the switch still applies for this visit */
    }
    setTheme(next);
  };
  const label = `Switch to ${theme === "dark" ? "light" : "dark"} mode`;
  return (
    <button
      onClick={toggle}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 place-items-center border border-border bg-surface1 text-text-secondary hover:text-text"
    >
      <span aria-hidden className="text-[13px]">{theme === "dark" ? "☀" : "☾"}</span>
    </button>
  );
}

// ---------- reaction spike graph ----------

export function ReactionGraph({ durationSec, peakOffsetSec, height = 96 }: { durationSec: number; peakOffsetSec: number; height?: number }) {
  const gid = useId();
  const W = 320;
  const H = height;
  const N = 48;

  const { linePath, areaPath, peakX, peakY } = useMemo(() => {
    const dur = Math.max(1, durationSec);
    const peakT = Math.min(dur, Math.max(0, peakOffsetSec));
    const sigma = dur / 7;
    const vals: number[] = [];
    for (let i = 0; i < N; i++) {
      const t = (i / (N - 1)) * dur;
      const bump = Math.exp(-((t - peakT) ** 2) / (2 * sigma * sigma));
      vals.push(0.12 + 0.06 * Math.sin(i * 0.7) + bump);
    }
    const max = Math.max(...vals) || 1;
    const pad = 6;
    const pts = vals.map((v, i) => [pad + (i / (N - 1)) * (W - pad * 2), H - pad - (v / max) * (H - pad * 2)] as const);
    let d = `M ${pts[0]![0]},${pts[0]![1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1]!;
      const [x1, y1] = pts[i]!;
      d += ` Q ${x0},${y0} ${(x0 + x1) / 2},${(y0 + y1) / 2}`;
    }
    const [px, py] = pts[Math.min(N - 1, Math.max(0, Math.round((peakT / dur) * (N - 1))))]!;
    return { linePath: d, areaPath: `${d} L ${W - pad},${H} L ${pad},${H} Z`, peakX: px, peakY: py };
  }, [durationSec, peakOffsetSec, H]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={`fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-4)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--color-4)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`line-${gid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#77777F" />
          <stop offset="55%" stopColor="var(--color-4)" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#fill-${gid})`} />
      <path d={linePath} fill="none" stroke={`url(#line-${gid})`} strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={peakX} cy={peakY} r={4.5} fill="var(--color-4)" />
      <circle cx={peakX} cy={peakY} r={9} fill="none" stroke="var(--color-4)" strokeOpacity="0.4" />
    </svg>
  );
}

// ---------- icons (monoline, ~1.75px stroke) ----------

type P = SVGProps<SVGSVGElement> & { size?: number };
function S({ size = 20, children, ...rest }: P & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      {children}
    </svg>
  );
}
export const IconSpark = (p: P) => (
  <S {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
    <path d="M12 8.5 13.4 11 16 12l-2.6 1L12 15.5 10.6 13 8 12l2.6-1L12 8.5Z" />
  </S>
);
export const IconBolt = (p: P) => (
  <S {...p}>
    <path d="M13 3 5 13h6l-1 8 8-10h-6l1-8Z" />
  </S>
);
export const IconArrowRight = (p: P) => (
  <S {...p}>
    <path d="M9 5l7 7-7 7" />
  </S>
);
export const IconCheck = (p: P) => (
  <S {...p}>
    <path d="M5 12.5 10 17l9-10" />
  </S>
);
export const IconFingerprint = (p: P) => (
  <S {...p}>
    <path d="M12 11a2 2 0 0 1 2 2c0 3 .3 4.5-.6 6.5" />
    <path d="M8.2 8.6a5 5 0 0 1 8.3 4.4c0 2.3.2 3.6-.5 5.5" />
    <path d="M5 12a7 7 0 0 1 3-5.8" />
    <path d="M6 15c.4 2 .5 3.4-.2 5.2" />
    <path d="M12 15c0 3-.2 4.4-.9 6" />
  </S>
);
