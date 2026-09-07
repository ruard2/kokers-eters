import type { MealMatch, MatchRound, Participant } from "@prisma/client";
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
      <p style="margin-top:28px;color:#5e6b62;font-size:14px">Eters &amp; Kokers</p>
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

  const apiKey = process.env.BREVO_API_KEY;

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

  // Parse EMAIL_FROM into Brevo's sender object.
  // Accepts "Naam <adres@domein.nl>" or plain "adres@domein.nl".
  const fromRaw = process.env.EMAIL_FROM || "Eters & Kokers <noreply@example.nl>";
  const fromMatch = fromRaw.match(/^(.*?)\s*<(.+?)>$/);
  const sender = fromMatch
    ? { name: fromMatch[1].trim(), email: fromMatch[2].trim() }
    : { email: fromRaw.trim() };

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
      accept: "application/json"
    },
    body: JSON.stringify({
      sender,
      to: [{ email: input.to }],
      subject: input.subject,
      htmlContent: input.html
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { message?: string };
    const errorMessage = err.message || `Brevo HTTP ${response.status}`;
    await prisma.emailLog.create({
      data: {
        participantId: input.participantId,
        matchId: input.matchId,
        type: input.type,
        contextKey: input.contextKey,
        toEmail: input.to,
        subject: input.subject,
        status: "ERROR",
        error: errorMessage
      }
    });
    throw new Error(errorMessage);
  }

  const data = await response.json() as { messageId?: string };

  await prisma.emailLog.create({
    data: {
      participantId: input.participantId,
      matchId: input.matchId,
      type: input.type,
      contextKey: input.contextKey,
      toEmail: input.to,
      subject: input.subject,
      status: "SENT",
      providerId: data.messageId
    }
  });

  return { status: "sent" };
}

export async function sendWelcomeEmail(participant: Participant) {
  const preferencesUrl = appUrl(`/voorkeuren/${participant.preferenceToken}`);
  const rendered = await renderMailTemplate("WELCOME", {
    name: participant.name,
    preferencesUrl
  }, participant.organizationId);

  if (!rendered.enabled) {
    return { status: "skipped_disabled" };
  }

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
  }, participant.organizationId);

  if (!rendered.enabled) {
    return { status: "skipped_disabled" };
  }

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
    eaterEmail: match.eater.email,
    eaterWhatsapp: match.eater.whatsapp,
    month: displayMonth(match.round.month),
    partySize: match.partySize,
    allergies: fallbackText(match.eater.allergies),
    hostUrl,
    preferencesUrl
  }, match.host.organizationId);

  if (!rendered.enabled) {
    return { status: "skipped_disabled" };
  }

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
    hostEmail: match.host.email,
    hostWhatsapp: match.host.whatsapp,
    address: fallbackText(match.host.address, "Adres volgt via de host."),
    hostNote: fallbackText(match.hostNote),
    dates: dateText(match.proposedDates),
    eaterUrl
  }, match.eater.organizationId);

  if (!rendered.enabled) {
    return { status: "skipped_disabled" };
  }

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
  const hostRendered = await renderMailTemplate(
    "CONFIRMATION_HOST",
    values,
    match.host.organizationId
  );
  const eaterRendered = await renderMailTemplate(
    "CONFIRMATION_EATER",
    values,
    match.eater.organizationId
  );

  if (hostRendered.enabled) {
    await sendEmail({
      to: match.host.email,
      participantId: match.hostId,
      matchId: match.id,
      type: "CONFIRMATION_HOST",
      subject: hostRendered.subject,
      html: layout(hostRendered.title, hostRendered.html)
    });
  }

  if (!eaterRendered.enabled) {
    return { status: "skipped_disabled" };
  }

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
  const hostRendered = await renderMailTemplate(
    "FALLBACK_HOST",
    values,
    match.host.organizationId
  );
  const eaterRendered = await renderMailTemplate(
    "FALLBACK_EATER",
    values,
    match.eater.organizationId
  );

  if (hostRendered.enabled) {
    await sendEmail({
      to: match.host.email,
      participantId: match.hostId,
      matchId: match.id,
      type: "FALLBACK_HOST",
      subject: hostRendered.subject,
      html: layout(hostRendered.title, hostRendered.html)
    });
  }

  if (!eaterRendered.enabled) {
    return { status: "skipped_disabled" };
  }

  return sendEmail({
    to: match.eater.email,
    participantId: match.eaterId,
    matchId: match.id,
    type: "FALLBACK_EATER",
    subject: eaterRendered.subject,
    html: layout(eaterRendered.title, eaterRendered.html)
  });
}
