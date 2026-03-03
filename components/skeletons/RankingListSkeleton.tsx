import React from 'react';

export default function RankingListSkeleton() {
    return (
        <main style={{ maxWidth: 800, margin: "0 auto", padding: 16 }}>
            <div
                style={{
                    background: "#fff",
                    borderRadius: 16,
                    padding: 24,
                    boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
                }}
            >
                {/* STATIC TITLE */}
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

                {/* SKELETON TABLE */}
                <div style={{ overflowX: "auto" }} className="animate-pulse">
                    <table
                        style={{
                            width: "100%",
                            borderCollapse: "collapse",
                            fontSize: 15,
                        }}
                    >
                        <thead>
                            <tr>
                                {[
                                    { label: "#", w: 30 },
                                    { label: "Jugador", w: 120 },
                                    { label: "PJ", w: 40 },
                                    { label: "PG", w: 40 },
                                    { label: "PE", w: 40 },
                                    { label: "PP", w: 40 },
                                ].map((col, idx) => (
                                    <th
                                        key={idx}
                                        style={{
                                            padding: "12px 16px",
                                            textAlign: idx === 0 || idx === 1 ? "left" : "center",
                                            borderBottom: "2px solid #e5e7eb",
                                        }}
                                    >
                                        <div
                                            className="h-4 bg-slate-200 rounded"
                                            style={{
                                                width: col.w,
                                                margin: idx === 0 || idx === 1 ? "0" : "0 auto",
                                            }}
                                        ></div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                                <tr
                                    key={i}
                                    style={{
                                        background: i % 2 === 0 ? "#fff" : "#f9fafb",
                                    }}
                                >
                                    <td style={{ padding: "12px 16px", borderBottom: "1px solid #f3f4f6" }}>
                                        <div className="h-5 w-6 bg-slate-200 rounded"></div>
                                    </td>
                                    <td style={{ padding: "12px 16px", borderBottom: "1px solid #f3f4f6" }}>
                                        <div className="h-5 w-40 bg-slate-200 rounded"></div>
                                    </td>
                                    {[1, 2, 3, 4].map((j) => (
                                        <td key={j} style={{ padding: "12px 16px", borderBottom: "1px solid #f3f4f6" }}>
                                            <div className="h-5 w-8 bg-slate-200 rounded mx-auto"></div>
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </main>
    );
}
