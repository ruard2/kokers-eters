import { NextRequest, NextResponse } from "next/server";

const SUPPORTED = ["nl", "en", "af"];

export function GET(request: NextRequest) {
  const lang = request.nextUrl.searchParams.get("lang") ?? "nl";
  const locale = SUPPORTED.includes(lang) ? lang : "nl";
  const referer = request.headers.get("referer") ?? "/";
  const response = NextResponse.redirect(referer);
  response.cookies.set("locale", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax"
  });
  return response;
}
