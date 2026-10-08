import { useEffect, useState } from "react";
import { formatMon, getSigningState, lock, PER_TX_LIMIT, subscribeSigning, type SigningState } from "../lib/mera";

/** Live view of the Mera signing session; re-renders every second while one is open. */
export function useSigningState(): SigningState {
  const [state, setState] = useState(getSigningState);
  useEffect(() => subscribeSigning(setState), []);
  useEffect(() => {
    if (state.status !== "active") return;
    const t = setInterval(() => setState(getSigningState()), 1000);
    return () => clearInterval(t);
  }, [state.status]);
  return state;
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Compact pill: "Tips unlocked · 14:02" with a Lock action, or a locked hint. */
export function SigningBadge({ className = "" }: { className?: string }) {
  const state = useSigningState();
  const base = `inline-flex items-center gap-2 font-mono text-micro uppercase tracking-[0.1em] ${className}`;
  if (state.status !== "active") {
    return <span className={`${base} text-text-muted`} title="Your next tip asks for your passkey once, then tips are tap-only for 15 minutes.">🔒 Tips locked</span>;
  }
  return (
    <span className={`${base} text-leaf`} title={`Tap-only tips up to ${formatMon(PER_TX_LIMIT)} each, ${formatMon(state.remainingWei)} left this session.`}>
      ● Tips unlocked · {mmss(state.expiresAt - Date.now())}
      <button onClick={lock} className="text-text-muted underline hover:text-text">Lock</button>
    </span>
  );
}

/** Profile detail: what the session can do without asking. */
export function SigningDetails() {
  const state = useSigningState();
  return (
    <div className="space-y-1">
      <div className="flex justify-between">
        <span className="text-text-muted">Signing</span>
        <SigningBadge />
      </div>
      {state.status === "active" && (
        <div className="flex justify-between">
          <span className="text-text-muted">Budget left</span>
          <span className="text-text-secondary tabular-nums">{formatMon(state.remainingWei)}</span>
        </div>
      )}
      <p className="text-micro text-text-muted pt-1">
        One passkey tap unlocks tap-only tips (up to {formatMon(PER_TX_LIMIT)} each) for 15 minutes. Anything else asks
        for your passkey again.
      </p>
    </div>
  );
}
