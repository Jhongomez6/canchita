"use client";

import { calcCommitmentScore } from "@/lib/domain/user";
import type { UserProfile } from "@/lib/domain/user";
import type { Position } from "@/lib/domain/player";
import { POSITION_ICONS } from "@/lib/domain/player";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { logTooltipOpened } from "@/lib/analytics";
import { Star, ShieldCheck, AlertTriangle, Flag, SportShoe } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ========================
// CONSTANTS
// ========================

const POSITION_SHORT: Record<string, string> = {
  GK: "POR",
  DEF: "DEF",
  MID: "MID",
  FWD: "DEL",
};

const FOOT_SHORT: Record<string, string> = {
  left: "IZQ",
  right: "DER",
  ambidextrous: "AMB",
};

const SKILL_TO_FIFA: Record<number, number> = {
  1: 30,
  2: 50,
  3: 70,
  4: 90,
  5: 99,
};

// ========================
// HELPERS
// ========================

function getCommitmentDisplay(profile: UserProfile): number {
  return calcCommitmentScore(profile.stats ?? { played: 0, won: 0, lost: 0, draw: 0 });
}

function getCommitmentTier(com: number): { label: string; icon: LucideIcon; color: string } {
  if (com >= 99) return { label: "Siempre en la cancha antes que el balón", icon: Star, color: "text-green-300" };
  if (com >= 80)  return { label: "Listo para el 11 titular", icon: ShieldCheck, color: "text-lime-300" };
  if (com >= 50)  return { label: "Llegando justo para el pitazo inicial", icon: AlertTriangle, color: "text-yellow-300" };
  return { label: "Con la roja por falta de compromiso", icon: Flag, color: "text-red-400" };
}

function getTecDisplay(profile: UserProfile): number {
  const base = profile.techLevel ? SKILL_TO_FIFA[profile.techLevel] ?? 50 : 50;
  const schoolBonus = profile.hasSchool ? 3 : 0;
  const tournamentBonus = profile.hasTournaments ? 5 : 0;
  return Math.min(99, base + schoolBonus + tournamentBonus);
}

function getFisDisplay(profile: UserProfile): number {
  return profile.physLevel ? SKILL_TO_FIFA[profile.physLevel] ?? 50 : 50;
}

// ========================
// SUBCOMPONENTS
// ========================

const STAT_TOOLTIPS: Record<string, string> = {
  COM: "Compromiso — baja por ausencias y llegadas tarde",
  TEC: "Técnica — habilidad con el balón (calculado de tu autoevaluación)",
  FIS: "Físico — condición y resistencia (calculado de tu autoevaluación)",
  PJ: "Partidos Jugados",
  PG: "Partidos Ganados",
  MVP: "Veces elegido MVP del partido",
  OVR: "Overall — rating del jugador (próximamente)",
  POS_GK: "Posición principal: Portero",
  POS_DEF: "Posición principal: Defensa",
  POS_MID: "Posición principal: Medio",
  POS_FWD: "Posición principal: Delantero",
  ALT_GK: "Posición alternativa: Portero",
  ALT_DEF: "Posición alternativa: Defensa",
  ALT_MID: "Posición alternativa: Medio",
  ALT_FWD: "Posición alternativa: Delantero",
  FOOT_IZQ: "Pie dominante: Izquierdo",
  FOOT_DER: "Pie dominante: Derecho",
  FOOT_AMB: "Pie dominante: Ambidiestro",
};

function StatCell({ label, value, active, onToggle }: {
  label: string;
  value: number | string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="relative flex flex-col items-center cursor-pointer select-none" onClick={(e) => { e.stopPropagation(); onToggle(); }}>
      <span className={`text-[8px] font-bold uppercase tracking-widest mb-1 transition-colors ${active ? "text-green-300" : "text-green-400/80"}`}>{label}</span>
      <span className="text-[15px] font-black text-green-50 leading-none tabular-nums">{value}</span>
    </div>
  );
}

