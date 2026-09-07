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

export async function sendPreferenceChecksForMonth(
  month: Date,
  organizationId: string | null = null
) {
  const participants = await prisma.participant.findMany({
    where: { active: true, organizationId },
    orderBy: { name: "asc" }
  });

  let sent = 0;
  for (const participant of participants) {
    let result: { status: string };
    try {
      result = await sendPreferenceCheck(participant, month);
    } catch (error) {
      console.error(`[mail error] preference check for participant ${participant.id}:`, error);
      continue;
    }
    if (result.status !== "skipped_disabled") {
      sent += 1;
    }
  }

  return sent;
}

export async function sendHostInvitesForRound(
  roundId?: string,
  organizationId: string | null = null
) {
  const matches = await prisma.mealMatch.findMany({
    where: {
      roundId,
      round: { organizationId },
      status: MatchStatus.DRAFT
    },
    include: matchInclude,
    orderBy: { createdAt: "asc" }
  });

  let sent = 0;
  for (const match of matches) {
    let result: { status: string };
    try {
      result = await sendHostInvite(match);
    } catch (error) {
      // Mail provider error: log and skip this match so the rest still go out.
      console.error(`[mail error] host invite for match ${match.id}:`, error);
      continue;
    }

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
    await prisma.matchRound.updateMany({
      where: { id: roundId, organizationId },
      data: { status: RoundStatus.HOST_MAILS_SENT }
    });
  }

  return sent;
}

export async function sendFallbacksForStaleMatches() {
  return 0;
}

export async function runDueJobs(
  now = new Date(),
  organizationId: string | null = null
) {
  const currentMonth = toMonthStart(now);
  const nextMonth = addMonths(currentMonth, 1);
  const preferenceWindowStart = addDays(nextMonth, -3);
  let preferenceChecks = 0;
  let generatedRound: Awaited<ReturnType<typeof generateRoundForMonth>> | null = null;
  let hostInvites = 0;

  if (now >= preferenceWindowStart && now < nextMonth) {
    preferenceChecks = await sendPreferenceChecksForMonth(
      nextMonth,
      organizationId
    );
  }

  if (process.env.AUTO_GENERATE_ROUNDS === "true") {
    const existing = await prisma.matchRound.findFirst({
      where: { month: currentMonth, organizationId }
    });

    if (!existing) {
      generatedRound = await generateRoundForMonth(currentMonth, organizationId);
    }

    if (process.env.AUTO_SEND_ROUNDS === "true") {
      hostInvites = await sendHostInvitesForRound(
        existing?.id || generatedRound?.roundId,
        organizationId
      );
    }
  }

  return {
    preferenceChecks,
    generatedRound,
    hostInvites,
    fallbackMails: 0
  };
}

export async function runDueJobsForAllOrganizations(now = new Date()) {
  const organizations = await prisma.organization.findMany({
    select: { id: true }
  });
  const scopes: Array<string | null> = [
    null,
    ...organizations.map((organization) => organization.id)
  ];
  const results = [];
  for (const organizationId of scopes) {
    results.push({
      organizationId,
      result: await runDueJobs(now, organizationId)
    });
  }
  return { organizations: results };
}
