import {
  CommunityScope,
  Frequency,
  GatheringType,
  ParticipationMode
} from "@prisma/client";
import { addMonths, toMonthStart } from "./dates";
import { prisma } from "./db";
import { generateRoundForMonth } from "./matching";
import { createToken } from "./tokens";

// Alle test-deelnemers gebruiken een @houvast.local adres. De seed verwijdert
// alleen deze test-accounts, zodat echte aanmeldingen blijven staan.
export const DEMO_EMAIL_DOMAIN = "@houvast.local";

type DemoParticipant = {
  name: string;
  email: string;
  whatsapp: string;
  mode: ParticipationMode;
  comingWithCount: number;
  hostCapacity?: number;
  eaterFrequency?: Frequency;
  hostFrequency?: Frequency;
  communityScope: CommunityScope;
  gatheringType: GatheringType;
  address?: string;
  cannotEatDays?: string;
  cannotHostDays?: string;
  allergies?: string;
  cookingPlan?: string;
};

const demoParticipants: DemoParticipant[] = [
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
    hostFrequency: Frequency.MONTHLY,
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
    eaterFrequency: Frequency.MONTHLY,
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
  },
  {
    name: "Karel Prinsen",
    email: "karel.demo@houvast.local",
    whatsapp: "06 12121212",
    mode: ParticipationMode.HOST,
    comingWithCount: 1,
    hostCapacity: 4,
    hostFrequency: Frequency.MONTHLY,
    communityScope: CommunityScope.BOTH,
    gatheringType: GatheringType.MEAL,
    address: "Domplein 5, Utrecht",
    cannotHostDays: "Weekend liever niet",
    cookingPlan: "Indische rijsttafel"
  },
  {
    name: "Lena Groen",
    email: "lena.demo@houvast.local",
    whatsapp: "06 13131313",
    mode: ParticipationMode.EAT,
    comingWithCount: 1,
    eaterFrequency: Frequency.MONTHLY,
    communityScope: CommunityScope.GUESTS_AND_NEWCOMERS,
    gatheringType: GatheringType.MEAL,
    cannotEatDays: "Donderdag niet",
    allergies: "Vegetarisch"
  },
  {
    name: "Mohammed Aziz",
    email: "mohammed.demo@houvast.local",
    whatsapp: "06 14141414",
    mode: ParticipationMode.EAT,
    comingWithCount: 1,
    eaterFrequency: Frequency.BIWEEKLY,
    communityScope: CommunityScope.COMMUNITY_WIDE,
    gatheringType: GatheringType.MEAL,
    cannotEatDays: "Vrijdag gebedsavond",
    allergies: "Halal, geen varkensvlees"
  },
  {
    name: "Nynke de Boer",
    email: "nynke.demo@houvast.local",
    whatsapp: "06 15151515",
    mode: ParticipationMode.BOTH,
    comingWithCount: 1,
    hostCapacity: 3,
    eaterFrequency: Frequency.MONTHLY,
    hostFrequency: Frequency.MONTHLY,
    communityScope: CommunityScope.BOTH,
    gatheringType: GatheringType.BOTH,
    address: "Nachtegaalstraat 22, Utrecht",
    cannotEatDays: "Maandag niet",
    cannotHostDays: "Zondag niet",
    allergies: "Geen",
    cookingPlan: "Ovenschotel of high tea"
  },
  {
    name: "Otto Willems",
    email: "otto.demo@houvast.local",
    whatsapp: "06 16161616",
    mode: ParticipationMode.HOST,
    comingWithCount: 1,
    hostCapacity: 5,
    hostFrequency: Frequency.MONTHLY,
    communityScope: CommunityScope.BOTH,
    gatheringType: GatheringType.MEAL,
    address: "Oudegracht 200, Utrecht",
    cannotHostDays: "Dinsdag en woensdag niet",
    cookingPlan: "Stoofpot met brood"
  },
  {
    name: "Priya Nair",
    email: "priya.demo@houvast.local",
    whatsapp: "06 17171717",
    mode: ParticipationMode.EAT,
    comingWithCount: 1,
    eaterFrequency: Frequency.MONTHLY,
    communityScope: CommunityScope.GUESTS_AND_NEWCOMERS,
    gatheringType: GatheringType.MEAL,
    cannotEatDays: "Zondag druk",
    allergies: "Geen ui/knoflook"
  },
  {
    name: "Quirijn Faber",
    email: "quirijn.demo@houvast.local",
    whatsapp: "06 18181818",
    mode: ParticipationMode.EAT,
    comingWithCount: 1,
    eaterFrequency: Frequency.MONTHLY,
    communityScope: CommunityScope.BOTH,
    gatheringType: GatheringType.COFFEE_TEA,
    cannotEatDays: "Alleen doordeweeks",
    allergies: "Geen"
  },
  {
    name: "Rosa Hendriks",
    email: "rosa.demo@houvast.local",
    whatsapp: "06 19191919",
    mode: ParticipationMode.EAT,
    comingWithCount: 3,
    eaterFrequency: Frequency.MONTHLY,
    communityScope: CommunityScope.COMMUNITY_WIDE,
    gatheringType: GatheringType.MEAL,
    cannotEatDays: "Eerste weekend niet",
    allergies: "Eén kind lactosevrij"
  },
  {
    name: "Sven Mulder",
    email: "sven.demo@houvast.local",
    whatsapp: "06 20202020",
    mode: ParticipationMode.BOTH,
    comingWithCount: 1,
    hostCapacity: 2,
    eaterFrequency: Frequency.MONTHLY,
    hostFrequency: Frequency.MONTHLY,
    communityScope: CommunityScope.BOTH,
    gatheringType: GatheringType.MEAL,
    address: "Vleutenseweg 100, Utrecht",
    cannotEatDays: "Geen",
    cannotHostDays: "Geen",
    allergies: "Geen",
    cookingPlan: "Wat de pot schaft"
  },
  {
    name: "Tessa van Loon",
    email: "tessa.demo@houvast.local",
    whatsapp: "06 21212121",
    mode: ParticipationMode.EAT,
    comingWithCount: 1,
    eaterFrequency: Frequency.MONTHLY,
    communityScope: CommunityScope.GUESTS_AND_NEWCOMERS,
    gatheringType: GatheringType.BOTH,
    cannotEatDays: "Woensdag niet",
    allergies: "Pinda-allergie"
  }
];

