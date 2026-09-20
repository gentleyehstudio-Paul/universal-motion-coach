"use client";

import { useEffect, useState } from "react";
import { buildSyntheticSquatFrames } from "@/lib/motion/__fixtures__/synthetic-squat";
import { analyzeAttempt, type AnalyzedAttempt } from "@/lib/pipeline/analyze-attempt";
import { measureRule } from "@/lib/rules/evaluate";
import { fastApiAlignmentEngine } from "@/lib/alignment/align-client";
import { ResultSection } from "@/components/ResultSection";
import { getTemplate, getRuleSet } from "@/lib/template/registry";
import type { AlignmentMap } from "@/lib/alignment/types";

/**
 * Dev-only page for visually verifying the M6 comparison views
 * (GhostOverlayView, DifferenceView, ResultSection) against known
 * synthetic before/after data, without needing a camera or a full
 * before->after recording session each time. Not linked from the main
 * app; visit directly at /dev/ghost-preview. Requires the FastAPI
 * backend running for the alignment call.
 */
export default function GhostPreviewPage() {
  const template = getTemplate("squat")!;
  const ruleSet = getRuleSet("squat")!;

  const [before, setBefore] = useState<AnalyzedAttempt | null>(null);
  const [after, setAfter] = useState<AnalyzedAttempt | null>(null);
  const [alignment, setAlignment] = useState<AlignmentMap | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Before: shallow squat (insufficient_depth should fire), slower tempo.
    const beforeFrames = buildSyntheticSquatFrames(60, 150);
    const beforeResult = analyzeAttempt(beforeFrames, 640, 480, template, ruleSet);
    setBefore(beforeResult);

    // After: full-depth squat (issue resolved), faster tempo — exercises
    // DTW's tempo-invariance in the same preview.
    const afterFrames = buildSyntheticSquatFrames(45, 90);
    const afterResult = analyzeAttempt(afterFrames, 640, 480, template, ruleSet);
    setAfter(afterResult);

    fastApiAlignmentEngine
      .align(beforeResult.sequence, afterResult.sequence)
      .then(setAlignment)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const comparisonRule =
    before?.primary &&
    ruleSet.evaluationRules.find((r) => r.issueId === before.primary!.finding.issueId);
  const primaryAfterValue =
    comparisonRule && after ? measureRule(after.sequence, comparisonRule) : null;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12 text-neutral-100">
      <h1 className="text-xl font-semibold">Dev: Ghost Overlay Preview (synthetic squat)</h1>
      {error && <p className="text-red-400">Alignment error: {error}</p>}
      {before && after && alignment ? (
        <ResultSection
          template={template}
          beforeSequence={before.sequence}
          afterSequence={after.sequence}
          alignment={alignment}
          primary={before.primary}
          primaryAfterValue={primaryAfterValue}
        />
      ) : (
        !error && <p className="text-neutral-400">Building synthetic sequences…</p>
      )}
    </main>
  );
}
