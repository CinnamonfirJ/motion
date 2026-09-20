import { useEffect, useState } from "react";
import { api, type MomentDTO } from "../lib/api";
import { MomentCard } from "../components/MomentCard";
import { Skeleton, EmptyState } from "../components/ui";

const FILTERS = ["Recent", "Live now", "For you"] as const;

export function Moments() {
  const [moments, setMoments] = useState<MomentDTO[] | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("Recent");

  useEffect(() => {
    let alive = true;
    const load = () => api.moments().then((r) => alive && setMoments(r.moments)).catch(() => alive && setMoments([]));
    load();
    const id = setInterval(load, 6000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const shown = (moments ?? []).filter((m) => (filter === "Live now" ? m.isLiveStream : true));

  return (
    <div className="space-y-5">
      <h1 className="text-h1">Moments</h1>
      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`border px-3.5 py-1.5 font-mono text-micro uppercase tracking-[0.1em] transition-colors ${
              filter === f ? "border-lime bg-lime text-night" : "border-border bg-surface1 text-text-secondary hover:text-text"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {!moments ? (
        <div className="grid gap-5 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[420px]" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState title="Nothing has spiked yet." body="When the crowd catches something, it'll appear here." />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {shown.map((m) => (
            <MomentCard key={m.id} moment={m} />
          ))}
        </div>
      )}
    </div>
  );
}
