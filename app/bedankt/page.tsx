type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ThanksPage({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const token = first(params.token);

  return (
    <div className="page narrow">
      <section className="panel centered">
        <p className="eyebrow">Gelukt</p>
        <h1>Je aanmelding staat erin.</h1>
        <p>
          Je krijgt een mail met je persoonlijke link. Via die link kun je later voorkeuren wijzigen of tijdelijk pauzeren.
        </p>
        {token ? (
          <p>
            <a className="button secondary" href={`/voorkeuren/${token}`}>
              Voorkeuren bekijken
            </a>
          </p>
        ) : null}
      </section>
    </div>
  );
}
