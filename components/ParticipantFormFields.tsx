"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  GatheringType,
  ParticipationMode,
  type Participant
} from "@prisma/client";
import type { SignupBalance } from "@/lib/signup-balance";
import { UnavailableDaysField } from "./UnavailableDaysField";

type Props = {
  balance?: SignupBalance | null;
  participant?: Participant;
  showActive?: boolean;
};

function value(participant: Participant | undefined, key: keyof Participant, fallback = "") {
  const item = participant?.[key];
  return typeof item === "string" || typeof item === "number" ? String(item) : fallback;
}

function SignupBalanceNudge({ balance }: { balance?: SignupBalance | null }) {
  const t = useTranslations("form");
  if (!balance) return null;

  return (
    <div className={`balance-nudge ${balance.tone}`}>
      <p>{balance.description}</p>
      <div className="balance-mini" aria-label={t("balanceAria")}>
        <span className="eater-bar" style={{ width: `${balance.eaterPercent}%` }} />
        <span className="host-bar" style={{ width: `${balance.hostPercent}%` }} />
      </div>
      <div className="balance-mini-labels">
        <span>{t("balanceEat", { n: balance.eaterNeed })}</span>
        <span>{t("balanceHost", { n: balance.hostSupply })}</span>
      </div>
    </div>
  );
}

function GuestTooltip({ onDismiss }: { onDismiss: () => void }) {
  const t = useTranslations("form");
  return (
    <div className="guest-tooltip" role="tooltip" aria-live="polite">
      <p>
        <strong>{t("guestTooltipTitle")}</strong><br />
        {t("guestTooltipBody")}
      </p>
      <button
        type="button"
        className="small secondary"
        onClick={onDismiss}
        aria-label={t("guestTooltipDismiss")}
      >
        {t("guestTooltipDismiss")}
      </button>
    </div>
  );
}

export function ParticipantFormFields({ balance, participant, showActive = false }: Props) {
  const t = useTranslations("form");
  const initialMode = participant?.mode ?? ParticipationMode.BOTH;
  const [mode, setMode] = useState<ParticipationMode>(initialMode);
  const [guestChecked, setGuestChecked] = useState(participant?.isGuest ?? false);
  const [showGuestTooltip, setShowGuestTooltip] = useState(false);

  const wantsEat = mode === ParticipationMode.EAT || mode === ParticipationMode.BOTH;
  const wantsHost = mode === ParticipationMode.HOST || mode === ParticipationMode.BOTH;

  function handleGuestChange(checked: boolean) {
    setGuestChecked(checked);
    if (checked) {
      try {
        const seen = localStorage.getItem("guest-tooltip-seen");
        if (!seen) setShowGuestTooltip(true);
      } catch {
        setShowGuestTooltip(true);
      }
    } else {
      setShowGuestTooltip(false);
    }
  }

  function dismissGuestTooltip() {
    setShowGuestTooltip(false);
    try {
      localStorage.setItem("guest-tooltip-seen", "1");
    } catch {
      // ignore
    }
  }

  return (
    <>
      {showActive ? (
        <label className="check-row wide">
          <input name="active" type="checkbox" defaultChecked={participant?.active ?? true} />
          <span>{t("activeLabel")}</span>
        </label>
      ) : null}

      <section className="form-section wide">
        <h2>{t("whatSection")}</h2>
        <div className="choice-grid">
          <label>
            <input
              name="mode"
              type="radio"
              value={ParticipationMode.EAT}
              checked={mode === ParticipationMode.EAT}
              onChange={() => setMode(ParticipationMode.EAT)}
            />
            <span>{t("modeEat")}</span>
          </label>
          <label>
            <input
              name="mode"
              type="radio"
              value={ParticipationMode.HOST}
              checked={mode === ParticipationMode.HOST}
              onChange={() => setMode(ParticipationMode.HOST)}
            />
            <span>{t("modeHost")}</span>
          </label>
          <label>
            <input
              name="mode"
              type="radio"
              value={ParticipationMode.BOTH}
              checked={mode === ParticipationMode.BOTH}
              onChange={() => setMode(ParticipationMode.BOTH)}
            />
            <span>{t("modeBoth")}</span>
          </label>
        </div>
        <SignupBalanceNudge balance={balance} />
      </section>

      <section className="form-section wide">
        <h2>{t("contactSection")}</h2>
        <div className="field-grid">
          <label>
            {t("name")}
            <input name="name" required defaultValue={value(participant, "name")} />
          </label>
          <label>
            {t("email")}
            <input name="email" type="email" required defaultValue={value(participant, "email")} />
          </label>
          <label>
            {t("whatsapp")}
            <input name="whatsapp" required defaultValue={value(participant, "whatsapp")} />
          </label>
        </div>

        <div className="guest-field">
          <label className="check-row">
            <input
              name="isGuest"
              type="checkbox"
              checked={guestChecked}
              onChange={(e) => handleGuestChange(e.target.checked)}
            />
            <span>{t("isGuest")}</span>
          </label>
          {showGuestTooltip ? <GuestTooltip onDismiss={dismissGuestTooltip} /> : null}
        </div>
      </section>

      <input type="hidden" name="gatheringType" value={GatheringType.MEAL} />

      {wantsEat ? (
        <section className="form-section">
          <h2>{t("eatSection")}</h2>
          <label>
            {t("comingWithCount")}
            <input name="comingWithCount" type="number" min="1" defaultValue={value(participant, "comingWithCount", "1")} />
          </label>
          <label>
            {t("allergies")}
            <textarea name="allergies" rows={4} defaultValue={value(participant, "allergies")} />
          </label>
          <div className="day-field">
            <span className="label">{t("cannotEatDays")}</span>
            <UnavailableDaysField name="cannotEatDays" defaultValue={value(participant, "cannotEatDays")} />
          </div>
        </section>
      ) : null}

      {wantsHost ? (
        <section className="form-section">
          <h2>{t("hostSection")}</h2>
          <label>
            {t("hostCapacity")}
            <input name="hostCapacity" type="number" min="1" defaultValue={value(participant, "hostCapacity", "2")} />
          </label>
          <label>
            {t("address")}
            <textarea name="address" rows={3} defaultValue={value(participant, "address")} />
          </label>
          <div className="day-field">
            <span className="label">{t("cannotHostDays")}</span>
            <UnavailableDaysField name="cannotHostDays" defaultValue={value(participant, "cannotHostDays")} />
          </div>
        </section>
      ) : null}
    </>
  );
}
