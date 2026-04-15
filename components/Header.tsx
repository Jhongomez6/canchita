"use client";

import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/AuthContext";
import { logout } from "@/lib/auth";
import { useEffect, useState, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getUnreadCount } from "@/lib/notifications";
import { isSuperAdmin, hasWalletAccess } from "@/lib/domain/user";
import { logNotificationsOpened, logTooltipOpened } from "@/lib/analytics";
import { subscribeToWallet } from "@/lib/wallet";
import { formatCOP } from "@/lib/domain/wallet";
import dynamic from "next/dynamic";
const NotificationsDrawer = dynamic(() => import("./NotificationsDrawer"), { ssr: false });

export default function Header() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const skipFetchRef = useRef(false);

  const isAdmin = profile?.roles?.includes("admin") ?? false;
  const isSuperAdminUser = profile ? isSuperAdmin(profile) : false;

  const getAdminBadge = () => {
    if (!isAdmin) return null;
    switch (profile?.adminType) {
      case "super_admin": return "🏆 SA";
      case "location_admin": return "🏟️ ADMIN";
      case "team_admin": return "👥 ADMIN";
      default: return "🛡️ ADMIN";
    }
  };

  // Refresh unread count on navigation and tab focus
  useEffect(() => {
    if (!user) return;

    const fetchCount = () => {
      if (skipFetchRef.current) {
        skipFetchRef.current = false;
        return;
      }
      getUnreadCount(user.uid).then(setUnreadCount).catch(() => { });
    };

    // Don't fetch while drawer is open (it handles its own state)
    if (!isDrawerOpen) {
      fetchCount();
    }

    const handleVisibility = () => {
      if (document.visibilityState === "visible" && !isDrawerOpen) fetchCount();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [user, pathname, isDrawerOpen]);

  // Suscripción en tiempo real al saldo de billetera (solo si tiene acceso)
  useEffect(() => {
    if (!user || !profile || !hasWalletAccess(profile)) {
      setWalletBalance(null);
      return;
    }
    const unsub = subscribeToWallet(user.uid, (w) => {
      setWalletBalance(w?.balanceCOP ?? 0);
    });
    return () => unsub();
  }, [user, profile]);

  // Sync unread count → OS app badge (Badging API)
  useEffect(() => {
    if ("setAppBadge" in navigator) {
      if (unreadCount > 0) {
        navigator.setAppBadge(unreadCount).catch(() => {});
      } else {
        navigator.clearAppBadge().catch(() => {});
      }
    }
  }, [unreadCount]);

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  if (pathname?.startsWith("/campaigns")) return null;

  return (
    <header
      style={{
        background: "linear-gradient(180deg, #1f7a4f, #145c3a)",
        color: "#fff",
        padding: "12px 16px",
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
            width={70}
            height={60}
            style={{ borderRadius: 6 }}
            priority={true}
            unoptimized={true}
          />
        </Link>
        <div className="group relative flex items-center gap-1" tabIndex={0} onMouseEnter={() => logTooltipOpened("beta_admin_badge")}>
          <span className="cursor-pointer bg-amber-500 text-amber-950 px-2 py-0.5 rounded-full text-[10px] font-black tracking-widest uppercase shadow-sm border border-amber-600/50 hover:bg-amber-400 transition-colors">
            BETA
          </span>

          {isAdmin && (
            <span className="bg-emerald-800 text-emerald-100 px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm border border-emerald-700">
              {getAdminBadge()}
            </span>
          )}

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
            href="/explore"
            className="hidden md:block"
            style={{
              color: "#e6f6ed",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            Explorar
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

          {isSuperAdminUser && (
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
                href="/admin/applications"
                className="hidden md:block"
                style={{
                  color: "#e6f6ed",
                  textDecoration: "none",
                  fontWeight: 500,
                }}
              >
                Aplicaciones 📝
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
              <Link
                href="/admin/push-test"
                className="hidden md:block"
                style={{
                  color: "#e6f6ed",
                  textDecoration: "none",
                  fontWeight: 500,
                }}
              >
                Push 🧪
              </Link>
            </>
          )}

          {/* WALLET BALANCE PILL */}
          {walletBalance !== null && (
            <Link
              href="/wallet"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                background: "#ffffff",
                borderRadius: 8,
                padding: "5px 10px",
                color: "#1f7a4f",
                fontWeight: 700,
                fontSize: 13,
                textDecoration: "none",
                whiteSpace: "nowrap",
                letterSpacing: "-0.01em",
              }}
            >
              {/* Wallet icon inline */}
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
                <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
              </svg>
              {formatCOP(walletBalance)}
            </Link>
          )}

          {/* BELL ICON */}
          <button
            onClick={() => {
              logNotificationsOpened();
              setIsDrawerOpen(true);
            }}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(255,255,255,0.15)",
              border: "none",
              borderRadius: 8,
              padding: "6px 8px",
              cursor: "pointer",
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
          </button>

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
      {/* NOTIFICATIONS DRAWER */}
      <NotificationsDrawer
        isOpen={isDrawerOpen}
        onClose={() => {
          skipFetchRef.current = true;
          setUnreadCount(0);
          setIsDrawerOpen(false);
        }}
      />
    </header>
  );
}
