import type { ButtonHTMLAttributes, ReactNode } from "react";
import { initials, hue } from "../lib/format";

/**
 * Button in the reference's language: SHARP rectangle, monospace uppercase label with
 * letter-spacing, and (for secondary/framed) corner brackets instead of a full border.
 */
export function Button({
  variant = "primary",
  className = "",
  children,
  brackets = variant !== "primary",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  brackets?: boolean;
}) {
  const base =
    "group relative inline-flex items-center justify-center gap-2 min-h-[46px] px-5 font-mono text-label uppercase tracking-[0.14em] transition-all duration-quick disabled:opacity-40 disabled:pointer-events-none";
  const styles = {
    // ENNOIA primary: brand purple (--color-9) with white text; hover --color-13.
    primary: "bg-brand text-white hover:bg-brandHover active:bg-brandPressed active:translate-y-px",
    secondary: "bg-transparent text-text hover:bg-surface2 active:translate-y-px",
    ghost: "bg-transparent text-text-secondary hover:text-text",
  }[variant];
  return (
    <button className={`${base} ${styles} ${className}`} {...rest}>
      {brackets && <Brackets />}
      {children}
    </button>
  );
}

/** Four corner brackets (⌐ ¬ L ⌐) drawn just outside the element's box. */
export function Brackets({ color = "currentColor" }: { color?: string }) {
  const c = "absolute h-2.5 w-2.5 border-current";
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0" style={{ color }}>
      <span className={`${c} left-0 top-0 border-l border-t`} />
      <span className={`${c} right-0 top-0 border-r border-t`} />
      <span className={`${c} left-0 bottom-0 border-l border-b`} />
      <span className={`${c} right-0 bottom-0 border-r border-b`} />
    </span>
  );
}

export function Card({ children, className = "", elevated }: { children: ReactNode; className?: string; elevated?: boolean }) {
  return (
    <div className={`border border-border ${elevated ? "bg-surface2" : "bg-surface1"} ${className}`}>{children}</div>
  );
}

export function Pill({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "live" | "lime" | "warning";
  className?: string;
}) {
  const tones = {
    neutral: "border-border bg-surface1 text-text-secondary",
    live: "border-error/40 bg-error/10 text-error",
    lime: "border-lime/40 bg-lime/10 text-leaf",
    warning: "border-warning/40 bg-warning/10 text-warning",
  }[tone];
  // Square bordered chip (no pills) + mono label — the reference's tag style.
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2 py-1 font-mono text-micro uppercase tracking-[0.12em] ${tones} ${className}`}
    >
      {children}
    </span>
  );
}

export function LivePill({ count }: { count?: number }) {
  return (
    <Pill tone="live">
      <span className="h-1.5 w-1.5 bg-error animate-[pulseRing_1.4s_ease-out_infinite]" />
      LIVE{typeof count === "number" ? ` · ${count}` : ""}
    </Pill>
  );
}

export function Avatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  const h = hue(name);
  return url ? (
    <img src={url} alt={name} width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <div
      className="flex items-center justify-center rounded-full font-semibold text-ink"
      style={{ width: size, height: size, background: `hsl(${h} 70% 65%)`, fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}

export function AvatarStack({ names, urls, max = 5 }: { names: string[]; urls?: (string | null)[]; max?: number }) {
  const shown = names.slice(0, max);
  return (
    <div className="flex -space-x-2">
      {shown.map((n, i) => (
        <div key={i} className="ring-2 ring-surface1 rounded-full">
          <Avatar name={n} url={urls?.[i] ?? null} size={28} />
        </div>
      ))}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton animate-shimmer border border-border ${className}`} />;
}

/** Status with an icon so state is never color-only (design §26). */
export function StatusRow({ status }: { status: string }) {
  const map: Record<string, { icon: string; label: string; cls: string }> = {
    confirmed: { icon: "✓", label: "Settled", cls: "text-success" },
    pending: { icon: "○", label: "Reward settling", cls: "text-warning" },
    submitted: { icon: "○", label: "Reward settling", cls: "text-warning" },
    failed: { icon: "!", label: "Reward delayed", cls: "text-error" },
  };
  const s = map[status] ?? map.pending!;
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-micro uppercase tracking-[0.1em] ${s.cls}`}>
      <span aria-hidden>{s.icon}</span>
      {s.label}
    </span>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 border border-dashed border-border py-16 text-center">
      <div className="grid h-11 w-11 place-items-center border border-border bg-surface1 text-leaf">
        <span className="h-2 w-2 bg-lime" aria-hidden />
      </div>
      <h3 className="text-h3 text-text">{title}</h3>
      <p className="font-mono text-bodysm text-text-secondary max-w-xs">{body}</p>
      {action}
    </div>
  );
}
