"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/AuthContext";
import { getMyNotifications, markAsRead, markAllAsRead } from "@/lib/notifications";
import type { AppNotification } from "@/lib/domain/notification";
import { useRouter } from "next/navigation";

const TYPE_ICONS: Record<string, string> = {
    feedback_resolved: "💬",
    match_reminder: "⚽",
    mvp: "🏆",
    general: "🔔",
};

interface NotificationsDrawerProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function NotificationsDrawer({ isOpen, onClose }: NotificationsDrawerProps) {
    const { user } = useAuth();
    const router = useRouter();
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [loading, setLoading] = useState(false);

    const loadNotifications = useCallback(async () => {
        if (!user || !isOpen) return;
        setLoading(true);
        try {
            const data = await getMyNotifications(user.uid);
            setNotifications(data);

            const hasUnread = data.some(n => !n.read);
            if (hasUnread) {
                markAllAsRead(user.uid).catch(console.error);
            }
        } catch (err) {
            console.error("Error loading notifications:", err);
        } finally {
            setLoading(false);
        }
    }, [user, isOpen]);

    useEffect(() => {
        if (isOpen) {
            loadNotifications();
        }
    }, [isOpen, loadNotifications]);

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
            onClose(); // Close drawer before navigating
            router.push(notif.url);
        }
    }

    const unreadCount = notifications.filter(n => !n.read).length;

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-slate-900/40 z-[100] transition-opacity"
                onClick={onClose}
            />

            {/* Drawer */}
            <div className="fixed top-0 right-0 h-full w-full max-w-sm bg-slate-50 shadow-2xl z-[101] flex flex-col transform transition-transform duration-300 ease-in-out">
                {/* Header */}
                <div className="flex items-center justify-between p-4 bg-white border-b border-slate-100">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        🔔 Notificaciones
                        {unreadCount > 0 && (
                            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                                {unreadCount}
                            </span>
                        )}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4">
                    {loading ? (
                        <div className="space-y-4 animate-pulse">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="flex items-start gap-4 p-4 border border-slate-100 rounded-xl bg-white">
                                    <div className="w-8 h-8 rounded-full bg-slate-200"></div>
                                    <div className="flex-1 space-y-2">
                                        <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                                        <div className="h-3 bg-slate-200 rounded w-full"></div>
                                        <div className="h-3 bg-slate-200 rounded w-5/6"></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : notifications.length === 0 ? (
                        <div className="bg-white rounded-2xl p-10 text-center shadow-sm border border-dashed border-slate-300 mt-4">
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
            </div>
        </>
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
