import type { EmailLog, MailTemplate, MatchRound, MealMatch, Participant, PlanningSettings } from "@prisma/client";
import type { ReactNode } from "react";
import {
  cancelMatchAction,
  clearDemoAction,
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
import { demoSeedEnabled, isAdminKey } from "@/lib/admin";
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

const steps: Array<{ key: StepKey; label: string; helper: string }> = [
  { key: "participants", label: "Deelnemers toevoegen", helper: "Aanmeldlink, QR en sheet" },
  { key: "planning", label: "Rondes + matches", helper: "Klaarzetten, schuiven, goedkeuren" },
  { key: "mails", label: "Mails klaarzetten", helper: "Concepten controleren" },
  { key: "summary", label: "Samenvatting afronden", helper: "Planning en akkoord" }
];

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function activeStep(value: string | string[] | undefined): StepKey | "" {
  const step = first(value);
  if (step === "review") {
    return "planning";
  }

  return steps.some((item) => item.key === step) ? (step as StepKey) : "";
}

function adminHref(key: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams({
    key,
    ...params
  });
  return `/?${query.toString()}`;
}

function modeLabel(value: string) {
  if (value === "EAT") return "Eten";
  if (value === "HOST") return "Koken";
  return "Allebei";
}

function participantKindLabel(isGuest: boolean) {
  return isGuest ? "Gast" : "Gemeentelid";
}

function gatheringLabel(value: string) {
  if (value === "MEAL") return "Maaltijd";
  if (value === "COFFEE_TEA") return "Koffie/thee";
  return "Allebei";
}

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    DRAFT: "Concept",
    HOST_INVITED: "Host gevraagd",
    HOST_RESPONDED: "Host dagen gekozen",
    EATER_INVITED: "Eter kiest dag",
    EATER_CONFIRMED: "Bevestigd",
    FALLBACK_SENT: "Fallback verstuurd",
    CANCELLED: "Geannuleerd"
  };

  return labels[value] || value;
}

