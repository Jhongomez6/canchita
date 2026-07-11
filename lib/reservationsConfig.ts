/**
 * ========================
 * CONFIG GLOBAL — LANDING DE RESERVAS
 * ========================
 *
 * Ref: docs/RESERVAS_LANDING_QR_SDD.md
 *
 * Flag global (Firestore `config/reservations`) que el super admin prende/apaga
 * desde el panel, sin redeploy. Controla la ruta pública `/reservar` y las
 * secciones de reservas en la landing principal.
 *
 * Lectura pública (el doc solo expone un booleano). Escritura: solo super admin
 * (validado por firestore.rules). El default —doc ausente o ilegible— es APAGADO.
 */

import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

export interface ReservationsConfig {
    landingEnabled: boolean;
}

const CONFIG_REF = () => doc(db, "config", "reservations");

/** Lee la config. Si el doc no existe, la landing está apagada. */
export async function getReservationsConfig(): Promise<ReservationsConfig> {
    try {
        const snap = await getDoc(CONFIG_REF());
        return { landingEnabled: snap.exists() && snap.data().landingEnabled === true };
    } catch {
        return { landingEnabled: false };
    }
}

/** Suscripción en vivo a la config (para que el toggle admin refleje al instante). */
export function subscribeToReservationsConfig(
    cb: (config: ReservationsConfig) => void,
): () => void {
    return onSnapshot(
        CONFIG_REF(),
        (snap) => cb({ landingEnabled: snap.exists() && snap.data().landingEnabled === true }),
        () => cb({ landingEnabled: false }),
    );
}

/** Prende/apaga la landing de reservas (solo super admin por rules). */
export async function setReservationsLandingEnabled(enabled: boolean): Promise<void> {
    await setDoc(CONFIG_REF(), { landingEnabled: enabled }, { merge: true });
}
