import { Link } from "react-router-dom";
import type { MomentDTO } from "../lib/api";
import { Avatar, Pill, LivePill } from "./ui";
import { ReactionGraph } from "./ReactionGraph";
import { parseClip, ClipPlayer } from "./players";
import { timeAgo } from "../lib/format";

const REACTION_ICON = { fire: "🔥", laugh: "😂", wow: "😮" } as const;

export function ReactionMix({ mix }: { mix: { fire: number; laugh: number; wow: number } }) {
  const total = mix.fire + mix.laugh + mix.wow || 1;
  const items: [keyof typeof REACTION_ICON, number, string][] = [
    ["fire", mix.fire, "#FF6A3D"],
    ["laugh", mix.laugh, "#FFD84D"],
    ["wow", mix.wow, "#4DA3FF"],
  ];
  return (
    <div className="flex items-center gap-3">
      {items.map(([k, v, color]) => (
        <span key={k} className="inline-flex items-center gap-1 text-bodysm text-text-secondary">
          <span aria-hidden>{REACTION_ICON[k]}</span>
          <span className="tabular-nums" style={{ color }}>
            {Math.round((v / total) * 100)}%
          </span>
        </span>
      ))}
    </div>
  );
}

export function MomentCard({ moment }: { moment: MomentDTO }) {
  const clip = parseClip(moment.clip.url, moment.clip.durationSec);
  return (
    <Link
      to={`/moments/${moment.id}`}
      className="block border border-border bg-surface1 overflow-hidden hover:border-borderStrong transition-colors duration-standard"
    >
      <div className="relative aspect-[4/5] bg-black">
        {clip && moment.clip.ready ? (
          <ClipPlayer url={`${clip.base}#t=${clip.start},${clip.end}`} startSec={clip.start} endSec={clip.end} />
        ) : (
          <div className="absolute inset-0 skeleton animate-shimmer flex items-center justify-center text-text-muted text-bodysm">
            Building your Moment…
          </div>
        )}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
          <span className="inline-flex items-center gap-2 rounded-full bg-black/45 backdrop-blur px-2.5 py-1">
            <Avatar name={moment.creator?.displayName ?? "Creator"} url={moment.creator?.avatarUrl} size={22} />
            <span className="text-label text-white">{moment.creator?.displayName}</span>
          </span>
          {moment.isLiveStream && <LivePill />}
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
          <p className="text-body font-semibold text-white line-clamp-1">{moment.streamTitle}</p>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <ReactionGraph
          durationSec={moment.clip.durationSec}
          peakOffsetSec={moment.metrics.peakOffsetSec}
          total={moment.metrics.totalReactions}
          height={72}
        />
        <div className="flex items-center justify-between">
          <ReactionMix mix={moment.metrics.mix} />
          <span className="text-micro text-text-muted">{timeAgo(moment.confirmedAt)}</span>
        </div>
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2 font-mono text-micro uppercase tracking-[0.08em] text-text-secondary">
            <span>{moment.metrics.totalReactions} reactions</span>
            <span aria-hidden>·</span>
            <span>{moment.foundingCuratorCount} founding</span>
          </div>
          {moment.isLiveStream ? (
            <span className="font-mono text-label uppercase tracking-[0.1em] text-leaf">Join live →</span>
          ) : (
            <Pill>Moment</Pill>
          )}
        </div>
      </div>
    </Link>
  );
}
