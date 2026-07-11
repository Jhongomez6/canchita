/**
 * ========================
 * LANDING DE RESERVAS — DOMINIO
 * ========================
 *
 * Specification-Driven Development (SDD)
 * Ref: docs/RESERVAS_LANDING_QR_SDD.md
 *
 * Helpers puros para la landing pública de reservas (`/reservar?sede=<venueId>`).
 * Sin Firebase, sin React. Su rol clave es SANITIZAR el parámetro `sede` para
 * prevenir open-redirect / path injection al construir el `returnTo` post-login.
 */

/** Formato válido de un venueId (mismos chars que ids de Firestore que usamos). */
const VENUE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Sanitiza el query param `sede` de la landing. Devuelve el venueId si es válido,
 * o `null` si falta / no es string / no matchea el formato. Esto evita que un valor
 * malicioso (ej. `//evil.com`, `..%2f`) termine inyectado en el `returnTo`.
 */
export function sanitizeVenueIdParam(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    return VENUE_ID_RE.test(trimmed) ? trimmed : null;
}

/**
 * Construye el `returnTo` (ruta relativa, ya URL-encodeable por el llamador) al que
 * debe volver el usuario tras el login:
 *  - con sede válida ⇒ la reserva de esa sede (`/venues/<id>`)
 *  - sin sede        ⇒ el listado de sedes (`/venues`)
 * Siempre relativo y hardcodeado (nunca concatena texto libre del usuario).
 */
export function buildReservarReturnTo(venueId: string | null): string {
    return venueId ? `/venues/${venueId}` : "/venues";
}

/**
 * Construye el href del CTA de la landing: pasa SIEMPRE por el login (`/`) con el
 * `returnTo` codificado, para reutilizar el flujo de auth existente (`LandingPage`).
 */
export function buildReservarCTAHref(venueId: string | null): string {
    const returnTo = buildReservarReturnTo(venueId);
    return `/?returnTo=${encodeURIComponent(returnTo)}`;
}
