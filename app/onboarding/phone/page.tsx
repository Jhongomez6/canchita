"use client";

import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { updateUserPhone } from "@/lib/users";
import { handleError } from "@/lib/utils/error";

// ========================
// REGLAS
// ========================
const PHONE_REGEX = /^3\d{9}$/;

export default function PhoneOnboardingPage() {
    const { user, profile } = useAuth();

    // Form data
    const [phone, setPhone] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    // Si no está logueado o si ya tiene teléfono, se manejará idealmente en el AuthGuard
    // pero si por alguna razón renderiza:
    if (!user || !profile) return null;

    const isValid = PHONE_REGEX.test(phone);

    const handleSave = async () => {
        if (!isValid) return;
        setIsSaving(true);
        try {
            await updateUserPhone(user.uid, phone);
            // Al actualizar exitosamente, forzamos la recarga (o dejamos que AuthGuard lo libere).
            // Lo más seguro es redirigir al home o recargar la app para que el contexto re-evalúe todo.
            window.location.href = "/";
        } catch (error) {
            handleError(error, "Error al guardar el teléfono. Intenta de nuevo.");
            setIsSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl relative overflow-hidden">

                {/* Loader overlay */}
                {isSaving && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
                        <div className="w-12 h-12 border-4 border-emerald-100 border-t-[#1f7a4f] rounded-full animate-spin mb-4" />
                        <p className="text-emerald-800 font-bold animate-pulse">Guardando...</p>
                    </div>
                )}

                <div className="text-center mb-6">
                    <p className="inline-block bg-emerald-100 text-[#1f7a4f] px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-4">
                        Actualización de Perfil
                    </p>
                    <h1 className="text-2xl font-bold text-gray-800">📱 Número de Contacto</h1>
                </div>

                <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl mb-8">
                    <p className="text-sm text-emerald-800 leading-relaxed font-medium">
                        Lo necesitamos para que el capitán o administrador del partido pueda contactarte en caso de alguna novedad, cambio de horario o información importante.
                        <br /><br />
                        <strong>🔒 Solo será visible para los organizadores, nunca de forma pública.</strong>
                    </p>
                </div>

                <label className="block mb-8 relative">
                    <span className="text-sm font-semibold text-gray-700 block mb-2">WhatsApp / Número Móvil</span>
                    <div className="flex relative items-center">
                        <span className="absolute left-4 font-bold text-gray-400 select-none">+57</span>
                        <input
                            type="tel"
                            value={phone}
                            onChange={e => {
                                // Limpiar no-números
                                const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                                setPhone(val);
                            }}
                            placeholder="3XX XXX XXXX"
                            className="w-full px-4 py-4 pl-14 border-2 border-gray-200 rounded-xl text-xl font-bold focus:outline-none focus:ring-0 focus:border-[#1f7a4f] tracking-wider transition-all"
                            disabled={isSaving}
                        />
                    </div>
                    {phone && !isValid && (
                        <p className="text-xs font-bold text-red-500 mt-1 absolute top-full left-0 w-full">
                            Debe ser un número válido de 10 dígitos (ej:3001234567).
                        </p>
                    )}
                    {isValid && (
                        <p className="text-xs font-bold text-[#1f7a4f] mt-1 absolute top-full left-0 w-full">
                            ✔ Formato válido
                        </p>
                    )}
                </label>

                <button
                    disabled={!isValid || isSaving}
                    onClick={handleSave}
                    className={`w-full py-4 rounded-xl text-white font-bold text-lg transition-all shadow-lg ${!isValid || isSaving
                        ? "bg-gray-300 cursor-not-allowed shadow-none"
                        : "bg-[#1f7a4f] hover:bg-[#16603c] hover:shadow-xl hover:-translate-y-0.5"
                        }`}
                >
                    Continuar a la App
                </button>
            </div>
        </div>
    );
}
