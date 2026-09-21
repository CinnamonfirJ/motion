import { useState, useEffect } from "react";
import { useSession } from "../state/session";
import { Button, Avatar } from "../components/ui";
import { ReactionGraph } from "../components/ReactionGraph";
import { PlusFrame, PlusMark, PlusRule, SectionIndex, TagChip, Hatch, Accordion } from "../components/scaffold";
import { IconArrowRight, IconCheck, IconSpark, IconFingerprint } from "../components/icons";
import { ThemeToggle } from "../components/ThemeToggle";
import { isPasskeySupported } from "../lib/passkey";

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-7 w-7 place-items-center bg-brand text-white font-bold">M</span>
      <span className="text-h3 font-bold tracking-tight">Moment</span>
    </div>
  );
}

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

export function SignIn() {
  return (
    <div className="min-h-screen bg-night">
      {/* NAV */}
      <header className="sticky top-0 z-40 border-b border-border bg-night/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-4 py-3 md:px-8">
          <Logo />
          <nav className="hidden items-center gap-8 font-mono text-label uppercase tracking-[0.12em] text-text-secondary md:flex">
            <button onClick={() => scrollTo("why")} className="hover:text-text">Why</button>
            <button onClick={() => scrollTo("features")} className="hover:text-text">Features</button>
            <button onClick={() => scrollTo("faq")} className="hover:text-text">FAQ</button>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="secondary" className="!min-h-[40px]" onClick={() => scrollTo("start")}>
              Sign in
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-4 md:px-8">
        <Hero />
        <MockupBand />
        <Stats />
        <Features />
        <HowItWorks />
        <Faq />
        <StartSection />
      </main>
      <Footer />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative py-16 md:py-24">
      <PlusMark className="-left-[6px] top-0 md:-left-2" />
      <PlusMark className="-right-[6px] top-0 md:-right-2" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 opacity-30">
        <ReactionGraph durationSec={35} peakOffsetSec={23} total={900} height={200} />
      </div>
      <div className="relative flex flex-col items-center text-center">
        <TagChip>Live curation on Monad</TagChip>
        <h1 className="mt-6 max-w-3xl text-h1 md:text-displayxl">Spot the moment first.</h1>
        <p className="mt-5 max-w-xl font-mono text-body text-text-secondary md:text-bodylg">
          Watch live streams, react as it happens, and earn when the crowd catches what you caught first. No seed
          phrase, no gas — the blockchain stays out of your way.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button variant="primary" onClick={() => scrollTo("start")}>
            Start watching
          </Button>
          <Button variant="secondary" onClick={() => scrollTo("features")}>
            How it works
          </Button>
        </div>
      </div>
    </section>
  );
}

/** Phone mockup band — placeholders left for real app screenshots. */
function MockupBand() {
  return (
    <PlusFrame className="dotgrid overflow-hidden">
      <div className="flex items-end justify-center gap-4 px-4 py-10 md:gap-8 md:py-16">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`relative w-[30%] max-w-[240px] shrink-0 border border-border bg-surface1 ${i === 1 ? "translate-y-0" : "translate-y-6 opacity-80"}`}
            style={{ aspectRatio: "9/19" }}
          >
            <div className="absolute left-1/2 top-2 h-1.5 w-16 -translate-x-1/2 rounded-full bg-surface3" />
            <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
              <IconSpark size={22} className="text-text-muted" />
              <span className="font-mono text-micro uppercase tracking-[0.14em] text-text-muted">
                App preview
              </span>
              <span className="font-mono text-micro text-text-disabled">
                {["Live stream", "Moment detected", "Founding curator"][i]}
              </span>
            </div>
          </div>
        ))}
      </div>
    </PlusFrame>
  );
}

const STATS = [
  { big: "35s", label: "Clip length", body: "15s before + 20s after every spike." },
  { big: "3", label: "Reactions", body: "Fire, laugh, wow — that's the whole vocabulary." },
  { big: "<1s", label: "Detection", body: "Spikes surface the instant the crowd moves." },
  { big: "100%", label: "Onchain", body: "Rewards settle on Monad, verifiably." },
];

