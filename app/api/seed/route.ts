import { NextRequest, NextResponse } from "next/server";
import { seedDemoData } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: NextRequest) {
  // Dubbele beveiliging: de endpoint moet expliciet aangezet zijn én het secret moet kloppen.
  if (process.env.ALLOW_DEMO_SEED !== "true") {
    return NextResponse.json(
      { error: "seed disabled", hint: "Zet ALLOW_DEMO_SEED=true op de Railway-service om te kunnen seeden." },
      { status: 403 }
    );
  }

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const querySecret = request.nextUrl.searchParams.get("secret");
  const providedSecret = bearer || querySecret;

  if (!process.env.CRON_SECRET || providedSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await seedDemoData();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: "seed failed", message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;
