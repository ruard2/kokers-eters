import {
  Frequency,
  MatchStatus,
  ParticipationMode,
  RoundStatus,
  type Participant
} from "@prisma/client";
import { toMonthStart } from "./dates";
import { prisma } from "./db";
import { createToken } from "./tokens";

type HostBucket = {
  host: Participant;
  remainingCapacity: number;
  hostedCount: number;
  slotIndex: number;
};

type EaterRequest = {
  eater: Participant;
  partySize: number;
  requestIndex: number;
};

type Role = "HOST" | "EATER";

type RoleHistory = {
  hostCount: number;
  eaterCount: number;
  lastMonth: Date | null;
  lastRole: Role | "BOTH" | null;
};

type Assignment = {
  roundId: string;
  hostId: string;
  eaterId: string;
  partySize: number;
  hostToken: string;
  eaterToken: string;
};

type AssignmentPass = {
  allowPreviousConnection: boolean;
  allowDualRoleInRound: boolean;
  saveBothHostsForPhase2: boolean;
};

function canEat(mode: ParticipationMode) {
  return mode === ParticipationMode.EAT || mode === ParticipationMode.BOTH;
}

function canHost(mode: ParticipationMode) {
  return mode === ParticipationMode.HOST || mode === ParticipationMode.BOTH;
}

function compatibleChoice(hostValue: string, eaterValue: string) {
  return hostValue === "BOTH" || eaterValue === "BOTH" || hostValue === eaterValue;
}

function compatibleMatch(host: Participant, eater: Participant) {
  return compatibleChoice(host.gatheringType, eater.gatheringType);
}

