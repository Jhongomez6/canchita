"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { toast } from "react-hot-toast";
import { useAuth } from "@/lib/AuthContext";
import { loginWithGoogle } from "@/lib/auth";
import { isInAppBrowser } from "@/lib/browser";
import { isLocationAdmin } from "@/lib/domain/user";
import { logLocationAdminSignupStarted } from "@/lib/analytics";
import { handleError } from "@/lib/utils/error";

const SIGNUP_INTENT_KEY = "signupIntent";

export default function RegistroAdminPage() {
    const router = useRouter();
    const { user, profile, loading } = useAuth();
    const [inApp, setInApp] = useState(false);
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => setInApp(isInAppBrowser()), 0);
        return () => clearTimeout(t);
    }, []);

    // Si el usuario ya está logueado, no tiene sentido seguir aquí.
    // Lo enviamos a su landing natural según su rol.
    useEffect(() => {
        if (loading || !user || !profile) return;
        if (isLocationAdmin(profile)) {
            router.replace("/bookings");
        } else {
            router.replace("/");
        }
    }, [loading, user, profile, router]);

    const handleSignup = async () => {
        if (inApp) return;
        try {
            setIsLoggingIn(true);
            window.sessionStorage.setItem(SIGNUP_INTENT_KEY, "location_admin");
            logLocationAdminSignupStarted();
            await loginWithGoogle();
            // Tras el popup, el AuthContext consume el flag y crea el perfil.
            // El AuthGuard se encarga del routing posterior (phone gate → /bookings).
        } catch (error) {
            // Limpiar flag si falla, para no contaminar futuros logins.
            try {
                window.sessionStorage.removeItem(SIGNUP_INTENT_KEY);
            } catch {}
            setIsLoggingIn(false);
            handleError(error, "No pudimos iniciar tu registro. Intenta de nuevo.");
        }
    };

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error("No pudimos copiar el link");
        }
    };

    // Mientras revisamos sesión, mostrar splash mínimo.
    if (loading || (user && !profile)) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] flex items-center justify-center p-5">
                <div className="bg-white rounded-3xl p-10 max-w-md w-full shadow-2xl text-center">
                    <div className="mb-6 flex justify-center">
                        <Image
                            src="/logo/lacanchita-logo.png"
                            alt="La Canchita"
                            width={120}
                            height={100}
                            style={{ height: "auto", width: "200px" }}
                            priority
                            unoptimized
                        />
                    </div>
                    <div className="flex justify-center items-center gap-2 mt-4">
                        <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-[bounce_1s_infinite_0ms]" />
                        <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-[bounce_1s_infinite_200ms]" />
                        <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-[bounce_1s_infinite_400ms]" />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
            <div className="relative bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] text-white overflow-hidden rounded-b-[3rem] shadow-xl pb-16 pt-12 px-6 flex flex-col items-center text-center">
                <div className="absolute top-0 right-0 -mt-20 -mr-20 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
                <div className="absolute bottom-0 left-0 -mb-20 -ml-20 w-64 h-64 bg-emerald-900/20 rounded-full blur-3xl" />

                <div className="relative z-10 w-full max-w-md mx-auto">
                    <div className="mb-6 flex justify-center">
                        <div className="bg-white p-2.5 rounded-2xl shadow-xl inline-block text-center border-2 border-white/20">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src="/logo/lacanchita-logo.png"
                                alt="La Canchita"
                                width={160}
                                height={130}
                                style={{ height: "auto", width: "160px" }}
                                className="drop-shadow-sm rounded-lg"
                            />
                        </div>
                    </div>

                    <span className="inline-block bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest mb-3">
                        Registro de Sedes
                    </span>
                    <h1 className="text-3xl md:text-4xl font-black mb-3 leading-tight tracking-tight">
                        Administra tu <br />
                        <span className="text-emerald-300">cancha</span>
                    </h1>
                    <p className="text-emerald-50 text-base mb-8 max-w-sm mx-auto leading-relaxed">
                        Crea tu cuenta como dueño o administrador de cancha y gestiona reservas, bloqueos de horarios y disponibilidad de tus sedes.
                    </p>

                    <div className="bg-white rounded-3xl p-6 shadow-2xl text-slate-800 mx-auto w-full max-w-sm">
                        {inApp ? (
                            <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-2xl p-4 text-sm text-left shadow-sm">
                                <strong className="block mb-2 flex items-center gap-2 text-blue-800">
                                    <span className="text-lg">📋</span> Abre el link en tu navegador
                                </strong>
                                <p className="leading-relaxed mb-3">
                                    Estos navegadores internos (WhatsApp, Instagram, etc.) no permiten iniciar sesión con Google. Copia el link y pégalo en <strong>Chrome</strong> o <strong>Safari</strong>.
                                </p>
                                <button
                                    onClick={copyLink}
                                    className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-bold py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
                                >
                                    {copied ? "¡Link copiado!" : "Copiar link"}
                                </button>
                            </div>
                        ) : (
                            <>
                                <p className="font-bold text-slate-800 mb-4 text-center">Regístrate como admin de cancha</p>
                                <button
                                    onClick={handleSignup}
                                    disabled={isLoggingIn}
                                    className="w-full bg-white border-2 border-slate-200 rounded-2xl py-3.5 px-6 text-base font-bold text-slate-700 flex items-center justify-center gap-3 hover:bg-slate-50 hover:border-[#1f7a4f] hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isLoggingIn ? (
                                        <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
                                    ) : (
                                        <svg width="22" height="22" viewBox="0 0 24 24">
                                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                        </svg>
                                    )}
                                    {isLoggingIn ? "Conectando..." : "Continuar con Google"}
                                </button>
                                <p className="text-[11px] text-slate-400 mt-4 text-center font-medium px-4">
                                    Al continuar, aceptas nuestros{" "}
                                    <Link href="/terms" className="text-[#1f7a4f] underline underline-offset-2 hover:text-[#145c3a]">términos</Link>
                                    {" "}y nuestra{" "}
                                    <Link href="/privacy" className="text-[#1f7a4f] underline underline-offset-2 hover:text-[#145c3a]">política de privacidad</Link>.
                                </p>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex-1 w-full max-w-md mx-auto px-6 py-12 flex flex-col gap-5">
                <div className="text-center mb-2">
                    <h2 className="text-xs font-black tracking-widest text-[#1f7a4f] uppercase mb-1">QUÉ INCLUYE</h2>
                    <h3 className="text-2xl font-bold text-slate-800">Tu sede en orden</h3>
                </div>

                <Feature emoji="🗓️" title="Calendario de reservas" body="Mira en tiempo real qué horarios están reservados y cuáles libres en cada cancha de tu sede." />
                <Feature emoji="🚧" title="Bloqueos y mantenimiento" body="Bloquea slots por mantenimiento, eventos privados o cualquier motivo, con recurrencia si lo necesitas." />
                <Feature emoji="👥" title="Reservas manuales" body="Registra reservas presenciales o por teléfono directamente desde el panel." />

                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mt-4">
                    <p className="text-sm text-amber-900 leading-relaxed">
                        <strong>Importante:</strong> tras registrarte, un super admin de La Canchita asignará tu sede a tu cuenta. Mientras tanto verás una pantalla de espera — te avisaremos en cuanto puedas empezar.
                    </p>
                </div>

                <div className="text-center mt-4">
                    <p className="text-xs text-slate-400">
                        ¿Eres jugador?{" "}
                        <Link href="/" className="text-[#1f7a4f] font-semibold underline underline-offset-2">
                            Regístrate como jugador
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}

function Feature({ emoji, title, body }: { emoji: string; title: string; body: string }) {
    return (
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 flex gap-4 items-start">
            <div className="w-12 h-12 bg-emerald-50 text-2xl rounded-2xl flex items-center justify-center flex-shrink-0">
                {emoji}
            </div>
            <div>
                <h4 className="text-base font-bold text-slate-800 mb-1">{title}</h4>
                <p className="text-sm text-slate-500 leading-relaxed">{body}</p>
            </div>
        </div>
    );
}
