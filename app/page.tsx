import AdminPage from "./admin/page";
import { ChurchSearch } from "@/components/ChurchSearch";
import { getAllOrgs } from "@/lib/org-by-slug";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

async function PlatformHomePage() {
  const orgs = getAllOrgs();
  const t = await getTranslations("home");
  const ts = await getTranslations("search");

  return (
    <div className="page narrow">
      <section className="panel landing-panel">
        <h1 className="landing-title">{t("title")}</h1>
        <p className="landing-intro">{t("intro")}</p>
        <ChurchSearch
          orgs={orgs}
          label={ts("label")}
          placeholder={ts("placeholder")}
          confirmText={ts("confirm")}
          foundEyebrow={ts("foundEyebrow")}
          otherChurch={ts("otherChurch")}
          notFoundPrefix={ts.raw("notFound")}
          signupButtonPrefix={ts.raw("signupButton")}
        />
      </section>
      <p className="platform-admin-link">
        <a href="/?key=">{t("adminLink")}</a>
      </p>
    </div>
  );
}

export default async function HomePage({ searchParams }: PageProps) {
  const query = (await searchParams) || {};
  if ("key" in query) {
    return <AdminPage searchParams={searchParams} />;
  }
  return <PlatformHomePage />;
}
