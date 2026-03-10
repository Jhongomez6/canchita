import Link from "next/link";

export default function PrivacyPage() {
    return (
        <main className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
            <div className="max-w-3xl mx-auto bg-white p-8 sm:p-12 rounded-3xl shadow-lg">
                <div className="mb-10 text-center border-b border-slate-200 pb-8">
                    <div className="text-5xl mb-4">🔐</div>
                    <h1 className="text-3xl font-black text-slate-900 mb-2">Política de Privacidad</h1>
                    <p className="text-slate-500 font-medium">Última actualización: Marzo 2026</p>
                </div>

                <div className="space-y-8 text-slate-700 leading-relaxed text-base">
                    <section>
                        <h2 className="text-xl font-bold text-[#1f7a4f] mb-3">1. Compromiso de Privacidad y Marco Legal</h2>
                        <p>
                            En <strong>La Canchita</strong>, respetamos su privacidad y protegemos su información
                            personal. Nuestra política de tratamiento de datos está diseñada y estructurada en estricto cumplimiento y observancia de la normativa de Hábeas Data vigente en Colombia, específicamente la
                            <strong> Ley Estatutaria 1581 de 2012</strong> (Protección de Datos Personales) y el Decreto Reglamentario 1377 de 2013.
                        </p>

                        <h3 className="text-lg font-semibold text-slate-800 mt-6 mb-2">1.1 Responsable del Tratamiento y Canal PQR</h3>
                        <p>
                            En cumplimiento de la normativa vigente, se informa que el responsable de esta plataforma es
                            <strong> Jhon Eduar Tobar Gomez.</strong>, identificado con
                            <strong> CC 1.144.195.090</strong>, con domicilio en la ciudad de <strong>Cali, Colombia</strong>.
                            Para el ejercicio de sus derechos (Petición, Queja, Reclamo o Revocatoria), puede contactarnos al correo:
                            <a href="mailto:soporte@lacanchita.app" className="text-[#1f7a4f] font-bold hover:underline ml-1">soporte@lacanchita.app</a>.
                            Nos comprometemos a dar respuesta a su solicitud en un plazo máximo de quince (15) días hábiles.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-[#1f7a4f] mb-3">2. Recolección de la Información</h2>
                        <p>
                            Al crear su cuenta a través del servicio de autenticación de Google (Google Auth), o al utilizar la aplicación, recopilamos los siguientes datos:
                        </p>
                        <ul className="list-disc pl-6 mt-3 space-y-2 text-slate-600">
                            <li><strong>Datos de Integración:</strong> Nombre completo, correo electrónico y fotografía de perfil pública provistos por Google. <span className="block text-xs mt-1 italic text-slate-500">(Nota: La fotografía facial es un dato biométrico sensible; su vinculación y visualización en la plataforma es estrictamente opcional y gestionada desde su cuenta de Google).</span></li>
                            <li><strong>Datos Personales y Deportivos:</strong> Su edad, sexo, nivel de juego autopercibido (1 al 10), pie dominante y posiciones en la cancha.</li>
                            <li><strong>Datos de Contacto (Sensibles):</strong> Su número de teléfono personal (WhatsApp), requerido estrictamente para confirmar asistencias logísticas.</li>
                            <li><strong>Datos Técnicos:</strong> Identificadores de dispositivo y tokens push para enviarle alertas sobre sus partidos.</li>
                            <li><strong>Datos de Salud (Declaración de Aptitud):</strong> La Canchita <strong className="text-red-600">NO</strong> solicita, recolecta ni almacena historias clínicas, diagnósticos ni datos médicos catalogados como sensibles. La plataforma únicamente registra su declaración personal de nivel y condición física con fines logísticos, asumiendo bajo los Términos de Servicio su aptitud para la práctica deportiva.</li>
                        </ul>

                        <h3 className="text-lg font-semibold text-slate-800 mt-6 mb-2">2.1 Cookies y Almacenamiento Local</h3>
                        <p>
                            La Canchita utiliza almacenamiento local (Local Storage) y cookies técnicas de Google Firebase estrictamente necesarias para mantener la sesión del usuario intacta y garantizar la seguridad de la cuenta. <strong>No utilizamos cookies de rastreo publicitario de terceros.</strong>
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-[#1f7a4f] mb-3">3. Uso y Tratamiento de sus Datos</h2>
                        <p>La información recolectada se procesa exclusivamente con fines logísticos, técnicos y de comunidad interna:</p>
                        <ul className="list-disc pl-6 mt-3 text-slate-600 space-y-2">
                            <li>
                                Su <strong>Nombre, Fotografía, Sexo, Edad y Nivel Técnico</strong> son <span className="font-semibold text-slate-800">Públicos</span> para
                                otros jugadores dentro de los confines de los partidos organizados, con el fin de nivelar
                                y asignar equipos con el algoritmo (Balanceo por IA) y prever la alineación táctica de manera justa.
                            </li>
                            <li>
                                Su <strong>Número de teléfono (Contacto WhatsApp)</strong> es considerado un dato de circulación restringida.
                                Únicamente será visible para usted y para los <span className="text-[#1f7a4f] font-bold">Administradores Generales o Creadores de Partido</span> que
                                necesiten contactarlo por eventualidades logísticas urgentes de coordinación deportiva (cambios de sede, cupos limitados urgentes, emergencias paramédicas o confirmación manual). Ningún otro jugador en la aplicación podrá ver este dato.
                            </li>
                        </ul>

                        <h3 className="text-lg font-semibold text-slate-800 mt-6 mb-2">3.1 Decisiones Automatizadas y Perfilamiento</h3>
                        <p>
                            La Canchita utiliza algoritmos para el balanceo de equipos basados en su rendimiento y estadísticas (ganados, perdidos, nivel). Usted tiene derecho a conocer los criterios de esta clasificación y a solicitar una revisión humana de cualquier decisión automatizada que afecte su perfil o experiencia en el juego, escribiéndonos a nuestro canal de PQR.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-[#1f7a4f] mb-3">4. Derechos del Titular (Habeas Data)</h2>
                        <p>
                            Conforme a la Constitución (Art. 15) y a la Ley 1581 de 2012, usted como titular de sus datos goza de los siguientes derechos inalienables frente a La Canchita:
                        </p>
                        <ul className="list-disc pl-6 mt-3 text-slate-600 space-y-2">
                            <li>
                                Conocer, actualizar y rectificar gratuitamente su información en nuestras bases de datos en cualquier momento desde su pestaña de perfil.
                                <span className="block text-xs mt-1 italic text-slate-500">
                                    (Nota: La rectificación de <strong>Edad</strong> y <strong>Sexo</strong> está sujeta a validación administrativa para garantizar la integridad de las categorías deportivas y el balanceo de equipos).
                                </span>
                            </li>
                            <li>Revocar completamente su autorización de uso. Si lo hace, la aplicación provee un botón de <strong className="text-red-600">Eliminar Cuenta</strong> dentro de su perfil que desencadena la supresión instantánea o anonimización de su historial en nuestra base de datos (Google Firebase).</li>
                            <li>
                                Solicitar prueba de la autorización que nos fue otorgada electrónicamente al momento del Login inicial.
                                <span className="block text-xs mt-1 italic text-slate-500">
                                    (Nota: El sistema registra automáticamente la fecha, hora y versión de los términos aceptados al crear su cuenta).
                                </span>
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-[#1f7a4f] mb-3">5. Seguridad de la Información y Terceros</h2>
                        <p className="mb-4">
                            &quot;La Canchita&quot; se abstendrá de vender, arrendar, publicar gratuitamente o distribuir a bases de telemercadeo comerciales
                            la información contenida en nuestros servidores. Nuestra base de datos utiliza Google Firebase, asegurando encriptación y medidas de seguridad estandarizadas corporativamente.
                        </p>

                        <h3 className="text-lg font-semibold text-slate-800 mb-2">5.1 Alojamiento y Transferencia Internacional</h3>
                        <p>
                            Al aceptar esta política, usted autoriza expresamente que sus datos sean almacenados y procesados en servidores de terceros (Google Firebase) ubicados fuera del territorio colombiano (principalmente en Estados Unidos). La Canchita garantiza que dichos proveedores cuentan con niveles adecuados de protección de datos según los estándares internacionales.
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
