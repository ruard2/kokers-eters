import { notFound } from "next/navigation";
import { updatePreferences } from "@/app/actions";
import { ParticipantFormFields } from "@/components/ParticipantFormFields";
import { prisma } from "@/lib/db";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function hasFlag(value: string | string[] | undefined) {
  return typeof value === "string";
}

export default async function PreferencesPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const query = (await searchParams) || {};
  const t = await getTranslations("preferences");

  const participant = await prisma.participant.findUnique({
    where: { preferenceToken: token }
  });

  if (!participant) {
    notFound();
  }

  return (
    <div className="page">
      <section className="intro compact">
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1>{t("title")}</h1>
        <p>{t("intro")}</p>
      </section>

      {hasFlag(query.saved) ? <div className="notice success">{t("saved")}</div> : null}
      {hasFlag(query.error) ? <div className="notice error">{t("errorRequired")}</div> : null}

      <form action={updatePreferences} className="panel form-grid">
        <input type="hidden" name="token" value={token} />
        <ParticipantFormFields participant={participant} showActive />
        <div className="actions wide">
          <button type="submit">{t("submit")}</button>
        </div>
      </form>
    </div>
  );
}
