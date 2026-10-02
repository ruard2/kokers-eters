"use client";

import { useState } from "react";
import type { OrgInfo } from "@/lib/org-by-slug";

type Props = {
  orgs: OrgInfo[];
  label: string;
  placeholder: string;
  confirmText: string;
  foundEyebrow: string;
  otherChurch: string;
  notFoundPrefix: string;
  signupButtonPrefix: string;
};

export function ChurchSearch({
  orgs,
  label,
  placeholder,
  confirmText,
  foundEyebrow,
  otherChurch,
  notFoundPrefix,
  signupButtonPrefix
}: Props) {
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

  const signupLabel = (name: string) =>
    signupButtonPrefix.replace("{name}", name);
  const notFoundMsg = (q: string) => notFoundPrefix.replace("{query}", q);

  if (confirmed) {
    return (
      <div className="church-confirmed">
        <p className="eyebrow">{foundEyebrow}</p>
        <h2 className="confirmed-name">{confirmed.name}</h2>
        <a className="button" href={`/${confirmed.slug}/aanmelden`}>
          {signupLabel(confirmed.name)}
        </a>
        <p>
          <button className="link-btn" onClick={() => setConfirmed(null)}>
            {otherChurch}
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="church-search">
      <label htmlFor="kerk-zoeken" className="search-label">
        {label}
      </label>
      <input
        id="kerk-zoeken"
        className="search-input"
        type="search"
        placeholder={placeholder}
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
                <span className="result-hint">{confirmText}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim().length >= 2 && matches.length === 0 && (
        <p className="no-results">{notFoundMsg(query.trim())}</p>
      )}
    </div>
  );
}
