"use client";

import { useAuth } from "@/lib/AuthContext";
import { loginWithGoogle } from "@/lib/auth";

export default function AuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return <p style={{ padding: 20 }}>Cargando...</p>;
  }

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

  return <>{children}</>;
}
