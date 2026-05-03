"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useRouter } from "next/navigation";
import { getPlayersRanking, type PlayerRanking } from "@/lib/usersList";
import AuthGuard from "@/components/AuthGuard";
import RankingListSkeleton from "@/components/skeletons/RankingListSkeleton";
import { isSuperAdmin } from "@/lib/domain/user";
import { Flame } from "lucide-react";

type SortField = "played" | "won" | "lost" | "draw" | "winRate" | "commitmentStreak" | "weeklyStreak" | "mvpAwards";

export default function RankingPage() {
    const { profile } = useAuth();
    const router = useRouter();
    const [players, setPlayers] = useState<PlayerRanking[]>([]);
    const [loading, setLoading] = useState(true);
    const [sortField, setSortField] = useState<SortField>("won");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

    useEffect(() => {
        // Only redirect if we HAVE a profile and it's NOT a super admin.
        // If profile is still loading (null), AuthGuard handles the generic redirect.
        if (profile && !isSuperAdmin(profile)) {
            router.replace("/");
        }
    }, [profile, router]);

    const loadRanking = useCallback(async () => {
        setLoading(true);
        const data = await getPlayersRanking();
        setPlayers(data);
        setLoading(false);
    }, []);

    useEffect(() => {
        // Prevent fetching if not logged in or not a super admin
        if (!profile || !isSuperAdmin(profile)) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadRanking();
    }, [profile, loadRanking]);

    function handleSort(field: SortField) {
        if (sortField === field) {
            setSortDir((prev) => (prev === "desc" ? "asc" : "desc"));
        } else {
            setSortField(field);
            setSortDir("desc");
        }
    }

    const sorted = [...players].sort((a, b) => {
        const diff = a[sortField] - b[sortField];
        return sortDir === "desc" ? -diff : diff;
    });

    const headerStyle = (field: SortField): React.CSSProperties => ({
        padding: "12px 16px",
        textAlign: "center" as const,
        cursor: "pointer",
        userSelect: "none" as const,
        fontWeight: 700,
        fontSize: 14,
        color: sortField === field ? "#1f7a4f" : "#374151",
        background: sortField === field ? "#f0fdf4" : "transparent",
        borderBottom: sortField === field ? "3px solid #1f7a4f" : "2px solid #e5e7eb",
        transition: "all 0.15s ease",
        whiteSpace: "nowrap" as const,
    });

    const cellStyle: React.CSSProperties = {
        padding: "12px 16px",
        textAlign: "center",
        fontSize: 15,
        borderBottom: "1px solid #f3f4f6",
    };

    const arrow = (field: SortField) => {
        if (sortField !== field) return "";
        return sortDir === "desc" ? " ▼" : " ▲";
    };

    if (!profile || !isSuperAdmin(profile)) {
        return (
            <AuthGuard>
                <RankingListSkeleton />
            </AuthGuard>
        );
    }

    if (loading) {
        return (
            <AuthGuard>
                <RankingListSkeleton />
            </AuthGuard>
        );
    }

    return (
        <AuthGuard>
            <main style={{ maxWidth: 800, margin: "0 auto", padding: 16 }}>
                <div
                    style={{
                        background: "#fff",
                        borderRadius: 16,
                        padding: 24,
                        boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
                    }}
                >
                    <h1
                        style={{
                            marginBottom: 4,
                            fontSize: 24,
                            fontWeight: 700,
                            color: "#111827",
                        }}
                    >
                        🏆 Ranking de Jugadores
                    </h1>
                    <p
                        style={{
                            marginBottom: 20,
                            fontSize: 14,
                            color: "#6b7280",
                        }}
                    >
                        Haz clic en las columnas para ordenar
                    </p>

                    {players.length === 0 ? (
                        <p style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>
                            No hay jugadores registrados
                        </p>
                    ) : (
                        <div style={{ overflowX: "auto" }}>
                            <table
                                style={{
                                    width: "100%",
                                    borderCollapse: "collapse",
                                    fontSize: 15,
                                }}
                            >
                                <thead>
                                    <tr>
                                        <th
                                            style={{
                                                padding: "12px 16px",
                                                textAlign: "left",
                                                fontWeight: 700,
                                                fontSize: 14,
                                                color: "#374151",
                                                borderBottom: "2px solid #e5e7eb",
                                            }}
                                        >
                                            #
                                        </th>
                                        <th
                                            style={{
                                                padding: "12px 16px",
                                                textAlign: "left",
                                                fontWeight: 700,
                                                fontSize: 14,
                                                color: "#374151",
                                                borderBottom: "2px solid #e5e7eb",
                                            }}
                                        >
                                            Jugador
                                        </th>
                                        <th
                                            style={headerStyle("played")}
                                            onClick={() => handleSort("played")}
                                        >
                                            PJ{arrow("played")}
                                        </th>
                                        <th
                                            style={headerStyle("won")}
                                            onClick={() => handleSort("won")}
                                        >
                                            PG{arrow("won")}
                                        </th>
                                        <th
                                            style={headerStyle("draw")}
                                            onClick={() => handleSort("draw")}
                                        >
                                            PE{arrow("draw")}
                                        </th>
                                        <th
                                            style={headerStyle("lost")}
                                            onClick={() => handleSort("lost")}
                                        >
                                            PP{arrow("lost")}
                                        </th>
                                        <th
                                            style={headerStyle("winRate")}
                                            onClick={() => handleSort("winRate")}
                                            title="Win Rate (PG/PJ)"
                                        >
                                            WR%{arrow("winRate")}
                                        </th>
                                        <th
                                            style={headerStyle("commitmentStreak")}
                                            onClick={() => handleSort("commitmentStreak")}
                                            title="Racha de compromiso"
                                        >
                                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                                CS <Flame size={14} style={{ color: "#ea580c" }} />
                                            </span>
                                            {arrow("commitmentStreak")}
                                        </th>
                                        <th
                                            style={headerStyle("weeklyStreak")}
                                            onClick={() => handleSort("weeklyStreak")}
                                            title="Racha semanal"
                                        >
                                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                                WS <Flame size={14} style={{ color: "#2563eb" }} />
                                            </span>
                                            {arrow("weeklyStreak")}
                                        </th>
                                        <th
                                            style={headerStyle("mvpAwards")}
                                            onClick={() => handleSort("mvpAwards")}
                                            title="Premios MVP"
                                        >
                                            MVP{arrow("mvpAwards")}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sorted.map((p, i) => (
                                        <tr
                                            key={p.uid}
                                            style={{
                                                background: i % 2 === 0 ? "#fff" : "#f9fafb",
                                                transition: "background 0.15s ease",
                                            }}
                                            onMouseOver={(e) => {
                                                e.currentTarget.style.background = "#f0fdf4";
                                            }}
                                            onMouseOut={(e) => {
                                                e.currentTarget.style.background =
                                                    i % 2 === 0 ? "#fff" : "#f9fafb";
                                            }}
                                        >
                                            <td
                                                style={{
                                                    ...cellStyle,
                                                    textAlign: "left",
                                                    fontWeight: 600,
                                                    color: i < 3 ? "#1f7a4f" : "#9ca3af",
                                                    fontSize: 16,
                                                }}
                                            >
                                                {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                                            </td>
                                            <td
                                                style={{
                                                    ...cellStyle,
                                                    textAlign: "left",
                                                    fontWeight: 600,
                                                    color: "#111827",
                                                }}
                                            >
                                                {p.name}
                                            </td>
                                            <td
                                                style={{
                                                    ...cellStyle,
                                                    fontWeight: sortField === "played" ? 700 : 400,
                                                    color: sortField === "played" ? "#1f7a4f" : "#374151",
                                                }}
                                            >
                                                {p.played}
                                            </td>
                                            <td
                                                style={{
                                                    ...cellStyle,
                                                    fontWeight: sortField === "won" ? 700 : 400,
                                                    color: sortField === "won" ? "#16a34a" : "#374151",
                                                }}
                                            >
                                                {p.won}
                                            </td>
                                            <td
                                                style={{
                                                    ...cellStyle,
                                                    fontWeight: sortField === "draw" ? 700 : 400,
                                                    color: sortField === "draw" ? "#ca8a04" : "#374151",
                                                }}
                                            >
                                                {p.draw}
                                            </td>
                                            <td
                                                style={{
                                                    ...cellStyle,
                                                    fontWeight: sortField === "lost" ? 700 : 400,
                                                    color: sortField === "lost" ? "#dc2626" : "#374151",
                                                }}
                                            >
                                                {p.lost}
                                            </td>
                                            <td
                                                style={{
                                                    ...cellStyle,
                                                    fontWeight: sortField === "winRate" ? 700 : 400,
                                                    color: sortField === "winRate" ? "#1f7a4f" : "#374151",
                                                }}
                                            >
                                                {p.winRate}%
                                            </td>
                                            <td
                                                style={{
                                                    ...cellStyle,
                                                    fontWeight: sortField === "commitmentStreak" ? 700 : 400,
                                                    color: sortField === "commitmentStreak" ? "#ea580c" : "#374151",
                                                }}
                                            >
                                                {p.commitmentStreak}
                                            </td>
                                            <td
                                                style={{
                                                    ...cellStyle,
                                                    fontWeight: sortField === "weeklyStreak" ? 700 : 400,
                                                    color: sortField === "weeklyStreak" ? "#2563eb" : "#374151",
                                                }}
                                            >
                                                {p.weeklyStreak}
                                            </td>
                                            <td
                                                style={{
                                                    ...cellStyle,
                                                    fontWeight: sortField === "mvpAwards" ? 700 : 400,
                                                    color: sortField === "mvpAwards" ? "#ca8a04" : "#374151",
                                                }}
                                            >
                                                {p.mvpAwards}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </main>
        </AuthGuard>
    );
}
