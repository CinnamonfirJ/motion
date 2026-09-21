import { useEffect, useRef, useState } from "react";
import { ordinal } from "../lib/format";
import { Button } from "./ui";

const REACTIONS = [
  { type: "fire", icon: "🔥", label: "React fire", key: "1" },
  { type: "laugh", icon: "😂", label: "React laugh", key: "2" },
  { type: "wow", icon: "😮", label: "React wow", key: "3" },
] as const;

export type ReactionType = (typeof REACTIONS)[number]["type"];

interface Particle {
  id: number;
  icon: string;
  x: number;
}

/** Reaction rail — physical tap feedback, bounded particle count (design §7.6, §16, §27). */
export function ReactionRail({ onReact }: { onReact: (t: ReactionType) => void }) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const nextId = useRef(0);

  const fire = (type: ReactionType, icon: string) => {
    onReact(type);
    const id = nextId.current++;
    setParticles((p) => [...p.slice(-8), { id, icon, x: Math.random() * 40 - 20 }]); // cap ~9 particles
    setTimeout(() => setParticles((p) => p.filter((x) => x.id !== id)), 700);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const r = REACTIONS.find((x) => x.key === e.key);
      if (r && !(e.target instanceof HTMLInputElement)) fire(r.type, r.icon);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative flex items-center justify-center gap-4">
      {/* particle layer */}
      <div className="pointer-events-none absolute -top-2 left-0 right-0 flex justify-center">
        {particles.map((p) => (
          <span
            key={p.id}
            className="absolute text-2xl animate-floatUp"
            style={{ transform: `translateX(${p.x}px)` }}
            aria-hidden
          >
            {p.icon}
          </span>
        ))}
      </div>
      {REACTIONS.map((r) => (
        <button
          key={r.type}
          aria-label={r.label}
          onClick={() => fire(r.type, r.icon)}
          className="h-16 w-16 rounded-full bg-surface2 border border-border text-3xl grid place-items-center active:scale-90 transition-transform duration-quick hover:border-borderStrong"
        >
          <span aria-hidden>{r.icon}</span>
        </button>
      ))}
    </div>
  );
}

/** Live pulse indicator (design §7.5) — quiet by default, "Activity rising" when heating up. */
export function LivePulse({ heatingUp }: { heatingUp: boolean }) {
  if (!heatingUp) return <div className="h-5" aria-hidden />;
  return (
    <div className="flex items-center justify-center gap-2 text-label text-leaf">
      <span className="h-1.5 w-1.5 rounded-full bg-lime animate-[pulseRing_1.2s_ease-out_infinite]" />
      Heating up
    </div>
  );
}

/** Moment Detected overlay (design §7.8, motion §17). Feels like the app noticed something. */
export function MomentDetectedOverlay({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"detected" | "forming">("detected");
  useEffect(() => {
    const t1 = setTimeout(() => setPhase("forming"), 2000);
    const t2 = setTimeout(onDone, 2600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/40 backdrop-blur-[2px]">
      {/* luminous sweep across the video (design §7.8) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-0 bottom-0 w-1/3 bg-gradient-to-r from-transparent via-lime/25 to-transparent animate-sweep" />
      </div>
      {phase === "detected" ? (
        <div className="text-center animate-popIn" role="status" aria-live="assertive">
          <div className="mx-auto mb-3 h-14 w-14 rounded-full bg-lime/15 grid place-items-center">
            <span className="h-3 w-3 rounded-full bg-lime animate-[pulseRing_1.2s_ease-out_infinite]" />
          </div>
          <h2 className="text-h1 text-text tracking-tight">MOMENT DETECTED</h2>
          <p className="text-body text-text-secondary mt-1">People are reacting fast.</p>
        </div>
      ) : (
        <div className="text-center animate-popIn">
          <p className="text-h3 text-leaf">Moment forming…</p>
        </div>
      )}
    </div>
  );
}

/** Small confirming card (design §7.9). No technical vocabulary. */
export function MomentFormingPill() {
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-surface2 border border-border px-3 py-1.5">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1.5 w-1.5 rounded-full bg-lime animate-[pulseRing_1.4s_ease-out_infinite]" style={{ animationDelay: `${i * 0.2}s` }} />
        ))}
      </span>
      <span className="text-label text-text-secondary">Moment forming · Checking the crowd</span>
    </div>
  );
}

/** Founding Curator celebration (design §7.10, §41). Status over money; gradient earns its place. */
export function CuratorCelebration({
  rank,
  rewardUsd,
  onWatch,
  onDone,
}: {
  rank: number;
  rewardUsd: string;
  onWatch: () => void;
  onDone: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-night/80 backdrop-blur-sm p-6" role="dialog" aria-modal="true">
      <div className="relative w-full max-w-sm border border-border bg-surface1 p-8 text-center overflow-hidden animate-popIn">
        <span className="plusmark -left-[6px] -top-[6px]" />
        <span className="plusmark -right-[6px] -top-[6px]" />
        <span className="plusmark -left-[6px] -bottom-[6px]" />
        <span className="plusmark -right-[6px] -bottom-[6px]" />
        {/* celebration bloom behind the rank */}
        <div className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 h-48 w-48 rounded-full celebration-gradient opacity-40 blur-2xl" />
        <div className="relative">
          <div className="mx-auto mb-5 h-16 w-16 rounded-full celebration-gradient grid place-items-center">
            <span className="h-3.5 w-3.5 rounded-full bg-white/90 animate-[pulseRing_1.4s_ease-out_infinite]" />
          </div>
          <h2 className="text-h1 text-text" aria-live="assertive">
            You found it early.
          </h2>
          <p className="mt-2 text-h3 text-leaf">Founding Curator #{rank}</p>
          <p className="mt-3 font-mono text-bodysm text-text-secondary">Your reaction helped surface this Moment.</p>
          <div className="mt-5 border border-border bg-surface2 px-4 py-3">
            <p className="text-h2 text-text tabular-nums">{rewardUsd}</p>
            <p className="mt-0.5 font-mono text-micro uppercase tracking-[0.1em] text-warning">○ Settling</p>
          </div>
          <div className="mt-6 flex flex-col gap-2">
            <Button variant="primary" onClick={onWatch}>
              Watch Moment
            </Button>
            <Button variant="ghost" onClick={onDone}>
              Done
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Reward settled toast (design §7.11) — small, proportional. */
export function RewardToast({ text }: { text: string }) {
  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 animate-popIn">
      <div className="flex items-center gap-2 rounded-full bg-surface2 border border-success/40 px-4 py-2 shadow-modal">
        <span className="text-success" aria-hidden>
          ✓
        </span>
        <span className="text-body text-text">{text}</span>
      </div>
    </div>
  );
}
