"use client";

import { useState } from "react";
import type { MotionSequence } from "@/lib/motion/types";
import type { MotionTemplate } from "@/lib/template/types";

/** Dev-visible view of a computed MotionSequence. There is no polished
 * "results screen" yet (that's M6) — this exists so M2's own exit
 * criteria ("produces a complete, schema-valid MotionSequence... with
 * joint angles visibly plausible") can actually be eyeballed against a
 * real recording, not just asserted in a unit test. */
export function MotionAnalysisPanel({
  sequence,
  template,
}: {
  sequence: MotionSequence;
  template: MotionTemplate;
}) {
  const [showJson, setShowJson] = useState(false);

  const relevantAngleStats = template.relevantAngles.map((angleKey) => {
    const values = sequence.segmentAngles
      .map((f) => f.angles[angleKey])
      .filter((v): v is number => v !== undefined);
    const jointValues = sequence.jointAngles
      .map((f) => f.angles[angleKey])
      .filter((v): v is number => v !== undefined);
    const all = values.length > 0 ? values : jointValues;
    return {
      key: angleKey,
      min: all.length ? Math.min(...all) : null,
      max: all.length ? Math.max(...all) : null,
      sampleCount: all.length,
    };
  });

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm">
      <div className="font-medium text-neutral-200">Motion analysis (dev view)</div>

      <div className="grid grid-cols-2 gap-2 text-neutral-400">
        <div>Frames analyzed</div>
        <div className="text-neutral-200">{sequence.frameCount}</div>
        <div>Duration</div>
        <div className="text-neutral-200">{sequence.duration.toFixed(2)}s</div>
        <div>Effective FPS</div>
        <div className="text-neutral-200">{sequence.fps.toFixed(1)}</div>
        <div>Movement direction</div>
        <div className="text-neutral-200">{sequence.movementDirection}</div>
        <div>Normalization scale</div>
        <div className="text-neutral-200">
          {sequence.normalization.scaleValuePx.toFixed(1)}px ({sequence.normalization.scaleReference})
        </div>
        <div>Accelerations computed</div>
        <div className="text-neutral-200">{sequence.accelerations ? "yes" : "no (too short/slow)"}</div>
      </div>

      <div className="border-t border-neutral-800 pt-3">
        <div className="mb-1 text-neutral-400">Detected phases</div>
        {sequence.phases.length === 0 ? (
          <div className="text-neutral-500">none detected</div>
        ) : (
          <table className="w-full text-left">
            <tbody>
              {sequence.phases.map((phase) => (
                <tr key={phase.name}>
                  <td className="py-0.5 pr-3 text-neutral-400">{phase.name}</td>
                  <td className="py-0.5 text-neutral-200">
                    frames {phase.startFrame}–{phase.endFrame}
                    {phase.confidence < 1 && (
                      <span className="ml-2 text-amber-500">
                        (low confidence: boundary not found, truncated at clip end)
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="border-t border-neutral-800 pt-3">
        <div className="mb-1 text-neutral-400">Relevant angle ranges ({template.displayName})</div>
        <table className="w-full text-left">
          <tbody>
            {relevantAngleStats.map((stat) => (
              <tr key={stat.key}>
                <td className="py-0.5 pr-3 text-neutral-400">{stat.key}</td>
                <td className="py-0.5 text-neutral-200">
                  {stat.min !== null
                    ? `${stat.min.toFixed(1)}° – ${stat.max!.toFixed(1)}° (${stat.sampleCount} samples)`
                    : "not detected"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        onClick={() => setShowJson((v) => !v)}
        className="self-start text-xs text-neutral-500 underline hover:text-neutral-300"
      >
        {showJson ? "Hide raw JSON" : "Show raw MotionSequence JSON"}
      </button>
      {showJson && (
        <pre className="max-h-64 overflow-auto rounded bg-black p-2 text-xs text-neutral-400">
          {JSON.stringify(sequence, null, 2)}
        </pre>
      )}
    </div>
  );
}
