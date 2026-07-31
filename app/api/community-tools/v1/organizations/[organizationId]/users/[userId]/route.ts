import { verifyCommunityToolsManagementRequest } from "@/lib/community-tools-management";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

async function organizationFor(request: Request, centralId: string) {
  if (!verifyCommunityToolsManagementRequest(request)) return null;
  return prisma.organization.findUnique({ where: { communityToolsId: centralId } });
}

export async function PATCH(
  request: Request,
  { params }: RouteContext<"/api/community-tools/v1/organizations/[organizationId]/users/[userId]">
) {
  const { organizationId, userId } = await params;
  const organization = await organizationFor(request, organizationId);
  if (!organization) return Response.json({ error: "Geen toegang of organisatie niet gevonden." }, { status: 404 });
  const body = await request.json() as { name?: string; email?: string; status?: string };
  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  if (!name || !email) return Response.json({ error: "Naam en e-mail zijn verplicht." }, { status: 400 });
  const [kind, id] = splitId(userId);
  try {
    if (kind === "participant") {
      const found = await prisma.participant.findFirst({ where: { id, organizationId: organization.id } });
      if (!found) return Response.json({ error: "Niet gevonden." }, { status: 404 });
      await prisma.participant.update({ where: { id }, data: { name, email, active: body.status === "active" } });
    } else if (kind === "admin") {
      const found = await prisma.communityToolsAccount.findFirst({ where: { id, organizationId: organization.id } });
      if (!found) return Response.json({ error: "Niet gevonden." }, { status: 404 });
      await prisma.communityToolsAccount.update({ where: { id }, data: { name, email } });
    } else return Response.json({ error: "Ongeldig account." }, { status: 400 });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "E-mailadres is al in gebruik." }, { status: 409 });
  }
}

export async function DELETE(
  request: Request,
  { params }: RouteContext<"/api/community-tools/v1/organizations/[organizationId]/users/[userId]">
) {
  const { organizationId, userId } = await params;
  const organization = await organizationFor(request, organizationId);
  if (!organization) return Response.json({ error: "Geen toegang of organisatie niet gevonden." }, { status: 404 });
  const [kind, id] = splitId(userId);
  if (kind === "participant") {
    const found = await prisma.participant.findFirst({ where: { id, organizationId: organization.id } });
    if (!found) return Response.json({ error: "Niet gevonden." }, { status: 404 });
    await prisma.participant.update({ where: { id }, data: { active: false } });
  } else if (kind === "admin") {
    const found = await prisma.communityToolsAccount.findFirst({ where: { id, organizationId: organization.id } });
    if (!found) return Response.json({ error: "Niet gevonden." }, { status: 404 });
    if (found.role === "owner") return Response.json({ error: "De eigenaar kan niet worden verwijderd." }, { status: 409 });
    await prisma.communityToolsAccount.delete({ where: { id } });
  } else return Response.json({ error: "Ongeldig account." }, { status: 400 });
  return Response.json({ ok: true });
}

function splitId(value: string): [string, string] {
  const separator = value.indexOf(":");
  return separator < 0 ? ["", value] : [value.slice(0, separator), value.slice(separator + 1)];
}