function DiamondPattern() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 185 320"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern id="fine-diag" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="5" stroke="rgba(74,222,128,0.12)" strokeWidth="0.7" />
        </pattern>
        <radialGradient id="glow-center" cx="50%" cy="40%" r="55%">
          <stop offset="0%" stopColor="rgba(31,122,79,0.25)" />
          <stop offset="100%" stopColor="rgba(7,30,18,0)" />
        </radialGradient>
      </defs>

      {/* Fine diagonal lines base */}
      <rect width="100%" height="100%" fill="url(#fine-diag)" />

      {/* Central green glow */}
      <rect width="100%" height="100%" fill="url(#glow-center)" />

      {/* Large crystal shards — bottom-left cluster */}
      <polygon points="0,220 45,260 20,320 0,320"        fill="rgba(31,122,79,0.10)"  stroke="rgba(74,222,128,0.35)" strokeWidth="0.8" />
      <polygon points="0,260 55,240 40,320"               fill="rgba(20,92,58,0.08)"   stroke="rgba(74,222,128,0.28)" strokeWidth="0.6" />
      <polygon points="10,200 60,230 50,270 5,255"        fill="rgba(13,61,38,0.08)"   stroke="rgba(74,222,128,0.22)" strokeWidth="0.5" />

      {/* Large crystal shards — top-right cluster */}
      <polygon points="185,0 140,30 160,80 185,60"        fill="rgba(31,122,79,0.10)"  stroke="rgba(74,222,128,0.35)" strokeWidth="0.8" />
      <polygon points="185,50 145,70 165,120 185,100"     fill="rgba(20,92,58,0.08)"   stroke="rgba(74,222,128,0.25)" strokeWidth="0.6" />
      <polygon points="155,0 120,20 135,60 175,40"        fill="rgba(13,61,38,0.08)"   stroke="rgba(74,222,128,0.20)" strokeWidth="0.5" />

      {/* Mid crystal — top-left accent */}
      <polygon points="0,60 30,40 40,80 10,95"            fill="rgba(31,122,79,0.07)"  stroke="rgba(74,222,128,0.28)" strokeWidth="0.6" />
      <polygon points="0,80 25,70 30,110 0,120"           fill="rgba(13,61,38,0.06)"   stroke="rgba(74,222,128,0.18)" strokeWidth="0.5" />

      {/* Mid crystal — bottom-right accent */}
      <polygon points="185,240 155,220 145,270 175,290"   fill="rgba(31,122,79,0.07)"  stroke="rgba(74,222,128,0.28)" strokeWidth="0.6" />
      <polygon points="185,270 160,255 165,310 185,320"   fill="rgba(13,61,38,0.06)"   stroke="rgba(74,222,128,0.18)" strokeWidth="0.5" />

      {/* Small floating diamond accents */}
      <polygon points="70,15 76,22 70,29 64,22"           fill="rgba(74,222,128,0.15)"  stroke="rgba(134,239,172,0.55)" strokeWidth="0.6" />
      <polygon points="155,145 160,151 155,157 150,151"   fill="rgba(74,222,128,0.12)"  stroke="rgba(134,239,172,0.50)" strokeWidth="0.6" />
      <polygon points="20,160 25,167 20,174 15,167"       fill="rgba(74,222,128,0.10)"  stroke="rgba(134,239,172,0.45)" strokeWidth="0.5" />
      <polygon points="100,290 104,296 100,302 96,296"    fill="rgba(74,222,128,0.12)"  stroke="rgba(134,239,172,0.50)" strokeWidth="0.5" />
    </svg>
  );
}

// ========================
// MAIN COMPONENT
// ========================

interface FifaPlayerCardProps {
  profile: UserProfile;
  animated?: boolean;
}

