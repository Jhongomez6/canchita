/**
 * ========================
 * TEAM ADMIN APPLICATIONS API
 * ========================
 *
 * Specification-Driven Development (SDD)
 * Ver: docs/TEAM_ADMIN_APPLICATION_SDD.md
 *
 * Operaciones Firestore para solicitudes de acceso como Team Admin.
 * Collection: `applications/{uid}`  (el UID del aplicante es la clave)
 */

import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    collection,
    getDocs,
    query,
    orderBy,
    where,
    getCountFromServer,
    addDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import type { TeamAdminApplication } from "./domain/teamAdminApplication";
import { buildProfileSnapshot } from "./domain/teamAdminApplication";
import { updateAdminType, updateUserRoles } from "./users";
import type { UserProfile } from "./domain/user";

type ApplicationFormData = Omit<TeamAdminApplication, "uid" | "appliedAt" | "status" | "profileSnapshot" | "reviewedBy" | "reviewedAt" | "rejectionReason">;

/* =========================
   OBTENER MI SOLICITUD
========================= */
export async function getMyApplication(uid: string): Promise<TeamAdminApplication | null> {
    const ref = doc(db, "applications", uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return { uid: snap.id, ...snap.data() } as TeamAdminApplication;
}

/* =========================
   ENVIAR / RE-ENVIAR SOLICITUD
   Sobrescribe el doc si ya existe (para re-aplicar tras un rechazo)
========================= */
export async function submitApplication(
    uid: string,
    formData: ApplicationFormData,
    profile: UserProfile
): Promise<void> {
    const ref = doc(db, "applications", uid);
    const application: TeamAdminApplication = {
        uid,
        appliedAt: new Date().toISOString(),
        status: "pending",
        profileSnapshot: buildProfileSnapshot(profile),
        ...formData,
    };
    await setDoc(ref, application);
}

/* =========================
   LISTAR SOLICITUDES PENDIENTES (super_admin)
========================= */
export async function getPendingApplications(): Promise<TeamAdminApplication[]> {
    const q = query(
        collection(db, "applications"),
        where("status", "==", "pending"),
        orderBy("appliedAt", "asc")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as TeamAdminApplication);
}

/* =========================
   LISTAR TODAS LAS SOLICITUDES (super_admin — historial)
========================= */
export async function getAllApplications(): Promise<TeamAdminApplication[]> {
    const q = query(
        collection(db, "applications"),
        orderBy("appliedAt", "desc")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as TeamAdminApplication);
}

/* =========================
   CONTAR PENDIENTES (para badge del bottom nav)
========================= */
export async function getPendingApplicationsCount(): Promise<number> {
    const q = query(
        collection(db, "applications"),
        where("status", "==", "pending")
    );
    const snap = await getCountFromServer(q);
    return snap.data().count;
}

/* =========================
   APROBAR SOLICITUD (super_admin)
   1. Actualiza el status de la aplicación
   2. Asigna roles ["admin", "player"] y adminType "team_admin"
   3. Envía notificación in-app al usuario
========================= */
export async function approveApplication(
    applicantUid: string,
    reviewerUid: string
): Promise<void> {
    const appRef = doc(db, "applications", applicantUid);

    // 1. Actualizar status de la solicitud
    await updateDoc(appRef, {
        status: "approved",
        reviewedBy: reviewerUid,
        reviewedAt: new Date().toISOString(),
    });

    // 2. Asignar roles y adminType al usuario
    await updateUserRoles(applicantUid, ["admin", "player"]);
    await updateAdminType(applicantUid, "team_admin");

    // 3. Notificación in-app
    const notifRef = collection(db, "notifications", applicantUid, "items");
    await addDoc(notifRef, {
        title: "¡Solicitud aprobada!",
        body: "Ya eres Team Admin en La Canchita. Puedes crear tu primer partido privado.",
        type: "general",
        url: "/new-match",
        read: false,
        createdAt: new Date().toISOString(),
    });
}

/* =========================
   RECHAZAR SOLICITUD (super_admin)
   1. Actualiza el status con el motivo
   2. Envía notificación in-app con el motivo al usuario
========================= */
export async function rejectApplication(
    applicantUid: string,
    reviewerUid: string,
    rejectionReason: string
): Promise<void> {
    const appRef = doc(db, "applications", applicantUid);

    // 1. Actualizar status con motivo
    await updateDoc(appRef, {
        status: "rejected",
        reviewedBy: reviewerUid,
        reviewedAt: new Date().toISOString(),
        rejectionReason,
    });

    // 2. Notificación in-app
    const notifRef = collection(db, "notifications", applicantUid, "items");
    await addDoc(notifRef, {
        title: "Solicitud no aprobada por ahora",
        body: rejectionReason,
        type: "general",
        url: "/profile",
        read: false,
        createdAt: new Date().toISOString(),
    });
}
