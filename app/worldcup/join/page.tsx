"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trophy, Loader2, Ticket } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { hasWorldCupAccess } from "@/lib/domain/user";
import { getWorldCupConfig, redeemAccessCode } from "@/lib/worldcup";
import { handleError } from "@/lib/utils/error";
import toast from "react-hot-toast";
import AuthGuard from "@/components/AuthGuard";

function JoinContent() {
    const { profile } = useAuth();
    const router = useRouter();
    const [pollEnabled, setPollEnabled] = useState(false);
    const [code, setCode] = useState("");
    const [redeeming, setRedeeming] = useState(false);

    // Lee el flag global (para saber si ya hay acceso por flag global).
    useEffect(() => {
        getWorldCupConfig().then((c) => setPollEnabled(c.pollEnabled)).catch(() => { });
    }, []);

    // Si ya tiene acceso (por código, super_admin o flag global), entra directo.
    useEffect(() => {
        if (profile && hasWorldCupAccess(profile, pollEnabled)) {
            router.replace("/worldcup");
        }
    }, [profile, pollEnabled, router]);

    const handleRedeem = async () => {
        if (!code.trim()) {
            toast.error("Ingresá el código");
            return;
        }
        setRedeeming(true);
        try {
            await redeemAccessCode(code);
            toast.success("¡Acceso activado! 🎉");
            // El perfil se actualiza solo (onSnapshot) → el useEffect redirige a /worldcup.
        } catch (err) {
            handleError(err, "No se pudo activar el acceso");
            setRedeeming(false);
        }
    };

    return (
        <div className="max-w-md mx-auto px-4 pt-16 pb-24 md:pb-8">
            <div className="flex flex-col items-center text-center mb-8">
                <div className="w-16 h-16 rounded-2xl bg-[#1f7a4f]/10 flex items-center justify-center mb-4">
                    <Trophy className="w-8 h-8 text-[#1f7a4f]" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900">Polla Mundial</h1>
                <p className="text-gray-500 mt-2">
                    Ingresá el código que te compartieron para unirte a la polla.
                </p>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <label className="block">
                    <span className="text-xs font-semibold text-gray-500">Código de acceso</span>
                    <div className="flex items-center gap-2 mt-1">
                        <Ticket className="w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            placeholder="Ej. MUNDIAL2026"
                            disabled={redeeming}
                            autoCapitalize="characters"
                            className="flex-1 h-11 px-3 rounded-xl border border-gray-200 text-base text-gray-900 uppercase"
                        />
                    </div>
                </label>
                <button
                    type="button"
                    onClick={handleRedeem}
                    disabled={redeeming}
                    className="w-full h-11 mt-4 flex items-center justify-center gap-2 rounded-xl bg-[#1f7a4f] text-white font-semibold disabled:opacity-50 active:scale-[0.99] transition"
                >
                    {redeeming ? <Loader2 className="w-5 h-5 animate-spin" /> : "Activar acceso"}
                </button>
            </div>
        </div>
    );
}

export default function WorldCupJoinPage() {
    return (
        <AuthGuard>
            <JoinContent />
        </AuthGuard>
    );
}
