import { registerParticipant } from "./actions";
import { ParticipantFormFields } from "@/components/ParticipantFormFields";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Home({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const error = first(params.error);

  return (
    <div className="page">
      <section className="intro">
        <p className="eyebrow">Kerkgemeenschap</p>
        <h1>Schuif aan of zet je tafel open.</h1>
        <p>
          Vul kort in hoe je wilt meedoen. De app koppelt mensen per ronde automatisch en stuurt daarna de juiste mails.
        </p>
      </section>

      {error ? (
        <div className="notice error">
          {error === "address"
            ? "Vul een adres in als je eters ontvangt."
            : "Vul minimaal naam, e-mail en WhatsAppnummer in."}
        </div>
      ) : null}

      <form action={registerParticipant} className="panel form-grid">
        <ParticipantFormFields />
        <div className="actions wide">
          <button type="submit">Aanmelden</button>
        </div>
      </form>
    </div>
  );
}
