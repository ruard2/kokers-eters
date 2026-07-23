import {
  cancelMatchAction,
  clearDemoAction,
  generateMonthlyRoundAction,
  runJobsAction,
  seedDemoAction,
  sendHostInvitesAction,
  sendPreferenceChecksAction
} from "@/app/actions";
import { AdminMatchBoard, type BoardMatch } from "@/components/AdminMatchBoard";
import { demoSeedEnabled, isAdminKey } from "@/lib/admin";
import { displayDate, displayMonth, jsonDateList, monthInputValue, toMonthStart } from "@/lib/dates";
import { demoAdminData } from "@/lib/demo-data";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function modeLabel(value: string) {
  if (value === "EAT") return "Eten";
  if (value === "HOST") return "Koken";
  return "Allebei";
}

function scopeLabel(value: string) {
  if (value === "COMMUNITY_WIDE") return "Gemeentebreed";
  if (value === "GUESTS_AND_NEWCOMERS") return "Gasten/nieuwkomers";
  return "Allebei";
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

type AdminParticipantLike = {
  id: string;
  name: string;
  email: string;
  whatsapp: string;
  mode: string;
  hostCapacity: number | null;
  allergies: string | null;
  address: string | null;
  cookingPlan: string | null;
  communityScope: string;
  gatheringType: string;
};

type AdminMatchLike = {
  id: string;
  roundId: string;
  status: string;
  partySize: number;
  createdAt: Date;
  host: AdminParticipantLike;
  eater: AdminParticipantLike;
};

function boardParticipant(participant: AdminParticipantLike) {
  return {
    id: participant.id,
    name: participant.name,
    email: participant.email,
    whatsapp: participant.whatsapp,
    mode: participant.mode,
    hostCapacity: participant.hostCapacity,
    allergies: participant.allergies,
    address: participant.address,
    cookingPlan: participant.cookingPlan,
    communityScope: participant.communityScope,
    gatheringType: participant.gatheringType
  };
}

function boardMatch(match: AdminMatchLike): BoardMatch {
  return {
    id: match.id,
    roundId: match.roundId,
    status: match.status,
    partySize: match.partySize,
    host: boardParticipant(match.host),
    eater: boardParticipant(match.eater)
  };
}

export default async function AdminPage({ searchParams }: PageProps) {
  const query = (await searchParams) || {};
  const key = first(query.key) || "";
  const notice = first(query.notice);

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
  let participants;
  let rounds;
  let matches;
  let emailLogs;

  try {
    [participants, rounds, matches, emailLogs] = await Promise.all([
      prisma.participant.findMany({ orderBy: { createdAt: "desc" }, take: 80 }),
      prisma.matchRound.findMany({ orderBy: { month: "desc" }, take: 12, include: { matches: true } }),
      prisma.mealMatch.findMany({
        orderBy: { createdAt: "desc" },
        take: 80,
        include: { host: true, eater: true, round: true }
      }),
      prisma.emailLog.findMany({ orderBy: { createdAt: "desc" }, take: 20 })
    ]);
  } catch {
    usingDemoData = true;
    const demo = demoAdminData();
    participants = demo.participants;
    rounds = demo.rounds;
    matches = demo.matches;
    emailLogs = demo.emailLogs;
  }

  const defaultMonth = monthInputValue(toMonthStart(new Date()));
  const showDemoTools = demoSeedEnabled();
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
      <section className="intro compact" style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Rondes en matches</h1>
          <p>Maak rondes, verstuur host-mails en controleer wat de randomizer heeft gedaan.</p>
          <div className="intro-actions">
            <a className="button secondary" href="/aanmelden">
              Deel aanmeldpagina
            </a>
          </div>
        </div>

        {showDemoTools ? (
          <div
            className="panel"
            style={{ display: "flex", flexDirection: "column", gap: "0.5rem", minWidth: "12rem", padding: "0.75rem" }}
          >
            <p className="eyebrow" style={{ margin: 0 }}>
              Demo (alleen ontwikkelfase)
            </p>
            <form action={seedDemoAction}>
              <input type="hidden" name="adminKey" value={key} />
              <button type="submit" className="small" style={{ width: "100%" }}>
                Demo-data laden
              </button>
            </form>
            <form action={clearDemoAction}>
              <input type="hidden" name="adminKey" value={key} />
              <button type="submit" className="small danger" style={{ width: "100%" }}>
                Demo-data wissen
              </button>
            </form>
          </div>
        ) : null}
      </section>

      {notice ? <div className="notice success">{notice}</div> : null}
      {usingDemoData ? (
        <div className="notice">
          Demo-data zichtbaar omdat de lokale database niet bereikbaar is. Start Postgres en draai de seed om echte
          database-data te tonen.
        </div>
      ) : null}

      <section className="admin-actions">
        <form action={generateMonthlyRoundAction} className="panel action-panel">
          <input type="hidden" name="adminKey" value={key} />
          <label>
            Maand
            <input name="month" type="month" defaultValue={defaultMonth} />
          </label>
          <button type="submit">Ronde genereren</button>
        </form>

        <form action={sendPreferenceChecksAction} className="panel action-panel">
          <input type="hidden" name="adminKey" value={key} />
          <label>
            Maand
            <input name="month" type="month" defaultValue={defaultMonth} />
          </label>
          <button type="submit">Voorkeursmail sturen</button>
        </form>

        <form action={runJobsAction} className="panel action-panel">
          <input type="hidden" name="adminKey" value={key} />
          <p>Run de automatische taken nu handmatig.</p>
          <button type="submit">Jobs draaien</button>
        </form>
      </section>

      <section className="panel match-review-panel">
        <div className="section-header match-review-header">
          <div>
            <p className="eyebrow">Goedkeuring</p>
            <h2>Conceptverbindingen</h2>
            <span className="review-month">{reviewRound ? displayMonth(reviewRound.month) : "Geen ronde"}</span>
          </div>
          {reviewRound ? (
            <form action={sendHostInvitesAction}>
              <input type="hidden" name="adminKey" value={key} />
              <input type="hidden" name="roundId" value={reviewRound.id} />
              <button disabled={usingDemoData || draftReviewMatches.length === 0} type="submit">
                Goedkeuren + host-mails
              </button>
            </form>
          ) : null}
        </div>
        <AdminMatchBoard adminKey={key} disabled={usingDemoData} initialMatches={reviewMatches.map(boardMatch)} />
      </section>

      <section className="panel worksheet-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Werkblad</p>
            <h2>Uitkomst van de randomizer</h2>
          </div>
        </div>
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
                <th>Kring</th>
                <th>Vorm</th>
                <th>Allergie/dieet</th>
                <th>Host kookt</th>
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
                    <td>{scopeLabel(match.eater.communityScope)}</td>
                    <td>{gatheringLabel(match.eater.gatheringType)}</td>
                    <td>{match.eater.allergies || "-"}</td>
                    <td>{match.host.cookingPlan || "-"}</td>
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
                  <td colSpan={16}>Nog geen matches. Genereer eerst een ronde of draai de demo-seed.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="section-header">
          <h2>Rondes</h2>
        </div>
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
                      <input type="hidden" name="adminKey" value={key} />
                      <input type="hidden" name="roundId" value={round.id} />
                      <button type="submit" className="small">
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
      </section>

      <section className="panel">
        <div className="section-header">
          <h2>Matches</h2>
        </div>
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
                  <td>{match.status}</td>
                  <td>
                    <form action={cancelMatchAction}>
                      <input type="hidden" name="adminKey" value={key} />
                      <input type="hidden" name="matchId" value={match.id} />
                      <button type="submit" className="small danger">
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
      </section>

      <section className="panel">
        <div className="section-header">
          <h2>Deelnemers</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Naam</th>
                <th>Mail</th>
                <th>Rol</th>
                <th>Komt met</th>
                <th>Ontvangt</th>
                <th>Actief</th>
              </tr>
            </thead>
            <tbody>
              {participants.map((participant) => (
                <tr key={participant.id}>
                  <td>{participant.name}</td>
                  <td>{participant.email}</td>
                  <td>{participant.mode}</td>
                  <td>{participant.comingWithCount}</td>
                  <td>{participant.hostCapacity || "-"}</td>
                  <td>{participant.active ? "Ja" : "Nee"}</td>
                </tr>
              ))}
              {participants.length === 0 ? (
                <tr>
                  <td colSpan={6}>Nog geen deelnemers.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="section-header">
          <h2>Laatste mails</h2>
        </div>
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
      </section>
    </div>
  );
}
