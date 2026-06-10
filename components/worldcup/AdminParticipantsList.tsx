"use client";

import { useState } from "react";
import { Users, Loader2, RefreshCw } from "lucide-react";
import { getWorldCupParticipants, type WCParticipant } from "@/lib/worldcup";
import { handleError } from "@/lib/utils/error";

/**
 * Lista de jugadores que canjearon el código (tienen worldCupEnabled).
 * Carga a demanda (no en cada visita) para no gastar lecturas de Firestore.
 */
export default function AdminParticipantsList() {
    const [participants, setParticipants] = useState<WCParticipant[] | null>(null);
    const [loading, setLoading] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const list = await getWorldCupParticipants();
            list.sort((a, b) => a.name.localeCompare(b.name));
            setParticipants(list);
        } catch (err) {
            handleError(err, "Error al cargar participantes");
        } finally {
            setLoading(false);
        }
    };

    // Estado inicial: no se cargó nada todavía → botón para pedirlo.
    if (participants === null) {
        return (
            <div className="rounded-2xl border border-gray-100 bg-white p-4">
                <div className="flex items-center gap-2 mb-3">
                    <Users className="w-5 h-5 text-[#1f7a4f]" />
                    <h2 className="font-bold text-gray-900">Participantes</h2>
                </div>
                <button
                    type="button"
                    onClick={load}
                    disabled={loading}
                    className="w-full h-11 flex items-center justify-center gap-2 rounded-xl bg-gray-100 text-gray-700 font-semibold disabled:opacity-50 active:scale-[0.99] transition"
                >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Users className="w-4 h-4" />Ver quién se unió</>}
                </button>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-gray-100 bg-white p-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-[#1f7a4f]" />
                    <h2 className="font-bold text-gray-900">
                        Participantes ({participants.length})
                    </h2>
                </div>
                <button
                    type="button"
                    onClick={load}
                    disabled={loading}
                    className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 disabled:opacity-50"
                    aria-label="Actualizar"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                </button>
            </div>

            {participants.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-3">Todavía nadie se unió con el código.</p>
            ) : (
                <ul className="space-y-1.5">
                    {participants.map((p) => (
                        <li key={p.uid} className="flex items-center gap-2.5">
                            {p.photoURLThumb ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={p.photoURLThumb} alt="" className="w-7 h-7 rounded-full object-cover" />
                            ) : (
                                <span className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-[11px] font-bold text-gray-500">
                                    {p.name.charAt(0).toUpperCase()}
                                </span>
                            )}
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                                {p.email && <p className="text-[11px] text-gray-400 truncate">{p.email}</p>}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
