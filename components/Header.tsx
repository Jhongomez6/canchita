"use client";

import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/AuthContext";
import { logout } from "@/lib/auth";
import { useEffect, useState } from "react";
import { getUserProfile } from "@/lib/users";
import { useRouter } from "next/navigation";
import { getUnreadCount } from "@/lib/notifications";

export default function Header() {
  const { user } = useAuth();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    getUserProfile(user.uid).then(profile => {
      setIsAdmin(profile?.roles.includes("admin") ?? false);
    });
    getUnreadCount(user.uid).then(setUnreadCount).catch(() => { });
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
        <div className="group relative flex items-center" tabIndex={0}>
          <span className="cursor-pointer bg-amber-500 text-amber-950 px-2 py-0.5 rounded-full text-[10px] font-black tracking-widest uppercase shadow-sm border border-amber-600/50 hover:bg-amber-400 transition-colors">
            BETA
          </span>
          <div className="absolute left-0 top-full mt-2 w-64 p-3 bg-slate-800 text-white text-xs rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus:opacity-100 group-focus:visible focus-within:opacity-100 focus-within:visible transition-all z-50 pointer-events-none">
            <span className="font-bold text-amber-400 block mb-1">¡Estamos en Beta! 🚀</span>
            Estamos construyendo La Canchita contigo. Es posible que encuentres detalles por pulir, pero tu <strong className="text-emerald-300">feedback</strong> es vital para ayudarnos a mejorar.
            <div className="absolute left-4 -top-2 w-4 h-4 bg-slate-800 transform rotate-45"></div>
          </div>
        </div>
      </div>

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
            className="hidden md:block"
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
            className="hidden md:block"
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
                className="hidden md:block"
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
                className="hidden md:block"
                style={{
                  color: "#e6f6ed",
                  textDecoration: "none",
                  fontWeight: 500,
                }}
              >
                Ranking 🏆
              </Link>
              <Link
                href="/admin/feedback"
                className="hidden md:block"
                style={{
                  color: "#e6f6ed",
                  textDecoration: "none",
                  fontWeight: 500,
                }}
              >
                Feedback 💬
              </Link>
            </>
          )}

          {/* BELL ICON */}
          <Link
            href="/notifications"
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(255,255,255,0.15)",
              borderRadius: 8,
              padding: "6px 8px",
              textDecoration: "none",
              color: "#fff",
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
            {unreadCount > 0 && (
              <span style={{
                position: "absolute",
                top: 2,
                right: 2,
                background: "#ef4444",
                color: "#fff",
                fontSize: 9,
                fontWeight: 800,
                width: 16,
                height: 16,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
              }}>
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>

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
