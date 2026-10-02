"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

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
  saveChanges: boolean;
};

const manyMatchesLimit = 14;

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
  const byEmail = new Map(participants.map((p) => [p.email.toLowerCase(), p.id]));
  const byName = new Map(participants.map((p) => [p.name.toLowerCase(), p.id]));
  const byId = new Map(participants.map((p) => [p.id, p.id]));
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
  return matches.map((m) => ({ ...m, host: { ...m.host }, eater: { ...m.eater } }));
}

function swapSide(matches: BoardMatch[], payload: DragPayload, targetMatchId: string) {
  const nextMatches = cloneMatches(matches);
  const source = nextMatches.find((m) => m.id === payload.matchId);
  const target = nextMatches.find((m) => m.id === targetMatchId);
  if (!source || !target || source.id === target.id) return nextMatches;

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

type TBoard = ReturnType<typeof useTranslations<"board">>;

function validateConnection(match: BoardMatch, adminNoMatch: Map<string, Set<string>>, t: TBoard): string | null {
  if (match.host.id === match.eater.id) {
    return t("errSelfMatch", { name: match.host.name });
  }
  if (!match.host.hostCapacity || match.host.hostCapacity < match.partySize) {
    return t("errCapacity", { name: match.host.name, cap: match.host.hostCapacity ?? 0, size: match.partySize });
  }
  if (!compatibleChoice(match.host.gatheringType, match.eater.gatheringType)) {
    return t("errGathering", { host: match.host.name, eater: match.eater.name });
  }
  if (adminBlocksMatch(match.host, match.eater, adminNoMatch)) {
    return t("errAdminBlock", { host: match.host.name, eater: match.eater.name });
  }
  return null;
}

function validatePairUniqueness(matches: BoardMatch[], t: TBoard) {
  const pairs = new Set<string>();
  for (const match of matches) {
    if (match.status === "CANCELLED") continue;
    const key = pairKey(match.host.id, match.eater.id);
    if (pairs.has(key)) {
      return t("errDuplicate", { host: match.host.name, eater: match.eater.name });
    }
    pairs.add(key);
  }
  return null;
}

function validateHostTotals(matches: BoardMatch[], hostIds: Set<string>, t: TBoard) {
  const totals = new Map<string, number>();
  for (const match of matches) {
    if (match.status !== "CANCELLED" && hostIds.has(match.host.id)) {
      totals.set(match.host.id, (totals.get(match.host.id) || 0) + match.partySize);
    }
  }
  for (const [hostId, total] of totals) {
    const host = matches.find((m) => m.host.id === hostId)?.host;
    if (host && (!host.hostCapacity || total > host.hostCapacity)) {
      return t("errOverCapacity", { name: host.name, cap: host.hostCapacity ?? 0, total });
    }
  }
  return null;
}

function validateMove(
  matches: BoardMatch[],
  payload: DragPayload,
  targetMatchId: string,
  adminNoMatch: Map<string, Set<string>>,
  t: TBoard
): MoveValidation {
  const source = matches.find((m) => m.id === payload.matchId);
  const target = matches.find((m) => m.id === targetMatchId);

  if (!source || !target) return { ok: false, reason: t("errNotFound") };
  if (source.id === target.id) return { ok: false, reason: t("errSelf") };
  if (source.status !== "DRAFT" || target.status !== "DRAFT") {
    return { ok: false, reason: t("errDraftOnly") };
  }

  const nextMatches = swapSide(matches, payload, targetMatchId);
  const nextSource = nextMatches.find((m) => m.id === source.id);
  const nextTarget = nextMatches.find((m) => m.id === target.id);

  if (!nextSource || !nextTarget) return { ok: false, reason: t("errNotFound") };

  const sourceError = validateConnection(nextSource, adminNoMatch, t);
  if (sourceError) return { ok: false, reason: sourceError };

  const targetError = validateConnection(nextTarget, adminNoMatch, t);
  if (targetError) return { ok: false, reason: targetError };

  const pairError = validatePairUniqueness(nextMatches, t);
  if (pairError) return { ok: false, reason: pairError };

  const affectedHosts = new Set([nextSource.host.id, nextTarget.host.id]);
  const error = validateHostTotals(nextMatches, affectedHosts, t);
  if (error) return { ok: false, reason: error };

  return { ok: true, reason: t("validOk") };
}

function validationFor(
  matches: BoardMatch[],
  payload: DragPayload | null,
  targetMatchId: string,
  adminNoMatch: Map<string, Set<string>>,
  t: TBoard
) {
  return payload ? validateMove(matches, payload, targetMatchId, adminNoMatch, t) : null;
}

function parseDragPayload(event: React.DragEvent) {
  try {
    const raw = event.dataTransfer.getData("application/json") || event.dataTransfer.getData("text/plain");
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
  simple,
  t
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
  t: TBoard;
}) {
  const payload = { matchId: match.id, side };
  const isHost = side === "host";
  const capacityProblem = isHost && participant.hostCapacity !== null && participant.hostCapacity < match.partySize;

  return (
    <button
      aria-label={`${isHost ? t("tileHost") : t("tileEater")} ${participant.name}`}
      className={`match-tile ${isHost ? "host-tile" : "eater-tile"} ${sameDrag(selected, payload) ? "selected" : ""}`}
      disabled={!editable}
      draggable={editable}
      onClick={() => onSelect(payload)}
      onDragEnd={onDragEnd}
      onDragStart={(event) => onDragStart(event, payload)}
      title={editable ? t("dragHint") : t("lockedHint")}
      type="button"
    >
      <span className="tile-kicker">{isHost ? t("tileHost") : t("tileEater")}</span>
      <strong>{participant.name}</strong>
      {!simple ? (
        <span className="tile-meta">
          {isHost ? t("modeHost") : participant.mode === "EAT" ? t("modeEat") : participant.mode === "HOST" ? t("modeHost") : t("modeBoth")}
        </span>
      ) : null}
      {isHost ? (
        <>
          <span className={capacityProblem ? "tile-warning" : "tile-meta"}>
            {t("tileCapacity", { cap: participant.hostCapacity ?? "-", group: match.partySize })}
          </span>
          {!simple && participant.cannotHostDays ? <span className="tile-extra">{participant.cannotHostDays}</span> : null}
        </>
      ) : (
        <>
          <span className="tile-meta">{t("tilePartySize", { n: match.partySize })}</span>
          {!simple ? (
            <span className="tile-meta">
              {participant.gatheringType === "MEAL"
                ? t("gatheringMeal")
                : participant.gatheringType === "COFFEE_TEA"
                ? t("gatheringCoffee")
                : t("gatheringBoth")}
            </span>
          ) : null}
          {!simple && participant.allergies ? <span className="tile-extra">{participant.allergies}</span> : null}
        </>
      )}
    </button>
  );
}

export function AdminMatchBoard({ adminKey, disabled, initialMatches, participants, saveChanges }: AdminMatchBoardProps) {
  const t = useTranslations("board");
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
      result.set(match.id, validationFor(matches, selected, match.id, adminNoMatch, t) || { ok: false, reason: "" });
    }
    return result;
  }, [adminNoMatch, matches, selected, t]);

  const viableCount = useMemo(
    () => (selected ? matches.filter((m) => validations.get(m.id)?.ok).length : 0),
    [matches, selected, validations]
  );
  const editableCount = matches.filter((m) => !disabled && m.status === "DRAFT").length;

  async function commitSwap(payload: DragPayload, targetMatchId: string) {
    const validation = validateMove(matches, payload, targetMatchId, adminNoMatch, t);
    if (disabled || busy || !validation.ok) {
      setError(validation.reason);
      if (payload.matchId === targetMatchId) setSelected(null);
      return;
    }

    const previousMatches = matches;
    setBusy(true);
    setError(null);
    setMessage(null);
    setSelected(null);
    setMatches((current) => swapSide(current, payload, targetMatchId));

    if (!saveChanges) {
      setBusy(false);
      setMessage(t("savedDemo"));
      return;
    }

    try {
      const response = await fetch("/api/admin/matches/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminKey, sourceMatchId: payload.matchId, targetMatchId, side: payload.side })
      });
      const data = (await response.json()) as { error?: string; matches?: BoardMatch[] };

      if (!response.ok || !data.matches) {
        throw new Error(data.error || t("saveError"));
      }

      setMatches(data.matches);
      setMessage(t("savedOk"));
    } catch (caught) {
      setMatches(previousMatches);
      setError(caught instanceof Error ? caught.message : t("saveError"));
    } finally {
      setBusy(false);
    }
  }

  function handleSelect(payload: DragPayload) {
    if (disabled || busy) return;
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
    event.dataTransfer.setData("text/plain", JSON.stringify(payload));
    setError(null);
    setMessage(null);
    setSelected(payload);
  }

  function handleDrop(event: React.DragEvent, targetMatchId: string) {
    event.preventDefault();
    const payload = parseDragPayload(event);
    if (payload) void commitSwap(payload, targetMatchId);
  }

  function renderBoard(fullscreen: boolean) {
    const showOnlyViable = Boolean(selected && matches.length > manyMatchesLimit);
    const visibleMatches = showOnlyViable
      ? matches.filter((m) => m.id === selected?.matchId || validations.get(m.id)?.ok)
      : matches;
    const hiddenCount = matches.length - visibleMatches.length;

    if (matches.length === 0) {
      return <div className="board-empty">{t("noMatches")}</div>;
    }

    return (
      <div className={`match-board-shell ${fullscreen ? "fullscreen" : ""}`}>
        <div className="board-toolbar">
          <div className="board-summary">
            <strong>{t("connections", { n: matches.length })}</strong>
            {selected
              ? <span>{t("possibleSwaps", { n: viableCount })}</span>
              : <span>{t("editable", { n: editableCount })}</span>}
          </div>
          <div className="board-actions">
            {selected ? (
              <button className="small secondary" onClick={() => setSelected(null)} type="button">
                {t("clearSelection")}
              </button>
            ) : null}
            <button className="small secondary" onClick={() => setExpanded(!fullscreen)} type="button">
              {fullscreen ? t("collapse") : t("expand")}
            </button>
          </div>
        </div>

        {message ? <div className="notice success board-notice">{message}</div> : null}
        {error ? <div className="notice error board-notice">{error}</div> : null}
        {editableCount > 0 ? (
          <div className="board-help">{t("dragHelp")}</div>
        ) : (
          <div className="notice board-notice">{t("lockedNotice")}</div>
        )}
        {hiddenCount > 0 ? (
          <div className="notice board-notice">{t("hiddenCount", { n: hiddenCount })}</div>
        ) : null}

        <div className={`match-board ${busy ? "busy" : ""} ${selected ? "checking" : ""} ${fullscreen ? "simple" : ""}`}>
          {visibleMatches.map((match, index) => {
            const editable = !disabled && match.status === "DRAFT";
            const validation = validations.get(match.id);
            const isSource = selected?.matchId === match.id;
            const dropClass = selected
              ? isSource ? "drop-source" : validation?.ok ? "drop-ok" : "drop-bad"
              : "";

            return (
              <div
                className={`match-row ${editable ? "editable" : "locked"} ${dropClass}`}
                key={match.id}
                onDragOver={(event) => {
                  if (editable && selected) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
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
                  t={t}
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
                  t={t}
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
        <div className="match-board-overlay" role="dialog" aria-label={t("ariaLabel")} aria-modal="true">
          <div className="match-board-modal">{renderBoard(true)}</div>
        </div>
      ) : null}
    </>
  );
}
