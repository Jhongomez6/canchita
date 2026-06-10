"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { hasWorldCupAccess } from "@/lib/domain/user";
import { WC_PRIZE_FREE_MATCHES } from "@/lib/domain/worldcup";
import { getWorldCupConfig, getLeaderboard } from "@/lib/worldcup";
import { logWorldCupLeaderboardViewed } from "@/lib/analytics";
import { handleError } from "@/lib/utils/error";
import AuthGuard from "@/components/AuthGuard";
import WorldCupLeaderboard from "@/components/worldcup/WorldCupLeaderboard";
import MyPositionBanner from "@/components/worldcup/MyPositionBanner";
import type { WCLeaderboardEntry } from "@/lib/domain/worldcup";

function LeaderboardContent() {
    const { user, profile } = useAuth();
    const router = useRouter();
    const [entries, setEntries] = useState<WCLeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user || !profile) return;

        (async () => {
            try {
                const config = await getWorldCupConfig();
                if (!hasWorldCupAccess(profile, config.pollEnabled)) {
                    router.replace("/");
                    return;
                }
                const list = await getLeaderboard();
                setEntries(list);
                const myIdx = list.findIndex((e) => e.userId === user.uid);
                logWorldCupLeaderboardViewed(myIdx >= 0 ? myIdx + 1 : 0);
            } catch (err) {
                handleError(err, "Error al cargar la tabla");
            } finally {
                setLoading(false);
            }
        })();
    }, [user, profile, router]);

    if (loading) {
        return (
            <div className="flex justify-center pt-20">
                <Loader2 className="w-8 h-8 animate-spin text-[#1f7a4f]" />
            </div>
        );
    }

    const myIdx = entries.findIndex((e) => e.userId === user!.uid);
    const myEntry = myIdx >= 0 ? entries[myIdx] : null;
    const myPosition = myIdx >= 0 ? myIdx + 1 : null;

    return (
        <div className="max-w-2xl mx-auto px-4 pt-6 pb-24 md:pb-8">
            <header className="flex items-center gap-3 mb-5">
                <Link href="/worldcup" className="text-gray-400 hover:text-gray-600">
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <h1 className="text-xl font-bold text-gray-900">Tabla de la polla</h1>
            </header>

            <p className="text-xs text-gray-500 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-3">
                🎁 El 1º al final del Mundial gana <strong>{WC_PRIZE_FREE_MATCHES} partidos gratis</strong> (no paga su cuota).
            </p>

            <MyPositionBanner position={myPosition} entry={myEntry} />
            <WorldCupLeaderboard entries={entries} currentUserId={user!.uid} />
        </div>
    );
}

export default function WorldCupLeaderboardPage() {
    return (
        <AuthGuard>
            <LeaderboardContent />
        </AuthGuard>
    );
}
