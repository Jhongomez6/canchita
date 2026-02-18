"use client";

import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/AuthContext";
import { logout } from "@/lib/auth";
import { useEffect, useState } from "react";
import { getUserProfile } from "@/lib/users";
import { useRouter } from "next/navigation";

export default function Header() {
  const { user } = useAuth();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user) return;
    getUserProfile(user.uid).then(profile => {
      setIsAdmin(profile?.roles.includes("admin") ?? false);
    });
  }, [user]);

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

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
        <Image
          src="/logo/lacanchita-logo.png"
          alt="La Canchita"
          width={60}
          height={50}
          style={{ borderRadius: 6 }}
        />
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
            href="/"
            style={{
              color: "#e6f6ed",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            Partidos
          </Link>

          <Link
            href="/profile"
            style={{
              color: "#e6f6ed",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            Perfil
          </Link>

          {isAdmin && (
            <>
              <Link
                href="/admin/users"
                style={{
                  color: "#e6f6ed",
                  textDecoration: "none",
                  fontWeight: 500,
                }}
              >
                Usuarios
              </Link>
              <Link
                href="/admin/ranking"
                style={{
                  color: "#e6f6ed",
                  textDecoration: "none",
                  fontWeight: 500,
                }}
              >
                Ranking 🏆
              </Link>
            </>
          )}

          <button
            onClick={handleLogout}
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
