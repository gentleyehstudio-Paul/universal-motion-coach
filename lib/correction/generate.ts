import type { Finding, Correction } from "../motion/types";
import type { CorrectionTemplate } from "../rules/types";

/** Turns Finding + authored template into a display-ready Correction.
 * `why` already reads as complete, human-readable coaching text on its
 * own — a CorrectionTextPolisher (below) is an optional enhancement
 * layer, not a requirement for this to work. */
export function generateCorrection(
  finding: Finding,
  template: CorrectionTemplate,
  polishedWhy?: string
): Correction {
  return {
    findingId: `${finding.issueId}@${finding.phase}`,
    what: template.what,
    when: prettifyPhaseName(finding.phase),
    why: polishedWhy ?? defaultWhy(finding, template),
    whatToChange: template.whatToChange,
    cue: template.cue,
    drill: template.drill,
  };
}

function defaultWhy(finding: Finding, template: CorrectionTemplate): string {
  const unitSuffix = finding.unit === "degrees" ? "°" : ` ${finding.unit}`;
  return `${template.why} (measured ${finding.measuredValue.toFixed(1)}${unitSuffix} vs. a target of ${finding.baselineValue.toFixed(1)}${unitSuffix})`;
}

function prettifyPhaseName(phase: string): string {
  return phase.replace(/_/g, " ");
}

/**
 * Optional LLM polish for `why`'s phrasing — per docs/architecture.md
 * §3.4, it receives only the structured Finding + template text, never
 * video or raw landmarks, so it can only rephrase what the rule engine
 * already measured, not invent a new claim. Not wired to a real
 * provider yet: doing so needs an API key configured server-side (a
 * Next.js API route or the FastAPI backend, never called directly from
 * the browser), which is a deployment decision for whoever runs this,
 * not something to wire up unprompted. The default implementation below
 * is a legitimate, complete CorrectionTextPolisher on its own — it just
 * doesn't rephrase anything.
 */
export interface CorrectionTextPolisher {
  polish(finding: Finding, template: CorrectionTemplate): Promise<string>;
}

export const identityCorrectionTextPolisher: CorrectionTextPolisher = {
  async polish(finding, template) {
    return defaultWhy(finding, template);
  },
};
