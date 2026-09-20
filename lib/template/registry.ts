import type { MotionTemplate } from "./types";
import type { SportRuleSet } from "../rules/types";
import squatTemplate from "@/sports/squat/template.json";
import squatRules from "@/sports/squat/rules.json";
import basketballShotTemplate from "@/sports/basketball_shot/template.json";
import basketballShotRules from "@/sports/basketball_shot/rules.json";
import golfSwingTemplate from "@/sports/golf_swing/template.json";
import golfSwingRules from "@/sports/golf_swing/rules.json";
import pushupTemplate from "@/sports/pushup/template.json";
import pushupRules from "@/sports/pushup/rules.json";

// The one place that lists which sports exist. Adding a sport means
// adding a template.json + rules.json under sports/<name>/ and one entry
// in each of these two maps — no other file in lib/ or components/
// changes. See docs/mvp-plan.md M7.
export const MOTION_TEMPLATES: Record<string, MotionTemplate> = {
  squat: squatTemplate as MotionTemplate,
  basketball_shot: basketballShotTemplate as MotionTemplate,
  golf_swing: golfSwingTemplate as MotionTemplate,
  pushup: pushupTemplate as MotionTemplate,
};

export const SPORT_RULE_SETS: Record<string, SportRuleSet> = {
  squat: squatRules as SportRuleSet,
  basketball_shot: basketballShotRules as SportRuleSet,
  golf_swing: golfSwingRules as SportRuleSet,
  pushup: pushupRules as SportRuleSet,
};

export function getTemplate(sportId: string): MotionTemplate | undefined {
  return MOTION_TEMPLATES[sportId];
}

export function getRuleSet(sportId: string): SportRuleSet | undefined {
  return SPORT_RULE_SETS[sportId];
}
