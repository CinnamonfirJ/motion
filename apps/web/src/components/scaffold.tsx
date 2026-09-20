import { useState, type ReactNode } from "react";

/** A `+` glyph pinned to a frame corner/intersection (design reference's signature mark). */
export function PlusMark({ className = "" }: { className?: string }) {
  return <span className={`plusmark ${className}`} aria-hidden />;
}

/** Wrap content in a hairline frame with `+` marks at all four corners. */
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

/** Horizontal hairline rule with a `+` at each end (section divider). */
export function PlusRule({ className = "" }: { className?: string }) {
  return (
    <div className={`relative h-px bg-border ${className}`}>
      <PlusMark className="-left-[5px] -top-[5px]" />
      <PlusMark className="-right-[5px] -top-[5px]" />
    </div>
  );
}

/** Section index marker, e.g. `[ 01 OF 08 ] · WHY MOMENT`. */
export function SectionIndex({ index, total = 6, label }: { index: number; total?: number; label: string }) {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="eyebrow text-micro text-text-muted">
      [ {p(index)} OF {p(total)} ] · {label}
    </div>
  );
}

/** Bordered tag chip with a square bullet (design reference's `■ LABEL`). */
export function TagChip({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 border border-border bg-surface1 px-3 py-1.5 eyebrow text-micro text-text-secondary ${className}`}
    >
      <span className="h-2 w-2 bg-lime" aria-hidden />
      {children}
    </span>
  );
}

/** Diagonal-hatch strip. */
export function Hatch({ className = "" }: { className?: string }) {
  return <div className={`hatch ${className}`} aria-hidden />;
}

/** FAQ-style accordion with a square +/− toggle. */
export function Accordion({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="border-t border-border">
      {items.map((it, i) => {
        const isOpen = open === i;
        return (
          <div key={i} className="border-b border-border">
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              className="flex w-full items-center gap-4 py-5 text-left"
              aria-expanded={isOpen}
            >
              <span className="eyebrow text-micro text-text-muted w-6">{String(i + 1).padStart(2, "0")}</span>
              <span className="flex-1 text-bodylg text-text">{it.q}</span>
              <span className="grid h-8 w-8 shrink-0 place-items-center border border-border bg-surface2 text-text-secondary">
                {isOpen ? "−" : "+"}
              </span>
            </button>
            {isOpen && <p className="pb-5 pl-10 pr-12 font-mono text-bodysm text-text-secondary leading-relaxed">{it.a}</p>}
          </div>
        );
      })}
    </div>
  );
}
