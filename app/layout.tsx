import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Eters & Kokers",
  description: "Een simpele maaltijd-randomizer voor de kerkgemeenschap."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body>
        <header className="topbar">
          <a href="/" className="brand" aria-label="Eters & Kokers">
            Eters & Kokers
          </a>
          <a href="/aanmelden" className="admin-link">
            Aanmeldpagina
          </a>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
