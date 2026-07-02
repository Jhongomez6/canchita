"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getUserProfile } from "@/lib/users";
import type { UserProfile } from "@/lib/domain/user";
import FifaPlayerCard from "./FifaPlayerCard";
import FifaCardSkeleton from "./skeletons/FifaCardSkeleton";
import KudosBadges from "./profile/KudosBadges";
import DrawerStreaks from "./profile/DrawerStreaks";
import XpBadge from "./xp/XpBadge";
import { calcLevelFromXp, calcTierFromLevel, ovrFromLevel, type XpTier } from "@/lib/domain/xp";
import { hasXpAccess } from "@/lib/domain/user";
import { logPlayerCardViewed } from "@/lib/analytics";

interface PlayerCardDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  playerUid: string | null;
}

// ========================
// THEME por rarity/tier — el fondo del drawer acompaña el color de la FIFA card
// (mismo mapeo que RARITY_VISUALS en FifaPlayerCard).
//   accent = color brillante (líneas de cancha, glow, borde)
//   mid/deep = tonos intermedios/oscuros del spotlight
//   sheet = gradiente de fondo del bottom sheet
//   *Text/*Bg/*Border = clases tailwind (literales, para el JIT) de label y error state
// ========================

interface DrawerTheme {
  accent: string;   // "r,g,b"
  mid: string;      // "r,g,b"
  deep: string;     // "r,g,b"
  sheet: string;    // background CSS del sheet
  glow: boolean;    // halo ambiental detrás de la card (off en Bronce/Suplente, más sobrio)
  labelText: string;
  errorBg: string;
  errorBorder: string;
  errorText: string;
}

const DRAWER_THEME: Record<XpTier, DrawerTheme> = {
  // Bronce/cobre — apagado, metálico, poco brillo (destaca menos, SIN glow)
  suplente: {
    accent: "198,120,58", mid: "138,79,32", deep: "74,44,20",
    sheet: "linear-gradient(to bottom, rgba(26,16,8,0.96), rgba(15,9,4,0.98))",
    glow: false,
    labelText: "text-amber-600/70", errorBg: "bg-amber-950/40",
    errorBorder: "border-amber-700/30", errorText: "text-amber-400/70",
  },
  titular: {
    accent: "203,213,225", mid: "100,116,139", deep: "51,65,85",
    sheet: "linear-gradient(to bottom, rgba(20,25,32,0.96), rgba(12,16,22,0.98))",
    glow: true,
    labelText: "text-slate-300/60", errorBg: "bg-slate-800/40",
    errorBorder: "border-slate-300/20", errorText: "text-slate-200/70",
  },
  // Oro vivo — amarillo-dorado saturado y brillante (destaca más)
  estrella: {
    accent: "253,224,71", mid: "250,204,21", deep: "161,98,7",
    sheet: "linear-gradient(to bottom, rgba(92,73,16,0.96), rgba(56,43,9,0.98))",
    glow: true,
    labelText: "text-yellow-300/80", errorBg: "bg-yellow-900/30",
    errorBorder: "border-yellow-400/25", errorText: "text-yellow-100/80",
  },
  // Verde Canchita — el look original del drawer
  capitan: {
    accent: "74,222,128", mid: "31,122,79", deep: "13,61,38",
    sheet: "linear-gradient(to bottom, rgba(5,20,12,0.96), rgba(3,12,7,0.98))",
    glow: true,
    labelText: "text-green-300/60", errorBg: "bg-emerald-900/40",
    errorBorder: "border-green-400/20", errorText: "text-green-200/70",
  },
  leyenda: {
    accent: "244,114,182", mid: "168,85,247", deep: "76,29,149",
    sheet: "linear-gradient(to bottom, rgba(30,15,45,0.96), rgba(18,10,30,0.98))",
    glow: true,
    labelText: "text-pink-300/70", errorBg: "bg-purple-900/40",
    errorBorder: "border-pink-400/20", errorText: "text-pink-200/70",
  },
};

// Tema neutro (grafito) para el estado de carga: no conocemos el tier del jugador
// hasta que baja el perfil, así que el preload es tier-agnóstico y no contradice
// la rarity final de la card (evita el flash verde→dorado).
const NEUTRAL_THEME: DrawerTheme = {
  accent: "148,163,184", mid: "71,85,105", deep: "30,41,59",
  sheet: "linear-gradient(to bottom, rgba(17,20,27,0.96), rgba(10,12,17,0.98))",
  glow: true,
  labelText: "text-slate-300/60", errorBg: "bg-slate-800/40",
  errorBorder: "border-slate-300/20", errorText: "text-slate-200/70",
};

