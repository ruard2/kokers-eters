import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Houvast Maaltijden",
  description: "Een simpele maaltijd-randomizer voor de kerkgemeenschap."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body>
        <header className="topbar">
          <a href="/" className="brand" aria-label="Houvast Maaltijden">
            Houvast Maaltijden
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
