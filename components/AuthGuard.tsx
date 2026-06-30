"use client";

import { useAuth } from "@/lib/AuthContext";
import { loginWithGoogle } from "@/lib/auth";
import { useEffect, useState, Suspense } from "react";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Image from "next/image";
import { isInAppBrowser } from "@/lib/browser";
import { isLocationAdmin } from "@/lib/domain/user";
import LandingPage from "./LandingPage";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function AuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense>
      <AuthGuardInner>{children}</AuthGuardInner>
    </Suspense>
  );
}

function AuthGuardInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, loading, profileError } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [inApp, setInApp] = useState(false);

  useEffect(() => {
    const delay = setTimeout(() => {
      setInApp(isInAppBrowser());
    }, 0);
    return () => clearTimeout(delay);
  }, []);

  // 🔹 Redirigir a /onboarding si no ha completado el rating inicial
  useEffect(() => {
    if (
      profile &&
      !profile.deleted &&
      profile.roles.includes("player") &&
      !profile.initialRatingCalculated &&
      pathname !== "/onboarding"
    ) {
      router.replace("/onboarding");
    }
  }, [profile, pathname, router]);

  // 🔹 Redirigir a /onboarding/phone si necesita teléfono.
  // Aplica a:
  //   - Players que ya completaron onboarding pero no tienen teléfono.
  //   - Location admins (siempre necesitan teléfono de contacto del negocio).
  useEffect(() => {
    if (!profile || profile.deleted || profile.phone) return;
    if (pathname === "/onboarding/phone") return;

    const isPlayerNeedingPhone =
      profile.roles.includes("player") && profile.initialRatingCalculated;
    const isLocAdmin = isLocationAdmin(profile);

    if (isPlayerNeedingPhone || isLocAdmin) {
      router.replace("/onboarding/phone");
    }
  }, [profile, pathname, router]);

  // ❌ No logueado -> Mostrar la nueva Landing Page o Redirigir
  // Este hook debe ir ANTES de cualquier return temprano (Reglas de Hooks)
  useEffect(() => {
    if (!loading && !user && pathname !== "/") {
      const currentSearchParamsStr = searchParams.toString();
      const currentFullPath = currentSearchParamsStr ? `${pathname}?${currentSearchParamsStr}` : pathname;
      const newUrl = `/?returnTo=${encodeURIComponent(currentFullPath)}`;
      router.replace(newUrl);
    }
  }, [loading, user, pathname, searchParams, router]);

  // ⚠️ El perfil no pudo cargar (watchdog del AuthContext o error del snapshot).
  // En iOS PWA el canal de Firestore puede quedar suspendido y el perfil no llega nunca:
  // en vez de un loader infinito, ofrecemos reintentar recargando la app.
  if (profileError && user && !profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] flex items-center justify-center p-5">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl text-center">
          <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={22} className="text-amber-500" />
          </div>
          <p className="font-bold text-slate-800">No pudimos cargar tu perfil</p>
          <p className="text-sm text-slate-500 mt-1 mb-6">
            Revisá tu conexión e intentá de nuevo.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center gap-2 w-full py-3 bg-[#1f7a4f] text-white rounded-xl font-bold active:scale-[0.98] transition-transform"
          >
            <RefreshCw size={16} />
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  // ⏳ Auth o perfil cargando
  if (loading || (user && !profile)) {
    return (
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
              unoptimized
            />
          </div>
          <div className="flex justify-center items-center gap-2 mt-4">
            <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-[bounce_1s_infinite_0ms]"></div>
            <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-[bounce_1s_infinite_200ms]"></div>
            <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-[bounce_1s_infinite_400ms]"></div>
          </div>
        </div>
      </div>
    );
  }

  // ❌ No logueado -> Mostrar la nueva Landing Page o Redirigir

  if (!user) {
    if (pathname !== "/") {
      return (
        <div className="min-h-screen bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] flex items-center justify-center p-5">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-[#1f7a4f] rounded-full animate-spin"></div>
        </div>
      );
    }

    const handleGoogleLogin = async () => {
      if (inApp || isInAppBrowser()) {
        setInApp(true);
        return;
      }
      try {
        await loginWithGoogle();
      } catch (error) {
        console.error(error);
        throw error; // Let LandingPage catch it to reset loading state
      }
    };

    return <LandingPage inApp={inApp} onLoginClick={handleGoogleLogin} />;
  }

  // 🚨 FALTA ONBOARDING → Mostrar pantalla de redirección
  if (
    profile &&
    !profile.deleted &&
    profile.roles.includes("player") &&
    !profile.initialRatingCalculated &&
    pathname !== "/onboarding"
  ) {
    return (
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
              unoptimized
            />
          </div>
          <p className="text-lg text-slate-500 font-medium">Preparando tu evaluación...</p>
        </div>
      </div>
    );
  }

  // 🚨 FALTA CELULAR → Mostrar pantalla de redirección
  if (
    profile &&
    !profile.deleted &&
    !profile.phone &&
    pathname !== "/onboarding/phone" &&
    (
      (profile.roles.includes("player") && profile.initialRatingCalculated) ||
      isLocationAdmin(profile)
    )
  ) {
    return (
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
              unoptimized
            />
          </div>
          <p className="text-lg text-slate-500 font-medium">Verificando información de contacto...</p>
        </div>
      </div>
    );
  }

  // ✅ Todo OK
  return <>{children}</>;
}
