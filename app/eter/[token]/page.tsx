import { notFound } from "next/navigation";
import { submitEaterChoice } from "@/app/actions";
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

export default async function EaterPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const query = (await searchParams) || {};
  const t = await getTranslations("eater");
  const tc = await getTranslations("common");

  const match = await prisma.mealMatch.findUnique({
    where: { eaterToken: token },
    include: { host: true, eater: true, round: true }
  });

  if (!match) {
    notFound();
  }

  const dates = jsonDateList(match.proposedDates);
  const justConfirmed = flag(query.confirmed);
  const dateChosen = !!match.chosenDate;

  if (justConfirmed || dateChosen) {
    return (
      <div className="page narrow">
        <section className="panel">
          <p className="eyebrow">{t("eyebrow")}</p>
          <h1>{t("doneTitle")}</h1>
          <p>
            {t("coupledTo", { month: displayMonth(match.round.month), name: match.host.name })}
          </p>
          <div className="notice success">
            {t("finalDate", { date: displayDate(match.chosenDate ?? dates[0]) })}
          </div>
          {justConfirmed && (
            <div className="notice success" style={{ marginTop: "0.5rem" }}>
              {t("confirmationMail")}
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
          {t("coupledTo", { month: displayMonth(match.round.month), name: match.host.name })}
        </p>

        {query.error === "date" ? (
          <div className="notice error">{t("errorNoDate")}</div>
        ) : null}

        <div className="summary-grid">
          <div>
            <span className="label">{t("labelAddress")}</span>
            <strong>{match.host.address || t("addressTbd")}</strong>
          </div>
          <div>
            <span className="label">{t("labelNote")}</span>
            <strong>{match.hostNote || t("noNote")}</strong>
          </div>
        </div>

        {dates.length > 0 ? (
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
            <button type="submit">{t("submitChoice")}</button>
          </form>
        ) : (
          <div className="notice">{t("noDatesYet")}</div>
        )}
      </section>
    </div>
  );
}
