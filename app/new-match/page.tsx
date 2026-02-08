"use client";

import { useAuth } from "@/lib/AuthContext";
import { createMatch } from "@/lib/matches";
import AuthGuard from "@/components/AuthGuard";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getUserProfile } from "@/lib/users";

export default function NewMatchPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(12);

  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    getUserProfile(user.uid).then(profile => {
      setUserProfile(profile);
      setLoading(false);
    });
  }, [user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    await createMatch({
      date,
      time,
      location,
      createdBy: user.uid,
      maxPlayers, // 👈 nuevo campo
    });

    router.push("/");
  }

  if (loading) {
    return (
      <AuthGuard>
        <p style={{ padding: 20 }}>Cargando...</p>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <main style={{ padding: 20, maxWidth: 480, margin: "0 auto" }}>
        <h2 style={{ marginBottom: 16 }}>➕ Nuevo partido</h2>

        {userProfile?.role !== "admin" && (
          <p style={{ color: "#dc2626" }}>
            No tienes permisos para crear partidos.
          </p>
        )}

        {userProfile?.role === "admin" && (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 12 }}>
              <label>Fecha</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                required
                style={{ width: "100%", padding: 8 }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label>Hora</label>
              <input
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                required
                style={{ width: "100%", padding: 8 }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label>Cancha</label>
              <input
                placeholder="Ej: Palmas Pance"
                value={location}
                onChange={e => setLocation(e.target.value)}
                required
                style={{ width: "100%", padding: 8 }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label>Máximo de jugadores</label>
              <input
                type="number"
                min={2}
                max={30}
                value={maxPlayers}
                onChange={e => setMaxPlayers(Number(e.target.value))}
                style={{ width: "100%", padding: 8 }}
              />
              <p style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                Este valor se podrá modificar luego si es necesario.
              </p>
            </div>

            <button
              type="submit"
              style={{
                width: "100%",
                padding: "12px",
                background: "#16a34a",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 16,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Crear partido
            </button>
          </form>
        )}
      </main>
    </AuthGuard>
  );
}
