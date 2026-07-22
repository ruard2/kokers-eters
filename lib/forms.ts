import { CommunityScope, Frequency, GatheringType, ParticipationMode } from "@prisma/client";

export function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function optionalText(formData: FormData, key: string) {
  const value = text(formData, key);
  return value.length > 0 ? value : null;
}

export function intValue(formData: FormData, key: string, fallback: number) {
  const value = Number.parseInt(text(formData, key), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function participationMode(formData: FormData) {
  const value = text(formData, "mode");
  if (value === ParticipationMode.EAT || value === ParticipationMode.HOST || value === ParticipationMode.BOTH) {
    return value;
  }

  return ParticipationMode.BOTH;
}

export function frequency(formData: FormData, key: string) {
  const value = text(formData, key);
  if (value === Frequency.BIWEEKLY || value === Frequency.MONTHLY || value === Frequency.QUARTERLY) {
    return value;
  }

  return Frequency.MONTHLY;
}

export function communityScope(formData: FormData) {
  const value = text(formData, "communityScope");
  if (value === CommunityScope.BOTH) {
    return CommunityScope.BOTH;
  }

  if (value === CommunityScope.GUESTS_AND_NEWCOMERS) {
    return CommunityScope.GUESTS_AND_NEWCOMERS;
  }

  return CommunityScope.COMMUNITY_WIDE;
}

export function gatheringType(formData: FormData) {
  const value = text(formData, "gatheringType");
  if (value === GatheringType.BOTH) {
    return GatheringType.BOTH;
  }

  if (value === GatheringType.COFFEE_TEA) {
    return GatheringType.COFFEE_TEA;
  }

  return GatheringType.MEAL;
}

export function wantsToEat(mode: ParticipationMode) {
  return mode === ParticipationMode.EAT || mode === ParticipationMode.BOTH;
}

export function wantsToHost(mode: ParticipationMode) {
  return mode === ParticipationMode.HOST || mode === ParticipationMode.BOTH;
}
