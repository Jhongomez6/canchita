# Feature: Sistema de Notificaciones In-App

## 📋 Specification-Driven Development (SDD)

Este documento describe el sistema de notificaciones internas de La Canchita, que funciona como **fallback** a las notificaciones push.

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo
Garantizar que cada usuario reciba sus notificaciones independientemente de si activó las notificaciones push del navegador.

### Arquitectura Dual-Channel
```
┌──────────────────────────────┐
│      Cloud Function          │
│   (trigger de notificación)  │
└──────────┬───────────────────┘
           │
     ┌─────┴─────┐
     │           │
     ▼           ▼
 ┌────────┐  ┌────────┐
 │ In-App │  │  Push  │
 │(ALWAYS)│  │(BEST   │
 │        │  │EFFORT) │
 └────────┘  └────────┘
```

### Entidad: AppNotification

```typescript
interface AppNotification {
    id?: string;
    title: string;
    body: string;
    type: 'feedback_resolved' | 'match_reminder' | 'mvp' | 'general';
    url?: string;       // deeplink para navegación
    read: boolean;
    createdAt: string;  // ISO string
    expireAt?: Timestamp;  // Firestore Timestamp — TTL policy requires native Timestamp type
}
```

### Database Schema

Colección: `notifications/{userId}/items/{notifId}`

```typescript
{
    "title": "string",
    "body": "string",
    "type": "feedback_resolved" | "match_reminder" | "mvp" | "general",
    "url": "string (optional)",
    "read": "boolean",
    "createdAt": "ISOString"
}
```

### Reglas de Negocio

| # | Regla | Implementación |
|---|-------|----------------|
| 1 | Cloud Functions o el super_admin (para notificaciones de aplicación) pueden crear notificaciones | Firestore rules: `allow create: if request.auth != null && isSuperAdmin()` |
| 2 | El usuario solo puede leer sus propias notificaciones | Firestore rules: `request.auth.uid == userId` |
| 3 | El usuario puede marcar como leída | `markAsRead()` en `lib/notifications.ts` |
| 4 | In-app SIEMPRE se escribe, push es best-effort | Cloud Function: write primero, push después (feedback resolved es SOLO in-app) |
| 5 | Máximo 50 notificaciones visibles | `NOTIFICATIONS_LIMIT` en `lib/notifications.ts` |
| 6 | FCM usa campo `notification` + `data` (URL de click-through) + `webpush` | SW explícitamente muestra notificación en background para data-only msgs; `onMessage` muestra en foreground |
| 7 | Service Worker SDK debe coincidir con versión del cliente | SW compat SDK v12.8.0, cliente firebase v12.8.0. SW version = `?v=4` |
| 8 | Registro de SW centralizado (singleton) | `getSwRegistration()` en `firebase-messaging.ts`, reusado por `push.ts` |
| 9 | Token cleanup solo para errores permanentes | Solo `registration-token-not-registered`, `invalid-registration-token`, `invalid-argument` |
| 10 | **Auto-refresh de tokens FCM** | `useTokenRefresh` hook en `lib/hooks/useTokenRefresh.ts` — se ejecuta en cada mount del `AuthContext` cuando el usuario tiene push habilitado. Compara token actual vs almacenado, actualiza si cambió |
| 11 | **Push envío resiliente** | `safeSendPush()` helper en `functions/src/reminders.ts` — try/catch + token cleanup + logging estructurado. Push NUNCA crashea la Cloud Function |
| 12 | **Manifest incluye `gcm_sender_id`** | `public/manifest.json` tiene `"gcm_sender_id": "103953800507"` (valor fijo requerido por FCM web) |
| 13 | **Estado de push en perfil: 3 estados** | Activas (granted + enabled), Bloqueadas (denied + enabled), Inactivas (no enabled) |
| 14 | **Idempotencia en recordatorio manual** | `sendManualReminder()` usa `remindersSent.manual` (timestamp ISO) como debounce de 5 minutos para prevenir envíos duplicados |


---

## 2. ARCHIVOS INVOLUCRADOS

| Capa | Archivo | Responsabilidad |
|------|---------|----------------|
| Dominio | `lib/domain/notification.ts` | Tipos |
| Dominio | `lib/domain/user.ts` | `UserProfile` incluye `lastTokenPrefix`, `fcmTokens`, `notificationsEnabled` |
| API | `lib/notifications.ts` | CRUD client |
| UI | `components/NotificationsDrawer.tsx` | UI emergente (Drawer) para lista de notificaciones |
| UI | `components/skeletons/NotificationsSkeleton.tsx` | Skeleton exacto de carga |
| UI | `components/Header.tsx` | Campana + botón para abrir Drawer |
| Backend | `functions/src/reminders.ts` | Cloud Functions (`safeSendPush`, `cleanupInvalidTokens`, batch reads) |
| Push | `lib/firebase-messaging.ts` | Foreground push display, SW registration singleton (v4) |
| Push | `lib/push.ts` | Token registration (primera vez), manual reminders |
| Push | `lib/hooks/useTokenRefresh.ts` | **Auto-refresh de tokens FCM** en cada carga de app |
| Push | `public/firebase-messaging-sw.js` | Background push (Service Worker) |
| Push | `public/manifest.json` | `gcm_sender_id` para FCM web |
| Rules | `firestore.rules` | Seguridad subcollection |

---

## 3. CRITERIOS DE ACEPTACIÓN

- [x] Campana 🔔 visible en Header global con badge de no leídas
- [x] Componente `NotificationsDrawer` con lista emergente de notificaciones
- [x] Click en notificación marca como leída, cierra el drawer y navega al URL
- [x] Auto-marcar como leídas al abrir el drawer
- [x] Drawer soporta gesto de arrastrar para cerrar (drag-to-close) y diseño responsive
- [x] Texto de notificación visible completo sin truncamiento visual
- [x] Estado vacío con mensaje amigable
- [x] Timestamps relativos ("Hace 5 min", "Hace 2 días")
- [x] Firestore rules protegen acceso por usuario
- [x] Cloud Functions y super_admins son la única fuente de creación
- [x] Cloud Functions incluyen logging detallado de errores FCM para diagnóstico
- [x] URLs de click-through actualizadas (sin apuntar a rutas eliminadas)
- [x] Auto-refresh de tokens FCM previene death spiral por token rotation
- [x] `safeSendPush` helper centraliza envío, try/catch, cleanup y logging
- [x] Batch reads de Firestore en Cloud Functions (1 round-trip vs N)
- [x] Payloads incluyen `webpush` config para Chrome/Edge/Firefox
- [x] `manifest.json` incluye `gcm_sender_id` requerido por FCM
- [x] Perfil muestra 3 estados de push (activas / bloqueadas / inactivas)
- [x] Home page muestra toast de error cuando push falla