export default function PlayerCardDrawer({ isOpen, onClose, playerUid }: PlayerCardDrawerProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showXpInfo, setShowXpInfo] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!playerUid) return;
    setLoading(true);
    setError(null);
    setProfile(null);
    try {
      const data = await getUserProfile(playerUid);
      if (!data) {
        setError("Perfil no encontrado");
      } else if (data.deleted) {
        setError("Este jugador eliminó su cuenta");
      } else {
        setProfile(data);
        logPlayerCardViewed();
      }
    } catch (err) {
      console.error("Error loading player profile:", err);
      setError("No se pudo cargar el perfil");
    } finally {
      setLoading(false);
    }
  }, [playerUid]);

  useEffect(() => {
    if (isOpen && playerUid) {
      loadProfile();
    }
    if (!isOpen) {
      setProfile(null);
      setError(null);
      setShowXpInfo(false);
    }
  }, [isOpen, playerUid, loadProfile]);

  // Tier del jugador → tema del drawer. Mismo cálculo que FifaPlayerCard para que
  // el fondo del sheet combine con la rarity de la card mostrada. Sin datos de XP:
  // fallback "suplente" (Bronce). Mientras carga (sin perfil aún): tema neutro.
  const tier: XpTier = profile
    ? (profile.xpTier
        ?? (typeof profile.xpLevel === "number" ? calcTierFromLevel(profile.xpLevel) : "suplente"))
    : "suplente";
  const t = profile ? DRAWER_THEME[tier] : NEUTRAL_THEME;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop — deeper blur for vitrine feel */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-[4px] z-[100]"
            onClick={onClose}
          />

          {/* Bottom Sheet — Vitrine, coloreada según la rarity del jugador */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 220 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 400) {
                onClose();
              }
            }}
            className="fixed bottom-0 left-0 right-0 z-[101] flex flex-col items-center rounded-t-3xl h-[72vh] min-h-[min(620px,90vh)] overflow-hidden"
            style={{
              background: t.sheet,
              backdropFilter: "blur(20px) saturate(1.2)",
              boxShadow: t.glow
                ? `0 -10px 60px rgba(0,0,0,0.5), 0 -2px 20px rgba(${t.accent},0.08)`
                : "0 -10px 60px rgba(0,0,0,0.5)",
            }}
          >
            {/* Abstract football pitch background */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none z-0"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 400 600"
              preserveAspectRatio="xMidYMid slice"
            >
              <defs>
                {/* Grass-like subtle vertical stripe texture */}
                <pattern id="bs-grass" width="6" height="20" patternUnits="userSpaceOnUse">
                  <rect width="3" height="20" fill={`rgba(${t.accent},0.03)`} />
                  <rect x="3" width="3" height="20" fill="transparent" />
                </pattern>
                {/* Spotlight on center */}
                <radialGradient id="bs-spot" cx="50%" cy="42%" r="45%">
                  <stop offset="0%" stopColor={`rgba(${t.mid},0.28)`} />
                  <stop offset="50%" stopColor={`rgba(${t.deep},0.08)`} />
                  <stop offset="100%" stopColor={`rgba(${t.deep},0)`} />
                </radialGradient>
                {/* Corner vignette */}
                <radialGradient id="bs-vig" cx="50%" cy="50%" r="70%">
                  <stop offset="40%" stopColor="transparent" />
                  <stop offset="100%" stopColor="rgba(2,4,3,0.45)" />
                </radialGradient>
              </defs>

              {/* Grass stripe texture */}
              <rect width="400" height="600" fill="url(#bs-grass)" />

              {/* Spotlight */}
              <rect width="400" height="600" fill="url(#bs-spot)" />

              {/* Vignette */}
              <rect width="400" height="600" fill="url(#bs-vig)" />

              {/* ===== ABSTRACT PITCH LINES ===== */}

              {/* Outer field boundary */}
              <rect x="30" y="30" width="340" height="540" rx="3"
                fill="none" stroke={`rgba(${t.accent},0.12)`} strokeWidth="0.8" />

              {/* Halfway line */}
              <line x1="30" y1="300" x2="370" y2="300"
                stroke={`rgba(${t.accent},0.15)`} strokeWidth="0.8" />

              {/* Center circle */}
              <circle cx="200" cy="300" r="65"
                fill="none" stroke={`rgba(${t.accent},0.14)`} strokeWidth="0.8" />

              {/* Center dot */}
              <circle cx="200" cy="300" r="3"
                fill={`rgba(${t.accent},0.20)`} stroke="none" />

              {/* ===== TOP PENALTY AREA ===== */}
              <rect x="105" y="30" width="190" height="85" rx="2"
                fill="none" stroke={`rgba(${t.accent},0.11)`} strokeWidth="0.7" />
              {/* Top goal area */}
              <rect x="145" y="30" width="110" height="35" rx="2"
                fill="none" stroke={`rgba(${t.accent},0.09)`} strokeWidth="0.6" />
              {/* Top penalty arc */}
              <path d="M 145,115 Q 200,140 255,115"
                fill="none" stroke={`rgba(${t.accent},0.10)`} strokeWidth="0.6" />
              {/* Top penalty spot */}
              <circle cx="200" cy="100" r="2"
                fill={`rgba(${t.accent},0.15)`} stroke="none" />

              {/* ===== BOTTOM PENALTY AREA ===== */}
              <rect x="105" y="485" width="190" height="85" rx="2"
                fill="none" stroke={`rgba(${t.accent},0.11)`} strokeWidth="0.7" />
              {/* Bottom goal area */}
              <rect x="145" y="535" width="110" height="35" rx="2"
                fill="none" stroke={`rgba(${t.accent},0.09)`} strokeWidth="0.6" />
              {/* Bottom penalty arc */}
              <path d="M 145,485 Q 200,460 255,485"
                fill="none" stroke={`rgba(${t.accent},0.10)`} strokeWidth="0.6" />
              {/* Bottom penalty spot */}
              <circle cx="200" cy="500" r="2"
                fill={`rgba(${t.accent},0.15)`} stroke="none" />

              {/* ===== CORNER ARCS ===== */}
              <path d="M 30,45 Q 45,30 45,30" fill="none" stroke={`rgba(${t.accent},0.12)`} strokeWidth="0.6" />
              <path d="M 370,45 Q 355,30 355,30" fill="none" stroke={`rgba(${t.accent},0.12)`} strokeWidth="0.6" />
              <path d="M 30,555 Q 45,570 45,570" fill="none" stroke={`rgba(${t.accent},0.12)`} strokeWidth="0.6" />
              <path d="M 370,555 Q 355,570 355,570" fill="none" stroke={`rgba(${t.accent},0.12)`} strokeWidth="0.6" />
            </svg>

            {/* Inset border glow — vitrine frame */}
            <div
              className="absolute inset-0 rounded-t-3xl pointer-events-none z-10"
              style={{
                border: `1px solid rgba(${t.accent},0.15)`,
                boxShadow: `inset 0 1px 0 0 rgba(${t.accent},0.25), inset 0 0 30px rgba(${t.accent},0.04)`,
              }}
            />

            {/* Overhead display lighting */}
            <div
              className="absolute top-0 left-0 right-0 h-24 pointer-events-none z-0"
              style={{ background: `linear-gradient(to bottom, rgba(${t.accent},0.06), transparent)` }}
            />

            {/* Top accent line */}
            <div
              className="absolute top-0 left-0 right-0 h-[1px] z-10"
              style={{ background: `linear-gradient(to right, transparent, rgba(${t.accent},0.4), transparent)` }}
            />

            {/* Drag Handle — themed */}
            <div className="pt-3 pb-2 w-full flex justify-center relative z-20">
              <div
                className="w-8 h-[2px] rounded-full"
                style={{
                  background: `linear-gradient(to right, rgba(${t.accent},0.3), rgba(${t.accent},0.6), rgba(${t.accent},0.3))`,
                  boxShadow: `0 0 6px rgba(${t.accent},0.2)`,
                }}
              />
            </div>

            {/* Content */}
            <div className="relative flex-1 overflow-y-auto w-full flex flex-col items-center px-4 pb-8 z-20">
              {loading ? (
                <div className="relative mt-4">
                  {/* Breathing glow — visible during loading */}
                  <motion.div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[520px] rounded-full pointer-events-none"
                    style={{ background: `radial-gradient(circle, rgba(${t.accent},0.30) 0%, rgba(${t.mid},0.10) 45%, transparent 75%)` }}
                    animate={{ opacity: [0.4, 0.7, 0.4], scale: [0.95, 1.05, 0.95] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  />
                  <FifaCardSkeleton size="lg" />
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                  <div className={`w-16 h-16 ${t.errorBg} rounded-full flex items-center justify-center mb-4 border ${t.errorBorder}`}>
                    <span className="text-2xl">😔</span>
                  </div>
                  <p className={`${t.errorText} font-medium text-sm`}>{error}</p>
                </div>
              ) : profile ? (
                <div className="relative mt-0 w-[340px] flex flex-col items-center">
                  {/* Breathing ambient glow behind card — omitido en Bronce/Suplente (sin glow) */}
                  {t.glow && (
                    <motion.div
                      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[45%] w-[320px] h-[520px] rounded-full pointer-events-none"
                      style={{ background: `radial-gradient(circle, rgba(${t.accent},0.40) 0%, rgba(${t.mid},0.15) 45%, transparent 75%)` }}
                      animate={{ opacity: [0.5, 0.85, 0.5], scale: [0.95, 1.05, 0.95] }}
                      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    />
                  )}

                  {/* Card entrance wrapper with drop shadow + scale up */}
                  <motion.div
                    initial={{ opacity: 0, y: 15, scale: 1.45 }}
                    animate={{ opacity: 1, y: 0, scale: 1.45 }}
                    transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                    style={{
                      transformOrigin: "top center",
                      filter: t.glow
                        ? `drop-shadow(0 4px 20px rgba(0,0,0,0.5)) drop-shadow(0 0 15px rgba(${t.accent},0.15))`
                        : "drop-shadow(0 4px 20px rgba(0,0,0,0.5))",
                    }}
                  >
                    <FifaPlayerCard profile={profile} animated={true} />
                  </motion.div>

                  {/* Spacer — la card está escalada 1.45x desde top-center, lo cual extiende ~45% su altura natural sin empujar el flow. Reservamos espacio manualmente para que la shelf line y los kudos no queden tapados. */}
                  <div aria-hidden className="h-[140px]" />

                  {/* Glass shelf line below card */}
                  <div className="flex flex-col items-center">
                    <div
                      className="w-[160px] h-[1px]"
                      style={{ background: `linear-gradient(to right, transparent, rgba(${t.accent},0.3), transparent)` }}
                    />
                    <div
                      className="w-[120px] h-[4px] mt-1 rounded-full"
                      style={{ background: `rgba(${t.accent},0.08)`, filter: "blur(3px)" }}
                    />
                  </div>

                  {/* XP Badge — con tooltip explicativo del nivel al tocar */}
                  {hasXpAccess(profile) && typeof profile.xp === "number" && profile.xp > 0 && (() => {
                    const lvl = profile.xpLevel ?? calcLevelFromXp(profile.xp);
                    const tr = profile.xpTier ?? calcTierFromLevel(lvl);
                    return (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.35 }}
                        className="mt-3 flex flex-col items-center"
                      >
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setShowXpInfo((v) => !v); }}
                          className="focus:outline-none"
                          aria-label="Qué es el nivel"
                        >
                          <XpBadge tier={tr} level={lvl} size="md" />
                        </button>
                        <AnimatePresence>
                          {showXpInfo && (
                            <motion.div
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              transition={{ duration: 0.15 }}
                              className="mt-2 max-w-[260px] rounded-lg px-3 py-2"
                              style={{ background: `rgba(${t.deep},0.9)`, border: `1px solid rgba(${t.accent},0.35)` }}
                            >
                              <p className="text-[11px] leading-snug text-center" style={{ color: `rgba(${t.accent},0.95)` }}>
                                <span className="font-black">Nivel {ovrFromLevel(lvl)}</span> — su experiencia acumulada en la Canchita.
                                Sube jugando, ganando, siendo MVP y con constancia. Nunca baja de tier.
                              </p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })()}

                  {/* Reconocimientos + Rachas — agrupados en una sola fila inline.
                      SDD: PLAYER_CARD_DRAWER_SECTIONS_SDD */}
                  {(
                    (profile.kudosSummary && profile.kudosSummary.total > 0) ||
                    (profile.weeklyStreak ?? 0) > 0 ||
                    (profile.commitmentStreak ?? 0) > 0
                  ) && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: 0.4 }}
                      className="mt-3 w-full flex flex-col items-center"
                    >
                      {/* Micro header — tight tracking, sin líneas decorativas */}
                      <div className="mb-3">
                        <span className={`text-[11px] font-bold ${t.labelText} uppercase tracking-[0.18em]`}>
                          Logros
                        </span>
                      </div>

                      <div className="w-full max-w-[340px] flex flex-col items-center gap-2">
                        {/* Row 1 — Rachas primero, mayor jerarquía */}
                        <DrawerStreaks profile={profile} />
                        {/* Row 2 — Reconocimientos */}
                        {profile.kudosSummary && profile.kudosSummary.total > 0 && (
                          <KudosBadges summary={profile.kudosSummary} compact />
                        )}
                      </div>
                    </motion.div>
                  )}
                </div>
              ) : null}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
