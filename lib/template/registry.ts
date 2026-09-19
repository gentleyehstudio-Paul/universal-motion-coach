import type { MotionTemplate } from "./types";
import squatTemplate from "@/sports/squat/template.json";
import basketballShotTemplate from "@/sports/basketball_shot/template.json";
import golfSwingTemplate from "@/sports/golf_swing/template.json";

// The one place that lists which sports exist. Adding a sport means
// adding a template.json under sports/<name>/ and one line here — no
// other file in lib/ or components/ changes. See docs/mvp-plan.md M7.
export const MOTION_TEMPLATES: Record<string, MotionTemplate> = {
  squat: squatTemplate as MotionTemplate,
  basketball_shot: basketballShotTemplate as MotionTemplate,
  golf_swing: golfSwingTemplate as MotionTemplate,
};

export function getTemplate(sportId: string): MotionTemplate | undefined {
  return MOTION_TEMPLATES[sportId];
}