function Stats() {
  return (
    <section id="why" className="py-12">
      <div className="grid grid-cols-2 md:grid-cols-4">
        {STATS.map((s, i) => (
          <div key={s.label} className={`relative px-4 py-6 ${i % 2 === 0 ? "border-r border-border" : ""} ${i < 2 ? "border-b md:border-b-0" : ""} md:border-r md:last:border-r-0`}>
            <div className="text-display">{s.big}</div>
            <div className="mt-2 eyebrow text-micro text-leaf">{s.label}</div>
            <p className="mt-2 font-mono text-bodysm text-text-secondary">{s.body}</p>
          </div>
        ))}
      </div>
      <Hatch className="h-8" />
      <div className="mt-4">
        <SectionIndex index={1} label="Why Moment" />
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="py-12">
      <div className="flex flex-col items-center text-center">
        <TagChip>What you can do</TagChip>
        <h2 className="mt-5 max-w-lg text-h1 md:text-display">Being early, finally counts.</h2>
      </div>
      <div className="mt-10 grid gap-px border border-border bg-border md:grid-cols-3">
        <FeatureCol
          title="React live"
          body="Tap fire, laugh or wow as it happens. Your reactions are timestamped against one authoritative stream clock."
        >
          <div className="flex items-center justify-center gap-4 py-2">
            {["🔥", "😂", "😮"].map((e) => (
              <span key={e} className="grid h-12 w-12 place-items-center border border-border bg-surface2 text-2xl">
                {e}
              </span>
            ))}
          </div>
        </FeatureCol>
        <FeatureCol
          title="Catch the spike"
          body="When reactions accelerate past the crowd's baseline, a Moment is detected and a 35-second clip is captured."
        >
          <ReactionGraph durationSec={35} peakOffsetSec={22} total={600} height={64} />
        </FeatureCol>
        <FeatureCol
          title="Earn as a curator"
          body="The earliest qualifying scouts become Founding Curators and share the reward, settled on Monad."
        >
          <div className="flex items-center gap-3 py-3">
            <div className="flex -space-x-2">
              {["Nova", "Rune", "Iris"].map((n) => (
                <div key={n} className="ring-2 ring-surface1">
                  <Avatar name={n} size={28} />
                </div>
              ))}
            </div>
            <span className="font-mono text-bodysm text-leaf">+$1.00 · #1</span>
          </div>
        </FeatureCol>
      </div>
      <div className="mt-4">
        <SectionIndex index={2} label="Main features" />
      </div>
    </section>
  );
}

function FeatureCol({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="bg-night p-6">
      <div className="mb-5 border border-border bg-surface1 p-4">{children}</div>
      <h3 className="text-h3">{title}</h3>
      <p className="mt-2 font-mono text-bodysm text-text-secondary leading-relaxed">{body}</p>
    </div>
  );
}

const STEPS = [
  ["Sign in", "Email or Google. An embedded wallet is created silently — no seed phrase."],
  ["Watch live", "Open a stream. Playback is synced to the server's authoritative clock."],
  ["React", "Fire, laugh, wow. Every reaction is a timestamped curation signal."],
  ["Get detected", "When the crowd spikes, MOMENT DETECTED — and a 35s clip is built."],
  ["Earn onchain", "Early enough? You're a Founding Curator, paid on Monad."],
];

function HowItWorks() {
  return (
    <section className="py-12">
      <div className="flex flex-col items-center text-center">
        <TagChip>The loop</TagChip>
        <h2 className="mt-5 text-h1 md:text-display">Watch → React → Earn.</h2>
      </div>
      <div className="mt-10 border-t border-border">
        {STEPS.map(([t, b], i) => (
          <div key={t} className="flex items-start gap-5 border-b border-border py-5">
            <span className="eyebrow text-micro text-leaf w-8 pt-1">{String(i + 1).padStart(2, "0")}</span>
            <div className="flex-1">
              <h3 className="text-bodylg font-semibold text-text">{t}</h3>
              <p className="mt-1 font-mono text-bodysm text-text-secondary">{b}</p>
            </div>
            <IconArrowRight size={18} className="mt-1 text-text-muted" />
          </div>
        ))}
      </div>
      <div className="mt-4">
        <SectionIndex index={3} label="How it works" />
      </div>
    </section>
  );
}

const FAQ_ITEMS = [
  { q: "Do I need to know anything about crypto?", a: "No. You sign in with a passkey — Face ID, Windows Hello or your fingerprint — and your passkey creates an account on Monad. Your balance shows in plain dollars. No seed phrase, no wallet to install, no gas to buy." },
  { q: "How do I earn?", a: "React early to streams. When enough people react to the same moment, the earliest qualifying scouts become Founding Curators and share the reward for that Moment." },
  { q: "What is a Moment?", a: "A 35-second clip — 15 seconds before a reaction spike and 20 seconds after — automatically captured when the crowd's reactions accelerate past the stream's normal rhythm." },
  { q: "Where does the reward come from?", a: "A pre-funded reward pool on Monad. Each confirmed Moment splits its reward between the creator and the Founding Curators, settled in a real onchain transaction." },
  { q: "Is it the same on my phone and laptop?", a: "Yes. One account and one embedded wallet follow you across web, iOS and Android — same Moments, same curator rank, same earnings." },
];

function Faq() {
  return (
    <section id="faq" className="py-12 md:grid md:grid-cols-[0.8fr_1.2fr] md:gap-12">
      <div className="mb-6 md:mb-0">
        <TagChip>Questions</TagChip>
        <h2 className="mt-5 text-h1">Got questions? Clear answers.</h2>
      </div>
      <div>
        <Accordion items={FAQ_ITEMS} />
        <div className="mt-6">
          <SectionIndex index={4} label="FAQ" />
        </div>
      </div>
    </section>
  );
}

