"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { enablePushNotifications } from "@/lib/push";
import { getUserProfile, updateUserPositions, updateUserName } from "@/lib/users";
import { useRouter } from "next/navigation";
import type { Position } from "@/lib/domain/player";
import { ALLOWED_POSITIONS, POSITION_LABELS, POSITION_ICONS } from "@/lib/domain/player";
import type { UserStats } from "@/lib/domain/user";


export default function ProfilePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [positions, setPositions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [nameSaved, setNameSaved] = useState(false);
  const [positionsSaved, setPositionsSaved] = useState(false);
  const [savingPositions, setSavingPositions] = useState(false);
  const [enablingPush, setEnablingPush] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [returnToMatch, setReturnToMatch] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameLastChanged, setNameLastChanged] = useState<string | null>(null);
  const [stats, setStats] = useState<UserStats>({ played: 0, won: 0, lost: 0, draw: 0 });



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
        setDisplayName(profile?.name || user.displayName || "");
        if ((profile as any)?.nameLastChanged) {
          setNameLastChanged((profile as any).nameLastChanged);
        }
        if (profile?.stats) {
          setStats({
            played: Math.max(0, profile.stats.played ?? 0),
            won: Math.max(0, profile.stats.won ?? 0),
            lost: Math.max(0, profile.stats.lost ?? 0),
            draw: Math.max(0, profile.stats.draw ?? 0),
          });
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

  if (!user) {
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
          <p style={{ fontSize: 18, color: "#666" }}>Debes iniciar sesión</p>
        </div>
      </div>
    );
  }

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
          <h1 style={{ marginBottom: 16 }}>
            {isOnboarding ? "Tu perfil" : "Editar perfil"}
          </h1>

          {/* NOMBRE */}
          {(() => {
            const COOLDOWN_DAYS = 30;
            let daysRemaining = 0;
            let nextChangeDate = "";
            if (nameLastChanged) {
              const lastChanged = new Date(nameLastChanged);
              const now = new Date();
              const diffMs = now.getTime() - lastChanged.getTime();
              const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
              daysRemaining = Math.max(0, COOLDOWN_DAYS - diffDays);
              if (daysRemaining > 0) {
                const next = new Date(lastChanged);
                next.setDate(next.getDate() + COOLDOWN_DAYS);
                nextChangeDate = next.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
              }
            }
            const canChangeName = daysRemaining === 0;

            return (
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
                  📝 Tu nombre
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="text"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    disabled={!canChangeName}
                    placeholder="Tu nombre"
                    style={{
                      flex: 1,
                      padding: "10px 14px",
                      border: "1px solid #ddd",
                      borderRadius: 10,
                      fontSize: 15,
                      outline: "none",
                      background: canChangeName ? "#fff" : "#f3f4f6",
                      color: canChangeName ? "#111" : "#9ca3af",
                    }}
                  />
                  {canChangeName && (
                    <button
                      disabled={savingName || !displayName.trim()}
                      onClick={async () => {
                        const trimmed = displayName.trim();
                        if (!trimmed || trimmed.length < 2) return;
                        setSavingName(true);
                        try {
                          await updateUserName(user.uid, trimmed);
                          setNameLastChanged(new Date().toISOString());
                          setNameSaved(true);
                          setTimeout(() => setNameSaved(false), 2000);
                        } finally {
                          setSavingName(false);
                        }
                      }}
                      style={{
                        padding: "10px 16px",
                        background: savingName ? "#9ca3af" : "#1f7a4f",
                        color: "#fff",
                        border: "none",
                        borderRadius: 10,
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: savingName ? "default" : "pointer",
                      }}
                    >
                      {savingName ? "..." : "Guardar"}
                    </button>
                  )}
                </div>
                {nameSaved && (
                  <p style={{ color: "#16a34a", fontSize: 12, marginTop: 6, fontWeight: 600 }}>✅ Nombre guardado</p>
                )}
                {canChangeName && displayName.trim().length > 0 && displayName.trim().length < 2 && (
                  <p style={{ color: "#dc2626", fontSize: 12, marginTop: 6 }}>Mínimo 2 caracteres</p>
                )}
                {!canChangeName && (
                  <p style={{ color: "#92400e", fontSize: 12, marginTop: 6 }}>
                    🔒 Podrás cambiar tu nombre el {nextChangeDate} ({daysRemaining} días restantes)
                  </p>
                )}
              </div>
            );
          })()}

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
            {ALLOWED_POSITIONS.map((pos: Position) => {
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
                    cursor: savingPositions ? "wait" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: selected ? "#e6f6ed" : "#fff",
                    fontWeight: 600,
                    transition: "all 0.2s ease",
                    opacity: savingPositions ? 0.6 : 1,
                    pointerEvents: savingPositions ? "none" : "auto",
                  }}
                >
                  <span style={{ color: selected ? "#1f7a4f" : "#374151" }}>
                    {POSITION_ICONS[pos]} {POSITION_LABELS[pos]}
                  </span>

                  {selected && (
                    <span style={{ fontSize: 18, color: "#1f7a4f" }}>✔</span>
                  )}

                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={savingPositions}
                    onChange={async e => {
                      let updated: string[];

                      if (e.target.checked) {
                        if (positions.length >= 2) {
                          updated = [...positions.slice(1), pos];
                        } else {
                          updated = [...positions, pos];
                        }
                      } else {
                        updated = positions.filter(p => p !== pos);
                      }

                      setPositions(updated);
                      setSavingPositions(true);
                      try {
                        await updateUserPositions(user.uid, updated);
                        setPositionsSaved(true);
                        setTimeout(() => setPositionsSaved(false), 2000);
                      } finally {
                        setSavingPositions(false);
                      }
                    }}
                    style={{ display: "none" }}
                  />
                </label>
              );
            })}
          </div>
          {positionsSaved && (
            <p style={{ color: "#16a34a", fontSize: 12, marginTop: 8, textAlign: "center", fontWeight: 600 }}>✅ Posiciones guardadas</p>
          )}

          {/* ESTADÍSTICAS */}
          {!isOnboarding && (
            <div style={{ marginTop: 20, padding: 16, borderRadius: 12, background: "#f8fafc", border: "1px solid #e5e7eb" }}>
              <h3 style={{ marginBottom: 12, fontSize: 15, fontWeight: 700, color: "#374151" }}>📊 Mis Estadísticas</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, textAlign: "center" }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#374151" }}>{stats.played}</div>
                  <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>PJ</div>
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#16a34a" }}>{stats.won}</div>
                  <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>PG</div>
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#ca8a04" }}>{stats.draw}</div>
                  <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>PE</div>
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#dc2626" }}>{stats.lost}</div>
                  <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>PP</div>
                </div>
              </div>
            </div>
          )}

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
