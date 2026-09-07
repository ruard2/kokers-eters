import { notFound } from "next/navigation";
import { submitHostDates } from "@/app/actions";
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

export default async function HostPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const query = (await searchParams) || {};
  const match = await prisma.mealMatch.findUnique({
    where: { hostToken: token },
    include: { host: true, eater: true, round: true }
  });

  if (!match) {
    notFound();
  }

  const dates = jsonDateList(match.proposedDates);
  const justSent = flag(query.sent);
  const dateChosen = !!match.chosenDate;

  // Done state: host just sent dates, or eater already confirmed a date
  if (justSent || dateChosen) {
    return (
      <div className="page narrow">
        <section className="panel">
          <p className="eyebrow">Koker</p>
          <h1>{dateChosen ? "Afgesproken!" : "Verstuurd!"}</h1>
          <p>
            Voor {displayMonth(match.round.month)} ben je gekoppeld aan <strong>{match.eater.name}</strong>.
          </p>
          {dateChosen ? (
            <div className="notice success">
              Definitieve datum: {displayDate(match.chosenDate!)}.
            </div>
          ) : (
            <div className="notice success">
              De eter ontvangt een mail met jouw beschikbare dagen en kan nu een dag kiezen.
            </div>
          )}
          <p style={{ marginTop: "1.5rem", color: "var(--color-muted, #5e6b62)" }}>
            Je kunt dit venster sluiten.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="page narrow">
      <section className="panel">
        <p className="eyebrow">Koker</p>
        <h1>Dagen kiezen</h1>
        <p>
          Voor {displayMonth(match.round.month)} ben je gekoppeld aan <strong>{match.eater.name}</strong>.
        </p>

        {query.error === "dates" ? <div className="notice error">Kies minimaal een dag.</div> : null}

        <div className="summary-grid">
          <div>
            <span className="label">Groep</span>
            <strong>{match.partySize} persoon/personen</strong>
          </div>
          <div>
            <span className="label">Allergieën</span>
            <strong>{match.eater.allergies || "Geen bijzonderheden opgegeven"}</strong>
          </div>
        </div>

        <form action={submitHostDates} className="stack">
          <input type="hidden" name="token" value={token} />
          <label>
            Vraag of opmerking voor de eter
            <textarea name="hostNote" rows={3} defaultValue={match.hostNote || ""} />
          </label>
          <div>
            <span className="label">Mogelijke dagen</span>
            <div className="date-grid">
              {[0, 1, 2, 3, 4].map((index) => (
                <input key={index} type="date" name={`date${index + 1}`} defaultValue={dates[index] || ""} />
              ))}
            </div>
          </div>
          <button type="submit">Dagen naar eter sturen</button>
        </form>
      </section>
    </div>
  );
}
