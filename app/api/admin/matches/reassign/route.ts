import { MatchStatus, Prisma, type Participant } from "@prisma/client";
import { NextResponse } from "next/server";
import { isAdminKey } from "@/lib/admin";
import { prisma } from "@/lib/db";

const matchInclude = {
  host: true,
  eater: true
} as const;

type Side = "host" | "eater";

type ReassignBody = {
  adminKey?: unknown;
  sourceMatchId?: unknown;
  targetMatchId?: unknown;
  side?: unknown;
};

type MatchWithPeople = {
  id: string;
  roundId: string;
  status: MatchStatus;
  partySize: number;
  host: Participant;
  eater: Participant;
};

function isSide(value: unknown): value is Side {
  return value === "host" || value === "eater";
}

function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function pairKey(hostId: string, eaterId: string) {
  return `${hostId}:${eaterId}`;
}

function serializeParticipant(participant: Participant) {
  return {
    id: participant.id,
    name: participant.name,
    email: participant.email,
    whatsapp: participant.whatsapp,
    mode: participant.mode,
    hostCapacity: participant.hostCapacity,
    allergies: participant.allergies,
    address: participant.address,
    cookingPlan: participant.cookingPlan,
    communityScope: participant.communityScope,
    gatheringType: participant.gatheringType
  };
}

function serializeMatch(match: MatchWithPeople) {
  return {
    id: match.id,
    roundId: match.roundId,
    status: match.status,
    partySize: match.partySize,
    host: serializeParticipant(match.host),
    eater: serializeParticipant(match.eater)
  };
}

function validateConnection(input: {
  host: Participant | undefined;
  eater: Participant | undefined;
  partySize: number;
}) {
  if (!input.host || !input.eater) {
    return "Deelnemer niet gevonden.";
  }

  if (input.host.id === input.eater.id) {
    return "Iemand kan niet aan zichzelf gekoppeld worden.";
  }

  if (!input.host.hostCapacity || input.host.hostCapacity < input.partySize) {
    return `${input.host.name} kan deze groep niet ontvangen.`;
  }

  return null;
}

function validateHostTotals(input: {
  matches: Array<{ hostId: string; partySize: number }>;
  hosts: Map<string, Participant>;
}) {
  const totals = new Map<string, number>();

  for (const match of input.matches) {
    totals.set(match.hostId, (totals.get(match.hostId) || 0) + match.partySize);
  }

  for (const [hostId, total] of totals) {
    const host = input.hosts.get(hostId);
    if (host && (!host.hostCapacity || total > host.hostCapacity)) {
      return `${host.name} heeft capaciteit ${host.hostCapacity || 0}, maar krijgt zo ${total} personen.`;
    }
  }

  return null;
}

export async function POST(request: Request) {
  let body: ReassignBody;

  try {
    body = (await request.json()) as ReassignBody;
  } catch {
    return badRequest("Ongeldige aanvraag.");
  }

  if (typeof body.adminKey !== "string" || !isAdminKey(body.adminKey)) {
    return badRequest("Ongeldige admin-sleutel.", 401);
  }

  if (
    typeof body.sourceMatchId !== "string" ||
    typeof body.targetMatchId !== "string" ||
    !isSide(body.side)
  ) {
    return badRequest("Onvolledige wissel.");
  }

  if (body.sourceMatchId === body.targetMatchId) {
    return badRequest("Kies twee verschillende verbindingen.");
  }

  const selectedMatches = await prisma.mealMatch.findMany({
    where: { id: { in: [body.sourceMatchId, body.targetMatchId] } },
    include: matchInclude
  });

  if (selectedMatches.length !== 2) {
    return badRequest("Match niet gevonden.", 404);
  }

  const source = selectedMatches.find((match) => match.id === body.sourceMatchId);
  const target = selectedMatches.find((match) => match.id === body.targetMatchId);

  if (!source || !target) {
    return badRequest("Match niet gevonden.", 404);
  }

  if (source.roundId !== target.roundId) {
    return badRequest("Je kunt alleen binnen dezelfde ronde schuiven.");
  }

  if (source.status !== MatchStatus.DRAFT || target.status !== MatchStatus.DRAFT) {
    return badRequest("Alleen conceptmatches kunnen worden aangepast.");
  }

  const nextSource =
    body.side === "host"
      ? {
          hostId: target.hostId,
          eaterId: source.eaterId,
          partySize: source.partySize
        }
      : {
          hostId: source.hostId,
          eaterId: target.eaterId,
          partySize: target.partySize
        };

  const nextTarget =
    body.side === "host"
      ? {
          hostId: source.hostId,
          eaterId: target.eaterId,
          partySize: target.partySize
        }
      : {
          hostId: target.hostId,
          eaterId: source.eaterId,
          partySize: source.partySize
        };

  const participants = new Map(
    [source.host, source.eater, target.host, target.eater].map((participant) => [participant.id, participant])
  );

  const sourceError = validateConnection({
    host: participants.get(nextSource.hostId),
    eater: participants.get(nextSource.eaterId),
    partySize: nextSource.partySize
  });
  if (sourceError) {
    return badRequest(sourceError);
  }

  const targetError = validateConnection({
    host: participants.get(nextTarget.hostId),
    eater: participants.get(nextTarget.eaterId),
    partySize: nextTarget.partySize
  });
  if (targetError) {
    return badRequest(targetError);
  }

  const proposedKeys = new Set([pairKey(nextSource.hostId, nextSource.eaterId), pairKey(nextTarget.hostId, nextTarget.eaterId)]);
  if (proposedKeys.size !== 2) {
    return badRequest("Deze wissel maakt twee dezelfde verbindingen.");
  }

  const otherMatches = await prisma.mealMatch.findMany({
    where: {
      roundId: source.roundId,
      id: { notIn: [source.id, target.id] }
    },
    select: {
      hostId: true,
      eaterId: true,
      partySize: true,
      status: true
    }
  });

  const existingPair = otherMatches.find((match) => proposedKeys.has(pairKey(match.hostId, match.eaterId)));
  if (existingPair) {
    return badRequest("Deze verbinding bestaat al in de ronde.");
  }

  const hostTotalError = validateHostTotals({
    matches: [...otherMatches.filter((match) => match.status !== MatchStatus.CANCELLED), nextSource, nextTarget],
    hosts: new Map([source.host, target.host].map((host) => [host.id, host]))
  });
  if (hostTotalError) {
    return badRequest(hostTotalError);
  }

  try {
    const updatedMatches = await prisma.$transaction(async (tx) => {
      await tx.mealMatch.update({
        where: { id: source.id },
        data: {
          ...nextSource,
          proposedDates: Prisma.JsonNull,
          chosenDate: null,
          hostNote: null,
          hostRespondedAt: null,
          eaterInvitedAt: null,
          eaterRespondedAt: null,
          fallbackSentAt: null
        }
      });

      await tx.mealMatch.update({
        where: { id: target.id },
        data: {
          ...nextTarget,
          proposedDates: Prisma.JsonNull,
          chosenDate: null,
          hostNote: null,
          hostRespondedAt: null,
          eaterInvitedAt: null,
          eaterRespondedAt: null,
          fallbackSentAt: null
        }
      });

      return tx.mealMatch.findMany({
        where: {
          roundId: source.roundId,
          status: { not: MatchStatus.CANCELLED }
        },
        orderBy: { createdAt: "asc" },
        include: matchInclude
      });
    });

    return NextResponse.json({ matches: updatedMatches.map(serializeMatch) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende databasefout.";
    return badRequest(message);
  }
}
