"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { loginWithGoogle } from "@/lib/auth";
import { joinMatch, unconfirmAttendance } from "@/lib/matches";


export default function JoinMatchPage() {
    const { id } = useParams<{ id: string }>();
    const { user, loading } = useAuth();

    const [match, setMatch] = useState<any | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [joined, setJoined] = useState(false);

    async function loadMatch() {
        try {
            const ref = doc(db, "matches", id);
            const snap = await getDoc(ref);

            if (!snap.exists()) {
                setError("El partido no existe");
                return;
            }

            setMatch({ id: snap.id, ...snap.data() });
        } catch (e) {
            console.error(e);
            setError("No se pudo cargar el partido");
        }
    }

    // 👇 SOLO cargar cuando Auth terminó Y el usuario está logueado
    useEffect(() => {
        if (!loading && user) {
            loadMatch();
        }
    }, [loading, user]);

    async function handleJoin() {
        if (!user) return;
        await joinMatch(id, user.displayName || "Jugador");
        setJoined(true);
    }

    // ⏳ Esperando a que Auth cargue
    if (loading) {
        return <p style={{ padding: 20 }}>Cargando sesión...</p>;
    }

    // 🔐 No logueado
    if (!user) {
        return (
            <main style={{ padding: 20 }}>
                <h2>Únete al partido</h2>
                <p>Debes iniciar sesión para continuar</p>
                <button onClick={loginWithGoogle}>
                    Iniciar sesión con Google
                </button>
            </main>
        );
    }

    // ❌ Error real (no infinito)
    if (error) {
        return (
            <main style={{ padding: 20 }}>
                <p>{error}</p>
            </main>
        );
    }

    // ⏳ Cargando partido (real)
    if (!match) {
        return <p style={{ padding: 20 }}>Cargando partido...</p>;
    }

    const playerName = user?.displayName || "Jugador";

    const existingPlayer = match.players?.find(
        (p: any) => p.name === playerName
    );


    // ✅ Partido cargado
    return (
        <main style={{ padding: 20 }}>
            <h1>{match.location}</h1>
            <p>
                {match.date} – {match.time}
            </p>

            {!existingPlayer && (
                <button
                    onClick={async () => {
                        await joinMatch(id, playerName);
                        await loadMatch();
                    }}
                >
                    Confirmar asistencia
                </button>
            )}

            {existingPlayer && existingPlayer.confirmed && (
                <>
                    <p>✅ Ya estás confirmado</p>
                    <button
                        onClick={async () => {
                            await unconfirmAttendance(id, playerName);
                            await loadMatch();
                        }}
                    >
                        Cancelar asistencia
                    </button>
                </>
            )}

            {existingPlayer && !existingPlayer.confirmed && (
                <button
                    onClick={async () => {
                        await joinMatch(id, playerName);
                        await loadMatch();
                    }}
                >
                    Confirmar asistencia
                </button>
            )}
        </main>
    );
}
