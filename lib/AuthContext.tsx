"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "./auth";
import { db } from "./firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { ensureUserProfile } from "@/lib/users";
import { listenToPushMessages } from "./firebase-messaging";
import { useTokenRefresh } from "./hooks/useTokenRefresh";
import type { UserProfile } from "@/lib/domain/user";
import Image from "next/image";

type AuthContextType = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  initialLoad: boolean;
  justLoggedIn: boolean;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  initialLoad: true,
  justLoggedIn: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [justLoggedIn, setJustLoggedIn] = useState(false);

  // 🔔 Escuchar mensajes push SOLO una vez
  useEffect(() => {
    listenToPushMessages();
  }, []);

  // 🔄 Auto-refresh FCM token on every app load (prevents token death spiral)
  useTokenRefresh(user, profile);

  useEffect(() => {
    let unsubscribeProfile: () => void;

    const unsub = onAuthStateChanged(auth, async currentUser => {
      if (currentUser) {
        setUser(currentUser);

        // 👤 Asegurar perfil (solo crea si no existe o actualiza email/foto faltante)
        await ensureUserProfile(
          currentUser.uid,
          currentUser.displayName || "Jugador",
          currentUser.email,
          currentUser.photoURL
        );

        // ✅ Marca login reciente (se consume en la UI)
        setJustLoggedIn(true);

        // Subscribirse al documento del perfil en tiempo real
        unsubscribeProfile = onSnapshot(
          doc(db, "users", currentUser.uid),
          (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data();
              const roles = data.roles ?? (data.role ? [data.role] : ["player"]);
              setProfile({ uid: docSnap.id, ...data, roles } as UserProfile);
            } else {
              setProfile(null);
            }
            setLoading(false); // Termina de cargar solo cuando tenemos el perfil
            setInitialLoad(false);
          },
          (error) => {
            console.error("Error escuchando el perfil de usuario:", error);
            setLoading(false);
          }
        );

      } else {
        setUser(null);
        setProfile(null);
        setJustLoggedIn(false);
        setLoading(false);
        setInitialLoad(false);
        if (unsubscribeProfile) unsubscribeProfile();
      }
    });

    return () => {
      unsub();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        initialLoad,
        justLoggedIn,
      }}
    >
      {initialLoad ? (
        <div className="min-h-screen bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] flex items-center justify-center p-5">
          <div className="bg-white rounded-3xl p-10 max-w-md w-full shadow-2xl text-center">
            <div className="mb-6 flex justify-center">
              <Image
                src="/logo/lacanchita-logo.png"
                alt="La Canchita"
                width={120}
                height={100}
                style={{ height: "auto", width: "auto" }}
                priority={true}
              />
            </div>
            <div className="flex justify-center items-center gap-2 mt-4">
              <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-[bounce_1s_infinite_0ms]"></div>
              <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-[bounce_1s_infinite_200ms]"></div>
              <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-[bounce_1s_infinite_400ms]"></div>
            </div>
          </div>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
