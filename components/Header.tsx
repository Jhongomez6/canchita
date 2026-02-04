"use client";

import { useAuth } from "@/lib/AuthContext";
import { logout } from "@/lib/auth";

export default function Header() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <header
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px 20px",
        borderBottom: "1px solid #ddd",
      }}
    >
      <strong>⚽ La Canchita</strong>

      <div>
        <span style={{ marginRight: 12 }}>
          {user.displayName}
        </span>

        <button onClick={logout}>
          Cerrar sesión
        </button>
      </div>
    </header>
  );
}
