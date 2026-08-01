import { verifyCommunityToolsManagementRequest } from "@/lib/community-tools-management";
import { prisma } from "@/lib/db";
import { sendWelcomeEmail } from "@/lib/mailer";

export async function POST(request: Request, { params }: RouteContext<"/api/community-tools/v1/organizations/[organizationId]/users/[userId]/resend">) {
  if (!verifyCommunityToolsManagementRequest(request)) return Response.json({ error: "Geen toegang." }, { status: 401 });
  const { organizationId, userId } = await params;
  const organization = await prisma.organization.findUnique({ where: { communityToolsId: organizationId } });
  if (!organization || !userId.startsWith("participant:")) return Response.json({ error: "Niet gevonden." }, { status: 404 });
  const participant = await prisma.participant.findFirst({ where: { id: userId.slice(12), organizationId: organization.id } });
  if (!participant) return Response.json({ error: "Niet gevonden." }, { status: 404 });
  await sendWelcomeEmail(participant);
  return Response.json({ ok: true });
}
