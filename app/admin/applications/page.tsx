"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { isSuperAdmin } from "@/lib/domain/user";
import {
    getAllApplications,
    approveApplication,
    rejectApplication,
} from "@/lib/teamAdminApplications";
import type { TeamAdminApplication } from "@/lib/domain/teamAdminApplication";
import { formatDateSpanish } from "@/lib/date";
import { toast } from "react-hot-toast";
import { handleError } from "@/lib/utils/error";
import AuthGuard from "@/components/AuthGuard";
import { CheckCircle, XCircle, Clock, Users, MapPin, Wrench, Star, ChevronDown, ChevronUp } from "lucide-react";

const STATUS_LABELS: Record<TeamAdminApplication["status"], { label: string; color: string }> = {
    pending: { label: "Pendiente", color: "bg-amber-50 text-amber-700 border-amber-200" },
    approved: { label: "Aprobado", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    rejected: { label: "Rechazado", color: "bg-red-50 text-red-700 border-red-200" },
};

const FREQUENCY_LABELS: Record<string, string> = {
    "weekly": "1 vez por semana",
    "2-3x-week": "2-3 veces por semana",
    "monthly": "1-3 veces al mes",
};

const EXPERIENCE_LABELS: Record<string, string> = {
    "<3m": "Menos de 3 meses",
    "3-12m": "3 a 12 meses",
    "1-3y": "1 a 3 años",
    "3y+": "Más de 3 años",
};

const VENUE_LABELS: Record<string, string> = {
    "yes": "Sí, horario y precio fijo",
    "in-progress": "En proceso",
    "no": "No todavía",
};

const FEEDBACK_LABELS: Record<string, string> = {
    "yes-call": "Sí, con gusto (llamada o encuesta)",
    "survey-only": "Prefiero solo la encuesta",
    "no": "Por ahora no",
};

// ========================
// APPLICATION CARD
// ========================

function ApplicationCard({
    app,
    reviewerUid,
    onAction,
}: {
    app: TeamAdminApplication;
    reviewerUid: string;
    onAction: () => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const [acting, setActing] = useState(false);
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [rejectionReason, setRejectionReason] = useState("");

    const status = STATUS_LABELS[app.status];

    async function handleApprove() {
        setActing(true);
        try {
            await approveApplication(app.uid, reviewerUid);
            toast.success("✅ Solicitud aprobada y usuario notificado");
            onAction();
        } catch (err: unknown) {
            handleError(err, "Error al aprobar la solicitud");
        } finally {
            setActing(false);
        }
    }

    async function handleReject() {
        if (!rejectionReason.trim()) return;
        setActing(true);
        try {
            await rejectApplication(app.uid, reviewerUid, rejectionReason.trim());
            toast.success("Solicitud rechazada y usuario notificado");
            setShowRejectModal(false);
            onAction();
        } catch (err: unknown) {
            handleError(err, "Error al rechazar la solicitud");
        } finally {
            setActing(false);
        }
    }

    return (
        <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${app.status === "pending" ? "border-amber-200" : app.status === "approved" ? "border-emerald-200" : "border-red-200"}`}>
            {/* Header de la card */}
            <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-slate-800 font-bold text-lg truncate">{app.profileSnapshot.name}</h3>
                            <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border font-bold ${status.color}`}>
                                {status.label}
                            </span>
                        </div>
                        <p className="text-slate-400 text-xs mt-0.5 font-medium">
                            {app.profileSnapshot.phone} · Aplicó {formatDateSpanish(app.appliedAt)}
                        </p>
                    </div>
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
                    >
                        {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </button>
                </div>

                {/* Stats snapshot */}
                <div className="mt-3 flex flex-wrap gap-2">
                    <span className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-1 text-xs text-slate-600 font-medium">
                        ⚽ {app.profileSnapshot.played} partidos
                    </span>
                    {app.profileSnapshot.noShows !== undefined && app.profileSnapshot.noShows > 0 && (
                        <span className="bg-red-50 border border-red-100 rounded-lg px-3 py-1 text-xs text-red-600 font-medium">
                            ❌ {app.profileSnapshot.noShows} no-shows
                        </span>
                    )}
                    {app.profileSnapshot.commitmentScore !== undefined && (
                        <span className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-1 text-xs text-slate-600 font-medium">
                            🎯 COM {app.profileSnapshot.commitmentScore}
                        </span>
                    )}
                    {app.profileSnapshot.weeklyStreak !== undefined && app.profileSnapshot.weeklyStreak > 0 && (
                        <span className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-1 text-xs text-slate-600 font-medium">
                            🔥 {app.profileSnapshot.weeklyStreak}sem racha
                        </span>
                    )}
                    {app.profileSnapshot.memberSince && (
                        <span className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-1 text-xs text-slate-600 font-medium">
                            📅 {formatDateSpanish(app.profileSnapshot.memberSince)}
                        </span>
                    )}
                </div>

                {/* Resumen rápido siempre visible */}
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="text-slate-600">
                        <span className="text-slate-400 font-medium">Grupo:</span> {app.groupSize} personas
                    </div>
                    <div className="text-slate-600">
                        <span className="text-slate-400 font-medium">Frecuencia:</span> {FREQUENCY_LABELS[app.frequency] ?? app.frequency}
                    </div>
                    <div className="text-slate-600">
                        <span className="text-slate-400 font-medium">Cancha:</span> {app.venueName}, {app.venueCity}
                    </div>
                    <div className="text-slate-600">
                        <span className="text-slate-400 font-medium">Experiencia:</span> {EXPERIENCE_LABELS[app.experience] ?? app.experience}
                    </div>
                </div>
            </div>

            {/* Detalle expandido */}
            {expanded && (
                <div className="border-t border-slate-100 p-5 space-y-5 bg-slate-50/30">

                    {/* Bloque: Cancha */}
                    <div className="space-y-2">
                        <h4 className="text-emerald-600 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <MapPin size={12} /> Cancha
                        </h4>
                        <div className="text-sm text-slate-700 space-y-1 font-medium">
                            <p><span className="text-slate-400">Acuerdo:</span> {VENUE_LABELS[app.hasVenueAgreement] ?? app.hasVenueAgreement}</p>
                        </div>
                    </div>

                    {/* Bloque: Herramientas */}
                    <div className="space-y-2">
                        <h4 className="text-emerald-600 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <Wrench size={12} /> Herramientas y motivación
                        </h4>
                        <div className="text-sm text-slate-700 space-y-3">
                            <div>
                                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-tight mb-1">Canal actual</p>
                                <p className="font-medium">{app.currentCommunicationChannel}</p>
                            </div>
                            <div>
                                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-tight mb-1">Herramientas previas (qué gusta/disgusta)</p>
                                <p className="whitespace-pre-wrap font-medium">{app.toolsFeedback}</p>
                            </div>
                            <div>
                                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-tight mb-1">Problema a resolver</p>
                                <p className="whitespace-pre-wrap bg-white border border-slate-100 rounded-2xl p-4 shadow-sm text-slate-800 font-medium italic">&quot;{app.problemToSolve}&quot;</p>
                            </div>
                        </div>
                    </div>

                    {/* Bloque: Uso y compromiso */}
                    <div className="space-y-2">
                        <h4 className="text-emerald-600 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <Star size={12} /> Uso y compromiso
                        </h4>
                        <div className="text-sm text-slate-700 space-y-3">
                            <div>
                                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-tight mb-1">Casos de uso</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {app.useCases.map((uc) => (
                                        <span key={uc} className="bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full px-3 py-0.5 text-[11px] font-semibold">{uc}</span>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-tight mb-1">Feedback mensual</p>
                                <p className="font-medium">{FEEDBACK_LABELS[app.feedbackWillingness] ?? app.feedbackWillingness}</p>
                            </div>
                            {app.socialLink && (
                                <div>
                                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-tight mb-1">Red social del grupo</p>
                                    <p className="font-medium text-emerald-600">{app.socialLink}</p>
                                </div>
                            )}
                            {app.groupDescription && (
                                <div>
                                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-tight mb-1">Sobre el equipo</p>
                                    <p className="whitespace-pre-wrap font-medium">{app.groupDescription}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Rechazo anterior */}
                    {app.status === "rejected" && app.rejectionReason && (
                        <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
                            <p className="text-red-700 text-[10px] font-bold uppercase tracking-wider mb-1">Motivo de rechazo</p>
                            <p className="text-red-600 text-sm font-medium">{app.rejectionReason}</p>
                        </div>
                    )}
                </div>
            )}

            {/* Acciones (solo si está pendiente) */}
            {app.status === "pending" && (
                <div className="border-t border-slate-100 p-4 flex gap-3 bg-slate-50/50">
                    <button
                        onClick={handleApprove}
                        disabled={acting}
                        className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-sm font-bold shadow-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                        <CheckCircle size={16} />
                        Aprobar
                    </button>
                    <button
                        onClick={() => setShowRejectModal(true)}
                        disabled={acting}
                        className="flex-1 py-2.5 bg-white hover:bg-red-50 border border-slate-200 hover:border-red-200 disabled:opacity-50 text-slate-700 hover:text-red-700 rounded-xl text-sm font-bold shadow-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                        <XCircle size={16} />
                        Rechazar
                    </button>
                </div>
            )}

            {/* Modal de rechazo */}
            {showRejectModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setShowRejectModal(false)}>
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md space-y-4 shadow-2xl border border-slate-100 animate-in slide-in-from-bottom-4 duration-300" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center text-red-600">
                                <XCircle size={24} />
                            </div>
                            <h3 className="text-slate-800 font-bold text-lg">Motivo del rechazo</h3>
                        </div>
                        <p className="text-slate-500 text-sm">Este mensaje llegará al usuario como notificación in-app y push.</p>
                        <textarea
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            placeholder="Ej: Por ahora estamos priorizando organizadores de grupos establecidos con cancha fija..."
                            rows={4}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-800 font-medium placeholder-slate-400 text-sm focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-400/20 transition-all resize-none"
                        />
                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={() => setShowRejectModal(false)}
                                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-bold transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleReject}
                                disabled={!rejectionReason.trim() || acting}
                                className="flex-1 py-3 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-all active:scale-[0.98]"
                            >
                                {acting ? "Rechazando..." : "Confirmar rechazo"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ========================
// PAGE
// ========================

export default function AdminApplicationsPage() {
    const { user, profile, loading: authLoading } = useAuth();
    const [isAdminUser, setIsAdminUser] = useState<boolean | null>(null);
    const [applications, setApplications] = useState<TeamAdminApplication[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<"pending" | "all">("pending");

    useEffect(() => {
        if (authLoading || !profile) return;
        const admin = isSuperAdmin(profile);
        setIsAdminUser(admin);
        if (admin) {
            loadData();
        } else {
            setLoading(false);
        }
    }, [profile, authLoading]);

    async function loadData() {
        try {
            setLoading(true);
            const data = await getAllApplications();
            setApplications(data);
        } catch (err) {
            console.error("Error cargando aplicaciones", err);
        } finally {
            setLoading(false);
        }
    }

    if (loading) {
        return (
            <AuthGuard>
                <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
                </div>
            </AuthGuard>
        );
    }

    if (isAdminUser === false) {
        return (
            <AuthGuard>
                <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
                    <h1 className="text-2xl font-bold text-slate-800 mb-2">Acceso Denegado 🛑</h1>
                    <p className="text-slate-500">No tienes permisos para ver las solicitudes.</p>
                </div>
            </AuthGuard>
        );
    }

    const pending = applications.filter((a) => a.status === "pending");
    const displayed = filter === "pending" ? pending : applications;

    return (
        <AuthGuard>
            <main className="min-h-screen bg-slate-50 pb-28 md:pb-8">
                <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">

                    {/* Header */}
                    <div className="bg-gradient-to-r from-[#1f7a4f] to-emerald-500 rounded-[2rem] p-8 text-white shadow-lg shadow-emerald-900/10 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
                        <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                            <div>
                                <h1 className="text-3xl font-black flex items-center gap-3">
                                    <Users size={32} strokeWidth={2.5} /> Solicitudes
                                </h1>
                                <p className="text-emerald-50 text-sm mt-1.5 font-medium opacity-90 max-w-xs">
                                    Revisa y aprueba a los nuevos organizadores de la comunidad
                                </p>
                            </div>
                            <div className="flex gap-4">
                                <div className="bg-white/15 backdrop-blur-md border border-white/10 px-6 py-3 rounded-2xl text-center">
                                    <span className="text-2xl font-black">{applications.length}</span>
                                    <p className="text-[10px] text-emerald-100 uppercase tracking-widest font-bold">Total</p>
                                </div>
                                {pending.length > 0 && (
                                    <div className="bg-amber-400 text-[#1f7a4f] px-6 py-3 rounded-2xl text-center shadow-lg shadow-amber-900/20">
                                        <span className="text-2xl font-black">{pending.length}</span>
                                        <p className="text-[10px] uppercase tracking-widest font-black">Nuevas</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Filtro */}
                    <div className="flex gap-2 p-1 bg-slate-200/50 rounded-2xl w-fit">
                        <button
                            onClick={() => setFilter("pending")}
                            className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${filter === "pending" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                        >
                            Pendientes {pending.length > 0 && `(${pending.length})`}
                        </button>
                        <button
                            onClick={() => setFilter("all")}
                            className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${filter === "all" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                        >
                            Historial ({applications.length})
                        </button>
                    </div>

                    {/* Lista */}
                    {displayed.length === 0 ? (
                        <div className="bg-white rounded-[2rem] p-16 text-center border-2 border-dashed border-slate-200 shadow-inner">
                            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-300">
                                <Clock size={32} />
                            </div>
                            <p className="text-slate-500 font-bold text-lg">
                                {filter === "pending" ? "No hay solicitudes pendientes" : "Aún no hay solicitudes"}
                            </p>
                            <p className="text-slate-400 text-sm mt-1">Te avisaremos cuando alguien se postule</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {displayed.map((app) => (
                                <ApplicationCard
                                    key={app.uid}
                                    app={app}
                                    reviewerUid={user!.uid}
                                    onAction={loadData}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </AuthGuard>
    );
}
