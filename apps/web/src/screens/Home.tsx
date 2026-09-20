import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type StreamDTO, type MomentDTO } from "../lib/api";
import { Avatar, LivePill, Skeleton, EmptyState, Pill } from "../components/ui";
import { MomentCard } from "../components/MomentCard";
import { SectionIndex, TagChip } from "../components/scaffold";

function StreamCard({ s }: { s: StreamDTO }) {
  return (
    <Link to={`/live/${s.id}`} className="block w-[260px] shrink-0 border border-border bg-surface1 overflow-hidden hover:border-borderStrong transition-colors">
      <div className="relative aspect-video bg-black">
        {s.thumbnailUrl && <img src={s.thumbnailUrl} alt="" className="h-full w-full object-cover opacity-90" />}
        <div className="absolute top-2 left-2 right-2 flex justify-between">
          <LivePill count={s.viewerCount} />
          {s.viewerCount > 2 && <Pill tone="lime">Heating up</Pill>}
        </div>
      </div>
      <div className="p-3">
        <div className="flex items-center gap-2">
          <Avatar name={s.creator?.displayName ?? "?"} url={s.creator?.avatarUrl} size={28} />
          <div className="min-w-0">
            <p className="text-bodysm font-semibold truncate">{s.creator?.displayName}</p>
            <p className="text-micro text-text-muted truncate">{s.title}</p>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function Home() {
  const [streams, setStreams] = useState<StreamDTO[] | null>(null);
  const [moments, setMoments] = useState<MomentDTO[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      api.streams().then((r) => alive && setStreams(r.streams)).catch(() => alive && setStreams([]));
      api.moments().then((r) => alive && setMoments(r.moments)).catch(() => alive && setMoments([]));
    };
    load();
    const id = setInterval(load, 6000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="space-y-10">
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-h2">Live now</h2>
            <LivePill />
          </div>
          <SectionIndex index={1} label="Streams" />
        </div>
        {!streams ? (
          <div className="flex gap-4 overflow-hidden">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[200px] w-[260px] shrink-0" />
            ))}
          </div>
        ) : streams.length === 0 ? (
          <EmptyState title="Quiet right now." body="Fresh Moments are still waiting below." />
        ) : (
          <div className="flex gap-4 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 pb-1">
            {streams.map((s) => (
              <StreamCard key={s.id} s={s} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-h2">Moments happening now</h2>
          <SectionIndex index={2} label="Feed" />
        </div>
        {!moments ? (
          <div className="grid gap-5">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-[420px] w-full" />
            ))}
          </div>
        ) : moments.length === 0 ? (
          <EmptyState title="Nothing has spiked yet." body="When the crowd catches something, it'll appear here." />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {moments.map((m) => (
              <MomentCard key={m.id} moment={m} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
