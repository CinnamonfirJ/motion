"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Button,
  Hatch,
  IconArrowRight,
  IconBolt,
  IconCheck,
  IconFingerprint,
  IconSpark,
  Logo,
  PlusFrame,
  PlusMark,
  ReactionGraph,
  SectionIndex,
  TagChip,
  ThemeToggle,
} from "./ui";

type Role = "scout" | "creator" | "both";
interface JoinResult {
  ok: true;
  already: boolean;
  position: number;
  referrals: number;
  referralCode: string;
  count: number;
}

const STORED = "ennoia_waitlist";
const REACTIONS = ["🔥", "😂", "😮"];
const reducedMotion = () =>
  typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);

function readStored(): JoinResult | null {
  try {
    const raw = localStorage.getItem(STORED);
    return raw ? (JSON.parse(raw) as JoinResult) : null;
  } catch {
    return null;
  }
}

function writeStored(result: JoinResult) {
  try {
    localStorage.setItem(STORED, JSON.stringify(result));
  } catch {
    /* private mode — the success card still shows for this visit */
  }
}

// ---------- hooks ----------

/** Eases a number from its previous value to `target`. */
function useCountUp(target: number, durationMs = 1200) {
  const [value, setValue] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (reducedMotion()) {
      setValue(target);
      from.current = target;
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      setValue(Math.round(origin + (target - origin) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(step);
      else from.current = target;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);
  return value;
}

/** Adds `.is-in` to every `.reveal` descendant once it scrolls into view. */
function useReveal() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const nodes = root.current?.querySelectorAll<HTMLElement>(".reveal") ?? [];
    if (!("IntersectionObserver" in window)) {
      nodes.forEach((n) => n.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.15 }
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);
  return root;
}

// ---------- page ----------

export function Waitlist() {
  const root = useReveal();
  const [count, setCount] = useState<number | null>(null);
  const [joined, setJoined] = useState<JoinResult | null>(null);

  useEffect(() => {
    setJoined(readStored());
    fetch("/waitlist/api/waitlist", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((r: { count: number } | null) => setCount(r ? r.count : null))
      .catch(() => setCount(null));
  }, []);

  const onJoined = (result: JoinResult) => {
    writeStored(result);
    setJoined(result);
    setCount(result.count);
  };

  return (
    <div ref={root} className="min-h-screen overflow-x-clip bg-night">
      <header className="header-glass sticky top-0 z-40 border-b border-border">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-4 py-3 md:px-8">
          <Logo />
          <div className="flex items-center gap-3">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <Hero count={count} joined={joined} onJoined={onJoined} />
      <Marquee />

      <main className="mx-auto max-w-[1200px] px-4 md:px-8">
        <Perks />
        <LaunchSequence />
      </main>

      <footer className="mt-16 border-t border-lime/40">
        <Hatch className="h-6" />
        <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-2 px-4 py-6 font-mono text-micro uppercase tracking-[0.12em] text-text-muted md:flex-row md:px-8">
          <span>© 2026 ENNOIA</span>
          <span>Built on Monad</span>
        </div>
      </footer>
    </div>
  );
}

// ---------- hero ----------

function Hero({ count, joined, onJoined }: { count: number | null; joined: JoinResult | null; onJoined: (r: JoinResult) => void }) {
  const shownCount = useCountUp(count ?? 0);
  const words = ["Spot", "the", "moment", "before"];

  return (
    <section className="relative isolate overflow-hidden border-b border-border">
      {/* Background: drifting brand glow, dot grid, faint spike graph, rising reactions. */}
      <div className="dotgrid absolute inset-0 -z-10" aria-hidden />
      <div className="aurora-blob -z-10 left-[-10%] top-[-20%] h-[520px] w-[520px] animate-aurora bg-brand" aria-hidden />
      <div
        className="aurora-blob -z-10 right-[-12%] top-[10%] h-[460px] w-[460px] animate-aurora bg-celebration-end"
        style={{ animationDelay: "-6s" }}
        aria-hidden
      />
      <div
        className="aurora-blob -z-10 bottom-[-30%] left-[30%] h-[420px] w-[420px] animate-aurora bg-electric"
        style={{ animationDelay: "-12s", opacity: 0.18 }}
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 opacity-25" aria-hidden>
        <ReactionGraph durationSec={35} peakOffsetSec={24} height={180} />
      </div>
      <ReactionRain />

      <div className="mx-auto grid max-w-[1200px] items-center gap-10 px-4 py-14 md:grid-cols-[1.15fr_1fr] md:px-8 md:py-24">
        <div className="relative">
          <PlusMark className="-left-[6px] -top-4 hidden md:block" />
          <div className="animate-rise">
            <TagChip>
              <span className="relative flex h-2 w-2">
                <span className="absolute inset-0 animate-pulseRing rounded-full bg-error" />
                <span className="relative h-2 w-2 rounded-full bg-error" />
              </span>
              Waitlist open
            </TagChip>
          </div>

          <h1 className="mt-6 text-[44px] font-extrabold leading-[1.02] tracking-[-0.02em] md:text-[72px]">
            {words.map((w, i) => (
              <span key={w} className="mr-[0.22em] inline-block animate-rise" style={{ animationDelay: `${120 + i * 90}ms` }}>
                {w}
              </span>
            ))}
            <span
              className="gradient-text inline-block"
              style={{ animation: "rise 800ms cubic-bezier(0.2,0.8,0.2,1) 480ms both, gradientPan 6s linear infinite" }}
            >
              everyone&nbsp;else.
            </span>
          </h1>

          <p className="mt-6 max-w-lg animate-rise font-mono text-body text-text-secondary md:text-bodylg" style={{ animationDelay: "620ms" }}>
            React to livestreams as they happen. When the crowd catches up, the earliest scouts get paid on Monad. Get
            in line before the doors open.
          </p>

          <div className="mt-10 animate-rise" style={{ animationDelay: "760ms" }}>
            <ComingSoon />
          </div>

          {count !== null && count > 0 && (
            <div className="mt-6 flex animate-rise items-center gap-3" style={{ animationDelay: "900ms" }}>
              <div className="flex -space-x-1.5">
                {REACTIONS.map((r) => (
                  <span key={r} className="grid h-8 w-8 place-items-center border border-border bg-surface1 text-base">
                    {r}
                  </span>
                ))}
              </div>
              <p className="font-mono text-bodysm text-text-secondary">
                <span className="font-semibold text-text">{shownCount.toLocaleString()}</span>{" "}
                {count === 1 ? "scout is" : "scouts are"} already in line
              </p>
            </div>
          )}
        </div>

        <div className="animate-rise" style={{ animationDelay: "400ms" }}>
          {joined ? <Joined result={joined} /> : <JoinForm onJoined={onJoined} />}
        </div>
      </div>
    </section>
  );
}

/** Reaction emojis float up the hero, like a live stream heating up. */
function ReactionRain() {
  const [drops, setDrops] = useState<{ id: number; emoji: string; left: number; size: number }[]>([]);
  useEffect(() => {
    if (reducedMotion()) return;
    let id = 0;
    const timer = setInterval(() => {
      if (document.hidden) return;
      const drop = {
        id: id++,
        emoji: REACTIONS[Math.floor(Math.random() * REACTIONS.length)]!,
        left: 4 + Math.random() * 92,
        size: 18 + Math.random() * 18,
      };
      setDrops((d) => [...d.slice(-14), drop]);
    }, 650);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
      {drops.map((d) => (
        <span key={d.id} className="absolute bottom-0 animate-drift opacity-0" style={{ left: `${d.left}%`, fontSize: d.size }}>
          {d.emoji}
        </span>
      ))}
    </div>
  );
}

// ---------- coming soon ----------

function ComingSoon() {
  return (
    <div className="glass relative overflow-hidden border border-border px-6 py-6 md:px-8">
      <div className="flex items-center justify-between">
        <span className="eyebrow text-micro text-text-muted">Launch status</span>
        <span className="flex items-center gap-2 eyebrow text-micro text-leaf">
          <span className="relative flex h-2 w-2">
            <span className="absolute inset-0 animate-pulseRing rounded-full bg-lime" />
            <span className="relative h-2 w-2 rounded-full bg-lime" />
          </span>
          In progress
        </span>
      </div>
      <p className="mt-3 text-[40px] font-extrabold leading-none tracking-[-0.02em] md:text-[56px]">
        <span className="gradient-text animate-gradientPan">Coming soon.</span>
      </p>
      {/* Indeterminate progress: a light sweeps along the brand bar. */}
      <div className="relative mt-5 h-1.5 overflow-hidden bg-surface3">
        <div className="celebration-gradient h-full w-full opacity-60" />
        <div className="absolute inset-y-0 w-1/3 animate-sweep bg-gradient-to-r from-transparent via-white/50 to-transparent" />
      </div>
    </div>
  );
}

// ---------- form ----------

const ROLE_OPTIONS: { value: Role; label: string; hint: string }[] = [
  { value: "scout", label: "Scout", hint: "I watch & react" },
  { value: "creator", label: "Creator", hint: "I go live" },
  { value: "both", label: "Both", hint: "A bit of each" },
];

const inputClass =
  "w-full border border-border bg-surface2 px-4 py-3 font-mono text-body text-text transition-colors duration-quick placeholder:text-text-muted hover:border-borderStrong focus:border-lime focus:outline-none";

function JoinForm({ onJoined }: { onJoined: (r: JoinResult) => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("scout");
  const [website, setWebsite] = useState("");
  const [ref, setRef] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRef(new URLSearchParams(window.location.search).get("ref") ?? undefined);
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/waitlist/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), name: name.trim() || undefined, role, ref, website }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.referralCode) onJoined(body as JoinResult);
      else if (body.error === "invalid-email") setError("That email doesn't look right. Check it and try again.");
      else if (res.status === 429) setError("Easy there. Give it a minute and try again.");
      else setError("Something went wrong on our side. Try again in a moment.");
    } catch {
      setError("We couldn't reach ENNOIA. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PlusFrame className="glass shadow-glow">
      <form onSubmit={submit} className="flex flex-col gap-4 p-6 md:p-8">
        <div className="flex items-center justify-between">
          <span className="eyebrow text-micro text-text-muted">Reserve your spot</span>
          <IconSpark size={18} className="text-leaf" />
        </div>
        <h2 className="text-h2">Get early access.</h2>

        <label className="flex flex-col gap-1.5">
          <span className="eyebrow text-micro text-text-secondary">Email</span>
          <input
            type="email"
            required
            inputMode="email"
            autoComplete="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="eyebrow text-micro text-text-secondary">
            Name <span className="text-text-muted">· optional</span>
          </span>
          <input
            type="text"
            autoComplete="given-name"
            maxLength={60}
            placeholder="What should we call you?"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </label>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="eyebrow mb-1.5 text-micro text-text-secondary">I&apos;m joining as</legend>
          <div className="grid grid-cols-3 gap-px border border-border bg-border">
            {ROLE_OPTIONS.map((o) => {
              const active = role === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setRole(o.value)}
                  aria-pressed={active}
                  className={`relative px-2 py-3 text-left transition-colors duration-standard ${active ? "bg-surface3" : "bg-surface2 hover:bg-surface3"}`}
                >
                  {active && <span className="absolute inset-x-0 top-0 h-0.5 animate-popIn bg-lime" />}
                  <span className={`block font-mono text-label uppercase tracking-[0.1em] ${active ? "text-leaf" : "text-text"}`}>{o.label}</span>
                  <span className="mt-0.5 block font-mono text-micro text-text-muted">{o.hint}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* Honeypot for bots; hidden from people and assistive tech. */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          className="absolute -left-[9999px] h-0 w-0 opacity-0"
          aria-hidden
        />

        <Button type="submit" className="group mt-1 w-full overflow-hidden" disabled={busy}>
          <span className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-white/25 opacity-0 transition-all duration-700 group-hover:left-[120%] group-hover:opacity-100" />
          {busy ? "Saving your spot…" : "Join the waitlist"}
          {!busy && <IconArrowRight size={16} className="transition-transform duration-standard group-hover:translate-x-1" />}
        </Button>

        {error && (
          <p role="alert" className="font-mono text-bodysm text-error">
            {error}
          </p>
        )}
        <p className="font-mono text-micro text-text-muted">
          One email on launch day and nothing else. {ref && <span className="text-leaf">A friend invited you.</span>}
        </p>
      </form>
    </PlusFrame>
  );
}

// ---------- success ----------

function Joined({ result }: { result: JoinResult }) {
  const position = useCountUp(result.position, 1600);
  const [copied, setCopied] = useState(false);
  const [link, setLink] = useState("");

  useEffect(() => {
    setLink(`${window.location.origin}/waitlist?ref=${encodeURIComponent(result.referralCode)}`);
  }, [result.referralCode]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the link stays selectable */
    }
  };

  return (
    <PlusFrame className="glass animate-popIn shadow-glow">
      <Burst />
      <div className="flex flex-col gap-5 p-6 md:p-8">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center bg-lime text-white">
            <IconCheck size={14} />
          </span>
          <span className="eyebrow text-micro text-leaf">{result.already ? "Already on the list" : "You're in"}</span>
        </div>

        <div>
          <div className="eyebrow text-micro text-text-muted">Your place in line</div>
          <div className="mt-1 font-mono text-[64px] font-bold leading-none tabular-nums">
            #<span className="gradient-text animate-gradientPan">{position.toLocaleString()}</span>
          </div>
        </div>

        <div>
          <div className="eyebrow text-micro text-text-secondary">Bring your crew</div>
          <p className="mt-1 font-mono text-bodysm text-text-secondary">Share your link. Moments hit harder when your friends are reacting too.</p>
          <div className="mt-3 flex border border-border">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Your referral link"
              className="min-w-0 flex-1 bg-surface2 px-3 py-2.5 font-mono text-bodysm text-text"
            />
            <button
              type="button"
              onClick={copy}
              className="shrink-0 border-l border-border bg-brand px-4 font-mono text-micro uppercase tracking-[0.14em] text-white transition-colors hover:bg-brandHover"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-2 font-mono text-micro text-text-muted">
            {result.referrals > 0
              ? `${result.referrals} ${result.referrals === 1 ? "friend has" : "friends have"} joined with your link.`
              : "No one has joined with your link yet."}
          </p>
        </div>
      </div>
    </PlusFrame>
  );
}

/** A one-shot burst of reactions when someone joins. */
function Burst() {
  const [pieces, setPieces] = useState<{ emoji: string; x: number; y: number; delay: number }[]>([]);
  useEffect(() => {
    if (reducedMotion()) return;
    setPieces(
      Array.from({ length: 18 }, (_, i) => {
        const angle = (i / 18) * Math.PI * 2;
        const dist = 90 + Math.random() * 80;
        return { emoji: REACTIONS[i % REACTIONS.length]!, x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, delay: Math.random() * 120 };
      })
    );
  }, []);
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/3 z-10" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute animate-burst text-xl"
          style={{ ["--bx" as string]: `${p.x}px`, ["--by" as string]: `${p.y}px`, animationDelay: `${p.delay}ms` }}
        >
          {p.emoji}
        </span>
      ))}
    </div>
  );
}

