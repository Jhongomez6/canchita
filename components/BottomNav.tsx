"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { isSuperAdmin as checkIsSuperAdmin, hasBookingAccess as checkHasBookingAccess } from "@/lib/domain/user";
import { getPendingApplicationsCount } from "@/lib/teamAdminApplications";

export default function BottomNav() {
    const pathname = usePathname();
    const { user, profile } = useAuth();
    const isSuperAdminUser = profile ? checkIsSuperAdmin(profile) : false;
    const hasBooking = profile ? checkHasBookingAccess(profile) : false;
    const [pendingApps, setPendingApps] = useState(0);

    useEffect(() => {
        if (!isSuperAdminUser) return;
        getPendingApplicationsCount()
            .then((count) => setPendingApps(count))
            .catch(() => {/* silencioso */});
    }, [isSuperAdminUser]);

    if (!user) return null;

    // Don't show bottom nav on onboarding
    if (pathname === "/onboarding") return null;

    const navItemClass = (isActive: boolean) =>
        `flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${isActive ? "text-[#1f7a4f]" : "text-gray-400 hover:text-gray-500"
        }`;

    return (
        <div
            className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100 pt-2 px-6 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] md:hidden"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 4px)" }}
        >
            <div className="flex items-center justify-between" style={{ height: "52px" }}>
                {/* HOME */}
                <Link href="/" className={navItemClass(pathname === "/")}>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill={pathname === "/" ? "currentColor" : "none"}
                        stroke="currentColor"
                        strokeWidth={pathname === "/" ? "0" : "2"}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-7 h-7"
                    >
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                        <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                    <span className="text-[10px] font-bold tracking-wide">Inicio</span>
                </Link>

                {/* EXPLORE (Buscar Partidos) */}
                <Link href="/explore" className={navItemClass(pathname === "/explore")}>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill={pathname === "/explore" ? "currentColor" : "none"}
                        stroke="currentColor"
                        strokeWidth={pathname === "/explore" ? "0" : "2"}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-7 h-7"
                    >
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.3-4.3" />
                    </svg>
                    <span className="text-[10px] font-bold tracking-wide">Buscar</span>
                </Link>

                {/* RESERVAS (behind bookingEnabled flag) */}
                {hasBooking && !isSuperAdminUser && (
                    <Link href="/bookings" className={navItemClass(pathname.startsWith("/venues") || pathname.startsWith("/bookings"))}>
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill={(pathname.startsWith("/venues") || pathname.startsWith("/bookings")) ? "currentColor" : "none"}
                            stroke="currentColor"
                            strokeWidth={(pathname.startsWith("/venues") || pathname.startsWith("/bookings")) ? "0" : "2"}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="w-7 h-7"
                        >
                            <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                            <line x1="16" x2="16" y1="2" y2="6" />
                            <line x1="8" x2="8" y1="2" y2="6" />
                            <line x1="3" x2="21" y1="10" y2="10" />
                        </svg>
                        <span className="text-[10px] font-bold tracking-wide">Reservas</span>
                    </Link>
                )}

                {/* HISTORY (Players) */}
                {!isSuperAdminUser && (
                    <Link href="/history" className={navItemClass(pathname === "/history")}>
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill={pathname === "/history" ? "currentColor" : "none"}
                            stroke="currentColor"
                            strokeWidth={pathname === "/history" ? "0" : "2"}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="w-7 h-7"
                        >
                            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                            <path d="M21 3v5h-5" />
                            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                            <path d="M3 21v-5h5" />
                        </svg>
                        <span className="text-[10px] font-bold tracking-wide">Historial</span>
                    </Link>
                )}

                {/* VENUES ADMIN (Super Admin Only) */}
                {isSuperAdminUser && (
                    <Link href="/venues" className={navItemClass(pathname.startsWith("/venues"))}>
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill={pathname.startsWith("/venues") ? "currentColor" : "none"}
                            stroke="currentColor"
                            strokeWidth={pathname.startsWith("/venues") ? "0" : "2"}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="w-7 h-7"
                        >
                            <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                            <line x1="16" x2="16" y1="2" y2="6" />
                            <line x1="8" x2="8" y1="2" y2="6" />
                            <line x1="3" x2="21" y1="10" y2="10" />
                        </svg>
                        <span className="text-[10px] font-bold tracking-wide">Sedes</span>
                    </Link>
                )}

                {/* RANKING (Super Admin Only) */}
                {isSuperAdminUser && (
                    <Link href="/admin/ranking" className={navItemClass(pathname.startsWith("/admin/ranking"))}>
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill={pathname.startsWith("/admin/ranking") ? "currentColor" : "none"}
                            stroke="currentColor"
                            strokeWidth={pathname.startsWith("/admin/ranking") ? "0" : "2"}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="w-7 h-7"
                        >
                            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                            <path d="M4 22h16" />
                            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                        </svg>
                        <span className="text-[10px] font-bold tracking-wide">Ranking</span>
                    </Link>
                )}

                {/* ADMIN USERS (Super Admin Only) */}
                {isSuperAdminUser && (
                    <Link href="/admin/users" className={navItemClass(pathname.startsWith("/admin/users") || pathname.startsWith("/admin/applications"))}>
                        <div className="relative">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill={(pathname.startsWith("/admin/users") || pathname.startsWith("/admin/applications")) ? "currentColor" : "none"}
                                stroke="currentColor"
                                strokeWidth={(pathname.startsWith("/admin/users") || pathname.startsWith("/admin/applications")) ? "0" : "2"}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="w-7 h-7"
                            >
                                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                            </svg>
                            {pendingApps > 0 && (
                                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-yellow-400 text-gray-900 text-[9px] font-bold rounded-full flex items-center justify-center">
                                    {pendingApps > 9 ? "9+" : pendingApps}
                                </span>
                            )}
                        </div>
                        <span className="text-[10px] font-bold tracking-wide">Usuarios</span>
                    </Link>
                )}

                {/* ADMIN FEEDBACK (Super Admin Only) */}
                {isSuperAdminUser && (
                    <Link href="/admin/feedback" className={navItemClass(pathname.startsWith("/admin/feedback"))}>
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill={pathname.startsWith("/admin/feedback") ? "currentColor" : "none"}
                            stroke="currentColor"
                            strokeWidth={pathname.startsWith("/admin/feedback") ? "0" : "2"}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="w-7 h-7"
                        >
                            <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
                        </svg>
                        <span className="text-[10px] font-bold tracking-wide">Sugerencias</span>
                    </Link>
                )}

                {/* PROFILE */}
                <Link href="/profile" className={navItemClass(pathname === "/profile")}>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill={pathname === "/profile" ? "currentColor" : "none"}
                        stroke="currentColor"
                        strokeWidth={pathname === "/profile" ? "0" : "2"}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-7 h-7"
                    >
                        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                    </svg>
                    <span className="text-[10px] font-bold tracking-wide">Perfil</span>
                </Link>
            </div>
        </div>
    );
}
