import Link from "next/link";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

interface LandingPageProps {
    inApp: boolean;
    onLoginClick: () => Promise<void>;
}

export default function LandingPage({ inApp, onLoginClick }: LandingPageProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [copied, setCopied] = useState(false);

    const handleLogin = async () => {
        if (inApp) {
            onLoginClick();
            return;
        }

        setIsLoggingIn(true);
        try {
            await onLoginClick();
            const returnTo = searchParams.get("returnTo");
            // Basic security check: ensure it's a relative path to prevent open redirect
            if (returnTo && returnTo.startsWith("/")) {
                router.push(returnTo);
            }
        } catch (error) {
            console.error("Login failed:", error);
            setIsLoggingIn(false); // Only reset if failed. If success, unmounts.
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
            {/* HERO SECTION */}
            <div className="relative bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] text-white overflow-hidden rounded-b-[3rem] shadow-xl pb-16 pt-12 px-6 flex flex-col items-center text-center">
                {/* Background decorative elements */}
                <div className="absolute top-0 right-0 -mt-20 -mr-20 w-64 h-64 bg-white/5 rounded-full blur-3xl"></div>
                <div className="absolute bottom-0 left-0 -mb-20 -ml-20 w-64 h-64 bg-emerald-900/20 rounded-full blur-3xl"></div>

                <div className="relative z-10 w-full max-w-md mx-auto">
                    {/* Logo Area */}
                    <div className="mb-6 flex justify-center">
                        <div className="bg-white p-2.5 rounded-2xl shadow-xl inline-block text-center border-2 border-white/20">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src="/logo/lacanchita-logo.png"
                                alt="La Canchita"
                                width={160}
                                height={130}
                                style={{ height: "auto", width: "160px" }}
                                className="drop-shadow-sm transition-transform hover:scale-105 duration-300 rounded-lg"
                            />
                        </div>
                    </div>

                    <h1 className="text-4xl md:text-5xl font-black mb-4 leading-tight tracking-tight">
                        Encuentra dónde <br className="hidden md:block" />
                        <span className="text-emerald-300">jugar hoy</span>
                    </h1>
                    <p className="text-emerald-50 text-base md:text-lg mb-10 max-w-sm mx-auto leading-relaxed">
                        La red de fútbol casual que conecta jugadores, equipos y canchas en un solo lugar.
                    </p>

                    {/* MAIN LOGIN CARD */}
                    <div className="bg-white rounded-3xl p-6 shadow-2xl text-slate-800 mx-auto w-full max-w-sm">
                        {inApp ? (
                            <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-2xl p-4 text-sm text-left shadow-sm">
                                <strong className="block mb-2 flex items-center gap-2 text-blue-800">
                                    <span className="text-lg">📋</span> Abre el link en tu navegador
                                </strong>
                                <p className="leading-relaxed mb-2">
                                    Parece que abriste este link desde <strong>WhatsApp, Instagram u otra app</strong>. Estos navegadores internos no permiten iniciar sesión con Google.
                                </p>
                                <p className="leading-relaxed mb-3">
                                    Para continuar, elige una de estas opciones:
                                </p>
                                <ol className="list-decimal list-inside space-y-1 mb-3 text-blue-800 font-medium">
                                    <li>Tocá los <strong>tres puntos ⋮</strong> y seleccioná <strong>&quot;Abrir en el navegador&quot;</strong></li>
                                    <li>O copiá el link y pegalo en <strong>Chrome</strong> o <strong>Safari</strong></li>
                                </ol>
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(window.location.href);
                                        setCopied(true);
                                        setTimeout(() => setCopied(false), 2000);
                                    }}
                                    className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-bold py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
                                >
                                    {copied ? (
                                        <>
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                            ¡Link copiado!
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                            Copiar link
                                        </>
                                    )}
                                </button>
                            </div>
                        ) : (
                            <>
                                <p className="font-bold text-slate-800 mb-4 text-center">Únete a la comunidad</p>
                                <button
                                    onClick={handleLogin}
                                    disabled={isLoggingIn}
                                    className="w-full bg-white border-2 border-slate-200 rounded-2xl py-3.5 px-6 text-base font-bold text-slate-700 flex items-center justify-center gap-3 hover:bg-slate-50 hover:border-[#1f7a4f] hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isLoggingIn ? (
                                        <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin"></div>
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
                                    <Link href="/terms" className="text-[#1f7a4f] underline underline-offset-2 hover:text-[#145c3a]">términos de servicio</Link>
                                    {" "}y nuestra{" "}
                                    <Link href="/privacy" className="text-[#1f7a4f] underline underline-offset-2 hover:text-[#145c3a]">política de privacidad</Link>.
                                </p>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* VALUE PROPOSITIONS SECTION */}
            < div className="flex-1 w-full max-w-md mx-auto px-6 py-12 flex flex-col gap-6 relative" >

                <div className="text-center mb-2">
                    <h2 className="text-xs font-black tracking-widest text-[#1f7a4f] uppercase mb-1">CÓMO FUNCIONA</h2>
                    <h3 className="text-2xl font-bold text-slate-800">Diseñado para todos</h3>
                </div>

                {/* Player Card */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-shadow">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-bl-[100px] -z-0"></div>
                    <div className="relative z-10">
                        <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center text-2xl mb-4 shadow-sm">
                            🏃‍♂️
                        </div>
                        <h4 className="text-lg font-bold text-slate-800 mb-2">Para jugadores</h4>
                        <p className="text-sm text-slate-500 leading-relaxed font-medium">
                            Busca partidos públicos en tu zona, confirma tu asistencia con un clic y lleva un historial automático de tus jugadas y victorias.
                        </p>
                    </div>
                </div>

                {/* Organizer Card */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-shadow">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-purple-50 rounded-bl-[100px] -z-0"></div>
                    <div className="relative z-10">
                        <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center text-2xl mb-4 shadow-sm">
                            👥
                        </div>
                        <h4 className="text-lg font-bold text-slate-800 mb-2">Para organizadores</h4>
                        <p className="text-sm text-slate-500 leading-relaxed font-medium">
                            Crea partidos privados para tus amigos. La app balanceará los equipos automáticamente basado en el nivel y posición de cada uno.
                        </p>
                    </div>
                </div>

                {/* Venue Owner Card */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-shadow">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50 rounded-bl-[100px] -z-0"></div>
                    <div className="relative z-10">
                        <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center text-2xl mb-4 shadow-sm">
                            🥅
                        </div>
                        <h4 className="text-lg font-bold text-slate-800 mb-2">Para dueños de canchas</h4>
                        <p className="text-sm text-slate-500 leading-relaxed font-medium">
                            Publica tus horarios vacantes como partidos abiertos. Atrae nuevos jugadores directamente desde la comunidad de la app.
                        </p>
                    </div>
                </div>

            </div >

            {/* BOTTOM CTA */}
            < div className="bg-slate-900 text-white py-12 px-6 pb-safe text-center" >
                <div className="max-w-md mx-auto">
                    <h3 className="text-xl font-bold mb-2">¿Listo para rodar el balón?</h3>
                    <p className="text-slate-400 text-sm mb-6 font-medium">No te quedes por fuera del parche.</p>
                    {!inApp && (
                        <button
                            onClick={handleLogin}
                            disabled={isLoggingIn}
                            className="bg-[#1f7a4f] hover:bg-[#16603c] text-white rounded-xl py-3 px-8 text-sm font-bold shadow-lg shadow-emerald-900/50 hover:-translate-y-0.5 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoggingIn ? "Conectando..." : "Entrar Ahora"}
                        </button>
                    )}
                </div>

                {/* LEGAL FOOTER - SIC COMPLIANCE */}
                <div className="max-w-md mx-auto mt-12 pt-6 border-t border-slate-800 flex justify-center items-center">
                    <a
                        href="https://www.sic.gov.co/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-2"
                    >
                        <span>Vigilado por la Superintendencia de Industria y Comercio</span>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    </a>
                </div>
            </div >
        </div >
    );
}