export type SeedResult = {
  month: string;
  participants: number;
  matched: number;
  requested: number;
  hosts: number;
};

export type ClearResult = {
  removedParticipants: number;
};

/**
 * Verwijdert alle rondes/matches/mails en de test-accounts (@houvast.local).
 * Echte aanmeldingen met een ander e-maildomein blijven bestaan.
 */
export async function clearDemoData(): Promise<ClearResult> {
  await prisma.emailLog.deleteMany();
  await prisma.mealMatch.deleteMany();
  await prisma.roundOptOut.deleteMany();
  await prisma.matchRound.deleteMany();
  const removed = await prisma.participant.deleteMany({
    where: {
      email: {
        endsWith: DEMO_EMAIL_DOMAIN
      }
    }
  });

  return { removedParticipants: removed.count };
}

/**
 * Vult de database met test-deelnemers en een concept-ronde voor volgende maand.
 * Verwijdert eerst alle bestaande rondes/matches/mails en de test-accounts
 * (adres eindigt op @houvast.local). Echte aanmeldingen met een ander e-maildomein
 * blijven bestaan, maar hun matches uit oude rondes worden wel opgeschoond.
 */
export async function seedDemoData(): Promise<SeedResult> {
  const month = toMonthStart(addMonths(new Date(), 1));

  await prisma.emailLog.deleteMany();
  await prisma.mealMatch.deleteMany();
  await prisma.roundOptOut.deleteMany();
  await prisma.matchRound.deleteMany();
  await prisma.participant.deleteMany({
    where: {
      email: {
        endsWith: DEMO_EMAIL_DOMAIN
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

  return {
    month: month.toISOString().slice(0, 7),
    participants: demoParticipants.length,
    matched: result.matched,
    requested: result.requested,
    hosts: result.hosts
  };
}
