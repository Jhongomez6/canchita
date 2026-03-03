import React from 'react';

export default function UserListSkeleton() {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }} className="animate-pulse">
            {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                    key={i}
                    style={{
                        border: "1px solid #ddd",
                        borderRadius: 12,
                        padding: 16,
                    }}
                >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <div>
                            <div className="h-5 w-40 bg-slate-200 rounded mb-1"></div>
                            <div className="h-3 w-32 bg-slate-100 rounded"></div>
                        </div>

                        <div className="h-8 w-20 bg-red-100 rounded-lg"></div>
                    </div>

                    {/* Role chips */}
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <div className="h-8 w-24 border border-slate-200 bg-slate-50 rounded-full"></div>
                        <div className="h-8 w-28 border border-slate-200 bg-slate-50 rounded-full"></div>
                    </div>

                    {/* Positions */}
                    <div className="h-3 w-32 bg-slate-200 rounded mt-3"></div>
                </div>
            ))}
        </div>
    );
}
