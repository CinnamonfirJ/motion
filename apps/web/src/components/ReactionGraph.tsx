import { useMemo, useId } from "react";

/**
 * Reaction spike graph (design §7.13). Softly rounded line, transparent fill, one peak
 * marker labelled "Moment", no axes, no candlesticks. Communicates the spike without color
 * alone (peak marker + accessible summary — design §34).
 */
export function ReactionGraph({
  durationSec,
  peakOffsetSec,
  total,
  height = 96,
  live = false,
  intensity = 1,
}: {
  durationSec: number;
  peakOffsetSec: number;
  total: number;
  height?: number;
  live?: boolean;
  intensity?: number;
}) {
  const gid = useId();
  const W = 320;
  const H = height;
  const N = 48;

  const { linePath, areaPath, peakX, peakY } = useMemo(() => {
    const dur = Math.max(1, durationSec);
    const peakT = Math.min(dur, Math.max(0, peakOffsetSec));
    const sigma = dur / 7;
    const vals: number[] = [];
    for (let i = 0; i < N; i++) {
      const t = (i / (N - 1)) * dur;
      const bump = Math.exp(-((t - peakT) ** 2) / (2 * sigma * sigma));
      const baseline = 0.12 + 0.06 * Math.sin(i * 0.7);
      vals.push(baseline + bump * intensity);
    }
    const max = Math.max(...vals) || 1;
    const pad = 6;
    const pts = vals.map((v, i) => {
      const x = pad + (i / (N - 1)) * (W - pad * 2);
      const y = H - pad - (v / max) * (H - pad * 2);
      return [x, y] as const;
    });
    // Smooth path via simple Catmull-Rom-ish midpoints.
    let d = `M ${pts[0]![0]},${pts[0]![1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1]!;
      const [x1, y1] = pts[i]!;
      const mx = (x0 + x1) / 2;
      d += ` Q ${x0},${y0} ${mx},${(y0 + y1) / 2}`;
    }
    const peakIdx = Math.round((peakT / dur) * (N - 1));
    const [px, py] = pts[Math.min(N - 1, Math.max(0, peakIdx))]!;
    const area = `${d} L ${W - pad},${H} L ${pad},${H} Z`;
    return { linePath: d, areaPath: area, peakX: px, peakY: py };
  }, [durationSec, peakOffsetSec, intensity]);

  const summary = `Reaction activity peaked ${Math.round(peakOffsetSec)} seconds into this Moment, from ${total} reactions.`;

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={summary} preserveAspectRatio="none">
        <defs>
          <linearGradient id={`fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={live ? "#258BFF" : "#A7F46A"} stopOpacity="0.28" />
            <stop offset="100%" stopColor={live ? "#258BFF" : "#A7F46A"} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`line-${gid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#77777F" />
            <stop offset="55%" stopColor={live ? "#4DA3FF" : "#A7F46A"} />
            <stop offset="100%" stopColor={live ? "#258BFF" : "#A7F46A"} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#fill-${gid})`} />
        <path d={linePath} fill="none" stroke={`url(#line-${gid})`} strokeWidth={2.5} strokeLinecap="round" />
        <circle cx={peakX} cy={peakY} r={4.5} fill={live ? "#4DA3FF" : "#A7F46A"} />
        <circle cx={peakX} cy={peakY} r={9} fill="none" stroke={live ? "#4DA3FF" : "#A7F46A"} strokeOpacity="0.4" />
      </svg>
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
}
