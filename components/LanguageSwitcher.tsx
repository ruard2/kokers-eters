"use client";

const LANGS = [
  { code: "nl", flag: "🇳🇱", label: "NL" },
  { code: "en", flag: "🇬🇧", label: "EN" },
  { code: "af", flag: "🇿🇦", label: "AF" }
] as const;

export function LanguageSwitcher({ current }: { current: string }) {
  return (
    <div className="lang-switcher" aria-label="Language / Taal / Taal">
      {LANGS.map(({ code, flag, label }) => (
        <a
          key={code}
          href={`/api/locale?lang=${code}`}
          className={`lang-btn ${current === code ? "active" : ""}`}
          aria-label={label}
          aria-current={current === code ? "true" : undefined}
        >
          <span aria-hidden="true">{flag}</span>
          <span className="lang-label">{label}</span>
        </a>
      ))}
    </div>
  );
}
