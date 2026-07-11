"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "./auth";
import { db } from "./firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { ensureUserProfile, type SignupIntent } from "@/lib/users";
import { migrateGooglePhotoToStorage, generateThumbFromStorageURL } from "@/lib/avatarMigration";
import { listenToPushMessages } from "./firebase-messaging";
import { useTokenRefresh } from "./hooks/useTokenRefresh";
import {
  initAnalytics,
  identifyUser,
  setAnalyticsUserProperties,
  logUserRegistered,
  logLocationAdminSignupCompleted,
  logBookingOnlySignupCompleted,
  logQueryTimeout,
  logQueryError,
} from "@/lib/analytics";

const SIGNUP_INTENT_KEY = "signupIntent";

function consumeSignupIntent(): SignupIntent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SIGNUP_INTENT_KEY);
    if (raw) window.sessionStorage.removeItem(SIGNUP_INTENT_KEY);
    if (raw === "location_admin") return "location_admin";
    if (raw === "booking") return "booking";
    return null;
  } catch {
    return null;
  }
}
import type { UserProfile } from "@/lib/domain/user";

type AuthContextType = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  initialLoad: boolean;
  justLoggedIn: boolean;
  /** true si el perfil no pudo cargar (timeout del watchdog o error del snapshot). */
  profileError: boolean;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  initialLoad: true,
  justLoggedIn: false,
  profileError: false,
});

/**
 * Tiempo máximo que esperamos al perfil antes de dejar de bloquear la UI.
 * En iOS PWA el canal de Firestore puede quedar suspendido al volver de background
 * y el `getDoc`/primer emit del `onSnapshot` no resuelve nunca. Pasado este tiempo
 * degradamos a un estado de error con "Reintentar" en vez de un loader infinito.
 */
const PROFILE_LOAD_TIMEOUT_MS = 12_000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [justLoggedIn, setJustLoggedIn] = useState(false);
  const [profileError, setProfileError] = useState(false);

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
    let unsubscribeProfile: (() => void) | undefined;
    let watchdog: ReturnType<typeof setTimeout> | undefined;

    const clearWatchdog = () => {
      if (watchdog) {
        clearTimeout(watchdog);
        watchdog = undefined;
      }
    };

    const unsub = onAuthStateChanged(auth, currentUser => {
      // Limpiar la suscripción y el watchdog de la sesión anterior (cambio de usuario / logout).
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = undefined;
      }
      clearWatchdog();

      if (!currentUser) {
        setUser(null);
        setProfile(null);
        setJustLoggedIn(false);
        setProfileError(false);
        setLoading(false);
        setInitialLoad(false);
        identifyUser("");
        return;
      }

      setUser(currentUser);
      setProfileError(false);
      setJustLoggedIn(true); // ✅ Marca login reciente (se consume en la UI)

      // 📊 Identificar usuario en Analytics
      identifyUser(currentUser.uid);

      // 👤 Asegurar perfil (crea si no existe o actualiza email/foto faltante).
      // Corre en PARALELO — NO bloquea la suscripción al snapshot. Si `ensureUserProfile`
      // se cuelga (iOS suspende Firestore), el `onSnapshot` y el watchdog siguen su curso:
      // para usuarios existentes el perfil llega igual; para usuarios nuevos llega en cuanto
      // se termina de crear el doc. (Antes este `await` bloqueaba todo → skeleton infinito.)
      const signupIntent = consumeSignupIntent();
      ensureUserProfile(
        currentUser.uid,
        currentUser.displayName || "Jugador",
        currentUser.email,
        currentUser.photoURL,
        signupIntent
      )
        .then(({ isNewUser }) => {
          if (isNewUser) {
            logUserRegistered();
            if (signupIntent === "location_admin") {
              logLocationAdminSignupCompleted();
            } else if (signupIntent === "booking") {
              logBookingOnlySignupCompleted();
            }
          }
        })
        .catch((err) => {
          console.error("ensureUserProfile falló (no bloquea la carga):", err);
        });

      // ⏱️ Watchdog: si el perfil no llega en PROFILE_LOAD_TIMEOUT_MS (canal de Firestore
      // suspendido en iOS), dejamos de bloquear la UI y marcamos error para que AuthGuard
      // ofrezca "Reintentar" en vez de un loader infinito.
      watchdog = setTimeout(() => {
        watchdog = undefined;
        logQueryTimeout({ source: "auth_profile", fromVisibility: false, hadCache: false });
        setProfileError(true);
        setLoading(false);
        setInitialLoad(false);
      }, PROFILE_LOAD_TIMEOUT_MS);

      // Subscribirse al documento del perfil en tiempo real (ya, sin esperar a ensureUserProfile).
      unsubscribeProfile = onSnapshot(
        doc(db, "users", currentUser.uid),
        (docSnap) => {
          if (docSnap.exists()) {
            // Perfil real disponible → cancelamos el watchdog y limpiamos cualquier error.
            clearWatchdog();
            setProfileError(false);
            const data = docSnap.data();
            const roles = data.roles ?? (data.role ? [data.role] : ["player"]);
            const userProfile = { uid: docSnap.id, ...data, roles } as UserProfile;
            setProfile(userProfile);
            // Migración automática: si tiene URL de Google y no tiene thumb, migrar todo a Storage
            if (
              userProfile.photoURL?.includes("lh3.googleusercontent.com") &&
              !userProfile.photoURLThumb
            ) {
              migrateGooglePhotoToStorage(userProfile.uid, userProfile.photoURL).catch(() => {});
            // Usuarios con foto legacy en Storage (avatars/{uid}.webp) sin thumb
            } else if (
              userProfile.photoURL?.includes("firebasestorage.googleapis.com") &&
              !userProfile.photoURLThumb
            ) {
              generateThumbFromStorageURL(userProfile.uid, userProfile.photoURL).catch(() => {});
            }
            // 📊 Set user properties para segmentación en Analytics
            setAnalyticsUserProperties({
              user_role: roles.join(","),
              ...(data.age && { user_age: String(data.age) }),
              ...(data.sex && { user_sex: data.sex }),
            });
          } else {
            // Doc todavía no existe (usuario nuevo: ensureUserProfile lo está creando).
            // NO cancelamos el watchdog: si la creación se cuelga, el watchdog rescata igual.
            setProfile(null);
          }
          setLoading(false);
          setInitialLoad(false);
        },
        (error) => {
          clearWatchdog();
          console.error("Error escuchando el perfil de usuario:", error);
          logQueryError({
            source: "auth_profile",
            fromVisibility: false,
            hadCache: false,
            errorCode: error.name || "snapshot_error",
          });
          setProfileError(true);
          setLoading(false);
          setInitialLoad(false);
        }
      );
    });

    return () => {
      unsub();
      if (unsubscribeProfile) unsubscribeProfile();
      clearWatchdog();
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
        profileError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
