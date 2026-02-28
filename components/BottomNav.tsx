"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { useEffect, useState } from "react";
import { getUserProfile } from "@/lib/users";
import { UserProfile } from "@/lib/domain/user";
import { getUnreadCount } from "@/lib/notifications";

export default function BottomNav() {
    const pathname = usePathname();
    const { user } = useAuth();
    const [isAdmin, setIsAdmin] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        if (!user) return;
        getUserProfile(user.uid).then((profile: UserProfile | null) => {
            setIsAdmin(profile?.roles?.includes("admin") ?? false);
        });
        getUnreadCount(user.uid).then(setUnreadCount).catch(() => { });
    }, [user]);

    if (!user) return null;

    // Don't show bottom nav on onboarding
    if (pathname === "/onboarding") return null;

    const navItemClass = (isActive: boolean) =>
        `flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${isActive ? "text-[#1f7a4f]" : "text-gray-400 hover:text-gray-500"
        }`;

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100 pb-safe pt-2 px-6 h-[80px] shadow-[0_-4px_20px_rgba(0,0,0,0.05)] md:hidden">
            <div className="flex items-center justify-between h-full pb-4">
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

                {/* NOTIFICATIONS (All Users) */}
                <Link href="/notifications" className={navItemClass(pathname === "/notifications")}>
                    <div className="relative">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill={pathname === "/notifications" ? "currentColor" : "none"}
                            stroke="currentColor"
                            strokeWidth={pathname === "/notifications" ? "0" : "2"}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="w-7 h-7"
                        >
                            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                        </svg>
                        {unreadCount > 0 && (
                            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                                {unreadCount > 9 ? "9+" : unreadCount}
                            </span>
                        )}
                    </div>
                    <span className="text-[10px] font-bold tracking-wide">Alertas</span>
                </Link>

                {/* RANKING (Admin Only) */}
                {isAdmin && (
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

                {/* ADMIN USERS (Admin Only) */}
                {isAdmin && (
                    <Link href="/admin/users" className={navItemClass(pathname.startsWith("/admin/users"))}>
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill={pathname.startsWith("/admin/users") ? "currentColor" : "none"}
                            stroke="currentColor"
                            strokeWidth={pathname.startsWith("/admin/users") ? "0" : "2"}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="w-7 h-7"
                        >
                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                        <span className="text-[10px] font-bold tracking-wide">Usuarios</span>
                    </Link>
                )}

                {/* ADMIN FEEDBACK (Admin Only) */}
                {isAdmin && (
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
