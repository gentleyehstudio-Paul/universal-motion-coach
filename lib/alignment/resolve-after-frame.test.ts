import { describe, expect, it } from "vitest";
import { resolveAfterFrame } from "./resolve-after-frame";
import type { AlignmentMap } from "./types";

function makeAlignment(frameMap: Record<number, number>): AlignmentMap {
  return {
    beforeSequenceId: "before",
    afterSequenceId: "after",
    frameMap,
    phaseAlignment: [],
    method: "dtw_windowed_phase_seeded",
    params: { sakoeChibaRadius: 5, featureSpace: "joint_angles" },
  };
}

describe("resolveAfterFrame", () => {
  it("returns the direct mapping when present", () => {
    const alignment = makeAlignment({ 0: 0, 5: 3, 10: 7 });
    expect(resolveAfterFrame(alignment, 5)).toBe(3);
  });

  it("falls back to the nearest mapped before-frame when missing", () => {
    const alignment = makeAlignment({ 0: 0, 10: 7, 20: 14 });
    // 12 is closer to 10 than to 20
    expect(resolveAfterFrame(alignment, 12)).toBe(7);
    // 17 is closer to 20 than to 10
    expect(resolveAfterFrame(alignment, 17)).toBe(14);
  });

  it("returns null when the alignment map is empty", () => {
    expect(resolveAfterFrame(makeAlignment({}), 5)).toBeNull();
  });
});
