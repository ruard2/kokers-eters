import { Frequency, ParticipationMode, type Participant } from "@prisma/client";

type BalanceParticipant = Pick<
  Participant,
  "active" | "mode" | "comingWithCount" | "hostCapacity" | "eaterFrequency" | "hostFrequency"
>;

export type SignupBalanceTone = "balanced" | "hosts-needed" | "eaters-needed" | "starting";

export type SignupBalance = {
  eaterNeed: number;
  hostSupply: number;
  eaterPercent: number;
  hostPercent: number;
  tone: SignupBalanceTone;
  title: string;
  badge: string;
  description: string;
};

function frequencyWeight(frequency: Frequency | null) {
  if (frequency === Frequency.BIWEEKLY) {
    return 6;
  }

  if (frequency === Frequency.QUARTERLY) {
    return 1;
  }

  return 3;
}

function canEat(mode: ParticipationMode) {
  return mode === ParticipationMode.EAT || mode === ParticipationMode.BOTH;
}

function canHost(mode: ParticipationMode) {
  return mode === ParticipationMode.HOST || mode === ParticipationMode.BOTH;
}

function percent(value: number, max: number) {
  if (value <= 0 || max <= 0) {
    return 0;
  }

  return Math.max(6, Math.round((value / max) * 100));
}

export function calculateSignupBalance(participants: BalanceParticipant[]): SignupBalance {
  const activeParticipants = participants.filter((participant) => participant.active);
  const eaterNeed = activeParticipants.reduce((total, participant) => {
    if (!canEat(participant.mode)) {
      return total;
    }

    return total + Math.max(1, participant.comingWithCount) * frequencyWeight(participant.eaterFrequency);
  }, 0);
  const hostSupply = activeParticipants.reduce((total, participant) => {
    if (!canHost(participant.mode)) {
      return total;
    }

    return total + Math.max(0, participant.hostCapacity || 0) * frequencyWeight(participant.hostFrequency);
  }, 0);
  const max = Math.max(eaterNeed, hostSupply, 1);
  const eaterPercent = percent(eaterNeed, max);
  const hostPercent = percent(hostSupply, max);
  const gap = Math.abs(hostSupply - eaterNeed);
  const tolerance = Math.max(3, Math.round(max * 0.15));

  if (eaterNeed === 0 && hostSupply === 0) {
    return {
      eaterNeed,
      hostSupply,
      eaterPercent: 0,
      hostPercent: 0,
      tone: "starting",
      title: "De eerste aanmeldingen bepalen de balans.",
      badge: "Alles welkom",
      description:
        "Kies wat bij je past. Als je allebei kunt, helpt dat de planning straks het meest."
    };
  }

  if (hostSupply < eaterNeed && gap > tolerance) {
    return {
      eaterNeed,
      hostSupply,
      eaterPercent,
      hostPercent,
      tone: "hosts-needed",
      title: "Er zijn vooral kokers nodig.",
      badge: "Ontvangen helpt nu",
      description:
        'Kun je je tafel openzetten? Kies dan "Eters ontvangen" of "Allebei". Zo komen de eters makkelijker goed terecht.'
    };
  }

  if (eaterNeed < hostSupply && gap > tolerance) {
    return {
      eaterNeed,
      hostSupply,
      eaterPercent,
      hostPercent,
      tone: "eaters-needed",
      title: "Er is ruimte aan tafels.",
      badge: "Aanschuiven helpt nu",
      description:
        'Wil je bij iemand eten? Kies dan "Bij iemand eten" of "Allebei". Er zijn nu meer ontvangplekken dan eters.'
    };
  }

  return {
    eaterNeed,
    hostSupply,
    eaterPercent,
    hostPercent,
    tone: "balanced",
    title: "Kokers en eters zijn mooi in balans.",
    badge: "Kies wat past",
    description:
      'De planning kan hiermee goed rondkomen. "Allebei" blijft de meest flexibele keuze.'
  };
}
