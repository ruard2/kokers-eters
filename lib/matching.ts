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

export async function generateRoundForMonth(rawMonth: Date) {
  const month = toMonthStart(rawMonth);
  const existingRound = await prisma.matchRound.findUnique({ where: { month } });

  if (existingRound && existingRound.status !== RoundStatus.DRAFT) {
    throw new Error("Deze ronde is al verstuurd. Maak een nieuwe ronde of annuleer matches handmatig.");
  }

  const round = await prisma.matchRound.upsert({
    where: { month },
    create: { month, status: RoundStatus.DRAFT },
    update: { status: RoundStatus.DRAFT }
  });

  await prisma.mealMatch.deleteMany({
    where: {
      roundId: round.id,
      status: MatchStatus.DRAFT
    }
  });

  const optOuts = await prisma.roundOptOut.findMany({
    where: { month },
    select: { participantId: true }
  });
  const optedOut = new Set(optOuts.map((item) => item.participantId));

  const participants = await prisma.participant.findMany({
    where: {
      active: true,
      id: { notIn: [...optedOut] }
    },
    orderBy: { createdAt: "asc" }
  });
  const adminNoMatch = buildAdminNoMatchMap(participants);

  const priorMatches = await prisma.mealMatch.findMany({
    where: {
      status: { notIn: [MatchStatus.CANCELLED, MatchStatus.DRAFT] },
      round: { month: { lt: month } }
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

  const eaterRequests: EaterRequest[] = [];
  for (const participant of participants) {
    if (!canEat(participant.mode)) {
      continue;
    }

    const count = desiredCount(participant.eaterFrequency, participant.createdAt, month);
    for (let index = 0; index < count; index += 1) {
      eaterRequests.push({
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
  const sortedRequests = shuffle(eaterRequests).sort((a, b) => {
    const partySizeDifference = b.partySize - a.partySize;
    if (partySizeDifference !== 0) {
      return partySizeDifference;
    }

    const roleDifference =
      rolePreferenceScore(a.eater, "EATER", roleHistory) - rolePreferenceScore(b.eater, "EATER", roleHistory);
    if (roleDifference !== 0) {
      return roleDifference;
    }

    const aHistory = eaterHistory.get(a.eater.id) || 0;
    const bHistory = eaterHistory.get(b.eater.id) || 0;
    return aHistory - bHistory;
  });

  function assignRequest(request: EaterRequest, pass: AssignmentPass) {
    if (!pass.allowDualRoleInRound && hasOtherRole(currentRoles, request.eater.id, "EATER")) {
      return false;
    }

    const candidates = hostBuckets.filter((bucket) => {
      const key = pairKey(bucket.host.id, request.eater.id);
      const connection = connectionKey(bucket.host.id, request.eater.id);
      return (
        bucket.host.id !== request.eater.id &&
        bucket.remainingCapacity >= request.partySize &&
        compatibleMatch(bucket.host, request.eater) &&
        !adminBlocksMatch(bucket.host, request.eater, adminNoMatch) &&
        !currentPairs.has(key) &&
        !currentConnections.has(connection) &&
        (pass.allowPreviousConnection || !priorConnections.has(connection)) &&
        (pass.allowDualRoleInRound || !hasOtherRole(currentRoles, bucket.host.id, "HOST"))
      );
    });

    if (candidates.length === 0) {
      return false;
    }

    const selected = shuffle(candidates).sort((a, b) => {
      const aConnectionKey = connectionKey(a.host.id, request.eater.id);
      const bConnectionKey = connectionKey(b.host.id, request.eater.id);
      const aRepeatPenalty =
        pass.allowPreviousConnection && priorPairs.has(pairKey(a.host.id, request.eater.id)) ? 500 : 0;
      const bRepeatPenalty =
        pass.allowPreviousConnection && priorPairs.has(pairKey(b.host.id, request.eater.id)) ? 500 : 0;
      const aScore =
        rolePreferenceScore(a.host, "HOST", roleHistory) +
        a.hostedCount * 20 +
        a.slotIndex * 3 +
        (a.remainingCapacity - request.partySize) * 2 +
        aRepeatPenalty +
        (connectionHistory.get(aConnectionKey) || 0) * 250;
      const bScore =
        rolePreferenceScore(b.host, "HOST", roleHistory) +
        b.hostedCount * 20 +
        b.slotIndex * 3 +
        (b.remainingCapacity - request.partySize) * 2 +
        bRepeatPenalty +
        (connectionHistory.get(bConnectionKey) || 0) * 250;
      return aScore - bScore;
    })[0];

    selected.remainingCapacity -= request.partySize;
    selected.hostedCount += 1;
    currentPairs.add(pairKey(selected.host.id, request.eater.id));
    currentConnections.add(connectionKey(selected.host.id, request.eater.id));
    addCurrentRole(currentRoles, selected.host.id, "HOST");
    addCurrentRole(currentRoles, request.eater.id, "EATER");

    assignments.push({
      roundId: round.id,
      hostId: selected.host.id,
      eaterId: request.eater.id,
      partySize: request.partySize,
      hostToken: createToken(),
      eaterToken: createToken()
    });

    return true;
  }

  const passes: AssignmentPass[] = [
    { allowPreviousConnection: false, allowDualRoleInRound: false },
    { allowPreviousConnection: false, allowDualRoleInRound: true },
    { allowPreviousConnection: true, allowDualRoleInRound: false },
    { allowPreviousConnection: true, allowDualRoleInRound: true }
  ];

  let remainingRequests = sortedRequests;
  for (const pass of passes) {
    const nextRemainingRequests: EaterRequest[] = [];

    for (const request of remainingRequests) {
      if (!assignRequest(request, pass)) {
        nextRemainingRequests.push(request);
      }
    }

    remainingRequests = nextRemainingRequests;
    if (remainingRequests.length === 0) {
      break;
    }
  }

  if (assignments.length > 0) {
    await prisma.mealMatch.createMany({ data: assignments });
  }

  return {
    roundId: round.id,
    month,
    matched: assignments.length,
    requested: eaterRequests.length,
    hosts: hostBuckets.length
  };
}
