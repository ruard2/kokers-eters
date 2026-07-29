import { NextRequest, NextResponse } from "next/server";
import { createCommunityToolsAdminKey } from "@/lib/admin";
import { exchangeCommunityToolsTicket } from "@/lib/community-tools";
import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/urls";

export async function GET(request: NextRequest) {
  const ticket = request.nextUrl.searchParams.get("ct_ticket") || "";

  try {
    const context = await exchangeCommunityToolsTicket(ticket);
    const organization = await prisma.organization.upsert({
      where: { communityToolsId: context.organization.id },
      create: {
        communityToolsId: context.organization.id,
        name: context.organization.name
      },
      update: { name: context.organization.name }
    });
    await prisma.communityToolsAccount.upsert({
      where: { communityToolsUserId: context.user.id },
      create: {
        communityToolsUserId: context.user.id,
        organizationId: organization.id,
        email: context.user.email.toLowerCase(),
        name: context.user.name || context.user.email,
        role: context.organization.role
      },
      update: {
        organizationId: organization.id,
        email: context.user.email.toLowerCase(),
        name: context.user.name || context.user.email,
        role: context.organization.role
      }
    });

    const key = createCommunityToolsAdminKey({
      organizationId: organization.id,
      userId: context.user.id
    });
    return NextResponse.redirect(
      appUrl(`/?key=${encodeURIComponent(key)}`),
      303
    );
  } catch (error) {
    console.error(
      "[community-tools-sso]",
      error instanceof Error ? error.message : "Onbekende SSO-fout"
    );
    return NextResponse.redirect(
      appUrl("/?error=community-tools"),
      303
    );
  }
}
