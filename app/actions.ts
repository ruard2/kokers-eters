"use server";

import { MatchStatus, ParticipationMode } from "@prisma/client";
import { redirect } from "next/navigation";
import { isAdminKey } from "@/lib/admin";
import { runDueJobs, sendHostInvitesForRound, sendPreferenceChecksForMonth } from "@/lib/automation";
import { dateInputToDate, jsonDateList, parseMonthInput } from "@/lib/dates";
import {
  communityScope,
  frequency,
  gatheringType,
  intValue,
  optionalText,
  participationMode,
  text,
  wantsToEat,
  wantsToHost
} from "@/lib/forms";
import { sendConfirmationEmails, sendEaterChoiceEmail, sendWelcomeEmail } from "@/lib/mailer";
import { generateRoundForMonth } from "@/lib/matching";
import { prisma } from "@/lib/db";
import { createToken } from "@/lib/tokens";

const matchInclude = {
  host: true,
  eater: true,
  round: true
} as const;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function participantFormData(formData: FormData, active: boolean) {
  const mode = participationMode(formData);
  const eat = wantsToEat(mode);
  const host = wantsToHost(mode);

  return {
    name: text(formData, "name"),
    email: normalizeEmail(text(formData, "email")),
    whatsapp: text(formData, "whatsapp"),
    mode,
    comingWithCount: eat ? intValue(formData, "comingWithCount", 1) : 1,
    hostCapacity: host ? intValue(formData, "hostCapacity", 1) : null,
    eaterFrequency: eat ? frequency(formData, "eaterFrequency") : null,
    hostFrequency: host ? frequency(formData, "hostFrequency") : null,
    allergies: eat ? optionalText(formData, "allergies") : null,
    address: host ? optionalText(formData, "address") : null,
    cannotEatDays: eat ? optionalText(formData, "cannotEatDays") : null,
    cannotHostDays: host ? optionalText(formData, "cannotHostDays") : null,
    communityScope: communityScope(formData),
    gatheringType: gatheringType(formData),
    cookingPlan: host ? optionalText(formData, "cookingPlan") : null,
    active
  };
}

function dateList(formData: FormData) {
  const dates = ["date1", "date2", "date3", "date4", "date5"]
    .map((key) => text(formData, key))
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));

  return [...new Set(dates)].sort();
}

function requireAdmin(formData: FormData) {
  const key = text(formData, "adminKey");
  if (!isAdminKey(key)) {
    throw new Error("Ongeldige admin-sleutel.");
  }

  return key;
}

function redirectAdmin(key: string, notice: string) {
  redirect(`/?key=${encodeURIComponent(key)}&notice=${encodeURIComponent(notice)}`);
}

function databaseUnavailableNotice(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Can't reach database server") || message.includes("PrismaClientInitializationError");
}

export async function registerParticipant(formData: FormData) {
  const data = participantFormData(formData, true);

  if (!data.name || !data.email || !data.whatsapp) {
    redirect("/aanmelden?error=missing");
  }

  if (data.mode !== ParticipationMode.EAT && !data.address) {
    redirect("/aanmelden?error=address");
  }

  const participant = await prisma.participant.upsert({
    where: { email: data.email },
    create: {
      ...data,
      preferenceToken: createToken()
    },
    update: data
  });

  await sendWelcomeEmail(participant);
  redirect(`/bedankt?token=${participant.preferenceToken}`);
}

export async function updatePreferences(formData: FormData) {
  const token = text(formData, "token");
  const participant = await prisma.participant.findUnique({
    where: { preferenceToken: token }
  });

  if (!participant) {
    redirect("/");
  }

  const data = participantFormData(formData, formData.get("active") === "on");
  if (!data.name || !data.email || !data.whatsapp) {
    redirect(`/voorkeuren/${token}?error=missing`);
  }

  await prisma.participant.update({
    where: { id: participant.id },
    data
  });

  redirect(`/voorkeuren/${token}?saved=1`);
}

export async function submitHostDates(formData: FormData) {
  const token = text(formData, "token");
  const dates = dateList(formData);
  const cookingPlan = optionalText(formData, "cookingPlan");
  const hostNote = optionalText(formData, "hostNote");

  if (dates.length === 0) {
    redirect(`/koker/${token}?error=dates`);
  }

  const match = await prisma.mealMatch.findUnique({
    where: { hostToken: token },
    include: matchInclude
  });

  if (!match || match.status === MatchStatus.CANCELLED) {
    redirect(`/koker/${token}?error=missing`);
  }

  if (cookingPlan !== match.host.cookingPlan) {
    await prisma.participant.update({
      where: { id: match.hostId },
      data: { cookingPlan }
    });
  }

  const updated = await prisma.mealMatch.update({
    where: { id: match.id },
    data: {
      proposedDates: dates,
      hostNote,
      status: MatchStatus.EATER_INVITED,
      hostRespondedAt: new Date(),
      eaterInvitedAt: new Date()
    },
    include: matchInclude
  });

  await sendEaterChoiceEmail(updated);
  redirect(`/koker/${token}?sent=1`);
}

