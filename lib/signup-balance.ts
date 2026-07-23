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
      description: "Er zijn nog weinig aanmeldingen. Kies wat bij je past. Allebei helpt de planning het meest."
    };
  }

  if (hostSupply < eaterNeed && gap > tolerance) {
    return {
      eaterNeed,
      hostSupply,
      eaterPercent,
      hostPercent,
      tone: "hosts-needed",
      description:
        'Er zijn op dit moment meer mensen die willen eten dan mensen die kunnen koken. Kies dus vooral "Eters ontvangen" of "Allebei".'
    };
  }

  if (eaterNeed < hostSupply && gap > tolerance) {
    return {
      eaterNeed,
      hostSupply,
      eaterPercent,
      hostPercent,
      tone: "eaters-needed",
      description:
        'Er zijn op dit moment meer mensen die willen koken dan eten. Kies dus vooral "Bij iemand eten" of "Allebei".'
    };
  }

  return {
    eaterNeed,
    hostSupply,
    eaterPercent,
    hostPercent,
    tone: "balanced",
    description: 'Kokers en eters zijn nu ongeveer in balans. Kies gewoon wat bij je past. "Allebei" mag natuurlijk ook.'
  };
}
