import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, MapPin, CreditCard, CheckCircle2 } from "lucide-react";
import { sanitizeVenueIdParam } from "@/lib/domain/landing";
import { isReservarLandingEnabledServer } from "@/lib/reservationsConfig.server";
import LandingTrackers from "./LandingTrackers";
import ReservarCTA from "./ReservarCTA";
import InstallSection from "./InstallSection";

export const metadata: Metadata = {
    title: "Reserva tu cancha | La Canchita",
    description:
        "Reserva tu cancha en segundos con La Canchita: elige día y hora, abona en línea y recibe la confirmación. Sin llamadas ni mensajes de WhatsApp.",
    openGraph: {
        title: "Reserva tu cancha con La Canchita",
        description:
            "Elige día y hora, abona en línea y recibe la confirmación de tu reserva. Sin llamadas ni mensajes de WhatsApp.",
        type: "website",
        images: ["/logo/lacanchita-logo.png"],
    },
};

export default async function ReservarLanding({
    searchParams,
}: {
    searchParams: Promise<{ sede?: string | string[] }>;
}) {
    // Feature flag (config/reservations, toggle del super admin): mientras esté
    // apagado, la landing pública no existe (404).
    if (!(await isReservarLandingEnabledServer())) notFound();

    const params = await searchParams;
    const rawSede = Array.isArray(params.sede) ? params.sede[0] : params.sede;
    const venueId = sanitizeVenueIdParam(rawSede);

    return (
        <main className="min-h-screen bg-slate-50 font-sans">
            <LandingTrackers venueId={venueId} />

            {/* ── HERO ── */}
            <section className="relative overflow-hidden bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] text-white text-center px-6 pt-12 pb-16 rounded-b-[3rem] shadow-xl">
                <div className="absolute top-0 right-0 -mt-20 -mr-20 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
                <div className="absolute bottom-0 left-0 -mb-20 -ml-20 w-64 h-64 bg-emerald-900/20 rounded-full blur-3xl" />

                <div className="relative z-10 max-w-xl mx-auto">
                    <div className="flex justify-center mb-6">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/logo/lacanchita-logo-white.png"
                            alt="La Canchita"
                            width={240}
                            height={196}
                            style={{ height: "auto", width: "240px" }}
                            className="drop-shadow-sm"
                        />
                    </div>

                    <div className="inline-flex items-center gap-2 bg-white/15 border border-white/25 rounded-full px-4 py-1.5 text-xs font-bold tracking-widest uppercase mb-5">
                        <CalendarClock className="w-3.5 h-3.5 text-emerald-200" />
                        Reserva online
                    </div>

                    <h1 className="text-4xl md:text-5xl font-black leading-tight mb-4">
                        Reserva tu cancha <span className="text-emerald-300">en segundos</span>
                    </h1>

                    <p className="text-emerald-50 text-base md:text-lg mb-8 max-w-sm mx-auto leading-relaxed">
                        Elige día y hora, abona en línea y recibe la confirmación. Sin llamadas ni mensajes de WhatsApp.
                    </p>

                    <ReservarCTA venueId={venueId} location="hero" />
                    <p className="mt-4 text-emerald-100/70 text-xs">Gratis · Te registras con Google en un toque</p>
                    <p className="mt-2 text-emerald-100/70 text-[11px] max-w-xs mx-auto leading-relaxed">
                        Al continuar, aceptas nuestros{" "}
                        <Link href="/terms" className="underline underline-offset-2 hover:text-white">términos de servicio</Link>
                        {" "}y nuestra{" "}
                        <Link href="/privacy" className="underline underline-offset-2 hover:text-white">política de privacidad</Link>.
                    </p>
                </div>
            </section>

            {/* ── CÓMO RESERVAR ── */}
            <section className="bg-white border-b border-slate-100 px-6 py-14">
                <div className="max-w-xl mx-auto">
                    <div className="text-center mb-8">
                        <p className="text-xs font-black tracking-widest text-[#1f7a4f] uppercase mb-1">Es muy fácil</p>
                        <h2 className="text-2xl font-bold text-slate-800">Reserva en 3 pasos</h2>
                    </div>

                    <div className="flex flex-col gap-4">
                        <StepCard
                            n={1}
                            icon={<MapPin className="w-5 h-5 text-white" />}
                            color="bg-[#1f7a4f]"
                            title="Elige sede, día y hora"
                            body="Busca tu cancha, mira la disponibilidad y selecciona el horario que quieres."
                        />
                        <StepCard
                            n={2}
                            icon={<CreditCard className="w-5 h-5 text-white" />}
                            color="bg-emerald-600"
                            title="Abona y sube tu comprobante"
                            body="Paga el abono por el método de la sede y adjunta tu comprobante desde la app."
                        />
                        <StepCard
                            n={3}
                            icon={<CheckCircle2 className="w-5 h-5 text-white" />}
                            color="bg-amber-500"
                            title="Listo, te confirmamos"
                            body="La sede verifica tu pago y confirma tu reserva. Recibes la notificación en la app."
                        />
                    </div>
                </div>
            </section>

            {/* ── INSTALAR APP ── */}
            <InstallSection />

            {/* ── CTA FINAL ── */}
            <section className="bg-slate-900 text-white py-14 px-6 text-center">
                <div className="max-w-xl mx-auto">
                    <div className="text-4xl mb-4">⚽</div>
                    <h2 className="text-2xl font-black mb-3">¿Listo para reservar?</h2>
                    <p className="text-slate-400 text-sm mb-8 max-w-sm mx-auto leading-relaxed">
                        Regístrate gratis y reserva tu cancha en un par de toques.
                    </p>
                    <ReservarCTA venueId={venueId} location="final" />
                    <p className="mt-4 text-slate-500 text-[11px] max-w-xs mx-auto leading-relaxed">
                        Al continuar, aceptas nuestros{" "}
                        <Link href="/terms" className="underline underline-offset-2 hover:text-slate-300">términos de servicio</Link>
                        {" "}y nuestra{" "}
                        <Link href="/privacy" className="underline underline-offset-2 hover:text-slate-300">política de privacidad</Link>.
                    </p>
                    <p className="mt-3 text-slate-500 text-xs">
                        ¿Ya tienes cuenta?{" "}
                        <Link href="/" className="text-emerald-300 hover:underline font-semibold">
                            Inicia sesión aquí
                        </Link>
                    </p>

                    {/* Footer */}
                    <div className="mt-12 pt-6 border-t border-slate-800 flex flex-col items-center gap-3">
                        <div className="flex items-center gap-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src="/logo/lacanchita-logo-white.png"
                                alt="La Canchita"
                                width={40}
                                height={33}
                                style={{ height: "auto", width: "40px" }}
                                className="rounded opacity-60"
                            />
                            <span className="text-slate-500 text-xs">La Canchita · Cali, Colombia</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <Link href="/terms" className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
                                Términos del servicio
                            </Link>
                            <Link href="/privacy" className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
                                Política de privacidad
                            </Link>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}

function StepCard({
    n,
    icon,
    color,
    title,
    body,
}: {
    n: number;
    icon: React.ReactNode;
    color: string;
    title: string;
    body: string;
}) {
    return (
        <div className="flex items-start gap-4 bg-slate-50 rounded-2xl p-5 border border-slate-100">
            <div className={`flex-shrink-0 w-12 h-12 ${color} rounded-2xl flex items-center justify-center shadow`}>
                {icon}
            </div>
            <div>
                <span className="text-xs font-black text-slate-400 tracking-widest">PASO {n}</span>
                <h3 className="text-base font-bold text-slate-800">{title}</h3>
                <p className="text-sm text-slate-500 mt-1 leading-relaxed">{body}</p>
            </div>
        </div>
    );
}
