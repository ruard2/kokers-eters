"use client";

import { useState, useEffect, useRef } from "react";
import {
  Frequency,
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
  if (!balance) {
    return null;
  }

  return (
    <div className={`balance-nudge ${balance.tone}`}>
      <p>{balance.description}</p>
      <div className="balance-mini" aria-label="Balans tussen eten en koken">
        <span className="eater-bar" style={{ width: `${balance.eaterPercent}%` }} />
        <span className="host-bar" style={{ width: `${balance.hostPercent}%` }} />
      </div>
      <div className="balance-mini-labels">
        <span>Eten: {balance.eaterNeed}</span>
        <span>Koken: {balance.hostSupply}</span>
      </div>
    </div>
  );
}

function GuestTooltip({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="guest-tooltip" role="tooltip" aria-live="polite">
      <p>
        <strong>Wat is een gast?</strong><br />
        Een gast is iemand van buiten de gemeente — een vriend, familielid of kennis die je wilt
        meenemen of ontvangen. Het programma houdt bij wie gemeentelid is en wie gast, zodat bewust
        gekozen kan worden bij wie gasten terechtkomen.
      </p>
      <button
        type="button"
        className="small secondary"
        onClick={onDismiss}
        aria-label="Sluit uitleg over gast"
      >
        Begrepen
      </button>
    </div>
  );
}

