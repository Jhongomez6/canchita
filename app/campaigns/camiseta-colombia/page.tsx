import type { Metadata } from "next";
import Link from "next/link";
import { UserPlus, Calendar, Trophy, Star, ChevronRight } from "lucide-react";
import CopyLinkButton from "./CopyLinkButton";
import { CampaignPageView, CampaignCTA, WhatsAppShareButton, InstagramLink } from "./CampaignTrackers";

export const metadata: Metadata = {
    title: "Gana la Camiseta de Colombia | La Canchita",
    description:
        "Juega fútbol con La Canchita y participa en el sorteo de una camiseta oficial de la Selección Colombia Adidas. ¡Regístrate, juega 3 partidos y entra al sorteo!",
    openGraph: {
        title: "Gana la Camiseta Oficial de Colombia",
        description:
            "Juega 3 partidos en La Canchita entre el 11 de abril y el 11 de junio, y participa en el sorteo de una camiseta oficial de la Selección Colombia Adidas.",
        type: "website",
    },
};

export default function CamisetaColombiaCampaign() {
    return (
        <main className="min-h-screen bg-slate-50 font-sans">
            <CampaignPageView />

            {/* ── HERO ── */}
            <section className="relative overflow-hidden text-white text-center px-6 pt-12 pb-20">
                {/* Hero background image */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src="/campaigns/colombia-heroe.png"
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 w-full h-full object-cover object-center"
                />
                {/* Dark overlay for text readability */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/70 to-black/80" />

                <div className="relative z-10 max-w-xl mx-auto">
                    {/* Logo */}
                    <div className="flex justify-center mb-6">
                        <div className="bg-white p-2.5 rounded-2xl shadow-xl inline-block">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src="/logo/lacanchita-logo.png"
                                alt="La Canchita"
                                width={120}
                                height={98}
                                style={{ height: "auto", width: "120px" }}
                                className="rounded-lg"
                            />
                        </div>
                    </div>

                    <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm border border-white/25 rounded-full px-4 py-1.5 text-xs font-bold tracking-widest uppercase mb-5">
                        <Star className="w-3 h-3 text-[#FCD116]" />
                        Sorteo Especial Mundial 2026
                    </div>

                    <h1 className="text-4xl md:text-5xl font-black leading-tight mb-4 drop-shadow-lg">
                        La Canchita te regala la camiseta oficial de la Selección{" "}
                        <span className="text-[#FCD116]">Col</span><span className="text-[#4a90d9]">om</span><span className="text-[#CE1126]">bia</span>
                    </h1>

                    <p className="text-white text-base md:text-lg mb-10 max-w-sm mx-auto leading-relaxed drop-shadow">
                        Juega fútbol con nosotros y llévate la camiseta oficial Adidas de la Tricolor para que vivas el Mundial.
                    </p>

                    <CampaignCTA />

                    <p className="mt-4 text-white/60 text-xs">Participación gratuita</p>
                    <p className="mt-1 text-white/40 text-xs">
                        <a href="#terminos" className="underline underline-offset-2 hover:text-white/70 transition-colors">Aplican términos y condiciones</a>
                    </p>
                </div>
            </section>

            {/* ── CÓMO PARTICIPAR ── */}
            <section className="max-w-xl mx-auto px-6 py-14">
                <div className="text-center mb-8">
                    <p className="text-xs font-black tracking-widest text-[#1f7a4f] uppercase mb-1">Es muy fácil</p>
                    <h2 className="text-2xl font-bold text-slate-800">¿Cómo participar?</h2>
                </div>

                <div className="flex flex-col gap-4">
                    {/* Paso 1 */}
                    <div className="flex items-start gap-4 bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                        <div className="flex-shrink-0 w-12 h-12 bg-[#FCD116] rounded-2xl flex items-center justify-center shadow">
                            <UserPlus className="w-5 h-5 text-[#003087]" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-xs font-black text-slate-400 tracking-widest">PASO 1</span>
                            </div>
                            <h3 className="text-base font-bold text-slate-800">Regístrate en La Canchita</h3>
                            <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                                Crea tu cuenta gratis con Google. Solo toma un minuto y ya quedas en el sistema.
                            </p>
                        </div>
                    </div>

                    {/* Paso 2 */}
                    <div className="flex items-start gap-4 bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                        <div className="flex-shrink-0 w-12 h-12 bg-[#003087] rounded-2xl flex items-center justify-center shadow">
                            <Calendar className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-xs font-black text-slate-400 tracking-widest">PASO 2</span>
                            </div>
                            <h3 className="text-base font-bold text-slate-800">Juega 3 partidos</h3>
                            <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                                Únete a partidos en la app y juega al menos 3 entre el{" "}
                                <span className="font-bold text-slate-700">11 de abril</span> y el{" "}
                                <span className="font-bold text-slate-700">11 de junio de 2026</span>.
                                Solo cuentan partidos donde hayas confirmado asistencia, que queden en estado <span className="font-bold text-slate-700">completado</span> y con marcador registrado por el administrador.
                            </p>
                        </div>
                    </div>

                    {/* Paso 3 */}
                    <div className="flex items-start gap-4 bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                        <div className="flex-shrink-0 w-12 h-12 bg-[#CE1126] rounded-2xl flex items-center justify-center shadow">
                            <Trophy className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-xs font-black text-slate-400 tracking-widest">PASO 3</span>
                            </div>
                            <h3 className="text-base font-bold text-slate-800">Espera el sorteo</h3>
                            <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                                El <span className="font-bold text-slate-700">12 de junio de 2026</span> se realizará el sorteo entre todos los participantes que cumplan los requisitos. El ganador será contactado ese mismo día.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── FECHAS CLAVE ── */}
            <section className="bg-[#003087] py-12 px-6">
                <div className="max-w-xl mx-auto">
                    <h2 className="text-white font-bold text-xl text-center mb-8">Fechas importantes</h2>

                    <div className="relative">
                        {/* Vertical line */}
                        <div className="absolute left-5 top-3 bottom-3 w-0.5 bg-white/20" />

                        <div className="flex flex-col gap-6">
                            <div className="flex items-start gap-4">
                                <div className="flex-shrink-0 w-10 h-10 bg-[#FCD116] rounded-full flex items-center justify-center shadow-lg z-10">
                                    <span className="text-[#003087] text-xs font-black">11A</span>
                                </div>
                                <div className="pt-1.5">
                                    <p className="text-[#FCD116] font-bold text-sm">11 de Abril, 2026</p>
                                    <p className="text-white/80 text-sm">Inicio del período de partidos válidos para el sorteo</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-4">
                                <div className="flex-shrink-0 w-10 h-10 bg-[#003087] border-2 border-white/30 rounded-full flex items-center justify-center shadow-lg z-10">
                                    <span className="text-white text-xs font-black">11J</span>
                                </div>
                                <div className="pt-1.5">
                                    <p className="text-[#FCD116] font-bold text-sm">11 de Junio, 2026</p>
                                    <p className="text-white/80 text-sm">Último día para acumular partidos válidos. ¡Asegura tus 3 partidos!</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-4">
                                <div className="flex-shrink-0 w-10 h-10 bg-[#CE1126] rounded-full flex items-center justify-center shadow-lg z-10">
                                    <Trophy className="w-4 h-4 text-white" />
                                </div>
                                <div className="pt-1.5">
                                    <p className="text-[#FCD116] font-bold text-sm">12 de Junio, 2026</p>
                                    <p className="text-white/80 text-sm">Realizamos el sorteo aleatorio entre todos los participantes que cumplan los requisitos. El ganador es contactado ese mismo día.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── PREMIO ── */}
            <section className="max-w-xl mx-auto px-6 -mt-8 relative z-10">
                <div className="rounded-3xl shadow-xl overflow-hidden relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src="/campaigns/colombia-copa.jpg"
                        alt="Copa y balón sobre bandera Colombia"
                        className="absolute inset-0 w-full h-full object-cover object-center"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-black/20" />
                    <div className="relative z-10 p-6 pt-40">
                        <div className="inline-flex items-center gap-2 bg-[#FCD116] text-[#003087] text-xs font-black px-3 py-1 rounded-full mb-3 uppercase tracking-wide">
                            🏆 El Premio
                        </div>
                        <h2 className="text-2xl font-black text-white leading-tight mb-2 drop-shadow">
                            Camiseta Oficial Adidas<br />
                            <span className="text-[#FCD116]">Selección Colombia</span>
                        </h2>
                        <p className="text-white/80 text-sm leading-relaxed mb-4">
                            Una (1) camiseta oficial de la Selección Colombia. El ganador elige la talla disponible en{" "}
                            <span className="font-bold text-white">adidas.co</span> al momento del sorteo.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <span className="bg-white/15 backdrop-blur-sm border border-white/25 text-white text-xs font-bold px-2.5 py-1 rounded-full">Adidas oficial</span>
                            <span className="bg-white/15 backdrop-blur-sm border border-white/25 text-white text-xs font-bold px-2.5 py-1 rounded-full">Mundial 2026</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── TÉRMINOS Y CONDICIONES ── */}
            <section id="terminos" className="max-w-xl mx-auto px-6 py-14">
                <div className="text-center mb-8">
                    <p className="text-xs font-black tracking-widest text-[#1f7a4f] uppercase mb-1">Transparencia</p>
                    <h2 className="text-2xl font-bold text-slate-800">Términos y Condiciones</h2>
                    <p className="text-sm text-slate-500 mt-2">Campaña Sorteo Camiseta Colombia 2026</p>
                </div>

                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 divide-y divide-slate-100">

                    <div className="p-5">
                        <h3 className="text-sm font-bold text-[#1f7a4f] mb-2">1. Organizador</h3>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            Esta campaña es organizada por <strong>La Canchita</strong>, operada por{" "}
                            <strong>Jhon Eduar Tobar Gomez</strong>, CC 1.144.195.090, con domicilio en Cali, Colombia.
                            Para consultas sobre la campaña: <a href="mailto:soporte@lacanchita.app" className="text-[#1f7a4f] font-bold hover:underline">soporte@lacanchita.app</a>.
                        </p>
                    </div>

                    <div className="p-5">
                        <h3 className="text-sm font-bold text-[#1f7a4f] mb-2">2. Período de vigencia</h3>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            Solo se contabilizarán partidos jugados entre el <strong>11 de abril de 2026</strong> (00:00 COT) y el{" "}
                            <strong>11 de junio de 2026</strong> (23:59 COT), ambas fechas inclusive.
                            Los partidos jugados antes del 11 de abril de 2026 <strong>no son válidos</strong> para esta campaña,
                            independientemente del historial del usuario en la plataforma.
                        </p>
                    </div>

                    <div className="p-5">
                        <h3 className="text-sm font-bold text-[#1f7a4f] mb-2">3. Requisitos de participación</h3>
                        <ul className="text-sm text-slate-600 leading-relaxed space-y-2 list-disc pl-4">
                            <li>Tener una cuenta activa y verificada en La Canchita.</li>
                            <li>Haber jugado un mínimo de <strong>3 (tres) partidos</strong> dentro del período de vigencia. Se entenderá como jugado aquel partido que cumpla <em>todas</em> las condiciones siguientes: (a) el usuario confirmó su asistencia, (b) la fecha de celebración se encuentra dentro del período de vigencia, (c) el partido se encuentra en estado <strong>completado</strong> y (d) el resultado fue registrado por el administrador del partido.</li>
                            <li>Ser mayor de 18 años.</li>
                            <li>Residir en Colombia.</li>
                        </ul>
                    </div>

                    <div className="p-5">
                        <h3 className="text-sm font-bold text-[#1f7a4f] mb-2">4. Mecánica del sorteo</h3>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            El <strong>12 de junio de 2026</strong> se realizará un sorteo aleatorio entre todos los participantes
                            que cumplan los requisitos establecidos, utilizando una herramienta de selección aleatoria verificable
                            (ej. Wheel of Names, Google Picker u similar). El sorteo será documentado y el proceso será transparente.
                            El resultado es inapelable.
                        </p>
                    </div>

                    <div className="p-5">
                        <h3 className="text-sm font-bold text-[#1f7a4f] mb-2">5. Premio</h3>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            El premio consiste en <strong>una (1) camiseta oficial de la Selección Colombia</strong>,
                            marca Adidas, adquirida en la tienda oficial de Adidas Colombia (adidas.co) el mismo día del sorteo.
                            El ganador deberá indicar la talla deseada dentro de las disponibles en el sitio oficial al momento de la compra.
                        </p>
                        <p className="text-sm text-slate-600 leading-relaxed mt-2">
                            Si la talla solicitada no se encuentra disponible, el ganador podrá: (a) elegir otra talla disponible,
                            o (b) declinar el premio, en cuyo caso se realizará un nuevo sorteo entre los demás participantes elegibles.
                        </p>
                        <p className="text-sm text-slate-600 leading-relaxed mt-2">
                            <strong>La Canchita no garantiza disponibilidad de tallas específicas</strong>, ya que esto depende
                            exclusivamente del inventario de Adidas Colombia al momento de la compra.
                        </p>
                    </div>

                    <div className="p-5">
                        <h3 className="text-sm font-bold text-[#1f7a4f] mb-2">6. Entrega del premio</h3>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            El ganador será contactado a través de los datos registrados en su cuenta de La Canchita el mismo
                            día del sorteo (12 de junio de 2026). La camiseta será comprada en línea y enviada al ganador a
                            través de los canales de Adidas Colombia. Los gastos de envío corren por cuenta de La Canchita.
                        </p>
                    </div>

                    <div className="p-5">
                        <h3 className="text-sm font-bold text-[#1f7a4f] mb-2">7. Costo de participación</h3>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            La participación en esta campaña es <strong>completamente gratuita</strong>. No se requiere
                            ningún pago, compra o desembolso económico para participar. El uso de La Canchita
                            es igualmente gratuito.
                        </p>
                    </div>

                    <div className="p-5">
                        <h3 className="text-sm font-bold text-[#1f7a4f] mb-2">8. Naturaleza del sorteo</h3>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            Esta actividad <strong>no constituye un juego de suerte y azar</strong> en los términos de la Ley
                            643 de 2001, ya que no implica apuestas, ni pagos de participación, ni está sujeta a la autorización
                            de Coljuegos. Se trata de un sorteo promocional gratuito condicionado al cumplimiento de requisitos
                            de uso de la plataforma.
                        </p>
                    </div>

                    <div className="p-5">
                        <h3 className="text-sm font-bold text-[#1f7a4f] mb-2">9. Exclusión y fraude</h3>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            La Canchita se reserva el derecho de descalificar a cualquier participante que, a juicio de
                            los organizadores, haya actuado de mala fe, manipulado el sistema, creado cuentas falsas o
                            registrado asistencia a partidos de forma fraudulenta. La decisión de descalificación es
                            definitiva e inapelable.
                        </p>
                    </div>

                    <div className="p-5">
                        <h3 className="text-sm font-bold text-[#1f7a4f] mb-2">10. Datos personales</h3>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            Los datos del ganador (nombre, ciudad) podrán ser publicados en las redes sociales de
                            La Canchita con fines de transparencia, previo consentimiento. El tratamiento de datos
                            personales se rige por la{" "}
                            <Link href="/privacy" className="text-[#1f7a4f] font-bold hover:underline">
                                Política de Privacidad de La Canchita
                            </Link>{" "}
                            y la Ley 1581 de 2012.
                        </p>
                    </div>

                    <div className="p-5">
                        <h3 className="text-sm font-bold text-[#1f7a4f] mb-2">11. Modificaciones y cancelación</h3>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            La Canchita se reserva el derecho de modificar, suspender o cancelar esta campaña en cualquier
                            momento por causas de fuerza mayor o razones operativas, notificando a los participantes a través
                            de la aplicación o por correo electrónico con un mínimo de 48 horas de anticipación,
                            salvo caso fortuito.
                        </p>
                    </div>

                    <div className="p-5">
                        <h3 className="text-sm font-bold text-[#1f7a4f] mb-2">12. Jurisdicción</h3>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            Esta campaña se rige por las leyes de la República de Colombia. Cualquier controversia
                            será resuelta conforme a la Ley 1480 de 2011 (Estatuto del Consumidor) y demás
                            normativa aplicable. Para PQR relacionadas con esta campaña, escribir a{" "}
                            <a href="mailto:soporte@lacanchita.app" className="text-[#1f7a4f] font-bold hover:underline">
                                soporte@lacanchita.app
                            </a>.
                        </p>
                    </div>

                </div>
            </section>

            {/* ── CTA FINAL ── */}
            <section className="bg-slate-900 text-white py-14 px-6 text-center">
                <div className="max-w-xl mx-auto">
                    <div className="text-4xl mb-4">🇨🇴</div>
                    <h2 className="text-2xl font-black mb-3">¿Listo para jugar?</h2>
                    <p className="text-slate-400 text-sm mb-8 max-w-sm mx-auto leading-relaxed">
                        Únete a La Canchita, encuentra partidos cerca tuyo y gana la camiseta de la Tricolor.
                    </p>
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 bg-[#FCD116] text-[#003087] font-black text-base rounded-2xl py-4 px-10 shadow-xl hover:bg-yellow-300 hover:-translate-y-0.5 active:scale-[0.98] transition-all"
                    >
                        Registrarme ahora
                        <ChevronRight className="w-5 h-5" />
                    </Link>
                    <p className="mt-4 text-slate-500 text-xs">
                        ¿Ya tienes cuenta?{" "}
                        <Link href="/" className="text-[#FCD116] hover:underline font-semibold">
                            Inicia sesión aquí
                        </Link>
                    </p>

                    <div className="mt-8 pt-6 border-t border-slate-800">
                        <p className="text-slate-500 text-xs mb-3">Comparte con tus amigos</p>
                        <div className="flex items-center justify-center gap-2">
                            <WhatsAppShareButton />
                            <CopyLinkButton />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="max-w-xl mx-auto mt-12 pt-6 border-t border-slate-800 flex flex-col items-center gap-3">
                    <div className="flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/logo/lacanchita-logo.png"
                            alt="La Canchita"
                            width={40}
                            height={33}
                            style={{ height: "auto", width: "40px" }}
                            className="rounded opacity-60"
                        />
                        <span className="text-slate-500 text-xs">La Canchita · Cali, Colombia</span>
                    </div>
                    <InstagramLink />
                    <a
                        href="https://www.sic.gov.co/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-slate-600 hover:text-slate-400 transition-colors flex items-center gap-1.5"
                    >
                        Vigilado por la Superintendencia de Industria y Comercio
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                    </a>
                    <Link href="/terms" className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
                        Términos del servicio
                    </Link>
                </div>
            </section>

        </main>
    );
}
