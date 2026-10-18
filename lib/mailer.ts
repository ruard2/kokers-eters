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

function layout(title: string, body: string, footer = true) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#17211c;max-width:640px;margin:0 auto;padding:24px">
      <h1 style="font-size:24px;margin:0 0 16px">${escapeHtml(title)}</h1>
      ${body}
      ${footer ? '<p style="margin-top:28px;color:#5e6b62;font-size:14px">Eters &amp; Kokers</p>' : ""}
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
    // Only block on a confirmed SENT — not on earlier skips or errors,
    // so mails can be retried once a provider is configured.
    const existing = await prisma.emailLog.findFirst({
      where: {
        contextKey: input.contextKey,
        toEmail: input.to,
        type: input.type,
        status: "SENT"
      }
    });

    if (existing) {
      return { status: "skipped_existing" };
    }
  }

  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    // Log the skip WITHOUT contextKey so a future attempt (once the provider
    // is configured) is not blocked by this entry.
    await prisma.emailLog.create({
      data: {
        participantId: input.participantId,
        matchId: input.matchId,
        type: input.type,
        contextKey: null,
        toEmail: input.to,
        subject: input.subject,
        status: "SKIPPED_NO_PROVIDER"
      }
    });
    console.log(`[mail skipped] ${input.to} - ${input.subject}`);
    return { status: "skipped_no_provider" };
  }

  // Sender: same env var names as CommunityTools so the Railway secret can be shared.
  // BREVO_SENDER_EMAIL is the authenticated address (no-reply@communitytools.online).
  // MAILER_SENDER_NAME lets this app present itself as "Eters & Kokers" to recipients.
  const senderEmail = process.env.BREVO_SENDER_EMAIL ?? "no-reply@communitytools.online";
  const senderName = process.env.MAILER_SENDER_NAME ?? "Eters & Kokers";
  const sender = { name: senderName, email: senderEmail };

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

// ── Koppelingsmails ───────────────────────────────────────────────────────────
// Eén mail per koker per ronde (met alle gekoppelde eters) en één mail per
// koppeling naar de eter. Geen formulieren, geen dagen kiezen.

function personCount(size: number) {
  return size === 1 ? "1 persoon" : `${size} personen`;
}

export async function sendMatchHostMail(host: Participant, round: MatchRound, matches: MatchWithPeople[]) {
  const eaterList = matches
    .map((match) =>
      [
        `• ${match.eater.name} (${personCount(match.partySize)})`,
        `E-mail: ${match.eater.email}`,
        `Telefoon/WhatsApp: ${fallbackText(match.eater.whatsapp, "niet opgegeven")}`,
        `Allergieën of dieetwensen: ${fallbackText(match.eater.allergies, "geen")}`
      ].join("\n")
    )
    .join("\n\n");
  const multiple = matches.length > 1;

  const rendered = await renderMailTemplate("MATCH_HOST", {
    hostName: host.name,
    month: displayMonth(round.month),
    eaterList,
    // "Zij" reads better than a long list of names (couples already contain "en")
    eaterNames: multiple ? "Zij" : matches[0].eater.name,
    knowVerb: multiple ? "weten" : "weet",
    contactVerb: multiple ? "nemen" : "neemt",
    multipleNote: multiple
      ? "Je bent aan meer dan één persoon of gezin gekoppeld. Je mag zelf kiezen of je ze samen uitnodigt of één voor één."
      : ""
  }, host.organizationId);

  if (!rendered.enabled) {
    return { status: "skipped_disabled" };
  }

  return sendEmail({
    to: host.email,
    participantId: host.id,
    type: "MATCH_HOST",
    contextKey: `match-host:${round.id}:${host.id}`,
    subject: rendered.subject,
    html: layout(rendered.title, rendered.html, false)
  });
}

export async function sendMatchEaterMail(match: MatchWithPeople) {
  const rendered = await renderMailTemplate("MATCH_EATER", {
    eaterName: match.eater.name,
    hostName: match.host.name,
    hostEmail: match.host.email,
    hostWhatsapp: fallbackText(match.host.whatsapp, "niet opgegeven"),
    address: fallbackText(match.host.address, "vraag dit even na bij de koker"),
    month: displayMonth(match.round.month)
  }, match.eater.organizationId);

  if (!rendered.enabled) {
    return { status: "skipped_disabled" };
  }

  return sendEmail({
    to: match.eater.email,
    participantId: match.eaterId,
    matchId: match.id,
    type: "MATCH_EATER",
    contextKey: `match-eater:${match.id}`,
    subject: rendered.subject,
    html: layout(rendered.title, rendered.html, false)
  });
}
