import type { EmailLog, MailTemplate, MatchRound, MealMatch, Participant, PlanningSettings } from "@prisma/client";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import {
  cancelMatchAction,
  clearDemoAction,
  deleteParticipantAction,
  generatePlanningAction,
  reopenRoundAction,
  seedDemoAction,
  saveAdminParticipantAction,
  saveMailTemplateAction,
  sendHostInvitesAction,
  sendPreferenceChecksAction
} from "@/app/actions";
import { AdminMatchBoard, type BoardMatch, type BoardRosterParticipant } from "@/components/AdminMatchBoard";
import { CopyButton } from "@/components/CopyButton";
import { CopyQrButton } from "@/components/CopyQrButton";
import { demoSeedEnabled, resolveAdminContext } from "@/lib/admin";
import { addMonths, displayDate, displayMonth, jsonDateList, monthInputValue, parseMonthInput, toMonthStart } from "@/lib/dates";
import { demoAdminData } from "@/lib/demo-data";
import { prisma } from "@/lib/db";
import { adminMailTemplateDefinitions } from "@/lib/mail-templates";
import { appUrl } from "@/lib/urls";
import { defaultPlanningSettings, type PlanningSettingsView } from "@/lib/planning";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type RoundWithMatches = MatchRound & {
  matches: MealMatch[];
};

type MatchWithPeople = MealMatch & {
  host: Participant;
  eater: Participant;
  round: MatchRound;
};

type StepKey = "participants" | "planning" | "mails" | "summary";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function activeStep(value: string | string[] | undefined): StepKey | "" {
  const step = first(value);
  if (step === "review") return "planning";
  const keys: StepKey[] = ["participants", "planning", "mails", "summary"];
  return keys.includes(step as StepKey) ? (step as StepKey) : "";
}

function adminHref(key: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams({ key, ...params });
  return `/?${query.toString()}`;
}

function boardParticipant(participant: Participant) {
  return {
    id: participant.id,
    name: participant.name,
    email: participant.email,
    whatsapp: participant.whatsapp,
    mode: participant.mode,
    hostCapacity: participant.hostCapacity,
    allergies: participant.allergies,
    address: participant.address,
    cannotEatDays: participant.cannotEatDays,
    cannotHostDays: participant.cannotHostDays,
    adminNoMatch: participant.adminNoMatch,
    cookingPlan: participant.cookingPlan,
    communityScope: participant.communityScope,
    gatheringType: participant.gatheringType
  };
}

function boardRosterParticipant(participant: Participant): BoardRosterParticipant {
  return {
    id: participant.id,
    name: participant.name,
    email: participant.email,
    adminNoMatch: participant.adminNoMatch
  };
}

function boardMatch(match: MatchWithPeople): BoardMatch {
  return {
    id: match.id,
    roundId: match.roundId,
    status: match.status,
    partySize: match.partySize,
    host: boardParticipant(match.host),
    eater: boardParticipant(match.eater)
  };
}

function planningSettingsView(settings: PlanningSettings | null): PlanningSettingsView {
  return settings
    ? {
        horizonMonths: settings.horizonMonths,
        adminCheckDaysBefore: settings.adminCheckDaysBefore,
        hostMailDaysBefore: settings.hostMailDaysBefore,
        eaterMailDelayDays: settings.eaterMailDelayDays,
        reminderDaysAfter: settings.reminderDaysAfter,
        renewalCadence: settings.renewalCadence
      }
    : defaultPlanningSettings;
}

type T = Awaited<ReturnType<typeof getTranslations<"admin">>>;

function StepShell({
  children,
  eyebrow,
  title,
  closeHref,
  closeLabel
}: {
  children: ReactNode;
  eyebrow: string;
  title: string;
  closeHref: string;
  closeLabel: string;
}) {
  return (
    <section className="panel step-detail">
      <div className="section-header step-detail-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <a className="button secondary small" href={closeHref}>
          {closeLabel}
        </a>
      </div>
      {children}
    </section>
  );
}

function StepBar({ current, adminKey, t }: { current: StepKey | ""; adminKey: string; t: T }) {
  const steps: Array<{ key: StepKey; label: string; helper: string }> = [
    { key: "participants", label: t("steps.participants"), helper: t("steps.participantsHelper") },
    { key: "planning", label: t("steps.planning"), helper: t("steps.planningHelper") },
    { key: "mails", label: t("steps.mails"), helper: t("steps.mailsHelper") },
    { key: "summary", label: t("steps.summary"), helper: t("steps.summaryHelper") }
  ];

  return (
    <nav aria-label={t("navAriaLabel")} className="flow-steps">
      {steps.map((step, index) => (
        <div className="flow-step-wrap" key={step.key}>
          <a className={`flow-step ${current === step.key ? "active" : ""}`} href={adminHref(adminKey, { step: step.key })}>
            <span className="flow-number">{index + 1}</span>
            <span>
              <strong>{step.label}</strong>
              <small>{step.helper}</small>
            </span>
          </a>
          {index < steps.length - 1 ? <span className="flow-arrow">-&gt;</span> : null}
        </div>
      ))}
    </nav>
  );
}

