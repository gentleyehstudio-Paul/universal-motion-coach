import type { AlignmentMap } from "@/lib/alignment/types";

/** Dev-visible view of the computed AlignmentMap — lets M5's exit
 * criterion ("correctly pairs the before/after release frame even at
 * different tempos") be spot-checked against a real recording, the same
 * way MotionAnalysisPanel does for M2/M3. The ghost-overlay rendering
 * that actually *uses* this map is M6, not built yet. */
export function AlignmentSummaryPanel({ alignment }: { alignment: AlignmentMap }) {
  const sampleEntries = Object.entries(alignment.frameMap)
    .map(([b, a]) => [Number(b), a] as const)
    .sort((a, b) => a[0] - b[0]);
  const sampleStep = Math.max(1, Math.floor(sampleEntries.length / 8));
  const sampled = sampleEntries.filter((_, i) => i % sampleStep === 0);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm">
      <div className="font-medium text-neutral-200">Temporal alignment (dev view)</div>

      <div className="text-neutral-400">
        Method: <span className="text-neutral-200">{alignment.method}</span>{" "}
        (Sakoe-Chiba radius {alignment.params.sakoeChibaRadius}, feature space{" "}
        {alignment.params.featureSpace})
      </div>

      <table className="w-full text-left">
        <thead>
          <tr className="text-neutral-500">
            <th className="pr-3 font-normal">Phase</th>
            <th className="pr-3 font-normal">Before frames</th>
            <th className="font-normal">After frames</th>
          </tr>
        </thead>
        <tbody>
          {alignment.phaseAlignment.map((p) => (
            <tr key={p.phaseName}>
              <td className="pr-3 py-0.5 text-neutral-400">{p.phaseName}</td>
              <td className="pr-3 py-0.5 text-neutral-200">
                {p.beforeRange[0]}–{p.beforeRange[1]}
              </td>
              <td className="py-0.5 text-neutral-200">
                {p.afterRange[0]}–{p.afterRange[1]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="border-t border-neutral-800 pt-3">
        <div className="mb-1 text-neutral-400">Sample frame mapping (before → after)</div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-neutral-200">
          {sampled.map(([b, a]) => (
            <span key={b}>
              {b} → {a}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
