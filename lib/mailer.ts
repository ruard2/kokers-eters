import type { MealMatch, MatchRound, Participant } from "@prisma/client";
import { Resend } from "resend";
import { adminToken } from "./admin";
import { displayDate, displayMonth, jsonDateList, monthInputValue } from "./dates";
import { prisma } from "./db";
import { renderMailTemplate } from "./mail-templates";
import { appUrl } from "./urls";

type MatchWithPeople = MealMatch & {
  host: Participant;
  eater: Participant;
  round: MatchRound;
};

type EmailInput = {
  to: string;
  subject: string;
  html: string;
  type: string;
  participantId?: string;
  matchId?: string;
  contextKey?: string;
};

function escapeHtml(value: string | null | undefined) {
  return (value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function layout(title: string, body: string) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#17211c;max-width:640px;margin:0 auto;padding:24px">
      <h1 style="font-size:24px;margin:0 0 16px">${escapeHtml(title)}</h1>
      ${body}
      <p style="margin-top:28px;color:#5e6b62;font-size:14px">Houvast maaltijd-randomizer</p>
    </div>
  `;
}

function fallbackText(value: string | null | undefined, fallback = "Geen bijzonderheden opgegeven.") {
  return value?.trim() || fallback;
}

function dateText(value: unknown) {
  const dates = jsonDateList(value);
  return dates.length > 0 ? dates.map(displayDate).join("\n") : "spreek samen een moment af";
}

function adminUrl(params: Record<string, string>) {
  const query = new URLSearchParams({
    key: adminToken(),
    ...params
  });
  return appUrl(`/?${query.toString()}`);
}

function participantValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "boolean") {
    return value ? "ja" : "nee";
  }

  return String(value);
}

function participantFieldValue(key: keyof Participant, value: unknown) {
  if (key === "isGuest") {
    return value ? "Gast" : "Gemeentelid";
  }

  return participantValue(value);
}

function participantChanges(previous: Participant | null | undefined, next: Participant) {
  if (!previous) {
    return "Nieuwe aanmelding.";
  }

  const fields: Array<[keyof Participant, string]> = [
    ["name", "Naam"],
    ["email", "E-mail"],
    ["whatsapp", "WhatsApp"],
    ["mode", "Rol"],
    ["comingWithCount", "Komt met"],
    ["hostCapacity", "Kan ontvangen"],
    ["eaterFrequency", "Frequentie eten"],
    ["hostFrequency", "Frequentie koken"],
    ["allergies", "Allergieen/dieet"],
    ["address", "Adres"],
    ["cannotEatDays", "Kan niet eten"],
    ["cannotHostDays", "Kan niet koken"],
    ["isGuest", "Wat ben je"],
    ["gatheringType", "Vorm"],
    ["active", "Actief"]
  ];

  const changes = fields
    .filter(([key]) => participantFieldValue(key, previous[key]) !== participantFieldValue(key, next[key]))
    .map(([key, label]) => `${label}: ${participantFieldValue(key, previous[key])} -> ${participantFieldValue(key, next[key])}`);

  return changes.length > 0 ? changes.join("\n") : "Geen inhoudelijke wijziging gevonden.";
}

export async function sendEmail(input: EmailInput) {
  if (input.contextKey) {
    const existing = await prisma.emailLog.findFirst({
      where: {
        contextKey: input.contextKey,
        toEmail: input.to,
        type: input.type
      }
    });

    if (existing) {
      return { status: "skipped_existing" };
    }
  }

  const from = process.env.EMAIL_FROM || "Houvast <noreply@example.nl>";
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    await prisma.emailLog.create({
      data: {
        participantId: input.participantId,
        matchId: input.matchId,
        type: input.type,
        contextKey: input.contextKey,
        toEmail: input.to,
        subject: input.subject,
        status: "SKIPPED_NO_PROVIDER"
      }
    });
    console.log(`[mail skipped] ${input.to} - ${input.subject}`);
    return { status: "skipped_no_provider" };
  }

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html
  });

  if (result.error) {
    await prisma.emailLog.create({
      data: {
        participantId: input.participantId,
        matchId: input.matchId,
        type: input.type,
        contextKey: input.contextKey,
        toEmail: input.to,
        subject: input.subject,
        status: "ERROR",
        error: result.error.message
      }
    });
    throw new Error(result.error.message);
  }

  await prisma.emailLog.create({
    data: {
      participantId: input.participantId,
      matchId: input.matchId,
      type: input.type,
      contextKey: input.contextKey,
      toEmail: input.to,
      subject: input.subject,
      status: "SENT",
      providerId: result.data?.id
    }
  });

  return { status: "sent" };
}

export async function sendWelcomeEmail(participant: Participant) {
  const preferencesUrl = appUrl(`/voorkeuren/${participant.preferenceToken}`);
  const rendered = await renderMailTemplate("WELCOME", {
    name: participant.name,
    preferencesUrl
  });

  return sendEmail({
    to: participant.email,
    participantId: participant.id,
    type: "WELCOME",
    subject: rendered.subject,
    html: layout(rendered.title, rendered.html)
  });
}

export async function sendPreferenceCheck(participant: Participant, month: Date) {
  const monthKey = monthInputValue(month);
  const participateUrl = appUrl(`/meedoen/${participant.preferenceToken}?month=${monthKey}`);
  const preferencesUrl = appUrl(`/voorkeuren/${participant.preferenceToken}`);
  const rendered = await renderMailTemplate("PREFERENCE_CHECK", {
    name: participant.name,
    month: displayMonth(month),
    participateUrl,
    preferencesUrl
  });

  return sendEmail({
    to: participant.email,
    participantId: participant.id,
    type: "PREFERENCE_CHECK",
    contextKey: `preference-check:${participant.id}:${monthKey}`,
    subject: rendered.subject,
    html: layout(rendered.title, rendered.html)
  });
}

export async function sendHostInvite(match: MatchWithPeople) {
  const hostUrl = appUrl(`/koker/${match.hostToken}`);
  const preferencesUrl = appUrl(`/voorkeuren/${match.host.preferenceToken}`);
  const rendered = await renderMailTemplate("HOST_INVITE", {
    hostName: match.host.name,
    eaterName: match.eater.name,
    month: displayMonth(match.round.month),
    partySize: match.partySize,
    allergies: fallbackText(match.eater.allergies),
    hostUrl,
    preferencesUrl
  });

  return sendEmail({
    to: match.host.email,
    participantId: match.hostId,
    matchId: match.id,
    type: "HOST_INVITE",
    subject: rendered.subject,
    html: layout(rendered.title, rendered.html)
  });
}

export async function sendEaterChoiceEmail(match: MatchWithPeople) {
  const eaterUrl = appUrl(`/eter/${match.eaterToken}`);
  const rendered = await renderMailTemplate("EATER_CHOICE", {
    eaterName: match.eater.name,
    hostName: match.host.name,
    address: fallbackText(match.host.address, "Adres volgt via de host."),
    hostNote: fallbackText(match.hostNote),
    dates: dateText(match.proposedDates),
    eaterUrl
  });

  return sendEmail({
    to: match.eater.email,
    participantId: match.eaterId,
    matchId: match.id,
    type: "EATER_CHOICE",
    subject: rendered.subject,
    html: layout(rendered.title, rendered.html)
  });
}

export async function sendConfirmationEmails(match: MatchWithPeople) {
  const chosen = match.chosenDate ? displayDate(match.chosenDate) : "Nog niet gekozen";
  const values = {
    chosenDate: chosen,
    hostName: match.host.name,
    hostEmail: match.host.email,
    hostWhatsapp: match.host.whatsapp,
    eaterName: match.eater.name,
    eaterEmail: match.eater.email,
    eaterWhatsapp: match.eater.whatsapp,
    address: fallbackText(match.host.address, "-"),
    allergies: fallbackText(match.eater.allergies)
  };
  const hostRendered = await renderMailTemplate("CONFIRMATION_HOST", values);
  const eaterRendered = await renderMailTemplate("CONFIRMATION_EATER", values);

  await sendEmail({
    to: match.host.email,
    participantId: match.hostId,
    matchId: match.id,
    type: "CONFIRMATION_HOST",
    subject: hostRendered.subject,
    html: layout(hostRendered.title, hostRendered.html)
  });

  return sendEmail({
    to: match.eater.email,
    participantId: match.eaterId,
    matchId: match.id,
    type: "CONFIRMATION_EATER",
    subject: eaterRendered.subject,
    html: layout(eaterRendered.title, eaterRendered.html)
  });
}

export async function sendFallbackEmails(match: MatchWithPeople, reason: "host" | "eater") {
  const reasonText =
    reason === "host" ? "De host heeft nog geen dagen gekozen." : "Er is nog geen definitieve dag gekozen.";
  const values = {
    reasonText,
    dates: dateText(match.proposedDates),
    hostName: match.host.name,
    hostEmail: match.host.email,
    hostWhatsapp: match.host.whatsapp,
    eaterName: match.eater.name,
    eaterEmail: match.eater.email,
    eaterWhatsapp: match.eater.whatsapp,
    address: fallbackText(match.host.address, "-"),
    allergies: fallbackText(match.eater.allergies)
  };
  const hostRendered = await renderMailTemplate("FALLBACK_HOST", values);
  const eaterRendered = await renderMailTemplate("FALLBACK_EATER", values);

  await sendEmail({
    to: match.host.email,
    participantId: match.hostId,
    matchId: match.id,
    type: "FALLBACK_HOST",
    subject: hostRendered.subject,
    html: layout(hostRendered.title, hostRendered.html)
  });

  return sendEmail({
    to: match.eater.email,
    participantId: match.eaterId,
    matchId: match.id,
    type: "FALLBACK_EATER",
    subject: eaterRendered.subject,
    html: layout(eaterRendered.title, eaterRendered.html)
  });
}

export async function sendAdminParticipantNotice(
  participant: Participant,
  action: "created" | "updated",
  previous?: Participant | null
) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    return { status: "skipped_no_admin_email" };
  }

  const actionLabel = action === "created" ? "Nieuwe aanmelding" : "Wijziging in aanmelding";
  const rendered = await renderMailTemplate("ADMIN_PARTICIPANT_NOTICE", {
    actionLabel,
    name: participant.name,
    email: participant.email,
    whatsapp: participant.whatsapp,
    changes: participantChanges(previous, participant),
    adminEditUrl: adminUrl({ step: "participants", sheet: "1" }),
    adminOkUrl: adminUrl({ step: "summary" })
  });

  return sendEmail({
    to: adminEmail,
    participantId: participant.id,
    type: "ADMIN_PARTICIPANT_NOTICE",
    contextKey: `admin-participant:${participant.id}:${participant.updatedAt.getTime()}`,
    subject: rendered.subject,
    html: layout(rendered.title, rendered.html)
  });
}

export async function sendAdminRenewalReminder(month: Date) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    return { status: "skipped_no_admin_email" };
  }

  const monthKey = monthInputValue(month);
  const rendered = await renderMailTemplate("ADMIN_RENEWAL_REMINDER", {
    adminUrl: adminUrl({ step: "planning" })
  });

  return sendEmail({
    to: adminEmail,
    type: "ADMIN_RENEWAL_REMINDER",
    contextKey: `admin-renewal:${monthKey}`,
    subject: rendered.subject,
    html: layout(rendered.title, rendered.html)
  });
}
