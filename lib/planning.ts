export type PlanningSettingsView = {
  horizonMonths: number;
  adminCheckDaysBefore: number;
  hostMailDaysBefore: number;
  eaterMailDelayDays: number;
  reminderDaysAfter: number;
  renewalCadence: string;
};

export const defaultPlanningSettings: PlanningSettingsView = {
  horizonMonths: 1,
  adminCheckDaysBefore: 14,
  hostMailDaysBefore: 21,
  eaterMailDelayDays: 3,
  reminderDaysAfter: 3,
  renewalCadence: "YEAR"
};

export function clampInt(value: FormDataEntryValue | null, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, parsed));
}

export function normalizeHorizon(value: FormDataEntryValue | null) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return [1, 3, 12].includes(parsed) ? parsed : defaultPlanningSettings.horizonMonths;
}

export function normalizeRenewalCadence(value: FormDataEntryValue | null) {
  const raw = String(value || "");
  return ["TWO_WEEKS", "QUARTER", "YEAR"].includes(raw) ? raw : defaultPlanningSettings.renewalCadence;
}

export function renewalCadenceLabel(value: string) {
  if (value === "TWO_WEEKS") return "na twee weken";
  if (value === "QUARTER") return "na kwartaal";
  return "na jaar";
}
