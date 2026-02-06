"use client";

import { useAuth } from "@/lib/AuthContext";
import { loginWithGoogle } from "@/lib/auth";
import { useEffect, useState } from "react";
import { getUserProfile } from "@/lib/users";
import { useRouter, usePathname } from "next/navigation";

export default function AuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const router = useRouter();
  const pathname = usePathname();

  // 🔹 Cargar perfil cuando hay usuario
  useEffect(() => {
    if (!user) return;

    getUserProfile(user.uid).then(p => {
      setProfile(p);
    });
  }, [user]);

  // ⏳ Auth o perfil cargando
  if (loading || (user && !profile)) {
    return <p style={{ padding: 20 }}>Cargando...</p>;
  }

  // ❌ No logueado
  if (!user) {
    return (
      <div style={{ padding: 20 }}>
        <h2>Debes iniciar sesión</h2>
        <button onClick={loginWithGoogle}>
          Entrar con Google
        </button>
      </div>
    );
  }

  // 🚨 PERFIL INCOMPLETO → FORZAR A /profile
  if (
    profile.role === "player" &&
    (!profile.positions || profile.positions.length === 0) &&
    pathname !== "/profile"
  ) {
    router.replace("/profile");
    return null;
  }

  // ✅ Todo OK
  return <>{children}</>;
}
