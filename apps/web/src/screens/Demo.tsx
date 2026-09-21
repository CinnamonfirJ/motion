import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type StreamDTO } from "../lib/api";
import { Button, Card } from "../components/ui";
import { TagChip, SectionIndex } from "../components/scaffold";

/**
 * Hidden demo panel (/demo) — NOT in normal navigation. It simulates INPUTS into the real
 * pipeline (never fakes settlement). Every simulated participant is labelled "Demo crowd".
 */
export function Demo() {
  const [streams, setStreams] = useState<StreamDTO[]>([]);
  const [streamId, setStreamId] = useState<string>("");
  const [crowd, setCrowd] = useState<{ id: string; displayName: string }[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [loopFallback, setLoopFallback] = useState(false);

  useEffect(() => {
    api.streams().then((r) => {
      setStreams(r.streams);
      if (r.streams[0]) setStreamId(r.streams[0].id);
    });
    api.demo.crowd().then((r) => setCrowd(r.crowd));
  }, []);

  const line = (s: string) => setLog((l) => [`${new Date().toLocaleTimeString()} · ${s}`, ...l].slice(0, 8));

  return (
    <div className="min-h-screen bg-night text-text">
      <div className="mx-auto max-w-[760px] px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center bg-brand text-white font-bold">M</span>
            <h1 className="text-h2">Demo panel</h1>
          </div>
          <Link to="/" className="font-mono text-label uppercase tracking-[0.1em] text-text-secondary hover:text-text">
            ← Back to app
          </Link>
        </div>

        <TagChip>Simulate inputs · never fake settlement</TagChip>

        <Card className="p-4 space-y-3">
          <label className="eyebrow text-micro text-text-muted">Stream</label>
          <select
            value={streamId}
            onChange={(e) => setStreamId(e.target.value)}
            className="w-full border border-border bg-surface2 px-3 py-2 font-mono text-body text-text"
          >
            {streams.map((s) => (
              <option key={s.id} value={s.id}>
                {s.creator?.displayName} — {s.title}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button
              variant="primary"
              onClick={async () => {
                const r = await api.demo.forceSpike(streamId);
                line(`Force spike → ${r.reactionsSent} demo-crowd reactions into the real engine`);
              }}
            >
              Force spike
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                const r = await api.demo.fastForward(streamId);
                line(`Fast-forward → ${r.settled} Moment(s) sent to real settlement`);
              }}
            >
              Fast-forward settle
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                await api.demo.reset(streamId);
                line("Reset stream spike scheduler");
              }}
            >
              Reset
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setLoopFallback((v) => !v);
                line(`Fallback demo video loop ${!loopFallback ? "on" : "off"}`);
              }}
            >
              {loopFallback ? "Fallback: on" : "Loop fallback video"}
            </Button>
          </div>
        </Card>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-h3">Demo crowd</h2>
            <SectionIndex index={6} label="Demo" />
          </div>
          <Card className="p-4">
            <p className="mb-3 font-mono text-bodysm text-text-secondary">
              {crowd.length} simulated viewers · always labelled <span className="text-leaf">Demo crowd</span>, never disguised as real users.
            </p>
            <div className="flex flex-wrap gap-2">
              {crowd.map((c) => (
                <span key={c.id} className="border border-border bg-surface2 px-2 py-1 font-mono text-micro text-text-secondary">
                  {c.displayName} · demo
                </span>
              ))}
            </div>
          </Card>
        </div>

        <div>
          <h2 className="text-h3 mb-2">Activity log</h2>
          <Card className="p-4 font-mono text-bodysm text-text-secondary space-y-1 min-h-[80px]">
            {log.length === 0 ? <p className="text-text-muted">Run a control above…</p> : log.map((l, i) => <p key={i}>{l}</p>)}
          </Card>
        </div>
      </div>
    </div>
  );
}
