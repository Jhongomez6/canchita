"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import AuthGuard from "@/components/AuthGuard";
import {
    addPlayerToMatch,
    removePlayerFromMatch,
} from "@/lib/matches";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useParams } from "next/navigation";
import { confirmAttendance } from "@/lib/matches";


type Player = {
    name: string;
    confirmed: boolean;
};

export default function MatchDetailPage() {
    const { id } = useParams<{ id: string }>();
    const { user } = useAuth();
    const [match, setMatch] = useState<any>(null);
    const [playerName, setPlayerName] = useState("");

    async function loadMatch() {
        const snap = await getDoc(doc(db, "matches", id));
        setMatch({ id: snap.id, ...snap.data() });
    }

    async function addPlayer(e: React.FormEvent) {
        e.preventDefault();
        if (!playerName) return;

        await addPlayerToMatch(id, playerName);
        setPlayerName("");
        loadMatch();
    }

    async function removePlayer(player: Player) {
        await removePlayerFromMatch(id, player);
        loadMatch();
    }

    useEffect(() => {
        loadMatch();
    }, []);

    if (!match) return <p>Cargando...</p>;

    return (
        <AuthGuard>
            <main style={{ padding: 20 }}>
                <h1>Partido</h1>
                <p>
                    Link de invitación:
                    <br />
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

                <form onSubmit={addPlayer}>
                    <input
                        placeholder="Nombre del jugador"
                        value={playerName}
                        onChange={e => setPlayerName(e.target.value)}
                    />
                    <button type="submit">Agregar</button>
                </form>

                <ul>
                    {match.players?.map((p: any, i: number) => (
                        <li key={i}>
                            {p.name} {p.confirmed ? "✅" : "❌"}

                            {!p.confirmed && (
                                <button
                                    onClick={async () => {
                                        await confirmAttendance(id, p.name);
                                        await loadMatch();
                                    }}
                                    style={{ marginLeft: 8 }}
                                >
                                    Confirmar
                                </button>

                            )}
                        </li>
                    ))}
                </ul>
            </main>
        </AuthGuard>
    );
}
