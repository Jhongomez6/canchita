/**
 * ========================
 * NOTIFICATIONS API
 * ========================
 *
 * Specification-Driven Development (SDD)
 *
 * Operaciones de Firestore para notificaciones in-app del usuario.
 * Las notificaciones viven en `notifications/{uid}/items`.
 * Solo Cloud Functions pueden crear notificaciones.
 * El cliente puede leer y marcar como leídas.
 */

import {
    collection,
    query,
    orderBy,
    getDocs,
    doc,
    updateDoc,
    where,
    limit,
    getCountFromServer,
} from "firebase/firestore";
import { db } from "./firebase";
import type { AppNotification } from "./domain/notification";

const NOTIFICATIONS_LIMIT = 50;

/* =========================
   OBTENER NOTIFICACIONES
========================= */
export async function getMyNotifications(uid: string): Promise<AppNotification[]> {
    const itemsRef = collection(db, "notifications", uid, "items");
    const q = query(
        itemsRef,
        orderBy("createdAt", "desc"),
        limit(NOTIFICATIONS_LIMIT)
    );

    const snapshot = await getDocs(q);

    return snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<AppNotification, "id">),
    }));
}

/* =========================
   CONTAR NO LEÍDAS
========================= */
export async function getUnreadCount(uid: string): Promise<number> {
    const itemsRef = collection(db, "notifications", uid, "items");
    const q = query(itemsRef, where("read", "==", false));
    const snapshot = await getCountFromServer(q);
    return snapshot.data().count;
}

/* =========================
   MARCAR COMO LEÍDA
========================= */
export async function markAsRead(uid: string, notificationId: string): Promise<void> {
    const ref = doc(db, "notifications", uid, "items", notificationId);
    await updateDoc(ref, { read: true });
}

/* =========================
   MARCAR TODAS COMO LEÍDAS
========================= */
export async function markAllAsRead(uid: string): Promise<void> {
    const itemsRef = collection(db, "notifications", uid, "items");
    const q = query(itemsRef, where("read", "==", false));
    const snapshot = await getDocs(q);

    const promises = snapshot.docs.map((d) =>
        updateDoc(d.ref, { read: true })
    );

    await Promise.all(promises);
}
