import { addMonths, dateInputToDate, toMonthStart } from "./dates";

function nextDate(month: Date, day: number) {
  return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), day, 18, 0, 0, 0))
    .toISOString()
    .slice(0, 10);
}

function participant(input: Record<string, unknown>) {
  return {
    id: String(input.id),
    name: String(input.name),
    email: String(input.email),
    whatsapp: String(input.whatsapp),
    mode: String(input.mode),
    comingWithCount: Number(input.comingWithCount || 1),
    hostCapacity: input.hostCapacity === undefined ? null : Number(input.hostCapacity),
    communityScope: String(input.communityScope || "BOTH"),
    gatheringType: String(input.gatheringType || "BOTH"),
    allergies: input.allergies ? String(input.allergies) : null,
    address: input.address ? String(input.address) : null,
    cookingPlan: input.cookingPlan ? String(input.cookingPlan) : null,
    active: input.active !== false,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

export function demoAdminData() {
  const month = toMonthStart(addMonths(new Date(), 1));
  const round = {
    id: "demo-round",
    month,
    status: "DRAFT",
    createdAt: new Date(),
    updatedAt: new Date(),
    matches: []
  };

  const anna = participant({
    id: "demo-host-anna",
    name: "Anna de Vries",
    email: "anna.demo@houvast.local",
    whatsapp: "06 11111111",
    mode: "HOST",
    hostCapacity: 5,
    communityScope: "BOTH",
    gatheringType: "MEAL",
    address: "Kerkstraat 12, Utrecht",
    cookingPlan: "Pasta uit de oven met salade"
  });
  const basNoor = participant({
    id: "demo-both-bas-noor",
    name: "Bas en Noor Jansen",
    email: "bas.noor.demo@houvast.local",
    whatsapp: "06 22222222",
    mode: "BOTH",
    comingWithCount: 2,
    hostCapacity: 4,
    communityScope: "COMMUNITY_WIDE",
    gatheringType: "BOTH",
    address: "Laan van Houvast 8, Utrecht",
    allergies: "Noor eet vegetarisch",
    cookingPlan: "Soep, brood en iets lekkers toe"
  });
  const gerrit = participant({
    id: "demo-both-gerrit",
    name: "Gerrit van Dijk",
    email: "gerrit.demo@houvast.local",
    whatsapp: "06 77777777",
    mode: "BOTH",
    comingWithCount: 1,
    hostCapacity: 2,
    communityScope: "BOTH",
    gatheringType: "MEAL",
    address: "Bomenlaan 3, Utrecht",
    allergies: "Geen",
    cookingPlan: "Stamppot of rijsttafel, afhankelijk van de groep"
  });
  const jan = participant({
    id: "demo-host-jan",
    name: "Jan Vermeer",
    email: "jan.demo@houvast.local",
    whatsapp: "06 10101010",
    mode: "HOST",
    hostCapacity: 6,
    communityScope: "BOTH",
    gatheringType: "BOTH",
    address: "Parkweg 18, Utrecht",
    cookingPlan: "Chili sin carne of koffie met gebak"
  });
  const david = participant({
    id: "demo-eater-david",
    name: "David Bakker",
    email: "david.demo@houvast.local",
    whatsapp: "06 44444444",
    mode: "EAT",
    comingWithCount: 1,
    communityScope: "BOTH",
    gatheringType: "MEAL",
    allergies: "Geen varkensvlees"
  });
  const emmaJoost = participant({
    id: "demo-eater-emma-joost",
    name: "Emma en Joost",
    email: "emma.joost.demo@houvast.local",
    whatsapp: "06 55555555",
    mode: "EAT",
    comingWithCount: 2,
    communityScope: "COMMUNITY_WIDE",
    gatheringType: "BOTH",
    allergies: "Emma lactosevrij"
  });
  const fatima = participant({
    id: "demo-eater-fatima",
    name: "Fatima El Idrissi",
    email: "fatima.demo@houvast.local",
    whatsapp: "06 66666666",
    mode: "EAT",
    comingWithCount: 1,
    communityScope: "GUESTS_AND_NEWCOMERS",
    gatheringType: "COFFEE_TEA",
    allergies: "Notenallergie"
  });
  const hannah = participant({
    id: "demo-eater-hannah",
    name: "Hannah Koster",
    email: "hannah.demo@houvast.local",
    whatsapp: "06 88888888",
    mode: "EAT",
    comingWithCount: 1,
    communityScope: "BOTH",
    gatheringType: "MEAL",
    allergies: "Glutenvrij"
  });

  const matches = [
    {
      id: "demo-match-1",
      roundId: round.id,
      hostId: anna.id,
      eaterId: emmaJoost.id,
      partySize: 2,
      hostToken: "demo-host-1",
      eaterToken: "demo-eater-1",
      status: "EATER_CONFIRMED",
      proposedDates: [nextDate(month, 8), nextDate(month, 11), nextDate(month, 15)],
      chosenDate: dateInputToDate(nextDate(month, 8)),
      hostNote: "Laat even weten of er nog iets is om rekening mee te houden.",
      createdAt: new Date(),
      updatedAt: new Date(),
      host: anna,
      eater: emmaJoost,
      round
    },
    {
      id: "demo-match-2",
      roundId: round.id,
      hostId: jan.id,
      eaterId: david.id,
      partySize: 1,
      hostToken: "demo-host-2",
      eaterToken: "demo-eater-2",
      status: "EATER_INVITED",
      proposedDates: [nextDate(month, 10), nextDate(month, 13), nextDate(month, 17)],
      chosenDate: null,
      hostNote: "Ik kan zowel maaltijd als koffie/thee doen.",
      createdAt: new Date(),
      updatedAt: new Date(),
      host: jan,
      eater: david,
      round
    },
    {
      id: "demo-match-3",
      roundId: round.id,
      hostId: basNoor.id,
      eaterId: fatima.id,
      partySize: 1,
      hostToken: "demo-host-3",
      eaterToken: "demo-eater-3",
      status: "HOST_RESPONDED",
      proposedDates: [nextDate(month, 12), nextDate(month, 16), nextDate(month, 20)],
      chosenDate: null,
      hostNote: "Koffie/thee kan ook als dat beter past.",
      createdAt: new Date(),
      updatedAt: new Date(),
      host: basNoor,
      eater: fatima,
      round
    },
    {
      id: "demo-match-4",
      roundId: round.id,
      hostId: gerrit.id,
      eaterId: hannah.id,
      partySize: 1,
      hostToken: "demo-host-4",
      eaterToken: "demo-eater-4",
      status: "DRAFT",
      proposedDates: [],
      chosenDate: null,
      hostNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      host: gerrit,
      eater: hannah,
      round
    }
  ];

  return {
    participants: [jan, gerrit, hannah, fatima, emmaJoost, david, basNoor, anna],
    rounds: [{ ...round, matches }],
    matches,
    emailLogs: [
      {
        id: "demo-mail-1",
        type: "HOST_INVITE",
        toEmail: anna.email,
        status: "DEMO",
        subject: "Houvast: kun je dagen kiezen voor Emma en Joost?"
      },
      {
        id: "demo-mail-2",
        type: "EATER_CHOICE",
        toEmail: emmaJoost.email,
        status: "DEMO",
        subject: "Houvast: kies een dag bij Anna de Vries"
      }
    ]
  };
}
