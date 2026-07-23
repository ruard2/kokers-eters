"use server";

import { CommunityScope, Frequency, GatheringType, MatchStatus, ParticipationMode } from "@prisma/client";
import { redirect } from "next/navigation";
import { demoSeedEnabled, isAdminKey } from "@/lib/admin";
import { runDueJobs, sendHostInvitesForRound, sendPreferenceChecksForMonth } from "@/lib/automation";
import { addMonths, dateInputToDate, jsonDateList, parseMonthInput } from "@/lib/dates";
import {
  frequency,
  gatheringType,
  intValue,
  optionalText,
  participationMode,
  text,
  wantsToEat,
  wantsToHost
} from "@/lib/forms";
import {
  sendAdminParticipantNotice,
  sendConfirmationEmails,
  sendEaterChoiceEmail,
  sendWelcomeEmail
} from "@/lib/mailer";
import { mailTemplateDefinition } from "@/lib/mail-templates";
import { generateRoundForMonth } from "@/lib/matching";
import { prisma } from "@/lib/db";
import {
  clampInt,
  normalizeHorizon,
  normalizeRenewalCadence
} from "@/lib/planning";
import { clearDemoData, seedDemoData } from "@/lib/seed";
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
    communityScope: CommunityScope.COMMUNITY_WIDE,
    gatheringType: gatheringType(formData),
    cookingPlan: null,
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

function redirectAdmin(key: string, notice: string, params: Record<string, string> = {}): never {
  const query = new URLSearchParams({
    key,
    notice,
    ...params
  });
  redirect(`/?${query.toString()}`);
}

function databaseUnavailableNotice(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Can't reach database server") || message.includes("PrismaClientInitializationError");
}

function adminParticipantData(formData: FormData, existing?: { eaterFrequency: Frequency | null; hostFrequency: Frequency | null }) {
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
    eaterFrequency: eat ? existing?.eaterFrequency || Frequency.MONTHLY : null,
    hostFrequency: host ? existing?.hostFrequency || Frequency.MONTHLY : null,
    adminNoMatch: optionalText(formData, "adminNoMatch"),
    isGuest: formData.get("isGuest") === "on",
    communityScope: CommunityScope.COMMUNITY_WIDE,
    active: formData.get("active") === "on"
  };
}

export async function registerParticipant(formData: FormData) {
  const data = participantFormData(formData, true);

  if (!data.name || !data.email || !data.whatsapp) {
    redirect("/aanmelden?error=missing");
  }

  if (data.mode !== ParticipationMode.EAT && !data.address) {
    redirect("/aanmelden?error=address");
  }

  const previous = await prisma.participant.findUnique({
    where: { email: data.email }
  });
  const participant = await prisma.participant.upsert({
    where: { email: data.email },
    create: {
      ...data,
      preferenceToken: createToken()
    },
    update: data
  });

  await sendWelcomeEmail(participant);
  await sendAdminParticipantNotice(participant, previous ? "updated" : "created", previous);
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

  const updated = await prisma.participant.update({
    where: { id: participant.id },
    data
  });

  await sendAdminParticipantNotice(updated, "updated", participant);
  redirect(`/voorkeuren/${token}?saved=1`);
}

export async function submitHostDates(formData: FormData) {
  const token = text(formData, "token");
  const dates = dateList(formData);
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
    redirectAdmin(key, `${result.matched} matches gemaakt voor ${result.requested} eetverzoeken.`, { step: "review" });
  } catch (error) {
    if (databaseUnavailableNotice(error)) {
      redirectAdmin(key, "Database niet bereikbaar. Demo-werkblad blijft zichtbaar; start Postgres voor echte acties.", {
        step: "planning"
      });
    }

    throw error;
  }
}

export async function generatePlanningAction(formData: FormData) {
  const key = requireAdmin(formData);
  const startMonth = parseMonthInput(text(formData, "startMonth"));
  const horizonMonths = normalizeHorizon(formData.get("horizonMonths"));
  const settings = {
    horizonMonths,
    adminCheckDaysBefore: clampInt(formData.get("adminCheckDaysBefore"), 14, 1, 90),
    hostMailDaysBefore: clampInt(formData.get("hostMailDaysBefore"), 21, 1, 120),
    eaterMailDelayDays: clampInt(formData.get("eaterMailDelayDays"), 3, 1, 30),
    reminderDaysAfter: clampInt(formData.get("reminderDaysAfter"), 3, 1, 30),
    renewalCadence: normalizeRenewalCadence(formData.get("renewalCadence"))
  };

  try {
    await prisma.planningSettings.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        ...settings
      },
      update: settings
    });

    let matched = 0;
    let requested = 0;
    let skipped = 0;
    for (let index = 0; index < horizonMonths; index += 1) {
      try {
        const result = await generateRoundForMonth(addMonths(startMonth, index));
        matched += result.matched;
        requested += result.requested;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("al verstuurd")) {
          skipped += 1;
          continue;
        }

        throw error;
      }
    }

    redirectAdmin(
      key,
      `${horizonMonths - skipped} ronde(s) klaargezet: ${matched} matches voor ${requested} eetverzoeken.${skipped ? ` ${skipped} bestaande verstuurde ronde(s) overgeslagen.` : ""}`,
      { step: "review" }
    );
  } catch (error) {
    if (databaseUnavailableNotice(error)) {
      redirectAdmin(key, "Database niet bereikbaar. Planning klaarzetten kan pas met een echte database.", {
        step: "planning"
      });
    }

    throw error;
  }
}

