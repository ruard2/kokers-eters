"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

const DAY_KEYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
type DayKey = (typeof DAY_KEYS)[number];

const DUTCH_NAMES: Record<DayKey, string> = {
  Mon: "Maandag",
  Tue: "Dinsdag",
  Wed: "Woensdag",
  Thu: "Donderdag",
  Fri: "Vrijdag",
  Sat: "Zaterdag",
  Sun: "Zondag"
};

function initialUnavailableDays(value: string): Set<DayKey> {
  const normalized = value.toLowerCase();
  if (!normalized || normalized.includes("geen") || normalized.includes("none")) {
    return new Set();
  }
  const result = new Set<DayKey>();
  for (const key of DAY_KEYS) {
    if (normalized.includes(DUTCH_NAMES[key].toLowerCase())) {
      result.add(key);
    }
  }
  return result;
}

type UnavailableDaysFieldProps = {
  name: string;
  defaultValue?: string;
};

export function UnavailableDaysField({ name, defaultValue = "" }: UnavailableDaysFieldProps) {
  const t = useTranslations("days");
  const initialDays = useMemo(() => initialUnavailableDays(defaultValue), [defaultValue]);
  const [unavailableDays, setUnavailableDays] = useState<Set<DayKey>>(initialDays);

  // Store canonical Dutch names for database compatibility
  const value = DAY_KEYS.filter((key) => unavailableDays.has(key))
    .map((key) => DUTCH_NAMES[key])
    .join(", ");

  function toggleDay(key: DayKey) {
    setUnavailableDays((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <div className="day-picker">
      <input name={name} type="hidden" value={value} />
      <p>{t("hint")}</p>
      <div className="day-grid">
        {DAY_KEYS.map((key) => {
          const unavailable = unavailableDays.has(key);
          return (
            <button
              aria-pressed={!unavailable}
              className={`day-button ${unavailable ? "unavailable" : "available"}`}
              key={key}
              onClick={() => toggleDay(key)}
              type="button"
            >
              <span>{t(key)}</span>
              <small>{unavailable ? t("cannotLabel") : t("canLabel")}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}
