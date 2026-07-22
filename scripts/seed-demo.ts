import {
  CommunityScope,
  Frequency,
  GatheringType,
  MatchStatus,
  ParticipationMode
} from "@prisma/client";
import { addMonths, dateInputToDate, toMonthStart } from "../lib/dates";
import { prisma } from "../lib/db";
import { generateRoundForMonth } from "../lib/matching";
import { createToken } from "../lib/tokens";

const demoParticipants = [
  {
    name: "Anna de Vries",
    email: "anna.demo@houvast.local",
    whatsapp: "06 11111111",
    mode: ParticipationMode.HOST,
    comingWithCount: 1,
    hostCapacity: 5,
    hostFrequency: Frequency.MONTHLY,
    communityScope: CommunityScope.BOTH,
    gatheringType: GatheringType.MEAL,
    address: "Kerkstraat 12, Utrecht",
    cannotHostDays: "Niet op woensdag",
    cookingPlan: "Pasta uit de oven met salade"
  },
  {
    name: "Bas en Noor Jansen",
    email: "bas.noor.demo@houvast.local",
    whatsapp: "06 22222222",
    mode: ParticipationMode.BOTH,
    comingWithCount: 2,
    hostCapacity: 4,
    eaterFrequency: Frequency.MONTHLY,
    hostFrequency: Frequency.MONTHLY,
    communityScope: CommunityScope.COMMUNITY_WIDE,
    gatheringType: GatheringType.BOTH,
    address: "Laan van Houvast 8, Utrecht",
    cannotEatDays: "Vrijdagavond lastig",
    cannotHostDays: "Niet in het laatste weekend",
    allergies: "Noor eet vegetarisch",
    cookingPlan: "Soep, brood en iets lekkers toe"
  },
  {
    name: "Cornelia Smit",
    email: "cornelia.demo@houvast.local",
    whatsapp: "06 33333333",
    mode: ParticipationMode.HOST,
    comingWithCount: 1,
    hostCapacity: 3,
    hostFrequency: Frequency.QUARTERLY,
    communityScope: CommunityScope.GUESTS_AND_NEWCOMERS,
    gatheringType: GatheringType.COFFEE_TEA,
    address: "Singel 41, Utrecht",
    cannotHostDays: "Dinsdag niet",
    cookingPlan: "Koffie, thee en appeltaart"
  },
  {
    name: "David Bakker",
    email: "david.demo@houvast.local",
    whatsapp: "06 44444444",
    mode: ParticipationMode.EAT,
    comingWithCount: 1,
    eaterFrequency: Frequency.BIWEEKLY,
    communityScope: CommunityScope.BOTH,
    gatheringType: GatheringType.MEAL,
    cannotEatDays: "Maandag en donderdag",
    allergies: "Geen varkensvlees"
  },
  {
    name: "Emma en Joost",
    email: "emma.joost.demo@houvast.local",
    whatsapp: "06 55555555",
    mode: ParticipationMode.EAT,
    comingWithCount: 2,
    eaterFrequency: Frequency.MONTHLY,
    communityScope: CommunityScope.COMMUNITY_WIDE,
    gatheringType: GatheringType.BOTH,
    cannotEatDays: "Niet op zondag",
    allergies: "Emma lactosevrij"
  },
  {
    name: "Fatima El Idrissi",
    email: "fatima.demo@houvast.local",
    whatsapp: "06 66666666",
    mode: ParticipationMode.EAT,
    comingWithCount: 1,
    eaterFrequency: Frequency.MONTHLY,
    communityScope: CommunityScope.GUESTS_AND_NEWCOMERS,
    gatheringType: GatheringType.COFFEE_TEA,
    cannotEatDays: "Woensdagavond bezet",
    allergies: "Notenallergie"
  },
  {
    name: "Gerrit van Dijk",
    email: "gerrit.demo@houvast.local",
    whatsapp: "06 77777777",
    mode: ParticipationMode.BOTH,
    comingWithCount: 1,
    hostCapacity: 2,
    eaterFrequency: Frequency.QUARTERLY,
    hostFrequency: Frequency.BIWEEKLY,
    communityScope: CommunityScope.BOTH,
    gatheringType: GatheringType.MEAL,
    address: "Bomenlaan 3, Utrecht",
    cannotEatDays: "Eerste week van de maand niet",
    cannotHostDays: "Vrijdag niet",
    allergies: "Geen",
    cookingPlan: "Stamppot of rijsttafel, afhankelijk van de groep"
  },
  {
    name: "Hannah Koster",
    email: "hannah.demo@houvast.local",
    whatsapp: "06 88888888",
    mode: ParticipationMode.EAT,
    comingWithCount: 1,
    eaterFrequency: Frequency.MONTHLY,
    communityScope: CommunityScope.BOTH,
    gatheringType: GatheringType.MEAL,
    cannotEatDays: "Geen dinsdagen",
    allergies: "Glutenvrij"
  },
  {
    name: "Iris en Milan",
    email: "iris.milan.demo@houvast.local",
    whatsapp: "06 99999999",
    mode: ParticipationMode.EAT,
    comingWithCount: 2,
    eaterFrequency: Frequency.MONTHLY,
    communityScope: CommunityScope.COMMUNITY_WIDE,
    gatheringType: GatheringType.MEAL,
    cannotEatDays: "Tweede weekend niet",
    allergies: "Milan vegetarisch"
  },
  {
    name: "Jan Vermeer",
    email: "jan.demo@houvast.local",
    whatsapp: "06 10101010",
    mode: ParticipationMode.HOST,
    comingWithCount: 1,
    hostCapacity: 6,
    hostFrequency: Frequency.MONTHLY,
    communityScope: CommunityScope.BOTH,
    gatheringType: GatheringType.BOTH,
    address: "Parkweg 18, Utrecht",
    cannotHostDays: "Niet op maandag",
    cookingPlan: "Chili sin carne of koffie met gebak"
  }
];

