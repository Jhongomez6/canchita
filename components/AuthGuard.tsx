"use client";

import { useAuth } from "@/lib/AuthContext";
import { loginWithGoogle } from "@/lib/auth";
import { useEffect, useState, Suspense } from "react";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Image from "next/image";
import { isInAppBrowser } from "@/lib/browser";
import LandingPage from "./LandingPage";

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
  const { user, profile, loading } = useAuth();
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

  // 🔹 Redirigir a /onboarding/phone si ya hizo onboarding pero no tiene teléfono
  useEffect(() => {
    if (
      profile &&
      !profile.deleted &&
      profile.roles.includes("player") &&
      profile.initialRatingCalculated &&
      !profile.phone &&
      pathname !== "/onboarding/phone"
    ) {
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
    profile.roles.includes("player") &&
    profile.initialRatingCalculated &&
    !profile.phone &&
    pathname !== "/onboarding/phone"
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
