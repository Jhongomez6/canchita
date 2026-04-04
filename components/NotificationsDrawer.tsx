"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/AuthContext";
import { getMyNotifications, markAsRead, markAllAsRead, clearIOSBadge } from "@/lib/notifications";
import type { AppNotification } from "@/lib/domain/notification";
import { useRouter } from "next/navigation";
import { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, ChevronRight, Bell, Trophy, MessageSquare, CalendarClock, Users } from "lucide-react";

const TYPE_ICONS: Record<string, ReactNode> = {
    feedback_resolved: <MessageSquare size={18} className="text-blue-500" />,
    match_reminder: <CalendarClock size={18} className="text-amber-500" />,
    mvp: <Trophy size={18} className="text-yellow-500" />,
    teams_confirmed: <Users size={18} className="text-emerald-600" />,
    general: <Bell size={18} className="text-emerald-500" />,
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

            // Mark as read in Firestore immediately (so re-opening won't show them again)
            const hasUnread = data.some(n => !n.read);
            if (hasUnread) {
                markAllAsRead(user.uid).catch(console.error);
                clearIOSBadge().catch(console.error);
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

    // Visually mark all as read when drawer CLOSES
    const handleClose = useCallback(() => {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        onClose();
    }, [onClose]);

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
            setTimeout(() => {
                handleClose(); // Close drawer slightly after click for better feel
                router.push(notif.url!);
            }, 150);
        }
    }

    const unreadCount = notifications.filter(n => !n.read).length;

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-[100]"
                        onClick={handleClose}
                    />

                    {/* Drawer */}
                    <motion.div
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        drag="x"
                        dragConstraints={{ left: 0, right: 300 }}
                        dragElastic={0.05}
                        onDragEnd={(_, info) => {
                            if (info.offset.x > 100 || info.velocity.x > 500) {
                                handleClose();
                            }
                        }}
                        className="fixed top-0 right-0 h-full w-[85vw] max-w-[320px] bg-white shadow-[-10px_0_40px_rgba(0,0,0,0.1)] z-[101] flex flex-col rounded-l-3xl overflow-hidden border-l border-white/50"
                    >
                        {/* Drag Handle (Mobile indication) */}
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 w-1.5 h-16 bg-slate-200 rounded-full opacity-50 md:hidden pointer-events-none" />

                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-5 bg-white/80 backdrop-blur-md border-b border-slate-100/60 sticky top-0 z-10">
                            <div>
                                <h2 className="text-lg font-black tracking-tight text-slate-800 flex items-center gap-2">
                                    <Bell size={20} className="text-emerald-500" />
                                    Notificaciones
                                    {unreadCount > 0 && (
                                        <motion.span
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            className="bg-emerald-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm shadow-emerald-500/20"
                                        >
                                            {unreadCount}
                                        </motion.span>
                                    )}
                                </h2>
                            </div>
                            <button
                                onClick={handleClose}
                                className="p-2 -mr-2 hover:bg-slate-50 active:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto bg-slate-50/30 p-4 scrollbar-hide overscroll-y-contain">
                            {loading ? (
                                <div className="space-y-3">
                                    {[1, 2, 3, 4].map(i => (
                                        <div key={i} className="flex items-start gap-3 p-4 bg-white border border-slate-100/50 rounded-2xl animate-pulse">
                                            <div className="w-10 h-10 rounded-full bg-slate-100 shrink-0"></div>
                                            <div className="flex-1 space-y-2 py-1">
                                                <div className="h-3.5 bg-slate-100 rounded-md w-3/4"></div>
                                                <div className="h-2.5 bg-slate-100 rounded-md w-full"></div>
                                                <div className="h-2.5 bg-slate-100 rounded-md w-2/3"></div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : notifications.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full pb-10 px-6 text-center">
                                    <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
                                        <CheckCircle2 size={32} className="text-emerald-400" />
                                    </div>
                                    <p className="text-slate-700 font-bold text-base mb-1">Todo al día</p>
                                    <p className="text-sm text-slate-400 leading-relaxed text-balance">No tienes notificaciones pendientes. Te avisaremos cuando haya novedades.</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {notifications.map((notif) => (
                                        <button
                                            key={notif.id}
                                            onClick={() => handleClick(notif)}
                                            className={`group w-full text-left p-4 rounded-2xl transition-all duration-200 block outline-none focus:ring-2 focus:ring-emerald-500/20 active:scale-[0.98] relative overflow-hidden ${notif.read
                                                ? "bg-white border border-slate-100/60 hover:border-slate-200/80 shadow-sm"
                                                : "bg-emerald-50/50 border border-emerald-100/80 hover:bg-emerald-50 shadow-sm"
                                                }`}
                                        >
                                            {!notif.read && (
                                                <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                                            )}
                                            <div className="flex items-start gap-3">
                                                <div className={`mt-0.5 p-2 rounded-xl shrink-0 ${notif.read ? "bg-slate-50" : "bg-white shadow-sm border border-emerald-50"} transition-colors`}>
                                                    <div className={notif.read ? "opacity-40 grayscale" : ""}>
                                                        {TYPE_ICONS[notif.type] || <Bell size={18} className="text-emerald-500" />}
                                                    </div>
                                                </div>
                                                <div className="flex-1 min-w-0 pr-4">
                                                    <h3 className={`text-sm font-bold tracking-tight transition-colors pr-2 ${notif.read ? "text-slate-500" : "text-slate-800"}`}>
                                                        {notif.title}
                                                    </h3>
                                                    <p className={`text-xs mt-1 leading-relaxed transition-colors ${notif.read ? "text-slate-400" : "text-slate-600"}`}>
                                                        {notif.body}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-2">
                                                        <span className="text-[10px] font-semibold tracking-wider uppercase text-slate-400">
                                                            {formatRelativeTime(notif.createdAt)}
                                                        </span>
                                                    </div>
                                                </div>

                                                {notif.url && (
                                                    <div className={`absolute right-4 top-1/2 -translate-y-1/2 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all ${notif.read ? 'text-slate-300' : 'text-emerald-500'}`}>
                                                        <ChevronRight size={16} strokeWidth={3} />
                                                    </div>
                                                )}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

function formatRelativeTime(isoDate: string): string {
    const now = new Date();
    const date = new Date(isoDate);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "ahora";
    if (diffMins < 60) return `${diffMins} min`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}
