"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getUserProfile } from "@/lib/users";
import type { UserProfile } from "@/lib/domain/user";
import FifaPlayerCard from "./FifaPlayerCard";

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
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-[100]"
            onClick={onClose}
          />

          {/* Bottom Sheet */}
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
            className="fixed bottom-0 left-0 right-0 z-[101] flex flex-col items-center bg-white rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.12)] max-h-[85vh] overflow-hidden"
          >
            {/* Drag Handle */}
            <div className="pt-3 pb-2 w-full flex justify-center">
              <div className="w-10 h-1.5 bg-slate-200 rounded-full" />
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto w-full flex flex-col items-center px-4 pb-8">
              {loading ? (
                /* Skeleton matching card shape */
                <div className="w-[185px] h-[320px] rounded-2xl bg-slate-100 animate-pulse mt-4" />
              ) : error ? (
                <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                    <span className="text-2xl">😔</span>
                  </div>
                  <p className="text-slate-500 font-medium text-sm">{error}</p>
                </div>
              ) : profile ? (
                <div className="mt-2">
                  <FifaPlayerCard profile={profile} animated={true} />
                </div>
              ) : null}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
