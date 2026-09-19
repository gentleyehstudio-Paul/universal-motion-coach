import type { Correction, Finding } from "@/lib/motion/types";

/** The product's central UX rule: show the one PRIMARY CORRECTION, never
 * a list of every deviation found (docs/architecture.md §3.5). */
export function PrimaryCorrectionCard({
  finding,
  correction,
}: {
  finding: Finding;
  correction: Correction;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-amber-800/50 bg-amber-950/20 p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-amber-500">
        Primary Correction
      </div>

      <div>
        <div className="text-lg font-medium text-neutral-100">{correction.what}</div>
        <div className="mt-1 text-sm text-neutral-400">
          During: {correction.when}
          <span className="ml-2 rounded bg-neutral-800 px-1.5 py-0.5 text-xs capitalize text-neutral-400">
            {finding.severity}
          </span>
        </div>
      </div>

      <p className="text-sm text-neutral-300">{correction.why}</p>

      <div className="text-sm text-neutral-300">
        <span className="text-neutral-500">What to change: </span>
        {correction.whatToChange}
      </div>

      <div className="flex flex-col gap-1 border-t border-amber-900/40 pt-3">
        <div className="text-sm">
          <span className="text-neutral-500">Cue: </span>
          <span className="italic text-neutral-100">&ldquo;{correction.cue}&rdquo;</span>
        </div>
        <div className="text-sm">
          <span className="text-neutral-500">Drill: </span>
          <span className="text-neutral-200">{correction.drill}</span>
        </div>
      </div>
    </div>
  );
}
