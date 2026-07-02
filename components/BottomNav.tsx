"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { motion, LayoutGroup } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { isSuperAdmin as checkIsSuperAdmin, isLocationAdmin as checkIsLocationAdmin, hasBookingAccess as checkHasBookingAccess, hasWorldCupAccess } from "@/lib/domain/user";
import { getPendingApplicationsCount } from "@/lib/teamAdminApplications";
import { getPendingReportsCount } from "@/lib/matchReview";
import { getWorldCupConfig } from "@/lib/worldcup";
import PlayerAvatar from "@/components/PlayerAvatar";

// Ícono de contorno, tamaño Instagram (24px). El color lo hereda (currentColor)
// del contenedor según estado activo/inactivo.
function NavIcon({ children }: { children: ReactNode }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-6 h-6"
        >
            {children}
        </svg>
    );
}

// Píldora verde deslizante que marca el ítem activo (estilo Instagram).
// El layoutId compartido hace que Framer la anime entre íconos al navegar.
function ActivePill() {
    return (
        <motion.span
            layoutId="nav-active-pill"
            className="absolute inset-y-2 left-1 right-1 rounded-full bg-[#1f7a4f]"
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
        />
    );
}

// Celda de navegación: ancho uniforme (flex-1), pill activo detrás y contenido encima.
function NavItem({ href, active, label, children }: { href: string; active: boolean; label: string; children: ReactNode }) {
    return (
        <Link
            href={href}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className="relative flex items-center justify-center flex-1 h-full"
        >
            {active && <ActivePill />}
            <span className={`relative z-10 flex items-center justify-center transition-transform active:scale-90 ${active ? "text-white" : "text-gray-400"}`}>
                {children}
            </span>
        </Link>
    );
}

