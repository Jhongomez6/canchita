"use client";

import { useEffect, useState } from "react";
import { buildWhatsAppReport } from "@/lib/matchReport";
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
import { useParams, useRouter } from "next/navigation";
import { balanceTeams } from "@/lib/balanceTeams";
import { getAllUsers } from "@/lib/usersList";
import { getUserProfile } from "@/lib/users";
import { formatDateSpanish, formatTime12h } from "@/lib/date";
import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
} from "@dnd-kit/core";

import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";

import { CSS } from "@dnd-kit/utilities";
import { updatePlayerStats } from "@/lib/playerStats";


type Position = "GK" | "DEF" | "MID" | "FWD";

export default function MatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const [match, setMatch] = useState<any>(null);
  const [balanced, setBalanced] = useState<any | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [selectedUid, setSelectedUid] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualLevel, setManualLevel] = useState(2);
  const [copied, setCopied] = useState(false);
  const [manualPositions, setManualPositions] = useState<string[]>([]);
  const [maxPlayersDraft, setMaxPlayersDraft] = useState<number | null>(null);
  const [location, setLocation] = useState<any>(null);
  const [balancing, setBalancing] = useState(false);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [savingTeams, setSavingTeams] = useState(false);
  const [teamsSaved, setTeamsSaved] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);
  const [copyingReport, setCopyingReport] = useState(false);
  const [savingScore, setSavingScore] = useState(false);
  const [scoreSaved, setScoreSaved] = useState(false);


  const sensors = useSensors(
    useSensor(PointerSensor)
  );




  async function loadMatch() {
    const snap = await getDoc(doc(db, "matches", id));
    if (!snap.exists()) return;

    const data = snap.data();

    setMatch({ id: snap.id, ...data });
    setMaxPlayersDraft(
      typeof data.maxPlayers === "number" ? data.maxPlayers : null
    );
    if (data.teams?.A && data.teams?.B) {
      setBalanced({
        teamA: { players: data.teams.A },
        teamB: { players: data.teams.B },
      });
    }

  }
  async function handleBalance() {
    if (confirmedCount < 4) return;

    setBalancing(true);

    const confirmed = match.players
      .filter((p: any) => p.confirmed)
      .map((p: any) => ({
        uid: p.uid ?? null,
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

    await loadMatch();

    setBalancing(false);
  }

  async function generateWhatsAppReport() {
    if (!match?.teams) return;

    const teamA = match.teams.A ?? [];
    const teamB = match.teams.B ?? [];

    const scoreA = match.score?.A ?? 0;
    const scoreB = match.score?.B ?? 0;

    let text = `⚽ *La titular de hoy:*\n\n`;

    text += `🔴 *Equipo A*\n`;
    teamA.forEach((p: any) => {
      text += `• ${p.name} \n`;
    });

    text += `\n🔵 *Equipo B*\n`;
    teamB.forEach((p: any) => {
      text += `• ${p.name} \n`;
    });

    if (match.status === "closed") {
      text += `\n🏆 *Resultado Final*\n`;
      text += `🔴 Equipo A ${scoreA} - ${scoreB} Equipo B 🔵\n`;
    }

    await navigator.clipboard.writeText(text);
  }

  useEffect(() => {
    if (!user) return;
    
    getUserProfile(user.uid).then(profile => {
      setUserProfile(profile);
      setLoadingProfile(false);
    });
  }, [user]);

  useEffect(() => {
    if (!userProfile) return;
    loadMatch();
  }, [userProfile]);

  useEffect(() => {
    if (!match?.score) return;

    setScoreA(match.score.A ?? 0);
    setScoreB(match.score.B ?? 0);
  }, [match]);


  useEffect(() => {
    if (!match?.score) return;

    setScoreA(match.score.A ?? 0);
    setScoreB(match.score.B ?? 0);
  }, [match]);


  useEffect(() => {
    if (!match?.locationId) return;

    getDoc(doc(db, "locations", match.locationId))
      .then(snap => {
        if (snap.exists()) {
          setLocation({ id: snap.id, ...snap.data() });
        }
      });
  }, [match]);


  useEffect(() => {
    if (!match) return;
    const isOwner = user?.uid === match.createdBy;
    if (!isOwner) return;
    getAllUsers().then(setUsers);
  }, [match, user]);

  // Redirigir si no es admin
  useEffect(() => {
    if (!loadingProfile && userProfile && userProfile.role !== "admin") {
      router.push("/");
    }
  }, [loadingProfile, userProfile, router]);

  if (loadingProfile) {
    return (
      <AuthGuard>
        <p style={{ padding: 20 }}>Cargando...</p>
      </AuthGuard>
    );
  }

  if (!userProfile || userProfile.role !== "admin") {
    return (
      <AuthGuard>
        <p style={{ padding: 20 }}>Cargando...</p>
      </AuthGuard>
    );
  }

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

  function handleDragEnd(event: any) {
    const { active, over } = event;
    if (!over) return;

    const playerName = active.id;

    const fromA = balanced.teamA.players.find(
      (p: any) => p.name === playerName
    );
    const fromB = balanced.teamB.players.find(
      (p: any) => p.name === playerName
    );

    let newA = [...balanced.teamA.players];
    let newB = [...balanced.teamB.players];

    if (fromA) {
      newA = newA.filter(p => p.name !== playerName);
      newB.push(fromA);
    } else if (fromB) {
      newB = newB.filter(p => p.name !== playerName);
      newA.push(fromB);
    }

    setBalanced({
      teamA: { players: newA },
      teamB: { players: newB },
    });
  }



  return (
    <AuthGuard>
      <main style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
        {/* INFO PARTIDO */}
        <div style={card}>
          <h1 style={{ marginBottom: 8 }}>⚽ Partido</h1>
          {location ? (
            <p style={{ color: "#555" }}>
              📍 {location.name}
            </p>
          ) : (
            <p style={{ color: "#999" }}>
              📍 Cargando cancha...
            </p>
          )}


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
          <div style={{
            ...card,
            border: "2px solid #16a34a",
            background: "#f0fdf4"
          }}>
            <h3 style={{ marginBottom: 8 }}>⚖️ Balancear equipos</h3>

            <p style={{ fontSize: 14, color: "#555", marginBottom: 12 }}>
              Se usarán los jugadores <strong>confirmados</strong>.
              Actualmente hay <strong>{confirmedCount}</strong>.
            </p>

            <button
              disabled={confirmedCount < 4}
              style={{
                width: "100%",
                padding: "12px",
                background: confirmedCount < 4 ? "#9ca3af" : "#16a34a",
                color: "#fff",
                borderRadius: 10,
                border: "none",
                fontWeight: 700,
                cursor: confirmedCount < 4 ? "not-allowed" : "pointer",
              }}
              onClick={handleBalance}
            >
              {balancing ? "⏳ Balanceando..." : "⚖️ Generar equipos"}
            </button>

            {confirmedCount < 4 && (
              <p style={{ marginTop: 8, fontSize: 13, color: "#dc2626" }}>
                Necesitas al menos 4 jugadores confirmados
              </p>
            )}
          </div>
        )}

        {/* RESULTADO BALANCEO */}
        {balanced && (
          <div style={{ ...card, padding: 20 }}>
            <h3 style={{ marginBottom: 16 }}>⚖️ Balance de Equipos</h3>

            {(() => {
              const summaryA = getTeamSummary(balanced.teamA.players);
              const summaryB = getTeamSummary(balanced.teamB.players);

              const diffLevel = Math.abs(
                summaryA.totalLevel - summaryB.totalLevel
              );

              return (
                <>
                  {/* ================= RESUMEN GLOBAL ================= */}
                  <div
                    style={{
                      marginBottom: 20,
                      padding: 14,
                      borderRadius: 12,
                      background: "#f8fafc",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    <div>
                      ⚡ Diferencia de nivel:{" "}
                      <strong>{diffLevel} pts</strong>
                    </div>
                    <div
                      style={{
                        marginTop: 12,
                        fontSize: 14,
                        display: "grid",
                        gridTemplateColumns: "70px 30px 30px 30px",
                        rowGap: 6,
                        alignItems: "center",
                      }}
                    >
                      <div>🧤 GK</div>
                      <div style={{ textAlign: "center" }}>{summaryA.positionsCount.GK}</div>
                      <div style={{ textAlign: "center" }}>-</div>
                      <div style={{ textAlign: "center" }}>{summaryB.positionsCount.GK}</div>

                      <div>🛡 DEF</div>
                      <div style={{ textAlign: "center" }}>{summaryA.positionsCount.DEF}</div>
                      <div style={{ textAlign: "center" }}>-</div>
                      <div style={{ textAlign: "center" }}>{summaryB.positionsCount.DEF}</div>

                      <div>⚙ MID</div>
                      <div style={{ textAlign: "center" }}>{summaryA.positionsCount.MID}</div>
                      <div style={{ textAlign: "center" }}>-</div>
                      <div style={{ textAlign: "center" }}>{summaryB.positionsCount.MID}</div>

                      <div>⚽ FWD</div>
                      <div style={{ textAlign: "center" }}>{summaryA.positionsCount.FWD}</div>
                      <div style={{ textAlign: "center" }}>-</div>
                      <div style={{ textAlign: "center" }}>{summaryB.positionsCount.FWD}</div>
                    </div>

                  </div>

                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <div style={{ display: "flex", gap: 20 }}>
                      {/* ================= EQUIPO A ================= */}
                      <div
                        style={{
                          flex: 1,
                          background: "#f0fdf4",
                          borderRadius: 14,
                          padding: 16,
                          border: "1px solid #bbf7d0",
                        }}
                      >
                        <h4 style={{ marginBottom: 6 }}>🔴 Equipo A</h4>

                        <div style={{ fontSize: 14, marginBottom: 12 }}>
                          ⚡ <strong>{summaryA.totalLevel}</strong> pts · 👥{" "}
                          {summaryA.count}
                        </div>

                        <SortableContext
                          items={balanced.teamA.players.map(
                            p => p.uid ?? p.name
                          )}
                          strategy={verticalListSortingStrategy}
                        >
                          {balanced.teamA.players.map(p => (
                            <PlayerItem
                              key={p.uid ?? p.name}
                              id={p.uid ?? p.name}
                              name={
                                <>
                                  <span style={{ fontWeight: 600 }}>
                                    {p.name}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 12,
                                      marginLeft: 6,
                                      color: "#555",
                                    }}
                                  >
                                    ⚡ {p.level} ·{" "}
                                    {(p.positions || []).join("/")}
                                  </span>
                                </>
                              }
                            />
                          ))}
                        </SortableContext>
                      </div>

                      {/* ================= EQUIPO B ================= */}
                      <div
                        style={{
                          flex: 1,
                          background: "#eff6ff",
                          borderRadius: 14,
                          padding: 16,
                          border: "1px solid #bfdbfe",
                        }}
                      >
                        <h4 style={{ marginBottom: 6 }}>🔵 Equipo B</h4>

                        <div style={{ fontSize: 14, marginBottom: 12 }}>
                          ⚡ <strong>{summaryB.totalLevel}</strong> pts · 👥{" "}
                          {summaryB.count}
                        </div>

                        <SortableContext
                          items={balanced.teamB.players.map(
                            p => p.uid ?? p.name
                          )}
                          strategy={verticalListSortingStrategy}
                        >
                          {balanced.teamB.players.map(p => (
                            <PlayerItem
                              key={p.uid ?? p.name}
                              id={p.uid ?? p.name}
                              name={
                                <>
                                  <span style={{ fontWeight: 600 }}>
                                    {p.name}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 12,
                                      marginLeft: 6,
                                      color: "#555",
                                    }}
                                  >
                                    ⚡ {p.level} ·{" "}
                                    {(p.positions || []).join("/")}
                                  </span>
                                </>
                              }
                            />
                          ))}
                        </SortableContext>
                      </div>
                    </div>
                  </DndContext>

                  <button
                    disabled={savingTeams}
                    onClick={async () => {
                      setSavingTeams(true);
                      setTeamsSaved(false);

                      try {
                        await saveTeams(id, {
                          A: balanced.teamA.players,
                          B: balanced.teamB.players,
                        });

                        setTeamsSaved(true);

                        setTimeout(() => {
                          setTeamsSaved(false);
                        }, 2000);

                      } finally {
                        setSavingTeams(false);
                      }
                    }}
                    style={{
                      marginTop: 16,
                      width: "100%",
                      padding: 14,
                      background: teamsSaved
                        ? "#16a34a"
                        : savingTeams
                          ? "#9ca3af"
                          : "#2563eb",
                      color: "#fff",
                      borderRadius: 12,
                      border: "none",
                      fontWeight: 700,
                      fontSize: 15,
                      cursor: savingTeams ? "not-allowed" : "pointer",
                      transition: "all 0.2s ease",
                      boxShadow: savingTeams
                        ? "none"
                        : "0 6px 16px rgba(0,0,0,0.12)",
                    }}
                  >
                    {savingTeams
                      ? "⏳ Guardando cambios..."
                      : teamsSaved
                        ? "✅ Equipos guardados"
                        : "💾 Guardar cambios manuales"}
                  </button>
                  {match.teams && (
                    <button
                      disabled={copyingReport}
                      onClick={async () => {
                        setCopyingReport(true);
                        setCopiedReport(false);

                        try {
                          await generateWhatsAppReport();
                          setCopiedReport(true);

                          setTimeout(() => {
                            setCopiedReport(false);
                          }, 2000);

                        } finally {
                          setCopyingReport(false);
                        }
                      }}
                      style={{
                        marginTop: 16,
                        width: "100%",
                        padding: 14,
                        background: copiedReport
                          ? "#16a34a"
                          : copyingReport
                            ? "#9ca3af"
                            : "#25D366",
                        color: "#fff",
                        borderRadius: 14,
                        border: "none",
                        fontWeight: 700,
                        fontSize: 16,
                        cursor: copyingReport ? "not-allowed" : "pointer",
                        transition: "all 0.2s ease",
                        boxShadow: copyingReport
                          ? "none"
                          : "0 8px 20px rgba(0,0,0,0.12)",
                      }}
                    >
                      {copyingReport
                        ? "⏳ Copiando reporte..."
                        : copiedReport
                          ? "✅ Reporte copiado"
                          : match.status === "closed"
                            ? "📲 Copiar reporte final"
                            : "📲 Copiar equipos balanceados"}
                    </button>
                  )}


                </>
              );
            })()}
          </div>
        )}

        {isOwner && match.teams && (
          <div
            style={{
              marginTop: 20,
              background: "#ffffff",
              borderRadius: 16,
              padding: 20,
              boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
              border: "1px solid #e5e7eb",
            }}
          >
            <h3 style={{ marginBottom: 16 }}>
              {isClosed ? "🏆 Marcador final" : "🏆 Registrar marcador final"}
            </h3>

            {isClosed && (
              <p style={{ fontSize: 14, color: "#dc2626", marginBottom: 12 }}>
                🔒 El partido está cerrado. No se puede modificar el resultado.
              </p>
            )}

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 20,
                fontSize: 28,
                fontWeight: 800,
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 14, marginBottom: 6 }}>🔴 Equipo A</div>
                <input
                  type="number"
                  min={0}
                  value={scoreA}
                  onChange={e => setScoreA(Number(e.target.value))}
                  disabled={isClosed}
                  style={{
                    width: 70,
                    fontSize: 28,
                    textAlign: "center",
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    padding: 6,
                    background: isClosed ? "#f3f4f6" : "#fff",
                    cursor: isClosed ? "not-allowed" : "text",
                  }}
                />
              </div>

              <div style={{ fontSize: 26 }}>—</div>

              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 14, marginBottom: 6 }}>🔵 Equipo B</div>
                <input
                  type="number"
                  min={0}
                  value={scoreB}
                  onChange={e => setScoreB(Number(e.target.value))}
                  disabled={isClosed}
                  style={{
                    width: 70,
                    fontSize: 28,
                    textAlign: "center",
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    padding: 6,
                    background: isClosed ? "#f3f4f6" : "#fff",
                    cursor: isClosed ? "not-allowed" : "text",
                  }}
                />
              </div>
            </div>

            {!isClosed && (
              <button
                onClick={async () => {
                  if (!match?.teams) return;

                  setSavingScore(true);
                  setScoreSaved(false);

                  try {
                    await updateDoc(doc(db, "matches", id), {
                      score: {
                        A: scoreA,
                        B: scoreB,
                      },
                    });

                    await loadMatch();

                    setScoreSaved(true);
                    setTimeout(() => setScoreSaved(false), 2000);
                  } finally {
                    setSavingScore(false);
                  }
                }}
                disabled={savingScore}
                style={{
                  marginTop: 12,
                  width: "100%",
                  padding: 14,
                  background: scoreSaved
                    ? "#16a34a"
                    : savingScore
                      ? "#9ca3af"
                      : "#1f7a4f",
                  color: "#fff",
                  borderRadius: 12,
                  border: "none",
                  fontWeight: 700,
                  fontSize: 16,
                  cursor: savingScore ? "not-allowed" : "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                {scoreSaved
                  ? "✅ Resultado guardado"
                  : savingScore
                    ? "⏳ Guardando resultado..."
                    : "💾 Guardar resultado"}
              </button>
            )}


          </div>
        )}

        {/* ESTADO PARTIDO */}
        <div style={{ marginTop: 16 }}>
          {isOwner && !isClosed && (
            <button
              style={{
                ...btnDanger,
                opacity: !match?.teams ? 0.5 : 1,
                cursor: !match?.teams ? "not-allowed" : "pointer",
              }}
              disabled={!match?.teams}
              onClick={async () => {
                try {
                  // 1️⃣ Traer versión fresca del match
                  const snap = await getDoc(doc(db, "matches", id));
                  if (!snap.exists()) return;

                  const freshMatch = snap.data();

                  if (!freshMatch?.teams?.A || !freshMatch?.teams?.B) {
                    alert("Primero debes balancear los equipos.");
                    return;
                  }

                  if (
                    !freshMatch.teams.A.length ||
                    !freshMatch.teams.B.length
                  ) {
                    alert("Equipos inválidos.");
                    return;
                  }

                  const teamA = freshMatch.teams.A;
                  const teamB = freshMatch.teams.B;

                  // 2️⃣ Detectar si ya había un resultado previo (partido reabierto)
                  let previousResultA: "win" | "loss" | "draw" | undefined;
                  let previousResultB: "win" | "loss" | "draw" | undefined;
                  
                  if (freshMatch.statsProcessed && freshMatch.previousScore) {
                    const prevA = freshMatch.previousScore.A ?? 0;
                    const prevB = freshMatch.previousScore.B ?? 0;
                    
                    if (prevA > prevB) {
                      previousResultA = "win";
                      previousResultB = "loss";
                    } else if (prevB > prevA) {
                      previousResultA = "loss";
                      previousResultB = "win";
                    } else {
                      previousResultA = "draw";
                      previousResultB = "draw";
                    }
                  }

                  // 3️⃣ Guardar score + reporte
                  const report = buildWhatsAppReport({
                    ...freshMatch,
                    score: { A: scoreA, B: scoreB },
                  });

                  await updateDoc(doc(db, "matches", id), {
                    score: {
                      A: scoreA,
                      B: scoreB,
                    },
                    previousScore: freshMatch.score || { A: 0, B: 0 },
                    finalReport: report,
                    statsProcessed: true,
                  });

                  // 4️⃣ Actualizar stats según resultado (revirtiendo previos si existen)
                  if (scoreA > scoreB) {
                    await updatePlayerStats(teamA, "win", id, previousResultA);
                    await updatePlayerStats(teamB, "loss", id, previousResultB);
                  } else if (scoreB > scoreA) {
                    await updatePlayerStats(teamA, "loss", id, previousResultA);
                    await updatePlayerStats(teamB, "win", id, previousResultB);
                  } else {
                    await updatePlayerStats(teamA, "draw", id, previousResultA);
                    await updatePlayerStats(teamB, "draw", id, previousResultB);
                  }

                  // 5️⃣ Cerrar partido
                  await closeMatch(id);

                  await loadMatch();
                } catch (error) {
                  console.error("Error cerrando partido:", error);
                }
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
      </main>
    </AuthGuard>
  );
}

function PlayerItem({ id, name }: { id: string; name: string }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    padding: 10,
    background: "#fff",
    borderRadius: 8,
    marginBottom: 8,
    border: "1px solid #e5e7eb",
    cursor: "grab",
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {name}
    </div>
  );
}
