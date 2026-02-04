"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { joinMatch } from "@/lib/matches";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { loginWithGoogle } from "@/lib/auth";

export default function JoinMatchPage() {
    const { id } = useParams<{ id: string }>();
    const { user, loading } = useAuth();
    const [match, setMatch] = useState<any>(null);
    const [joined, setJoined] = useState(false);

    async function loadMatch() {
        const snap = await getDoc(doc(db, "matches", id));
        if (snap.exists()) {
            setMatch(snap.data());
        }
    }

    async function handleJoin() {
        if (!user) return;
        await joinMatch(id, user.displayName || "Jugador");
        setJoined(true);
    }

    useEffect(() => {
        if (!loading) {
            loadMatch();
        }
    }, [loading]);


    if (!match) return <p>Cargando partido...</p>;

    if (loading) return <p>Cargando sesión...</p>;

    if (!user) {
        return (
            <main style={{ padding: 20 }}>
                <h1>{match.location}</h1>
                <p>{match.date} – {match.time}</p>

                <button onClick={loginWithGoogle}>
                    Inicia sesión para confirmar
                </button>
            </main>
        );
    }

    return (
        <main style={{ padding: 20 }}>
            <h1>{match.location}</h1>
            <p>{match.date} – {match.time}</p>

            {!joined ? (
                <button onClick={handleJoin}>
                    Confirmar asistencia
                </button>
            ) : (
                <p>✅ Ya estás confirmado</p>
            )}
        </main>
    );
}
