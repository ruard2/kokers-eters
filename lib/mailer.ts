import type { MealMatch, MatchRound, Participant } from "@prisma/client";
import { Resend } from "resend";
import { displayDate, displayMonth, jsonDateList, monthInputValue } from "./dates";
import { prisma } from "./db";
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

function paragraph(value: string | null | undefined, fallback = "Geen bijzonderheden opgegeven.") {
  return `<p>${escapeHtml(value || fallback).replaceAll("\n", "<br />")}</p>`;
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
  return sendEmail({
    to: participant.email,
    participantId: participant.id,
    type: "WELCOME",
    subject: "Je aanmelding voor Houvast staat erin",
    html: layout(
      "Je aanmelding staat erin",
      `<p>Dankjewel, ${escapeHtml(participant.name)}. Je doet mee met de maaltijd-randomizer.</p>
       <p>Je kunt je voorkeuren later aanpassen via deze persoonlijke link:</p>
       <p><a href="${preferencesUrl}">${preferencesUrl}</a></p>`
    )
  });
}

export async function sendPreferenceCheck(participant: Participant, month: Date) {
  const monthKey = monthInputValue(month);
  const participateUrl = appUrl(`/meedoen/${participant.preferenceToken}?month=${monthKey}`);
  const preferencesUrl = appUrl(`/voorkeuren/${participant.preferenceToken}`);

  return sendEmail({
    to: participant.email,
    participantId: participant.id,
    type: "PREFERENCE_CHECK",
    contextKey: `preference-check:${participant.id}:${monthKey}`,
    subject: `Doe je mee in ${displayMonth(month)}?`,
    html: layout(
      `Doe je mee in ${displayMonth(month)}?`,
      `<p>Over een paar dagen maken we de nieuwe ronde. Geef kort aan of je deze ronde meedoet.</p>
       <p><a href="${participateUrl}">Ja of nee doorgeven</a></p>
       <p>Voorkeuren wijzigen kan hier:</p>
       <p><a href="${preferencesUrl}">${preferencesUrl}</a></p>`
    )
  });
}

export async function sendHostInvite(match: MatchWithPeople) {
  const hostUrl = appUrl(`/koker/${match.hostToken}`);
  const preferencesUrl = appUrl(`/voorkeuren/${match.host.preferenceToken}`);
  return sendEmail({
    to: match.host.email,
    participantId: match.hostId,
    matchId: match.id,
    type: "HOST_INVITE",
    subject: `Houvast: kun je dagen kiezen voor ${match.eater.name}?`,
    html: layout(
      "Je bent gekoppeld als host",
      `<p>Hoi ${escapeHtml(match.host.name)},</p>
       <p>Voor ${displayMonth(match.round.month)} ben je gekoppeld aan ${escapeHtml(match.eater.name)} (${match.partySize} persoon/personen).</p>
       <p><strong>Allergieën of dieetwensen:</strong></p>
       ${paragraph(match.eater.allergies)}
       <p>Kies via deze link welke dagen kunnen. Daarna kiest de eter daaruit de definitieve dag.</p>
       <p><a href="${hostUrl}">${hostUrl}</a></p>
       <p>Voorkeuren wijzigen kan hier:</p>
       <p><a href="${preferencesUrl}">${preferencesUrl}</a></p>`
    )
  });
}

export async function sendEaterChoiceEmail(match: MatchWithPeople) {
  const eaterUrl = appUrl(`/eter/${match.eaterToken}`);
  const dates = jsonDateList(match.proposedDates);
  const dateList = dates.map((date) => `<li>${displayDate(date)}</li>`).join("");

  return sendEmail({
    to: match.eater.email,
    participantId: match.eaterId,
    matchId: match.id,
    type: "EATER_CHOICE",
    subject: `Houvast: kies een dag bij ${match.host.name}`,
    html: layout(
      "Kies je definitieve dag",
      `<p>Hoi ${escapeHtml(match.eater.name)},</p>
       <p>Je bent gekoppeld aan ${escapeHtml(match.host.name)}.</p>
       <p><strong>Adres:</strong><br />${escapeHtml(match.host.address || "Adres volgt via de host.")}</p>
       <p><strong>Wat de host ongeveer maakt:</strong></p>
       ${paragraph(match.host.cookingPlan)}
       <p><strong>Opmerking of vraag van de host:</strong></p>
       ${paragraph(match.hostNote)}
       <p><strong>Mogelijke dagen:</strong></p>
       <ul>${dateList}</ul>
       <p>Kies via deze link de definitieve dag:</p>
       <p><a href="${eaterUrl}">${eaterUrl}</a></p>`
    )
  });
}