function noMatchTokens(value: string | null) {
  if (!value) {
    return [];
  }

  return value
    .split(/[\n,;]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function buildAdminNoMatchMap(participants: Participant[]) {
  const byEmail = new Map(participants.map((participant) => [participant.email.toLowerCase(), participant.id]));
  const byName = new Map(participants.map((participant) => [participant.name.toLowerCase(), participant.id]));
  const byId = new Map(participants.map((participant) => [participant.id, participant.id]));
  const blocked = new Map<string, Set<string>>();

  for (const participant of participants) {
    const blockedIds = new Set<string>();

    for (const rawToken of noMatchTokens(participant.adminNoMatch)) {
      const token = rawToken.toLowerCase().replace(/^#/, "");
      const rowNumber = Number.parseInt(token, 10);

      if (/^\d+$/.test(token) && participants[rowNumber - 1]) {
        blockedIds.add(participants[rowNumber - 1].id);
        continue;
      }

      const matchedId =
        byEmail.get(rawToken.toLowerCase()) || byName.get(rawToken.toLowerCase()) || byId.get(rawToken) || null;
      if (matchedId) {
        blockedIds.add(matchedId);
      }
    }

    blockedIds.delete(participant.id);
    if (blockedIds.size > 0) {
      blocked.set(participant.id, blockedIds);
    }
  }

  return blocked;
}

function adminBlocksMatch(host: Participant, eater: Participant, blocked: Map<string, Set<string>>) {
  return Boolean(blocked.get(host.id)?.has(eater.id) || blocked.get(eater.id)?.has(host.id));
}

function desiredCount(frequency: Frequency | null, participantCreatedAt: Date, month: Date) {
  if (!frequency) {
    return 0;
  }

  if (frequency === Frequency.BIWEEKLY) {
    return 2;
  }

  if (frequency === Frequency.MONTHLY) {
    return 1;
  }

  const monthDifference =
    (month.getUTCFullYear() - participantCreatedAt.getUTCFullYear()) * 12 +
    month.getUTCMonth() -
    participantCreatedAt.getUTCMonth();

  return monthDifference >= 0 && monthDifference % 3 === 0 ? 1 : 0;
}

function shuffle<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5);
}

function pairKey(hostId: string, eaterId: string) {
  return `${hostId}:${eaterId}`;
}

function connectionKey(firstId: string, secondId: string) {
  return [firstId, secondId].sort().join(":");
}

function blankHistory(): RoleHistory {
  return {
    hostCount: 0,
    eaterCount: 0,
    lastMonth: null,
    lastRole: null
  };
}

function historyFor(history: Map<string, RoleHistory>, participantId: string) {
  const existing = history.get(participantId);
  if (existing) {
    return existing;
  }

  const created = blankHistory();
  history.set(participantId, created);
  return created;
}

function rememberLastRole(history: RoleHistory, role: Role, month: Date) {
  if (!history.lastMonth || month > history.lastMonth) {
    history.lastMonth = month;
    history.lastRole = role;
    return;
  }

  if (month.getTime() === history.lastMonth.getTime() && history.lastRole && history.lastRole !== role) {
    history.lastRole = "BOTH";
  }
}

function rolePreferenceScore(participant: Participant, role: Role, roleHistory: Map<string, RoleHistory>) {
  if (participant.mode !== ParticipationMode.BOTH) {
    return 0;
  }

  const history = roleHistory.get(participant.id) || blankHistory();
  const balance = history.hostCount - history.eaterCount;
  let score = role === "HOST" ? balance * 25 : balance * -25;

  if (history.lastRole === role) {
    score += 90;
  } else if (history.lastRole && history.lastRole !== "BOTH") {
    score -= 90;
  } else if (history.lastRole === "BOTH") {
    score += 20;
  }

  return score;
}

function hasOtherRole(currentRoles: Map<string, Set<Role>>, participantId: string, role: Role) {
  const roles = currentRoles.get(participantId);
  return Boolean(roles && roles.size > 0 && !roles.has(role));
}

function addCurrentRole(currentRoles: Map<string, Set<Role>>, participantId: string, role: Role) {
  const roles = currentRoles.get(participantId) || new Set<Role>();
  roles.add(role);
  currentRoles.set(participantId, roles);
}

export async function generateRoundForMonth(
  rawMonth: Date,
  organizationId: string | null = null
) {
  const month = toMonthStart(rawMonth);
  const existingRound = await prisma.matchRound.findFirst({
    where: { month, organizationId }
  });

  if (existingRound && existingRound.status !== RoundStatus.DRAFT) {
    throw new Error("Deze ronde is al verstuurd. Maak een nieuwe ronde of annuleer matches handmatig.");
  }

  const round = existingRound
    ? await prisma.matchRound.update({
        where: { id: existingRound.id },
        data: { status: RoundStatus.DRAFT }
      })
    : await prisma.matchRound.create({
        data: { month, organizationId, status: RoundStatus.DRAFT }
      });

  await prisma.mealMatch.deleteMany({
    where: {
      roundId: round.id,
      status: MatchStatus.DRAFT
    }
  });

  const optOuts = await prisma.roundOptOut.findMany({
    where: { month, participant: { organizationId } },
    select: { participantId: true }
  });
  const optedOut = new Set(optOuts.map((item) => item.participantId));

  const participants = await prisma.participant.findMany({
    where: {
      organizationId,
      active: true,
      id: { notIn: [...optedOut] }
    },
    orderBy: { createdAt: "asc" }
  });
  const adminNoMatch = buildAdminNoMatchMap(participants);

  const priorMatches = await prisma.mealMatch.findMany({
    where: {
      status: { notIn: [MatchStatus.CANCELLED, MatchStatus.DRAFT] },
      round: { month: { lt: month }, organizationId }
    },
    select: {
      hostId: true,
      eaterId: true,
      round: {
        select: {
          month: true
        }
      }
    }
  });

  const priorPairs = new Set(priorMatches.map((match) => pairKey(match.hostId, match.eaterId)));
  const priorConnections = new Set(priorMatches.map((match) => connectionKey(match.hostId, match.eaterId)));
  const connectionHistory = new Map<string, number>();
  const roleHistory = new Map<string, RoleHistory>();
  const hostHistory = new Map<string, number>();
  const eaterHistory = new Map<string, number>();

  for (const match of priorMatches) {
    hostHistory.set(match.hostId, (hostHistory.get(match.hostId) || 0) + 1);
    eaterHistory.set(match.eaterId, (eaterHistory.get(match.eaterId) || 0) + 1);
    connectionHistory.set(connectionKey(match.hostId, match.eaterId), (connectionHistory.get(connectionKey(match.hostId, match.eaterId)) || 0) + 1);

    const hostRoleHistory = historyFor(roleHistory, match.hostId);
    const eaterRoleHistory = historyFor(roleHistory, match.eaterId);
    hostRoleHistory.hostCount += 1;
    eaterRoleHistory.eaterCount += 1;
    rememberLastRole(hostRoleHistory, "HOST", match.round.month);
    rememberLastRole(eaterRoleHistory, "EATER", match.round.month);
  }

  const hostBuckets: HostBucket[] = [];
  for (const participant of participants) {
    if (!canHost(participant.mode) || !participant.hostCapacity || participant.hostCapacity < 1) {
      continue;
    }

    const count = desiredCount(participant.hostFrequency, participant.createdAt, month);
    for (let index = 0; index < count; index += 1) {
      hostBuckets.push({
        host: participant,
        remainingCapacity: participant.hostCapacity,
        hostedCount: hostHistory.get(participant.id) || 0,
        slotIndex: index
      });
    }
  }

  // ── Phase 1: EAT-only eater requests ────────────────────────────────────────
  // Only EAT-mode participants generate mandatory eater requests. BOTH-mode
  // participants are handled separately in Phase 2 so we never create more
  // assignments than strictly needed for full participation.
  const eatOnlyRequests: EaterRequest[] = [];
  for (const participant of participants) {
    if (participant.mode !== ParticipationMode.EAT) continue;
    const count = desiredCount(participant.eaterFrequency, participant.createdAt, month);
    for (let index = 0; index < count; index += 1) {
      eatOnlyRequests.push({
        eater: participant,
        partySize: Math.max(1, participant.comingWithCount),
        requestIndex: index
      });
    }
  }

  const currentPairs = new Set<string>();
  const currentConnections = new Set<string>();
  const currentRoles = new Map<string, Set<Role>>();
  const assignments: Assignment[] = [];

  function makeAssignment(bucket: HostBucket, eater: Participant, partySize: number) {
    bucket.remainingCapacity -= partySize;
    bucket.hostedCount += 1;
    currentPairs.add(pairKey(bucket.host.id, eater.id));
    currentConnections.add(connectionKey(bucket.host.id, eater.id));
    addCurrentRole(currentRoles, bucket.host.id, "HOST");
    addCurrentRole(currentRoles, eater.id, "EATER");
    assignments.push({
      roundId: round.id,
      hostId: bucket.host.id,
      eaterId: eater.id,
      partySize,
      hostToken: createToken(),
      eaterToken: createToken()
    });
  }

  function scoreBucket(bucket: HostBucket, partySize: number, eaterId: string, pass: AssignmentPass) {
    const connKey = connectionKey(bucket.host.id, eaterId);
    const repeatPenalty =
      pass.allowPreviousConnection && priorPairs.has(pairKey(bucket.host.id, eaterId)) ? 500 : 0;
    // HOST-only hosts that have no eaters yet must be filled (they can't fall back to ETER)
    const hostOnlyBonus =
      bucket.host.mode === ParticipationMode.HOST && !currentRoles.has(bucket.host.id) ? -15 : 0;
    // Prefer filling already-used host buckets to reduce total rows (consolidation)
    const consolidationBonus = currentRoles.has(bucket.host.id) ? -80 : 0;
    // In Phase 1: save BOTH-mode unused capacity for Phase 2 pairing
    const bothReservePenalty =
      pass.saveBothHostsForPhase2 &&
      bucket.host.mode === ParticipationMode.BOTH &&
      !currentRoles.has(bucket.host.id)
        ? 80
        : 0;
    return (
      rolePreferenceScore(bucket.host, "HOST", roleHistory) +
      bucket.hostedCount * 20 +
      bucket.slotIndex * 3 +
      (bucket.remainingCapacity - partySize) * 2 +
      repeatPenalty +
      (connectionHistory.get(connKey) || 0) * 250 +
      hostOnlyBonus +
      consolidationBonus +
      bothReservePenalty
    );
  }

  function tryAssignEat(request: EaterRequest, pass: AssignmentPass): boolean {
    if (!pass.allowDualRoleInRound && hasOtherRole(currentRoles, request.eater.id, "EATER")) {
      return false;
    }
    const candidates = hostBuckets.filter((bucket) => {
      const key = pairKey(bucket.host.id, request.eater.id);
      const conn = connectionKey(bucket.host.id, request.eater.id);
      // Only singles (partySize=1) may share a host; couples/families need an exclusive host
      const existingAtBucket = assignments.filter((a) => a.hostId === bucket.host.id);
      const bucketHasFamily = existingAtBucket.some((a) => a.partySize > 1);
      if (bucketHasFamily || (request.partySize > 1 && existingAtBucket.length > 0)) return false;
      return (
        bucket.host.id !== request.eater.id &&
        bucket.remainingCapacity >= request.partySize &&
        compatibleMatch(bucket.host, request.eater) &&
        !adminBlocksMatch(bucket.host, request.eater, adminNoMatch) &&
        !currentPairs.has(key) &&
        !currentConnections.has(conn) &&
        (pass.allowPreviousConnection || !priorConnections.has(conn)) &&
        (pass.allowDualRoleInRound || !hasOtherRole(currentRoles, bucket.host.id, "HOST"))
      );
    });
    if (candidates.length === 0) return false;
    const selected = shuffle(candidates).sort(
      (a, b) => scoreBucket(a, request.partySize, request.eater.id, pass) -
                scoreBucket(b, request.partySize, request.eater.id, pass)
    )[0];
    makeAssignment(selected, request.eater, request.partySize);
    return true;
  }

  // 4-pass matching for EAT-only
  // saveBothHostsForPhase2: true reserves BOTH-mode unused capacity for Phase 2 pairing
  const passes: AssignmentPass[] = [
    { allowPreviousConnection: false, allowDualRoleInRound: false, saveBothHostsForPhase2: true },
    { allowPreviousConnection: false, allowDualRoleInRound: true,  saveBothHostsForPhase2: true },
    { allowPreviousConnection: true,  allowDualRoleInRound: false, saveBothHostsForPhase2: true },
    { allowPreviousConnection: true,  allowDualRoleInRound: true,  saveBothHostsForPhase2: true }
  ];

  const sortedEatRequests = shuffle(eatOnlyRequests).sort((a, b) => {
    const diff = b.partySize - a.partySize;
    if (diff !== 0) return diff;
    return (eaterHistory.get(a.eater.id) || 0) - (eaterHistory.get(b.eater.id) || 0);
  });

  let remainingEatRequests = sortedEatRequests;
  for (const pass of passes) {
    const next: EaterRequest[] = [];
    for (const req of remainingEatRequests) {
      if (!tryAssignEat(req, pass)) next.push(req);
    }
    remainingEatRequests = next;
    if (remainingEatRequests.length === 0) break;
  }

  // Rescue: EAT-only stragglers (allow prior connections + drop duplicate-connection check)
  for (const req of remainingEatRequests) {
    const candidates = hostBuckets.filter((b) => {
      const key = pairKey(b.host.id, req.eater.id);
      return (
        b.host.id !== req.eater.id &&
        b.remainingCapacity >= req.partySize &&
        compatibleMatch(b.host, req.eater) &&
        !adminBlocksMatch(b.host, req.eater, adminNoMatch) &&
        !currentPairs.has(key)
      );
    });
    if (candidates.length === 0) continue;
    const assignedIds = new Set(assignments.map((a) => a.hostId));
    const selected = shuffle(candidates).sort((a, b) => {
      const aBonus = !assignedIds.has(a.host.id) ? -40 : 0;
      const bBonus = !assignedIds.has(b.host.id) ? -40 : 0;
      return (a.hostedCount * 20 + aBonus) - (b.hostedCount * 20 + bBonus);
    })[0];
    makeAssignment(selected, req.eater, req.partySize);
  }

  // ── Phase 2: BOTH-mode coverage ──────────────────────────────────────────────
  // Find BOTH participants who should participate this month but have no role yet.
  // Goal: minimum extra assignments — try HOST pairing first, then ETER fallback.
  const covered = new Set([...assignments.map((a) => a.hostId), ...assignments.map((a) => a.eaterId)]);

  const bothActive = participants.filter((p) => {
    if (p.mode !== ParticipationMode.BOTH) return false;
    const eatCount = desiredCount(p.eaterFrequency, p.createdAt, month);
    const hostCount = desiredCount(p.hostFrequency, p.createdAt, month);
    return eatCount > 0 || hostCount > 0;
  });

  // Sort largest party first (they have the fewest hosts that can accept them)
  const uncoveredBoth = bothActive
    .filter((p) => !covered.has(p.id))
    .sort((a, b) => (b.comingWithCount ?? 1) - (a.comingWithCount ?? 1));

  if (uncoveredBoth.length > 0) {
    const p2done = new Set<string>();

    // Pass A: pair two uncovered BOTH people — one hosts the other's group.
    // Process without prior-connection restriction first, then relax it.
    for (const allowPriorA of [false, true]) {
      for (const person of uncoveredBoth) {
        if (p2done.has(person.id) || covered.has(person.id)) continue;
        const pSize = Math.max(1, person.comingWithCount ?? 1);

        // Find an uncovered BOTH who can host this person
        const hostCandidate = uncoveredBoth.find((h) => {
          if (p2done.has(h.id) || covered.has(h.id) || h.id === person.id) return false;
          const bucket = hostBuckets.find(
            (b) => b.host.id === h.id && b.remainingCapacity >= pSize
          );
          if (!bucket) return false;
          if (!compatibleMatch(h, person)) return false;
          if (adminBlocksMatch(h, person, adminNoMatch)) return false;
          const conn = connectionKey(h.id, person.id);
          if (currentConnections.has(conn)) return false;
          if (!allowPriorA && priorConnections.has(conn)) return false;
          return true;
        });

        if (hostCandidate) {
          const bucket = hostBuckets.find(
            (b) => b.host.id === hostCandidate.id && b.remainingCapacity >= pSize
          );
          if (bucket) {
            makeAssignment(bucket, person, pSize);
            p2done.add(person.id);
            p2done.add(hostCandidate.id);
            covered.add(person.id);
            covered.add(hostCandidate.id);
          }
        }
      }
    }

    // Pass B: eat at any host that has remaining capacity, with graceful fallback.
    // Prefer: no prior connection, no dual role → relax each constraint in order.
    for (const allowDualB of [false, true]) {
      for (const allowPriorB of [false, true]) {
        for (const person of uncoveredBoth) {
          if (covered.has(person.id)) continue;
          const pSize = Math.max(1, person.comingWithCount ?? 1);
          const candidates = shuffle(
            hostBuckets.filter((b) => {
              const key = pairKey(b.host.id, person.id);
              const conn = connectionKey(b.host.id, person.id);
              // Only singles may share a host; families need an exclusive host
              const existingAtBucket = assignments.filter((a) => a.hostId === b.host.id);
              const bucketHasFamily = existingAtBucket.some((a) => a.partySize > 1);
              if (bucketHasFamily || (pSize > 1 && existingAtBucket.length > 0)) return false;
              return (
                b.host.id !== person.id &&
                b.remainingCapacity >= pSize &&
                compatibleMatch(b.host, person) &&
                !adminBlocksMatch(b.host, person, adminNoMatch) &&
                !currentPairs.has(key) &&
                !currentConnections.has(conn) &&
                (allowPriorB || !priorConnections.has(conn)) &&
                (allowDualB || !hasOtherRole(currentRoles, b.host.id, "HOST"))
              );
            })
          ).sort((a, b) => a.remainingCapacity - b.remainingCapacity); // tightest fit first

          if (candidates.length > 0) {
            makeAssignment(candidates[0], person, pSize);
            covered.add(person.id);
          }
        }
        if (uncoveredBoth.every((p) => covered.has(p.id))) break;
      }
      if (uncoveredBoth.every((p) => covered.has(p.id))) break;
    }
  }

  if (assignments.length > 0) {
    await prisma.mealMatch.createMany({ data: assignments });
  }

  return {
    roundId: round.id,
    month,
    matched: assignments.length,
    requested: eatOnlyRequests.length + bothActive.length,
    hosts: hostBuckets.length
  };
}