function nextDate(month: Date, day: number) {
  return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), day, 18, 0, 0, 0))
    .toISOString()
    .slice(0, 10);
}

async function main() {
  const month = toMonthStart(addMonths(new Date(), 1));

  await prisma.emailLog.deleteMany();
  await prisma.mealMatch.deleteMany();
  await prisma.roundOptOut.deleteMany();
  await prisma.matchRound.deleteMany();
  await prisma.participant.deleteMany({
    where: {
      email: {
        endsWith: "@houvast.local"
      }
    }
  });

  for (const participant of demoParticipants) {
    await prisma.participant.create({
      data: {
        ...participant,
        preferenceToken: createToken(),
        active: true
      }
    });
  }

  const result = await generateRoundForMonth(month);
  const matches = await prisma.mealMatch.findMany({
    where: { roundId: result.roundId },
    orderBy: { createdAt: "asc" },
    include: { host: true, eater: true }
  });

  for (const [index, match] of matches.entries()) {
    const proposedDates = [
      nextDate(month, 8 + index * 2),
      nextDate(month, 11 + index * 2),
      nextDate(month, 15 + index * 2)
    ];

    const status = index === 0 ? MatchStatus.EATER_CONFIRMED : index === 1 ? MatchStatus.EATER_INVITED : MatchStatus.HOST_RESPONDED;

    await prisma.mealMatch.update({
      where: { id: match.id },
      data: {
        status,
        proposedDates,
        hostNote: "Laat even weten of er nog iets is om rekening mee te houden.",
        hostRespondedAt: new Date(),
        eaterInvitedAt: status === MatchStatus.EATER_INVITED || status === MatchStatus.EATER_CONFIRMED ? new Date() : null,
        chosenDate: status === MatchStatus.EATER_CONFIRMED ? dateInputToDate(proposedDates[0]) : null,
        eaterRespondedAt: status === MatchStatus.EATER_CONFIRMED ? new Date() : null
      }
    });
  }

  console.log(`Demo database gevuld voor ${month.toISOString().slice(0, 7)}.`);
  console.log(`${demoParticipants.length} deelnemers, ${result.matched} matches gemaakt.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
