import { getTranslations } from "next-intl/server";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ThanksPage({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const token = first(params.token);
  const t = await getTranslations("thanks");

  return (
    <div className="page narrow">
      <section className="panel centered">
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1>{t("title")}</h1>
        <p>{t("body")}</p>
        {token ? (
          <p>
            <a className="button secondary" href={`/voorkeuren/${token}`}>
              {t("viewPreferences")}
            </a>
          </p>
        ) : null}
      </section>
    </div>
  );
}
