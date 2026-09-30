import AdminPage from "./admin/page";
import { ChurchSearch } from "@/components/ChurchSearch";
import { getAllOrgs } from "@/lib/org-by-slug";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function PlatformHomePage() {
  const orgs = getAllOrgs();
  return (
    <div className="page narrow">
      <section className="panel landing-panel">
        <h1 className="landing-title">Eters&nbsp;&amp;&nbsp;Kokers</h1>
        <p className="landing-intro">
          Een app die maaltijden regelt binnen kerkgemeenschappen. Zoek hieronder
          je kerk om je aan te melden.
        </p>
        <ChurchSearch orgs={orgs} />
      </section>
      <p className="platform-admin-link">
        <a href="/?key=">Beheerder? Log hier in</a>
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
