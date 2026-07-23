import { notFound } from "next/navigation";
import { submitEaterChoice } from "@/app/actions";
import { displayDate, displayMonth, jsonDateList } from "@/lib/dates";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function flag(value: string | string[] | undefined) {
  return typeof value === "string";
}

export default async function EaterPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const query = (await searchParams) || {};
  const match = await prisma.mealMatch.findUnique({
    where: { eaterToken: token },
    include: { host: true, eater: true, round: true }
  });

  if (!match) {
    notFound();
  }

  const dates = jsonDateList(match.proposedDates);

  return (
    <div className="page narrow">
      <section className="panel">
        <p className="eyebrow">Eter</p>
        <h1>Kies je dag</h1>
        <p>
          Voor {displayMonth(match.round.month)} ben je gekoppeld aan <strong>{match.host.name}</strong>.
        </p>

        {flag(query.confirmed) ? <div className="notice success">Bevestigd. Jullie krijgen allebei een mail.</div> : null}
        {query.error === "date" ? <div className="notice error">Kies een van de voorgestelde dagen.</div> : null}

        <div className="summary-grid">
          <div>
            <span className="label">Adres</span>
            <strong>{match.host.address || "Adres volgt via de host"}</strong>
          </div>
          <div>
            <span className="label">Opmerking host</span>
            <strong>{match.hostNote || "Geen opmerking"}</strong>
          </div>
        </div>

        {match.chosenDate ? (
          <div className="notice success">Definitieve datum: {displayDate(match.chosenDate)}</div>
        ) : dates.length > 0 ? (
          <form action={submitEaterChoice} className="stack">
            <input type="hidden" name="token" value={token} />
            <div className="choice-list">
              {dates.map((date, index) => (
                <label key={date}>
                  <input name="selectedDate" type="radio" value={date} defaultChecked={index === 0} />
                  <span>{displayDate(date)}</span>
                </label>
              ))}
            </div>
            <button type="submit">Deze dag bevestigen</button>
          </form>
        ) : (
          <div className="notice">De host heeft nog geen dagen gekozen.</div>
        )}
      </section>
    </div>
  );
}
