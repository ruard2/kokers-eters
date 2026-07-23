import { MatchStatus, RoundStatus } from "@prisma/client";
import { addDays, addMonths, toMonthStart } from "./dates";
import { prisma } from "./db";
import { sendHostInvite, sendPreferenceCheck } from "./mailer";
import { generateRoundForMonth } from "./matching";

const matchInclude = {
  host: true,
  eater: true,
  round: true
} as const;

export async function sendPreferenceChecksForMonth(month: Date) {
  const participants = await prisma.participant.findMany({
    where: { active: true },
    orderBy: { name: "asc" }
  });

  let sent = 0;
  for (const participant of participants) {
    const result = await sendPreferenceCheck(participant, month);
    if (result.status !== "skipped_disabled") {
      sent += 1;
    }
  }

  return sent;
}

export async function sendHostInvitesForRound(roundId?: string) {
  const matches = await prisma.mealMatch.findMany({
    where: {
      roundId,
      status: MatchStatus.DRAFT
    },
    include: matchInclude,
    orderBy: { createdAt: "asc" }
  });

  let sent = 0;
  for (const match of matches) {
    const result = await sendHostInvite(match);
    if (result.status !== "sent" && result.status !== "skipped_existing") {
      continue;
    }

    await prisma.mealMatch.update({
      where: { id: match.id },
      data: {
        status: MatchStatus.HOST_INVITED,
        hostInvitedAt: new Date()
      }
    });
    sent += 1;
  }

  if (roundId && sent > 0) {
    await prisma.matchRound.update({
      where: { id: roundId },
      data: { status: RoundStatus.HOST_MAILS_SENT }
    });
  }

  return sent;
}

export async function sendFallbacksForStaleMatches() {
  return 0;
}

export async function runDueJobs() {
  const now = new Date();
  const currentMonth = toMonthStart(now);
  const nextMonth = addMonths(currentMonth, 1);
  const preferenceWindowStart = addDays(nextMonth, -3);
  let preferenceChecks = 0;
  let generatedRound: Awaited<ReturnType<typeof generateRoundForMonth>> | null = null;
  let hostInvites = 0;

  if (now >= preferenceWindowStart && now < nextMonth) {
    preferenceChecks = await sendPreferenceChecksForMonth(nextMonth);
  }

  if (process.env.AUTO_GENERATE_ROUNDS === "true") {
    const existing = await prisma.matchRound.findUnique({
      where: { month: currentMonth }
    });

    if (!existing) {
      generatedRound = await generateRoundForMonth(currentMonth);
    }

    if (process.env.AUTO_SEND_ROUNDS === "true") {
      hostInvites = await sendHostInvitesForRound(existing?.id || generatedRound?.roundId);
    }
  }

  return {
    preferenceChecks,
    generatedRound,
    hostInvites,
    fallbackMails: 0
  };
}
