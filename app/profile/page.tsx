"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { enablePushNotifications } from "@/lib/push";
import { getUserProfile, updateUserPositions } from "@/lib/users";

const POSITIONS = ["GK", "DEF", "MID", "FWD"];

export default function ProfilePage() {
  const { user } = useAuth();
  const [positions, setPositions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);


  useEffect(() => {
    if (!user) return;

    getUserProfile(user.uid).then(profile => {
      if (profile?.positions) {
        setPositions(profile.positions);
      }
      setLoading(false);
    });
  }, [user]);

  if (!user) return <p>Debes iniciar sesión</p>;
  if (loading) return <p>Cargando perfil...</p>;
  const isOnboarding = positions.length === 0;

return (
  <main
    style={{
      minHeight: "100vh",
      background: "#f2f5f3",
      paddingBottom: 24,
    }}
  >
    <div style={{ maxWidth: 420, margin: "0 auto", padding: 16 }}>
      {/* ONBOARDING CARD */}
      {isOnboarding && (
        <div
          style={{
            background: "linear-gradient(180deg, #1f7a4f, #145c3a)",
            color: "#fff",
            padding: 20,
            borderRadius: 16,
            marginBottom: 20,
            boxShadow: "0 8px 20px rgba(0,0,0,0.15)",
          }}
        >
          <h2 style={{ marginBottom: 8 }}>
            👋 Completa tu perfil
          </h2>
          <p style={{ fontSize: 14, opacity: 0.9 }}>
            Dinos en qué posiciones te sientes más cómodo jugando.
            <br />
            (Máximo 2)
          </p>
        </div>
      )}

      {/* CARD PERFIL */}
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: 20,
          boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
        }}
      >
        <h1 style={{ marginBottom: 4 }}>
          {isOnboarding ? "Tu perfil" : "Editar perfil"}
        </h1>

        <p style={{ fontSize: 14, color: "#555", marginBottom: 16 }}>
          Selecciona hasta 2 posiciones donde te sientes cómodo jugando
        </p>

        {/* POSICIONES */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          {POSITIONS.map(pos => {
            const selected = positions.includes(pos);

            return (
              <label
                key={pos}
                style={{
                  border: selected
                    ? "2px solid #1f7a4f"
                    : "1px solid #ddd",
                  borderRadius: 12,
                  padding: 14,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: selected ? "#e6f6ed" : "#fff",
                  fontWeight: 600,
                }}
              >
                <span>{pos}</span>

                <input
                  type="checkbox"
                  checked={selected}
                  onChange={async e => {
                    let updated = e.target.checked
                      ? [...positions, pos]
                      : positions.filter(p => p !== pos);

                    if (updated.length > 2) return;

                    setPositions(updated);
                    await updateUserPositions(user.uid, updated);
                    setSaved(true);
                    setTimeout(() => setSaved(false), 2000);
                  }}
                  style={{ display: "none" }}
                />
              </label>
            );
          })}
        </div>

        {/* FEEDBACK GUARDADO */}
        {saved && (
          <div
            style={{
              marginTop: 16,
              background: "#e6f6ed",
              color: "#145c3a",
              padding: 12,
              borderRadius: 12,
              textAlign: "center",
              fontWeight: 600,
            }}
          >
            ✔ Perfil guardado
          </div>
        )}

        {/* CTA CONTINUAR */}
        {!isOnboarding && positions.length > 0 && (
          <><button
            onClick={() => window.history.back()}
            style={{
              marginTop: 20,
              width: "100%",
              padding: "14px",
              background: "#1f7a4f",
              color: "#fff",
              borderRadius: 12,
              border: "none",
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            Continuar
          </button>
          <button
            onClick={() => enablePushNotifications(user.uid)}
          >
              🔔 Activar recordatorios
            </button></>
        )}
      </div>
    </div>
  </main>
);

}