export async function sendConfirmationEmails(match: MatchWithPeople) {
  const chosen = match.chosenDate ? displayDate(match.chosenDate) : "Nog niet gekozen";
  const details = `
    <p><strong>Datum:</strong> ${escapeHtml(chosen)}</p>
    <p><strong>Host:</strong> ${escapeHtml(match.host.name)}<br />
    ${escapeHtml(match.host.email)}<br />
    ${escapeHtml(match.host.whatsapp)}<br />
    ${escapeHtml(match.host.address || "")}</p>
    <p><strong>Eter:</strong> ${escapeHtml(match.eater.name)}<br />
    ${escapeHtml(match.eater.email)}<br />
    ${escapeHtml(match.eater.whatsapp)}</p>
    <p><strong>Allergieën of dieetwensen:</strong></p>
    ${paragraph(match.eater.allergies)}
  `;

  await sendEmail({
    to: match.host.email,
    participantId: match.hostId,
    matchId: match.id,
    type: "CONFIRMATION_HOST",
    subject: `Houvast bevestigd: ${match.eater.name} komt eten`,
    html: layout("Jullie maaltijd is bevestigd", details)
  });

  return sendEmail({
    to: match.eater.email,
    participantId: match.eaterId,
    matchId: match.id,
    type: "CONFIRMATION_EATER",
    subject: `Houvast bevestigd: eten bij ${match.host.name}`,
    html: layout("Jullie maaltijd is bevestigd", details)
  });
}

export async function sendFallbackEmails(match: MatchWithPeople, reason: "host" | "eater") {
  const dates = jsonDateList(match.proposedDates);
  const dateText = dates.length > 0 ? dates.map(displayDate).join(", ") : "spreek samen een moment af";
  const reasonText =
    reason === "host"
      ? "De host heeft nog geen dagen gekozen."
      : "Er is nog geen definitieve dag gekozen.";
  const details = `
    <p>${reasonText} Jullie zijn wel aan elkaar gekoppeld, dus neem rechtstreeks contact met elkaar op.</p>
    <p><strong>Mogelijke dagen:</strong> ${escapeHtml(dateText)}</p>
    <p><strong>Host:</strong><br />
    ${escapeHtml(match.host.name)}<br />
    ${escapeHtml(match.host.email)}<br />
    ${escapeHtml(match.host.whatsapp)}<br />
    ${escapeHtml(match.host.address || "")}</p>
    <p><strong>Eter:</strong><br />
    ${escapeHtml(match.eater.name)}<br />
    ${escapeHtml(match.eater.email)}<br />
    ${escapeHtml(match.eater.whatsapp)}</p>
    <p><strong>Allergieën of dieetwensen:</strong></p>
    ${paragraph(match.eater.allergies)}
  `;

  await sendEmail({
    to: match.host.email,
    participantId: match.hostId,
    matchId: match.id,
    type: "FALLBACK_HOST",
    subject: `Houvast: neem contact op met ${match.eater.name}`,
    html: layout("Jullie zijn gekoppeld", details)
  });

  return sendEmail({
    to: match.eater.email,
    participantId: match.eaterId,
    matchId: match.id,
    type: "FALLBACK_EATER",
    subject: `Houvast: neem contact op met ${match.host.name}`,
    html: layout("Jullie zijn gekoppeld", details)
  });
}
