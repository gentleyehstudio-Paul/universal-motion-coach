interface BeforeAfterComparisonProps {
  issueLabel: string;
  phase: string;
  unit: string;
  beforeValue: number;
  afterValue: number;
  baselineValue: number;
  improved: boolean;
}

/** A measurable before/after change for the issue M4 flagged as primary
 * — deliberately a number, not a score (docs/mvp-plan.md explicitly
 * rejects an aggregate "performance score" for V0). This previews what
 * M6's full comparison result screen will show; it does not render any
 * skeleton/overlay itself. */
export function BeforeAfterComparison({
  issueLabel,
  phase,
  unit,
  beforeValue,
  afterValue,
  baselineValue,
  improved,
}: BeforeAfterComparisonProps) {
  const unitSuffix = unit === "degrees" ? "°" : ` ${unit}`;
  const delta = afterValue - beforeValue;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-sky-800/50 bg-sky-950/20 p-4 text-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-sky-400">
        Before / After — {issueLabel}
      </div>
      <div className="text-neutral-400">
        During {phase.replace(/_/g, " ")} (target {baselineValue.toFixed(1)}
        {unitSuffix})
      </div>
      <div className="flex items-center gap-4 text-base">
        <div>
          <div className="text-xs text-neutral-500">Before</div>
          <div className="text-neutral-100">
            {beforeValue.toFixed(1)}
            {unitSuffix}
          </div>
        </div>
        <div className="text-neutral-600">→</div>
        <div>
          <div className="text-xs text-neutral-500">After</div>
          <div className="text-neutral-100">
            {afterValue.toFixed(1)}
            {unitSuffix}
          </div>
        </div>
        <div className={improved ? "text-emerald-400" : "text-amber-400"}>
          {delta >= 0 ? "+" : ""}
          {delta.toFixed(1)}
          {unitSuffix} {improved ? "(closer to target)" : "(not closer to target)"}
        </div>
      </div>
    </div>
  );
}
