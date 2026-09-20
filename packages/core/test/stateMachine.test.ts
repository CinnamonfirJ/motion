import { describe, it, expect } from "vitest";
import { canTransition, assertTransition, isTerminal, isPublic } from "../src/index.js";

describe("Moment state machine", () => {
  it("allows the canonical happy path", () => {
    const path = [
      ["NORMAL", "CANDIDATE"],
      ["CANDIDATE", "DETECTING"],
      ["DETECTING", "CONFIRMED"],
      ["CONFIRMED", "CLIPPING"],
      ["CLIPPING", "SETTLING"],
      ["SETTLING", "PUBLISHED"],
      ["PUBLISHED", "SETTLED"],
    ] as const;
    for (const [from, to] of path) expect(canTransition(from, to)).toBe(true);
  });

  it("rejects skipping confirmation before settlement", () => {
    expect(canTransition("DETECTING", "SETTLING")).toBe(false);
    expect(() => assertTransition("CANDIDATE", "SETTLED")).toThrow();
  });

  it("allows clip + settlement self-retry loops", () => {
    expect(canTransition("CLIPPING", "CLIPPING")).toBe(true);
    expect(canTransition("SETTLING", "SETTLING")).toBe(true);
  });

  it("marks terminal states", () => {
    expect(isTerminal("SETTLED")).toBe(true);
    expect(isTerminal("EXPIRED")).toBe(true);
    expect(isTerminal("SETTLING")).toBe(false);
  });

  it("only publishes public states in the feed", () => {
    expect(isPublic("PUBLISHED")).toBe(true);
    expect(isPublic("SETTLED")).toBe(true);
    expect(isPublic("DETECTING")).toBe(false);
  });

  it("candidate can expire when confirmation fails", () => {
    expect(canTransition("DETECTING", "EXPIRED")).toBe(true);
  });
});