function DemoTools({ adminKey, t }: { adminKey: string; t: T }) {
  if (!demoSeedEnabled()) return null;

  return (
    <div className="panel demo-panel">
      <p className="eyebrow">Demo</p>
      <form action={seedDemoAction}>
        <input type="hidden" name="adminKey" value={adminKey} />
        <button className="small" type="submit">{t("demoLoadBtn")}</button>
      </form>
      <form action={clearDemoAction}>
        <input type="hidden" name="adminKey" value={adminKey} />
        <button className="small danger" type="submit">{t("demoClearBtn")}</button>
      </form>
    </div>
  );
}

function modeLabel(value: string, t: T) {
  if (value === "EAT") return t("modeEat");
  if (value === "HOST") return t("modeHost");
  return t("modeBoth");
}

function participantKindLabel(isGuest: boolean, t: T) {
  return isGuest ? t("kindGuest") : t("kindMember");
}

function gatheringLabel(value: string, t: T) {
  if (value === "MEAL") return t("gatheringMeal");
  if (value === "COFFEE_TEA") return t("gatheringCoffee");
  return t("gatheringBoth");
}

function statusLabel(value: string, t: T) {
  const map: Record<string, string> = {
    DRAFT: "statusDraft",
    HOST_INVITED: "statusHostInvited",
    HOST_RESPONDED: "statusHostResponded",
    EATER_INVITED: "statusEaterInvited",
    EATER_CONFIRMED: "statusEaterConfirmed",
    FALLBACK_SENT: "statusFallbackSent",
    CANCELLED: "statusCancelled"
  };
  const key = map[value];
  return key ? t(key as Parameters<T>[0]) : value;
}

function planningHorizonLabel(value: number, t: T) {
  if (value === 12) return t("horizonYear");
  if (value === 3) return t("horizonQuarter");
  return t("horizonRound");
}

