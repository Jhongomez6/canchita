"use client";

import { useEffect, useState, useCallback } from "react";
import AuthGuard from "@/components/AuthGuard";
import { useAuth } from "@/lib/AuthContext";
import { isSuperAdmin } from "@/lib/domain/user";
import { getPendingReports, getModerationAlerts, resolveModerationAlert } from "@/lib/matchReview";
import type { PlayerReport, ModerationAlert } from "@/lib/domain/matchReview";
import { handleError } from "@/lib/utils/error";
import toast from "react-hot-toast";
import ModerationAlertBanner from "./components/ModerationAlertBanner";
import AdminReportRow from "./components/AdminReportRow";
import AdminReportDrawer from "./components/AdminReportDrawer";

export default function AdminReportsPage() {
    const { user, profile, loading: authLoading } = useAuth();
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
    const [reports, setReports] = useState<PlayerReport[]>([]);
    const [alerts, setAlerts] = useState<ModerationAlert[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedReport, setSelectedReport] = useState<PlayerReport | null>(null);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const [reportsData, alertsData] = await Promise.all([
                getPendingReports(50),
                getModerationAlerts("open", 20),
            ]);
            setReports(reportsData);
            setAlerts(alertsData);
        } catch (e) {
            handleError(e, "Error al cargar reportes");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (authLoading || !profile) return;
        const admin = isSuperAdmin(profile);
        setIsAdmin(admin);
        if (admin) loadData();
        else setLoading(false);
    }, [profile, authLoading, loadData]);

    async function handleResolveAlert(alertId: string) {
        if (!user) return;
        try {
            await resolveModerationAlert(alertId, user.uid);
            toast.success("Alerta resuelta");
            await loadData();
        } catch (e) {
            handleError(e, "Error al resolver la alerta");
        }
    }

    if (loading) {
        return (
            <AuthGuard>
                <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                    <div className="space-y-3 w-full max-w-2xl px-4">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="h-20 bg-white rounded-2xl animate-pulse" />
                        ))}
                    </div>
                </div>
            </AuthGuard>
        );
    }

    if (isAdmin === false) {
        return (
            <AuthGuard>
                <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
                    <h1 className="text-2xl font-bold text-slate-800 mb-2">Acceso Denegado</h1>
                    <p className="text-slate-500">No tienes permisos para ver este panel.</p>
                </div>
            </AuthGuard>
        );
    }

    const total = reports.length + alerts.length;

    return (
        <AuthGuard>
            <main className="min-h-screen bg-slate-50 pb-28 md:pb-8">
                <div className="max-w-2xl mx-auto p-4 md:p-8">
                    {/* Header */}
                    <div className="mb-6 bg-gradient-to-r from-red-600 to-red-700 rounded-2xl p-6 text-white shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold">🚩 Reportes de jugadores</h1>
                            <p className="text-sm text-red-100 mt-1">Cola de moderación pendiente.</p>
                        </div>
                        <div className="flex gap-3">
                            {alerts.length > 0 && (
                                <div className="bg-white/20 px-4 py-2 rounded-xl backdrop-blur-sm border border-white/30 text-center">
                                    <p className="text-xl font-bold leading-none">{alerts.length}</p>
                                    <p className="text-xs text-red-100 mt-0.5">alertas</p>
                                </div>
                            )}
                            <div className="bg-white/10 px-4 py-2 rounded-xl backdrop-blur-sm border border-white/20 text-center">
                                <p className="text-xl font-bold leading-none">{reports.length}</p>
                                <p className="text-xs text-red-100 mt-0.5">reportes</p>
                            </div>
                        </div>
                    </div>

                    {total === 0 ? (
                        <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-dashed border-slate-300">
                            <span className="text-4xl block mb-2">✅</span>
                            <p className="text-slate-500 font-bold mb-1">Sin reportes pendientes</p>
                            <p className="text-xs text-slate-400">La comunidad se está portando bien.</p>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            {/* Moderation alerts section */}
                            {alerts.length > 0 && (
                                <section>
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide px-1 mb-2">
                                        Alertas de moderación
                                    </p>
                                    <div className="space-y-2">
                                        {alerts.map((alert) => (
                                            <ModerationAlertBanner
                                                key={alert.id}
                                                alert={alert}
                                                onViewReports={() => {
                                                    const first = reports.find(
                                                        (r) => r.reportedUid === alert.reportedUid,
                                                    );
                                                    if (first) setSelectedReport(first);
                                                }}
                                                onResolve={() => alert.id && handleResolveAlert(alert.id)}
                                            />
                                        ))}
                                    </div>
                                </section>
                            )}

                            {/* Pending reports section */}
                            {reports.length > 0 && (
                                <section>
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide px-1 mb-2">
                                        Reportes pendientes
                                    </p>
                                    <div className="space-y-2">
                                        {reports.map((report) => (
                                            <AdminReportRow
                                                key={report.id}
                                                report={report}
                                                onTap={() => setSelectedReport(report)}
                                            />
                                        ))}
                                    </div>
                                </section>
                            )}
                        </div>
                    )}
                </div>

                {user && (
                    <AdminReportDrawer
                        report={selectedReport}
                        adminUid={user.uid}
                        onClose={() => setSelectedReport(null)}
                        onActioned={async () => {
                            setSelectedReport(null);
                            await loadData();
                        }}
                    />
                )}
            </main>
        </AuthGuard>
    );
}