export default function FifaPlayerCard({ profile, animated = true }: FifaPlayerCardProps) {
  const primaryPos = profile.primaryPosition || profile.positions?.[0] || "MID";
  const altPositions = (profile.positions || []).filter((p) => p !== primaryPos);
  const footAbbrev = profile.dominantFoot ? FOOT_SHORT[profile.dominantFoot] || "?" : "?";
  const com = getCommitmentDisplay(profile);
  const tec = getTecDisplay(profile);
  const fis = getFisDisplay(profile);
  const pj = profile.stats?.played || 0;
  const pg = profile.stats?.won || 0;
  const mvp = profile.mvpAwards || 0;
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [photoLoaded, setPhotoLoaded] = useState(false);

  const toggleTooltip = (label: string) => {
    if (activeTooltip !== label) {
      logTooltipOpened(`fifa_card_${label.toLowerCase()}`);
    }
    setActiveTooltip((prev) => (prev === label ? null : label));
  };

  return (
    <motion.div
      onClick={() => setActiveTooltip(null)}
      initial={animated ? { opacity: 0, y: 30, rotateY: -8 } : false}
      animate={animated ? { opacity: 1, y: 0, rotateY: 0 } : undefined}
      transition={animated ? { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } : undefined}
      className="relative w-full max-w-[185px]"
      style={{ perspective: "1000px" }}
    >
      {/* SVG clip path — arch top + spike bottom (shield/crest shape) */}
      <svg width="0" height="0" className="absolute">
        <defs>
          <clipPath id="fifa-card-outer" clipPathUnits="objectBoundingBox">
            <path d="M 0.1,0.05 Q 0.5,0 0.9,0.05 L 1,0.1 L 1,0.84 Q 1,0.87 0.96,0.89 Q 0.72,0.97 0.5,1 Q 0.28,0.97 0.04,0.89 Q 0,0.87 0,0.84 L 0,0.1 Z" />
          </clipPath>
          <clipPath id="fifa-card-inner" clipPathUnits="objectBoundingBox">
            <path d="M 0.1,0.05 Q 0.5,0 0.9,0.05 L 1,0.1 L 1,0.84 Q 1,0.87 0.96,0.89 Q 0.72,0.97 0.5,1 Q 0.28,0.97 0.04,0.89 Q 0,0.87 0,0.84 L 0,0.1 Z" />
          </clipPath>
        </defs>
      </svg>

      {/* Card frame — double border like FUT cards */}
      <div
        className="relative p-[2px]"
        style={{ clipPath: "url(#fifa-card-outer)", background: "linear-gradient(to bottom, #4ade80, #1f7a4f, #0d3d26)" }}
      >
        <div
          className="relative overflow-hidden"
          style={{ clipPath: "url(#fifa-card-inner)", background: "linear-gradient(to bottom, #145c3a, #0d3d26, #071e12)" }}
        >

          {/* Diamond pattern background */}
          <DiamondPattern />

          {/* Shimmer effect */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-green-200/20 to-transparent skew-x-12 pointer-events-none z-30"
            initial={{ x: "-200%" }}
            animate={{ x: "200%" }}
            transition={{ duration: 3, repeat: Infinity, repeatDelay: 5, ease: "easeInOut" }}
          />

          {/* ========================= */}
          {/*   TOP SECTION             */}
          {/* ========================= */}
          <div className="relative z-20">

            {/* ========================= */}
            {/*   PLAYER PHOTO + OVR overlay */}
            {/* ========================= */}
            <div className="mt-3 mb-1">
              <div className="relative mx-1.5 h-[180px]">
                <div className="relative w-full h-full overflow-hidden rounded-full">
                  {!photoLoaded && (
                    <div className="absolute inset-0 bg-emerald-800/80 animate-pulse rounded-full" />
                  )}
                  <Image
                    src={profile.photoURL || "https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png"}
                    alt={profile.name || "Jugador"}
                    fill
                    className={`object-cover transition-opacity duration-300 ${photoLoaded ? 'opacity-100' : 'opacity-0'}`}
                    sizes="256px"
                    priority
                    unoptimized
                    onLoad={() => setPhotoLoaded(true)}
                    onError={() => setPhotoLoaded(true)}
                  />
                  {/* Vignette — difumina bordes de la foto */}
                  <div className="absolute inset-0 rounded-full" style={{ background: "radial-gradient(ellipse at center, transparent 62%, rgba(7,30,18,1) 88%, rgba(4,18,10,1) 100%), linear-gradient(to bottom, rgba(4,18,10,0.75) 0%, transparent 32%), linear-gradient(to top, rgba(4,18,10,0.9) 0%, transparent 40%)" }} />
                </div>
                {/* Edge blur overlay — on top of the image */}
                <div className="absolute inset-0 rounded-full pointer-events-none" style={{ boxShadow: "inset 0 0 5px 0px rgb(0, 58, 28)" }} />
                {/* Rating + Position overlay (top-left sobre la foto) */}
                <div className="absolute top-0 left-0 -translate-x-[5%] flex flex-col items-center cursor-pointer select-none z-10">
                  <span
                    className="text-[38px] font-black text-green-100 leading-none drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]"
                    onClick={(e) => { e.stopPropagation(); toggleTooltip("OVR"); }}
                  >
                    ?
                  </span>
                  <span
                    className="text-[13px] font-black text-green-300 tracking-wider leading-none flex items-center gap-0 drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]"
                    onClick={(e) => { e.stopPropagation(); toggleTooltip(`POS_${primaryPos}`); }}
                  >
                    <span>{POSITION_ICONS[primaryPos as Position]}</span>
                    <span>{POSITION_SHORT[primaryPos] ?? primaryPos}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* ========================= */}
            {/*   NAME BAR                */}
            {/* ========================= */}
            <div className="relative mx-2 mb-1">
              {/* Decorative line above name */}
              <div className="h-[1px] bg-gradient-to-r from-transparent via-green-400/40 to-transparent mb-2" />
              <h3 className="text-center text-[13px] font-black text-green-50 uppercase tracking-[0.2em] truncate px-2">
                {profile.name || "Jugador"}
              </h3>
            </div>

            {/* ========================= */}
            {/*   STATS — 1x6 ROW         */}
            {/* ========================= */}
            <div className="flex justify-center gap-x-3 px-2 pb-0 mb-0">
              {[
                { label: "COM", value: com },
                { label: "TEC", value: tec },
                { label: "FIS", value: fis },
                { label: "PJ",  value: pj  },
                { label: "PG",  value: pg  },
                { label: "MVP", value: mvp },
              ].map(({ label, value }) => (
                <StatCell
                  key={label}
                  label={label}
                  value={value}
                  active={activeTooltip === label}
                  onToggle={() => toggleTooltip(label)}
                />
              ))}
            </div>
          </div>

          {/* Logo centrado en el pico inferior */}
          <div className="flex justify-center pb-1">
            <div className="w-12 h-9 flex items-center justify-center">
              <Image
                src="/logo/lacanchita-logo.png"
                alt="La Canchita"
                width={36}
                height={36}
                className="opacity-70 object-contain"
                style={{ width: "auto", height: "auto" }}
                priority
                unoptimized
              />
            </div>
          </div>

          {/* Bottom decorative edge */}
          <div className="h-[2px] bg-gradient-to-r from-green-400/0 via-green-400/50 to-green-400/0" />
        </div>

      </div>

      {/* Alt positions — outside clipped div, sobresalen borde derecho */}
      {altPositions.length > 0 && (
        <div className="absolute right-0 top-10 translate-x-[40%] flex flex-col gap-1 z-40">
          {altPositions.map((pos) => (
            <div
              key={pos}
              className="bg-gradient-to-r from-emerald-800 to-emerald-900 rounded px-1.5 py-0.5 border border-green-400/50 shadow-md shadow-black/20 cursor-pointer select-none flex items-center gap-0.5"
              onClick={(e) => { e.stopPropagation(); toggleTooltip(`ALT_${pos}`); }}
            >
              <span className="text-[11px] leading-none">{POSITION_ICONS[pos as Position]}</span>
              <span className="text-[8px] font-black text-green-100 tracking-wider leading-none">{POSITION_SHORT[pos] ?? pos}</span>
            </div>
          ))}
        </div>
      )}

      {/* Foot pill — outside clipped div, sobresale borde derecho */}
      {footAbbrev !== "?" && (
        <div
          className="absolute right-0 bottom-[6rem] translate-x-[40%] z-40 bg-gradient-to-r from-emerald-800 to-emerald-900 rounded px-1.5 py-0.5 border border-green-400/50 shadow-md shadow-black/20 cursor-pointer select-none flex items-center gap-0.5"
          onClick={(e) => { e.stopPropagation(); toggleTooltip(`FOOT_${footAbbrev}`); }}
        >
          <SportShoe size={11} className="text-green-300" />
          <span className="text-[8px] font-black text-green-100 tracking-wider leading-none">{footAbbrev}</span>
        </div>
      )}

      {/* Tooltip — outside clipped div */}
      <AnimatePresence>
        {activeTooltip && (
          <motion.div
            key={activeTooltip}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-0 left-0 right-0 translate-y-full pt-1.5 z-50"
          >
            <div className="bg-emerald-950/95 border border-green-400/40 rounded-lg px-3 py-2 mx-1 shadow-lg shadow-black/40">
              <p className="text-[10px] text-green-100 leading-tight text-center">{STAT_TOOLTIPS[activeTooltip]}</p>
              {activeTooltip === "COM" && (() => { const tier = getCommitmentTier(com); return <p className={`text-[11px] font-black text-center mt-1 flex items-center justify-center gap-1 ${tier.color}`}><tier.icon size={12} /> {tier.label}</p>; })()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
