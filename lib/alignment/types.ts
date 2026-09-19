// docs/data-model.md §7, docs/architecture.md §3.6.
// Implemented server-side (dtaidistance) starting at M5 — see
// docs/mvp-plan.md. This is the shape the FastAPI endpoint returns.
import type { MotionSequence } from "../motion/types";

export interface AlignmentMap {
  beforeSequenceId: string;
  afterSequenceId: string;
  frameMap: Record<number, number>;
  phaseAlignment: {
    phaseName: string;
    beforeRange: [number, number];
    afterRange: [number, number];
  }[];
  method: "dtw_windowed_phase_seeded";
  params: { sakoeChibaRadius: number; featureSpace: "joint_angles" };
}

export interface AlignmentEngine {
  align(before: MotionSequence, after: MotionSequence): Promise<AlignmentMap>;
}
