"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useRouter } from "next/navigation";
import { saveOnboardingResult } from "@/lib/users";
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
    const { user } = useAuth();
    const router = useRouter();

    // Step state
    const [step, setStep] = useState(1);
    const TOTAL_STEPS = 7;

    // Form data
    const [age, setAge] = useState("");
    const [sex, setSex] = useState<Sex | "">("");
    const [foot, setFoot] = useState<Foot | "">("");
    const [court, setCourt] = useState<CourtSize | "">("");
    const [techLevel, setTechLevel] = useState<TechLevel | 0>(0);
    const [physLevel, setPhysLevel] = useState<PhysLevel | 0>(0);
    const [hasSchool, setHasSchool] = useState(false);
    const [hasTournaments, setHasTournaments] = useState(false);
    const [frequency, setFrequency] = useState<Frequency | "">("");
    const [positions, setPositions] = useState<Position[]>([]);

    // Calculating + result
    const [calcMsgIndex, setCalcMsgIndex] = useState(0);
    const [result, setResult] = useState<RatingResult | null>(null);

    // Step validation
    const canNext = (): boolean => {
        switch (step) {
            case 1:
                return !!age && Number(age) >= 10 && Number(age) <= 70 && !!sex && !!foot && !!court;
            case 2:
                return techLevel > 0;
            case 3:
                return physLevel > 0;
            case 4:
                return !!frequency;
            case 5:
                return positions.length >= 1 && positions.length <= 2;
            default:
                return false;
        }
    };

    // Calculating animation + Firebase save
    useEffect(() => {
        if (step !== 6) return;

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
            try {
                await saveOnboardingResult(user!.uid, {
                    rating: ratingResult.rating,
                    level: ratingResult.level,
                    age: Number(age),
                    sex: sex as string,
                    dominantFoot: foot as string,
                    preferredCourt: court as string,
                    positions,
                    techLevel: techLevel as number,
                    physLevel: physLevel as number,
                    hasSchool,
                    hasTournaments,
                    frequency: frequency as string,
                });
            } catch (err) {
                console.error("Error saving onboarding:", err);
            }

            // Wait minimum 3s total for animation
            setTimeout(() => {
                clearInterval(interval);
                setResult(ratingResult);
                setStep(7);
            }, 3000);
        })();

        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step]);

    if (!user) return null;

    // ========================
    // SHARED STYLES
    // ========================

    const pageStyle: React.CSSProperties = {
        minHeight: "100vh",
        background: "linear-gradient(135deg, #1f7a4f 0%, #145c3a 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
    };

    const cardStyle: React.CSSProperties = {
        background: "#fff",
        borderRadius: 24,
        padding: "32px 24px",
        maxWidth: 480,
        width: "100%",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
    };

    const headerStyle: React.CSSProperties = {
        textAlign: "center" as const,
        marginBottom: 24,
    };

    const primaryBtn = (disabled: boolean): React.CSSProperties => ({
        width: "100%",
        padding: "14px",
        background: disabled ? "#9ca3af" : "#1f7a4f",
        color: "#fff",
        borderRadius: 12,
        border: "none",
        fontSize: 16,
        fontWeight: 700,
        cursor: disabled ? "default" : "pointer",
        transition: "all 0.2s",
        marginTop: 16,
    });

    const progressBar = (
        <div style={{ height: 4, background: "#e5e7eb", borderRadius: 2, marginBottom: 24 }}>
            <div
                style={{
                    height: 4,
                    background: "#1f7a4f",
                    borderRadius: 2,
                    width: `${(Math.min(step, 5) / 5) * 100}%`,
                    transition: "width 0.4s ease",
                }}
            />
        </div>
    );

    // ========================
    // STEP 1: Datos personales
    // ========================
    if (step === 1) {
        return (
            <div style={pageStyle}>
                <div style={cardStyle}>
                    {progressBar}
                    <div style={headerStyle}>
                        <p style={{ fontSize: 13, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Paso 1 de 5</p>
                        <h1 style={{ fontSize: 22, marginTop: 4 }}>📋 Datos Personales</h1>
                    </div>

                    {/* EDAD */}
                    <label style={{ display: "block", marginBottom: 16 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Edad</span>
                        <input
                            type="number"
                            value={age}
                            onChange={e => setAge(e.target.value)}
                            placeholder="Ej: 25"
                            min={10}
                            max={70}
                            style={{ width: "100%", padding: "10px 14px", border: "1px solid #ddd", borderRadius: 10, fontSize: 15, outline: "none", boxSizing: "border-box" }}
                        />
                    </label>

                    {/* SEXO */}
                    <div style={{ marginBottom: 16 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Sexo</span>
                        <div style={{ display: "flex", gap: 8 }}>
                            {SEX_OPTIONS.map(o => (
                                <button
                                    key={o.value}
                                    onClick={() => setSex(o.value)}
                                    style={{
                                        flex: 1,
                                        padding: "10px",
                                        border: sex === o.value ? "2px solid #1f7a4f" : "1px solid #ddd",
                                        borderRadius: 10,
                                        background: sex === o.value ? "#e6f6ed" : "#fff",
                                        fontWeight: 600,
                                        fontSize: 13,
                                        cursor: "pointer",
                                        color: sex === o.value ? "#1f7a4f" : "#374151",
                                        transition: "all 0.2s",
                                    }}
                                >
                                    {o.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* PIE */}
                    <div style={{ marginBottom: 16 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Pie Dominante</span>
                        <div style={{ display: "flex", gap: 8 }}>
                            {FOOT_OPTIONS.map(o => (
                                <button
                                    key={o.value}
                                    onClick={() => setFoot(o.value)}
                                    style={{
                                        flex: 1,
                                        padding: "10px",
                                        border: foot === o.value ? "2px solid #1f7a4f" : "1px solid #ddd",
                                        borderRadius: 10,
                                        background: foot === o.value ? "#e6f6ed" : "#fff",
                                        fontWeight: 600,
                                        fontSize: 13,
                                        cursor: "pointer",
                                        color: foot === o.value ? "#1f7a4f" : "#374151",
                                        transition: "all 0.2s",
                                    }}
                                >
                                    {o.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* CANCHA */}
                    <div style={{ marginBottom: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Cancha Preferida</span>
                        <div style={{ display: "flex", gap: 8 }}>
                            {COURT_OPTIONS.map(o => (
                                <button
                                    key={o.value}
                                    onClick={() => setCourt(o.value)}
                                    style={{
                                        flex: 1,
                                        padding: "10px",
                                        border: court === o.value ? "2px solid #1f7a4f" : "1px solid #ddd",
                                        borderRadius: 10,
                                        background: court === o.value ? "#e6f6ed" : "#fff",
                                        fontWeight: 600,
                                        fontSize: 13,
                                        cursor: "pointer",
                                        color: court === o.value ? "#1f7a4f" : "#374151",
                                        transition: "all 0.2s",
                                    }}
                                >
                                    {o.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <button disabled={!canNext()} onClick={() => setStep(2)} style={primaryBtn(!canNext())}>
                        Continuar
                    </button>
                </div>
            </div>
        );
    }

    // ========================
    // STEP 2: Nivel Técnico
    // ========================
    if (step === 2) {
        return (
            <div style={pageStyle}>
                <div style={cardStyle}>
                    {progressBar}
                    <div style={headerStyle}>
                        <p style={{ fontSize: 13, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Paso 2 de 5</p>
                        <h1 style={{ fontSize: 22, marginTop: 4 }}>⚽ Nivel Técnico</h1>
                        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>Selecciona el nivel que mejor te describe</p>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {TECH_OPTIONS.map(o => {
                            const selected = techLevel === o.level;
                            return (
                                <button
                                    key={o.level}
                                    onClick={() => setTechLevel(o.level)}
                                    style={{
                                        textAlign: "left",
                                        padding: "14px 16px",
                                        border: selected ? "2px solid #1f7a4f" : "1px solid #e5e7eb",
                                        borderRadius: 14,
                                        background: selected ? "#e6f6ed" : "#fff",
                                        cursor: "pointer",
                                        transition: "all 0.2s",
                                    }}
                                >
                                    <div style={{ fontWeight: 700, fontSize: 14, color: selected ? "#1f7a4f" : "#374151", marginBottom: 4 }}>
                                        {selected ? "✔ " : ""}Nivel {o.level} — {o.title}
                                    </div>
                                    <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.4 }}>
                                        {o.desc}
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                        <button onClick={() => setStep(1)} style={{ flex: 1, padding: "14px", background: "#f1f5f9", color: "#334155", borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
                            Atrás
                        </button>
                        <button disabled={!canNext()} onClick={() => setStep(3)} style={{ ...primaryBtn(!canNext()), flex: 2, marginTop: 0 }}>
                            Continuar
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ========================
    // STEP 3: Condición Física
    // ========================
    if (step === 3) {
        return (
            <div style={pageStyle}>
                <div style={cardStyle}>
                    {progressBar}
                    <div style={headerStyle}>
                        <p style={{ fontSize: 13, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Paso 3 de 5</p>
                        <h1 style={{ fontSize: 22, marginTop: 4 }}>🏃 Condición Física</h1>
                        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>¿Cómo describes tu resistencia en los partidos?</p>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {PHYS_OPTIONS.map(o => {
                            const selected = physLevel === o.level;
                            return (
                                <button
                                    key={o.level}
                                    onClick={() => setPhysLevel(o.level)}
                                    style={{
                                        textAlign: "left",
                                        padding: "14px 16px",
                                        border: selected ? "2px solid #1f7a4f" : "1px solid #e5e7eb",
                                        borderRadius: 14,
                                        background: selected ? "#e6f6ed" : "#fff",
                                        cursor: "pointer",
                                        transition: "all 0.2s",
                                    }}
                                >
                                    <div style={{ fontWeight: 700, fontSize: 14, color: selected ? "#1f7a4f" : "#374151", marginBottom: 4 }}>
                                        {selected ? "✔ " : ""}Nivel {o.level} — {o.title}
                                    </div>
                                    <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.4 }}>
                                        {o.desc}
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                        <button onClick={() => setStep(2)} style={{ flex: 1, padding: "14px", background: "#f1f5f9", color: "#334155", borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
                            Atrás
                        </button>
                        <button disabled={!canNext()} onClick={() => setStep(4)} style={{ ...primaryBtn(!canNext()), flex: 2, marginTop: 0 }}>
                            Continuar
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ========================
    // STEP 4: Trayectoria
    // ========================
    if (step === 4) {
        return (
            <div style={pageStyle}>
                <div style={cardStyle}>
                    {progressBar}
                    <div style={headerStyle}>
                        <p style={{ fontSize: 13, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Paso 4 de 5</p>
                        <h1 style={{ fontSize: 22, marginTop: 4 }}>🏆 Trayectoria</h1>
                    </div>

                    {/* EXPERIENCIA */}
                    <div style={{ marginBottom: 20 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 10 }}>Experiencia previa</span>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <button
                                onClick={() => setHasSchool(!hasSchool)}
                                style={{
                                    textAlign: "left",
                                    padding: "14px 16px",
                                    border: hasSchool ? "2px solid #1f7a4f" : "1px solid #e5e7eb",
                                    borderRadius: 14,
                                    background: hasSchool ? "#e6f6ed" : "#fff",
                                    cursor: "pointer",
                                    transition: "all 0.2s",
                                }}
                            >
                                <div style={{ fontWeight: 700, fontSize: 14, color: hasSchool ? "#1f7a4f" : "#374151" }}>
                                    {hasSchool ? "✔ " : ""}🎓 Escuela de fútbol
                                </div>
                                <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
                                    Asistí a una escuela o academia de formación
                                </div>
                            </button>

                            <button
                                onClick={() => setHasTournaments(!hasTournaments)}
                                style={{
                                    textAlign: "left",
                                    padding: "14px 16px",
                                    border: hasTournaments ? "2px solid #1f7a4f" : "1px solid #e5e7eb",
                                    borderRadius: 14,
                                    background: hasTournaments ? "#e6f6ed" : "#fff",
                                    cursor: "pointer",
                                    transition: "all 0.2s",
                                }}
                            >
                                <div style={{ fontWeight: 700, fontSize: 14, color: hasTournaments ? "#1f7a4f" : "#374151" }}>
                                    {hasTournaments ? "✔ " : ""}🏅 Torneos competitivos
                                </div>
                                <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
                                    He participado en ligas o torneos organizados
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* FRECUENCIA */}
                    <div style={{ marginBottom: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 10 }}>¿Qué tan seguido juegas?</span>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {FREQ_OPTIONS.map(o => {
                                const selected = frequency === o.value;
                                return (
                                    <button
                                        key={o.value}
                                        onClick={() => setFrequency(o.value)}
                                        style={{
                                            textAlign: "left",
                                            padding: "14px 16px",
                                            border: selected ? "2px solid #1f7a4f" : "1px solid #e5e7eb",
                                            borderRadius: 14,
                                            background: selected ? "#e6f6ed" : "#fff",
                                            cursor: "pointer",
                                            transition: "all 0.2s",
                                        }}
                                    >
                                        <div style={{ fontWeight: 700, fontSize: 14, color: selected ? "#1f7a4f" : "#374151" }}>
                                            {selected ? "✔ " : ""}{o.label}
                                        </div>
                                        <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
                                            {o.desc}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                        <button onClick={() => setStep(3)} style={{ flex: 1, padding: "14px", background: "#f1f5f9", color: "#334155", borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
                            Atrás
                        </button>
                        <button disabled={!canNext()} onClick={() => setStep(5)} style={{ ...primaryBtn(!canNext()), flex: 2, marginTop: 0 }}>
                            Continuar
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ========================
    // STEP 5: Posiciones
    // ========================
    if (step === 5) {
        return (
            <div style={pageStyle}>
                <div style={cardStyle}>
                    {progressBar}
                    <div style={headerStyle}>
                        <p style={{ fontSize: 13, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Paso 5 de 5</p>
                        <h1 style={{ fontSize: 22, marginTop: 4 }}>🥅 Posiciones</h1>
                        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>¿En qué posiciones te sientes más cómodo? (Máx. 2)</p>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        {ALLOWED_POSITIONS.map((pos: Position) => {
                            const selected = positions.includes(pos);
                            return (
                                <button
                                    key={pos}
                                    onClick={() => {
                                        if (selected) {
                                            setPositions(positions.filter(p => p !== pos));
                                        } else if (positions.length < 2) {
                                            setPositions([...positions, pos]);
                                        } else {
                                            setPositions([positions[1], pos]);
                                        }
                                    }}
                                    style={{
                                        padding: "16px 12px",
                                        border: selected ? "2px solid #1f7a4f" : "1px solid #e5e7eb",
                                        borderRadius: 14,
                                        background: selected ? "#e6f6ed" : "#fff",
                                        cursor: "pointer",
                                        transition: "all 0.2s",
                                        textAlign: "center",
                                    }}
                                >
                                    <div style={{ fontSize: 28, marginBottom: 6 }}>{POSITION_ICONS[pos]}</div>
                                    <div style={{ fontWeight: 700, fontSize: 14, color: selected ? "#1f7a4f" : "#374151" }}>
                                        {selected ? "✔ " : ""}{POSITION_LABELS[pos]}
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                        <button onClick={() => setStep(4)} style={{ flex: 1, padding: "14px", background: "#f1f5f9", color: "#334155", borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
                            Atrás
                        </button>
                        <button disabled={!canNext()} onClick={() => { setCalcMsgIndex(0); setStep(6); }} style={{ ...primaryBtn(!canNext()), flex: 2, marginTop: 0 }}>
                            Calcular mi Rating
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ========================
    // STEP 6: CALCULANDO (Animation)
    // ========================
    if (step === 6) {
        return (
            <div style={pageStyle}>
                <div style={{ ...cardStyle, textAlign: "center" }}>
                    {/* Spinner */}
                    <div
                        style={{
                            width: 64,
                            height: 64,
                            border: "6px solid #e5e7eb",
                            borderTop: "6px solid #1f7a4f",
                            borderRadius: "50%",
                            margin: "0 auto 24px",
                            animation: "spin 1s linear infinite",
                        }}
                    />

                    <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1f7a4f", marginBottom: 8 }}>
                        Calculando tu Rating
                    </h2>

                    <p
                        key={calcMsgIndex}
                        style={{
                            fontSize: 15,
                            color: "#6b7280",
                            animation: "fadeIn 0.4s ease",
                        }}
                    >
                        {CALCULATING_MESSAGES[calcMsgIndex]}
                    </p>

                    {/* Inline CSS animation */}
                    <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            @keyframes fadeIn {
              from { opacity: 0; transform: translateY(6px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>
                </div>
            </div>
        );
    }

    // ========================
    // STEP 7: RESULTADO
    // ========================
    if (step === 7 && result) {
        const levelLabels = ["", "Básico", "Intermedio", "Avanzado"];
        const levelEmojis = ["", "🌱", "⚡", "🔥"];

        return (
            <div style={pageStyle}>
                <div style={{ ...cardStyle, textAlign: "center" }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>

                    <h1 style={{ fontSize: 24, fontWeight: 800, color: "#1f7a4f", marginBottom: 4 }}>
                        ¡Tu Draft ha terminado!
                    </h1>

                    <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 24 }}>
                        Basado en tu trayectoria y habilidades
                    </p>

                    {/* LEVEL CARD */}
                    <div
                        style={{
                            background: "linear-gradient(135deg, #1f7a4f, #145c3a)",
                            borderRadius: 20,
                            padding: "32px 24px",
                            color: "#fff",
                            marginBottom: 24,
                        }}
                    >
                        <div style={{ fontSize: 14, fontWeight: 600, opacity: 0.8, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                            Tu Nivel
                        </div>
                        <div style={{ fontSize: 56, fontWeight: 900, lineHeight: 1, marginBottom: 8 }}>
                            {levelEmojis[result.level]}
                        </div>
                        <div style={{ fontSize: 22, fontWeight: 700 }}>
                            Nivel {result.level} — {levelLabels[result.level]}
                        </div>
                    </div>

                    <button
                        onClick={() => router.push("/")}
                        style={{
                            width: "100%",
                            padding: "16px",
                            background: "#1f7a4f",
                            color: "#fff",
                            borderRadius: 14,
                            border: "none",
                            fontSize: 16,
                            fontWeight: 700,
                            cursor: "pointer",
                        }}
                    >
                        Ir a mis partidos →
                    </button>
                </div>
            </div>
        );
    }

    return null;
}
