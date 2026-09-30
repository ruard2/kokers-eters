"use server";

import AdminPage from "./admin/page";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

async function LandingPage() {
  const orgName = process.env.APP_ORGANIZATION_NAME || "";

  return (
    <div className="page narrow">
      <section className="panel landing-panel">
        {orgName ? <p className="eyebrow">{orgName}</p> : null}
        <h1 className="landing-title">Eters&nbsp;&amp;&nbsp;Kokers</h1>
        <p className="landing-intro">
          Elke maand word je gekoppeld aan iemand uit de gemeenschap. De een kookt, de ander eet —
          de volgende ronde misschien omgekeerd. Een simpele manier om nieuwe mensen te leren kennen
          rond de eettafel.
        </p>
        <a className="button landing-cta" href="/aanmelden">
          Meld je aan
        </a>
        <p className="landing-admin-link">
          <a href="/?key=">Beheerder? Log hier in</a>
        </p>
      </section>
    </div>
  );
}

export default async function HomePage({ searchParams }: PageProps) {
  const query = (await searchParams) || {};

  // Show admin when ?key= is present (even empty — admin handles the login form)
  if ("key" in query) {
    return <AdminPage searchParams={searchParams} />;
  }

  return <LandingPage />;
}
