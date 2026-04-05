"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { submitApplication, getMyApplication } from "@/lib/teamAdminApplications";
import { canApply } from "@/lib/domain/teamAdminApplication";
import type {
    GroupSize,
    OrganizingFrequency,
    OrganizerExperience,
    VenueAgreement,
    FeedbackWillingness,
    TeamAdminApplication,
} from "@/lib/domain/teamAdminApplication";
import { isAdmin } from "@/lib/domain/user";
import { handleError } from "@/lib/utils/error";
import { ChevronLeft, ChevronRight, CheckCircle, Users, Wrench, Star } from "lucide-react";
import AuthGuard from "@/components/AuthGuard";
import {
    logApplyPageViewed,
    logApplyStepCompleted,
    logApplyBackClicked,
    logApplySubmitted,
    logApplySuccess,
    logApplyError
} from "@/lib/analytics";

// ========================
// OPCIONES / COPY
// ========================

const GROUP_SIZE_OPTIONS: { value: GroupSize; label: string }[] = [
    { value: "5-10", label: "5 a 10 personas" },
    { value: "11-20", label: "11 a 20 personas" },
    { value: "21-40", label: "21 a 40 personas" },
    { value: "40+", label: "Más de 40 personas" },
];

const FREQUENCY_OPTIONS: { value: OrganizingFrequency; label: string; desc: string }[] = [
    { value: "weekly", label: "1 vez por semana", desc: "Partido semanal fijo" },
    { value: "2-3x-week", label: "2 a 3 veces por semana", desc: "Grupo muy activo" },
    { value: "monthly", label: "1 a 3 veces al mes", desc: "Partido casual" },
];

const EXPERIENCE_OPTIONS: { value: OrganizerExperience; label: string }[] = [
    { value: "<3m", label: "Menos de 3 meses" },
    { value: "3-12m", label: "3 a 12 meses" },
    { value: "1-3y", label: "1 a 3 años" },
    { value: "3y+", label: "Más de 3 años" },
];

const VENUE_AGREEMENT_OPTIONS: { value: VenueAgreement; label: string }[] = [
    { value: "yes", label: "Sí, tengo horario y precio fijo" },
    { value: "in-progress", label: "Lo estoy gestionando" },
    { value: "no", label: "No todavía" },
];

const COMMUNICATION_OPTIONS = [
    "WhatsApp",
    "Instagram",
    "Voz a voz",
    "Otra app",
];

const USE_CASES = [
    "Organizar convocatorias",
    "Llevar lista de asistencia",
    "Armar equipos equilibrados",
    "Compartir el partido con jugadores nuevos",
];

const FEEDBACK_OPTIONS: { value: FeedbackWillingness; label: string; desc: string }[] = [
    { value: "yes-call", label: "Sí, con gusto", desc: "Nada formal, con un mensaje en whatsapp basta" },
    { value: "no", label: "Por ahora no", desc: "Solo quiero probarla" },
];

// ========================
// COMPONENT
// ========================

