/**
 * Per-second reaction histogram ("most replayed"-style heatmap). Bars stack fire/laugh/wow;
 * the peak second is marked. Uses --color-4 for the peak (spec: graphs/spike line). Not a
 * financial chart — no axes. Accessible summary included.
 */
type Bucket = { second: number; fire: number; laugh: number; wow: number };

export function Histogram({ data, height = 64 }: { data: Bucket[]; height?: number }) {
  if (!data || data.length === 0) return null;
  const totals = data.map((b) => b.fire + b.laugh + b.wow);
  const max = Math.max(1, ...totals);
  const peakIdx = totals.indexOf(Math.max(...totals));
  const summary = `Reactions were most intense ${peakIdx} seconds into this Moment.`;

  return (
    <figure className="m-0" role="img" aria-label={summary}>
      <div className="flex items-end gap-[2px]" style={{ height }}>
        {data.map((b, i) => {
          const total = b.fire + b.laugh + b.wow;
          const h = (total / max) * 100;
          const isPeak = i === peakIdx && total > 0;
          return (
            <div key={i} className="flex-1 flex flex-col justify-end" style={{ height: "100%" }} title={`${b.second}s · ${total}`}>
              <div className="w-full flex flex-col-reverse" style={{ height: `${h}%` }}>
                <div style={{ height: `${pct(b.fire, total)}%`, background: "#FF6A3D" }} />
                <div style={{ height: `${pct(b.laugh, total)}%`, background: "#FFD84D" }} />
                <div style={{ height: `${pct(b.wow, total)}%`, background: "#4DA3FF" }} />
              </div>
              {isPeak && <div className="mx-auto mt-0.5 h-1 w-1" style={{ background: "#50C8FF" }} />}
            </div>
          );
        })}
      </div>
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
}

function pct(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0;
}
