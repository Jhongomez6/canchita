"use client";

import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { logout } from "@/lib/auth";

export default function Header() {
  const { user } = useAuth();

  return (
    <header
      style={{
        background: "linear-gradient(180deg, #1f7a4f, #145c3a)",
        color: "#fff",
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 50,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      }}
    >
      {/* LOGO / HOME */}
      <Link
        href="/"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontWeight: 700,
          fontSize: 18,
          color: "#fff",
          textDecoration: "none",
        }}
      >
        ⚽ La Canchita
      </Link>

      {/* ACCIONES USUARIO */}
      {user && (
        <div
          style={{
            display: "flex",
            gap: 14,
            alignItems: "center",
            fontSize: 14,
          }}
        >
          <Link
            href="/profile"
            style={{
              color: "#e6f6ed",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            Mi perfil
          </Link>

          <button
            onClick={logout}
            style={{
              background: "rgba(255,255,255,0.15)",
              border: "none",
              color: "#fff",
              padding: "6px 10px",
              borderRadius: 8,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Salir
          </button>
        </div>
      )}
    </header>
  );
}
