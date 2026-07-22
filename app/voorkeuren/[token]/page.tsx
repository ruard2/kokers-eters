import { notFound } from "next/navigation";
import { updatePreferences } from "@/app/actions";
import { ParticipantFormFields } from "@/components/ParticipantFormFields";
import { prisma } from "@/lib/db";

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
  const participant = await prisma.participant.findUnique({
    where: { preferenceToken: token }
  });

  if (!participant) {
    notFound();
  }

  return (
    <div className="page">
      <section className="intro compact">
        <p className="eyebrow">Persoonlijke link</p>
        <h1>Voorkeuren wijzigen</h1>
        <p>Pas aan hoe je mee wilt doen. Deze link is persoonlijk, dus deel hem niet breed.</p>
      </section>

      {hasFlag(query.saved) ? <div className="notice success">Je voorkeuren zijn opgeslagen.</div> : null}
      {hasFlag(query.error) ? <div className="notice error">Vul minimaal naam, e-mail en WhatsAppnummer in.</div> : null}

      <form action={updatePreferences} className="panel form-grid">
        <input type="hidden" name="token" value={token} />
        <ParticipantFormFields participant={participant} showActive />
        <div className="actions wide">
          <button type="submit">Voorkeuren opslaan</button>
        </div>
      </form>
    </div>
  );
}