export function ParticipantFormFields({ balance, participant, showActive = false }: Props) {
  const initialMode = participant?.mode ?? ParticipationMode.BOTH;
  const [mode, setMode] = useState<ParticipationMode>(initialMode);
  const [guestChecked, setGuestChecked] = useState(participant?.isGuest ?? false);
  const [showGuestTooltip, setShowGuestTooltip] = useState(false);
  const guestCheckRef = useRef<HTMLInputElement>(null);

  const wantsEat = mode === ParticipationMode.EAT || mode === ParticipationMode.BOTH;
  const wantsHost = mode === ParticipationMode.HOST || mode === ParticipationMode.BOTH;

  // Show tooltip once per session when the user first checks "gast"
  function handleGuestChange(checked: boolean) {
    setGuestChecked(checked);
    if (checked) {
      try {
        const seen = localStorage.getItem("guest-tooltip-seen");
        if (!seen) {
          setShowGuestTooltip(true);
        }
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

  const gatheringType = participant?.gatheringType ?? GatheringType.BOTH;

  return (
    <>
      {showActive ? (
        <label className="check-row wide">
          <input name="active" type="checkbox" defaultChecked={participant?.active ?? true} />
          <span>Ik doe mee met komende rondes</span>
        </label>
      ) : null}

      {/* ── Stap 1: Wat wil je doen? ── */}
      <section className="form-section wide">
        <h2>Wat wil je doen?</h2>
        <div className="choice-grid">
          <label>
            <input
              name="mode"
              type="radio"
              value={ParticipationMode.EAT}
              checked={mode === ParticipationMode.EAT}
              onChange={() => setMode(ParticipationMode.EAT)}
            />
            <span>Bij iemand eten</span>
          </label>
          <label>
            <input
              name="mode"
              type="radio"
              value={ParticipationMode.HOST}
              checked={mode === ParticipationMode.HOST}
              onChange={() => setMode(ParticipationMode.HOST)}
            />
            <span>Eters ontvangen</span>
          </label>
          <label>
            <input
              name="mode"
              type="radio"
              value={ParticipationMode.BOTH}
              checked={mode === ParticipationMode.BOTH}
              onChange={() => setMode(ParticipationMode.BOTH)}
            />
            <span>Allebei</span>
          </label>
        </div>
        <SignupBalanceNudge balance={balance} />
      </section>

      {/* ── Stap 2: Contact ── */}
      <section className="form-section wide">
        <h2>Contact</h2>
        <div className="field-grid">
          <label>
            Naam
            <input name="name" required defaultValue={value(participant, "name")} />
          </label>
          <label>
            E-mail
            <input name="email" type="email" required defaultValue={value(participant, "email")} />
          </label>
          <label>
            WhatsAppnummer
            <input name="whatsapp" required defaultValue={value(participant, "whatsapp")} />
          </label>
        </div>

        <div className="guest-field">
          <label className="check-row">
            <input
              ref={guestCheckRef}
              name="isGuest"
              type="checkbox"
              checked={guestChecked}
              onChange={(e) => handleGuestChange(e.target.checked)}
            />
            <span>Ik ben een gast (niet uit de gemeente)</span>
          </label>
          {showGuestTooltip ? <GuestTooltip onDismiss={dismissGuestTooltip} /> : null}
        </div>
      </section>

      {/* ── Stap 3: Vorm — alleen tonen als je eet of ontvangt (niet alleen HOST-koffie heeft geen zin te vragen) ── */}
      <section className="form-section wide">
        <h2>Vorm</h2>
        <div className="choice-grid">
          <label>
            <input
              name="gatheringType"
              type="radio"
              value={GatheringType.MEAL}
              defaultChecked={gatheringType === GatheringType.MEAL}
            />
            <span>Maaltijd</span>
          </label>
          <label>
            <input
              name="gatheringType"
              type="radio"
              value={GatheringType.COFFEE_TEA}
              defaultChecked={gatheringType === GatheringType.COFFEE_TEA}
            />
            <span>Koffie/thee met iets erbij</span>
          </label>
          <label>
            <input
              name="gatheringType"
              type="radio"
              value={GatheringType.BOTH}
              defaultChecked={gatheringType === GatheringType.BOTH}
            />
            <span>Allebei</span>
          </label>
        </div>
      </section>

      {/* ── Als je komt eten — alleen bij EAT of BOTH ── */}
      {wantsEat ? (
        <section className="form-section">
          <h2>Als je komt eten</h2>
          <label>
            Met hoeveel personen kom je?
            <input name="comingWithCount" type="number" min="1" defaultValue={value(participant, "comingWithCount", "1")} />
          </label>
          <label>
            Hoe vaak wil je bij een ander eten?
            <select name="eaterFrequency" defaultValue={participant?.eaterFrequency || Frequency.MONTHLY}>
              <option value={Frequency.BIWEEKLY}>Eens per twee weken</option>
              <option value={Frequency.MONTHLY}>Eens per maand</option>
              <option value={Frequency.QUARTERLY}>Eens per kwartaal</option>
            </select>
          </label>
          <label>
            Allergieen of dieetwensen
            <textarea name="allergies" rows={4} defaultValue={value(participant, "allergies")} />
          </label>
          <div className="day-field">
            <span className="label">Dagen waarop je niet kunt eten</span>
            <UnavailableDaysField name="cannotEatDays" defaultValue={value(participant, "cannotEatDays")} />
          </div>
        </section>
      ) : null}

      {/* ── Als je ontvangt — alleen bij HOST of BOTH ── */}
      {wantsHost ? (
        <section className="form-section">
          <h2>Als je ontvangt</h2>
          <label>
            Hoeveel eters kun je ontvangen?
            <input name="hostCapacity" type="number" min="1" defaultValue={value(participant, "hostCapacity", "2")} />
          </label>
          <label>
            Hoe vaak wil je ontvangen?
            <select name="hostFrequency" defaultValue={participant?.hostFrequency || Frequency.MONTHLY}>
              <option value={Frequency.BIWEEKLY}>Eens per twee weken</option>
              <option value={Frequency.MONTHLY}>Eens per maand</option>
              <option value={Frequency.QUARTERLY}>Eens per kwartaal</option>
            </select>
          </label>
          <label>
            Adres
            <textarea name="address" rows={3} defaultValue={value(participant, "address")} />
          </label>
          <div className="day-field">
            <span className="label">Dagen waarop je niet kunt ontvangen</span>
            <UnavailableDaysField name="cannotHostDays" defaultValue={value(participant, "cannotHostDays")} />
          </div>
        </section>
      ) : null}
    </>
  );
}