/** The actual auth — passkey-first (biometric), a full section, not a lone input. */
function StartSection() {
  const { login, signInPasskey, createPasskey } = useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [showEmail, setShowEmail] = useState(false);
  const [passkeys, setPasskeys] = useState(true);
  const [busy, setBusy] = useState<null | "signin" | "create" | "email">(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    isPasskeySupported().then(setPasskeys);
  }, []);

  const run = async (kind: "signin" | "create" | "email", fn: () => Promise<void>, cancelMsg: string) => {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (/no-passkey-account/.test(msg)) setError("No passkey on this device yet — create one below.");
      else if (/cancel|NotAllowed/i.test(msg)) setError(cancelMsg);
      else setError("Couldn't sign you in. Try again in a moment.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section id="start" className="py-16">
      <PlusFrame className="dotgrid">
        <div className="grid gap-8 p-8 md:grid-cols-2 md:p-12">
          <div className="flex flex-col justify-center">
            <TagChip className="self-start">Start free</TagChip>
            <h2 className="mt-5 text-h1 md:text-display">Your first find is out there.</h2>
            <p className="mt-4 max-w-sm font-mono text-body text-text-secondary">
              Your passkey creates an account on Monad. No seed phrase. Unlock with Face ID, Windows Hello or your
              fingerprint — the crypto stays out of the way.
            </p>
            <ul className="mt-6 space-y-3">
              {["Sign in with your device biometric", "Monad account created behind your passkey", "No seed phrase, no wallet to install"].map((t) => (
                <li key={t} className="flex items-center gap-3 border-b border-border pb-3 font-mono text-bodysm text-text-secondary">
                  <IconCheck size={16} className="text-leaf" />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col justify-center gap-3 border border-border bg-surface1 p-6">
            <div className="eyebrow text-micro text-text-muted">Sign in</div>

            {passkeys ? (
              <>
                <Button variant="primary" className="w-full" onClick={() => run("signin", signInPasskey, "Sign-in cancelled.")} disabled={busy !== null}>
                  {busy === "signin" ? "Waiting for passkey…" : "Sign in with passkey"} <IconFingerprint size={16} />
                </Button>
                <input
                  type="text"
                  placeholder="Display name (for a new account)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-label="Display name"
                  className="w-full border border-border bg-surface2 px-4 py-3 font-mono text-body text-text placeholder:text-text-muted"
                />
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => run("create", () => createPasskey(name.trim() || "Scout"), "Passkey creation cancelled.")}
                  disabled={busy !== null}
                >
                  {busy === "create" ? "Creating passkey…" : "Create a passkey"}
                </Button>
              </>
            ) : (
              <p className="font-mono text-bodysm text-text-secondary">
                This device doesn't support passkeys — use email below.
              </p>
            )}

            <button onClick={() => setShowEmail((v) => !v)} className="self-start font-mono text-micro uppercase tracking-[0.12em] text-text-muted hover:text-text">
              {showEmail ? "Hide email" : "Use email instead"}
            </button>
            {showEmail && (
              <div className="flex flex-col gap-2">
                <input
                  type="email"
                  inputMode="email"
                  placeholder="you@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-label="Email address"
                  className="w-full border border-border bg-surface2 px-4 py-3 font-mono text-body text-text placeholder:text-text-muted"
                />
                <Button variant="secondary" className="w-full" onClick={() => run("email", () => login(email.trim()), "")} disabled={busy !== null || !email.trim()}>
                  {busy === "email" ? "Signing in…" : "Continue with email"}
                </Button>
              </div>
            )}

            {error && <p className="font-mono text-bodysm text-error">{error}</p>}
            <p className="font-mono text-micro text-text-muted">Your passkey creates an account on Monad. No seed phrase.</p>
          </div>
        </div>
      </PlusFrame>
    </section>
  );
}

function Footer() {
  const cols = [
    ["Product", ["Why Moment", "Features", "FAQ"]],
    ["Company", ["About", "Blog", "Contact"]],
    ["Legal", ["Privacy", "Terms", "Support"]],
  ] as const;
  return (
    <footer className="mt-8 border-t border-lime/40">
      <Hatch className="h-6" />
      <div className="mx-auto max-w-[1200px] px-4 md:px-8">
        <div className="grid border-x border-b border-border md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="border-b border-border p-6 md:border-b-0 md:border-r">
            <Logo />
            <p className="mt-4 max-w-xs font-mono text-bodysm text-text-secondary">
              Spot the livestream moment before everyone else — and get paid for being early.
            </p>
          </div>
          {cols.map(([title, links]) => (
            <div key={title} className="border-b border-border md:border-b-0 md:border-r md:last:border-r-0">
              <div className="eyebrow border-b border-border p-4 text-micro text-text-muted">{title}</div>
              {links.map((l) => (
                <div key={l} className="border-b border-border p-4 font-mono text-bodysm text-text-secondary last:border-b-0">
                  {l}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="flex flex-col items-center justify-between gap-2 px-1 py-6 font-mono text-micro uppercase tracking-[0.12em] text-text-muted md:flex-row">
          <span>© 2026 Moment. All rights reserved.</span>
          <span>Moment · Built on Monad</span>
        </div>
      </div>
    </footer>
  );
}
