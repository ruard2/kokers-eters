"use client";

import { useState } from "react";
import type { OrgInfo } from "@/lib/org-by-slug";

export function ChurchSearch({ orgs }: { orgs: OrgInfo[] }) {
  const [query, setQuery] = useState("");
  const [confirmed, setConfirmed] = useState<OrgInfo | null>(null);

  const matches =
    query.trim().length >= 2
      ? orgs.filter((org) => {
          const q = query.trim().toLowerCase();
          return (
            org.name.toLowerCase().includes(q) ||
            org.slug.toLowerCase().includes(q)
          );
        })
      : [];

  if (confirmed) {
    return (
      <div className="church-confirmed">
        <p className="eyebrow">Gevonden</p>
        <h2 className="confirmed-name">{confirmed.name}</h2>
        <a className="button" href={`/${confirmed.slug}/aanmelden`}>
          Aanmelden bij {confirmed.name}
        </a>
        <p>
          <button className="link-btn" onClick={() => setConfirmed(null)}>
            Andere kerk zoeken
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="church-search">
      <label htmlFor="kerk-zoeken" className="search-label">
        Zoek je kerkgemeenschap
      </label>
      <input
        id="kerk-zoeken"
        className="search-input"
        type="search"
        placeholder="Typ de naam van je kerk…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
        autoFocus
      />
      {matches.length > 0 && (
        <ul className="church-results">
          {matches.map((org) => (
            <li key={org.slug}>
              <button
                className="church-result-btn"
                onClick={() => setConfirmed(org)}
              >
                <span className="result-name">{org.name}</span>
                <span className="result-hint">Is dit jouw kerk? →</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim().length >= 2 && matches.length === 0 && (
        <p className="no-results">
          Geen kerk gevonden voor &ldquo;{query.trim()}&rdquo;. Vraag je
          beheerder om de directe link.
        </p>
      )}
    </div>
  );
}
