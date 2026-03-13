# Feature: Badge en Ícono de la PWA

## 📋 Specification-Driven Development (SDD)

Este documento describe la feature de **badge en el ícono de la PWA**, que muestra un indicador de notificaciones no leídas directamente en el ícono de la app instalada a nivel de sistema operativo (home screen, taskbar, dock).

Se implementa con una estrategia **dual-platform**:
- **Android / Windows / macOS:** Web Badging API (`navigator.setAppBadge`)
- **iOS (16.4+):** Campo `badge` en el payload APNs vía FCM

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo

Que el usuario vea en el ícono de la PWA (pantalla de inicio, taskbar) un indicador de que tiene notificaciones sin leer, sin necesidad de abrir la app.

### Arquitectura Dual-Platform

```
┌────────────────────────────────────────────────────────────┐
│                     PUSH NOTIFICATION                       │
│                  (Cloud Function → FCM)                      │
└──────────────────────────┬─────────────────────────────────┘
                           │
            ┌──────────────┴──────────────┐
            ▼                             ▼
   ┌─────────────────┐          ┌──────────────────┐
   │   Android/Web    │          │      iOS          │
   │   (Badging API)  │          │   (APNs badge)    │
   └────────┬────────┘          └────────┬─────────┘
            │                            │
            ▼                            ▼
   navigator.setAppBadge()      apns.payload.aps.badge
   (client + service worker)    (set by Cloud Function)
```

**Ciclo de vida del badge:**

```
 PUSH LLEGA                    USUARIO ABRE APP
 ─────────                     ────────────────
 SW: setAppBadge() [flag]      Header.tsx: setAppBadge(N)  ← conteo exacto
 CF: apns.badge = 1
                               USUARIO LEE NOTIFICACIONES
                               ──────────────────────────
                               Header.tsx: clearAppBadge() ← unreadCount → 0
                               clearIOSBadge() → CF → apns.badge = 0
```

### Reglas de Negocio

| # | Regla | Implementación |
|---|-------|----------------|
| 1 | Badge numérico exacto cuando la app está abierta | `setAppBadge(unreadCount)` en `useEffect` de `Header.tsx` |
| 2 | Badge se limpia al cerrar el drawer de notificaciones | `onClose` ya pone `unreadCount = 0` → dispara `clearAppBadge()` |
| 3 | Badge de punto en background (push recibido con app cerrada) | `self.navigator.setAppBadge()` en `onBackgroundMessage` del SW |
| 4 | Badge se limpia al tocar una notificación push | `clearAppBadge()` en handler `notificationclick` del SW |
| 5 | iOS recibe badge numérico vía APNs payload | Todos los `sendEachForMulticast` incluyen `apns.payload.aps.badge: 1` |
| 6 | iOS limpia badge al leer notificaciones | Nueva Cloud Function `clearIOSBadge` envía push silencioso con `badge: 0` |
| 7 | Feature silenciosa en plataformas sin soporte | Guard `"setAppBadge" in navigator` + `.catch(() => {})` |
| 8 | No se requieren permisos adicionales | Badging API no requiere permiso; push ya tiene permiso existente |

---

## 2. ARCHIVOS INVOLUCRADOS

| Capa | Archivo | Cambio |
|------|---------|--------|
| UI | `components/Header.tsx` | Agregar `useEffect` para sincronizar `unreadCount` → OS badge; link admin desktop |
| UI | `components/NotificationsDrawer.tsx` | Llamar `clearIOSBadge()` al cerrar drawer |
| Push / SW | `public/firebase-messaging-sw.js` | `setAppBadge()` en background msg; `clearAppBadge()` en notif click |
| Backend | `functions/src/reminders.ts` | Agregar `apns` config a los 6 `sendEachForMulticast`; nueva función `clearIOSBadge` |
| API | `lib/notifications.ts` | Exportar función `clearIOSBadge()` que llama a la Cloud Function |
| Admin | `app/admin/push-test/page.tsx` | Agregar sección de diagnóstico de badge (solo super_admin) |
| Nav | `app/profile/page.tsx` | Agregar sección "Herramientas Admin" al fondo con link a push-test (solo super_admin) |
| Doc | `docs/PWA_BADGE_FEATURE_SDD.md` | Este documento |

---

## 3. ESPECIFICACIÓN TÉCNICA

### 3.1 `components/Header.tsx` — Badging API (Android/Desktop)

Agregar `useEffect` después del existente de `fetchCount`:

```typescript
// Sync unread count → OS app badge (Badging API)
useEffect(() => {
  if ("setAppBadge" in navigator) {
    if (unreadCount > 0) {
      navigator.setAppBadge(unreadCount).catch(() => {});
    } else {
      navigator.clearAppBadge().catch(() => {});
    }
  }
}, [unreadCount]);
```

### 3.2 `public/firebase-messaging-sw.js` — Badge en Background

**En `notificationclick`** (agregar después de `event.notification.close()`):
```js
if ("setAppBadge" in self.navigator) {
  self.navigator.clearAppBadge().catch(() => {});
}
```

**En `onBackgroundMessage`** (agregar al final del handler, fuera del `if`):
```js
if ("setAppBadge" in self.navigator) {
  self.navigator.setAppBadge().catch(() => {});
}
```