export default function ApplyPage() {
    const { user, profile, loading: authLoading } = useAuth();
    const router = useRouter();

    // 0 = pitch, 1 = paso 1, 2 = paso 2, 3 = paso 3, 4 = confirmación
    const [step, setStep] = useState(0);
    const [existingApp, setExistingApp] = useState<TeamAdminApplication | null | undefined>(undefined);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    // Paso 1
    const [groupSize, setGroupSize] = useState<GroupSize | "">("");
    const [frequency, setFrequency] = useState<OrganizingFrequency | "">("");
    const [experience, setExperience] = useState<OrganizerExperience | "">("");
    const [venueName, setVenueName] = useState("");
    const [venueCity, setVenueCity] = useState("");
    const [hasVenueAgreement, setHasVenueAgreement] = useState<VenueAgreement | "">("");

    // Paso 2
    const [communicationChannel, setCommunicationChannel] = useState("");
    const [communicationOther, setCommunicationOther] = useState("");
    const [toolsFeedback, setToolsFeedback] = useState("");
    const [problemToSolve, setProblemToSolve] = useState("");

    // Paso 3
    const [useCases, setUseCases] = useState<string[]>([]);
    const [useCaseOther, setUseCaseOther] = useState("");
    const [socialLink, setSocialLink] = useState("");
    const [feedbackWillingness, setFeedbackWillingness] = useState<FeedbackWillingness | "">("");
    const [groupDescription, setGroupDescription] = useState("");
    const [termsAccepted, setTermsAccepted] = useState(false);

    useEffect(() => {
        if (authLoading || !user || !profile) return;

        // Redirigir si ya es admin
        if (isAdmin(profile)) {
            router.replace("/profile");
            return;
        }

        // Cargar solicitud existente
        getMyApplication(user.uid)
            .then((app) => setExistingApp(app))
            .catch(() => setExistingApp(null))
            .finally(() => {
                setLoading(false);
                logApplyPageViewed();
            });
    }, [authLoading, user, profile, router]);

    // Scroll to top on step change and initial mount
    useEffect(() => {
        window.scrollTo(0, 0);
    }, [step]);

    if (authLoading || loading || existingApp === undefined) {
        return (
            <AuthGuard>
                <div className="min-h-screen flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
                </div>
            </AuthGuard>
        );
    }

    // Validar si puede aplicar
    const validation = profile ? canApply(profile, existingApp) : { ok: false as const, reason: "Cargando..." };

    if (!validation.ok) {
        return (
            <AuthGuard>
                <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
                    <div className="max-w-sm w-full text-center space-y-4">
                        <div className="text-4xl">⚠️</div>
                        <h1 className="text-slate-800 text-xl font-bold">No puedes aplicar todavía</h1>
                        <p className="text-slate-400">{validation.reason}</p>
                        <button
                            onClick={() => router.push("/profile")}
                            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold transition-colors"
                        >
                            Ir a mi perfil
                        </button>
                    </div>
                </div>
            </AuthGuard>
        );
    }

    // Validación por paso
    const canNextStep = (): boolean => {
        switch (step) {
            case 1:
                return !!groupSize && !!frequency && !!experience && !!venueName.trim() && !!venueCity.trim() && !!hasVenueAgreement;
            case 2:
                return !!communicationChannel && toolsFeedback.trim().length >= 10 && problemToSolve.trim().length >= 10;
            case 3:
                return useCases.length > 0 && !!feedbackWillingness && termsAccepted;
            default:
                return true;
        }
    };

    function toggleUseCase(uc: string) {
        setUseCases((prev) =>
            prev.includes(uc) ? prev.filter((x) => x !== uc) : [...prev, uc]
        );
    }

    async function handleSubmit() {
        if (!user || !profile) return;
        setSubmitting(true);
        try {
            const channel = communicationChannel === "Otra app" && communicationOther.trim()
                ? `Otra app: ${communicationOther.trim()}`
                : communicationChannel;

            const finalUseCases = useCases.map((uc) =>
                uc === "Otro" && useCaseOther.trim() ? `Otro: ${useCaseOther.trim()}` : uc
            );

            await submitApplication(
                user.uid,
                {
                    groupSize: groupSize as GroupSize,
                    frequency: frequency as OrganizingFrequency,
                    experience: experience as OrganizerExperience,
                    venueName: venueName.trim(),
                    venueCity: venueCity.trim(),
                    hasVenueAgreement: hasVenueAgreement as VenueAgreement,
                    currentCommunicationChannel: channel,
                    toolsFeedback: toolsFeedback.trim(),
                    problemToSolve: problemToSolve.trim(),
                    useCases: finalUseCases,
                    socialLink: socialLink.trim() || undefined,
                    feedbackWillingness: feedbackWillingness as FeedbackWillingness,
                    groupDescription: groupDescription.trim() || undefined,
                    termsAccepted,
                },
                profile
            );
            logApplySubmitted();
            logApplySuccess();
            setStep(4);
        } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            logApplyError(errorMsg);
            handleError(err, "Error al enviar la solicitud");
        } finally {
            setSubmitting(false);
        }
    }

    // ========================
    // RENDER: PITCH (paso 0)
    // ========================
    if (step === 0) {
        return (
            <AuthGuard>
                <div className="min-h-screen bg-slate-50 pb-24 md:pb-0">
                    <div className="max-w-lg mx-auto px-4 pt-8 space-y-8">
                        {/* Header */}
                        <div className="text-center space-y-2">
                            <div className="text-5xl">🎽</div>
                            <h1 className="text-slate-800 text-2xl font-bold">Team Admin</h1>
                            <p className="text-slate-500 text-sm">El rol para quienes organizan partidos</p>
                        </div>

                        {/* Qué es */}
                        <div className="bg-white rounded-2xl p-5 space-y-3 border border-slate-200 shadow-sm">
                            <div className="flex items-center gap-2 text-emerald-600 font-semibold">
                                <Users size={18} />
                                <span>¿Qué es un Team Admin?</span>
                            </div>
                            <ul className="space-y-2 text-slate-600 text-sm">
                                <li className="flex gap-2"><span className="text-emerald-500 mt-0.5">•</span>Eres el organizador: creas el partido, gestionas la lista y armas los equipos</li>
                                <li className="flex gap-2"><span className="text-emerald-500 mt-0.5">•</span>Puedes seguir jugando: el rol de admin no reemplaza al de jugador</li>
                            </ul>
                        </div>

                        {/* Qué resolvemos */}
                        <div className="bg-white rounded-2xl p-5 space-y-3 border border-slate-200 shadow-sm">
                            <div className="flex items-center gap-2 text-emerald-600 font-semibold">
                                <Wrench size={18} />
                                <span>¿Qué te resolvemos?</span>
                            </div>
                            <ul className="space-y-2 text-slate-600 text-sm">
                                <li className="flex gap-2"><span className="text-emerald-500 mt-0.5">•</span>Adiós a los mensajes de WhatsApp para confirmar asistencia</li>
                                <li className="flex gap-2"><span className="text-emerald-500 mt-0.5">•</span>Notificaciones y recordatorios automáticos del partido para tus jugadores</li>
                                <li className="flex gap-2"><span className="text-emerald-500 mt-0.5">•</span>Equipos equilibrados en segundos</li>
                                <li className="flex gap-2"><span className="text-emerald-500 mt-0.5">•</span>Ve el historial de asistencia de cada jugador y detecta quién siempre cumple y quién falla</li>
                                <li className="flex gap-2"><span className="text-emerald-500 mt-0.5">•</span>Posibilidad de sumar jugadores nuevos cuando faltan confirmados</li>
                            </ul>
                        </div>

                        {/* Qué esperamos */}
                        <div className="bg-white rounded-2xl p-5 space-y-3 border border-slate-200 shadow-sm">
                            <div className="flex items-center gap-2 text-emerald-600 font-semibold">
                                <Star size={18} />
                                <span>¿Qué esperamos de ti?</span>
                            </div>
                            <ul className="space-y-2 text-slate-600 text-sm">
                                <li className="flex gap-2"><span className="text-emerald-500 mt-0.5">•</span>Usar la app con tu grupo real (no para testear)</li>
                                <li className="flex gap-2"><span className="text-emerald-500 mt-0.5">•</span>Compartir feedback honesto sobre lo que funciona y lo que no</li>
                                <li className="flex gap-2"><span className="text-emerald-500 mt-0.5">•</span>Reportar cualquier problema que encuentres</li>
                            </ul>
                        </div>

                        {/* CTA */}
                        <button
                            onClick={() => {
                                logApplyStepCompleted(0);
                                setStep(1);
                            }}
                            className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold text-lg transition-colors flex items-center justify-center gap-2"
                        >
                            Quiero aplicar
                            <ChevronRight size={20} />
                        </button>

                        <button
                            onClick={() => {
                                logApplyBackClicked(0);
                                router.back();
                            }}
                            className="w-full py-3 text-slate-400 hover:text-slate-700 transition-colors text-sm"
                        >
                            Volver
                        </button>
                    </div>
                </div>
            </AuthGuard>
        );
    }

    // ========================
    // RENDER: CONFIRMACIÓN (paso 4)
    // ========================
    if (step === 4) {
        return (
            <AuthGuard>
                <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
                    <div className="max-w-sm w-full text-center space-y-6">
                        <CheckCircle size={64} className="mx-auto text-emerald-400" />
                        <div className="space-y-2">
                            <h1 className="text-slate-800 text-2xl font-bold">¡Solicitud enviada!</h1>
                            <p className="text-slate-400">
                                Revisaremos tu solicitud y te avisamos por notificación cuando tengamos una respuesta.
                            </p>
                        </div>
                        <button
                            onClick={() => router.push("/profile")}
                            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold transition-colors"
                        >
                            Ir a mi perfil
                        </button>
                    </div>
                </div>
            </AuthGuard>
        );
    }

    // ========================
    // RENDER: FORMULARIO (pasos 1-3)
    // ========================
    return (
        <AuthGuard>
            <div className="min-h-screen bg-slate-50 pb-24 md:pb-0">
                <div className="max-w-lg mx-auto px-4 pt-6 space-y-6">

                    {/* Header + progreso */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => {
                                    logApplyBackClicked(step);
                                    setStep(step - 1);
                                }}
                                className="text-slate-400 hover:text-slate-700 transition-colors"
                            >
                                <ChevronLeft size={24} />
                            </button>
                            <span className="text-slate-500 text-sm">Paso {step} de 3</span>
                        </div>
                        <div className="flex gap-1.5">
                            {[1, 2, 3].map((s) => (
                                <div
                                    key={s}
                                    className={`h-1 flex-1 rounded-full transition-colors ${s <= step ? "bg-emerald-500" : "bg-slate-200"}`}
                                />
                            ))}
                        </div>
                    </div>

                    {/* ===== PASO 1 — Tu grupo ===== */}
                    {step === 1 && (
                        <div className="space-y-6">
                            <h2 className="text-slate-800 text-xl font-bold flex items-center gap-2">
                                <Users size={20} className="text-emerald-400" />
                                Tu grupo
                            </h2>

                            {/* Tamaño del grupo */}
                            <div className="space-y-2">
                                <label className="text-slate-700 text-sm font-medium">
                                    ¿Cuántas personas integran tu grupo de fútbol?
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    {GROUP_SIZE_OPTIONS.map((opt) => (
                                        <button
                                            key={opt.value}
                                            onClick={() => setGroupSize(opt.value)}
                                            className={`py-3 px-4 rounded-xl text-sm font-medium border transition-colors ${groupSize === opt.value
                                                ? "bg-emerald-600 border-emerald-500 text-white"
                                                : "bg-white border-slate-200 text-slate-700 hover:border-slate-400"}`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Frecuencia */}
                            <div className="space-y-2">
                                <label className="text-slate-700 text-sm font-medium">
                                    ¿Con qué frecuencia organizas partidos?
                                </label>
                                <div className="space-y-2">
                                    {FREQUENCY_OPTIONS.map((opt) => (
                                        <button
                                            key={opt.value}
                                            onClick={() => setFrequency(opt.value)}
                                            className={`w-full py-3 px-4 rounded-xl text-sm text-left border transition-colors ${frequency === opt.value
                                                ? "bg-emerald-600 border-emerald-500 text-white"
                                                : "bg-white border-slate-200 text-slate-700 hover:border-slate-400"}`}
                                        >
                                            <span className="font-medium">{opt.label}</span>
                                            {opt.desc && <span className="text-xs ml-2 opacity-70">— {opt.desc}</span>}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Experiencia */}
                            <div className="space-y-2">
                                <label className="text-slate-700 text-sm font-medium">
                                    ¿Hace cuánto tiempo organizas estos partidos?
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    {EXPERIENCE_OPTIONS.map((opt) => (
                                        <button
                                            key={opt.value}
                                            onClick={() => setExperience(opt.value)}
                                            className={`py-3 px-4 rounded-xl text-sm font-medium border transition-colors ${experience === opt.value
                                                ? "bg-emerald-600 border-emerald-500 text-white"
                                                : "bg-white border-slate-200 text-slate-700 hover:border-slate-400"}`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Cancha */}
                            <div className="space-y-2">
                                <label className="text-slate-700 text-sm font-medium">
                                    ¿En qué cancha/s juegas habitualmente?
                                </label>
                                <input
                                    type="text"
                                    value={venueName}
                                    onChange={(e) => setVenueName(e.target.value)}
                                    placeholder="Ej: Complejo Los Pinos, Cancha San Martín"
                                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 text-base focus:outline-none focus:border-emerald-500"
                                />
                                <input
                                    type="text"
                                    value={venueCity}
                                    onChange={(e) => setVenueCity(e.target.value)}
                                    placeholder="Ciudad"
                                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 text-base focus:outline-none focus:border-emerald-500"
                                />
                            </div>

                            {/* Acuerdo con la cancha */}
                            <div className="space-y-2">
                                <label className="text-slate-700 text-sm font-medium">
                                    ¿Tienes un acuerdo con la cancha (horario fijo, precio pactado)?
                                </label>
                                <div className="space-y-2">
                                    {VENUE_AGREEMENT_OPTIONS.map((opt) => (
                                        <button
                                            key={opt.value}
                                            onClick={() => setHasVenueAgreement(opt.value)}
                                            className={`w-full py-3 px-4 rounded-xl text-sm text-left border transition-colors ${hasVenueAgreement === opt.value
                                                ? "bg-emerald-600 border-emerald-500 text-white"
                                                : "bg-white border-slate-200 text-slate-700 hover:border-slate-400"}`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ===== PASO 2 — Herramientas y motivación ===== */}
                    {step === 2 && (
                        <div className="space-y-6">
                            <h2 className="text-slate-800 text-xl font-bold flex items-center gap-2">
                                <Wrench size={20} className="text-emerald-400" />
                                Herramientas y motivación
                            </h2>

                            {/* Canal de comunicación */}
                            <div className="space-y-2">
                                <label className="text-slate-700 text-sm font-medium">
                                    ¿Cómo comunicas hoy los partidos a tu grupo?
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    {COMMUNICATION_OPTIONS.map((opt) => (
                                        <button
                                            key={opt}
                                            onClick={() => setCommunicationChannel(opt)}
                                            className={`py-3 px-4 rounded-xl text-sm font-medium border transition-colors ${communicationChannel === opt
                                                ? "bg-emerald-600 border-emerald-500 text-white"
                                                : "bg-white border-slate-200 text-slate-700 hover:border-slate-400"}`}
                                        >
                                            {opt}
                                        </button>
                                    ))}
                                </div>
                                {communicationChannel === "Otra app" && (
                                    <input
                                        type="text"
                                        value={communicationOther}
                                        onChange={(e) => setCommunicationOther(e.target.value)}
                                        placeholder="¿Cuál app?"
                                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 text-base focus:outline-none focus:border-emerald-500"
                                    />
                                )}
                            </div>

                            {/* Herramientas previas */}
                            <div className="space-y-2">
                                <label className="text-slate-700 text-sm font-medium">
                                    ¿Has utilizado otras herramientas similares? ¿Qué es lo que más te gusta y lo que más te disgusta de ellas?
                                </label>
                                <textarea
                                    value={toolsFeedback}
                                    onChange={(e) => setToolsFeedback(e.target.value)}
                                    placeholder="Ej: Usaba otra app pero era muy complicada para confirmar quiénes asistían..."
                                    rows={3}
                                    className={`w-full bg-white border rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 text-base focus:outline-none resize-none transition-colors ${toolsFeedback.length > 0 && toolsFeedback.length < 10 ? "border-amber-400 focus:border-amber-400" : "border-slate-200 focus:border-emerald-500"}`}
                                />
                                <p className={`text-xs text-right ${toolsFeedback.length >= 10 ? "text-slate-400" : "text-amber-500"}`}>
                                    {toolsFeedback.length < 10 ? `Mínimo ${10 - toolsFeedback.length} caracteres más` : `${toolsFeedback.length} caracteres`}
                                </p>
                            </div>

                            {/* Problema a resolver */}
                            <div className="space-y-2">
                                <label className="text-slate-700 text-sm font-medium">
                                    ¿Qué problema tienes hoy al organizar partidos que esperas resolver con La Canchita?
                                </label>
                                <textarea
                                    value={problemToSolve}
                                    onChange={(e) => setProblemToSolve(e.target.value)}
                                    placeholder="Ej: Me consume mucho tiempo confirmar quiénes van y armar los equipos..."
                                    rows={3}
                                    className={`w-full bg-white border rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 text-base focus:outline-none resize-none transition-colors ${problemToSolve.length > 0 && problemToSolve.length < 10 ? "border-amber-400 focus:border-amber-400" : "border-slate-200 focus:border-emerald-500"}`}
                                />
                                <p className={`text-xs text-right ${problemToSolve.length >= 10 ? "text-slate-400" : "text-amber-500"}`}>
                                    {problemToSolve.length < 10 ? `Mínimo ${10 - problemToSolve.length} caracteres más` : `${problemToSolve.length} caracteres`}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* ===== PASO 3 — Uso y compromiso ===== */}
                    {step === 3 && (
                        <div className="space-y-6">
                            <h2 className="text-slate-800 text-xl font-bold flex items-center gap-2">
                                <Star size={20} className="text-emerald-400" />
                                Uso y compromiso
                            </h2>

                            {/* Casos de uso */}
                            <div className="space-y-2">
                                <label className="text-slate-700 text-sm font-medium">
                                    ¿Para qué quieres usar La Canchita como admin? (puedes elegir varios)
                                </label>
                                <div className="space-y-2">
                                    {USE_CASES.map((uc) => (
                                        <button
                                            key={uc}
                                            onClick={() => toggleUseCase(uc)}
                                            className={`w-full py-3 px-4 rounded-xl text-sm text-left border transition-colors flex items-center gap-3 ${useCases.includes(uc)
                                                ? "bg-emerald-600 border-emerald-500 text-white"
                                                : "bg-white border-slate-200 text-slate-700 hover:border-slate-400"}`}
                                        >
                                            <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${useCases.includes(uc) ? "bg-white border-white" : "border-slate-300"}`}>
                                                {useCases.includes(uc) && <span className="text-emerald-600 text-xs font-bold">✓</span>}
                                            </div>
                                            {uc}
                                        </button>
                                    ))}
                                    {/* Otro */}
                                    <button
                                        onClick={() => toggleUseCase("Otro")}
                                        className={`w-full py-3 px-4 rounded-xl text-sm text-left border transition-colors flex items-center gap-3 ${useCases.includes("Otro")
                                            ? "bg-emerald-600 border-emerald-500 text-white"
                                            : "bg-white border-slate-200 text-slate-700 hover:border-slate-400"}`}
                                    >
                                        <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${useCases.includes("Otro") ? "bg-white border-white" : "border-slate-300"}`}>
                                            {useCases.includes("Otro") && <span className="text-emerald-600 text-xs font-bold">✓</span>}
                                        </div>
                                        Otro
                                    </button>
                                    {useCases.includes("Otro") && (
                                        <input
                                            type="text"
                                            value={useCaseOther}
                                            onChange={(e) => setUseCaseOther(e.target.value)}
                                            placeholder="¿Para qué lo usarías?"
                                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 text-base focus:outline-none focus:border-emerald-500"
                                        />
                                    )}
                                </div>
                            </div>

                            {/* Red social (opcional) */}
                            <div className="space-y-2">
                                <label className="text-slate-700 text-sm font-medium">
                                    Red social del grupo{" "}
                                    <span className="text-slate-400 font-normal">(opcional)</span>
                                </label>
                                <input
                                    type="text"
                                    value={socialLink}
                                    onChange={(e) => setSocialLink(e.target.value)}
                                    placeholder="@instagram, link de grupo de WhatsApp, etc."
                                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 text-base focus:outline-none focus:border-emerald-500"
                                />
                            </div>

                            {/* Golden question */}
                            <div className="space-y-2">
                                <label className="text-slate-700 text-sm font-medium">
                                    ¿Estarías dispuesto a darnos feedback de lo que te gusta y no te gusta con el fin de mejorar la app?
                                </label>
                                <div className="space-y-2">
                                    {FEEDBACK_OPTIONS.map((opt) => (
                                        <button
                                            key={opt.value}
                                            onClick={() => setFeedbackWillingness(opt.value)}
                                            className={`w-full py-3 px-4 rounded-xl text-sm text-left border transition-colors ${feedbackWillingness === opt.value
                                                ? "bg-emerald-600 border-emerald-500 text-white"
                                                : "bg-white border-slate-200 text-slate-700 hover:border-slate-400"}`}
                                        >
                                            <span className="font-medium">{opt.label}</span>
                                            {opt.desc && <span className="text-xs ml-2 opacity-70">— {opt.desc}</span>}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Descripción del grupo (opcional) */}
                            <div className="space-y-2">
                                <label className="text-slate-700 text-sm font-medium">
                                    Cuéntanos algo sobre tu equipo{" "}
                                    <span className="text-slate-400 font-normal">(opcional)</span>
                                </label>
                                <textarea
                                    value={groupDescription}
                                    onChange={(e) => {
                                        if (e.target.value.length <= 280) setGroupDescription(e.target.value);
                                    }}
                                    placeholder="¿Cómo surgió el grupo, qué los une, algún dato curioso...?"
                                    rows={3}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 text-base focus:outline-none focus:border-emerald-500 resize-none"
                                />
                                <p className="text-slate-400 text-xs text-right">{groupDescription.length}/280</p>
                            </div>

                            {/* Términos */}
                            <button
                                onClick={() => setTermsAccepted(!termsAccepted)}
                                className={`w-full py-4 px-4 rounded-xl text-sm text-left border transition-colors flex items-start gap-3 ${termsAccepted
                                    ? "bg-emerald-50 border-emerald-400"
                                    : "bg-white border-slate-200 hover:border-slate-300"}`}
                            >
                                <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 ${termsAccepted ? "bg-emerald-500 border-emerald-500" : "border-slate-300"}`}>
                                    {termsAccepted && <span className="text-white text-xs font-bold">✓</span>}
                                </div>
                                <span className="text-slate-600">
                                    Entiendo que soy responsable de la información de mi grupo y que La Canchita puede revocar el acceso si se hace mal uso.
                                </span>
                            </button>
                        </div>
                    )}

                    {/* Botón de navegación */}
                    <div className="pb-8">
                        {step < 3 ? (
                            <button
                                onClick={() => {
                                    logApplyStepCompleted(step);
                                    setStep(step + 1);
                                }}
                                disabled={!canNextStep()}
                                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-2xl font-bold text-lg transition-colors flex items-center justify-center gap-2"
                            >
                                Continuar
                                <ChevronRight size={20} />
                            </button>
                        ) : (
                            <button
                                onClick={handleSubmit}
                                disabled={!canNextStep() || submitting}
                                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-2xl font-bold text-lg transition-colors"
                            >
                                {submitting ? "Enviando..." : "Enviar solicitud"}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </AuthGuard>
    );
}
