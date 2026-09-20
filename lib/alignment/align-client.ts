import type { MotionSequence } from "../motion/types";
import type { AlignmentEngine, AlignmentMap } from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

/** Calls the FastAPI /align endpoint (backend/app/alignment.py) — the
 * one point in the pipeline that needs a server round-trip, since
 * dtaidistance is a Python-only dependency (docs/mvp-plan.md M5). */
export const fastApiAlignmentEngine: AlignmentEngine = {
  async align(before: MotionSequence, after: MotionSequence): Promise<AlignmentMap> {
    const res = await fetch(`${API_BASE_URL}/align`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ before, after }),
    });
    if (!res.ok) {
      throw new Error(`Alignment request failed (${res.status}): ${await res.text()}`);
    }
    return (await res.json()) as AlignmentMap;
  },
};