### 3.3 `functions/src/reminders.ts` — APNs Badge en Payload

Agregar campo `apns` a los **6 calls** de `sendEachForMulticast`:

```typescript
const response = await admin.messaging().sendEachForMulticast({
  tokens,
  notification: { title, body },
  data: { url: "..." },
  apns: {
    payload: {
      aps: {
        badge: 1,
        sound: "default",
      },
    },
  },
});
```

**Nueva Cloud Function `clearIOSBadge`**:

```typescript
export const clearIOSBadge = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login required");

  const userSnap = await db.collection("users").doc(uid).get();
  const tokens: string[] = userSnap.data()?.fcmTokens ?? [];
  if (tokens.length === 0) return { success: true };

  await admin.messaging().sendEachForMulticast({
    tokens,
    data: { type: "badge_clear" },
    apns: {
      payload: {
        aps: {
          badge: 0,
          "content-available": 1,
        },
      },
    },
  });

  return { success: true };
});
```

### 3.4 `lib/notifications.ts` — Client wrapper

```typescript
export async function clearIOSBadge(): Promise<void> {
  const fn = httpsCallable(functions, "clearIOSBadge");
  await fn();
}
```

### 3.5 `components/NotificationsDrawer.tsx` — Llamar clear al cerrar

En `loadNotifications`, después de `markAllAsRead`:
```typescript
if (hasUnread) {
  markAllAsRead(user.uid).catch(console.error);
  clearIOSBadge().catch(console.error);
}
```

### 3.6 `app/admin/push-test/page.tsx` — Diagnóstico de Badge (super_admin)

Nueva sección con botones:
- **Check API Support**: Muestra soporte de Badging API y modo standalone
- **Set Badge (5)**: Establece badge de prueba con número 5
- **Clear Badge (local)**: Limpia badge vía Badging API
- **Clear iOS Badge (CF)**: Envía push silencioso para limpiar badge iOS

### 3.7 Navegación a `/admin/push-test` desde la PWA

- **Header** (desktop): Link "Push 🧪" junto a los otros admin links
- **Profile** (mobile): Sección "Herramientas Admin" con link a push-test

---

## 4. CRITERIOS DE ACEPTACIÓN

### AC-1: Badge numérico con app abierta (Android/Desktop)

**Given** usuario con PWA instalada en Android o desktop
**And** tiene `N` notificaciones no leídas
**When** abre la app o navega entre páginas
**Then** el ícono de la PWA muestra badge con el número `N`

### AC-2: Badge se limpia al leer notificaciones (Android/Desktop)

**Given** el badge muestra un número en el ícono
**When** abre el drawer de notificaciones y lo cierra
**Then** el badge desaparece del ícono de la PWA

### AC-3: Badge en background (Android/Desktop)

**Given** la app está cerrada o en segundo plano
**When** llega una notificación push
**Then** el ícono de la PWA muestra un badge indicador

### AC-4: Badge en push notification click

**Given** hay badge en el ícono por push en background
**When** el usuario toca la notificación push
**Then** el badge desaparece del ícono

### AC-5: Badge en iOS vía APNs

**Given** usuario con PWA instalada en iOS (16.4+)
**When** recibe una notificación push
**Then** el ícono de la PWA muestra badge `1` en el home screen

### AC-6: Badge se limpia en iOS

**Given** badge visible en ícono de PWA en iOS
**When** el usuario abre las notificaciones en la app
**Then** se envía push silencioso con `badge: 0` y el badge desaparece

### AC-7: Panel de diagnóstico en push-test (super_admin)

**Given** un super_admin accede a `/admin/push-test`
**When** ve la sección "4. App Badge Diagnostics"
**Then** puede:
  - Ver si el navegador soporta Badging API
  - Establecer un badge de prueba (número 5)
  - Limpiar el badge localmente
  - Enviar push silencioso para limpiar badge iOS vía Cloud Function

### AC-8: Navegación a push-test desde la PWA (super_admin)

**Given** un super_admin con la PWA instalada
**When** abre la pagina de perfil en mobile
**Then** ve una sección "Herramientas Admin" con un link a "Push & Badge Diagnostics"
**And** en desktop ve un link "Push 🧪" en el Header

### AC-9: Sin errores en plataformas sin soporte

**Given** el usuario usa un navegador sin soporte de Badging API
**When** llegan notificaciones o se abren/cierran
**Then** no se lanza ningún error JS — la feature se ignora silenciosamente

---

## 5. PLAN DE VERIFICACIÓN

1. **Android Chrome**: Instalar PWA → enviar push desde `/admin/push-test` → verificar badge numérico en ícono
2. **iOS Safari (16.4+)**: Instalar PWA → enviar push → verificar badge `1` en ícono del home screen
3. **Background**: Cerrar app → enviar push → verificar badge de punto (Android) / badge 1 (iOS)
4. **Click en push**: Tocar notificación → verificar que badge desaparece
5. **Leer notificaciones**: Abrir drawer y cerrar → verificar badge limpio en todas las plataformas
6. **Navegador sin soporte**: Abrir en Firefox → verificar sin errores en consola
7. **Admin panel**: Acceder a `/admin/push-test` como super_admin → probar "Check API Support", "Set Badge (5)", "Clear Badge", "Clear iOS Badge (CF)"