export async function sendHostInvitesAction(formData: FormData) {
  const key = requireAdmin(formData);
  const roundId = text(formData, "roundId") || undefined;
  try {
    const sent = await sendHostInvitesForRound(roundId);
    redirectAdmin(key, `${sent} host-mails verstuurd.`, { step: "mails" });
  } catch (error) {
    if (databaseUnavailableNotice(error)) {
      redirectAdmin(key, "Database niet bereikbaar. Host-mails kunnen pas met een echte database.", { step: "review" });
    }

    throw error;
  }
}

export async function sendPreferenceChecksAction(formData: FormData) {
  const key = requireAdmin(formData);
  const month = parseMonthInput(text(formData, "month"));
  try {
    const sent = await sendPreferenceChecksForMonth(month);
    redirectAdmin(key, `${sent} voorkeursmails aangemaakt/verwerkt.`, { step: "planning" });
  } catch (error) {
    if (databaseUnavailableNotice(error)) {
      redirectAdmin(key, "Database niet bereikbaar. Voorkeursmails kunnen pas met een echte database.", {
        step: "planning"
      });
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
      `Jobs klaar: ${result.preferenceChecks} voorkeurschecks, ${result.hostInvites} host-mails, ${result.fallbackMails} fallback-mails.`,
      { step: "summary" }
    );
  } catch (error) {
    if (databaseUnavailableNotice(error)) {
      redirectAdmin(key, "Database niet bereikbaar. Automatische jobs kunnen pas met een echte database.", {
        step: "summary"
      });
    }

    throw error;
  }
}

export async function saveMailTemplateAction(formData: FormData) {
  const key = requireAdmin(formData);
  const type = text(formData, "type");
  const subject = text(formData, "subject");
  const body = text(formData, "body");
  const definition = mailTemplateDefinition(type);

  if (!definition) {
    redirectAdmin(key, "Onbekend mailtemplate.", { step: "mails" });
  }

  if (!subject || !body) {
    redirectAdmin(key, "Onderwerp en tekst zijn verplicht.", { step: "mails" });
  }

  try {
    await prisma.mailTemplate.upsert({
      where: { type },
      create: {
        type,
        subject,
        body
      },
      update: {
        subject,
        body
      }
    });
    redirectAdmin(key, `${definition.label} opgeslagen.`, { step: "mails" });
  } catch (error) {
    if (databaseUnavailableNotice(error)) {
      redirectAdmin(key, "Database niet bereikbaar. Mailtemplates opslaan kan pas met een echte database.", {
        step: "mails"
      });
    }

    throw error;
  }
}

export async function saveAdminParticipantAction(formData: FormData) {
  const key = requireAdmin(formData);
  const participantId = text(formData, "participantId");

  try {
    const existing = participantId
      ? await prisma.participant.findUnique({
          where: { id: participantId },
          select: { eaterFrequency: true, hostFrequency: true }
        })
      : null;

    if (participantId && !existing) {
      redirectAdmin(key, "Deelnemer niet gevonden.", { step: "participants", sheet: "1" });
    }

    const data = adminParticipantData(formData, existing || undefined);
    if (!data.name || !data.email || !data.whatsapp) {
      redirectAdmin(key, "Naam, e-mail en WhatsApp zijn verplicht.", { step: "participants", sheet: "1" });
    }

    if (participantId) {
      await prisma.participant.update({
        where: { id: participantId },
        data
      });
      redirectAdmin(key, `${data.name} bijgewerkt.`, { step: "participants", sheet: "1" });
    }

    await prisma.participant.create({
      data: {
        ...data,
        active: true,
        allergies: null,
        address: null,
        cannotEatDays: null,
        cannotHostDays: null,
        communityScope: CommunityScope.COMMUNITY_WIDE,
        gatheringType: GatheringType.BOTH,
        cookingPlan: null,
        preferenceToken: createToken()
      }
    });
    redirectAdmin(key, `${data.name} toegevoegd.`, { step: "participants", sheet: "1" });
  } catch (error) {
    if (databaseUnavailableNotice(error)) {
      redirectAdmin(key, "Database niet bereikbaar. Deelnemers bewerken kan pas met een echte database.", {
        step: "participants",
        sheet: "1"
      });
    }

    throw error;
  }
}

export async function seedDemoAction(formData: FormData) {
  const key = requireAdmin(formData);
  if (!demoSeedEnabled()) {
    redirectAdmin(key, "Demo-seed staat uit. Zet ALLOW_DEMO_SEED=true om te kunnen seeden.");
  }

  try {
    const result = await seedDemoData();
    redirectAdmin(key, `Demo-data geladen: ${result.participants} deelnemers, ${result.matched} matches.`);
  } catch (error) {
    if (databaseUnavailableNotice(error)) {
      redirectAdmin(key, "Database niet bereikbaar. Demo-data kan pas met een echte database geladen worden.");
    }

    throw error;
  }
}

export async function clearDemoAction(formData: FormData) {
  const key = requireAdmin(formData);
  if (!demoSeedEnabled()) {
    redirectAdmin(key, "Demo-seed staat uit. Zet ALLOW_DEMO_SEED=true om demo-data te kunnen wissen.");
  }

  try {
    const result = await clearDemoData();
    redirectAdmin(key, `Demo-data gewist: ${result.removedParticipants} test-deelnemers verwijderd.`);
  } catch (error) {
    if (databaseUnavailableNotice(error)) {
      redirectAdmin(key, "Database niet bereikbaar. Demo-data kan pas met een echte database gewist worden.");
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
    redirectAdmin(key, "Match geannuleerd.", { step: "review" });
  } catch (error) {
    if (databaseUnavailableNotice(error)) {
      redirectAdmin(key, "Database niet bereikbaar. Demo-matches kun je niet wijzigen.", { step: "review" });
    }

    throw error;
  }
}
