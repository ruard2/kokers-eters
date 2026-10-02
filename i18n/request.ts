import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

const SUPPORTED = ["nl", "en", "af"] as const;
type Locale = (typeof SUPPORTED)[number];

function detectLocale(accept: string): Locale {
  const parts = accept
    .split(",")
    .map((s) => s.split(";")[0].trim().toLowerCase().slice(0, 2));
  for (const part of parts) {
    if (SUPPORTED.includes(part as Locale)) return part as Locale;
  }
  return "nl";
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const headersList = await headers();

  const saved = cookieStore.get("locale")?.value;
  const locale: Locale =
    saved && SUPPORTED.includes(saved as Locale)
      ? (saved as Locale)
      : detectLocale(headersList.get("accept-language") ?? "");

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default
  };
});
