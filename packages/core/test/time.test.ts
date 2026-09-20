import { describe, it, expect } from "vitest";
import {
  streamPositionSec,
  streamTimeMs,
  computeClockOffset,
  reconcileStreamTime,
} from "../src/index.js";

describe("stream clock", () => {
  it("loops playback position over the source duration", () => {
    const start = 0;
    expect(streamPositionSec(start, 60, 10_000)).toBe(10);
    expect(streamPositionSec(start, 60, 65_000)).toBe(5); // wrapped
  });

  it("streamTimeMs is monotonic and non-negative", () => {
    expect(streamTimeMs(1000, 5000)).toBe(4000);
    expect(streamTimeMs(5000, 1000)).toBe(0);
  });

  it("computeClockOffset cancels symmetric latency", () => {
    // client sent at 0, received at 200 (RTT 200), server stamped 1100 at midpoint
    const offset = computeClockOffset(0, 1100, 200);
    // server-at-receive ~ 1200, local 200 => offset ~1000
    expect(offset).toBe(1000);
  });

  it("reconcileStreamTime accepts close client values, snaps far ones", () => {
    const start = 0;
    const receive = 20_000; // authoritative streamTime = 20000
    expect(reconcileStreamTime(19_500, start, receive)).toBe(19_500); // within tolerance
    expect(reconcileStreamTime(5_000, start, receive)).toBe(20_000); // too far, snapped
    expect(reconcileStreamTime(-1, start, receive)).toBe(20_000); // invalid, snapped
  });
});
