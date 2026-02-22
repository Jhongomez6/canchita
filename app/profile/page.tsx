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
import { handleError } from "@/lib/utils/error";
import AuthGuard from "@/components/AuthGuard";
import StatsCard from "@/components/StatsCard";

const FOOT_LABELS: Record<string, string> = { left: "Izquierdo", right: "Derecho", ambidextrous: "Ambidiestro" };
const LEVEL_LABELS = ["", "Básico", "Intermedio", "Avanzado"];
const LEVEL_EMOJIS = ["", "🌱", "⚡", "🔥"];

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
            lateArrivals: profile.stats.lateArrivals ?? 0,
            noShows: profile.stats.noShows ?? 0,
          });
        }
        if (profile?.level != null) setLevel(profile.level);
        if (profile?.onboardingCompletedAt) setOnboardingCompletedAt(profile.onboardingCompletedAt);
        if (profile?.age != null) setAge(profile.age);
        if (profile?.dominantFoot) setDominantFoot(profile.dominantFoot);
        if (profile?.preferredCourt) setPreferredCourt(profile.preferredCourt);
        setLoading(false);
      })
      .catch((err: unknown) => {
        handleError(err, "Error cargando perfil");
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
    } catch (err: unknown) {
      handleError(err, "Error al guardar los cambios del perfil");
    } finally {
      setSaving(false);
    }
  }

  // ======== RENDER ========



  const Chip = ({ active, children }: { active: boolean, children: React.ReactNode }) => (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${active
      ? "bg-emerald-50 text-[#1f7a4f] border-emerald-200"
      : "bg-slate-100 text-slate-500 border-slate-200"
      }`}>
      {children}
    </span>
  );

  const InfoRow = ({ label, value }: { label: string, value: React.ReactNode }) => (
    <div className="flex justify-between items-center py-3 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-500 font-medium">{label}</span>
      <div className="text-sm font-bold text-slate-700">{value}</div>
    </div>
  );

  if (!user || loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-[#1f7a4f] rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <AuthGuard>
      <main className="min-h-screen bg-slate-50 pb-24 md:pb-8">
        <div className="max-w-md mx-auto p-4">

          {/* Onboarding banner */}
          {isOnboarding && (
            <div className="bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] text-white p-5 rounded-2xl shadow-lg mb-6">
              <h2 className="font-bold text-lg mb-1">👋 Completa tu perfil</h2>
              <p className="text-sm text-emerald-100 opacity-90">Selecciona tus posiciones para unirte a partidos.</p>
            </div>
          )}

          {/* ========================= */}
          {/*    FICHA TÉCNICA        */}
          {/* ========================= */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">

            {/* Header */}
            <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <span className="text-xl">🏅</span> Ficha Técnica
              </h2>
              {!isOnboarding && !editing && (
                <button
                  onClick={startEditing}
                  className="text-sm font-semibold text-[#1f7a4f] hover:text-[#16603c] transition-colors"
                >
                  ✏️ Editar
                </button>
              )}
            </div>

            <div className="p-5">
              {saved && (
                <div className="mb-4 bg-emerald-50 text-[#1f7a4f] text-sm font-semibold px-3 py-2 rounded-lg text-center border border-emerald-100 animate-fade-in">
                  ✅ Cambios guardados
                </div>
              )}

              {/* =================== */}
              {/*     VIEW MODE       */}
              {/* =================== */}
              {!editing ? (
                <div className="space-y-1">
                  <InfoRow label="Nombre" value={displayName || "—"} />
                  {age != null && <InfoRow label="Edad" value={`${age} años`} />}

                  <InfoRow label="Posiciones" value={
                    positions.length > 0 ? (
                      <div className="flex gap-2 flex-wrap justify-end">
                        {positions.map(p => (
                          <Chip key={p} active={true}>
                            {POSITION_ICONS[p as Position]} {POSITION_LABELS[p as Position]}
                          </Chip>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400 italic text-xs">Sin seleccionar</span>
                    )
                  } />

                  {dominantFoot && <InfoRow label="Pie dominante" value={FOOT_LABELS[dominantFoot] || dominantFoot} />}
                  {preferredCourt && <InfoRow label="Cancha preferida" value={preferredCourt} />}

                  {/* Level Classification Card */}
                  {level != null && (
                    <div className="mt-6 bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] rounded-2xl p-5 text-white shadow-lg relative overflow-hidden group">
                      <div className="absolute top-0 right-0 -mr-4 -mt-4 w-24 h-24 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all"></div>

                      <div className="flex items-center gap-4 relative z-10">
                        <span className="text-5xl drop-shadow-md">{LEVEL_EMOJIS[level]}</span>
                        <div>
                          <div className="text-xs font-bold text-emerald-200 uppercase tracking-widest mb-1">Nivel Calculado</div>
                          <div className="text-2xl font-black leading-none">Nivel {level}</div>
                          <div className="text-lg font-bold opacity-90">{LEVEL_LABELS[level]}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Re-evaluation Link */}
                  {level != null && (
                    <div className="mt-4 text-center">
                      {reevalDaysLeft === 0 ? (
                        <button
                          disabled={requestingReeval}
                          onClick={async () => {
                            setRequestingReeval(true);
                            try {
                              await requestReEvaluation(user.uid);
                              router.push("/onboarding");
                            } catch (err: unknown) {
                              handleError(err, "Error solicitando re-evaluación");
                              setRequestingReeval(false);
                            }
                          }}
                          className="text-xs font-bold text-amber-600 hover:text-amber-700 underline"
                        >
                          {requestingReeval ? "Redirigiendo..." : "Solicitar nueva evaluación"}
                        </button>
                      ) : (
                        <p className="text-[10px] text-slate-400">
                          🔒 Nueva autoevaluación disponible el {reevalUnlockDate}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* =================== */
                /*     EDIT MODE       */
                /* =================== */
                <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {/* Name */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Nombre</label>
                    {canEditName ? (
                      <div>
                        <input
                          type="text"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          placeholder="Tu nombre"
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-[#1f7a4f] transition-all"
                        />
                        {editName.trim().length > 0 && editName.trim().length < 2 && (
                          <p className="text-red-500 text-xs mt-1 font-medium">Mínimo 2 caracteres</p>
                        )}
                      </div>
                    ) : (
                      <div className="px-4 py-3 bg-slate-100 rounded-xl text-slate-400 font-medium text-sm border border-slate-200">
                        {displayName} <span className="text-xs ml-2 opacity-70">🔒 cambio el {nameUnlockDate}</span>
                      </div>
                    )}
                  </div>

                  {/* Positions */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                      Posiciones <span className="text-[10px] font-normal normal-case opacity-70">(máx. 2)</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
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
                            className={`
                                       flex items-center justify-center gap-2 py-3 px-2 rounded-xl text-sm font-bold transition-all border
                                       ${sel
                                ? "bg-emerald-50 border-[#1f7a4f] text-[#1f7a4f] shadow-sm"
                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                              }
                                    `}
                          >
                            <span className="text-lg">{POSITION_ICONS[pos]}</span>
                            <span>{POSITION_LABELS[pos]}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Foot */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Pie Dominante</label>
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                      {(["left", "right", "ambidextrous"] as Foot[]).map(f => {
                        const active = editFoot === f;
                        return (
                          <button
                            key={f}
                            onClick={() => setEditFoot(f)}
                            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${active ? "bg-white text-[#1f7a4f] shadow-sm" : "text-slate-500 hover:text-slate-700"
                              }`}
                          >
                            {FOOT_LABELS[f]}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Court */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Cancha Preferida</label>
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                      {(["6v6", "9v9", "11v11"] as CourtSize[]).map(c => {
                        const active = editCourt === c;
                        return (
                          <button
                            key={c}
                            onClick={() => setEditCourt(c)}
                            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${active ? "bg-white text-[#1f7a4f] shadow-sm" : "text-slate-500 hover:text-slate-700"
                              }`}
                          >
                            {c}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={cancelEditing}
                      className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      disabled={saving}
                      onClick={saveAll}
                      className="flex-[2] py-3 bg-[#1f7a4f] text-white font-bold rounded-xl hover:bg-[#16603c] transition-all shadow-md active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {saving ? "Guardando..." : "Guardar Cambios"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ========================= */}
          {/*    NIVEL DE COMPROMISO  */}
          {/* ========================= */}
          {!isOnboarding && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <span className="text-xl">🤝</span> Compromiso
                </h2>
                <div className="group relative flex items-center" tabIndex={0}>
                  <span className="cursor-pointer w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors">
                    ?
                  </span>
                  <div className="absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full w-56 p-3 bg-slate-800 text-white text-xs rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus:opacity-100 group-focus:visible focus-within:opacity-100 focus-within:visible transition-all pointer-events-none z-50 text-center">
                    Inicias con 100 de puntuación.
                    <br />• <span className="text-amber-300 font-bold">-5 pts</span> por Llegada Tarde
                    <br />• <span className="text-red-400 font-bold">-20 pts</span> por No Asistir
                    <div className="absolute left-1/2 -bottom-1 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                  </div>
                </div>
              </div>

              {(() => {
                const { lateArrivals = 0, noShows = 0 } = stats;
                const penalty = (noShows * 20) + (lateArrivals * 5);
                const score = Math.max(0, 100 - penalty);

                let level = { label: "Siempre en la cancha antes que el balón", color: "text-emerald-600", bg: "bg-emerald-100", icon: "🌟" };
                if (score < 50) level = { label: "Con la roja por falta de compromiso", color: "text-red-600", bg: "bg-red-100", icon: "🚩" };
                else if (score < 80) level = { label: "Llegando justo para el pitazo inicial", color: "text-amber-600", bg: "bg-amber-100", icon: "⚠️" };
                else if (score < 100) level = { label: "Listo para el 11 titular", color: "text-lime-600", bg: "bg-lime-100", icon: "🛡️" };

                return (
                  <div className="flex items-center justify-between">
                    <div className="relative w-24 h-24 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle
                          cx="48"
                          cy="48"
                          r="40"
                          stroke="currentColor"
                          strokeWidth="8"
                          fill="transparent"
                          className="text-slate-100"
                        />
                        <circle
                          cx="48"
                          cy="48"
                          r="40"
                          stroke="currentColor"
                          strokeWidth="8"
                          fill="transparent"
                          strokeDasharray={251.2}
                          strokeDashoffset={251.2 - (251.2 * score) / 100}
                          className={`${level.color} transition-all duration-1000 ease-out`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className={`text-2xl font-black ${level.color}`}>{score}</span>
                      </div>
                    </div>

                    <div className="flex-1 pl-6">
                      <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-1 ${level.bg} ${level.color}`}>
                        {level.icon} {level.label}
                      </div>
                      <div className="text-xs text-slate-500 leading-tight">
                        Tu nivel de cumplimiento en partidos.
                        {/* No mostramos No Shows explícitamente para no avergonzar, pero impactan el score */}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ========================= */}
          {/*      ESTADÍSTICAS       */}
          {/* ========================= */}
          {!isOnboarding && <StatsCard stats={stats} />}

          {/* ========================= */}
          {/*     CTA + NOTIFICATIONS   */}
          {/* ========================= */}
          {!isOnboarding && positions.length > 0 && (
            <div className="space-y-4">
              <button
                onClick={() => {
                  if (returnToMatch) {
                    localStorage.removeItem("returnToMatch");
                    router.push(`/join/${returnToMatch}`);
                  } else {
                    router.push("/");
                  }
                }}
                className="w-full py-4 bg-[#1f7a4f] text-white rounded-2xl font-bold text-lg hover:bg-[#16603c] transition-all shadow-lg active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {returnToMatch ? "Volver al partido" : "Ver mis partidos"}
              </button>

              {/* Notifications */}
              <div className={`p-5 rounded-2xl border transition-all ${isPushOnDevice ? "bg-emerald-50 border-emerald-100" : "bg-white border-slate-200 shadow-sm"
                }`}>
                <div className="flex items-start gap-4">
                  <div className="text-2xl">🔔</div>
                  <div className="flex-1">
                    <h3 className="font-bold text-slate-800 text-sm mb-1">Recordatorios</h3>
                    <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                      No te pierdas nada de lo que pasa en tus partidos. Activa los notificaciones para recibir alertas y recordatorios.
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
                      className={`w-full py-2.5 rounded-xl text-sm font-bold transition-all ${isPushOnDevice
                        ? "bg-white text-emerald-600 border border-emerald-200 cursor-default"
                        : "bg-slate-900 text-white hover:bg-slate-800"
                        }`}
                    >
                      {isPushOnDevice ? "✅ Notificaciones Activas" : enablingPush ? "Activando..." : "Activar Ahora"}
                    </button>

                    {pushEnabled && !isPushOnDevice && (
                      <p className="mt-2 text-[10px] text-amber-600 text-center font-medium">
                        Activas en otro dispositivo. Actívalas aquí también.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="h-4"></div> {/* Bottom spacer */}
            </div>
          )}
        </div>
      </main>
    </AuthGuard>
  );
}
