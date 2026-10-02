import { notFound } from "next/navigation";
import { submitHostDates } from "@/app/actions";
import { displayDate, displayMonth, jsonDateList } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { getTranslations } from "next-intl/server";

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
  const t = await getTranslations("host");
  const tc = await getTranslations("common");

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

  if (justSent || dateChosen) {
    return (
      <div className="page narrow">
        <section className="panel">
          <p className="eyebrow">{t("eyebrow")}</p>
          <h1>{dateChosen ? t("doneConfirmed") : t("doneSent")}</h1>
          <p>
            {t("coupledTo", { month: displayMonth(match.round.month), name: match.eater.name })}
          </p>
          {dateChosen ? (
            <div className="notice success">
              {t("finalDate", { date: displayDate(match.chosenDate!) })}
            </div>
          ) : (
            <div className="notice success">
              {t("eaterWillChoose")}
            </div>
          )}
          <p style={{ marginTop: "1.5rem", color: "var(--color-muted, #5e6b62)" }}>
            {tc("closeWindow")}
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="page narrow">
      <section className="panel">
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1>{t("pickTitle")}</h1>
        <p>
          {t("coupledTo", { month: displayMonth(match.round.month), name: match.eater.name })}
        </p>

        {query.error === "dates" ? (
          <div className="notice error">{t("errorNoDates")}</div>
        ) : null}

        <div className="summary-grid">
          <div>
            <span className="label">{t("labelGroup")}</span>
            <strong>{t("groupValue", { n: match.partySize })}</strong>
          </div>
          <div>
            <span className="label">{t("labelAllergies")}</span>
            <strong>{match.eater.allergies || t("noAllergies")}</strong>
          </div>
        </div>

        <form action={submitHostDates} className="stack">
          <input type="hidden" name="token" value={token} />
          <label>
            {t("noteLabel")}
            <textarea name="hostNote" rows={3} defaultValue={match.hostNote || ""} />
          </label>
          <div>
            <span className="label">{t("datesLabel")}</span>
            <div className="date-grid">
              {[0, 1, 2, 3, 4].map((index) => (
                <input key={index} type="date" name={`date${index + 1}`} defaultValue={dates[index] || ""} />
              ))}
            </div>
          </div>
          <button type="submit">{t("submitDates")}</button>
        </form>
      </section>
    </div>
  );
}
