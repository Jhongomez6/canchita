"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { saveOnboardingResult } from "@/lib/users";
import { handleError } from "@/lib/utils/error";
import {
    calculateInitialRating,
    type OnboardingData,
    type TechLevel,
    type PhysLevel,
    type Frequency,
    type Sex,
    type Foot,
    type CourtSize,
    type RatingResult,
} from "@/lib/domain/rating";
import type { Position } from "@/lib/domain/player";
import { ALLOWED_POSITIONS, POSITION_LABELS, POSITION_ICONS } from "@/lib/domain/player";
import { logOnboardingCompleted } from "@/lib/analytics";

// ========================
// CONSTANTES DE COPY
// ========================

const TECH_OPTIONS: { level: TechLevel; title: string; desc: string }[] = [
    { level: 1, title: "Básico", desc: "Aprendiendo. Me cuesta controlar el balón y dar pases precisos en movimiento." },
    { level: 2, title: "Funcional", desc: "Cumplidor. Controlo y paso bien sin marca, pero me cuesta bajo presión." },
    { level: 3, title: "Competitivo", desc: "Jugador de equipo. Tengo buen control orientado y pases largos precisos." },
    { level: 4, title: "Avanzado", desc: "Diferencial. Gano duelos 1vs1, tengo regate y buena pegada." },
    { level: 5, title: "Elite", desc: "Nivel Pro. Dominio de ambos perfiles y técnica de alta competencia o Futsal." },
];

const PHYS_OPTIONS: { level: PhysLevel; title: string; desc: string }[] = [
    { level: 1, title: "Bajo", desc: "Fuera de forma. Aguanto 10-15 minutos de intensidad y necesito cambios." },
    { level: 2, title: "Promedio", desc: "Ritmo amateur. Aguanto el partido pero mi intensidad baja mucho al final." },
    { level: 3, title: "Bueno", desc: "Resistente. Corro todo el partido a ritmo constante sin pedir cambio." },
    { level: 4, title: "Alto", desc: "Intenso. Hago múltiples sprints de ida y vuelta y me recupero rápido." },
    { level: 5, title: "Atleta", desc: "Incansable. Presión alta constante durante los 60-90 minutos." },
];

const FREQ_OPTIONS: { value: Frequency; label: string; desc: string }[] = [
    { value: "occasional", label: "Ocasional", desc: "1 vez al mes o menos" },
    { value: "weekly", label: "Semanal", desc: "1-2 veces por semana" },
    { value: "intense", label: "Intenso", desc: "3+ veces por semana" },
];

const SEX_OPTIONS: { value: Sex; label: string }[] = [
    { value: "male", label: "Masculino" },
    { value: "female", label: "Femenino" },
    { value: "other", label: "Otro" },
];

const FOOT_OPTIONS: { value: Foot; label: string }[] = [
    { value: "left", label: "Izquierdo" },
    { value: "right", label: "Derecho" },
    { value: "ambidextrous", label: "Ambidiestro" },
];

const COURT_OPTIONS: { value: CourtSize; label: string }[] = [
    { value: "6v6", label: "6 vs 6" },
    { value: "9v9", label: "9 vs 9" },
    { value: "11v11", label: "11 vs 11" },
];

const CALCULATING_MESSAGES = [
    "Analizando tu trayectoria...",
    "Escaneando hitos técnicos...",
    "Evaluando condición física...",
    "Generando tu rating...",
];

// ========================
// COMPONENT
// ========================