// ---------- marquee ----------

function Marquee() {
  const items = ["React live", "Catch the spike", "Become a founding curator", "Earn on Monad", "No seed phrase", "Web · iOS · Android"];
  const row = (hidden: boolean) => (
    <div className="flex shrink-0 items-center" aria-hidden={hidden}>
      {items.map((t) => (
        <span key={t} className="flex items-center gap-6 px-6 eyebrow text-label text-text-secondary">
          <span className="h-2 w-2 bg-lime" />
          {t}
        </span>
      ))}
    </div>
  );
  return (
    <div className="relative flex overflow-hidden border-b border-border bg-surface1 py-4">
      <div className="flex animate-marquee">
        {row(false)}
        {row(true)}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-surface1 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-surface1 to-transparent" />
    </div>
  );
}

// ---------- perks ----------

const PERKS: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <IconBolt size={20} />,
    title: "In on day one",
    body: "Waitlist scouts get the first invites the moment ENNOIA opens. First in means first to spot the spikes.",
  },
  {
    icon: <IconFingerprint size={20} />,
    title: "No crypto homework",
    body: "Sign in with a passkey. Your Monad account is created behind it. No seed phrase, no gas, no wallet to install.",
  },
  {
    icon: <IconSpark size={20} />,
    title: "Creators go live first",
    body: "Joining as a creator? We'll help you set up your first stream so your audience has something to react to on launch.",
  },
];

