import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Eters & Kokers",
  description: "Een simpele maaltijd-app voor de kerkgemeenschap.",
  icons: {
    icon: "/favicon.svg"
  }
};

const orgSlug = process.env.APP_ORG_SLUG;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const aanmeldenHref = orgSlug ? `/${orgSlug}/aanmelden` : "/";
  return (
    <html lang="nl">
      <body>
        <header className="topbar">
          <a href="/" className="brand" aria-label="Eters & Kokers">
            Eters &amp; Kokers
          </a>
          <a href={aanmeldenHref} className="admin-link">
            Aanmelden
          </a>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
