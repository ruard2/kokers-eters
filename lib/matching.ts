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

function canEat(mode: ParticipationMode) {
  return mode === ParticipationMode.EAT || mode === ParticipationMode.BOTH;
}

function canHost(mode: ParticipationMode) {
  return mode === ParticipationMode.HOST || mode === ParticipationMode.BOTH;
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

  const priorMatches = await prisma.mealMatch.findMany({
    where: {
      status: { not: MatchStatus.CANCELLED },
      round: { month: { lt: month } }
    },
    select: {
      hostId: true,
      eaterId: true
    }
  });

  const priorPairs = new Set(priorMatches.map((match) => pairKey(match.hostId, match.eaterId)));
  const hostHistory = new Map<string, number>();
  const eaterHistory = new Map<string, number>();

  for (const match of priorMatches) {
    hostHistory.set(match.hostId, (hostHistory.get(match.hostId) || 0) + 1);
    eaterHistory.set(match.eaterId, (eaterHistory.get(match.eaterId) || 0) + 1);
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
  const assignments = [];
  const sortedRequests = shuffle(eaterRequests).sort((a, b) => {
    const aHistory = eaterHistory.get(a.eater.id) || 0;
    const bHistory = eaterHistory.get(b.eater.id) || 0;
    return aHistory - bHistory;
  });

  for (const request of sortedRequests) {
    const candidates = hostBuckets.filter((bucket) => {
      const key = pairKey(bucket.host.id, request.eater.id);
      return (
        bucket.host.id !== request.eater.id &&
        bucket.remainingCapacity >= request.partySize &&
        !currentPairs.has(key)
      );
    });

    if (candidates.length === 0) {
      continue;
    }

    const freshCandidates = candidates.filter((bucket) => !priorPairs.has(pairKey(bucket.host.id, request.eater.id)));
    const pool = freshCandidates.length > 0 ? freshCandidates : candidates;
    const selected = shuffle(pool).sort((a, b) => {
      const aScore = a.hostedCount * 10 + a.slotIndex + (a.host.hostCapacity || 0) - a.remainingCapacity;
      const bScore = b.hostedCount * 10 + b.slotIndex + (b.host.hostCapacity || 0) - b.remainingCapacity;
      return aScore - bScore;
    })[0];

    selected.remainingCapacity -= request.partySize;
    selected.hostedCount += 1;
    currentPairs.add(pairKey(selected.host.id, request.eater.id));

    assignments.push({
      roundId: round.id,
      hostId: selected.host.id,
      eaterId: request.eater.id,
      partySize: request.partySize,
      hostToken: createToken(),
      eaterToken: createToken()
    });
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
