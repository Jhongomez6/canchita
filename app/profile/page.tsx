"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { enablePushNotifications } from "@/lib/push";
import { getUserProfile, updateUserPositions } from "@/lib/users";
import { useRouter } from "next/navigation";

const POSITIONS = ["GK", "DEF", "MID", "FWD"];

const POSITION_LABELS: Record<string, string> = {
  GK: "Portero",
  DEF: "Defensa",
  MID: "Mediocampista",
  FWD: "Delantero",
};

export default function ProfilePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [positions, setPositions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [enablingPush, setEnablingPush] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [returnToMatch, setReturnToMatch] = useState<string | null>(null);



  useEffect(() => {
    if (!user) return;

    // Verificar si hay un partido guardado para volver
    if (typeof window !== "undefined") {
      const matchId = localStorage.getItem("returnToMatch");
      if (matchId) {
        setReturnToMatch(matchId);
      }
    }

    getUserProfile(user.uid)
      .then(profile => {
        if (profile?.positions) {
          setPositions(profile.positions);
        }
        if (profile?.notificationsEnabled) {
          setPushEnabled(true);
        }
        setLoading(false);
      })
      .catch(error => {
        console.error("Error cargando perfil:", error);
        // Si hay error, asumimos que es un perfil nuevo sin posiciones
        setPositions([]);
        setLoading(false);
      });

  }, [user]);

  if (!user) return <p>Debes iniciar sesión</p>;
  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(135deg, #1f7a4f 0%, #145c3a 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 24,
            padding: "48px 40px",
            maxWidth: 440,
            width: "100%",
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: 18, color: "#666" }}>Cargando perfil...</p>
        </div>
      </div>
    );
  }
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
              Dinos en qué posiciones te sientes más cómodo(a) jugando.
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

          <p style={{ fontSize: 14, color: "#555", marginBottom: 8 }}>
            Selecciona hasta 2 posiciones donde te sientes cómodo(a) jugando
          </p>
          <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 16, fontStyle: "italic" }}>
            💡 Haz click de nuevo para deseleccionar
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
                    transition: "all 0.2s ease",
                  }}
                >
                  <span style={{ color: selected ? "#1f7a4f" : "#374151" }}>
                    {POSITION_LABELS[pos]}
                  </span>

                  {selected && (
                    <span style={{ fontSize: 18, color: "#1f7a4f" }}>✔</span>
                  )}

                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={async e => {
                      let updated: string[];
                      
                      if (e.target.checked) {
                        // Si ya hay 2 seleccionadas, eliminar la primera y agregar la nueva
                        if (positions.length >= 2) {
                          updated = [...positions.slice(1), pos];
                        } else {
                          updated = [...positions, pos];
                        }
                      } else {
                        // Deseleccionar
                        updated = positions.filter(p => p !== pos);
                      }

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

          {/* CTA CONTINUAR */}
          {!isOnboarding && positions.length > 0 && (
            <><button
              onClick={() => {
                if (returnToMatch) {
                  // Limpiar localStorage y volver al partido
                  localStorage.removeItem("returnToMatch");
                  router.push(`/join/${returnToMatch}`);
                } else {
                  // Si no hay partido guardado, ir al home
                  router.push("/");
                }
              }}
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
                cursor: "pointer",
              }}
            >
              {returnToMatch ? "Volver al partido" : "Ver mis partidos"}
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
