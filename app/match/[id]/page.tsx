"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import AuthGuard from "@/components/AuthGuard";
import {
  addPlayerToMatch,
  confirmAttendance,
  updatePlayerData,
  saveTeams,
  closeMatch,
  reopenMatch,
  unconfirmAttendance,
  deletePlayerFromMatch,
} from "@/lib/matches";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useParams } from "next/navigation";
import { balanceTeams } from "@/lib/balanceTeams";
import { getAllUsers } from "@/lib/usersList";
import { getUserProfile } from "@/lib/users";
import { formatDateSpanish, formatTime12h } from "@/lib/date";

type Position = "GK" | "DEF" | "MID" | "FWD";

export default function MatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [match, setMatch] = useState<any>(null);
  const [balanced, setBalanced] = useState<any | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUid, setSelectedUid] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualLevel, setManualLevel] = useState(2);
  const [copied, setCopied] = useState(false);
  const [manualPositions, setManualPositions] = useState<string[]>([]);
  const [maxPlayersDraft, setMaxPlayersDraft] = useState<number | null>(null);

  async function loadMatch() {
    const snap = await getDoc(doc(db, "matches", id));
    if (!snap.exists()) return;

    const data = snap.data();

    setMatch({ id: snap.id, ...data });
    setMaxPlayersDraft(
      typeof data.maxPlayers === "number" ? data.maxPlayers : null
    );
  }


  useEffect(() => {
    loadMatch();
  }, []);

  useEffect(() => {
    if (!match) return;
    const isOwner = user?.uid === match.createdBy;
    if (!isOwner) return;
    getAllUsers().then(setUsers);
  }, [match, user]);

  if (!match) return <p style={{ padding: 20 }}>Cargando...</p>;

  const isOwner = user?.uid === match.createdBy;
  const isClosed = match.status === "closed";
  const existingPlayers = match.players ?? [];

  const availableUsers = users.filter(u => {
    const uidExists = existingPlayers.some(
      (p: any) => p.uid && p.uid === u.uid
    );
    const nameExists = existingPlayers.some(
      (p: any) =>
        typeof p.name === "string" &&
        typeof u.name === "string" &&
        p.name.trim().toLowerCase() === u.name.trim().toLowerCase()
    );
    return !uidExists && !nameExists;
  });

  function getTeamSummary(players: any[]) {
    const totalLevel = players.reduce(
      (sum: number, p: any) => sum + (p.level ?? 0),
      0
    );

    const positionsCount: Record<Position, number> = {
      GK: 0,
      DEF: 0,
      MID: 0,
      FWD: 0,
    };

    players.forEach((p: any) => {
      p.positions?.forEach((pos: Position) => {
        positionsCount[pos]++;
      });
    });

    return {
      count: players.length,
      totalLevel,
      positionsCount,
    };
  }

  const card = {
    background: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    border: "1px solid #e5e7eb",
  };

  const btnPrimary = {
    padding: "8px 12px",
    background: "#16a34a",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
  };

  const btnDanger = {
    ...btnPrimary,
    background: "#dc2626",
  };

  const confirmedCount = match.players?.filter((p: any) => p.confirmed).length ?? 0;
  const totalPlayers = match.players?.length ?? 0;
  const isFull = confirmedCount >= (match.maxPlayers ?? Infinity);


  return (
    <AuthGuard>
      <main style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
        {/* INFO PARTIDO */}
        <div style={card}>
          <h1 style={{ marginBottom: 8 }}>⚽ Partido</h1>
          <p style={{ color: "#555" }}>
            📍 {match.location}
          </p>

          <p style={{ color: "#555" }}>
            🕒 {formatDateSpanish(match.date)}
          </p>

          <p style={{ color: "#555" }}>
            ⏰ {formatTime12h(match.time)}
          </p>

          <div
            style={{
              marginTop: 8,
              fontWeight: 600,
              color: isFull ? "#dc2626" : "#16a34a",
            }}
          >
            Confirmados: {confirmedCount} / {match.maxPlayers}
            {isFull && " · COMPLETO"}
          </div>

          {isFull && !isClosed && (
            <p style={{ color: "#dc2626", fontWeight: 600 }}>
              🚫 El partido está completo
            </p>
          )}

          {isOwner && !isClosed && (
            <div style={{ marginTop: 8 }}>
              <label>
                Máx jugadores:
                <input
                  type="number"
                  min={2}
                  value={maxPlayersDraft ?? ""}
                  onChange={e => setMaxPlayersDraft(Number(e.target.value))}
                  onBlur={async () => {
                    if (maxPlayersDraft === match.maxPlayers) return;

                    await updateDoc(doc(db, "matches", id), {
                      maxPlayers: maxPlayersDraft,
                    });

                    loadMatch();
                  }}
                  style={{ marginLeft: 8, width: 80 }}
                />
              </label>
            </div>
          )}

          <p style={{ marginTop: 8 }}>
            Estado:{" "}
            <strong style={{ color: isClosed ? "#dc2626" : "#16a34a" }}>
              {isClosed ? "Cerrado" : "Abierto"}
            </strong>
          </p>

          <div style={{ marginTop: 8 }}>
            <input
              value={`${window.location.origin}/join/${id}`}
              readOnly
              style={{
                width: "100%",
                padding: 8,
                borderRadius: 6,
                border: "1px solid #ccc",
              }}
            />

            <button
              onClick={async () => {
                await navigator.clipboard.writeText(
                  `${window.location.origin}/join/${id}`
                );
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              style={{
                marginTop: 8,
                width: "100%",
                padding: "10px",
                background: copied ? "#16a34a" : "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {copied ? "✅ Link copiado" : "📋 Copiar link de invitación"}
            </button>
          </div>

        </div>

        {/* AGREGAR JUGADORES */}
        {isOwner && !isClosed && (
          <div style={card}>
            <h3>➕ Agregar jugador</h3>

            <div style={{ marginTop: 8 }}>
              <select
                value={selectedUid}
                onChange={e => setSelectedUid(e.target.value)}
              >
                <option value="">Usuario registrado</option>
                {availableUsers.map(u => (
                  <option key={u.uid} value={u.uid}>
                    {u.name}
                  </option>
                ))}
              </select>

              <button
                style={{ ...btnPrimary, marginLeft: 8 }}
                disabled={!selectedUid || isFull}
                onClick={async () => {
                  if (isFull) return;
                  const profile = await getUserProfile(selectedUid);
                  if (!profile) return;

                  await addPlayerToMatch(id, {
                    uid: selectedUid,
                    name: profile.name,
                    level: 2,
                    positions: profile.positions || [],
                  });

                  setSelectedUid("");
                  loadMatch();
                }}
              >
                Agregar
              </button>
            </div>

            <hr style={{ margin: "16px 0" }} />

            <input
              placeholder="Nombre invitado"
              value={manualName}
              onChange={e => setManualName(e.target.value)}
            />

            <select
              value={manualLevel}
              onChange={e => setManualLevel(Number(e.target.value))}
              style={{ marginLeft: 8 }}
            >
              <option value={1}>Bajo</option>
              <option value={2}>Medio</option>
              <option value={3}>Alto</option>
            </select>

            {["GK", "DEF", "MID", "FWD"].map(pos => (
              <label key={pos} style={{ marginLeft: 8 }}>
                <input
                  type="checkbox"
                  checked={manualPositions.includes(pos)}
                  onChange={e => {
                    const updated = e.target.checked
                      ? [...manualPositions, pos]
                      : manualPositions.filter(p => p !== pos);
                    if (updated.length <= 2) setManualPositions(updated);
                  }}
                />{" "}
                {pos}
              </label>
            ))}

            <button
              style={{ ...btnPrimary, marginLeft: 8 }}
              disabled={!manualName || isFull}
              onClick={async () => {
                if (isFull) return;
                await addPlayerToMatch(id, {
                  name: manualName,
                  level: manualLevel,
                  positions: manualPositions,
                });
                setManualName("");
                setManualPositions([]);
                setManualLevel(2);
                loadMatch();
              }}
            >
              Agregar invitado
            </button>
          </div>
        )}

        {/* JUGADORES */}
        <div style={card}>
          <h3>👥 Jugadores</h3>

          {match.players?.map((p: any, i: number) => (
            <div
              key={i}
              style={{
                borderBottom: "1px solid #eee",
                padding: "12px 0",
              }}
            >
              <span style={{ fontWeight: 600 }}>{p.name}</span>

              <span
                style={{
                  marginLeft: 8,
                  fontSize: 12,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: p.confirmed ? "#dcfce7" : "#fef3c7",
                  color: p.confirmed ? "#166534" : "#92400e",
                }}
              >
                {p.confirmed ? "Confirmado" : "Pendiente"}
              </span>


              {!isClosed && (
                <button
                  style={{ ...btnPrimary, marginLeft: 8 }}
                  disabled={!p.confirmed && isFull}
                  onClick={async () => {
                    if (!p.confirmed && isFull) return;
                    p.confirmed
                      ? await unconfirmAttendance(id, p.name)
                      : await confirmAttendance(id, p.name);
                    loadMatch();
                  }}
                >
                  {p.confirmed ? "Cancelar asistencia" : "Confirmar asistencia"}
                </button>
              )}

              {isOwner && !isClosed && (
                <button
                  style={{ ...btnDanger, marginLeft: 8 }}
                  onClick={async () => {
                    if (!confirm(`Eliminar a ${p.name}?`)) return;
                    await deletePlayerFromMatch(id, p.name);
                    loadMatch();
                  }}
                >
                  Eliminar
                </button>
              )}

              {isOwner && !isClosed && (
                <div style={{ marginTop: 8 }}>
                  Nivel:
                  <select
                    value={p.level ?? 2}
                    onChange={async e => {
                      await updatePlayerData(id, p.name, {
                        level: Number(e.target.value),
                      });
                      loadMatch();
                    }}
                    style={{ marginLeft: 8 }}
                  >
                    <option value={1}>Bajo</option>
                    <option value={2}>Medio</option>
                    <option value={3}>Alto</option>
                  </select>
                </div>
              )}
              {isOwner && !isClosed && (
                <div style={{ marginTop: 6 }}>
                  Posiciones:
                  {["GK", "DEF", "MID", "FWD"].map(pos => (
                    <label key={pos} style={{ marginLeft: 8 }}>
                      <input
                        type="checkbox"
                        checked={p.positions?.includes(pos) ?? false}
                        onChange={async e => {
                          const current = p.positions ?? [];

                          const updated = e.target.checked
                            ? [...current, pos]
                            : current.filter((x: string) => x !== pos);

                          if (updated.length > 2) return;

                          await updatePlayerData(id, p.name, {
                            positions: updated,
                          });
                          loadMatch();
                        }}
                      />{" "}
                      {pos}
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* BALANCEO */}
        {isOwner && !isClosed && (
          <button
            style={btnPrimary}
            onClick={async () => {
              const confirmed = match.players
                .filter((p: any) => p.confirmed)
                .map((p: any) => ({
                  name: p.name,
                  level: p.level ?? 2,
                  positions: p.positions ?? ["MID"],
                }));

              const result = balanceTeams(confirmed);
              setBalanced(result);

              await saveTeams(id, {
                A: result.teamA.players,
                B: result.teamB.players,
              });

              loadMatch();
            }}
          >
            ⚖️ Balancear equipos
          </button>
        )}

        {/* ESTADO PARTIDO */}
        <div style={{ marginTop: 16 }}>
          {isOwner && !isClosed && (
            <button
              style={btnDanger}
              onClick={async () => {
                await closeMatch(id);
                loadMatch();
              }}
            >
              🔒 Cerrar partido
            </button>
          )}

          {isOwner && isClosed && (
            <button
              style={btnPrimary}
              onClick={async () => {
                await reopenMatch(id);
                loadMatch();
              }}
            >
              🔓 Reabrir partido
            </button>
          )}
        </div>

        {/* RESULTADO BALANCEO */}
        {balanced && (
          <div style={card}>
            <h3>Equipos</h3>

            {["teamA", "teamB"].map(team => {
              const summary = getTeamSummary(balanced[team].players);
              return (
                <div key={team}>
                  <h4>{team === "teamA" ? "Equipo A" : "Equipo B"}</h4>
                  <p style={{ marginBottom: 6 }}>
                    👥 {summary.count} · ⚡ {summary.totalLevel}
                  </p>

                  <div style={{ fontSize: 14, color: "#374151" }}>
                    🧤 GK: {summary.positionsCount.GK} ·{" "}
                    🛡 DEF: {summary.positionsCount.DEF} ·{" "}
                    ⚙ MID: {summary.positionsCount.MID} ·{" "}
                    ⚽ FWD: {summary.positionsCount.FWD}
                  </div>
                  <ul>
                    {balanced[team].players.map((p: any, i: number) => (
                      <li key={i}>
                        {p.name} (Nivel {p.level})
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </AuthGuard>
  );
}
