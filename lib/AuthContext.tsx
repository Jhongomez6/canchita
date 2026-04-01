"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "./auth";
import { db } from "./firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { ensureUserProfile } from "@/lib/users";
import { listenToPushMessages } from "./firebase-messaging";
import { useTokenRefresh } from "./hooks/useTokenRefresh";
import {
  initAnalytics,
  identifyUser,
  setAnalyticsUserProperties,
  logUserRegistered,
} from "@/lib/analytics";
import type { UserProfile } from "@/lib/domain/user";

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

  // 🔔 Escuchar mensajes push SOLO una vez (deferred 3s para no competir con auth)
  useEffect(() => {
    const timer = setTimeout(() => {
      listenToPushMessages();
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // 📊 Inicializar Analytics y setear user properties de sesión (deferred 3s)
  useEffect(() => {
    const timer = setTimeout(() => {
      initAnalytics().then(() => {
        const isStandalone =
          window.matchMedia("(display-mode: standalone)").matches ||
          (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
        const ua = window.navigator.userAgent.toLowerCase();
        const platform = /iphone|ipad|ipod/.test(ua)
          ? "ios"
          : /android/.test(ua)
            ? "android"
            : "desktop";
        setAnalyticsUserProperties({
          app_mode: isStandalone ? "standalone" : "browser",
          platform,
        });
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // 🔄 Auto-refresh FCM token on every app load (prevents token death spiral)
  useTokenRefresh(user, profile);

  useEffect(() => {
    let unsubscribeProfile: () => void;

    const unsub = onAuthStateChanged(auth, async currentUser => {
      if (currentUser) {
        setUser(currentUser);

        // 📊 Identificar usuario en Analytics
        identifyUser(currentUser.uid);

        // 👤 Asegurar perfil (solo crea si no existe o actualiza email/foto faltante)
        const { isNewUser } = await ensureUserProfile(
          currentUser.uid,
          currentUser.displayName || "Jugador",
          currentUser.email,
          currentUser.photoURL
        );

        // 📊 Log registro de usuario nuevo
        if (isNewUser) {
          logUserRegistered();
        }

        // ✅ Marca login reciente (se consume en la UI)
        setJustLoggedIn(true);

        // Subscribirse al documento del perfil en tiempo real
        unsubscribeProfile = onSnapshot(
          doc(db, "users", currentUser.uid),
          (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data();
              const roles = data.roles ?? (data.role ? [data.role] : ["player"]);
              const userProfile = { uid: docSnap.id, ...data, roles } as UserProfile;
              setProfile(userProfile);
              // 📊 Set user properties para segmentación en Analytics
              setAnalyticsUserProperties({
                user_role: roles.join(","),
                ...(data.age && { user_age: String(data.age) }),
                ...(data.sex && { user_sex: data.sex }),
              });
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
        identifyUser("");
        if (unsubscribeProfile) unsubscribeProfile();
      }
    });

    return () => {
      unsub();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  // Hide the inline HTML splash once auth resolves (use CSS, not .remove(), to avoid hydration mismatch)
  useEffect(() => {
    if (!initialLoad) {
      const splash = document.getElementById("app-splash");
      if (splash) {
        splash.style.opacity = "0";
        splash.style.pointerEvents = "none";
        splash.style.transition = "opacity 0.3s ease-out";
        setTimeout(() => { splash.style.display = "none"; }, 300);
      }
    }
  }, [initialLoad]);

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
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
