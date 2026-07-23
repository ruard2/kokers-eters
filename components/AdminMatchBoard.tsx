"use client";

import { useState } from "react";

type BoardParticipant = {
  id: string;
  name: string;
  email: string;
  whatsapp: string;
  mode: string;
  hostCapacity: number | null;
  allergies: string | null;
  address: string | null;
  cookingPlan: string | null;
  communityScope: string;
  gatheringType: string;
};

export type BoardMatch = {
  id: string;
  roundId: string;
  status: string;
  partySize: number;
  host: BoardParticipant;
  eater: BoardParticipant;
};

type DragPayload = {
  matchId: string;
  side: "host" | "eater";
};

type AdminMatchBoardProps = {
  adminKey: string;
  disabled: boolean;
  initialMatches: BoardMatch[];
};

function modeLabel(value: string) {
  if (value === "EAT") return "Eten";
  if (value === "HOST") return "Koken";
  return "Allebei";
}

function scopeLabel(value: string) {
  if (value === "COMMUNITY_WIDE") return "Gemeentebreed";
  if (value === "GUESTS_AND_NEWCOMERS") return "Gasten/nieuwkomers";
  return "Allebei";
}

function gatheringLabel(value: string) {
  if (value === "MEAL") return "Maaltijd";
  if (value === "COFFEE_TEA") return "Koffie/thee";
  return "Allebei";
}

function sameDrag(a: DragPayload | null, b: DragPayload) {
  return Boolean(a && a.matchId === b.matchId && a.side === b.side);
}

function swapSide(matches: BoardMatch[], payload: DragPayload, targetMatchId: string) {
  const nextMatches = matches.map((match) => ({ ...match, host: { ...match.host }, eater: { ...match.eater } }));
  const source = nextMatches.find((item) => item.id === payload.matchId);
  const target = nextMatches.find((item) => item.id === targetMatchId);

  if (!source || !target || source.id === target.id) {
    return nextMatches;
  }

  if (payload.side === "host") {
    const sourceHost = source.host;
    source.host = target.host;
    target.host = sourceHost;
  } else {
    const sourceEater = source.eater;
    const sourcePartySize = source.partySize;
    source.eater = target.eater;
    source.partySize = target.partySize;
    target.eater = sourceEater;
    target.partySize = sourcePartySize;
  }

  return nextMatches;
}

function parseDragPayload(event: React.DragEvent) {
  try {
    const raw = event.dataTransfer.getData("application/json");
    const parsed = JSON.parse(raw) as Partial<DragPayload>;
    if ((parsed.side === "host" || parsed.side === "eater") && typeof parsed.matchId === "string") {
      return parsed as DragPayload;
    }
  } catch {
    return null;
  }

  return null;
}

function ParticipantTile({
  editable,
  match,
  onDragStart,
  onSelect,
  participant,
  selected,
  side
}: {
  editable: boolean;
  match: BoardMatch;
  onDragStart: (event: React.DragEvent, payload: DragPayload) => void;
  onSelect: (payload: DragPayload) => void;
  participant: BoardParticipant;
  selected: DragPayload | null;
  side: "host" | "eater";
}) {
  const payload = { matchId: match.id, side };
  const isHost = side === "host";
  const capacityProblem = isHost && participant.hostCapacity !== null && participant.hostCapacity < match.partySize;

  return (
    <button
      aria-label={`${isHost ? "Host" : "Eter"} ${participant.name}`}
      className={`match-tile ${isHost ? "host-tile" : "eater-tile"} ${sameDrag(selected, payload) ? "selected" : ""}`}
      disabled={!editable}
      draggable={editable}
      onClick={() => onSelect(payload)}
      onDragStart={(event) => onDragStart(event, payload)}
      title={editable ? "Versleep naar een andere verbinding" : "Niet aanpasbaar"}
      type="button"
    >
      <span className="tile-kicker">{isHost ? "Host" : "Eter"}</span>
      <strong>{participant.name}</strong>
      <span className="tile-meta">{modeLabel(participant.mode)}</span>
      {isHost ? (
        <>
          <span className={capacityProblem ? "tile-warning" : "tile-meta"}>
            Cap. {participant.hostCapacity ?? "-"} / groep {match.partySize}
          </span>
          <span className="tile-meta">{participant.address || "Geen adres"}</span>
          {participant.cookingPlan ? <span className="tile-note">{participant.cookingPlan}</span> : null}
        </>
      ) : (
        <>
          <span className="tile-meta">{match.partySize} persoon/personen</span>
          <span className="tile-meta">
            {scopeLabel(participant.communityScope)} · {gatheringLabel(participant.gatheringType)}
          </span>
          {participant.allergies ? <span className="tile-note">{participant.allergies}</span> : null}
        </>
      )}
    </button>
  );
}