function Perks() {
  return (
    <section className="py-16">
      <div className="reveal flex flex-col items-center text-center">
        <TagChip>Why join early</TagChip>
        <h2 className="mt-5 max-w-xl text-h1 md:text-display">Early is the whole game.</h2>
      </div>
      <div className="mt-10 grid gap-px border border-border bg-border md:grid-cols-3">
        {PERKS.map((p, i) => (
          <div
            key={p.title}
            className="reveal group relative bg-night p-6 transition-colors duration-standard hover:bg-surface1"
            style={{ transitionDelay: `${i * 110}ms` }}
          >
            <span className="grid h-11 w-11 place-items-center border border-border bg-surface1 text-leaf transition-transform duration-standard group-hover:-translate-y-1 group-hover:shadow-glow">
              {p.icon}
            </span>
            <h3 className="mt-5 text-h3">{p.title}</h3>
            <p className="mt-2 font-mono text-bodysm leading-relaxed text-text-secondary">{p.body}</p>
            <span className="absolute bottom-0 left-0 h-0.5 w-0 bg-lime transition-all duration-expressive group-hover:w-full" />
          </div>
        ))}
      </div>
      <div className="mt-4">
        <SectionIndex index={1} total={2} label="Why join early" />
      </div>
    </section>
  );
}

