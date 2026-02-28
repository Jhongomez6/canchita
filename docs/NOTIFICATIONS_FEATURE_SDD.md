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
| 1 | Solo Cloud Functions pueden crear notificaciones | Firestore rules: `allow create: if false` |
| 2 | El usuario solo puede leer sus propias notificaciones | Firestore rules: `request.auth.uid == userId` |
| 3 | El usuario puede marcar como leída | `markAsRead()` en `lib/notifications.ts` |
| 4 | In-app SIEMPRE se escribe, push es best-effort | Cloud Function: write primero, push después |
| 5 | Máximo 50 notificaciones visibles | `NOTIFICATIONS_LIMIT` en `lib/notifications.ts` |
| 6 | FCM usa campo `notification` + `data` (URL de click-through) | SW auto-muestra en background; `onMessage` muestra `Notification()` en foreground |

---

## 2. ARCHIVOS INVOLUCRADOS

| Capa | Archivo | Responsabilidad |
|------|---------|----------------|
| Dominio | `lib/domain/notification.ts` | Tipos |
| API | `lib/notifications.ts` | CRUD client |
| UI | `app/notifications/page.tsx` | Lista de notificaciones |
| UI | `components/Header.tsx` | Campana + badge |
| UI | `components/BottomNav.tsx` | Tab Alertas + badge |
| Backend | `functions/src/reminders.ts` | Cloud Functions |
| Push | `lib/firebase-messaging.ts` | Foreground push display |
| Push | `lib/push.ts` | Token registration, manual reminders |
| Push | `public/firebase-messaging-sw.js` | Background push (Service Worker) |
| Rules | `firestore.rules` | Seguridad subcollection |

---

## 3. CRITERIOS DE ACEPTACIÓN

- [x] Campana 🔔 visible en Header con badge de no leídas
- [x] Tab "Alertas" en BottomNav con badge de no leídas
- [x] Página `/notifications` con lista de notificaciones
- [x] Click en notificación marca como leída y navega al URL
- [x] Botón "Marcar todas como leídas"
- [x] Estado vacío con mensaje amigable
- [x] Timestamps relativos ("Hace 5 min", "Hace 2 días")
- [x] Firestore rules protegen acceso por usuario
- [x] Cloud Functions son la única fuente de creación
