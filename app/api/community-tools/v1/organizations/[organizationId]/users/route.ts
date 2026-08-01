import { verifyCommunityToolsManagementRequest } from "@/lib/community-tools-management";
import { prisma } from "@/lib/db";
import { sendWelcomeEmail } from "@/lib/mailer";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: RouteContext<"/api/community-tools/v1/organizations/[organizationId]/users">
) {
  if (!verifyCommunityToolsManagementRequest(request)) {
    return Response.json(
      { error: "Ongeldige Community Tools-beheerverbinding." },
      { status: 401 }
    );
  }

  const { organizationId } = await params;
  const organization = await prisma.organization.findUnique({
    where: { communityToolsId: organizationId },
    include: {
      accounts: {
        orderBy: [{ name: "asc" }, { email: "asc" }]
      },
      participants: {
        select: { id: true, name: true, email: true, mode: true, active: true },
        orderBy: [{ name: "asc" }, { email: "asc" }]
      }
    }
  });
  if (!organization) {
    return Response.json(
      { error: "Organisatie is nog niet aan Kokers & eters gekoppeld." },
      { status: 404 }
    );
  }

  return Response.json({
    version: "1",
    product: "shared_meals",
    organizationId,
    users: [
      ...organization.accounts.map((account) => ({
      id: `admin:${account.id}`,
      communityToolsUserId: account.communityToolsUserId,
      name: account.name || account.email,
      email: account.email,
      role: account.role === "owner" ? "organization_owner" : "organization_admin",
      status: "active",
      kind: "admin"
      })),
      ...organization.participants.map((participant) => ({
        id: `participant:${participant.id}`,
        communityToolsUserId: null,
        name: participant.name,
        email: participant.email,
        role: participant.mode === "HOST" ? "cook" : participant.mode === "EAT" ? "eater" : "cook_and_eater",
        status: participant.active ? "active" : "inactive",
        kind: "user"
      }))
    ]
  });
}

export async function POST(request: Request, { params }: RouteContext<"/api/community-tools/v1/organizations/[organizationId]/users">) {
  if (!verifyCommunityToolsManagementRequest(request)) return Response.json({ error: "Geen toegang." }, { status: 401 });
  const { organizationId } = await params;
  const organization = await prisma.organization.findUnique({ where: { communityToolsId: organizationId } });
  if (!organization) return Response.json({ error: "Organisatie niet gekoppeld." }, { status: 404 });
  const body = await request.json() as { name?: string; email?: string; role?: string };
  const name = body.name?.trim(); const email = body.email?.trim().toLowerCase();
  if (!name || !email) return Response.json({ error: "Naam en e-mail zijn verplicht." }, { status: 400 });
  if (!["cook", "eater", "cook_and_eater"].includes(body.role ?? "")) return Response.json({ error: "Ongeldige rol." }, { status: 400 });
  try {
    const participant = await prisma.participant.create({ data: { organizationId: organization.id, name, email, whatsapp: "", preferenceToken: crypto.randomUUID(), mode: body.role === "cook" ? "HOST" : body.role === "eater" ? "EAT" : "BOTH" } });
    await sendWelcomeEmail(participant);
    return Response.json({ id: `participant:${participant.id}` }, { status: 201 });
  } catch { return Response.json({ error: "Uitnodigen is mislukt." }, { status: 409 }); }
}
