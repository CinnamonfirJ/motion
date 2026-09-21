import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api, type MomentDTO } from "../lib/api";
import { Avatar, AvatarStack, Button, Skeleton, StatusRow, Pill } from "../components/ui";
import { ReactionGraph } from "../components/ReactionGraph";
import { ReactionMix } from "../components/MomentCard";
import { ClipPlayer, parseClip } from "../components/players";
import { Histogram } from "../components/Histogram";
import { SectionIndex } from "../components/scaffold";
import { IconArrowLeft } from "../components/icons";
import { shortAddr } from "../lib/format";

export function MomentDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const [moment, setMoment] = useState<MomentDTO | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => api.moment(id).then((r) => alive && setMoment(r.moment)).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id]);

  if (!moment) return <Skeleton className="h-[70vh] w-full" />;
  const clip = parseClip(moment.clip.url, moment.clip.durationSec);
  const s = moment.settlement;

  return (
    <div className="md:grid md:grid-cols-2 md:gap-8 pb-24 md:pb-0">
      <div>
        <button onClick={() => nav(-1)} className="mb-3 flex items-center gap-1.5 font-mono text-label uppercase tracking-[0.1em] text-text-secondary hover:text-text">
          <IconArrowLeft size={16} /> Back
        </button>
        <div className="relative aspect-[4/5] md:aspect-video overflow-hidden bg-black border border-border">
          {clip && moment.clip.ready ? (
            <ClipPlayer url={`${clip.base}#t=${clip.start},${clip.end}`} startSec={clip.start} endSec={clip.end} />
          ) : (
            <div className="absolute inset-0 skeleton animate-shimmer grid place-items-center text-text-muted">Building your Moment…</div>
          )}
        </div>
      </div>

      <div className="mt-5 md:mt-9 space-y-6">
        <div className="flex items-center gap-3">
          <Avatar name={moment.creator?.displayName ?? "?"} url={moment.creator?.avatarUrl} size={44} />
          <div className="min-w-0 flex-1">
            <p className="text-h3">{moment.creator?.displayName}</p>
            <p className="text-bodysm text-text-muted truncate">{moment.streamTitle}</p>
          </div>
          {moment.isLiveStream && <Pill tone="live">LIVE</Pill>}
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 border border-lime/40 bg-lime/10 px-2 py-1 font-mono text-micro uppercase tracking-[0.12em] text-leaf">
            🔥 Moment · {moment.metrics.category}
          </span>
          <span className="font-mono text-micro uppercase tracking-[0.1em] text-text-muted">{moment.views} views</span>
        </div>

        <section>
          <h3 className="eyebrow text-micro text-text-muted mb-2">Why this became a Moment</h3>
          <div className="border border-border bg-surface1 p-4">
            <ReactionGraph durationSec={moment.clip.durationSec} peakOffsetSec={moment.metrics.peakOffsetSec} total={moment.metrics.totalReactions} height={110} />
            <div className="mt-3 flex items-center justify-between">
              <ReactionMix mix={moment.metrics.mix} />
              <span className="text-bodysm text-text-secondary">{moment.metrics.totalReactions} reactions</span>
            </div>
          </div>
        </section>

        <section>
          <h3 className="eyebrow text-micro text-text-muted mb-2">Most replayed</h3>
          <div className="border border-border bg-surface1 p-4">
            <Histogram data={moment.metrics.histogram} height={72} />
            <p className="mt-2 font-mono text-micro text-text-muted">Reaction intensity per second across the clip.</p>
          </div>
        </section>

        <section>
          <h3 className="eyebrow text-micro text-text-muted mb-2">Founding curators</h3>
          <div className="flex items-center gap-3">
            <AvatarStack names={moment.foundingCurators.map((c) => c.displayName)} urls={moment.foundingCurators.map((c) => c.avatarUrl)} />
            <span className="text-body text-text-secondary">{moment.foundingCuratorCount} people found it first</span>
          </div>
        </section>

        {s && (
          <section className="border border-border bg-surface1 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-h3">{s.totalUsd}</p>
                <p className="font-mono text-micro uppercase tracking-[0.08em] text-text-muted">Total reward · {moment.statusLabel}</p>
              </div>
              <StatusRow status={s.status} />
            </div>
            <button onClick={() => setShowReceipt((v) => !v)} className="mt-3 font-mono text-label uppercase tracking-[0.1em] text-electric">
              {showReceipt ? "Hide" : "View"} onchain receipt
            </button>
            {showReceipt && (
              <div className="mt-3 space-y-1.5 bg-surface2 p-3 text-bodysm">
                <Row k="Network" v={s.network} />
                <Row k="Status" v={s.status === "confirmed" ? "Confirmed" : s.status} />
                <Row k="Transaction" v={s.txHash ? shortAddr(s.txHash) : "—"} />
                <Row k="Mode" v={s.onchain ? "Onchain" : "Simulation"} />
                {s.explorerUrl && (
                  <a href={s.explorerUrl} target="_blank" rel="noreferrer" className="block pt-1 text-electric">
                    Open in explorer →
                  </a>
                )}
              </div>
            )}
          </section>
        )}

        {moment.isLiveStream && (
          <Link to={`/live/${moment.streamId}`} className="block">
            <Button variant="primary" className="w-full">
              Join live
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between font-mono text-bodysm">
      <span className="text-text-muted">{k}</span>
      <span className="text-text-secondary tabular-nums">{v}</span>
    </div>
  );
}