function ParticipantSheet({
  adminKey,
  participants,
  usingDemoData,
  t
}: {
  adminKey: string;
  participants: Participant[];
  usingDemoData: boolean;
  t: T;
}) {
  return (
    <div className="participant-sheet">
      <div className="participant-sheet-head">
        <span>{t("sheetColNum")}</span>
        <span>{t("sheetColName")}</span>
        <span>{t("sheetColEmail")}</span>
        <span>{t("sheetColWhatsapp")}</span>
        <span>{t("sheetColKind")}</span>
        <span>{t("sheetColRole")}</span>
        <span>{t("sheetColComing")}</span>
        <span>{t("sheetColReceives")}</span>
        <span>{t("sheetColNoMatch")}</span>
        <span>{t("sheetColActive")}</span>
        <span>{t("sheetColSave")}</span>
        <span>{t("sheetColDelete")}</span>
      </div>

      <form action={saveAdminParticipantAction} className="participant-sheet-row new-row">
        <input type="hidden" name="adminKey" value={adminKey} />
        <span className="sheet-number">{t("sheetNew")}</span>
        <input aria-label={t("sheetColName")} disabled={usingDemoData} name="name" placeholder={t("sheetNamePlaceholder")} />
        <input aria-label={t("sheetColEmail")} disabled={usingDemoData} name="email" placeholder={t("sheetEmailPlaceholder")} />
        <input aria-label={t("sheetColWhatsapp")} disabled={usingDemoData} name="whatsapp" placeholder={t("sheetWhatsappPlaceholder")} />
        <label className="sheet-check sheet-check-text">
          <input disabled={usingDemoData} name="isGuest" type="checkbox" />
          <span>{t("sheetGuestLabel")}</span>
        </label>
        <select aria-label={t("sheetColRole")} defaultValue="BOTH" disabled={usingDemoData} name="mode">
          <option value="BOTH">{t("sheetModeAll")}</option>
          <option value="EAT">{t("sheetModeEat")}</option>
          <option value="HOST">{t("sheetModeHost")}</option>
        </select>
        <input aria-label={t("sheetColComing")} defaultValue={1} disabled={usingDemoData} min={1} name="comingWithCount" type="number" />
        <input aria-label={t("sheetColReceives")} defaultValue={4} disabled={usingDemoData} min={1} name="hostCapacity" type="number" />
        <input aria-label={t("sheetColNoMatch")} disabled={usingDemoData} name="adminNoMatch" placeholder="#3, naam of e-mail" />
        <label className="sheet-check">
          <input defaultChecked disabled={usingDemoData} name="active" type="checkbox" />
        </label>
        <button className="small" disabled={usingDemoData} type="submit">{t("sheetAddBtn")}</button>
        <span />
      </form>

      {participants.map((participant, index) => (
        <form action={saveAdminParticipantAction} className="participant-sheet-row" key={participant.id}>
          <input type="hidden" name="adminKey" value={adminKey} />
          <input type="hidden" name="participantId" value={participant.id} />
          <span className="sheet-number">{index + 1}</span>
          <input aria-label={`${t("sheetColName")} ${participant.name}`} defaultValue={participant.name} disabled={usingDemoData} name="name" />
          <input aria-label={`${t("sheetColEmail")} ${participant.name}`} defaultValue={participant.email} disabled={usingDemoData} name="email" />
          <input aria-label={`${t("sheetColWhatsapp")} ${participant.name}`} defaultValue={participant.whatsapp} disabled={usingDemoData} name="whatsapp" />
          <label className="sheet-check sheet-check-text">
            <input defaultChecked={participant.isGuest} disabled={usingDemoData} name="isGuest" type="checkbox" />
            <span>{t("sheetGuestLabel")}</span>
          </label>
          <select aria-label={`${t("sheetColRole")} ${participant.name}`} defaultValue={participant.mode} disabled={usingDemoData} name="mode">
            <option value="BOTH">{t("sheetModeAll")}</option>
            <option value="EAT">{t("sheetModeEat")}</option>
            <option value="HOST">{t("sheetModeHost")}</option>
          </select>
          <input aria-label={`${t("sheetColComing")} ${participant.name}`} defaultValue={participant.comingWithCount} disabled={usingDemoData} min={1} name="comingWithCount" type="number" />
          <input aria-label={`${t("sheetColReceives")} ${participant.name}`} defaultValue={participant.hostCapacity || ""} disabled={usingDemoData} min={1} name="hostCapacity" type="number" />
          <input aria-label={`${t("sheetColNoMatch")} ${participant.name}`} defaultValue={participant.adminNoMatch || ""} disabled={usingDemoData} name="adminNoMatch" placeholder="#3, #8" />
          <label className="sheet-check">
            <input defaultChecked={participant.active} disabled={usingDemoData} name="active" type="checkbox" />
          </label>
          <button className="small secondary" disabled={usingDemoData} type="submit">{t("sheetSaveBtn")}</button>
          <button
            className="small danger"
            disabled={usingDemoData}
            formAction={deleteParticipantAction}
            title={t("sheetDeleteTitle", { name: participant.name })}
            type="submit"
          >✕</button>
        </form>
      ))}

      {participants.length === 0 ? <div className="board-empty">{t("sheetNoParticipants")}</div> : null}
    </div>
  );
}

