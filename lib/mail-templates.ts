import { prisma } from "./db";

export type MailTemplateType =
  | "WELCOME"
  | "PREFERENCE_CHECK"
  | "HOST_INVITE"
  | "EATER_CHOICE"
  | "CONFIRMATION_HOST"
  | "CONFIRMATION_EATER"
  | "FALLBACK_HOST"
  | "FALLBACK_EATER";

export type MailTemplateDefinition = {
  type: MailTemplateType;
  label: string;
  description: string;
  title: string;
  subject: string;
  body: string;
  adminVisible?: boolean;
  defaultEnabled?: boolean;
};

export type TemplateValues = Record<string, string | number | null | undefined>;

export const mailTemplateDefinitions: MailTemplateDefinition[] = [
  {
    type: "WELCOME",
    label: "Welkom",
    description: "Naar iemand die zich aanmeldt.",
    title: "Je aanmelding staat erin",
    subject: "Je aanmelding voor Houvast staat erin",
    body: [
      "Hoi {{name}},",
      "",
      "Dankjewel. Je doet mee met de maaltijd-randomizer.",
      "",
      "Je kunt je voorkeuren later aanpassen via deze persoonlijke link:",
      "{{preferencesUrl}}"
    ].join("\n"),
    adminVisible: false
  },
  {
    type: "PREFERENCE_CHECK",
    label: "Meedoen-check",
    description: "Optioneel vooraf naar deelnemers: doe je deze ronde mee?",
    title: "Doe je mee in {{month}}?",
    subject: "Doe je mee in {{month}}?",
    body: [
      "Hoi {{name}},",
      "",
      "Over een paar dagen maken we de nieuwe ronde voor {{month}}. Geef kort aan of je deze ronde meedoet.",
      "",
      "Ja of nee doorgeven:",
      "{{participateUrl}}",
      "",
      "Voorkeuren wijzigen:",
      "{{preferencesUrl}}"
    ].join("\n"),
    adminVisible: true
  },
  {
    type: "HOST_INVITE",
    label: "Host kiest dagen",
    description: "Naar de koker/host na goedkeuring van de matches.",
    title: "Je bent gekoppeld als host",
    subject: "Houvast: kun je dagen kiezen voor {{eaterName}}?",
    body: [
      "Hoi {{hostName}},",
      "",
      "Voor {{month}} ben je gekoppeld aan {{eaterName}} ({{partySize}} persoon/personen).",
      "",
      "Contact eter:",
      "{{eaterName}}",
      "{{eaterEmail}}",
      "{{eaterWhatsapp}}",
      "",
      "Allergieen of dieetwensen:",
      "{{allergies}}",
      "",
      "Kies via deze link welke dagen kunnen. Daarna kiest de eter daaruit de definitieve dag:",
      "{{hostUrl}}",
      "",
      "Je mag ook rechtstreeks contact opnemen als dat sneller is.",
      "",
      "Voorkeuren wijzigen:",
      "{{preferencesUrl}}"
    ].join("\n"),
    adminVisible: true
  },
  {
    type: "EATER_CHOICE",
    label: "Eter kiest dag",
    description: "Naar de eter nadat de host dagen heeft gekozen.",
    title: "Kies je definitieve dag",
    subject: "Houvast: kies een dag bij {{hostName}}",
    body: [
      "Hoi {{eaterName}},",
      "",
      "Je bent gekoppeld aan {{hostName}}.",
      "",
      "Contact koker:",
      "{{hostName}}",
      "{{hostEmail}}",
      "{{hostWhatsapp}}",
      "{{address}}",
      "",
      "Opmerking of vraag van de host:",
      "{{hostNote}}",
      "",
      "Mogelijke dagen:",
      "{{dates}}",
      "",
      "Kies via deze link de definitieve dag:",
      "{{eaterUrl}}",
      "",
      "Je mag ook rechtstreeks contact opnemen als dat sneller is."
    ].join("\n"),
    adminVisible: true
  },
  {
    type: "CONFIRMATION_HOST",
    label: "Bevestiging host",
    description: "Naar de host nadat de eter een dag heeft gekozen.",
    title: "Jullie maaltijd is bevestigd",
    subject: "Houvast bevestigd: {{eaterName}} komt eten",
    body: [
      "De maaltijd is bevestigd.",
      "",
      "Datum: {{chosenDate}}",
      "",
      "Host:",
      "{{hostName}}",
      "{{hostEmail}}",
      "{{hostWhatsapp}}",
      "{{address}}",
      "",
      "Eter:",
      "{{eaterName}}",
      "{{eaterEmail}}",
      "{{eaterWhatsapp}}",
      "",
      "Allergieen of dieetwensen:",
      "{{allergies}}"
    ].join("\n"),
    adminVisible: true
  },
  {
    type: "CONFIRMATION_EATER",
    label: "Bevestiging eter",
    description: "Naar de eter nadat een dag is gekozen.",
    title: "Jullie maaltijd is bevestigd",
    subject: "Houvast bevestigd: eten bij {{hostName}}",
    body: [
      "De maaltijd is bevestigd.",
      "",
      "Datum: {{chosenDate}}",
      "",
      "Host:",
      "{{hostName}}",
      "{{hostEmail}}",
      "{{hostWhatsapp}}",
      "{{address}}",
      "",
      "Eter:",
      "{{eaterName}}",
      "{{eaterEmail}}",
      "{{eaterWhatsapp}}",
      "",
      "Allergieen of dieetwensen:",
      "{{allergies}}"
    ].join("\n"),
    adminVisible: true
  },
  {
    type: "FALLBACK_HOST",
    label: "Fallback host",
    description: "Naar de host als het formulier niet op tijd rond is.",
    title: "Jullie zijn gekoppeld",
    subject: "Houvast: neem contact op met {{eaterName}}",
    body: [
      "{{reasonText}} Jullie zijn wel aan elkaar gekoppeld, dus neem rechtstreeks contact met elkaar op.",
      "",
      "Mogelijke dagen: {{dates}}",
      "",
      "Host:",
      "{{hostName}}",
      "{{hostEmail}}",
      "{{hostWhatsapp}}",
      "{{address}}",
      "",
      "Eter:",
      "{{eaterName}}",
      "{{eaterEmail}}",
      "{{eaterWhatsapp}}",
      "",
      "Allergieen of dieetwensen:",
      "{{allergies}}"
    ].join("\n"),
    adminVisible: false,
    defaultEnabled: false
  },
  {
    type: "FALLBACK_EATER",
    label: "Fallback eter",
    description: "Naar de eter als het formulier niet op tijd rond is.",
    title: "Jullie zijn gekoppeld",
    subject: "Houvast: neem contact op met {{hostName}}",
    body: [
      "{{reasonText}} Jullie zijn wel aan elkaar gekoppeld, dus neem rechtstreeks contact met elkaar op.",
      "",
      "Mogelijke dagen: {{dates}}",
      "",
      "Host:",
      "{{hostName}}",
      "{{hostEmail}}",
      "{{hostWhatsapp}}",
      "{{address}}",
      "",
      "Eter:",
      "{{eaterName}}",
      "{{eaterEmail}}",
      "{{eaterWhatsapp}}",
      "",
      "Allergieen of dieetwensen:",
      "{{allergies}}"
    ].join("\n"),
    adminVisible: false,
    defaultEnabled: false
  }
];

export const adminMailTemplateDefinitions = mailTemplateDefinitions.filter((definition) => definition.adminVisible);

export function mailTemplateDefinition(type: string) {
  return mailTemplateDefinitions.find((definition) => definition.type === type) || null;
}

export function replaceTemplateValues(template: string, values: TemplateValues) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) =>
    String(values[key] ?? "")
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function linkify(value: string) {
  return value.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
}

export function plainTextToHtml(value: string) {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${linkify(escapeHtml(paragraph)).replaceAll("\n", "<br />")}</p>`)
    .join("");
}

export async function renderMailTemplate(type: MailTemplateType, values: TemplateValues) {
  const definition = mailTemplateDefinition(type);
  if (!definition) {
    throw new Error(`Onbekend mailtemplate: ${type}`);
  }

  const saved = await prisma.mailTemplate.findUnique({
    where: { type }
  });
  const subject = replaceTemplateValues(saved?.subject || definition.subject, values);
  const title = replaceTemplateValues(definition.title, values);
  const body = replaceTemplateValues(saved?.body || definition.body, values);
  const enabled = saved?.enabled ?? definition.defaultEnabled ?? true;

  return {
    subject,
    title,
    html: plainTextToHtml(body),
    enabled
  };
}
