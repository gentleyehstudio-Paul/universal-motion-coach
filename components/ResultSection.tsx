import type { MotionSequence, Correction, Finding } from "@/lib/motion/types";
import type { AlignmentMap } from "@/lib/alignment/types";
import type { MotionTemplate } from "@/lib/template/types";
import type { AnchorKind } from "@/lib/motion/spatial-aligner";
import { PrimaryCorrectionCard } from "./PrimaryCorrectionCard";
import { GhostOverlayView } from "./GhostOverlayView";
import { DifferenceView, type Measurement } from "./DifferenceView";

interface ResultSectionProps {
  template: MotionTemplate;
  beforeSequence: MotionSequence;
  afterSequence: MotionSequence;
  alignment: AlignmentMap;
  primary: { finding: Finding; correction: Correction } | null;
  primaryAfterValue: number | null;
}

/**
 * The Step 13 result screen from the product brief: BEFORE/AFTER,
 * PRIMARY ISSUE, WHAT CHANGED, JOINT/SEGMENT ANGLE CHANGE, TIMING CHANGE,
 * MOTION PATH CHANGE (via the ghost overlay's trails), COACHING CUE, and
 * NEXT DRILL — assembled from pieces already built (M4's correction
 * card, M5's alignment) plus the two new comparison views. No aggregate
 * score, per docs/mvp-plan.md.
 */
export function ResultSection({
  template,
  beforeSequence,
  afterSequence,
  alignment,
  primary,
  primaryAfterValue,
}: ResultSectionProps) {
  const anchor = (template.visualization?.anchor ?? "hip") as AnchorKind;
  const rotationNormalization = template.visualization?.rotationNormalization ?? false;
  const trailJoints = template.visualization?.trailJoints;

  const primaryPhase = primary
    ? beforeSequence.phases.find((p) => p.name === primary.finding.phase)
    : undefined;
  const differenceFrame = primaryPhase
    ? Math.floor((primaryPhase.startFrame + primaryPhase.endFrame) / 2)
    : Math.floor(beforeSequence.frameCount / 2);

  const measurements: Measurement[] =
    primary && primaryAfterValue !== null
      ? [
          {
            label: primary.correction.what,
            beforeValue: primary.finding.measuredValue,
            afterValue: primaryAfterValue,
            unit: primary.finding.unit,
          },
        ]
      : [];

  return (
    <div className="flex flex-col gap-6 border-t border-neutral-800 pt-6">
      <h2 className="text-lg font-semibold text-neutral-100">Result</h2>

      {primary ? (
        <PrimaryCorrectionCard finding={primary.finding} correction={primary.correction} />
      ) : (
        <div className="rounded-lg border border-emerald-800/50 bg-emerald-950/20 p-4 text-sm text-emerald-300">
          No issues detected on the before recording.
        </div>
      )}

      <div>
        <div className="mb-2 text-sm font-medium text-neutral-300">Ghost Overlay</div>
        <GhostOverlayView
          before={beforeSequence}
          after={afterSequence}
          alignment={alignment}
          anchor={anchor}
          rotationNormalization={rotationNormalization}
          trailJoints={trailJoints}
        />
      </div>

      <div>
        <div className="mb-2 text-sm font-medium text-neutral-300">
          Difference at {primary?.finding.phase.replace(/_/g, " ") ?? "mid-clip"}
        </div>
        <DifferenceView
          before={beforeSequence}
          after={afterSequence}
          alignment={alignment}
          anchor={anchor}
          rotationNormalization={rotationNormalization}
          beforeFrame={differenceFrame}
          keyJoints={trailJoints ?? template.keyJoints}
          measurements={measurements}
        />
      </div>

      <div>
        <div className="mb-2 text-sm font-medium text-neutral-300">Timing change</div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-neutral-500">
              <th className="pr-3 font-normal">Phase</th>
              <th className="pr-3 font-normal">Before</th>
              <th className="font-normal">After</th>
            </tr>
          </thead>
          <tbody>
            {alignment.phaseAlignment.map((p) => {
              const beforeDuration =
                (p.beforeRange[1] - p.beforeRange[0] + 1) / beforeSequence.fps;
              const afterDuration = (p.afterRange[1] - p.afterRange[0] + 1) / afterSequence.fps;
              return (
                <tr key={p.phaseName}>
                  <td className="pr-3 py-0.5 text-neutral-400">
                    {p.phaseName.replace(/_/g, " ")}
                  </td>
                  <td className="pr-3 py-0.5 text-neutral-200">{beforeDuration.toFixed(2)}s</td>
                  <td className="py-0.5 text-neutral-200">{afterDuration.toFixed(2)}s</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
