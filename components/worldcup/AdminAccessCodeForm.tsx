"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Ticket, Loader2, Check, Copy } from "lucide-react";
import { getAccessCode, setAccessCode, getWorldCupConfig, setJoinByCodeOpen } from "@/lib/worldcup";
import { handleError } from "@/lib/utils/error";

/**
 * Form del admin para definir/cambiar el código de acceso por el que los
 * usuarios se unen a la polla, y copiar el link a compartir.
 */
export default function AdminAccessCodeForm() {
    const [code, setCode] = useState("");
    const [joinOpen, setJoinOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [joinUrl, setJoinUrl] = useState("");

    useEffect(() => {
        setJoinUrl(`${window.location.origin}/worldcup/join`);
        Promise.all([getAccessCode(), getWorldCupConfig()])
            .then(([c, cfg]) => {
                setCode(c);
                setJoinOpen(cfg.joinByCodeOpen === true);
            })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    const handleSave = async () => {
        if (!code.trim()) {
            toast.error("Ingresá un código");
            return;
        }
        setSaving(true);
        try {
            await setAccessCode(code);
            await setJoinByCodeOpen(joinOpen);
            toast.success("Código guardado");
        } catch (err) {
            handleError(err, "No se pudo guardar el código");
        } finally {
            setSaving(false);
        }
    };

    const copyShare = async () => {
        const text = `¡Unite a la Polla Mundialista! 🏆\nEntrá acá: ${joinUrl}\nY usá el código: ${code.trim().toUpperCase()}`;
        try {
            await navigator.clipboard.writeText(text);
            toast.success("Mensaje copiado para compartir");
        } catch {
            toast.error("No se pudo copiar");
        }
    };

    if (loading) {
        return (
            <div className="rounded-2xl border border-gray-100 bg-white p-4 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-gray-100 bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
                <Ticket className="w-5 h-5 text-[#1f7a4f]" />
                <h2 className="font-bold text-gray-900">Código de acceso</h2>
            </div>
            <p className="text-xs text-gray-500 mb-3">
                Quien tenga este código puede unirse a la polla desde el link, sin abrirla a todos.
            </p>

            <label className="block mb-3">
                <span className="text-xs font-semibold text-gray-500">Código</span>
                <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Ej. MUNDIAL2026"
                    disabled={saving}
                    autoCapitalize="characters"
                    className="w-full h-11 mt-1 px-3 rounded-xl border border-gray-200 text-base text-gray-900 uppercase"
                />
            </label>

            <label className="flex items-start gap-2 mb-3 cursor-pointer">
                <input
                    type="checkbox"
                    checked={joinOpen}
                    onChange={(e) => setJoinOpen(e.target.checked)}
                    disabled={saving}
                    className="mt-0.5 w-4 h-4 accent-[#1f7a4f]"
                />
                <span className="text-sm text-gray-700">
                    Mostrar <strong>“Mundial”</strong> en el menú a todos. Quien no tenga acceso verá la pantalla para ingresar el código.
                </span>
            </label>

            <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="w-full h-11 flex items-center justify-center gap-2 rounded-xl bg-[#1f7a4f] text-white font-semibold disabled:opacity-50 active:scale-[0.99] transition"
            >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Check className="w-5 h-5" />Guardar código</>}
            </button>

            {code.trim() && (
                <button
                    type="button"
                    onClick={copyShare}
                    className="w-full h-10 mt-2 flex items-center justify-center gap-2 rounded-xl border border-gray-200 text-gray-600 font-semibold active:scale-[0.99] transition"
                >
                    <Copy className="w-4 h-4" /> Copiar mensaje para compartir
                </button>
            )}
        </div>
    );
}
