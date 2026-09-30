import type { Metadata } from "next";
import "./globals.css";

const orgName = process.env.APP_ORGANIZATION_NAME || "";
const pageTitle = orgName ? `Eters & Kokers — ${orgName}` : "Eters & Kokers";

export const metadata: Metadata = {
  title: pageTitle,
  description: "Een simpele maaltijd-randomizer voor de kerkgemeenschap.",
  icons: {
    icon: "/favicon.svg"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body>
        <header className="topbar">
          <a href="/" className="brand" aria-label="Eters & Kokers">
            Eters &amp; Kokers
            {orgName ? <span className="brand-org"> — {orgName}</span> : null}
          </a>
          <a href="/aanmelden" className="admin-link">
            Aanmelden
          </a>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
