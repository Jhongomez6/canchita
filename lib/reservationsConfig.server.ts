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
        // Sin caché: el flag es un gate on/off y debe reflejar el toggle del admin
        // al instante. La landing recibe poco tráfico (QR), así que un read por
        // request a Firestore es despreciable.
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return false; // 404 = doc no existe = apagado
        const data = await res.json();
        return data?.fields?.landingEnabled?.booleanValue === true;
    } catch {
        return false;
    }
}
