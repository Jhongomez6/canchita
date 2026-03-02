"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "./auth";
import { db } from "./firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { ensureUserProfile } from "@/lib/users";
import { listenToPushMessages } from "./firebase-messaging";
import type { UserProfile } from "@/lib/domain/user";

type AuthContextType = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  justLoggedIn: boolean;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  justLoggedIn: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [justLoggedIn, setJustLoggedIn] = useState(false);

  // 🔔 Escuchar mensajes push SOLO una vez
  useEffect(() => {
    listenToPushMessages();
  }, []);

  useEffect(() => {
    let unsubscribeProfile: () => void;

    const unsub = onAuthStateChanged(auth, async currentUser => {
      if (currentUser) {
        setUser(currentUser);

        // 👤 Asegurar perfil (solo crea si no existe)
        await ensureUserProfile(
          currentUser.uid,
          currentUser.displayName || "Jugador"
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
        justLoggedIn,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
