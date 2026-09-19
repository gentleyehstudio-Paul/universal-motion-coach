import type { Finding } from "../motion/types";

const SEVERITY_RANK: Record<Finding["severity"], number> = {
  severe: 3,
  moderate: 2,
  mild: 1,
};

/** Ranks by severity, then confidence, and returns only the top Finding —
 * the product deliberately shows one PRIMARY CORRECTION, never a list of
 * every deviation found (docs/architecture.md §3.5). */
export function selectPrimaryFinding(findings: Finding[]): Finding | null {
  if (findings.length === 0) return null;
  return [...findings].sort((a, b) => {
    const severityDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (severityDiff !== 0) return severityDiff;
    return b.confidence - a.confidence;
  })[0]!;
}
