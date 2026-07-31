import { verifyCommunityToolsManagementRequest } from "@/lib/community-tools-management";
import { prisma } from "@/lib/db";

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
    users: organization.accounts.map((account) => ({
      id: `admin:${account.id}`,
      communityToolsUserId: account.communityToolsUserId,
      name: account.name || account.email,
      email: account.email,
      role: account.role === "owner" ? "organization_owner" : "organization_admin",
      status: "active"
    }))
  });
}
