import { registerParticipant } from "@/app/actions";
import { ParticipantFormFields } from "@/components/ParticipantFormFields";
import { prisma } from "@/lib/db";
import { calculateSignupBalance } from "@/lib/signup-balance";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function getSignupBalance() {
  try {
    const participants = await prisma.participant.findMany({
      select: {
        active: true,
        mode: true,
        comingWithCount: true,
        hostCapacity: true,
        eaterFrequency: true,
        hostFrequency: true
      }
    });

    return calculateSignupBalance(participants);
  } catch {
    return process.env.NODE_ENV === "production" ? null : calculateSignupBalance([]);
  }
}

export default async function SignupPage({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const error = first(params.error);
  const balance = await getSignupBalance();

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
        <ParticipantFormFields balance={balance} />
        <div className="actions wide">
          <button type="submit">Aanmelden</button>
        </div>
      </form>
    </div>
  );
}
