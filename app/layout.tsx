import type { Metadata } from "next";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import "./globals.css";

export const metadata: Metadata = {
  title: "Eters & Kokers",
  description: "Een simpele maaltijd-app voor de kerkgemeenschap.",
  icons: { icon: "/favicon.svg" }
};

const orgSlug = process.env.APP_ORG_SLUG;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const t = await getTranslations("nav");

  const aanmeldenHref = orgSlug ? `/${orgSlug}/aanmelden` : "/";

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <header className="topbar">
            <a href="/" className="brand" aria-label={t("brand")}>
              {t("brand")}
            </a>
            <div className="topbar-right">
              <LanguageSwitcher current={locale} />
              <a href={aanmeldenHref} className="admin-link">
                {t("signup")}
              </a>
            </div>
          </header>
          <main>{children}</main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
