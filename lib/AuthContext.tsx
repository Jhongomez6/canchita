"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "./auth";
import { ensureUserProfile } from "@/lib/users";
import { listenToPushMessages } from "./firebase-messaging";

type AuthContextType = {
  user: User | null;
  loading: boolean;
  justLoggedIn: boolean;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  justLoggedIn: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [justLoggedIn, setJustLoggedIn] = useState(false);

  // 🔔 Escuchar mensajes push SOLO una vez
  useEffect(() => {
    listenToPushMessages();
  }, []);

  useEffect(() => {
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
      } else {
        setUser(null);
        setJustLoggedIn(false);
      }

      setLoading(false);
    });

    return () => unsub();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
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
