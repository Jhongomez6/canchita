/**
 * Lectura SERVER-ONLY del flag de la landing de reservas (`config/reservations`).
 * Usa la REST API de Firestore para no importar el SDK cliente en el server
 * component de `/reservar`. El doc es de lectura pública (ver firestore.rules),
 * así que basta la API key. Default APAGADO ante cualquier fallo o doc ausente.
 *
 * Ref: docs/RESERVAS_LANDING_QR_SDD.md
 */
export async function isReservarLandingEnabledServer(): Promise<boolean> {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    if (!projectId || !apiKey) return false;

    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/config/reservations?key=${apiKey}`;
    try {
        // revalidate 15s: el toggle del admin se refleja casi al instante sin
        // pegarle a Firestore en cada request (la landing recibe tráfico de QR).
        const res = await fetch(url, { next: { revalidate: 15 } });
        if (!res.ok) return false; // 404 = doc no existe = apagado
        const data = await res.json();
        return data?.fields?.landingEnabled?.booleanValue === true;
    } catch {
        return false;
    }
}
