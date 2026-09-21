import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Card, Skeleton, EmptyState, StatusRow, Button } from "../components/ui";
import { ordinal } from "../lib/format";

export function Earnings() {
  const [mode, setMode] = useState<"scout" | "creator">("scout");
  const [scout, setScout] = useState<any>(null);
  const [creator, setCreator] = useState<any>(null);

  useEffect(() => {
    api.scoutEarnings().then(setScout).catch(() => setScout({ totalUsd: "$0.00", momentsCurated: 0, firstFinds: 0, rewards: [] }));
    api.creatorEarnings().then(setCreator).catch(() => setCreator({ totalUsd: "$0.00", momentsGenerated: 0, payouts: [] }));
  }, []);

  const data = mode === "scout" ? scout : creator;
  if (!data) return <Skeleton className="h-[60vh]" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-h1">Earnings</h1>
        {creator?.momentsGenerated > 0 && (
          <div className="flex border border-border">
            {(["scout", "creator"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`px-3 py-1.5 font-mono text-micro uppercase tracking-[0.1em] ${mode === m ? "bg-lime text-ink" : "bg-surface1 text-text-secondary"}`}>
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* hero balance (design §7.16) */}
      <div className="relative border border-border bg-surface1 p-6">
        <span className="plusmark -left-[6px] -top-[6px]" />
        <span className="plusmark -right-[6px] -top-[6px]" />
        <p className="text-display tabular-nums">{data.totalUsd}</p>
        <p className="eyebrow text-micro text-text-muted mt-1">{mode === "scout" ? "Total earned" : "Creator earnings"}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {mode === "scout" ? (
            <>
              <Stat label="Moments" value={scout.momentsCurated} />
              <Stat label="First finds" value={scout.firstFinds} />
            </>
          ) : (
            <>
              <Stat label="Moments generated" value={creator.momentsGenerated} />
              <Stat label="Founding curators" value={creator.payouts?.reduce((a: number, p: any) => a + p.foundingCuratorCount, 0) ?? 0} />
            </>
          )}
        </div>
      </div>

      <section>
        <h2 className="text-h3 mb-3">Recent rewards</h2>
        {mode === "scout" ? (
          scout.rewards.length === 0 ? (
            <EmptyState
              title="Your first find is still out there."
              body="React when something feels worth catching."
              action={
                <Link to="/">
                  <Button variant="primary">Find a live stream</Button>
                </Link>
              }
            />
          ) : (
            <div className="space-y-2">
              {scout.rewards.map((r: any) => (
                <RewardRow key={r.momentId} to={`/moments/${r.momentId}`} title={r.streamTitle} sub={`Founding Curator ${ordinal(r.rank)}`} amount={r.rewardUsd} status={r.status} />
              ))}
            </div>
          )
        ) : creator.payouts.length === 0 ? (
          <EmptyState title="Your next stream could change that." body="When your audience reacts together, Moment starts watching too." />
        ) : (
          <div className="space-y-2">
            {creator.payouts.map((p: any) => (
              <RewardRow key={p.momentId} to={`/moments/${p.momentId}`} title={p.streamTitle} sub={`${p.foundingCuratorCount} founding curators`} amount={p.rewardUsd} status={p.status} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-3">
      <p className="text-h3 tabular-nums">{value}</p>
      <p className="eyebrow text-micro text-text-muted mt-0.5">{label}</p>
    </Card>
  );
}

function RewardRow({ to, title, sub, amount, status }: { to: string; title: string; sub: string; amount: string; status: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 border border-border bg-surface1 p-3 hover:border-borderStrong transition-colors">
      <div className="grid h-11 w-11 place-items-center border border-border bg-surface2 text-leaf">
        <span className="h-2 w-2 bg-lime" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-body font-medium truncate">{title}</p>
        <p className="font-mono text-micro uppercase tracking-[0.08em] text-text-muted">{sub}</p>
      </div>
      <div className="text-right">
        <p className="text-body font-semibold text-leaf tabular-nums">{amount}</p>
        <StatusRow status={status} />
      </div>
    </Link>
  );
}
