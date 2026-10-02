import { registerParticipant } from "@/app/actions";
import { ParticipantFormFields } from "@/components/ParticipantFormFields";
import { prisma } from "@/lib/db";
import { calculateSignupBalance } from "@/lib/signup-balance";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function getSignupBalance(organizationId: string | null) {
  try {
    const participants = await prisma.participant.findMany({
      where: { organizationId },
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
  const requestedOrganizationId = first(params.organization) || "";
  const t = await getTranslations("signup");

  const organization = requestedOrganizationId
    ? await prisma.organization.findUnique({
        where: { id: requestedOrganizationId },
        select: { id: true, name: true }
      })
    : null;
  const balance = await getSignupBalance(organization?.id || null);
  const orgName = organization?.name || process.env.APP_ORGANIZATION_NAME || t("eyebrow");

  return (
    <div className="page">
      <section className="intro">
        <p className="eyebrow">{orgName}</p>
        <h1>{t("title")}</h1>
        <p>{t("intro")}</p>
      </section>

      {error ? (
        <div className="notice error">
          {error === "address" ? t("errorAddress") : t("errorRequired")}
        </div>
      ) : null}

      <form action={registerParticipant} className="panel form-grid">
        <input
          name="organizationId"
          type="hidden"
          value={organization?.id || ""}
        />
        <ParticipantFormFields balance={balance} />
        <div className="actions wide">
          <button type="submit">{t("submit")}</button>
        </div>
      </form>
    </div>
  );
}
