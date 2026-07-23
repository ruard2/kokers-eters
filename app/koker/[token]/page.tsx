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

  return (
    <div className="page narrow">
      <section className="panel">
        <p className="eyebrow">Koker</p>
        <h1>Dagen kiezen</h1>
        <p>
          Voor {displayMonth(match.round.month)} ben je gekoppeld aan <strong>{match.eater.name}</strong>.
        </p>

        {flag(query.sent) ? <div className="notice success">Verstuurd. De eter kan nu een definitieve dag kiezen.</div> : null}
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

        {match.chosenDate ? (
          <div className="notice success">Definitieve datum: {displayDate(match.chosenDate)}</div>
        ) : null}

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
