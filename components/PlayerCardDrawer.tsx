"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getUserProfile } from "@/lib/users";
import type { UserProfile } from "@/lib/domain/user";
import FifaPlayerCard from "./FifaPlayerCard";
import FifaCardSkeleton from "./skeletons/FifaCardSkeleton";
import { logPlayerCardViewed } from "@/lib/analytics";

interface PlayerCardDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  playerUid: string | null;
}

export default function PlayerCardDrawer({ isOpen, onClose, playerUid }: PlayerCardDrawerProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    }
  }, [isOpen, playerUid, loadProfile]);

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

          {/* Bottom Sheet — Emerald Vitrine */}
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
            className="fixed bottom-0 left-0 right-0 z-[101] flex flex-col items-center rounded-t-3xl h-[66vh] overflow-hidden"
            style={{
              background: "linear-gradient(to bottom, rgba(5,20,12,0.96), rgba(3,12,7,0.98))",
              backdropFilter: "blur(20px) saturate(1.2)",
              boxShadow: "0 -10px 60px rgba(0,0,0,0.5), 0 -2px 20px rgba(74,222,128,0.08)",
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
                  <rect width="3" height="20" fill="rgba(74,222,128,0.03)" />
                  <rect x="3" width="3" height="20" fill="transparent" />
                </pattern>
                {/* Spotlight on center */}
                <radialGradient id="bs-spot" cx="50%" cy="42%" r="45%">
                  <stop offset="0%" stopColor="rgba(31,122,79,0.28)" />
                  <stop offset="50%" stopColor="rgba(13,61,38,0.08)" />
                  <stop offset="100%" stopColor="rgba(7,30,18,0)" />
                </radialGradient>
                {/* Corner vignette */}
                <radialGradient id="bs-vig" cx="50%" cy="50%" r="70%">
                  <stop offset="40%" stopColor="transparent" />
                  <stop offset="100%" stopColor="rgba(4,14,8,0.45)" />
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
                fill="none" stroke="rgba(74,222,128,0.12)" strokeWidth="0.8" />

              {/* Halfway line */}
              <line x1="30" y1="300" x2="370" y2="300"
                stroke="rgba(74,222,128,0.15)" strokeWidth="0.8" />

              {/* Center circle */}
              <circle cx="200" cy="300" r="65"
                fill="none" stroke="rgba(74,222,128,0.14)" strokeWidth="0.8" />

              {/* Center dot */}
              <circle cx="200" cy="300" r="3"
                fill="rgba(74,222,128,0.20)" stroke="none" />

              {/* ===== TOP PENALTY AREA ===== */}
              <rect x="105" y="30" width="190" height="85" rx="2"
                fill="none" stroke="rgba(74,222,128,0.11)" strokeWidth="0.7" />
              {/* Top goal area */}
              <rect x="145" y="30" width="110" height="35" rx="2"
                fill="none" stroke="rgba(74,222,128,0.09)" strokeWidth="0.6" />
              {/* Top penalty arc */}
              <path d="M 145,115 Q 200,140 255,115"
                fill="none" stroke="rgba(74,222,128,0.10)" strokeWidth="0.6" />
              {/* Top penalty spot */}
              <circle cx="200" cy="100" r="2"
                fill="rgba(74,222,128,0.15)" stroke="none" />

              {/* ===== BOTTOM PENALTY AREA ===== */}
              <rect x="105" y="485" width="190" height="85" rx="2"
                fill="none" stroke="rgba(74,222,128,0.11)" strokeWidth="0.7" />
              {/* Bottom goal area */}
              <rect x="145" y="535" width="110" height="35" rx="2"
                fill="none" stroke="rgba(74,222,128,0.09)" strokeWidth="0.6" />
              {/* Bottom penalty arc */}
              <path d="M 145,485 Q 200,460 255,485"
                fill="none" stroke="rgba(74,222,128,0.10)" strokeWidth="0.6" />
              {/* Bottom penalty spot */}
              <circle cx="200" cy="500" r="2"
                fill="rgba(74,222,128,0.15)" stroke="none" />

              {/* ===== CORNER ARCS ===== */}
              <path d="M 30,45 Q 45,30 45,30" fill="none" stroke="rgba(74,222,128,0.12)" strokeWidth="0.6" />
              <path d="M 370,45 Q 355,30 355,30" fill="none" stroke="rgba(74,222,128,0.12)" strokeWidth="0.6" />
              <path d="M 30,555 Q 45,570 45,570" fill="none" stroke="rgba(74,222,128,0.12)" strokeWidth="0.6" />
              <path d="M 370,555 Q 355,570 355,570" fill="none" stroke="rgba(74,222,128,0.12)" strokeWidth="0.6" />
            </svg>

            {/* Inset border glow — vitrine frame */}
            <div
              className="absolute inset-0 rounded-t-3xl pointer-events-none z-10"
              style={{
                border: "1px solid rgba(74,222,128,0.15)",
                boxShadow: "inset 0 1px 0 0 rgba(74,222,128,0.25), inset 0 0 30px rgba(74,222,128,0.04)",
              }}
            />

            {/* Overhead display lighting */}
            <div
              className="absolute top-0 left-0 right-0 h-24 pointer-events-none z-0"
              style={{ background: "linear-gradient(to bottom, rgba(74,222,128,0.06), transparent)" }}
            />

            {/* Top accent line */}
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-green-400/40 to-transparent z-10" />

            {/* Drag Handle — emerald themed */}
            <div className="pt-3 pb-2 w-full flex justify-center relative z-20">
              <div
                className="w-8 h-[2px] rounded-full"
                style={{
                  background: "linear-gradient(to right, rgba(74,222,128,0.3), rgba(74,222,128,0.6), rgba(74,222,128,0.3))",
                  boxShadow: "0 0 6px rgba(74,222,128,0.2)",
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
                    style={{ background: "radial-gradient(circle, rgba(74,222,128,0.30) 0%, rgba(31,122,79,0.10) 45%, transparent 75%)" }}
                    animate={{ opacity: [0.4, 0.7, 0.4], scale: [0.95, 1.05, 0.95] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  />
                  <FifaCardSkeleton size="lg" />
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                  <div className="w-16 h-16 bg-emerald-900/40 rounded-full flex items-center justify-center mb-4 border border-green-400/20">
                    <span className="text-2xl">😔</span>
                  </div>
                  <p className="text-green-200/70 font-medium text-sm">{error}</p>
                </div>
              ) : profile ? (
                <div className="relative mt-0">
                  {/* Breathing ambient glow behind card */}
                  <motion.div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[45%] w-[320px] h-[520px] rounded-full pointer-events-none"
                    style={{ background: "radial-gradient(circle, rgba(74,222,128,0.40) 0%, rgba(31,122,79,0.15) 45%, transparent 75%)" }}
                    animate={{ opacity: [0.5, 0.85, 0.5], scale: [0.95, 1.05, 0.95] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  />

                  {/* Card entrance wrapper with drop shadow + scale up */}
                  <motion.div
                    initial={{ opacity: 0, y: 15, scale: 1.45 }}
                    animate={{ opacity: 1, y: 0, scale: 1.45 }}
                    transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                    style={{
                      transformOrigin: "top center",
                      filter: "drop-shadow(0 4px 20px rgba(0,0,0,0.5)) drop-shadow(0 0 15px rgba(74,222,128,0.15))",
                    }}
                  >
                    <FifaPlayerCard profile={profile} animated={true} />
                  </motion.div>

                  {/* Glass shelf line below card */}
                  <div className="mt-3 flex flex-col items-center">
                    <div
                      className="w-[160px] h-[1px]"
                      style={{ background: "linear-gradient(to right, transparent, rgba(74,222,128,0.3), transparent)" }}
                    />
                    <div
                      className="w-[120px] h-[4px] mt-1 rounded-full"
                      style={{ background: "rgba(74,222,128,0.08)", filter: "blur(3px)" }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