export default function OnboardingPage() {
    const { user, profile, loading: authLoading } = useAuth();
    const router = useRouter();

    // Step state
    const [step, setStep] = useState(1);

    // 🛡️ Redirect if onboarding is already completed
    useEffect(() => {
        if (!authLoading && profile?.initialRatingCalculated) {
            router.replace("/profile");
        }
    }, [profile, authLoading, router]);

    // Form data
    const [age, setAge] = useState("");
    const [phone, setPhone] = useState("");
    const [sex, setSex] = useState<Sex | "">("");
    const [foot, setFoot] = useState<Foot | "">("");
    const [court, setCourt] = useState<CourtSize | "">("");
    const [techLevel, setTechLevel] = useState<TechLevel | 0>(0);
    const [physLevel, setPhysLevel] = useState<PhysLevel | 0>(0);
    const [hasSchool, setHasSchool] = useState(false);
    const [hasTournaments, setHasTournaments] = useState(false);
    const [frequency, setFrequency] = useState<Frequency | "">("");
    const [positions, setPositions] = useState<Position[]>([]);
    const [primaryPosition, setPrimaryPosition] = useState<Position | null>(null);

    // Calculating + result
    const [calcMsgIndex, setCalcMsgIndex] = useState(0);
    const [result, setResult] = useState<RatingResult | null>(null);

    // Step validation
    const canNext = (): boolean => {
        switch (step) {
            case 1:
                return !!age && Number(age) >= 18 && Number(age) <= 70 && !!sex && !!foot && !!court;
            case 2:
                return /^3\d{9}$/.test(phone);
            case 3:
                return techLevel > 0;
            case 4:
                return physLevel > 0;
            case 5:
                return !!frequency;
            case 6:
                return positions.length >= 1 && positions.length <= 3 && !!primaryPosition;
            default:
                return false;
        }
    };

    // Calculating animation + Firebase save
    useEffect(() => {
        if (step !== 7) return;

        const data: OnboardingData = {
            age: Number(age),
            sex: sex as Sex,
            dominantFoot: foot as Foot,
            preferredCourt: court as CourtSize,
            techLevel: techLevel as TechLevel,
            physLevel: physLevel as PhysLevel,
            hasSchool,
            hasTournaments,
            frequency: frequency as Frequency,
        };

        const ratingResult = calculateInitialRating(data);

        // Rotate messages every 750ms
        let msgIdx = 0;
        const interval = setInterval(() => {
            msgIdx++;
            if (msgIdx < CALCULATING_MESSAGES.length) {
                setCalcMsgIndex(msgIdx);
            }
        }, 750);

        // Save to Firebase + show result
        (async () => {
            const startTime = Date.now();
            try {
                await saveOnboardingResult(user!.uid, {
                    rating: ratingResult.rating,
                    level: ratingResult.level,
                    age: Number(age),
                    sex: sex as string,
                    dominantFoot: foot as string,
                    preferredCourt: court as string,
                    positions,
                    primaryPosition: primaryPosition as Position,
                    techLevel: techLevel as number,
                    physLevel: physLevel as number,
                    hasSchool,
                    hasTournaments,
                    frequency: frequency as string,
                    phone,
                });
                logOnboardingCompleted();

                const elapsed = Date.now() - startTime;
                const remaining = Math.max(0, 3000 - elapsed);

                setTimeout(() => {
                    clearInterval(interval);
                    setResult(ratingResult);
                    setStep(8);
                }, remaining > 0 ? remaining : 0);
            } catch (err) {
                clearInterval(interval);
                handleError(err, "Hubo un error al guardar tu perfil. Intenta de nuevo.");
                setStep(6);
            }
        })();

        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step]);

    if (!user || authLoading || profile?.initialRatingCalculated) return null;

    // ========================
    // SHARED COMPONENTS
    // ========================

    const progressBar = (
        <div className="h-1 bg-gray-200 rounded-full mb-8 overflow-hidden">
            <div
                className="h-full bg-[#1f7a4f] rounded-full transition-all duration-500 ease-out"
                style={{ width: `${(Math.min(step, 6) / 6) * 100}%` }}
            />
        </div>
    );

    // ========================
    // STEP 1: Datos personales
    // ========================
    if (step === 1) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl">
                    {progressBar}
                    <div className="text-center mb-6">
                        <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Paso 1 de 6</p>
                        <h1 className="text-2xl font-bold text-gray-800 mt-1">📋 Datos Personales</h1>
                    </div>

                    {/* EDAD */}
                    <label className="block mb-4">
                        <span className="text-sm font-semibold text-gray-700 block mb-2">Edad</span>
                        <input
                            type="number"
                            value={age}
                            onChange={e => setAge(e.target.value)}
                            placeholder="Ej: 25"
                            min={18}
                            max={70}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-lg focus:outline-none focus:ring-2 focus:ring-[#1f7a4f] focus:border-transparent transition-all"
                        />
                        {age && Number(age) < 18 && (
                            <p className="text-xs text-red-500 font-medium mt-2 animate-in fade-in">
                                Debes ser mayor de 18 años para usar la plataforma.
                            </p>
                        )}
                    </label>

                    {/* SEXO */}
                    <div className="mb-4">
                        <span className="text-sm font-semibold text-gray-700 block mb-2">Sexo</span>
                        <div className="flex gap-2">
                            {SEX_OPTIONS.map(o => (
                                <button
                                    key={o.value}
                                    onClick={() => setSex(o.value)}
                                    className={`flex-1 py-3 px-4 rounded-xl text-sm font-semibold transition-all border-2 ${sex === o.value
                                        ? "border-[#1f7a4f] bg-emerald-50 text-[#1f7a4f]"
                                        : "border-gray-100 bg-white text-gray-600 hover:border-gray-200"
                                        }`}
                                >
                                    {o.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* PIE */}
                    <div className="mb-4">
                        <span className="text-sm font-semibold text-gray-700 block mb-2">Pie Dominante</span>
                        <div className="flex gap-2">
                            {FOOT_OPTIONS.map(o => (
                                <button
                                    key={o.value}
                                    onClick={() => setFoot(o.value)}
                                    className={`flex-1 py-3 px-4 rounded-xl text-sm font-semibold transition-all border-2 ${foot === o.value
                                        ? "border-[#1f7a4f] bg-emerald-50 text-[#1f7a4f]"
                                        : "border-gray-100 bg-white text-gray-600 hover:border-gray-200"
                                        }`}
                                >
                                    {o.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* CANCHA */}
                    <div className="mb-6">
                        <span className="text-sm font-semibold text-gray-700 block mb-2">Cancha Preferida</span>
                        <div className="flex gap-2">
                            {COURT_OPTIONS.map(o => (
                                <button
                                    key={o.value}
                                    onClick={() => setCourt(o.value)}
                                    className={`flex-1 py-3 px-4 rounded-xl text-sm font-semibold transition-all border-2 ${court === o.value
                                        ? "border-[#1f7a4f] bg-emerald-50 text-[#1f7a4f]"
                                        : "border-gray-100 bg-white text-gray-600 hover:border-gray-200"
                                        }`}
                                >
                                    {o.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <button
                        disabled={!canNext()}
                        onClick={() => setStep(2)}
                        className={`w-full py-4 rounded-xl text-white font-bold text-lg transition-all shadow-lg ${!canNext()
                            ? "bg-gray-300 cursor-not-allowed shadow-none"
                            : "bg-[#1f7a4f] hover:bg-[#16603c] hover:shadow-xl hover:-translate-y-0.5"
                            }`}
                    >
                        Continuar
                    </button>
                </div>
            </div>
        );
    }

    // ========================
    // STEP 2: Celular de Contacto
    // ========================
    if (step === 2) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl">
                    {progressBar}
                    <div className="text-center mb-6">
                        <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Paso 2 de 6</p>
                        <h1 className="text-2xl font-bold text-gray-800 mt-1">📱 Celular de Contacto</h1>
                    </div>

                    <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl mb-6">
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
                            />
                        </div>
                        {phone && !canNext() && (
                            <p className="text-xs font-bold text-red-500 mt-1 absolute top-full left-0 w-full">
                                Debe ser un número válido de 10 dígitos (ej:3001234567).
                            </p>
                        )}
                        {canNext() && (
                            <p className="text-xs font-bold text-[#1f7a4f] mt-1 absolute top-full left-0 w-full">
                                ✔ Formato válido
                            </p>
                        )}
                    </label>

                    <div className="flex gap-3">
                        <button
                            onClick={() => setStep(1)}
                            className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
                        >
                            Atrás
                        </button>
                        <button
                            disabled={!canNext()}
                            onClick={() => setStep(3)}
                            className={`flex-[2] py-3 rounded-xl text-white font-bold transition-all shadow-lg ${!canNext()
                                ? "bg-gray-300 cursor-not-allowed shadow-none"
                                : "bg-[#1f7a4f] hover:bg-[#16603c] hover:shadow-xl hover:-translate-y-0.5"
                                }`}
                        >
                            Continuar
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ========================
    // STEP 3: Nivel Técnico
    // ========================
    if (step === 3) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl">
                    {progressBar}
                    <div className="text-center mb-6">
                        <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Paso 3 de 6</p>
                        <h1 className="text-2xl font-bold text-gray-800 mt-1">⚽ Nivel Técnico</h1>
                        <p className="text-gray-500 text-sm mt-1">Selecciona el nivel que mejor te describe</p>
                    </div>

                    <div className="space-y-3">
                        {TECH_OPTIONS.map(o => {
                            const selected = techLevel === o.level;
                            return (
                                <div
                                    key={o.level}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setTechLevel(o.level)}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setTechLevel(o.level); }}
                                    className={`w-full text-left p-4 border-2 rounded-2xl transition-all ${selected
                                        ? "border-[#1f7a4f] bg-emerald-50 shadow-md ring-1 ring-[#1f7a4f]"
                                        : "border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50 cursor-pointer"
                                        }`}
                                >
                                    <span className={`block font-bold text-sm mb-1 ${selected ? "text-[#1f7a4f]" : "text-gray-700"}`}>
                                        {selected ? "✔ " : ""}Nivel {o.level} — {o.title}
                                    </span>
                                    <span className="block text-xs text-gray-500 leading-relaxed">
                                        {o.desc}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex gap-3 mt-6">
                        <button
                            onClick={() => setStep(2)}
                            className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
                        >
                            Atrás
                        </button>
                        <button
                            disabled={!canNext()}
                            onClick={() => setStep(4)}
                            className={`flex-[2] py-3 rounded-xl text-white font-bold transition-all shadow-lg ${!canNext()
                                ? "bg-gray-300 cursor-not-allowed shadow-none"
                                : "bg-[#1f7a4f] hover:bg-[#16603c] hover:shadow-xl hover:-translate-y-0.5"
                                }`}
                        >
                            Continuar
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ========================
    // STEP 4: Condición Física
    // ========================
    if (step === 4) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl">
                    {progressBar}
                    <div className="text-center mb-6">
                        <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Paso 4 de 6</p>
                        <h1 className="text-2xl font-bold text-gray-800 mt-1">🏃 Condición Física</h1>
                        <p className="text-gray-500 text-sm mt-1">¿Cómo describes tu resistencia en los partidos?</p>
                    </div>

                    <div className="space-y-3">
                        {PHYS_OPTIONS.map(o => {
                            const selected = physLevel === o.level;
                            return (
                                <div
                                    key={o.level}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setPhysLevel(o.level)}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setPhysLevel(o.level); }}
                                    className={`w-full text-left p-4 border-2 rounded-2xl transition-all ${selected
                                        ? "border-[#1f7a4f] bg-emerald-50 shadow-md ring-1 ring-[#1f7a4f]"
                                        : "border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50 cursor-pointer"
                                        }`}
                                >
                                    <span className={`block font-bold text-sm mb-1 ${selected ? "text-[#1f7a4f]" : "text-gray-700"}`}>
                                        {selected ? "✔ " : ""}Nivel {o.level} — {o.title}
                                    </span>
                                    <span className="block text-xs text-gray-500 leading-relaxed">
                                        {o.desc}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex gap-3 mt-6">
                        <button
                            onClick={() => setStep(3)}
                            className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
                        >
                            Atrás
                        </button>
                        <button
                            disabled={!canNext()}
                            onClick={() => setStep(5)}
                            className={`flex-[2] py-3 rounded-xl text-white font-bold transition-all shadow-lg ${!canNext()
                                ? "bg-gray-300 cursor-not-allowed shadow-none"
                                : "bg-[#1f7a4f] hover:bg-[#16603c] hover:shadow-xl hover:-translate-y-0.5"
                                }`}
                        >
                            Continuar
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ========================
    // STEP 5: Trayectoria
    // ========================
    if (step === 5) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl">
                    {progressBar}
                    <div className="text-center mb-6">
                        <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Paso 5 de 6</p>
                        <h1 className="text-2xl font-bold text-gray-800 mt-1">🏆 Trayectoria</h1>
                    </div>

                    {/* EXPERIENCIA */}
                    <div className="mb-6">
                        <span className="text-sm font-semibold text-gray-700 block mb-3">Experiencia previa</span>
                        <div className="space-y-3">
                            <div
                                role="button"
                                tabIndex={0}
                                onClick={() => setHasSchool(!hasSchool)}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setHasSchool(!hasSchool); }}
                                className={`w-full text-left p-4 border-2 rounded-2xl transition-all ${hasSchool
                                    ? "border-[#1f7a4f] bg-emerald-50 shadow-md ring-1 ring-[#1f7a4f]"
                                    : "border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50 cursor-pointer"
                                    }`}
                            >
                                <span className={`block font-bold text-sm ${hasSchool ? "text-[#1f7a4f]" : "text-gray-700"}`}>
                                    {hasSchool ? "✔ " : ""}🎓 Escuela de fútbol
                                </span>
                                <span className="block text-xs text-gray-500 mt-1">
                                    Asistí a una escuela o academia de formación
                                </span>
                            </div>

                            <div
                                role="button"
                                tabIndex={0}
                                onClick={() => setHasTournaments(!hasTournaments)}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setHasTournaments(!hasTournaments); }}
                                className={`w-full text-left p-4 border-2 rounded-2xl transition-all ${hasTournaments
                                    ? "border-[#1f7a4f] bg-emerald-50 shadow-md ring-1 ring-[#1f7a4f]"
                                    : "border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50 cursor-pointer"
                                    }`}
                            >
                                <span className={`block font-bold text-sm ${hasTournaments ? "text-[#1f7a4f]" : "text-gray-700"}`}>
                                    {hasTournaments ? "✔ " : ""}🏅 Torneos competitivos
                                </span>
                                <span className="block text-xs text-gray-500 mt-1">
                                    He participado en ligas o torneos organizados
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* FRECUENCIA */}
                    <div className="mb-6">
                        <span className="text-sm font-semibold text-gray-700 block mb-3">¿Qué tan seguido juegas?</span>
                        <div className="space-y-3">
                            {FREQ_OPTIONS.map(o => {
                                const selected = frequency === o.value;
                                return (
                                    <div
                                        key={o.value}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => setFrequency(o.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setFrequency(o.value); }}
                                        className={`w-full text-left p-4 border-2 rounded-2xl transition-all ${selected
                                            ? "border-[#1f7a4f] bg-emerald-50 shadow-md ring-1 ring-[#1f7a4f]"
                                            : "border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50 cursor-pointer"
                                            }`}
                                    >
                                        <span className={`block font-bold text-sm ${selected ? "text-[#1f7a4f]" : "text-gray-700"}`}>
                                            {selected ? "✔ " : ""}{o.label}
                                        </span>
                                        <span className="block text-xs text-gray-500 mt-1">
                                            {o.desc}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex gap-3 mt-6">
                        <button
                            onClick={() => setStep(4)}
                            className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
                        >
                            Atrás
                        </button>
                        <button
                            disabled={!canNext()}
                            onClick={() => setStep(6)}
                            className={`flex-[2] py-3 rounded-xl text-white font-bold transition-all shadow-lg ${!canNext()
                                ? "bg-gray-300 cursor-not-allowed shadow-none"
                                : "bg-[#1f7a4f] hover:bg-[#16603c] hover:shadow-xl hover:-translate-y-0.5"
                                }`}
                        >
                            Continuar
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ========================
    // STEP 6: Posiciones
    // ========================
    if (step === 6) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl">
                    {progressBar}
                    <div className="text-center mb-6">
                        <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Paso 6 de 6</p>
                        <h1 className="text-2xl font-bold text-gray-800 mt-1">🥅 Posiciones</h1>
                        <p className="text-gray-500 text-sm mt-1">Elige hasta 3 posiciones. <br/> <strong className="text-[#1f7a4f]">Toca una posición seleccionada nuevamente</strong> para marcarla como principal (👑).</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        {ALLOWED_POSITIONS.map((pos: Position) => {
                            const selected = positions.includes(pos);
                            const isPrimary = primaryPosition === pos;
                            
                            const handleClick = () => {
                                if (selected) {
                                    if (isPrimary) {
                                        // Si es primaria y le doy click, la deselecciono por completo
                                        const newPositions = positions.filter(p => p !== pos);
                                        setPositions(newPositions);
                                        setPrimaryPosition(newPositions.length > 0 ? newPositions[0] : null);
                                    } else {
                                        // Si ya estaba seleccionada pero NO era primaria, la hago primaria
                                        setPrimaryPosition(pos);
                                    }
                                } else {
                                    const newArr = [...positions];
                                    if (newArr.length >= 3) {
                                        const idxToRemove = newArr.findIndex(p => p !== primaryPosition);
                                        if (idxToRemove !== -1) {
                                            newArr.splice(idxToRemove, 1);
                                        } else {
                                            newArr.shift();
                                        }
                                    }
                                    newArr.push(pos);
                                    setPositions(newArr);
                                    if (newArr.length === 1 || !primaryPosition) {
                                        setPrimaryPosition(pos);
                                    }
                                }
                            };

                            return (
                                <div
                                    key={pos}
                                    role="button"
                                    tabIndex={0}
                                    onClick={handleClick}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            handleClick();
                                        }
                                    }}
                                    className={`relative flex flex-col items-center justify-center p-4 border-2 rounded-2xl transition-all h-32 ${selected
                                        ? isPrimary 
                                            ? "border-[#16603c] bg-[#1f7a4f] shadow-lg ring-2 ring-[#1f7a4f] scale-105"
                                            : "border-emerald-800 bg-emerald-100/40 shadow-sm"
                                        : "border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50 hover:scale-105 cursor-pointer"
                                        }`}
                                >
                                    {isPrimary && (
                                        <div className="absolute -top-2 -right-2 bg-white text-amber-500 rounded-full w-6 h-6 flex items-center justify-center shadow-md border-2 border-amber-300 text-[10px] z-10 animate-in zoom-in-50 duration-300" title="Posición Principal">
                                            👑
                                        </div>
                                    )}
                                    <span className="block text-4xl mb-2">{POSITION_ICONS[pos]}</span>
                                    <span className={`block font-bold text-sm ${selected ? (isPrimary ? "text-white" : "text-emerald-700") : "text-gray-700"}`}>
                                        {selected ? "✔ " : ""}{POSITION_LABELS[pos]}
                                    </span>
                                    {selected && !isPrimary && (
                                        <span className="text-[10px] text-emerald-600 mt-1 opacity-70 font-semibold">Secundaria</span>
                                    )}
                                    {isPrimary && (
                                        <span className="text-[10px] font-bold text-emerald-100 mt-1">Principal</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex gap-3 mt-6">
                        <button
                            onClick={() => setStep(5)}
                            className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
                        >
                            Atrás
                        </button>
                        <button
                            disabled={!canNext()}
                            onClick={() => { setCalcMsgIndex(0); setStep(7); }}
                            className={`flex-[2] py-3 rounded-xl text-white font-bold transition-all shadow-lg ${!canNext()
                                ? "bg-gray-300 cursor-not-allowed shadow-none"
                                : "bg-[#1f7a4f] hover:bg-[#16603c] hover:shadow-xl hover:-translate-y-0.5"
                                }`}
                        >
                            Calcular mi Rating
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ========================
    // STEP 7: CALCULANDO (Animation)
    // ========================
    if (step === 7) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl text-center">
                    {/* Spinner */}
                    <div className="w-16 h-16 border-4 border-gray-100 border-t-[#1f7a4f] rounded-full animate-spin mx-auto mb-6" />

                    <h2 className="text-xl font-bold text-[#1f7a4f] mb-2">
                        Calculando tu Rating
                    </h2>

                    <div className="h-6 relative overflow-hidden">
                        <p
                            key={calcMsgIndex}
                            className="text-gray-500 text-sm animate-[fadeIn_0.4s_ease-out]"
                        >
                            {CALCULATING_MESSAGES[calcMsgIndex]}
                        </p>
                    </div>

                    <style>{`
                        @keyframes fadeIn {
                            from { opacity: 0; transform: translateY(10px); }
                            to { opacity: 1; transform: translateY(0); }
                        }
                    `}</style>
                </div>
            </div>
        );
    }

    // ========================
    // STEP 8: RESULTADO
    // ========================
    if (step === 8 && result) {
        const levelLabels = ["", "Básico", "Intermedio", "Avanzado"];
        const levelEmojis = ["", "🌱", "⚡", "🔥"];

        return (
            <div className="min-h-screen bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl text-center">
                    <div className="text-6xl mb-4 animate-bounce">🎉</div>

                    <h1 className="text-2xl font-extrabold text-[#1f7a4f] mb-2">
                        ¡Tu Draft ha terminado!
                    </h1>

                    <p className="text-gray-500 text-sm mb-8">
                        Basado en tu trayectoria y habilidades
                    </p>

                    {/* LEVEL CARD */}
                    <div className="bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] rounded-3xl p-8 text-white mb-8 shadow-xl transform hover:scale-105 transition-transform duration-300">
                        <div className="text-sm font-semibold opacity-80 uppercase tracking-widest mb-2">
                            Tu Nivel
                        </div>
                        <div className="text-6xl font-black leading-none mb-3">
                            {levelEmojis[result.level]}
                        </div>
                        <div className="text-2xl font-bold">
                            Nivel {result.level} — {levelLabels[result.level]}
                        </div>
                    </div>

                    <button
                        onClick={() => window.location.href = "/"}
                        className="w-full py-4 bg-[#1f7a4f] text-white rounded-2xl font-bold text-lg hover:bg-[#16603c] transition-all shadow-lg hover:shadow-xl hover:-translate-y-1"
                    >
                        Ir a mis partidos →
                    </button>
                </div>
            </div>
        );
    }

    return null;
}