function planningHorizonLabel(value: number) {
  if (value === 12) return "jaar";
  if (value === 3) return "kwartaal";
  return "ronde";
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

function StepShell({
  children,
  eyebrow,
  title,
  closeHref
}: {
  children: ReactNode;
  eyebrow: string;
  title: string;
  closeHref: string;
}) {
  return (
    <section className="panel step-detail">
      <div className="section-header step-detail-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <a className="button secondary small" href={closeHref}>
          Klaar, verberg
        </a>
      </div>
      {children}
    </section>
  );
}

function StepBar({ current, adminKey }: { current: StepKey | ""; adminKey: string }) {
  return (
    <nav aria-label="Admin stappen" className="flow-steps">
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

function DemoTools({ adminKey }: { adminKey: string }) {
  if (!demoSeedEnabled()) {
    return null;
  }

  return (
    <div className="panel demo-panel">
      <p className="eyebrow">Demo</p>
      <form action={seedDemoAction}>
        <input type="hidden" name="adminKey" value={adminKey} />
        <button className="small" type="submit">
          Demo-data laden
        </button>
      </form>
      <form action={clearDemoAction}>
        <input type="hidden" name="adminKey" value={adminKey} />
        <button className="small danger" type="submit">
          Demo-data wissen
        </button>
      </form>
    </div>
  );
}

function ParticipantSheet({
  adminKey,
  participants,
  usingDemoData
}: {
  adminKey: string;
  participants: Participant[];
  usingDemoData: boolean;
}) {
  return (
    <div className="participant-sheet">
      <div className="participant-sheet-head">
        <span>#</span>
        <span>Naam</span>
        <span>E-mail</span>
        <span>WhatsApp</span>
        <span>Wat ben je</span>
        <span>Rol</span>
        <span>Komt</span>
        <span>Ontvangt</span>
        <span>Niet met</span>
        <span>Actief</span>
        <span>Actie</span>
      </div>

      <form action={saveAdminParticipantAction} className="participant-sheet-row new-row">
        <input type="hidden" name="adminKey" value={adminKey} />
        <span className="sheet-number">Nieuw</span>
        <input aria-label="Nieuwe naam" disabled={usingDemoData} name="name" placeholder="Gezin / naam" />
        <input aria-label="Nieuwe e-mail" disabled={usingDemoData} name="email" placeholder="mail@example.nl" />
        <input aria-label="Nieuw WhatsAppnummer" disabled={usingDemoData} name="whatsapp" placeholder="06..." />
        <label className="sheet-check sheet-check-text">
          <input disabled={usingDemoData} name="isGuest" type="checkbox" />
          <span>Gast</span>
        </label>
        <select aria-label="Nieuwe rol" defaultValue="BOTH" disabled={usingDemoData} name="mode">
          <option value="BOTH">Allebei</option>
          <option value="EAT">Eten</option>
          <option value="HOST">Koken</option>
        </select>
        <input
          aria-label="Nieuwe groepgrootte"
          defaultValue={1}
          disabled={usingDemoData}
          min={1}
          name="comingWithCount"
          type="number"
        />
        <input
          aria-label="Nieuwe ontvangstcapaciteit"
          defaultValue={4}
          disabled={usingDemoData}
          min={1}
          name="hostCapacity"
          type="number"
        />
        <input aria-label="Nieuwe niet met" disabled={usingDemoData} name="adminNoMatch" placeholder="#3, naam of e-mail" />
        <label className="sheet-check">
          <input defaultChecked disabled={usingDemoData} name="active" type="checkbox" />
        </label>
        <button className="small" disabled={usingDemoData} type="submit">
          Voeg toe
        </button>
      </form>

      {participants.map((participant, index) => (
        <form action={saveAdminParticipantAction} className="participant-sheet-row" key={participant.id}>
          <input type="hidden" name="adminKey" value={adminKey} />
          <input type="hidden" name="participantId" value={participant.id} />
          <span className="sheet-number">{index + 1}</span>
          <input aria-label={`Naam ${participant.name}`} defaultValue={participant.name} disabled={usingDemoData} name="name" />
          <input
            aria-label={`E-mail ${participant.name}`}
            defaultValue={participant.email}
            disabled={usingDemoData}
            name="email"
          />
          <input
            aria-label={`WhatsApp ${participant.name}`}
            defaultValue={participant.whatsapp}
            disabled={usingDemoData}
            name="whatsapp"
          />
          <label className="sheet-check sheet-check-text">
            <input defaultChecked={participant.isGuest} disabled={usingDemoData} name="isGuest" type="checkbox" />
            <span>Gast</span>
          </label>
          <select aria-label={`Rol ${participant.name}`} defaultValue={participant.mode} disabled={usingDemoData} name="mode">
            <option value="BOTH">Allebei</option>
            <option value="EAT">Eten</option>
            <option value="HOST">Koken</option>
          </select>
          <input
            aria-label={`Groepgrootte ${participant.name}`}
            defaultValue={participant.comingWithCount}
            disabled={usingDemoData}
            min={1}
            name="comingWithCount"
            type="number"
          />
          <input
            aria-label={`Ontvangstcapaciteit ${participant.name}`}
            defaultValue={participant.hostCapacity || ""}
            disabled={usingDemoData}
            min={1}
            name="hostCapacity"
            type="number"
          />
          <input
            aria-label={`Niet met ${participant.name}`}
            defaultValue={participant.adminNoMatch || ""}
            disabled={usingDemoData}
            name="adminNoMatch"
            placeholder="#3, #8"
          />
          <label className="sheet-check">
            <input defaultChecked={participant.active} disabled={usingDemoData} name="active" type="checkbox" />
          </label>
          <button className="small secondary" disabled={usingDemoData} type="submit">
            Bewaar
          </button>
        </form>
      ))}

      {participants.length === 0 ? <div className="board-empty">Nog geen deelnemers.</div> : null}
    </div>
  );
}

function Worksheet({ matches }: { matches: MatchWithPeople[] }) {
  return (
    <div className="table-wrap worksheet-wrap">
      <table className="worksheet">
        <thead>
          <tr>
            <th>#</th>
            <th>Ronde</th>
            <th>Status</th>
            <th>Host</th>
            <th>Host contact</th>
            <th>Cap.</th>
            <th>Eter</th>
            <th>Eter contact</th>
            <th>Groep</th>
            <th>Wat ben je</th>
            <th>Vorm</th>
            <th>Allergie/dieet</th>
            <th>Voorgestelde dagen</th>
            <th>Definitieve dag</th>
            <th>Links</th>
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
                    {statusLabel(match.status)}
                  </span>
                </td>
                <td>
                  <strong>{match.host.name}</strong>
                  <span className="cell-muted">{modeLabel(match.host.mode)}</span>
                </td>
                <td>
                  {match.host.email}
                  <span className="cell-muted">{match.host.whatsapp}</span>
                  <span className="cell-muted">{match.host.address || "Geen adres"}</span>
                </td>
                <td>{match.host.hostCapacity || "-"}</td>
                <td>
                  <strong>{match.eater.name}</strong>
                  <span className="cell-muted">{modeLabel(match.eater.mode)}</span>
                </td>
                <td>
                  {match.eater.email}
                  <span className="cell-muted">{match.eater.whatsapp}</span>
                </td>
                <td>{match.partySize}</td>
                <td>{participantKindLabel(match.eater.isGuest)}</td>
                <td>{gatheringLabel(match.eater.gatheringType)}</td>
                <td>{match.eater.allergies || "-"}</td>
                <td>
                  {proposedDates.length > 0
                    ? proposedDates.map((date) => <span key={date}>{displayDate(date)}</span>)
                    : "-"}
                </td>
                <td>{match.chosenDate ? displayDate(match.chosenDate) : "-"}</td>
                <td>
                  <a href={`/koker/${match.hostToken}`}>Host</a>
                  <span className="cell-muted" />
                  <a href={`/eter/${match.eaterToken}`}>Eter</a>
                </td>
              </tr>
            );
          })}
          {matches.length === 0 ? (
            <tr>
              <td colSpan={15}>Nog geen matches. Genereer eerst een ronde of draai de demo-seed.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function RoundsTable({ adminKey, rounds, usingDemoData }: { adminKey: string; rounds: RoundWithMatches[]; usingDemoData: boolean }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Maand</th>
            <th>Status</th>
            <th>Matches</th>
            <th>Actie</th>
          </tr>
        </thead>
        <tbody>
          {rounds.map((round) => (
            <tr key={round.id}>
              <td>{displayMonth(round.month)}</td>
              <td>{round.status}</td>
              <td>{round.matches.length}</td>
              <td>
                <form action={sendHostInvitesAction}>
                  <input type="hidden" name="adminKey" value={adminKey} />
                  <input type="hidden" name="roundId" value={round.id} />
                  <button className="small" disabled={usingDemoData || round.status !== "DRAFT"} type="submit">
                    Goedkeuren + mails
                  </button>
                </form>
              </td>
            </tr>
          ))}
          {rounds.length === 0 ? (
            <tr>
              <td colSpan={4}>Nog geen rondes.</td>
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
  usingDemoData
}: {
  adminKey: string;
  matches: MatchWithPeople[];
  participants: Participant[];
  rounds: RoundWithMatches[];
  usingDemoData: boolean;
}) {
  const orderedRounds = [...rounds].sort((a, b) => a.month.getTime() - b.month.getTime());
  const matchesByRound = new Map<string, MatchWithPeople[]>();

  for (const match of matches) {
    const roundMatches = matchesByRound.get(match.roundId) || [];
    roundMatches.push(match);
    matchesByRound.set(match.roundId, roundMatches);
  }

  if (orderedRounds.length === 0) {
    return <div className="board-empty">Nog geen rondes. Kies een startmaand en zet een ronde, kwartaal of jaar klaar.</div>;
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
                  {statusLabel(round.status)} - {matchCount} verbinding(en)
                  {draftCount > 0 ? ` - ${draftCount} concept` : ""}
                </small>
              </span>
            </summary>
            <div className="round-card-body">
              {roundMatches.length > 0 ? (
                <div className="round-review">
                  <div className="section-header match-review-header">
                    <div>
                      <h3>Matches aanpassen</h3>
                      <p>
                        Sleep een host of eter naar een andere regel om te wisselen. Groen kan, rood kan niet.
                        Permanente blokkades zet je in de sheet bij <strong>Niet met</strong>.
                      </p>
                    </div>
                    <div className="inline-actions">
                      <a className="button secondary" href={adminHref(adminKey, { step: "planning", sheet: "1" })}>
                        Sheet met aanmeldingen
                      </a>
                      {round.status !== "DRAFT" ? (
                        <form action={reopenRoundAction}>
                          <input type="hidden" name="adminKey" value={adminKey} />
                          <input type="hidden" name="roundId" value={round.id} />
                          <button className="secondary" disabled={usingDemoData} type="submit">
                            Zet terug naar concept
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
              ) : (
                <p className="compact-muted">Nog geen matchdetails voor deze ronde.</p>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}

function MatchesTable({ adminKey, matches, usingDemoData }: { adminKey: string; matches: MatchWithPeople[]; usingDemoData: boolean }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Ronde</th>
            <th>Host</th>
            <th>Eter</th>
            <th>Groep</th>
            <th>Status</th>
            <th>Actie</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((match) => (
            <tr key={match.id}>
              <td>{displayMonth(match.round.month)}</td>
              <td>{match.host.name}</td>
              <td>{match.eater.name}</td>
              <td>{match.partySize}</td>
              <td>{statusLabel(match.status)}</td>
              <td>
                <form action={cancelMatchAction}>
                  <input type="hidden" name="adminKey" value={adminKey} />
                  <input type="hidden" name="matchId" value={match.id} />
                  <button className="small danger" disabled={usingDemoData || match.status === "CANCELLED"} type="submit">
                    Annuleer
                  </button>
                </form>
              </td>
            </tr>
          ))}
          {matches.length === 0 ? (
            <tr>
              <td colSpan={6}>Nog geen matches.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function EmailLogsTable({ emailLogs }: { emailLogs: EmailLog[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>Naar</th>
            <th>Status</th>
            <th>Onderwerp</th>
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
              <td colSpan={4}>Nog geen mails.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function RoundMailActions({
  adminKey,
  matches,
  rounds,
  usingDemoData
}: {
  adminKey: string;
  matches: MatchWithPeople[];
  rounds: RoundWithMatches[];
  usingDemoData: boolean;
}) {
  const draftCounts = new Map<string, number>();
  for (const match of matches) {
    if (match.status === "DRAFT") {
      draftCounts.set(match.roundId, (draftCounts.get(match.roundId) || 0) + 1);
    }
  }

  const orderedRounds = [...rounds].sort((a, b) => a.month.getTime() - b.month.getTime());

  return (
    <div className="mail-round-list">
      {orderedRounds.map((round) => {
        const draftCount = draftCounts.get(round.id) || 0;
        return (
          <div className="mail-round-row" key={round.id}>
            <div>
              <strong>{displayMonth(round.month)}</strong>
              <small>
                {statusLabel(round.status)} - {draftCount} conceptmatch(es) klaar voor host-mail
              </small>
            </div>
            <form action={sendHostInvitesAction}>
              <input type="hidden" name="adminKey" value={adminKey} />
              <input type="hidden" name="roundId" value={round.id} />
              <button className="small" disabled={usingDemoData || draftCount === 0} type="submit">
                Host-mails sturen
              </button>
            </form>
          </div>
        );
      })}
      {orderedRounds.length === 0 ? <div className="board-empty">Nog geen rondes om te mailen.</div> : null}
    </div>
  );
}

function StepOne({
  adminKey,
  participants,
  showSheet,
  signupUrl,
  usingDemoData
}: {
  adminKey: string;
  participants: Participant[];
  showSheet: boolean;
  signupUrl: string;
  usingDemoData: boolean;
}) {
  return (
    <StepShell closeHref={adminHref(adminKey)} eyebrow="Stap 1" title="Deelnemers toevoegen">
      <div className="step-grid">
        <div className="qr-card">
          <img alt="QR-code naar de aanmeldpagina" src={`/api/qr?text=${encodeURIComponent(signupUrl)}`} />
          <div>
            <strong>Aanmeldpagina</strong>
            <p className="compact-muted">Deel deze link of QR-code met deelnemers. Beide gaan naar hetzelfde aanmeldformulier.</p>
            <input readOnly value={signupUrl} />
            <div className="inline-actions">
              <CopyButton value={signupUrl} />
              <CopyQrButton value={signupUrl} />
              <a className="button secondary" href="/aanmelden">
                Open pagina
              </a>
            </div>
          </div>
        </div>
        <div className="step-card-flat">
          <strong>{participants.length} aanmeldingen</strong>
          <p>
            Deelnemers kunnen zelf aanmelden en voorkeuren wijzigen. Als admin kun je dezelfde lijst ook handmatig
            corrigeren of gezinnen toevoegen.
          </p>
          <a className="button" href={adminHref(adminKey, { step: "participants", sheet: "1" })}>
            Zie aanmeldingen / voeg toe
          </a>
        </div>
      </div>

      {showSheet ? (
        <div className="nested-panel">
          <ParticipantSheet adminKey={adminKey} participants={participants} usingDemoData={usingDemoData} />
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
  usingDemoData
}: {
  adminKey: string;
  defaultMonth: string;
  matches: MatchWithPeople[];
  participants: Participant[];
  planningSettings: PlanningSettingsView;
  rounds: RoundWithMatches[];
  showSheet: boolean;
  usingDemoData: boolean;
}) {
  return (
    <StepShell closeHref={adminHref(adminKey)} eyebrow="Stap 2" title="Rondes en matches klaarzetten">
      <form action={generatePlanningAction} className="planning-form" key={`planning-${planningSettings.horizonMonths}-${defaultMonth}`}>
        <input type="hidden" name="adminKey" value={adminKey} />
        <input type="hidden" name="adminCheckDaysBefore" value={planningSettings.adminCheckDaysBefore} />
        <input type="hidden" name="hostMailDaysBefore" value={planningSettings.hostMailDaysBefore} />
        <input type="hidden" name="eaterMailDelayDays" value={planningSettings.eaterMailDelayDays} />
        <input type="hidden" name="reminderDaysAfter" value={planningSettings.reminderDaysAfter} />
        <input type="hidden" name="renewalCadence" value={planningSettings.renewalCadence} />
        <label>
          Startmaand
          <input name="startMonth" type="month" defaultValue={defaultMonth} />
          <span className="field-hint">De eerste maand waarvoor je conceptmatches wilt maken.</span>
        </label>
        <label>
          Voor hoelang klaarzetten
          <select defaultValue={String(planningSettings.horizonMonths)} name="horizonMonths">
            <option value="1">Een ronde</option>
            <option value="3">Kwartaal</option>
            <option value="12">Jaar</option>
          </select>
          <span className="field-hint">Een ronde is een maand. Een jaar maakt twaalf maandrondes in een keer.</span>
        </label>
        <button disabled={usingDemoData} type="submit">
          Rondes klaarzetten
        </button>
      </form>

      <p className="step-help">
        Matches worden automatisch gegenereerd met de deelnemers zoals ze nu in de sheet staan. Klik een maand open om de
        verbindingen te controleren, handmatig te schuiven en goed te keuren.
      </p>

      <div className="nested-panel">
        <div className="section-header">
          <h2>Rondes in de planning</h2>
          <span className="section-hint">Klik een maand open voor matches, sheet en goedkeuring.</span>
        </div>
        <RoundsAccordion
          adminKey={adminKey}
          matches={matches}
          participants={participants}
          rounds={rounds}
          usingDemoData={usingDemoData}
        />
      </div>

      {showSheet ? (
        <div className="nested-panel">
          <ParticipantSheet adminKey={adminKey} participants={participants} usingDemoData={usingDemoData} />
        </div>
      ) : null}
    </StepShell>
  );
}

function StepFour({
  adminKey,
  defaultMonth,
  emailLogs,
  matches,
  mailTemplates,
  rounds,
  usingDemoData
}: {
  adminKey: string;
  defaultMonth: string;
  emailLogs: EmailLog[];
  matches: MatchWithPeople[];
  mailTemplates: MailTemplate[];
  rounds: RoundWithMatches[];
  usingDemoData: boolean;
}) {
  const savedTemplates = new Map(mailTemplates.map((template) => [template.type, template]));

  return (
    <StepShell closeHref={adminHref(adminKey)} eyebrow="Stap 3" title="Mails klaarzetten">
      <div className="mail-cycle-note">
        <strong>Links staan automatisch klaar.</strong>
        <span>
          Per match vult het systeem de juiste persoonlijke URL in, zoals hostUrl, eaterUrl, participateUrl en
          preferencesUrl. Zet een mail uit als je die stap niet wilt gebruiken.
        </span>
      </div>
      <form action={sendPreferenceChecksAction} className="inline-form">
        <input type="hidden" name="adminKey" value={adminKey} />
        <label>
          Meedoen-check voor maand
          <input name="month" type="month" defaultValue={defaultMonth} />
        </label>
        <button className="secondary" disabled={usingDemoData} type="submit">
          Meedoen-check nu sturen
        </button>
      </form>
      <div className="nested-panel">
        <div className="section-header">
          <h2>Host-mails per ronde</h2>
          <span className="section-hint">Stuur pas als de matches in stap 2 goed staan.</span>
        </div>
        <RoundMailActions adminKey={adminKey} matches={matches} rounds={rounds} usingDemoData={usingDemoData} />
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
                  <span className={`template-status ${enabled ? "on" : "off"}`}>{enabled ? "Aan" : "Uit"}</span>
                </strong>
                <span>{definition.description}</span>
              </summary>
              <form action={saveMailTemplateAction} className="mail-template-form">
                <input type="hidden" name="adminKey" value={adminKey} />
                <input type="hidden" name="type" value={definition.type} />
                <label className="check-row template-enabled">
                  <input defaultChecked={enabled} disabled={usingDemoData} name="enabled" type="checkbox" />
                  Deze mail versturen
                </label>
                <label>
                  Onderwerp
                  <input defaultValue={saved?.subject || definition.subject} disabled={usingDemoData} name="subject" />
                </label>
                <label>
                  Tekst
                  <textarea defaultValue={saved?.body || definition.body} disabled={usingDemoData} name="body" />
                </label>
                <button className="small" disabled={usingDemoData} type="submit">
                  Bewaar concept
                </button>
              </form>
            </details>
          );
        })}
      </div>

      <div className="nested-panel">
        <div className="section-header">
          <h2>Laatste mails</h2>
        </div>
        <EmailLogsTable emailLogs={emailLogs} />
      </div>
    </StepShell>
  );
}

function StepFive({
  adminKey,
  draftReviewMatches,
  emailLogs,
  matches,
  participants,
  planningSettings,
  reviewRound,
  rounds,
  usingDemoData
}: {
  adminKey: string;
  draftReviewMatches: MatchWithPeople[];
  emailLogs: EmailLog[];
  matches: MatchWithPeople[];
  participants: Participant[];
  planningSettings: PlanningSettingsView;
  reviewRound: RoundWithMatches | undefined;
  rounds: RoundWithMatches[];
  usingDemoData: boolean;
}) {
  const activeParticipants = participants.filter((participant) => participant.active);
  const hostCount = activeParticipants.filter((participant) => participant.mode !== "EAT").length;
  const eaterCount = activeParticipants.filter((participant) => participant.mode !== "HOST").length;
  const guestCount = activeParticipants.filter((participant) => participant.isGuest).length;
  const memberCount = activeParticipants.length - guestCount;
  const savedPlanningLabel = planningHorizonLabel(planningSettings.horizonMonths);

  return (
    <StepShell closeHref={adminHref(adminKey)} eyebrow="Stap 4" title="Samenvatting en afronden">
      <div className="summary-cards">
        <div>
          <span>Stap 1</span>
          <strong>{activeParticipants.length} actieve deelnemers</strong>
          <small>
            {hostCount} kunnen ontvangen, {eaterCount} kunnen eten. {memberCount} gemeentelid, {guestCount} gast.
          </small>
        </div>
        <div>
          <span>Stap 2</span>
          <strong>{rounds.length} ronde(s)</strong>
          <small>
            Planning staat op {savedPlanningLabel}; {draftReviewMatches.length} conceptmatch(es) wachten op goedkeuring.
          </small>
        </div>
        <div>
          <span>Stap 3</span>
          <strong>{adminMailTemplateDefinitions.length} cyclusmails</strong>
          <small>{emailLogs.length} laatste mail-logregels zichtbaar.</small>
        </div>
        <div>
          <span>Stap 4</span>
          <strong>{matches.length} matches totaal</strong>
          <small>Controleer de planning en rond af met host-mails.</small>
        </div>
      </div>

      <div className="approval-panel">
        <div>
          <strong>Akkoord met deze planning?</strong>
          <p>
            Na goedkeuring krijgen de kokers hun mail. Als deelnemers tussentijds wijzigen, pas je de sheet aan en loop je
            stap 2 opnieuw langs.
          </p>
        </div>
        {reviewRound ? (
          <form action={sendHostInvitesAction}>
            <input type="hidden" name="adminKey" value={adminKey} />
            <input type="hidden" name="roundId" value={reviewRound.id} />
            <button disabled={usingDemoData || draftReviewMatches.length === 0} type="submit">
              Host-mails sturen
            </button>
          </form>
        ) : null}
      </div>

      <div className="nested-panel">
        <div className="section-header">
          <h2>Gehele planning</h2>
        </div>
        <RoundsAccordion
          adminKey={adminKey}
          matches={matches}
          participants={participants}
          rounds={rounds}
          usingDemoData={usingDemoData}
        />
      </div>

      <div className="nested-panel worksheet-panel">
        <div className="section-header">
          <h2>Werkblad matches</h2>
        </div>
        <Worksheet matches={matches} />
      </div>
    </StepShell>
  );
}

function EmptyDashboard({
  adminKey,
  matches,
  participants,
  rounds
}: {
  adminKey: string;
  matches: MatchWithPeople[];
  participants: Participant[];
  rounds: RoundWithMatches[];
}) {
  return (
    <section className="panel step-empty">
      <div>
        <p className="eyebrow">Overzicht</p>
        <h2>Kies boven een stap</h2>
        <p>Alles zit nog in dezelfde admin, maar zware tabellen en boards staan pas open als je ze nodig hebt.</p>
      </div>
      <div className="quick-stats">
        <span>
          <strong>{participants.length}</strong>
          Deelnemers
        </span>
        <span>
          <strong>{rounds.length}</strong>
          Rondes
        </span>
        <span>
          <strong>{matches.length}</strong>
          Matches
        </span>
      </div>
      <a className="button" href={adminHref(adminKey, { step: "participants" })}>
        Begin bij stap 1
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

  if (!isAdminKey(key)) {
    return (
      <div className="page narrow">
        <section className="panel centered">
          <p className="eyebrow">Admin</p>
          <h1>Admin openen</h1>
          <form className="stack" action="/">
            <label>
              Admin-sleutel
              <input name="key" type="password" />
            </label>
            <button type="submit">Openen</button>
          </form>
        </section>
      </div>
    );
  }

  let usingDemoData = false;
  let participants: Participant[];
  let rounds: RoundWithMatches[];
  let matches: MatchWithPeople[];
  let emailLogs: EmailLog[];
  let planningSettings = defaultPlanningSettings;
  let mailTemplates: MailTemplate[] = [];

  try {
    const [
      participantRows,
      roundRows,
      matchRows,
      emailLogRows,
      settingsRow,
      templateRows
    ] = await Promise.all([
      prisma.participant.findMany({ orderBy: { createdAt: "asc" }, take: 120 }),
      prisma.matchRound.findMany({ orderBy: { month: "asc" }, take: 36, include: { matches: true } }),
      prisma.mealMatch.findMany({
        orderBy: { createdAt: "desc" },
        take: 120,
        include: { host: true, eater: true, round: true }
      }),
      prisma.emailLog.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
      prisma.planningSettings.findUnique({ where: { id: "default" } }),
      prisma.mailTemplate.findMany({ orderBy: { type: "asc" } })
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

  const signupUrl = appUrl("/aanmelden");
  const queryStartMonth = first(query.startMonth);
  const defaultMonth =
    queryStartMonth && /^\d{4}-\d{2}$/.test(queryStartMonth) ? queryStartMonth : monthInputValue(toMonthStart(new Date()));
  const planningStart = parseMonthInput(defaultMonth);
  const planningEnd = addMonths(planningStart, planningSettings.horizonMonths);
  const planningRounds = rounds.filter((round) => round.month >= planningStart && round.month < planningEnd);
  const reviewRound =
    rounds.find((round) => matches.some((match) => match.roundId === round.id && match.status === "DRAFT")) ||
    rounds.find((round) => matches.some((match) => match.roundId === round.id));
  const reviewMatches = reviewRound
    ? matches
        .filter((match) => match.roundId === reviewRound.id && match.status !== "CANCELLED")
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    : [];
  const draftReviewMatches = reviewMatches.filter((match) => match.status === "DRAFT");

  return (
    <div className="page wide-page">
      <section className="intro compact admin-topline">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Houvast planning</h1>
          <p>Doorloop de stappen. Klik een stap open, werk hem af, en verberg hem weer als je klaar bent.</p>
        </div>
        <DemoTools adminKey={key} />
      </section>

      {notice ? <div className="notice success">{notice}</div> : null}
      {usingDemoData ? (
        <div className="notice">
          Demo-data zichtbaar omdat de lokale database niet bereikbaar is. Start Postgres en draai de seed om echte
          database-data te tonen.
        </div>
      ) : null}

      <StepBar adminKey={key} current={currentStep} />

      {!currentStep ? <EmptyDashboard adminKey={key} matches={matches} participants={participants} rounds={rounds} /> : null}
      {currentStep === "participants" ? (
        <StepOne
          adminKey={key}
          participants={participants}
          showSheet={showSheet}
          signupUrl={signupUrl}
          usingDemoData={usingDemoData}
        />
      ) : null}
      {currentStep === "planning" ? (
        <StepTwo
          adminKey={key}
          defaultMonth={defaultMonth}
          matches={matches}
          participants={participants}
          planningSettings={planningSettings}
          rounds={planningRounds}
          showSheet={showSheet}
          usingDemoData={usingDemoData}
        />
      ) : null}
      {currentStep === "mails" ? (
        <StepFour
          adminKey={key}
          defaultMonth={defaultMonth}
          emailLogs={emailLogs}
          matches={matches}
          mailTemplates={mailTemplates}
          rounds={rounds}
          usingDemoData={usingDemoData}
        />
      ) : null}
      {currentStep === "summary" ? (
        <StepFive
          adminKey={key}
          draftReviewMatches={draftReviewMatches}
          emailLogs={emailLogs}
          matches={matches}
          participants={participants}
          planningSettings={planningSettings}
          reviewRound={reviewRound}
          rounds={rounds}
          usingDemoData={usingDemoData}
        />
      ) : null}
    </div>
  );
}
