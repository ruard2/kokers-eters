import { NextRequest, NextResponse } from "next/server";
import { runDueJobsForAllOrganizations } from "@/lib/automation";

export const runtime = "nodejs";

async function handle(request: NextRequest) {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const querySecret = request.nextUrl.searchParams.get("secret");
  const providedSecret = bearer || querySecret;

  if (!process.env.CRON_SECRET || providedSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runDueJobsForAllOrganizations();
  return NextResponse.json(result);
}

export const GET = handle;
export const POST = handle;
