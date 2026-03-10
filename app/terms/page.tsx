import Link from "next/link";

export default function TermsPage() {
    return (
        <main className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
            <div className="max-w-3xl mx-auto bg-white p-8 sm:p-12 rounded-3xl shadow-lg">
                <div className="mb-10 border-b border-slate-200 pb-8 text-center">
                    <div className="text-5xl mb-4">📜</div>
                    <h1 className="text-3xl font-black text-slate-900 mb-2">Términos del Servicio</h1>
                    <p className="text-slate-500 font-medium">Última actualización: Marzo 2026</p>
                </div>

                <div className="space-y-8 text-slate-700 leading-relaxed text-base">
                    <section>
                        <h2 className="text-xl font-bold text-[#1f7a4f] mb-3">0. Identificación y PQR</h2>
                        <p>
                            En cumplimiento de la Ley 1480 de 2011, se informa que el responsable de esta plataforma es
                            <strong> Jhon Eduar Tobar Gomez.</strong>, identificado con
                            <strong> CC 1.144.195.090</strong>, con domicilio en la ciudad de <strong>Cali, Colombia</strong>.
                            Para cualquier Petición, Queja o Recurso (PQR), puede contactarnos al correo:
                            <a href="mailto:soporte@lacanchita.app" className="text-[#1f7a4f] font-bold hover:underline ml-1">soporte@lacanchita.app</a>.
                            Nos comprometemos a dar respuesta a su solicitud en un plazo máximo de quince (15) días hábiles.
                        </p>
                    </section>
                    <section>
                        <h2 className="text-xl font-bold text-[#1f7a4f] mb-3">1. Aceptación y Naturaleza del Servicio</h2>
                        <p>
                            Al utilizar la aplicación <strong>La Canchita</strong>, usted acepta regirse por estos Términos
                            del Servicio. &quot;La Canchita&quot; es exclusivamente una herramienta de software (plataforma de emparejamiento digital)
                            diseñada para ayudar a jugadores aficionados a organizar logística, registrar asistencia, formar
                            equipos balanceados y ubicar sedes deportivas dentro del territorio nacional colombiano.
                        </p>
                        <p className="mt-2">
                            <strong>La Canchita NO es propietaria</strong>, operadora ni arrendadora
                            de instalaciones deportivas. Tampoco organizamos competiciones oficiales ni eventos lucrativos físicos.
                            Toda interacción física acordada a través de la aplicación se realiza de forma independiente y bajo
                            el propio riesgo y responsabilidad de los usuarios.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-[#1f7a4f] mb-3">2. Exención de Responsabilidad Civil y Física</h2>
                        <p>
                            En alineación con la normatividad colombiana (Estatuto del Consumidor, Ley 1480 de 2011),
                            &quot;La Canchita&quot; provee la plataforma digital con los más altos estándares de calidad e idoneidad.
                            Sin embargo, debido a la naturaleza física y los riesgos inherentes a la práctica
                            deportiva presencial:
                        </p>
                        <ul className="list-disc pl-6 mt-3 space-y-2 text-slate-600">
                            <li><strong>Lesiones y Salud:</strong> La aplicación no se hace responsable civil
                                ni penalmente por lesiones personales, esguinces, fracturas, desgaste físico u ofensas ocurridas
                                durante los partidos organizados mediante la plataforma. Usted declara que se encuentra
                                actualmente en un estado de salud adecuado para realizar actividad física competitiva.
                            </li>
                            <li><strong>Hurto o Pérdida:</strong> No somos responsables por robos, pérdidas o
                                daños a objetos de valor personal, dispositivos móviles, o vehículos dentro o fuera de las
                                instalaciones deportivas seleccionadas.
                            </li>
                            <li><strong>Altercados Físicos:</strong> Repudiamos cualquier forma de violencia. Sin embargo, no
                                somos responsables de altercados, riñas, ni disputas verbales o físicas entre los jugadores o
                                terceros que ocurran antes, durante o después del evento.
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-[#1f7a4f] mb-3">3. Admisión y Reglas de Comportamiento</h2>
                        <p>
                            Para mantener un entorno seguro y amistoso para todos los usuarios:
                        </p>
                        <ul className="list-disc pl-6 mt-3 space-y-2 text-slate-600">
                            <li>
                                Los Administradores y creadores de partidos se reservan el derecho de vetar a jugadores por
                                mal comportamiento, faltas de respeto, agresividad continua o juego desleal comprobado.
                            </li>
                            <li>
                                Está estrictamente prohibido asistir a los partidos bajo la influencia de sustancias
                                psicoactivas o en estado de embriaguez evidente que ponga en riesgo la integridad del
                                juego y sus participantes.
                            </li>
                            <li>
                                Las ausencias sin previo aviso (<em>No-Shows</em>) pueden llevar a una marca en
                                su perfil calculada por el algoritmo, lo que limitará su capacidad de unirse
                                a partidos futuros con cupos cerrados.
                            </li>
                        </ul>

                        <h3 className="text-lg font-semibold text-slate-800 mt-6 mb-2">3.1 Responsabilidad sobre Datos de Terceros (Invitados)</h3>
                        <p>
                            Al registrar &quot;Invitados&quot; en la plataforma, usted declara y garantiza que cuenta con la autorización previa, expresa e informada de dichas personas para suministrar sus datos personales (nombre y nivel deportivo) a La Canchita. Usted mantendrá indemne a la plataforma ante cualquier reclamación de terceros derivada del tratamiento de sus datos sin su consentimiento.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-[#1f7a4f] mb-3">4. Transacciones y Pagos</h2>
                        <p>
                            &quot;La Canchita&quot;, en su estado actual, no procesa pagos, retenciones bancarias ni
                            alquileres de campo a través de la aplicación. Cualquier acuerdo económico transado
                            para el pago del alquiler de la cancha es un acuerdo privado entre los jugadores
                            y el proveedor del sitio deportivo y está fuera del alcance legal y operativo de esta plataforma.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-[#1f7a4f] mb-3">5. Restricción de Edad</h2>
                        <p>
                            La Canchita es una plataforma diseñada para la gestión logística entre adultos. Al registrarte,
                            confirmas que tienes al menos <strong>18 años cumplidos</strong>. El uso por parte de menores de edad
                            no está permitido en esta etapa para garantizar el cumplimiento de las normativas de seguridad
                            física y protección de datos reforzada de la República de Colombia.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-[#1f7a4f] mb-3">6. Propiedad Intelectual</h2>
                        <p>
                            El diseño, código fuente, algoritmos de balanceo, base de datos y logotipos de &quot;La Canchita&quot; son propiedad exclusiva de <strong>Jhon Eduar Tobar Gomez</strong>. Queda estrictamente prohibida su copia, ingeniería inversa, distribución comercial o reproducción total o parcial sin autorización expresa por escrito.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-[#1f7a4f] mb-3">7. Modificaciones</h2>
                        <p>
                            Nos reservamos el derecho de modificar o reemplazar estos Términos en cualquier momento.
                            Revisar periódicamente esta página garantiza que usted conozca nuestra postura legal vigente.
                        </p>
                    </section>
                </div>

                <div className="mt-12 pt-8 border-t border-slate-200 text-center flex flex-col items-center gap-6">
                    <a
                        href="https://www.sic.gov.co/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-slate-500 hover:text-[#1f7a4f] transition-colors flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-lg border border-slate-100"
                    >
                        <span>Vigilado por la Superintendencia de Industria y Comercio (SIC)</span>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    </a>

                    <Link
                        href="/"
                        className="inline-flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl py-3 px-6 font-bold shadow-sm transition-all w-fit"
                    >
                        Volver al Inicio
                    </Link>
                </div>
            </div>
        </main>
    );
}
