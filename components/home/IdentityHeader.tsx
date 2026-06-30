'use client';

import type { UserProfile } from "@/lib/domain/user";
import { calcCommitmentScore, hasXpAccess } from "@/lib/domain/user";
import { calcLevelFromXp, calcTierFromLevel, ovrFromLevel, TIER_META, type XpTier } from "@/lib/domain/xp";
import { Heart } from "lucide-react";
import Link from "next/link";
import { logTooltipOpened } from "@/lib/analytics";
import PlayerAvatar from "@/components/PlayerAvatar";

// Color del número del Nivel según tier — espejo de TIER_TEXT_COLOR en XpBadge
const TIER_NUM_TEXT: Record<XpTier, string> = {
    suplente: "text-amber-50",
    titular: "text-slate-900",
    estrella: "text-amber-950",
    capitan: "text-emerald-50",
    leyenda: "text-white",
};

interface IdentityHeaderProps {
    profile: UserProfile;
    isAdmin: boolean;
    pendingConfirmations?: number;
    activeMatchesCount?: number;
}

function getLevelLabel(level?: number): string {
    const LEVEL_LABELS = ["", "Básico", "Intermedio", "Avanzado", "Elite"];
    if (!level || level < 1 || level >= LEVEL_LABELS.length) return "Sin categoría";
    return LEVEL_LABELS[level];
}


function getComHeartColor(score: number): string {
    // Verde brillante: excelente compromiso (80+)
    if (score >= 80) return "text-emerald-400 fill-emerald-400";
    // Amarillo: compromiso medio (50-79)
    if (score >= 50) return "text-amber-400 fill-amber-400";
    // Rojo: compromiso bajo (<50)
    return "text-red-500 fill-red-500";
}

export default function IdentityHeader({ profile, isAdmin, pendingConfirmations, activeMatchesCount }: IdentityHeaderProps) {
    const com = profile.stats ? calcCommitmentScore(profile.stats) : null;

    // Nivel de XP (escala 50-99) — solo si el user tiene acceso al feature y datos cargados
    const xpOn = hasXpAccess(profile) && typeof profile.xp === "number";
    const xpLevelNum = xpOn ? (profile.xpLevel ?? calcLevelFromXp(profile.xp!)) : undefined;
    const xpTier: XpTier | undefined = xpOn
        ? (profile.xpTier ?? calcTierFromLevel(xpLevelNum!))
        : undefined;
    const xpNivel = xpLevelNum !== undefined ? ovrFromLevel(xpLevelNum) : undefined;

    const initials = profile.name
        ? profile.name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()
        : "?";

    return (
        <div className="flex items-center gap-3">
            {/* Avatar + badge de Nivel */}
            <Link href="/profile" className="relative block shrink-0 active:scale-95 transition-transform">
                <div className="w-12 h-12 rounded-full border-2 border-white/30">
                    {(profile.photoURLThumb ?? profile.photoURL) ? (
                        <PlayerAvatar
                            src={profile.photoURLThumb ?? profile.photoURL!}
                            alt={profile.name}
                            className="w-12 h-12 rounded-full overflow-hidden relative"
                            skeletonClassName="bg-white/20 rounded-full"
                        />
                    ) : (
                        <div className="w-full h-full bg-white/20 rounded-full flex items-center justify-center text-white font-black text-base">
                            {initials}
                        </div>
                    )}
                </div>
                {xpNivel !== undefined && xpTier && (
                    <div
                        className={`absolute -bottom-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-gradient-to-br ${TIER_META[xpTier].badgeGradient} border-2 border-[#1f7a4f] flex items-center justify-center shadow-md`}
                        aria-label={`Nivel ${xpNivel}`}
                    >
                        <span className={`text-[10px] font-black tabular-nums leading-none ${TIER_NUM_TEXT[xpTier]}`}>
                            {xpNivel}
                        </span>
                    </div>
                )}
            </Link>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl font-black text-white leading-none">
                        {profile.name || "Jugador"}
                    </h1>
                    {isAdmin && (
                        <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px] font-bold text-white uppercase tracking-wide">
                            Admin
                        </span>
                    )}
                </div>

                {isAdmin ? (
                    <p className="text-emerald-100/80 text-xs font-medium mt-0.5">
                        {activeMatchesCount ?? 0} partidos activos
                        {pendingConfirmations ? ` · ${pendingConfirmations} sin confirmar` : ""}
                    </p>
                ) : (
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {profile.level && (
                            <div className="group relative inline-block" tabIndex={0} onMouseEnter={() => logTooltipOpened("player_level")}>
                                <span className="bg-white/15 text-white text-[11px] font-semibold px-2 py-0.5 rounded-full cursor-help">
                                    🏅 {getLevelLabel(profile.level)}
                                </span>
                                <div className="absolute left-0 bottom-full mb-2 w-56 p-2 bg-slate-800 text-white text-[10px] rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus:opacity-100 group-focus:visible focus-within:opacity-100 focus-within:visible transition-all pointer-events-none z-50">
                                    <div className="font-semibold mb-1">Categoría de juego</div>
                                    <div className="text-slate-300">Tu categoría calculada de la autoevaluación inicial</div>
                                    <div className="absolute left-2 top-full border-4 border-transparent border-t-slate-800"></div>
                                </div>
                            </div>
                        )}
                        {com !== null && (
                            <div className="group relative inline-block" tabIndex={0} onMouseEnter={() => logTooltipOpened("commitment_score")}>
                                <span className="flex items-center gap-1 text-[11px] font-bold text-white cursor-help">
                                    <Heart size={12} className={`shrink-0 transition-colors ${getComHeartColor(com)}`} />
                                    COM {com}
                                </span>
                                <div className="absolute left-0 bottom-full mb-2 w-56 p-2 bg-slate-800 text-white text-[10px] rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus:opacity-100 group-focus:visible focus-within:opacity-100 focus-within:visible transition-all pointer-events-none z-50">
                                    <div className="font-semibold mb-1">Compromiso</div>
                                    <div className="text-slate-300">Tu puntuación de asistencia y puntualidad</div>
                                    <div className="absolute left-2 top-full border-4 border-transparent border-t-slate-800"></div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Racha de Compromiso */}
            </div>
        </div>
    );
}
