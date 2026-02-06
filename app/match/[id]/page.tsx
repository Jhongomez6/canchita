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
} from "@/lib/matches";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useParams } from "next/navigation";
import { balanceTeams } from "@/lib/balanceTeams";
import { getAllUsers } from "@/lib/usersList";
import { getUserProfile } from "@/lib/users";
import {
    unconfirmAttendance,
    deletePlayerFromMatch,
} from "@/lib/matches";

type Player = {
    name: string;
    confirmed: boolean;
};

export default function MatchDetailPage() {
    const { id } = useParams<{ id: string }>();
    const { user } = useAuth();

    const [match, setMatch] = useState<any>(null);
    const [balanced, setBalanced] = useState<any | null>(null);
    const [users, setUsers] = useState<any[]>([]);
    const [selectedUid, setSelectedUid] = useState("");
    const [manualName, setManualName] = useState("");
    const [manualLevel, setManualLevel] = useState(2);
    const [manualPositions, setManualPositions] = useState<string[]>([]);

    async function loadMatch() {
        const snap = await getDoc(doc(db, "matches", id));
        setMatch({ id: snap.id, ...snap.data() });
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

    if (!match) return <p>Cargando...</p>;

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


    type Position = "GK" | "DEF" | "MID" | "FWD";

    function getTeamSummary(players: any[]) {
        const totalLevel = players.reduce(
            (sum, p) => sum + (p.level ?? 0),
            0
        );

        const positionsCount: Record<Position, number> = {
            GK: 0,
            DEF: 0,
            MID: 0,
            FWD: 0,
        };

        players.forEach(p => {
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


    return (
        <AuthGuard>
            <main style={{ padding: 20 }}>
                <h1>Partido</h1>

                <p>
                    Link de invitación:
                    <input
                        value={`${window.location.origin}/join/${id}`}
                        readOnly
                        style={{ width: "100%" }}
                    />
                </p>

                <p>
                    {match.date} – {match.time}
                </p>
                <p>{match.location}</p>

                <hr />

                <h2>Jugadores</h2>

                {isOwner && !isClosed && (
                    <section style={{ marginBottom: 20 }}>
                        <h3>Agregar jugador</h3>

                        {/* USUARIO REGISTRADO */}
                        <div>
                            <select
                                value={selectedUid}
                                onChange={e => setSelectedUid(e.target.value)}
                            >
                                <option value="">Seleccionar usuario registrado</option>
                                {availableUsers.length === 0 && (
                                    <option disabled>
                                        Todos los usuarios ya están agregados
                                    </option>
                                )}
                                {availableUsers.map(u => (
                                    <option key={u.uid} value={u.uid}>
                                        {u.name}
                                    </option>
                                ))}
                            </select>

                            <button
                                onClick={async () => {
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
                                disabled={!selectedUid || availableUsers.length === 0}
                                style={{ marginLeft: 8 }}
                            >
                                Agregar usuario
                            </button>
                        </div>

                        <hr />

                        {/* INVITADO */}
                        <div style={{ marginTop: 10 }}>
                            <input
                                placeholder="Nombre invitado"
                                value={manualName}
                                onChange={e => setManualName(e.target.value)}
                            />

                            <select
                                value={manualLevel}
                                onChange={e => setManualLevel(Number(e.target.value))}
                                style={{ marginLeft: 6 }}
                            >
                                <option value={1}>Bajo</option>
                                <option value={2}>Medio</option>
                                <option value={3}>Alto</option>
                            </select>

                            {["GK", "DEF", "MID", "FWD"].map(pos => (
                                <label key={pos} style={{ marginLeft: 6 }}>
                                    <input
                                        type="checkbox"
                                        checked={manualPositions.includes(pos)}
                                        onChange={e => {
                                            const updated = e.target.checked
                                                ? [...manualPositions, pos]
                                                : manualPositions.filter(p => p !== pos);

                                            if (updated.length > 2) return;
                                            setManualPositions(updated);
                                        }}
                                    />
                                    {pos}
                                </label>
                            ))}

                            <button
                                onClick={async () => {
                                    const normalizedName =
                                        typeof manualName === "string"
                                            ? manualName.trim().toLowerCase()
                                            : "";

                                    if (!normalizedName) {
                                        alert("Ingresa un nombre válido");
                                        return;
                                    }

                                    const nameExists = match.players.some(
                                        (p: any) =>
                                            typeof p.name === "string" &&
                                            p.name.trim().toLowerCase() === normalizedName
                                    );

                                    if (nameExists) {
                                        alert("Ya existe un jugador con ese nombre");
                                        return;
                                    }

                                    await addPlayerToMatch(id, {
                                        name: manualName,
                                        level: manualLevel,
                                        positions: manualPositions,
                                    });

                                    setManualName("");
                                    setManualLevel(2);
                                    setManualPositions([]);
                                    loadMatch();
                                }}
                                disabled={!manualName}
                                style={{ marginLeft: 8 }}
                            >
                                Agregar invitado
                            </button>
                        </div>
                    </section>
                )}

                <ul>
                    {match.players?.map((p: any, i: number) => (
                        <li key={i} style={{ marginBottom: 16 }}>
                            <strong>{p.name}</strong> {p.confirmed ? "✅" : "❌"}

                            {/* CONFIRMAR / DESCONFIRMAR */}
                            {!isClosed && (
                                <>
                                    {p.confirmed ? (
                                        <button
                                            onClick={async () => {
                                                await unconfirmAttendance(id, p.name);
                                                loadMatch();
                                            }}
                                            style={{ marginLeft: 8 }}
                                        >
                                            Desconfirmar
                                        </button>
                                    ) : (
                                        <button
                                            onClick={async () => {
                                                await confirmAttendance(id, p.name);
                                                loadMatch();
                                            }}
                                            style={{ marginLeft: 8 }}
                                        >
                                            Confirmar
                                        </button>
                                    )}
                                </>
                            )}

                            {/* ELIMINAR JUGADOR (solo admin) */}
                            {isOwner && !isClosed && (
                                <button
                                    onClick={async () => {
                                        if (!confirm(`Eliminar a ${p.name} del partido?`)) return;
                                        await deletePlayerFromMatch(id, p.name);
                                        loadMatch();
                                    }}
                                    style={{
                                        marginLeft: 8,
                                        color: "red",
                                    }}
                                >
                                    Eliminar
                                </button>
                            )}

                            {/* NIVEL (solo admin, solo partido abierto) */}
                            {isOwner && !isClosed && (
                                <div style={{ marginTop: 6 }}>
                                    Nivel:
                                    <select
                                        value={p.level ?? 2}
                                        onChange={async e => {
                                            await updatePlayerData(id, p.name, {
                                                level: Number(e.target.value),
                                            });
                                            loadMatch();
                                        }}
                                        style={{ marginLeft: 6 }}
                                    >
                                        <option value={1}>Bajo</option>
                                        <option value={2}>Medio</option>
                                        <option value={3}>Alto</option>
                                    </select>
                                </div>
                            )}

                            {/* POSICIONES (solo admin, solo partido abierto) */}
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
                                            />
                                            {pos}
                                        </label>
                                    ))}
                                </div>
                            )}
                        </li>
                    ))}
                </ul>


                {isOwner && !isClosed && (
                    <button
                        onClick={async () => {
                            const confirmedPlayers = match.players
                                .filter((p: any) => p.confirmed)
                                .map((p: any) => ({
                                    name: p.name,
                                    level: p.level ?? 2,
                                    positions: p.positions ?? ["MID"],
                                }));

                            const result = balanceTeams(confirmedPlayers);

                            setBalanced(result);

                            // 🔥 guardar automáticamente (sobrescribe)
                            await saveTeams(id, {
                                A: result.teamA.players,
                                B: result.teamB.players,
                            });

                            await loadMatch();
                        }}
                    >
                        Balancear equipos
                    </button>
                )}

                {/* ACCIONES DE ESTADO DEL PARTIDO */}
                <div style={{ marginTop: 12 }}>
                    {isOwner && !isClosed && (
                        <button
                            onClick={async () => {
                                await closeMatch(id);
                                await loadMatch();
                            }}
                            style={{ marginRight: 8 }}
                        >
                            Cerrar partido 🔒
                        </button>
                    )}

                    {isOwner && isClosed && (
                        <button
                            onClick={async () => {
                                await reopenMatch(id);
                                await loadMatch();
                            }}
                        >
                            Reabrir partido 🔓
                        </button>
                    )}
                </div>



                {balanced && (
                    <section style={{ marginTop: 20 }}>
                        {(() => {
                            const summaryA = getTeamSummary(balanced.teamA.players);
                            const summaryB = getTeamSummary(balanced.teamB.players);

                            return (
                                <>
                                    {Math.abs(
                                        summaryA.totalLevel - summaryB.totalLevel
                                    ) >= 3 && (
                                            <p style={{ color: "orange" }}>
                                                ⚠️ Diferencia de nivel considerable
                                            </p>
                                        )}

                                    <h3>Equipo A</h3>
                                    <div>
                                        👥 {summaryA.count} · ⚡ {summaryA.totalLevel} · 🧤{" "}
                                        {summaryA.positionsCount.GK} 🛡{" "}
                                        {summaryA.positionsCount.DEF} ⚙{" "}
                                        {summaryA.positionsCount.MID} ⚽{" "}
                                        {summaryA.positionsCount.FWD}
                                    </div>

                                    <ul>
                                        {balanced.teamA.players.map((p: any, i: number) => (
                                            <li key={i}>
                                                {p.name} (Nivel {p.level})
                                            </li>
                                        ))}
                                    </ul>

                                    <h3>Equipo B</h3>
                                    <div>
                                        👥 {summaryB.count} · ⚡ {summaryB.totalLevel} · 🧤{" "}
                                        {summaryB.positionsCount.GK} 🛡{" "}
                                        {summaryB.positionsCount.DEF} ⚙{" "}
                                        {summaryB.positionsCount.MID} ⚽{" "}
                                        {summaryB.positionsCount.FWD}
                                    </div>

                                    <ul>
                                        {balanced.teamB.players.map((p: any, i: number) => (
                                            <li key={i}>
                                                {p.name} (Nivel {p.level})
                                            </li>
                                        ))}
                                    </ul>
                                </>
                            );
                        })()}
                    </section>
                )}
            </main>
        </AuthGuard>
    );
}