export default function BottomNav() {
    const pathname = usePathname();
    const { user, profile } = useAuth();
    const isSuperAdminUser = profile ? checkIsSuperAdmin(profile) : false;
    const isLocationAdminUser = profile ? checkIsLocationAdmin(profile) : false;
    const hasBooking = profile ? checkHasBookingAccess(profile) : false;
    const isPlayer = profile?.roles?.includes("player") ?? false;
    const [pendingApps, setPendingApps] = useState(0);
    const [pendingReports, setPendingReports] = useState(0);
    const [pollEnabled, setPollEnabled] = useState(false);
    const [joinByCodeOpen, setJoinByCodeOpen] = useState(false);
    const [isScrolling, setIsScrolling] = useState(false);
    const hasWcAccess = profile ? hasWorldCupAccess(profile, pollEnabled) : false;
    const showWorldCup = hasWcAccess || joinByCodeOpen;
    const worldCupHref = isSuperAdminUser ? "/worldcup/admin" : hasWcAccess ? "/worldcup" : "/worldcup/join";

    // Avatar real del usuario en el slot de Perfil (firma del look Instagram).
    const profilePhoto = profile?.photoURLThumb ?? profile?.photoURL ?? null;
    const initials = profile?.name
        ? profile.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
        : "?";
    const profileActive = pathname === "/profile";

    useEffect(() => {
        if (!isSuperAdminUser) return;
        getPendingApplicationsCount()
            .then((count) => setPendingApps(count))
            .catch(() => {/* silencioso */});
        getPendingReportsCount()
            .then((count) => setPendingReports(count))
            .catch(() => {/* silencioso */});
    }, [isSuperAdminUser]);

    // Polla mundialista — flag global + flag por usuario + acceso por código abierto
    useEffect(() => {
        if (!user) return;
        getWorldCupConfig()
            .then((cfg) => {
                setPollEnabled(cfg.pollEnabled);
                setJoinByCodeOpen(cfg.joinByCodeOpen === true);
            })
            .catch(() => {/* silencioso */});
    }, [user]);

    // Encoge la barra mientras se hace scroll y la restaura al detenerse (estilo Instagram).
    // El guard `scrolling` evita re-renders en cada frame: solo cambia estado en los bordes.
    useEffect(() => {
        let timeout: ReturnType<typeof setTimeout>;
        let scrolling = false;
        const onScroll = () => {
            if (!scrolling) {
                scrolling = true;
                setIsScrolling(true);
            }
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                scrolling = false;
                setIsScrolling(false);
            }, 200);
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            window.removeEventListener("scroll", onScroll);
            clearTimeout(timeout);
        };
    }, []);

    if (!user) return null;

    // Don't show bottom nav on onboarding
    if (pathname === "/onboarding") return null;

    return (
        <div
            className="fixed inset-x-0 bottom-0 z-50 px-3 md:hidden"
            style={{
                paddingBottom: "max(env(safe-area-inset-bottom), 8px)",
                // Fuerza capa compuesta: estabiliza position:fixed en iOS/WebKit
                // (sin esto la barra "salta" al medio de la pantalla al scrollear/abrir teclado).
                WebkitTransform: "translateZ(0)",
                transform: "translateZ(0)",
            }}
        >
            <LayoutGroup>
                <nav
                    aria-label="Navegación principal"
                    className={`mx-auto flex h-16 max-w-md items-stretch justify-between rounded-full border border-black/5 bg-white px-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.12)] transition-transform duration-300 ease-out ${isScrolling ? "scale-90 opacity-95" : "scale-100"}`}
                >
                    {/* HOME (Players + Super Admin) */}
                    {(isPlayer || isSuperAdminUser) && (
                        <NavItem href="/" active={pathname === "/"} label="Inicio">
                            <NavIcon>
                                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                                <polyline points="9 22 9 12 15 12 15 22" />
                            </NavIcon>
                        </NavItem>
                    )}

                    {/* EXPLORE (Players + Super Admin) */}
                    {(isPlayer || isSuperAdminUser) && (
                        <NavItem href="/explore" active={pathname === "/explore"} label="Buscar">
                            <NavIcon>
                                <circle cx="11" cy="11" r="8" />
                                <path d="m21 21-4.3-4.3" />
                            </NavIcon>
                        </NavItem>
                    )}

                    {/* RESERVAS (behind bookingEnabled flag) */}
                    {hasBooking && !isSuperAdminUser && (
                        <NavItem
                            href="/bookings"
                            active={pathname.startsWith("/venues") || pathname.startsWith("/bookings")}
                            label="Reservas"
                        >
                            <NavIcon>
                                <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                                <line x1="16" x2="16" y1="2" y2="6" />
                                <line x1="8" x2="8" y1="2" y2="6" />
                                <line x1="3" x2="21" y1="10" y2="10" />
                            </NavIcon>
                        </NavItem>
                    )}

                    {/* HISTORY (Players only — no super admin, no admin-sin-player) */}
                    {!isSuperAdminUser && isPlayer && (
                        <NavItem href="/history" active={pathname === "/history"} label="Historial">
                            <NavIcon>
                                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                                <path d="M21 3v5h-5" />
                                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                                <path d="M3 21v-5h5" />
                            </NavIcon>
                        </NavItem>
                    )}

                    {/* VENUES ADMIN (Super Admin Only) */}
                    {isSuperAdminUser && (
                        <NavItem href="/venues" active={pathname.startsWith("/venues")} label="Sedes">
                            <NavIcon>
                                <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                                <line x1="16" x2="16" y1="2" y2="6" />
                                <line x1="8" x2="8" y1="2" y2="6" />
                                <line x1="3" x2="21" y1="10" y2="10" />
                            </NavIcon>
                        </NavItem>
                    )}

                    {/* RANKING (Super Admin Only) */}
                    {isSuperAdminUser && (
                        <NavItem href="/admin/ranking" active={pathname.startsWith("/admin/ranking")} label="Ranking">
                            <NavIcon>
                                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                                <path d="M4 22h16" />
                                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                            </NavIcon>
                        </NavItem>
                    )}

                    {/* ADMIN USERS (Super Admin Only) */}
                    {isSuperAdminUser && (
                        <NavItem
                            href="/admin/users"
                            active={pathname.startsWith("/admin/users") || pathname.startsWith("/admin/applications")}
                            label="Usuarios"
                        >
                            <span className="relative">
                                <NavIcon>
                                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                    <circle cx="9" cy="7" r="4" />
                                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                </NavIcon>
                                {pendingApps > 0 && (
                                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 bg-yellow-400 text-gray-900 text-[9px] font-bold rounded-full flex items-center justify-center">
                                        {pendingApps > 9 ? "9+" : pendingApps}
                                    </span>
                                )}
                            </span>
                        </NavItem>
                    )}

                    {/* ADMIN FEEDBACK (Super Admin Only) */}
                    {isSuperAdminUser && (
                        <NavItem href="/admin/feedback" active={pathname.startsWith("/admin/feedback")} label="Sugerencias">
                            <NavIcon>
                                <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
                            </NavIcon>
                        </NavItem>
                    )}

                    {/* ADMIN REPORTS (Super Admin Only) */}
                    {isSuperAdminUser && (
                        <NavItem href="/admin/reports" active={pathname.startsWith("/admin/reports")} label="Reportes">
                            <span className="relative">
                                <NavIcon>
                                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                                    <line x1="4" x2="4" y1="22" y2="15" />
                                </NavIcon>
                                {pendingReports > 0 && (
                                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                                        {pendingReports > 9 ? "9+" : pendingReports}
                                    </span>
                                )}
                            </span>
                        </NavItem>
                    )}

                    {/* MUNDIAL (polla). Admin → resultados; con acceso → polla; sin acceso → ingresar código.
                        Visible si tenés acceso o si el admin abrió el acceso por código (joinByCodeOpen). */}
                    {showWorldCup && (isPlayer || isSuperAdminUser) && (
                        <NavItem href={worldCupHref} active={pathname.startsWith("/worldcup")} label="Mundial">
                            <NavIcon>
                                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                                <path d="M4 22h16" />
                                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                            </NavIcon>
                        </NavItem>
                    )}

                    {/* PROFILE (oculto para location admin — su flujo no incluye perfil de jugador).
                        Avatar real; pill deslizante detrás + anillo blanco cuando está activo. */}
                    {!isLocationAdminUser && (
                        <Link
                            href="/profile"
                            aria-label="Perfil"
                            aria-current={profileActive ? "page" : undefined}
                            className="relative flex items-center justify-center flex-1 h-full"
                        >
                            {profileActive && <ActivePill />}
                            <span className="relative z-10 transition-transform active:scale-90">
                                <span
                                    className={`block w-6 h-6 rounded-full overflow-hidden relative ${profileActive ? "ring-2 ring-white" : "ring-1 ring-gray-200"}`}
                                >
                                    {profilePhoto ? (
                                        <PlayerAvatar
                                            src={profilePhoto}
                                            alt="Perfil"
                                            className="w-full h-full rounded-full overflow-hidden relative"
                                            skeletonClassName="bg-gray-200 rounded-full"
                                            sizes="24px"
                                        />
                                    ) : (
                                        <span className="w-full h-full bg-gray-100 flex items-center justify-center text-[9px] font-black text-gray-600">
                                            {initials}
                                        </span>
                                    )}
                                </span>
                            </span>
                        </Link>
                    )}
                </nav>
            </LayoutGroup>
        </div>
    );
}
