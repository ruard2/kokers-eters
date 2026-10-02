import { notFound } from "next/navigation";
import { setRoundParticipation } from "@/app/actions";
import { displayMonth, parseMonthInput } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ParticipationPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const query = (await searchParams) || {};
  const monthValue = first(query.month) || "";
  const month = parseMonthInput(monthValue);
  const t = await getTranslations("participation");

  const participant = await prisma.participant.findUnique({
    where: { preferenceToken: token }
  });

  if (!participant) {
    notFound();
  }

  const optOut = await prisma.roundOptOut.findUnique({
    where: {
      participantId_month: {
        participantId: participant.id,
        month
      }
    }
  });

  return (
    <div className="page narrow">
      <section className="panel centered">
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1>{t("title", { month: displayMonth(month) })}</h1>
        <p>{t("intro")}</p>

        {first(query.saved) === "yes" ? <div className="notice success">{t("savedYes")}</div> : null}
        {first(query.saved) === "no" ? <div className="notice">{t("savedNo")}</div> : null}
        {!first(query.saved) && optOut ? <div className="notice">{t("currentlyOut")}</div> : null}

        <div className="button-row">
          <form action={setRoundParticipation}>
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="month" value={monthValue} />
            <input type="hidden" name="choice" value="yes" />
            <button type="submit">{t("buttonYes")}</button>
          </form>
          <form action={setRoundParticipation}>
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="month" value={monthValue} />
            <input type="hidden" name="choice" value="no" />
            <button type="submit" className="secondary">
              {t("buttonNo")}
            </button>
          </form>
        </div>

        <p>
          <a href={`/voorkeuren/${token}`}>{t("preferencesLink")}</a>
        </p>
      </section>
    </div>
  );
}