export function AdminMatchBoard({ adminKey, disabled, initialMatches }: AdminMatchBoardProps) {
  const [matches, setMatches] = useState(initialMatches);
  const [selected, setSelected] = useState<DragPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function commitSwap(payload: DragPayload, targetMatchId: string) {
    if (disabled || busy || payload.matchId === targetMatchId) {
      setSelected(null);
      return;
    }

    const previousMatches = matches;
    setBusy(true);
    setError(null);
    setMessage(null);
    setSelected(null);
    setMatches((current) => swapSide(current, payload, targetMatchId));

    try {
      const response = await fetch("/api/admin/matches/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminKey,
          sourceMatchId: payload.matchId,
          targetMatchId,
          side: payload.side
        })
      });
      const data = (await response.json()) as { error?: string; matches?: BoardMatch[] };

      if (!response.ok || !data.matches) {
        throw new Error(data.error || "Wijziging niet opgeslagen.");
      }

      setMatches(data.matches);
      setMessage("Concept aangepast.");
    } catch (caught) {
      setMatches(previousMatches);
      setError(caught instanceof Error ? caught.message : "Wijziging niet opgeslagen.");
    } finally {
      setBusy(false);
    }
  }

  function handleSelect(payload: DragPayload) {
    if (disabled || busy) {
      return;
    }

    if (selected && selected.matchId !== payload.matchId) {
      void commitSwap(selected, payload.matchId);
      return;
    }

    setSelected((current) => (sameDrag(current, payload) ? null : payload));
  }

  function handleDragStart(event: React.DragEvent, payload: DragPayload) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/json", JSON.stringify(payload));
    setSelected(payload);
  }

  function handleDrop(event: React.DragEvent, targetMatchId: string) {
    event.preventDefault();
    const payload = parseDragPayload(event);
    if (payload) {
      void commitSwap(payload, targetMatchId);
    }
  }

  if (matches.length === 0) {
    return <div className="board-empty">Nog geen conceptverbindingen.</div>;
  }

  return (
    <div className={`match-board ${busy ? "busy" : ""}`}>
      {message ? <div className="notice success board-notice">{message}</div> : null}
      {error ? <div className="notice error board-notice">{error}</div> : null}
      {matches.map((match, index) => {
        const editable = !disabled && match.status === "DRAFT";
        return (
          <div
            className={`match-row ${editable ? "editable" : "locked"}`}
            key={match.id}
            onDragOver={(event) => {
              if (editable) {
                event.preventDefault();
              }
            }}
            onDrop={(event) => handleDrop(event, match.id)}
          >
            <span className="match-index">{index + 1}</span>
            <ParticipantTile
              editable={editable}
              match={match}
              onDragStart={handleDragStart}
              onSelect={handleSelect}
              participant={match.host}
              selected={selected}
              side="host"
            />
            <div aria-hidden="true" className="connection-track">
              <span className="connection-line" />
              <span className="connection-badge">{match.partySize}</span>
            </div>
            <ParticipantTile
              editable={editable}
              match={match}
              onDragStart={handleDragStart}
              onSelect={handleSelect}
              participant={match.eater}
              selected={selected}
              side="eater"
            />
          </div>
        );
      })}
    </div>
  );
}
