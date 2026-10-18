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

export type MatchMailReport = {
  matchesDone: number;
  hostMails: number;
  eaterMails: number;
  disabled: string[];
  failures: string[];
};

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function sendHostInvitesForRound(
  roundId?: string,
  organizationId: string | null = null
): Promise<MatchMailReport> {
  const report: MatchMailReport = { matchesDone: 0, hostMails: 0, eaterMails: 0, disabled: [], failures: [] };
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
      report.failures.push(`koker ${group[0].host.name} (${group[0].host.email}): ${errorText(error)}`);
    }
    if (result.status === "sent") report.hostMails += 1;
    if (result.status === "skipped_disabled" && !report.disabled.includes("koker")) report.disabled.push("koker");
    if (result.status === "skipped_no_provider") report.failures.push(`koker ${group[0].host.name}: geen mailprovider ingesteld`);
    hostOk.set(key, mailHandled(result));
  }

  // One mail per eater per koppeling.
  const touchedRounds = new Set<string>();
  for (const match of matches) {
    let result: { status: string } = { status: "error" };
    try {
      result = await sendMatchEaterMail(match);
    } catch (error) {
      console.error(`[mail error] koppelingsmail eter ${match.id}:`, error);
      report.failures.push(`eter ${match.eater.name} (${match.eater.email}): ${errorText(error)}`);
    }
    if (result.status === "sent") report.eaterMails += 1;
    if (result.status === "skipped_disabled" && !report.disabled.includes("eter")) report.disabled.push("eter");
    if (result.status === "skipped_no_provider") report.failures.push(`eter ${match.eater.name}: geen mailprovider ingesteld`);

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
    report.matchesDone += 1;
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

  return report;
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
      hostInvites = (await sendHostInvitesForRound(
        existing?.id || generatedRound?.roundId,
        organizationId
      )).matchesDone;
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
