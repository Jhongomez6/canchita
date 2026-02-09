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
  const [enablingPush, setEnablingPush] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);



  useEffect(() => {
    if (!user) return;

    getUserProfile(user.uid).then(profile => {
      if (profile?.positions) {
        setPositions(profile.positions);
      }
      if (profile?.notificationsEnabled) {
        setPushEnabled(true);
      }
      setLoading(false);
    });

  }, [user]);

  if (!user) return <p>Debes iniciar sesión</p>;
  if (loading) return <p>Cargando perfil...</p>;
  const isOnboarding = positions.length === 0;
  const isPushEnabledOnThisDevice =
    typeof window !== "undefined" &&
    localStorage.getItem("push-enabled") === "true";


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
              {/* RECORDATORIOS */}
              <div
                style={{
                  marginTop: 24,
                  padding: 16,
                  borderRadius: 16,
                  background: isPushEnabledOnThisDevice
                    ? "#ecfdf5"
                    : "#f8fafc",
                  border: isPushEnabledOnThisDevice
                    ? "1px solid #bbf7d0"
                    : "1px solid #e5e7eb",
                }}
              >
                <h3 style={{ marginBottom: 6 }}>
                  🔔 Recordatorios de partidos
                </h3>

                <p style={{ fontSize: 14, color: "#555", marginBottom: 12 }}>
                  Te avisaremos <strong>24h, 12h y 6h antes</strong> del partido
                  si aún no confirmas asistencia.
                </p>

                <button
                  onClick={async () => {
                    setEnablingPush(true);
                    try {
                      const token = await enablePushNotifications(user.uid);

                      if (token) {
                        localStorage.setItem("push-enabled", "true");
                        setPushEnabled(true);
                      }
                    } finally {
                      setEnablingPush(false);
                    }
                  }}
                  disabled={isPushEnabledOnThisDevice || enablingPush}
                  style={{
                    width: "100%",
                    padding: "14px",
                    background: isPushEnabledOnThisDevice
                      ? "#16a34a"
                      : enablingPush
                        ? "#9ca3af"
                        : "#1f7a4f",
                    color: "#fff",
                    borderRadius: 14,
                    border: "none",
                    fontSize: 16,
                    fontWeight: 700,
                    cursor:
                      isPushEnabledOnThisDevice || enablingPush
                        ? "default"
                        : "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  {isPushEnabledOnThisDevice
                    ? "✅ Recordatorios activos"
                    : enablingPush
                      ? "⏳ Activando recordatorios..."
                      : "🔔 Activar recordatorios"}
                </button>
                {pushEnabled && !isPushEnabledOnThisDevice && (
                  <p
                    style={{
                      marginTop: 10,
                      fontSize: 13,
                      color: "#92400e",
                      textAlign: "center",
                    }}
                  >
                    ⚠️ Ya tienes recordatorios activos en otro dispositivo.
                    <br />
                    Actívalos aquí si también quieres recibirlos en este.
                  </p>
                )}


                {isPushEnabledOnThisDevice && (
                  <p
                    style={{
                      marginTop: 10,
                      fontSize: 13,
                      color: "#166534",
                      textAlign: "center",
                    }}
                  >
                    Este dispositivo recibirá notificaciones automáticas 📲
                  </p>
                )}
              </div>

            </>
          )}
        </div>
      </div>
    </main>
  );

}