export async function submitEaterChoice(formData: FormData) {
  const token = text(formData, "token");
  const selectedDate = text(formData, "selectedDate");
  const match = await prisma.mealMatch.findUnique({
    where: { eaterToken: token },
    include: matchInclude
  });

  if (!match || match.status === MatchStatus.CANCELLED) {
    redirect(`/eter/${token}?error=missing`);
  }

  const possibleDates = jsonDateList(match.proposedDates);
  if (!possibleDates.includes(selectedDate)) {
    redirect(`/eter/${token}?error=date`);
  }

  const updated = await prisma.mealMatch.update({
    where: { id: match.id },
    data: {
      chosenDate: dateInputToDate(selectedDate),
      status: MatchStatus.EATER_CONFIRMED,
      eaterRespondedAt: new Date()
    },
    include: matchInclude
  });

  await sendConfirmationEmails(updated);
  redirect(`/eter/${token}?confirmed=1`);
}

export async function setRoundParticipation(formData: FormData) {
  const token = text(formData, "token");
  const month = parseMonthInput(text(formData, "month"));
  const choice = text(formData, "choice");
  const participant = await prisma.participant.findUnique({
    where: { preferenceToken: token }
  });

  if (!participant) {
    redirect("/");
  }

  if (choice === "no") {
    await prisma.roundOptOut.upsert({
      where: {
        participantId_month: {
          participantId: participant.id,
          month
        }
      },
      create: {
        participantId: participant.id,
        month
      },
      update: {}
    });
    redirect(`/meedoen/${token}?month=${text(formData, "month")}&saved=no`);
  }

  await prisma.roundOptOut.deleteMany({
    where: {
      participantId: participant.id,
      month
    }
  });
  redirect(`/meedoen/${token}?month=${text(formData, "month")}&saved=yes`);
}

export async function generateMonthlyRoundAction(formData: FormData) {
  const key = requireAdmin(formData);
  const month = parseMonthInput(text(formData, "month"));
  try {
    const result = await generateRoundForMonth(month);
    redirectAdmin(key, `${result.matched} matches gemaakt voor ${result.requested} eetverzoeken.`);
  } catch (error) {
    if (databaseUnavailableNotice(error)) {
      redirectAdmin(key, "Database niet bereikbaar. Demo-werkblad blijft zichtbaar; start Postgres voor echte acties.");
    }

    throw error;
  }
}

export async function sendHostInvitesAction(formData: FormData) {
  const key = requireAdmin(formData);
  const roundId = text(formData, "roundId") || undefined;
  try {
    const sent = await sendHostInvitesForRound(roundId);
    redirectAdmin(key, `${sent} host-mails verstuurd.`);
  } catch (error) {
    if (databaseUnavailableNotice(error)) {
      redirectAdmin(key, "Database niet bereikbaar. Host-mails kunnen pas met een echte database.");
    }

    throw error;
  }
}

export async function sendPreferenceChecksAction(formData: FormData) {
  const key = requireAdmin(formData);
  const month = parseMonthInput(text(formData, "month"));
  try {
    const sent = await sendPreferenceChecksForMonth(month);
    redirectAdmin(key, `${sent} voorkeursmails aangemaakt/verwerkt.`);
  } catch (error) {
    if (databaseUnavailableNotice(error)) {
      redirectAdmin(key, "Database niet bereikbaar. Voorkeursmails kunnen pas met een echte database.");
    }

    throw error;
  }
}

export async function runJobsAction(formData: FormData) {
  const key = requireAdmin(formData);
  try {
    const result = await runDueJobs();
    redirectAdmin(
      key,
      `Jobs klaar: ${result.preferenceChecks} voorkeurschecks, ${result.hostInvites} host-mails, ${result.fallbackMails} fallback-mails.`
    );
  } catch (error) {
    if (databaseUnavailableNotice(error)) {
      redirectAdmin(key, "Database niet bereikbaar. Automatische jobs kunnen pas met een echte database.");
    }

    throw error;
  }
}

export async function cancelMatchAction(formData: FormData) {
  const key = requireAdmin(formData);
  const matchId = text(formData, "matchId");
  try {
    await prisma.mealMatch.update({
      where: { id: matchId },
      data: { status: MatchStatus.CANCELLED }
    });
    redirectAdmin(key, "Match geannuleerd.");
  } catch (error) {
    if (databaseUnavailableNotice(error)) {
      redirectAdmin(key, "Database niet bereikbaar. Demo-matches kun je niet wijzigen.");
    }

    throw error;
  }
}
