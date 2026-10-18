import { MatchStatus, RoundStatus } from "@prisma/client";
import { addDays, addMonths, toMonthStart } from "./dates";
import { prisma } from "./db";
import { sendMatchEaterMail, sendMatchHostMail, sendPreferenceCheck } from "./mailer";
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

// A mail counts as handled when it went out, was already sent before, or the
// template is switched off. "No provider" and errors keep the match in DRAFT
// so it can be retried later.
function mailHandled(result: { status: string }) {
  return result.status === "sent" || result.status === "skipped_existing" || result.status === "skipped_disabled";
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

  // One mail per koker per ronde, listing every eater coupled to them in that round.
  const byHost = new Map<string, typeof matches>();
  for (const match of matches) {
    const key = `${match.roundId}:${match.hostId}`;
    const group = byHost.get(key) || [];
    group.push(match);
    byHost.set(key, group);
  }

  const hostOk = new Map<string, boolean>();
  for (const [key, group] of byHost) {
    let result: { status: string } = { status: "error" };
    try {
      result = await sendMatchHostMail(group[0].host, group[0].round, group);
    } catch (error) {
      console.error(`[mail error] koppelingsmail koker ${key}:`, error);
    }
    hostOk.set(key, mailHandled(result));
  }

  // One mail per eater per koppeling.
  let sent = 0;
  const touchedRounds = new Set<string>();
  for (const match of matches) {
    let result: { status: string } = { status: "error" };
    try {
      result = await sendMatchEaterMail(match);
    } catch (error) {
      console.error(`[mail error] koppelingsmail eter ${match.id}:`, error);
    }

    if (!mailHandled(result) || !hostOk.get(`${match.roundId}:${match.hostId}`)) {
      continue;
    }

    await prisma.mealMatch.update({
      where: { id: match.id },
      data: {
        status: MatchStatus.HOST_INVITED,
        hostInvitedAt: new Date()
      }
    });
    touchedRounds.add(match.roundId);
    sent += 1;
  }

  // A round is "sent" once none of its matches is still waiting in DRAFT.
  for (const id of touchedRounds) {
    const remaining = await prisma.mealMatch.count({ where: { roundId: id, status: MatchStatus.DRAFT } });
    if (remaining === 0) {
      await prisma.matchRound.updateMany({
        where: { id, organizationId },
        data: { status: RoundStatus.HOST_MAILS_SENT }
      });
    }
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
