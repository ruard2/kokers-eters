"use client";

import { useMemo, useState } from "react";

const days = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"];

function initialUnavailableDays(value: string) {
  const normalized = value.toLowerCase();
  if (!normalized || normalized.includes("geen")) {
    return [];
  }

  return days.filter((day) => normalized.includes(day.toLowerCase()));
}

type UnavailableDaysFieldProps = {
  name: string;
  defaultValue?: string;
};

export function UnavailableDaysField({ name, defaultValue = "" }: UnavailableDaysFieldProps) {
  const initialDays = useMemo(() => initialUnavailableDays(defaultValue), [defaultValue]);
  const [unavailableDays, setUnavailableDays] = useState(() => new Set(initialDays));
  const value = days.filter((day) => unavailableDays.has(day)).join(", ");

  function toggleDay(day: string) {
    setUnavailableDays((current) => {
      const next = new Set(current);
      if (next.has(day)) {
        next.delete(day);
      } else {
        next.add(day);
      }

      return next;
    });
  }

  return (
    <div className="day-picker">
      <input name={name} type="hidden" value={value} />
      <p>Standaard zijn alle dagen geselecteerd. Klik op dagen waarop je niet kunt.</p>
      <div className="day-grid">
        {days.map((day) => {
          const unavailable = unavailableDays.has(day);
          return (
            <button
              aria-pressed={!unavailable}
              className={`day-button ${unavailable ? "unavailable" : "available"}`}
              key={day}
              onClick={() => toggleDay(day)}
              type="button"
            >
              <span>{day}</span>
              <small>{unavailable ? "Kan niet" : "Kan wel"}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}
