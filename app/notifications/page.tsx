"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import AuthGuard from "@/components/AuthGuard";
import { getMyNotifications, markAsRead, markAllAsRead } from "@/lib/notifications";
import type { AppNotification } from "@/lib/domain/notification";
import { useRouter } from "next/navigation";

import NotificationsSkeleton from "@/components/skeletons/NotificationsSkeleton";

const TYPE_ICONS: Record<string, string> = {
    feedback_resolved: "💬",
    match_reminder: "⚽",
    mvp: "🏆",
    general: "🔔",
};

export default function NotificationsPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;
        loadNotifications();
    }, [user]);

    async function loadNotifications() {
        if (!user) return;
        setLoading(true);
        try {
            const data = await getMyNotifications(user.uid);
            setNotifications(data);

            // Marca todas como leídas en segundo plano nada más cargar
            // para que los contadores globales se limpien antes de que el usuario vuelva atrás
            const hasUnread = data.some(n => !n.read);
            if (hasUnread) {
                markAllAsRead(user.uid).catch(console.error);
            }
        } catch (err) {
            console.error("Error loading notifications:", err);
        } finally {
            setLoading(false);
        }
    }

    async function handleClick(notif: AppNotification) {
        if (!user || !notif.id) return;

        // Mark as read immediately if clicked (for UX)
        if (!notif.read) {
            await markAsRead(user.uid, notif.id);
            setNotifications(prev =>
                prev.map(n => n.id === notif.id ? { ...n, read: true } : n)
            );
        }

        // Navigate if URL exists
        if (notif.url) {
            router.push(notif.url);
        }
    }

    const unreadCount = notifications.filter(n => !n.read).length;

    if (loading) {
        return <NotificationsSkeleton />;
    }

    return (
        <AuthGuard>
            <main className="min-h-screen bg-slate-50 pb-28 md:pb-8">
                <div className="max-w-md mx-auto p-4">

                    {/* HEADER */}
                    <div className="flex items-center justify-between mb-6">
                        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            🔔 Notificaciones
                            {unreadCount > 0 && (
                                <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                                    {unreadCount}
                                </span>
                            )}
                        </h1>
                    </div>

                    {/* LIST */}
                    {notifications.length === 0 ? (
                        <div className="bg-white rounded-2xl p-10 text-center shadow-sm border border-dashed border-slate-300">
                            <div className="text-4xl mb-3 opacity-40">🔕</div>
                            <p className="text-slate-500 font-bold mb-1">No tienes notificaciones</p>
                            <p className="text-xs text-slate-400">Te avisaremos cuando haya algo nuevo.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {notifications.map((notif) => (
                                <button
                                    key={notif.id}
                                    onClick={() => handleClick(notif)}
                                    className={`w-full text-left p-4 rounded-xl border transition-all ${notif.read
                                        ? "bg-white border-slate-100 hover:bg-slate-50"
                                        : "bg-emerald-50 border-emerald-200 hover:bg-emerald-100 shadow-sm"
                                        }`}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className={`text-xl mt-0.5 ${notif.read ? "opacity-40" : ""}`}>
                                            {TYPE_ICONS[notif.type] || "🔔"}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                                <h3 className={`text-sm font-bold truncate ${notif.read ? "text-slate-500" : "text-slate-800"}`}>
                                                    {notif.title}
                                                </h3>
                                                {!notif.read && (
                                                    <span className="w-2 h-2 bg-[#1f7a4f] rounded-full flex-shrink-0"></span>
                                                )}
                                            </div>
                                            <p className={`text-xs mt-1 leading-relaxed ${notif.read ? "text-slate-400" : "text-slate-600"}`}>
                                                {notif.body}
                                            </p>
                                            <p className="text-[10px] text-slate-400 mt-2 font-medium">
                                                {formatRelativeTime(notif.createdAt)}
                                            </p>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </AuthGuard>
    );
}

function formatRelativeTime(isoDate: string): string {
    const now = new Date();
    const date = new Date(isoDate);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Justo ahora";
    if (diffMins < 60) return `Hace ${diffMins} min`;
    if (diffHours < 24) return `Hace ${diffHours}h`;
    if (diffDays < 7) return `Hace ${diffDays} día${diffDays > 1 ? "s" : ""}`;
    return date.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}