function Worksheet({ matches, t }: { matches: MatchWithPeople[]; t: T }) {
  return (
    <div className="table-wrap worksheet-wrap">
      <table className="worksheet">
        <thead>
          <tr>
            <th>{t("sheetColNum")}</th>
            <th>{t("worksheetColRound")}</th>
            <th>{t("worksheetColStatus")}</th>
            <th>{t("worksheetColHost")}</th>
            <th>{t("worksheetColHostContact")}</th>
            <th>{t("worksheetColCap")}</th>
            <th>{t("worksheetColEater")}</th>
            <th>{t("worksheetColEaterContact")}</th>
            <th>{t("worksheetColGroup")}</th>
            <th>{t("worksheetColKind")}</th>
            <th>{t("worksheetColForm")}</th>
            <th>{t("worksheetColAllergy")}</th>
            <th>{t("worksheetColProposed")}</th>
            <th>{t("worksheetColFinal")}</th>
            <th>{t("worksheetColLinks")}</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((match, index) => {
            const proposedDates = jsonDateList(match.proposedDates);
            return (
              <tr key={`worksheet-${match.id}`}>
                <td className="sheet-number">{index + 1}</td>
                <td>{displayMonth(match.round.month)}</td>
                <td>
                  <span className={`status status-${match.status.toLowerCase().replaceAll("_", "-")}`}>
                    {statusLabel(match.status, t)}
                  </span>
                </td>
                <td>
                  <strong>{match.host.name}</strong>
                  <span className="cell-muted">{modeLabel(match.host.mode, t)}</span>
                </td>
                <td>
                  {match.host.email}
                  <span className="cell-muted">{match.host.whatsapp}</span>
                  <span className="cell-muted">{match.host.address || t("noAddress")}</span>
                </td>
                <td>{match.host.hostCapacity || "-"}</td>
                <td>
                  <strong>{match.eater.name}</strong>
                  <span className="cell-muted">{modeLabel(match.eater.mode, t)}</span>
                </td>
                <td>
                  {match.eater.email}
                  <span className="cell-muted">{match.eater.whatsapp}</span>
                </td>
                <td>{match.partySize}</td>
                <td>{participantKindLabel(match.eater.isGuest, t)}</td>
                <td>{gatheringLabel(match.eater.gatheringType, t)}</td>
                <td>{match.eater.allergies || "-"}</td>
                <td>
                  {proposedDates.length > 0
                    ? proposedDates.map((date) => <span key={date}>{displayDate(date)}</span>)
                    : "-"}
                </td>
                <td>{match.chosenDate ? displayDate(match.chosenDate) : "-"}</td>
                <td>
                  <a href={`/koker/${match.hostToken}`}>{t("worksheetColHost")}</a>
                  <span className="cell-muted" />
                  <a href={`/eter/${match.eaterToken}`}>{t("worksheetColEater")}</a>
                </td>
              </tr>
            );
          })}
          {matches.length === 0 ? (
            <tr>
              <td colSpan={15}>{t("worksheetNoMatches")}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function RoundsAccordion({
  adminKey,
  matches,
  participants,
  rounds,
  usingDemoData,
  t
}: {
  adminKey: string;
  matches: MatchWithPeople[];
  participants: Participant[];
  rounds: RoundWithMatches[];
  usingDemoData: boolean;
  t: T;
}) {
  const orderedRounds = [...rounds].sort((a, b) => a.month.getTime() - b.month.getTime());
  const matchesByRound = new Map<string, MatchWithPeople[]>();

  for (const match of matches) {
    const roundMatches = matchesByRound.get(match.roundId) || [];
    roundMatches.push(match);
    matchesByRound.set(match.roundId, roundMatches);
  }

  if (orderedRounds.length === 0) {
    return <div className="board-empty">{t("step2NoRounds")}</div>;
  }

  return (
    <div className="round-list">
      {orderedRounds.map((round) => {
        const roundMatches = (matchesByRound.get(round.id) || []).sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
        );
        const draftCount = roundMatches.filter((match) => match.status === "DRAFT").length;
        const matchCount = roundMatches.length || round.matches.length;

        return (
          <details className="round-card" key={round.id}>
            <summary>
              <span>
                <strong>{displayMonth(round.month)}</strong>
                <small>
                  {statusLabel(round.status, t)} - {t("roundConnections", { n: matchCount })}
                  {draftCount > 0 ? t("roundDraftSuffix", { n: draftCount }) : ""}
                </small>
              </span>
            </summary>
            <div className="round-card-body">
              {roundMatches.length > 0 ? (
                <div className="round-review">
                  <div className="section-header match-review-header">
                    <div>
                      <h3>{t("step2MatchesTitle")}</h3>
                      <p>{t("step2MatchesHint")}</p>
                    </div>
                    <div className="inline-actions">
                      <a className="button secondary" href={adminHref(adminKey, { step: "planning", sheet: "1" })}>
                        {t("step2SheetBtn")}
                      </a>
                      {round.status !== "DRAFT" ? (
                        <form action={reopenRoundAction}>
                          <input type="hidden" name="adminKey" value={adminKey} />
                          <input type="hidden" name="roundId" value={round.id} />
                          <button className="secondary" disabled={usingDemoData} type="submit">
                            {t("step2BackToDraft")}
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                  <AdminMatchBoard
                    key={`${round.id}-${round.updatedAt.getTime()}-${draftCount}-${roundMatches.length}`}
                    adminKey={adminKey}
                    disabled={false}
                    initialMatches={roundMatches.map(boardMatch)}
                    participants={participants.map(boardRosterParticipant)}
                    saveChanges={!usingDemoData}
                  />
                </div>
              ) : null}
            </div>
          </details>
        );
      })}
    </div>
  );
}

function EmailLogsTable({ emailLogs, t }: { emailLogs: EmailLog[]; t: T }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{t("logsColType")}</th>
            <th>{t("logsColEmail")}</th>
            <th>{t("logsColStatus")}</th>
            <th>{t("logsColSubject")}</th>
          </tr>
        </thead>
        <tbody>
          {emailLogs.map((log) => (
            <tr key={log.id}>
              <td>{log.type}</td>
              <td>{log.toEmail}</td>
              <td>{log.status}</td>
              <td>{log.subject}</td>
            </tr>
          ))}
          {emailLogs.length === 0 ? (
            <tr>
              <td colSpan={4}>{t("noMails")}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function StepOne({
  adminKey,
  participants,
  showSheet,
  signupUrl,
  usingDemoData,
  t
}: {
  adminKey: string;
  participants: Participant[];
  showSheet: boolean;
  signupUrl: string;
  usingDemoData: boolean;
  t: T;
}) {
  return (
    <StepShell closeHref={adminHref(adminKey)} eyebrow={t("step1Eyebrow")} title={t("step1Title")} closeLabel={t("stepClose")}>
      <div className="step-grid">
        <div className="qr-card">
          <img alt="QR" src={`/api/qr?text=${encodeURIComponent(signupUrl)}`} />
          <div>
            <strong>{t("step1SignupTitle")}</strong>
            <p className="compact-muted">{t("step1SignupHint")}</p>
            <input readOnly value={signupUrl} />
            <div className="inline-actions">
              <CopyButton value={signupUrl} />
              <CopyQrButton value={signupUrl} />
              <a className="button secondary" href="/aanmelden">{t("step1OpenPage")}</a>
            </div>
          </div>
        </div>
        <div className="step-card-flat">
          <strong>{t("step1SignupCount", { n: participants.length })}</strong>
          <p>
            Deelnemers kunnen zelf aanmelden en voorkeuren wijzigen. Als admin kun je dezelfde lijst ook handmatig corrigeren of gezinnen toevoegen.
          </p>
          <a className="button" href={adminHref(adminKey, { step: "participants", sheet: "1" })}>
            {t("step1SignupBtn")}
          </a>
        </div>
      </div>

      {showSheet ? (
        <div className="nested-panel">
          <ParticipantSheet adminKey={adminKey} participants={participants} usingDemoData={usingDemoData} t={t} />
        </div>
      ) : null}
    </StepShell>
  );
}

function StepTwo({
  adminKey,
  defaultMonth,
  matches,
  participants,
  planningSettings,
  rounds,
  showSheet,
  usingDemoData,
  t
}: {
  adminKey: string;
  defaultMonth: string;
  matches: MatchWithPeople[];
  participants: Participant[];
  planningSettings: PlanningSettingsView;
  rounds: RoundWithMatches[];
  showSheet: boolean;
  usingDemoData: boolean;
  t: T;
}) {
  return (
    <StepShell closeHref={adminHref(adminKey)} eyebrow={t("step2Eyebrow")} title={t("step2Title")} closeLabel={t("stepClose")}>
      <form action={generatePlanningAction} className="planning-form" key={`planning-${planningSettings.horizonMonths}-${defaultMonth}`}>
        <input type="hidden" name="adminKey" value={adminKey} />
        <input type="hidden" name="adminCheckDaysBefore" value={planningSettings.adminCheckDaysBefore} />
        <input type="hidden" name="hostMailDaysBefore" value={planningSettings.hostMailDaysBefore} />
        <input type="hidden" name="eaterMailDelayDays" value={planningSettings.eaterMailDelayDays} />
        <input type="hidden" name="reminderDaysAfter" value={planningSettings.reminderDaysAfter} />
        <input type="hidden" name="renewalCadence" value={planningSettings.renewalCadence} />
        <label>
          {t("step2StartMonth")}
          <input name="startMonth" type="month" defaultValue={defaultMonth} />
          <span className="field-hint">{t("step2StartMonthHint")}</span>
        </label>
        <label>
          {t("step2HorizonLabel")}
          <select defaultValue={String(planningSettings.horizonMonths)} name="horizonMonths">
            <option value="1">{t("step2HorizonRound")}</option>
            <option value="3">{t("step2HorizonQuarter")}</option>
            <option value="12">{t("step2HorizonYear")}</option>
          </select>
          <span className="field-hint">{t("step2HorizonHint")}</span>
        </label>
        <button disabled={usingDemoData} type="submit">{t("step2GenerateBtn")}</button>
      </form>

      <p className="step-help">{t("step2Help")}</p>

      <div className="nested-panel">
        <div className="section-header">
          <h2>{t("step2RoundsTitle")}</h2>
          <span className="section-hint">{t("step2RoundsHint")}</span>
        </div>
        <RoundsAccordion adminKey={adminKey} matches={matches} participants={participants} rounds={rounds} usingDemoData={usingDemoData} t={t} />
      </div>

      {showSheet ? (
        <div className="nested-panel">
          <ParticipantSheet adminKey={adminKey} participants={participants} usingDemoData={usingDemoData} t={t} />
        </div>
      ) : null}
    </StepShell>
  );
}

function StepFour({
  adminKey,
  emailLogs,
  mailTemplates,
  usingDemoData,
  t
}: {
  adminKey: string;
  emailLogs: EmailLog[];
  mailTemplates: MailTemplate[];
  usingDemoData: boolean;
  t: T;
}) {
  const savedTemplates = new Map(mailTemplates.map((template) => [template.type, template]));

  return (
    <StepShell closeHref={adminHref(adminKey)} eyebrow={t("step3Eyebrow")} title={t("step3Title")} closeLabel={t("stepClose")}>
      <div className="mail-cycle-note">
        <strong>{t("step3NoteTitle")}</strong>
        <span>{t("step3NoteBody")}</span>
      </div>
      <div className="mail-template-list">
        {adminMailTemplateDefinitions.map((definition) => {
          const saved = savedTemplates.get(definition.type);
          const enabled = saved?.enabled ?? definition.defaultEnabled ?? true;
          return (
            <details className="mail-template-card" key={definition.type}>
              <summary>
                <strong>
                  {definition.label}
                  <span className={`template-status ${enabled ? "on" : "off"}`}>
                    {enabled ? t("step3TemplateOn") : t("step3TemplateOff")}
                  </span>
                </strong>
                <span>{definition.description}</span>
              </summary>
              <form action={saveMailTemplateAction} className="mail-template-form">
                <input type="hidden" name="adminKey" value={adminKey} />
                <input type="hidden" name="type" value={definition.type} />
                <label className="check-row template-enabled">
                  <input defaultChecked={enabled} disabled={usingDemoData} name="enabled" type="checkbox" />
                  {t("step3EnableLabel")}
                </label>
                <label>
                  {t("step3SubjectLabel")}
                  <input defaultValue={saved?.subject || definition.subject} disabled={usingDemoData} name="subject" />
                </label>
                <label>
                  {t("step3BodyLabel")}
                  <textarea defaultValue={saved?.body || definition.body} disabled={usingDemoData} name="body" />
                </label>
                <button className="small" disabled={usingDemoData} type="submit">{t("step3SaveBtn")}</button>
              </form>
            </details>
          );
        })}
      </div>

      <div className="nested-panel">
        <div className="section-header">
          <h2>{t("step3LogsTitle")}</h2>
        </div>
        <EmailLogsTable emailLogs={emailLogs} t={t} />
      </div>
    </StepShell>
  );
}

function StepFive({
  adminKey,
  defaultMonth,
  emailLogs,
  matches,
  participants,
  planningSettings,
  rounds,
  usingDemoData,
  t
}: {
  adminKey: string;
  defaultMonth: string;
  emailLogs: EmailLog[];
  matches: MatchWithPeople[];
  participants: Participant[];
  planningSettings: PlanningSettingsView;
  rounds: RoundWithMatches[];
  usingDemoData: boolean;
  t: T;
}) {
  const activeParticipants = participants.filter((p) => p.active);
  const hostCount = activeParticipants.filter((p) => p.mode !== "EAT").length;
  const eaterCount = activeParticipants.filter((p) => p.mode !== "HOST").length;
  const guestCount = activeParticipants.filter((p) => p.isGuest).length;
  const memberCount = activeParticipants.length - guestCount;
  const savedPlanningLabel = planningHorizonLabel(planningSettings.horizonMonths, t);
  const totalDraftMatches = matches.filter((m) => m.status === "DRAFT").length;

  return (
    <StepShell closeHref={adminHref(adminKey)} eyebrow={t("step4Eyebrow")} title={t("step4Title")} closeLabel={t("stepClose")}>
      <div className="summary-cards">
        <div>
          <span>{t("step4S1")}</span>
          <strong>{t("step4ActiveParticipants", { n: activeParticipants.length })}</strong>
          <small>{t("step4ParticipantDetail", { hosts: hostCount, eaters: eaterCount, members: memberCount, guests: guestCount })}</small>
        </div>
        <div>
          <span>{t("step4S2")}</span>
          <strong>{t("step4Rounds", { n: rounds.length })}</strong>
          <small>{t("step4RoundsDetail", { horizon: savedPlanningLabel, drafts: totalDraftMatches })}</small>
        </div>
        <div>
          <span>{t("step4S3")}</span>
          <strong>{t("step4Mails", { n: adminMailTemplateDefinitions.length })}</strong>
          <small>{t("step4MailsDetail", { n: emailLogs.length })}</small>
        </div>
        <div>
          <span>{t("step4S4")}</span>
          <strong>{t("step4TotalMatches", { n: matches.length })}</strong>
          <small>{totalDraftMatches > 0 ? t("step4DraftsPending", { n: totalDraftMatches }) : t("step4AllApproved")}</small>
        </div>
      </div>

      <div className="approval-panel">
        <div>
          <strong>{t("step4CheckTitle")}</strong>
          <p>{t("step4CheckBody")}</p>
        </div>
        <form action={sendPreferenceChecksAction} className="inline-form">
          <input type="hidden" name="adminKey" value={adminKey} />
          <label>
            {t("step4CheckMonth")}
            <input name="month" type="month" defaultValue={defaultMonth} />
          </label>
          <button className="secondary" disabled={usingDemoData} type="submit">
            {t("step4CheckBtn")}
          </button>
        </form>
      </div>

      <div className="approval-panel">
        <div>
          <strong>{t("step4ApproveTitle")}</strong>
          <p>{t("step4ApproveBody")}</p>
        </div>
        <form action={sendHostInvitesAction}>
          <input type="hidden" name="adminKey" value={adminKey} />
          <button disabled={usingDemoData || totalDraftMatches === 0} type="submit">
            {totalDraftMatches > 0
              ? t("step4ApproveBtn", { n: totalDraftMatches, suffix: totalDraftMatches !== 1 ? "s" : "" })
              : t("step4NoMatches")}
          </button>
        </form>
      </div>

      <div className="nested-panel">
        <div className="section-header">
          <h2>{t("step4PlanTitle")}</h2>
        </div>
        <RoundsAccordion adminKey={adminKey} matches={matches} participants={participants} rounds={rounds} usingDemoData={usingDemoData} t={t} />
      </div>

      <div className="nested-panel worksheet-panel">
        <div className="section-header">
          <h2>{t("step4WorksheetTitle")}</h2>
        </div>
        <Worksheet matches={matches} t={t} />
      </div>
    </StepShell>
  );
}

function EmptyDashboard({
  adminKey,
  matches,
  participants,
  rounds,
  t
}: {
  adminKey: string;
  matches: MatchWithPeople[];
  participants: Participant[];
  rounds: RoundWithMatches[];
  t: T;
}) {
  return (
    <section className="panel step-empty">
      <div>
        <p className="eyebrow">Overzicht</p>
        <h2>{t("emptyTitle")}</h2>
        <p>{t("emptyBody")}</p>
      </div>
      <div className="quick-stats">
        <span><strong>{participants.length}</strong>{t("emptyParticipants")}</span>
        <span><strong>{rounds.length}</strong>{t("emptyRounds")}</span>
        <span><strong>{matches.length}</strong>{t("emptyMatches")}</span>
      </div>
      <a className="button" href={adminHref(adminKey, { step: "participants" })}>
        {t("emptyStartBtn")}
      </a>
    </section>
  );
}

export default async function AdminPage({ searchParams }: PageProps) {
  const query = (await searchParams) || {};
  const key = first(query.key) || "";
  const notice = first(query.notice);
  const currentStep = activeStep(query.step);
  const showSheet = first(query.sheet) === "1";
  const t = await getTranslations("admin");

  const adminContext = resolveAdminContext(key);
  if (!adminContext) {
    return (
      <div className="page narrow">
        <section className="panel centered">
          <p className="eyebrow">{t("loginEyebrow")}</p>
          <h1>{t("loginTitle")}</h1>
          <form className="stack" action="/">
            <label>
              {t("loginKeyLabel")}
              <input name="key" type="password" />
            </label>
            <button type="submit">{t("loginButton")}</button>
          </form>
          <div style={{ marginTop: "1.5rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border, #e0e7e2)" }}>
            <p style={{ margin: "0 0 0.75rem", color: "var(--color-muted, #5e6b62)", fontSize: "0.875rem" }}>
              {t("demoPrompt")}
            </p>
            <a className="button secondary" href="/?key=demo">{t("demoButton")}</a>
          </div>
        </section>
      </div>
    );
  }

  const organizationId = adminContext.organizationId;
  const isDemoMode = adminContext.isDemoMode === true;

  let usingDemoData = isDemoMode;
  let participants: Participant[];
  let rounds: RoundWithMatches[];
  let matches: MatchWithPeople[];
  let emailLogs: EmailLog[];
  let planningSettings = defaultPlanningSettings;
  let mailTemplates: MailTemplate[] = [];

  if (isDemoMode) {
    const demo = demoAdminData();
    participants = demo.participants as unknown as Participant[];
    rounds = demo.rounds as unknown as RoundWithMatches[];
    matches = demo.matches as unknown as MatchWithPeople[];
    emailLogs = demo.emailLogs as unknown as EmailLog[];
  } else try {
    const [participantRows, roundRows, matchRows, emailLogRows, settingsRow, templateRows] = await Promise.all([
      prisma.participant.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" }, take: 120 }),
      prisma.matchRound.findMany({ where: { organizationId }, orderBy: { month: "asc" }, take: 36, include: { matches: true } }),
      prisma.mealMatch.findMany({ where: { round: { organizationId } }, orderBy: { createdAt: "desc" }, take: 120, include: { host: true, eater: true, round: true } }),
      prisma.emailLog.findMany({
        where: organizationId
          ? { OR: [{ participant: { organizationId } }, { match: { round: { organizationId } } }] }
          : { OR: [{ participant: { organizationId: null } }, { match: { round: { organizationId: null } } }] },
        orderBy: { createdAt: "desc" },
        take: 30
      }),
      prisma.planningSettings.findFirst({ where: { organizationId } }),
      prisma.mailTemplate.findMany({ where: { organizationId }, orderBy: { type: "asc" } })
    ]);
    participants = participantRows;
    rounds = roundRows;
    matches = matchRows;
    emailLogs = emailLogRows;
    planningSettings = planningSettingsView(settingsRow);
    mailTemplates = templateRows;
  } catch {
    usingDemoData = true;
    const demo = demoAdminData();
    participants = demo.participants as unknown as Participant[];
    rounds = demo.rounds as unknown as RoundWithMatches[];
    matches = demo.matches as unknown as MatchWithPeople[];
    emailLogs = demo.emailLogs as unknown as EmailLog[];
  }

  const signupUrl = organizationId
    ? appUrl(`/aanmelden?organization=${encodeURIComponent(organizationId)}`)
    : appUrl("/aanmelden");
  const queryStartMonth = first(query.startMonth);
  const defaultMonth =
    queryStartMonth && /^\d{4}-\d{2}$/.test(queryStartMonth) ? queryStartMonth : monthInputValue(toMonthStart(new Date()));
  const planningStart = parseMonthInput(defaultMonth);
  const planningEnd = addMonths(planningStart, planningSettings.horizonMonths);
  const planningRounds = rounds.filter((round) => round.month >= planningStart && round.month < planningEnd);

  return (
    <div className="page wide-page">
      <section className="intro compact admin-topline">
        <div>
          <p className="eyebrow">{t("mainEyebrow")}</p>
          <h1>{t("mainTitle")}</h1>
          <p>{t("mainIntro")}</p>
        </div>
        <DemoTools adminKey={key} t={t} />
      </section>

      {notice ? <div className="notice success">{notice}</div> : null}
      {isDemoMode ? (
        <div className="notice">
          <strong>{t("demoBannerTitle")}</strong> {t("demoBannerBody")}{" "}
          <a href="/">{t("demoBannerBack")}</a>
        </div>
      ) : usingDemoData ? (
        <div className="notice">{t("demoDbNotice")}</div>
      ) : null}

      <StepBar adminKey={key} current={currentStep} t={t} />

      {!currentStep ? <EmptyDashboard adminKey={key} matches={matches} participants={participants} rounds={rounds} t={t} /> : null}
      {currentStep === "participants" ? (
        <StepOne adminKey={key} participants={participants} showSheet={showSheet} signupUrl={signupUrl} usingDemoData={usingDemoData} t={t} />
      ) : null}
      {currentStep === "planning" ? (
        <StepTwo adminKey={key} defaultMonth={defaultMonth} matches={matches} participants={participants} planningSettings={planningSettings} rounds={planningRounds} showSheet={showSheet} usingDemoData={usingDemoData} t={t} />
      ) : null}
      {currentStep === "mails" ? (
        <StepFour adminKey={key} emailLogs={emailLogs} mailTemplates={mailTemplates} usingDemoData={usingDemoData} t={t} />
      ) : null}
      {currentStep === "summary" ? (
        <StepFive adminKey={key} defaultMonth={defaultMonth} emailLogs={emailLogs} matches={matches} participants={participants} planningSettings={planningSettings} rounds={rounds} usingDemoData={usingDemoData} t={t} />
      ) : null}
    </div>
  );
}
