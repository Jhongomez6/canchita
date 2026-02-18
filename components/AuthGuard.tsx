"use client";

import { useAuth } from "@/lib/AuthContext";
import { loginWithGoogle } from "@/lib/auth";
import { useEffect, useState } from "react";
import { getUserProfile } from "@/lib/users";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import type { UserProfile } from "@/lib/domain/user";

export default function AuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  // 🔹 Cargar perfil cuando hay usuario
  useEffect(() => {
    if (!user) return;

    getUserProfile(user.uid)
      .then(p => {
        setProfile(p || { uid: user.uid, name: user.displayName || '', role: "player" as const, positions: [] });
      })
      .catch(err => {
        console.error("Error cargando perfil en AuthGuard:", err);
        setProfile({ uid: user.uid, name: user.displayName || '', role: "player" as const, positions: [] });
      });
  }, [user]);

  // 🔹 Redirigir a /profile si el perfil está incompleto
  useEffect(() => {
    if (
      profile &&
      profile.role === "player" &&
      (!profile.positions || profile.positions.length === 0) &&
      pathname !== "/profile"
    ) {
      router.replace("/profile");
    }
  }, [profile, pathname, router]);

  // ⏳ Auth o perfil cargando
  if (loading || (user && !profile)) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(135deg, #1f7a4f 0%, #145c3a 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 24,
            padding: "48px 40px",
            maxWidth: 440,
            width: "100%",
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            textAlign: "center",
          }}
        >
          <div style={{ marginBottom: 24 }}>
            <Image
              src="/logo/lacanchita-logo.png"
              alt="La Canchita"
              width={120}
              height={100}
              style={{ margin: "0 auto" }}
            />
          </div>
          <p style={{ fontSize: 18, color: "#666" }}>Cargando...</p>
        </div>
      </div>
    );
  }

  // ❌ No logueado
  if (!user) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(135deg, #1f7a4f 0%, #145c3a 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 24,
            padding: "48px 40px",
            maxWidth: 440,
            width: "100%",
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            textAlign: "center",
          }}
        >
          {/* LOGO */}
          <div style={{ marginBottom: 24 }}>
            <Image
              src="/logo/lacanchita-logo.png"
              alt="La Canchita"
              width={120}
              height={100}
              style={{ margin: "0 auto" }}
            />
          </div>

          {/* TÍTULO */}
          <h1
            style={{
              fontSize: 32,
              fontWeight: 700,
              color: "#1f7a4f",
              marginBottom: 12,
            }}
          >
            Bienvenido a La Canchita
          </h1>

          {/* DESCRIPCIÓN */}
          <p
            style={{
              fontSize: 16,
              color: "#666",
              marginBottom: 32,
              lineHeight: 1.6,
            }}
          >
            Inicia sesión para comenzar.
          </p>

          {/* BOTÓN GOOGLE */}
          <button
            onClick={loginWithGoogle}
            style={{
              width: "100%",
              background: "#fff",
              border: "2px solid #ddd",
              borderRadius: 12,
              padding: "14px 24px",
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              transition: "all 0.2s ease",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "#f8f9fa";
              e.currentTarget.style.borderColor = "#1f7a4f";
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "#fff";
              e.currentTarget.style.borderColor = "#ddd";
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)";
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continuar con Google
          </button>

          {/* FOOTER */}
          <p
            style={{
              fontSize: 13,
              color: "#999",
              marginTop: 24,
              lineHeight: 1.5,
            }}
          >
            Al continuar, aceptas nuestros términos de servicio y política de
            privacidad.
          </p>
        </div>
      </div>
    );
  }

  // 🚨 PERFIL INCOMPLETO → Mostrar pantalla de redirección
  if (
    profile &&
    profile.role === "player" &&
    (!profile.positions || profile.positions.length === 0) &&
    pathname !== "/profile"
  ) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(135deg, #1f7a4f 0%, #145c3a 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 24,
            padding: "48px 40px",
            maxWidth: 440,
            width: "100%",
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            textAlign: "center",
          }}
        >
          <div style={{ marginBottom: 24 }}>
            <Image
              src="/logo/lacanchita-logo.png"
              alt="La Canchita"
              width={120}
              height={100}
              style={{ margin: "0 auto" }}
            />
          </div>
          <p style={{ fontSize: 18, color: "#666" }}>Redirigiendo a tu perfil...</p>
        </div>
      </div>
    );
  }

  // ✅ Todo OK
  return <>{children}</>;
}
