"use client";

import { useMemo, useState } from "react";

type BoardParticipant = {
  id: string;
  name: string;
  email: string;
  whatsapp: string;
  mode: string;
  hostCapacity: number | null;
  allergies: string | null;
  address: string | null;
  cannotEatDays: string | null;
  cannotHostDays: string | null;
  adminNoMatch: string | null;
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

export type BoardRosterParticipant = {
  id: string;
  name: string;
  email: string;
  adminNoMatch: string | null;
};

type DragPayload = {
  matchId: string;
  side: "host" | "eater";
};

type MoveValidation = {
  ok: boolean;
  reason: string;
};

type AdminMatchBoardProps = {
  adminKey: string;
  disabled: boolean;
  initialMatches: BoardMatch[];
  participants: BoardRosterParticipant[];
};

const manyMatchesLimit = 14;

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

function compatibleChoice(hostValue: string, eaterValue: string) {
  return hostValue === "BOTH" || eaterValue === "BOTH" || hostValue === eaterValue;
}

function pairKey(hostId: string, eaterId: string) {
  return `${hostId}:${eaterId}`;
}

function noMatchTokens(value: string | null) {
  if (!value) {
    return [];
  }

  return value
    .split(/[\n,;]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function buildAdminNoMatchMap(participants: BoardRosterParticipant[]) {
  const byEmail = new Map(participants.map((participant) => [participant.email.toLowerCase(), participant.id]));
  const byName = new Map(participants.map((participant) => [participant.name.toLowerCase(), participant.id]));
  const byId = new Map(participants.map((participant) => [participant.id, participant.id]));
  const blocked = new Map<string, Set<string>>();

  for (const participant of participants) {
    const blockedIds = new Set<string>();

    for (const rawToken of noMatchTokens(participant.adminNoMatch)) {
      const normalizedToken = rawToken.toLowerCase().replace(/^#/, "");
      const rowNumber = Number.parseInt(normalizedToken, 10);

      if (/^\d+$/.test(normalizedToken) && participants[rowNumber - 1]) {
        blockedIds.add(participants[rowNumber - 1].id);
        continue;
      }

      const matchedId =
        byEmail.get(rawToken.toLowerCase()) || byName.get(rawToken.toLowerCase()) || byId.get(rawToken) || null;
      if (matchedId) {
        blockedIds.add(matchedId);
      }
    }

    blockedIds.delete(participant.id);
    if (blockedIds.size > 0) {
      blocked.set(participant.id, blockedIds);
    }
  }

  return blocked;
}

function adminBlocksMatch(host: BoardParticipant, eater: BoardParticipant, blocked: Map<string, Set<string>>) {
  return Boolean(blocked.get(host.id)?.has(eater.id) || blocked.get(eater.id)?.has(host.id));
}

function cloneMatches(matches: BoardMatch[]) {
  return matches.map((match) => ({ ...match, host: { ...match.host }, eater: { ...match.eater } }));
}

function swapSide(matches: BoardMatch[], payload: DragPayload, targetMatchId: string) {
  const nextMatches = cloneMatches(matches);
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

function validateConnection(match: BoardMatch, adminNoMatch: Map<string, Set<string>>): string | null {
  if (match.host.id === match.eater.id) {
    return `${match.host.name} kan niet aan zichzelf gekoppeld worden.`;
  }

  if (!match.host.hostCapacity || match.host.hostCapacity < match.partySize) {
    return `${match.host.name} heeft ${match.host.hostCapacity || 0} plekken, groep is ${match.partySize}.`;
  }

  if (!compatibleChoice(match.host.communityScope, match.eater.communityScope)) {
    return `${match.host.name} en ${match.eater.name} hebben een andere kring-keuze.`;
  }

  if (!compatibleChoice(match.host.gatheringType, match.eater.gatheringType)) {
    return `${match.host.name} en ${match.eater.name} hebben een andere vorm-keuze.`;
  }

  if (adminBlocksMatch(match.host, match.eater, adminNoMatch)) {
    return `${match.host.name} en ${match.eater.name} mogen niet samen gematcht worden.`;
  }

  return null;
}

function validatePairUniqueness(matches: BoardMatch[]) {
  const pairs = new Set<string>();

  for (const match of matches) {
    if (match.status === "CANCELLED") {
      continue;
    }

    const key = pairKey(match.host.id, match.eater.id);
    if (pairs.has(key)) {
      return `Dubbele verbinding: ${match.host.name} met ${match.eater.name}.`;
    }
    pairs.add(key);

  }

  return null;
}

function validateHostTotals(matches: BoardMatch[], hostIds: Set<string>) {
  const totals = new Map<string, number>();

  for (const match of matches) {
    if (match.status !== "CANCELLED" && hostIds.has(match.host.id)) {
      totals.set(match.host.id, (totals.get(match.host.id) || 0) + match.partySize);
    }
  }

  for (const [hostId, total] of totals) {
    const host = matches.find((match) => match.host.id === hostId)?.host;
    if (host && (!host.hostCapacity || total > host.hostCapacity)) {
      return `${host.name} heeft ${host.hostCapacity || 0} plekken, maar krijgt zo ${total} personen.`;
    }
  }

  return null;
}

function validateMove(
  matches: BoardMatch[],
  payload: DragPayload,
  targetMatchId: string,
  adminNoMatch: Map<string, Set<string>>
): MoveValidation {
  const source = matches.find((match) => match.id === payload.matchId);
  const target = matches.find((match) => match.id === targetMatchId);

  if (!source || !target) {
    return { ok: false, reason: "Verbinding niet gevonden." };
  }

  if (source.id === target.id) {
    return { ok: false, reason: "Huidige verbinding." };
  }

  if (source.status !== "DRAFT" || target.status !== "DRAFT") {
    return { ok: false, reason: "Alleen conceptverbindingen zijn aanpasbaar." };
  }

  const nextMatches = swapSide(matches, payload, targetMatchId);
  const nextSource = nextMatches.find((match) => match.id === source.id);
  const nextTarget = nextMatches.find((match) => match.id === target.id);

  if (!nextSource || !nextTarget) {
    return { ok: false, reason: "Verbinding niet gevonden." };
  }

  const sourceError = validateConnection(nextSource, adminNoMatch);
  if (sourceError) {
    return { ok: false, reason: sourceError };
  }

  const targetError = validateConnection(nextTarget, adminNoMatch);
  if (targetError) {
    return { ok: false, reason: targetError };
  }

  const pairError = validatePairUniqueness(nextMatches);
  if (pairError) {
    return { ok: false, reason: pairError };
  }

  const affectedHosts = new Set([nextSource.host.id, nextTarget.host.id]);
  const error = validateHostTotals(nextMatches, affectedHosts);
  if (error) {
    return { ok: false, reason: error };
  }

  return { ok: true, reason: "Past." };
}

function validationFor(
  matches: BoardMatch[],
  payload: DragPayload | null,
  targetMatchId: string,
  adminNoMatch: Map<string, Set<string>>
) {
  return payload ? validateMove(matches, payload, targetMatchId, adminNoMatch) : null;
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
  onDragEnd,
  onDragStart,
  onSelect,
  participant,
  selected,
  side,
  simple
}: {
  editable: boolean;
  match: BoardMatch;
  onDragEnd: () => void;
  onDragStart: (event: React.DragEvent, payload: DragPayload) => void;
  onSelect: (payload: DragPayload) => void;
  participant: BoardParticipant;
  selected: DragPayload | null;
  side: "host" | "eater";
  simple: boolean;
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
      onDragEnd={onDragEnd}
      onDragStart={(event) => onDragStart(event, payload)}
      title={editable ? "Versleep naar een andere verbinding" : "Niet aanpasbaar"}
      type="button"
    >
      <span className="tile-kicker">{isHost ? "Host" : "Eter"}</span>
      <strong>{participant.name}</strong>
      {!simple ? <span className="tile-meta">{modeLabel(participant.mode)}</span> : null}
      {isHost ? (
        <>
          <span className={capacityProblem ? "tile-warning" : "tile-meta"}>
            Cap. {participant.hostCapacity ?? "-"} / groep {match.partySize}
          </span>
          {!simple && participant.cannotHostDays ? <span className="tile-extra">{participant.cannotHostDays}</span> : null}
        </>
      ) : (
        <>
          <span className="tile-meta">{match.partySize} persoon/personen</span>
          {!simple ? (
            <span className="tile-meta">
              {scopeLabel(participant.communityScope)} - {gatheringLabel(participant.gatheringType)}
            </span>
          ) : null}
          {!simple && participant.allergies ? <span className="tile-extra">{participant.allergies}</span> : null}
        </>
      )}
    </button>
  );
}

export function AdminMatchBoard({ adminKey, disabled, initialMatches, participants }: AdminMatchBoardProps) {
  const [matches, setMatches] = useState(initialMatches);
  const [selected, setSelected] = useState<DragPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const adminNoMatch = useMemo(() => buildAdminNoMatchMap(participants), [participants]);

  const validations = useMemo(() => {
    const result = new Map<string, MoveValidation>();
    for (const match of matches) {
      result.set(match.id, validationFor(matches, selected, match.id, adminNoMatch) || { ok: false, reason: "" });
    }
    return result;
  }, [adminNoMatch, matches, selected]);

  const viableCount = useMemo(
    () => (selected ? matches.filter((match) => validations.get(match.id)?.ok).length : 0),
    [matches, selected, validations]
  );

  async function commitSwap(payload: DragPayload, targetMatchId: string) {
    const validation = validateMove(matches, payload, targetMatchId, adminNoMatch);
    if (disabled || busy || !validation.ok) {
      setError(validation.reason);
      if (payload.matchId === targetMatchId) {
        setSelected(null);
      }
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

    setError(null);
    setMessage(null);
    setSelected((current) => (sameDrag(current, payload) ? null : payload));
  }

  function handleDragStart(event: React.DragEvent, payload: DragPayload) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/json", JSON.stringify(payload));
    setError(null);
    setMessage(null);
    setSelected(payload);
  }

  function handleDrop(event: React.DragEvent, targetMatchId: string) {
    event.preventDefault();
    const payload = parseDragPayload(event);
    if (payload) {
      void commitSwap(payload, targetMatchId);
    }
  }

  function renderBoard(fullscreen: boolean) {
    const showOnlyViable = Boolean(selected && matches.length > manyMatchesLimit);
    const visibleMatches = showOnlyViable
      ? matches.filter((match) => match.id === selected?.matchId || validations.get(match.id)?.ok)
      : matches;
    const hiddenCount = matches.length - visibleMatches.length;

    if (matches.length === 0) {
      return <div className="board-empty">Nog geen conceptverbindingen.</div>;
    }

    return (
      <div className={`match-board-shell ${fullscreen ? "fullscreen" : ""}`}>
        <div className="board-toolbar">
          <div className="board-summary">
            <strong>{matches.length} verbindingen</strong>
            {selected ? <span>{viableCount} mogelijke ruilen</span> : <span>Conceptbord</span>}
          </div>
          <div className="board-actions">
            {selected ? (
              <button className="small secondary" onClick={() => setSelected(null)} type="button">
                Selectie wissen
              </button>
            ) : null}
            <button className="small secondary" onClick={() => setExpanded(!fullscreen)} type="button">
              {fullscreen ? "Sluiten" : "Groot bord"}
            </button>
          </div>
        </div>

        {message ? <div className="notice success board-notice">{message}</div> : null}
        {error ? <div className="notice error board-notice">{error}</div> : null}
        {hiddenCount > 0 ? <div className="notice board-notice">{hiddenCount} niet-passende verbindingen verborgen.</div> : null}

        <div className={`match-board ${busy ? "busy" : ""} ${selected ? "checking" : ""} ${fullscreen ? "simple" : ""}`}>
          {visibleMatches.map((match, index) => {
            const editable = !disabled && match.status === "DRAFT";
            const validation = validations.get(match.id);
            const isSource = selected?.matchId === match.id;
            const dropClass = selected
              ? isSource
                ? "drop-source"
                : validation?.ok
                  ? "drop-ok"
                  : "drop-bad"
              : "";

            return (
              <div
                className={`match-row ${editable ? "editable" : "locked"} ${dropClass}`}
                key={match.id}
                onDragOver={(event) => {
                  if (editable && validation?.ok) {
                    event.preventDefault();
                  }
                }}
                onDrop={(event) => handleDrop(event, match.id)}
                title={validation?.reason}
              >
                <span className="match-index">{index + 1}</span>
                <ParticipantTile
                  editable={editable}
                  match={match}
                  onDragEnd={() => setSelected(null)}
                  onDragStart={handleDragStart}
                  onSelect={handleSelect}
                  participant={match.host}
                  selected={selected}
                  side="host"
                  simple={fullscreen}
                />
                <div aria-hidden="true" className="connection-track">
                  <span className="connection-line" />
                  <span className="connection-badge">{match.partySize}</span>
                </div>
                <ParticipantTile
                  editable={editable}
                  match={match}
                  onDragEnd={() => setSelected(null)}
                  onDragStart={handleDragStart}
                  onSelect={handleSelect}
                  participant={match.eater}
                  selected={selected}
                  side="eater"
                  simple={fullscreen}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <>
      {renderBoard(false)}
      {expanded ? (
        <div className="match-board-overlay" role="dialog" aria-label="Groot matchbord" aria-modal="true">
          <div className="match-board-modal">{renderBoard(true)}</div>
        </div>
      ) : null}
    </>
  );
}
