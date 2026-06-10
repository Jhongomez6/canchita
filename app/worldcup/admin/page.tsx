"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trophy, Loader2, Eye } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { isSuperAdmin } from "@/lib/domain/user";
import { getWorldCupMatches, getPendingResultMatches, getWorldCupConfig } from "@/lib/worldcup";
import { handleError } from "@/lib/utils/error";
import AuthGuard from "@/components/AuthGuard";
import AdminMatchResultForm from "@/components/worldcup/AdminMatchResultForm";
import AdminChampionsForm from "@/components/worldcup/AdminChampionsForm";
import AdminAccessCodeForm from "@/components/worldcup/AdminAccessCodeForm";
import AdminParticipantsList from "@/components/worldcup/AdminParticipantsList";
import type { WCMatch, WCConfig } from "@/lib/domain/worldcup";

function WorldCupAdminContent() {
    const { user, profile } = useAuth();
    const router = useRouter();
    const [pending, setPending] = useState<WCMatch[]>([]);
    const [finished, setFinished] = useState<WCMatch[]>([]);
    const [allMatches, setAllMatches] = useState<WCMatch[]>([]);
    const [config, setConfig] = useState<WCConfig | null>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        try {
            const [pend, all, cfg] = await Promise.all([
                getPendingResultMatches(),
                getWorldCupMatches(),
                getWorldCupConfig(),
            ]);
            setPending(pend);
            setAllMatches(all);
            setFinished(all.filter((m) => m.status === "FINISHED"));
            setConfig(cfg);
        } catch (err) {
            handleError(err, "Error al cargar partidos");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!user || !profile) return;
        if (!isSuperAdmin(profile)) {
            router.replace("/");
            return;
        }
        load();
    }, [user, profile, router, load]);

    if (loading) {
        return (
            <div className="flex justify-center pt-20">
                <Loader2 className="w-8 h-8 animate-spin text-[#1f7a4f]" />
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto px-4 pt-6 pb-24 md:pb-8">
            <header className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <Trophy className="w-6 h-6 text-[#1f7a4f]" />
                    <h1 className="text-xl font-bold text-gray-900">Cargar resultados</h1>
                </div>
                <Link
                    href="/worldcup"
                    className="flex items-center gap-1.5 text-sm font-semibold text-[#1f7a4f] bg-[#1f7a4f]/10 px-3 py-1.5 rounded-full"
                >
                    <Eye className="w-4 h-4" /> Ver polla
                </Link>
            </header>

            {/* Pendientes de cargar */}
            <section className="mb-8">
                <h2 className="text-sm font-semibold text-gray-500 mb-3">
                    Por cargar ({pending.length})
                </h2>
                {pending.length === 0 ? (
                    <p className="text-sm text-gray-400 bg-gray-50 rounded-xl p-4 text-center">
                        No hay partidos pendientes de resultado.
                    </p>
                ) : (
                    <div className="space-y-3">
                        {pending.map((m) => (
                            <AdminMatchResultForm key={m.id} match={m} onSaved={load} />
                        ))}
                    </div>
                )}
            </section>

            {/* Código de acceso — para sumar gente sin abrir a todos */}
            <section className="mb-8">
                <h2 className="text-sm font-semibold text-gray-500 mb-3">Acceso por código</h2>
                <AdminAccessCodeForm />
            </section>

            {/* Participantes que ya se unieron */}
            <section className="mb-8">
                <h2 className="text-sm font-semibold text-gray-500 mb-3">Quién se unió</h2>
                <AdminParticipantsList />
            </section>

            {/* Campeón y subcampeón (bonus) — al final del torneo */}
            {config && allMatches.length > 0 && (
                <section className="mb-8">
                    <h2 className="text-sm font-semibold text-gray-500 mb-3">Campeón del torneo (bonus)</h2>
                    <AdminChampionsForm matches={allMatches} config={config} onSaved={load} />
                </section>
            )}

            {/* Ya finalizados — corregir si hace falta */}
            {finished.length > 0 && (
                <section>
                    <h2 className="text-sm font-semibold text-gray-500 mb-3">
                        Finalizados ({finished.length}) — corregir
                    </h2>
                    <div className="space-y-3">
                        {finished.map((m) => (
                            <AdminMatchResultForm key={m.id} match={m} onSaved={load} />
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}

export default function WorldCupAdminPage() {
    return (
        <AuthGuard>
            <WorldCupAdminContent />
        </AuthGuard>
    );
}
