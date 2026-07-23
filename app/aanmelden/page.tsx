import { registerParticipant } from "@/app/actions";
import { ParticipantFormFields } from "@/components/ParticipantFormFields";
import { prisma } from "@/lib/db";
import { calculateSignupBalance, type SignupBalance } from "@/lib/signup-balance";

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

function BalanceCard({ balance }: { balance: SignupBalance }) {
  return (
    <section className={`balance-card ${balance.tone}`} aria-label="Balans tussen kokers en eters">
      <div className="balance-head">
        <div>
          <p className="eyebrow">Balans op dit moment</p>
          <h2>{balance.title}</h2>
        </div>
        <strong>{balance.badge}</strong>
      </div>
      <div className="balance-bars" aria-label="Vraag en aanbod voor komende rondes">
        <div className="balance-row">
          <span>Etersplekken nodig</span>
          <div className="balance-track">
            <i className="eater-bar" style={{ width: `${balance.eaterPercent}%` }} />
          </div>
          <b>{balance.eaterNeed}</b>
        </div>
        <div className="balance-row">
          <span>Ontvangplekken beschikbaar</span>
          <div className="balance-track">
            <i className="host-bar" style={{ width: `${balance.hostPercent}%` }} />
          </div>
          <b>{balance.hostSupply}</b>
        </div>
      </div>
      <p>
        {balance.description} <span>De aantallen zijn per kwartaal gerekend, zodat frequentie meetelt.</span>
      </p>
    </section>
  );
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

      {balance ? <BalanceCard balance={balance} /> : null}

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
