"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { enablePushNotifications } from "@/lib/push";
import { getUserProfile, updateUserPositions, updateUserName, updatePlayerAttributes, requestReEvaluation } from "@/lib/users";
import { useRouter } from "next/navigation";
import type { Position } from "@/lib/domain/player";
import { ALLOWED_POSITIONS, POSITION_LABELS, POSITION_ICONS } from "@/lib/domain/player";
import type { UserStats } from "@/lib/domain/user";
import type { Foot, CourtSize } from "@/lib/domain/rating";

const FOOT_LABELS: Record<string, string> = { left: "Izquierdo", right: "Derecho", ambidextrous: "Ambidiestro" };
const LEVEL_LABELS = ["", "B\u00e1sico", "Intermedio", "Avanzado"];
const LEVEL_EMOJIS = ["", "\uD83C\uDF31", "\u26A1", "\uD83D\uDD25"];

export default function ProfilePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  // Profile data
  const [displayName, setDisplayName] = useState("");
  const [positions, setPositions] = useState<string[]>([]);
  const [level, setLevel] = useState<number | null>(null);
  const [age, setAge] = useState<number | null>(null);
  const [dominantFoot, setDominantFoot] = useState<Foot | null>(null);
  const [preferredCourt, setPreferredCourt] = useState<CourtSize | null>(null);
  const [stats, setStats] = useState<UserStats>({ played: 0, won: 0, lost: 0, draw: 0 });
  const [onboardingCompletedAt, setOnboardingCompletedAt] = useState<string | null>(null);
  const [nameLastChanged, setNameLastChanged] = useState<string | null>(null);

  // UI state
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [requestingReeval, setRequestingReeval] = useState(false);

  // Edit buffers
  const [editName, setEditName] = useState("");
  const [editPositions, setEditPositions] = useState<string[]>([]);
  const [editFoot, setEditFoot] = useState<Foot | null>(null);
  const [editCourt, setEditCourt] = useState<CourtSize | null>(null);

  // Push notifications
  const [enablingPush, setEnablingPush] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [returnToMatch, setReturnToMatch] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    if (typeof window !== "undefined") {
      const matchId = localStorage.getItem("returnToMatch");
      if (matchId) setReturnToMatch(matchId);
    }

    getUserProfile(user.uid)
      .then(profile => {
        if (profile?.positions) setPositions(profile.positions);
        if (profile?.notificationsEnabled) setPushEnabled(true);
        setDisplayName(profile?.name || user.displayName || "");
        if ((profile as any)?.nameLastChanged) setNameLastChanged((profile as any).nameLastChanged);
        if (profile?.stats) {
          setStats({
            played: Math.max(0, profile.stats.played ?? 0),
            won: Math.max(0, profile.stats.won ?? 0),
            lost: Math.max(0, profile.stats.lost ?? 0),
            draw: Math.max(0, profile.stats.draw ?? 0),
          });
        }
        if (profile?.level != null) setLevel(profile.level);
        if (profile?.onboardingCompletedAt) setOnboardingCompletedAt(profile.onboardingCompletedAt);
        if (profile?.age != null) setAge(profile.age);
        if (profile?.dominantFoot) setDominantFoot(profile.dominantFoot);
        if (profile?.preferredCourt) setPreferredCourt(profile.preferredCourt);
        setLoading(false);
      })
      .catch(() => {
        setPositions([]);
        setLoading(false);
      });
  }, [user]);

  // Derived
  const isOnboarding = positions.length === 0;
  const isPushOnDevice = typeof window !== "undefined" && localStorage.getItem("push-enabled") === "true";

  // Name cooldown
  const COOLDOWN_DAYS = 30;
  let nameDaysLeft = 0;
  let nameUnlockDate = "";
  if (nameLastChanged) {
    const diff = Math.floor((Date.now() - new Date(nameLastChanged).getTime()) / 86400000);
    nameDaysLeft = Math.max(0, COOLDOWN_DAYS - diff);
    if (nameDaysLeft > 0) {
      const d = new Date(nameLastChanged);
      d.setDate(d.getDate() + COOLDOWN_DAYS);
      nameUnlockDate = d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
    }
  }
  const canEditName = nameDaysLeft === 0;

  // Re-eval cooldown
  const REEVAL_DAYS = 90;
  let reevalDaysLeft = 0;
  let reevalUnlockDate = "";
  if (onboardingCompletedAt) {
    const diff = Math.floor((Date.now() - new Date(onboardingCompletedAt).getTime()) / 86400000);
    reevalDaysLeft = Math.max(0, REEVAL_DAYS - diff);
    if (reevalDaysLeft > 0) {
      const d = new Date(onboardingCompletedAt);
      d.setDate(d.getDate() + REEVAL_DAYS);
      reevalUnlockDate = d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
    }
  }

  function startEditing() {
    setEditName(displayName);
    setEditPositions([...positions]);
    setEditFoot(dominantFoot);
    setEditCourt(preferredCourt);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
  }

  async function saveAll() {
    if (!user) return;
    setSaving(true);
    try {
      const trimmedName = editName.trim();
      if (canEditName && trimmedName.length >= 2 && trimmedName !== displayName) {
        await updateUserName(user.uid, trimmedName);
        setDisplayName(trimmedName);
        setNameLastChanged(new Date().toISOString());
      }
      if (JSON.stringify(editPositions) !== JSON.stringify(positions)) {
        await updateUserPositions(user.uid, editPositions);
        setPositions(editPositions);
      }
      const attrUpdate: { dominantFoot?: string; preferredCourt?: string } = {};
      if (editFoot && editFoot !== dominantFoot) attrUpdate.dominantFoot = editFoot;
      if (editCourt && editCourt !== preferredCourt) attrUpdate.preferredCourt = editCourt;
      if (Object.keys(attrUpdate).length > 0) {
        await updatePlayerAttributes(user.uid, attrUpdate);
        if (editFoot) setDominantFoot(editFoot);
        if (editCourt) setPreferredCourt(editCourt);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  // ======== RENDER ========

  if (!user) {
    return (
      <div style={{ minHeight: "100vh", background: "#f2f5f3", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ fontSize: 18, color: "#666" }}>Debes iniciar sesi&oacute;n</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#f2f5f3", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ fontSize: 18, color: "#666" }}>Cargando perfil...</p>
      </div>
    );
  }

  const chip = (active: boolean): React.CSSProperties => ({
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
    background: active ? "#e6f6ed" : "#f3f4f6",
    color: active ? "#1f7a4f" : "#6b7280",
    border: active ? "1px solid #bbf7d0" : "1px solid #e5e7eb",
  });

  const row = (label: string, value: React.ReactNode): React.ReactNode => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
      <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>{value}</span>
    </div>
  );

  return (
    <main style={{ minHeight: "100vh", background: "#f2f5f3", paddingBottom: 24 }}>
      <div style={{ maxWidth: 420, margin: "0 auto", padding: 16 }}>

        {/* Onboarding banner */}
        {isOnboarding && (
          <div style={{ background: "linear-gradient(180deg, #1f7a4f, #145c3a)", color: "#fff", padding: 20, borderRadius: 16, marginBottom: 16, boxShadow: "0 8px 20px rgba(0,0,0,0.15)" }}>
            <h2 style={{ marginBottom: 8 }}>{"👋"} Completa tu perfil</h2>
            <p style={{ fontSize: 14, opacity: 0.9 }}>Selecciona tus posiciones para unirte a partidos.</p>
          </div>
        )}

        {/* ========================= */}
        {/*    FICHA T&Eacute;CNICA   */}
        {/* ========================= */}
        <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }}>

          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1f1f1f", margin: 0 }}>{"🏅"} Ficha T{"é"}cnica</h2>
            {!isOnboarding && !editing && (
              <button
                onClick={startEditing}
                style={{ background: "none", border: "1px solid #ddd", borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 600, color: "#1f7a4f", cursor: "pointer" }}
              >
                {"✏️"} Editar
              </button>
            )}
          </div>

          {saved && (
            <p style={{ color: "#16a34a", fontSize: 12, fontWeight: 600, textAlign: "center", marginBottom: 8 }}>{"✅"} Cambios guardados</p>
          )}

          {/* =================== */}
          {/*     VIEW MODE       */}
          {/* =================== */}
          {!editing ? (
            <>
              {/* Info rows: Name, Age, Positions, Foot, Court */}
              {row("Nombre", displayName || "—")}
              {age != null && row("Edad", `${age} a\u00f1os`)}
              {row("Posiciones", positions.length > 0
                ? <span style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {positions.map(p => <span key={p} style={chip(true)}>{POSITION_ICONS[p as Position]} {POSITION_LABELS[p as Position]}</span>)}
                </span>
                : <span style={{ color: "#9ca3af" }}>Sin seleccionar</span>
              )}
              {dominantFoot && row("Pie dominante", FOOT_LABELS[dominantFoot] || dominantFoot)}
              {preferredCourt && row("Cancha preferida", preferredCourt)}

              {/* Level badge — below court */}
              {level != null && (
                <div style={{ background: "linear-gradient(135deg, #1f7a4f, #145c3a)", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, marginTop: 14, color: "#fff" }}>
                  <span style={{ fontSize: 32 }}>{LEVEL_EMOJIS[level]}</span>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>Nivel {level} — {LEVEL_LABELS[level]}</div>
                    <div style={{ fontSize: 11, opacity: 0.8 }}>{"Autoevaluaci\u00f3n de onboarding"}</div>
                  </div>
                </div>
              )}

              {/* Re-evaluation */}
              {level != null && (
                <div style={{ marginTop: 10, textAlign: "center" }}>
                  {reevalDaysLeft === 0 ? (
                    <button
                      disabled={requestingReeval}
                      onClick={async () => {
                        setRequestingReeval(true);
                        try {
                          await requestReEvaluation(user.uid);
                          router.push("/onboarding");
                        } catch { setRequestingReeval(false); }
                      }}
                      style={{ padding: "8px 16px", background: "#f59e0b", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                    >
                      {requestingReeval ? "Redirigiendo..." : "Nueva autoevaluaci\u00f3n"}
                    </button>
                  ) : (
                    <p style={{ fontSize: 11, color: "#92400e" }}>
                      {"🔒"} Nueva autoevaluaci{"ó"}n disponible el {reevalUnlockDate} ({reevalDaysLeft}d)
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            /* =================== */
            /*     EDIT MODE       */
            /* =================== */
            <>
              {/* Name */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 4 }}>Nombre</label>
                {canEditName ? (
                  <>
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      placeholder="Tu nombre"
                      style={{ width: "100%", padding: "10px 14px", border: "1px solid #ddd", borderRadius: 10, fontSize: 15, outline: "none", boxSizing: "border-box" }}
                    />
                    {editName.trim().length > 0 && editName.trim().length < 2 && (
                      <p style={{ color: "#dc2626", fontSize: 11, marginTop: 4 }}>{"Mínimo 2 caracteres"}</p>
                    )}
                  </>
                ) : (
                  <div style={{ padding: "10px 14px", background: "#f3f4f6", borderRadius: 10, fontSize: 15, color: "#9ca3af" }}>
                    {displayName} <span style={{ fontSize: 11 }}>{"🔒"} cambio el {nameUnlockDate}</span>
                  </div>
                )}
              </div>

              {/* Positions */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 4 }}>Posiciones <span style={{ fontWeight: 400, fontStyle: "italic" }}>(m{"á"}x. 2)</span></label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {ALLOWED_POSITIONS.map((pos: Position) => {
                    const sel = editPositions.includes(pos);
                    return (
                      <button
                        key={pos}
                        onClick={() => {
                          if (sel) {
                            setEditPositions(editPositions.filter(p => p !== pos));
                          } else if (editPositions.length >= 2) {
                            setEditPositions([editPositions[1], pos]);
                          } else {
                            setEditPositions([...editPositions, pos]);
                          }
                        }}
                        style={{
                          padding: "10px 8px",
                          borderRadius: 10,
                          border: sel ? "2px solid #1f7a4f" : "1px solid #e5e7eb",
                          background: sel ? "#e6f6ed" : "#fff",
                          fontWeight: 600,
                          fontSize: 13,
                          color: sel ? "#1f7a4f" : "#374151",
                          cursor: "pointer",
                          transition: "all 0.15s",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 4,
                        }}
                      >
                        {POSITION_ICONS[pos]} {POSITION_LABELS[pos]}
                        {sel && <span style={{ marginLeft: 2 }}>{"✔"}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Foot */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 4 }}>Pie dominante</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {(["left", "right", "ambidextrous"] as Foot[]).map(f => {
                    const active = editFoot === f;
                    return (
                      <button
                        key={f}
                        onClick={() => setEditFoot(f)}
                        style={{ flex: 1, padding: "8px 4px", borderRadius: 8, border: active ? "2px solid #1f7a4f" : "1px solid #e5e7eb", background: active ? "#e6f6ed" : "#fff", color: active ? "#1f7a4f" : "#6b7280", fontWeight: 600, fontSize: 12, cursor: "pointer", transition: "all 0.15s" }}
                      >
                        {FOOT_LABELS[f]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Court */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 4 }}>Cancha preferida</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {(["6v6", "9v9", "11v11"] as CourtSize[]).map(c => {
                    const active = editCourt === c;
                    return (
                      <button
                        key={c}
                        onClick={() => setEditCourt(c)}
                        style={{ flex: 1, padding: "8px 4px", borderRadius: 8, border: active ? "2px solid #1f7a4f" : "1px solid #e5e7eb", background: active ? "#e6f6ed" : "#fff", color: active ? "#1f7a4f" : "#6b7280", fontWeight: 600, fontSize: 12, cursor: "pointer", transition: "all 0.15s" }}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Save / Cancel */}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={cancelEditing}
                  style={{ flex: 1, padding: "12px", background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                >
                  Cancelar
                </button>
                <button
                  disabled={saving}
                  onClick={saveAll}
                  style={{ flex: 2, padding: "12px", background: saving ? "#9ca3af" : "#1f7a4f", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: saving ? "default" : "pointer", transition: "all 0.2s" }}
                >
                  {saving ? "Guardando..." : "Guardar cambios"}
                </button>
              </div>
            </>
          )}
        </div>

        {/* ========================= */}
        {/*      ESTAD&Iacute;STICAS  */}
        {/* ========================= */}
        {!isOnboarding && (
          <div style={{ marginTop: 12, background: "#fff", borderRadius: 16, padding: "16px 20px", boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }}>
            <h3 style={{ marginBottom: 10, fontSize: 14, fontWeight: 700, color: "#374151", margin: "0 0 10px" }}>{"📊"} Estad{"í"}sticas</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, textAlign: "center" }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#374151" }}>{stats.played}</div>
                <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 600 }}>PJ</div>
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#16a34a" }}>{stats.won}</div>
                <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 600 }}>PG</div>
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#ca8a04" }}>{stats.draw}</div>
                <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 600 }}>PE</div>
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#dc2626" }}>{stats.lost}</div>
                <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 600 }}>PP</div>
              </div>
            </div>
          </div>
        )}

        {/* ========================= */}
        {/*     CTA + NOTIFICATIONS   */}
        {/* ========================= */}
        {!isOnboarding && positions.length > 0 && (
          <>
            <button
              onClick={() => {
                if (returnToMatch) {
                  localStorage.removeItem("returnToMatch");
                  router.push(`/join/${returnToMatch}`);
                } else {
                  router.push("/");
                }
              }}
              style={{ marginTop: 12, width: "100%", padding: "14px", background: "#1f7a4f", color: "#fff", borderRadius: 12, border: "none", fontSize: 16, fontWeight: 600, cursor: "pointer" }}
            >
              {returnToMatch ? "Volver al partido" : "Ver mis partidos"}
            </button>

            {/* Notifications */}
            <div style={{ marginTop: 12, padding: 16, borderRadius: 16, background: isPushOnDevice ? "#ecfdf5" : "#fff", border: isPushOnDevice ? "1px solid #bbf7d0" : "1px solid #e5e7eb", boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }}>
              <h3 style={{ marginBottom: 4, fontSize: 14, fontWeight: 700 }}>{"🔔"} Recordatorios</h3>
              <p style={{ fontSize: 13, color: "#555", marginBottom: 10 }}>
                Te avisaremos <strong>24h, 12h y 6h antes</strong> del partido.
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
                  } finally { setEnablingPush(false); }
                }}
                disabled={isPushOnDevice || enablingPush}
                style={{
                  width: "100%", padding: "12px",
                  background: isPushOnDevice ? "#16a34a" : enablingPush ? "#9ca3af" : "#1f7a4f",
                  color: "#fff", borderRadius: 12, border: "none", fontSize: 14, fontWeight: 700,
                  cursor: isPushOnDevice || enablingPush ? "default" : "pointer",
                }}
              >
                {isPushOnDevice ? "Activos" : enablingPush ? "Activando..." : "Activar recordatorios"}
              </button>
              {pushEnabled && !isPushOnDevice && (
                <p style={{ marginTop: 8, fontSize: 12, color: "#92400e", textAlign: "center" }}>
                  Activos en otro dispositivo. Act{"í"}valos aqu{"í"} tambi{"é"}n.
                </p>
              )}
              {isPushOnDevice && (
                <p style={{ marginTop: 8, fontSize: 12, color: "#166534", textAlign: "center" }}>
                  {"Recibir\u00e1s notificaciones en este dispositivo 📲"}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
