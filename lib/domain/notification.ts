/**
 * ========================
 * NOTIFICATION DOMAIN MODEL
 * ========================
 *
 * Specification-Driven Development (SDD)
 *
 * Modelo de dominio para notificaciones in-app.
 *
 * ESPECIFICACIÓN:
 * - Cada usuario tiene una subcolección `notifications/{uid}/items`
 * - Las notificaciones son creadas SOLO por Cloud Functions (nunca por el cliente)
 * - El cliente puede leer sus notificaciones y marcarlas como leídas
 * - Tipos: feedback_resolved, match_reminder, mvp, general
 */

export type NotificationType = 'feedback_resolved' | 'match_reminder' | 'mvp' | 'general';

export interface AppNotification {
    id?: string;
    title: string;
    body: string;
    type: NotificationType;
    url?: string;        // deeplink (e.g. "/join/matchId")
    read: boolean;
    createdAt: string;   // ISO string
}
