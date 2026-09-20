import { useEffect, useRef } from "react";

/**
 * Live player: playback position derives from the authoritative stream clock, not the
 * client's own clock (PRD §8/§40). We seek to `positionSec` on mount and periodically
 * correct drift. Muted+playsInline so autoplay works across browsers.
 */
export function LivePlayer({
  src,
  getPositionSec,
  muted,
  onToggleMute,
}: {
  src: string;
  getPositionSec: () => number;
  muted: boolean;
  onToggleMute: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const seek = () => {
      const pos = getPositionSec();
      if (isFinite(pos) && Math.abs(v.currentTime - pos) > 1.5) v.currentTime = pos;
    };
    const onMeta = () => {
      seek();
      v.play().catch(() => {});
    };
    v.addEventListener("loadedmetadata", onMeta);
    // Correct drift every 5s + on tab refocus (background resume — PRD §35).
    const id = setInterval(seek, 5000);
    const onVis = () => document.visibilityState === "visible" && seek();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      v.removeEventListener("loadedmetadata", onMeta);
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [src]);

  return (
    <div className="relative h-full w-full bg-black">
      <video ref={ref} src={src} muted={muted} playsInline loop className="h-full w-full object-cover" />
      <button
        onClick={onToggleMute}
        aria-label={muted ? "Unmute" : "Mute"}
        className="absolute bottom-3 right-3 h-11 w-11 rounded-full bg-black/50 backdrop-blur text-text flex items-center justify-center"
      >
        {muted ? "🔇" : "🔊"}
      </button>
    </div>
  );
}

/** Clip player: plays a [start,end] media-fragment range and loops within it. */
export function ClipPlayer({ url, startSec, endSec }: { url: string; startSec: number; endSec: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const clamp = () => {
      if (v.currentTime < startSec || v.currentTime > endSec) v.currentTime = startSec;
    };
    const onMeta = () => {
      v.currentTime = startSec;
      v.play().catch(() => {});
    };
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("timeupdate", clamp);
    return () => {
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("timeupdate", clamp);
    };
  }, [url, startSec, endSec]);
  return <video ref={ref} src={url} muted playsInline loop controls={false} className="h-full w-full object-cover" />;
}

/** Parse "url#t=start,end" into base + range. */
export function parseClip(url: string | null, fallbackDur = 35): { base: string; start: number; end: number } | null {
  if (!url) return null;
  const [base, frag] = url.split("#t=");
  if (!frag) return { base: url, start: 0, end: fallbackDur };
  const [s, e] = frag.split(",").map(Number);
  return { base, start: s || 0, end: e || (s || 0) + fallbackDur };
}