// ---------- launch sequence ----------

function LaunchSequence() {
  const steps = [
    ["Join the waitlist", "Drop your email and pick how you'll use ENNOIA."],
    ["Share your link", "Bring friends. Spikes happen when a crowd reacts together."],
    ["Launch day", "Your invite lands in your inbox. Sign in with a passkey and start watching."],
    ["Catch your first Moment", "React early and become a Founding Curator, paid on Monad."],
  ];
  return (
    <section className="py-12">
      <div className="reveal flex flex-col items-center text-center">
        <TagChip>Launch sequence</TagChip>
        <h2 className="mt-5 text-h1 md:text-display">Join → Share → Launch.</h2>
      </div>
      <div className="mt-10 border-t border-border">
        {steps.map(([t, b], i) => (
          <div
            key={t}
            className="reveal group flex items-start gap-5 border-b border-border py-5 transition-colors duration-standard hover:bg-surface1"
            style={{ transitionDelay: `${i * 80}ms` }}
          >
            <span className="eyebrow w-8 pl-2 pt-1 text-micro text-leaf">{String(i + 1).padStart(2, "0")}</span>
            <div className="flex-1">
              <h3 className="text-bodylg font-semibold text-text">{t}</h3>
              <p className="mt-1 font-mono text-bodysm text-text-secondary">{b}</p>
            </div>
            <IconArrowRight size={18} className="mr-2 mt-1 text-text-muted transition-all duration-standard group-hover:translate-x-1 group-hover:text-leaf" />
          </div>
        ))}
      </div>
      <div className="mt-4">
        <SectionIndex index={2} total={2} label="Launch sequence" />
      </div>
    </section>
  );
}
