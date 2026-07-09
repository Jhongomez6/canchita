# Feature: Vista de Configuración para Location Admins (activar notificaciones push)

## 📋 Specification-Driven Development (SDD)

Los location admins reciben notificaciones de reservas vía `notifyVenueAdmins` (backend ya implementado), pero no tienen forma de **registrar su token FCM** porque el botón "Activar notificaciones" vive en `/profile`, página oculta para ellos. Esta feature agrega una vista de **Configuración** accesible desde la bottom nav donde el location admin puede activar sus notificaciones.

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo

Cerrar la brecha entre backend y frontend: el backend (`functions/src/bookings.ts → notifyVenueAdmins`) ya envía push a los location admins asignados a un venue cuando ocurren eventos de reserva, pero un location admin nunca tiene un `fcmToken` registrado porque su UI no expone el opt-in. Sin token, la notificación se descarta silenciosamente (`sendBookingPush` retorna si `tokens.length === 0`). Resultado: **el dueño de cancha nunca se entera de reservas nuevas, cancelaciones ni aprobaciones pendientes**.

Esta feature entrega una vista `/admin/settings` para location admins con la acción "Activar notificaciones", reutilizando el flujo `enablePushNotifications(uid)` existente, y un ítem de bottom nav para llegar a ella.

### Reglas de Negocio

| # | Regla | Impacto UI |
|---|-------|------------|
| 1 | Solo usuarios con `adminType === "location_admin"` ven el ítem "Configuración" en la bottom nav y pueden acceder a `/admin/settings`. | Ítem de nav condicionado a `isLocationAdminUser`. Guard en la página redirige a `/` si no es location admin. |
| 2 | El location admin **pendiente** (sin `assignedLocationIds`) también puede activar notificaciones — así ya las tiene listas cuando le asignen una sede. | La vista funciona igual en estado pendiente; no depende de tener venues. |
| 3 | Activar notificaciones registra el token FCM y setea `notificationsEnabled: true` en el doc del usuario (comportamiento idéntico al del jugador). | Botón "Activar" → estado "Activas" con check verde. |
| 4 | Si el navegador tiene permisos **bloqueados** (`Notification.permission === "denied"`), no se puede activar desde la app; se muestran instrucciones. | Estado "bloqueado" con guía para desbloquear en ajustes del navegador. |
| 5 | El estado de la notificación refleja la **verdad combinada**: `profile.notificationsEnabled === true` **Y** `Notification.permission === "granted"`. Si el permiso del navegador fue revocado, se muestra como inactivo aunque el flag en Firestore siga `true`. | Deriva `pushState` de ambas fuentes, igual que en `/profile`. |
| 6 | La vista es el contenedor de configuración del location admin (extensible a futuras opciones), pero en v1 solo contiene la fila de Notificaciones y, si aplica, "Instalar App". | Card única, patrón visual idéntico al de `/profile`. |

---

## 2. ESCALABILIDAD

### Volumen esperado

- **Location admins totales:** decenas (crecimiento gradual de sedes aliadas). No es una superficie de alto volumen.
- **Escrituras por activación:** 1 `updateDoc` sobre `users/{uid}` por opt-in. Frecuencia: una vez por dispositivo/navegador del admin. Despreciable.
- **Lecturas:** la vista lee únicamente el `profile` ya presente en `AuthContext` (cero lecturas adicionales de Firestore).

### Índices Firestore requeridos

- **Ninguno nuevo.** La feature no introduce queries. El índice compuesto que consume `notifyVenueAdmins` (`adminType == location_admin` + `assignedLocationIds array-contains`) ya existe y no se toca.

### Paginación

- No aplica — no hay listas.

---

## 3. CONCURRENCIA SEGURA

### Operaciones que requieren `runTransaction()`

- **Ninguna.** El único write es `updateDoc(users/{uid}, { fcmTokens: arrayUnion(token), notificationsEnabled: true, ... })`.
  - `arrayUnion` es idempotente y atómico a nivel de campo en el servidor de Firestore: dos activaciones simultáneas desde dos dispositivos del mismo admin **no se pisan** (cada una agrega su token; unión sin duplicados). No hay estado compartido leído-luego-escrito, por lo que una transacción sería sobre-ingeniería (la regla #6 de CLAUDE.md aplica a *estado compartido leído y modificado*; aquí solo se acumula con `arrayUnion`).

### Race conditions identificadas

- **Escenario:** el admin toca "Activar" dos veces rápido (doble tap). → **Mitigación:** flag local `enablingPush` deshabilita el botón mientras la promesa está pendiente; además `arrayUnion` colapsa el token duplicado. Sin efecto adverso.
- **Escenario:** limpieza de tokens inválidos en backend (`sendBookingPush` hace `arrayRemove` de tokens muertos) ocurre mientras el admin activa uno nuevo. → **Mitigación:** `arrayRemove` y `arrayUnion` operan sobre elementos distintos; Firestore los aplica atómicamente sin conflicto.

---

## 4. SEGURIDAD

### Autenticación y autorización

- **Lectura/escritura del propio `users/{uid}`:** el location admin solo modifica su propio documento (self-write). Ya cubierto por las rules existentes de la colección `users`.
- **Acceso a la ruta `/admin/settings`:** doble control — (a) el ítem de nav solo aparece para location admins; (b) la página monta un guard que redirige a `/` si `!isLocationAdmin(profile)`. El control de UI **no** es un control de seguridad; la seguridad real de datos la dan las rules de `users`.

### Firestore Rules requeridas

**No requiere reglas nuevas.** La escritura es sobre `users/{uid}` por el propio dueño. Debe verificarse que la regla de `update` sobre `users/{userId}` ya permite que el dueño escriba `fcmTokens`, `notificationsEnabled`, `lastNotificationOptInAt`, `lastTokenRefresh`, `lastTokenDevice`, `lastTokenPrefix` — son exactamente los mismos campos que `enablePushNotifications` escribe hoy desde `/profile` para jugadores, así que ya están permitidos. Verificación de la condición existente (no cambia):

```
// firestore.rules — colección users (regla YA existente, se documenta para confirmar cobertura)
match /users/{userId} {
  allow update: if request.auth != null
                && request.auth.uid == userId
                && /* ...campos permitidos al dueño, incluye fcmTokens/notificationsEnabled... */;
}
```

> ⚠️ Acción de verificación (no de cambio): confirmar en `firestore.rules` que el self-update del dueño no excluye estos campos. Si hoy funciona para jugadores en `/profile`, funciona igual para location admins (misma colección, mismo uid propio).

### Validaciones de input

- No hay input de usuario libre. La única "entrada" es el token FCM generado por el SDK de Firebase Messaging (opaco, validado por el propio servicio). No se confía en datos del cliente para autorización.
- `vapidKey` se valida presente antes de pedir token (ya implementado en `enablePushNotifications`).

### Datos sensibles

- `fcmTokens` no debe exponerse en queries públicas ni en snapshots embebidos (ej. `match.players`, `LocationSnapshot`). No se introduce ninguna lectura pública de este campo; permanece confinado a `users/{uid}` bajo rules de dueño/admin.

---

## 5. TOLERANCIA A FALLOS

### Estados de error y fallbacks

| Error | Causa probable | Fallback UI |
|-------|---------------|-------------|
| `Notification.permission === "denied"` | Usuario bloqueó permisos antes | Estado "bloqueado" (ámbar) + texto guía para reactivar en ajustes del navegador. Botón oculto. |
| `enablePushNotifications` retorna `null` (permiso denegado en el prompt) | Usuario tocó "Bloquear" en el prompt | Se detecta `Notification.permission === "denied"` → transición a estado "bloqueado". Sin toast de error (no es un fallo del sistema). |
| `VAPID key` ausente | Env var mal configurada en el deploy | `enablePushNotifications` loguea error y retorna `null`; UI queda en "inactivo". `handleError` ya muestra toast si aplica. |
| Firestore offline / `updateDoc` falla | Sin conexión | `enablePushNotifications` captura con `handleError` → toast con detalle técnico copiable. Estado permanece "inactivo"; el admin puede reintentar. |
| Navegador sin soporte (`"Notification" in window === false`) | WebView antiguo / navegador incompatible | `browserPermission = "unsupported"` → fila muestra mensaje "Tu navegador no soporta notificaciones" sin botón. |

### Retry strategy

- **Reintento manual, no automático.** Un fallo deja el botón "Activar" disponible para reintentar. No hay reintento en background (una activación es una acción explícita del usuario).
- La renovación de token en cada carga (`useTokenRefresh`) ya cubre tokens que expiran con el tiempo — aplica también al location admin una vez que activó por primera vez.

### Degradación elegante

- Si la feature de push falla por completo, la vista `/admin/settings` sigue renderizando (card visible, fila en estado "inactivo"). El resto de la app del location admin (Reservas) no se ve afectada.
- Las notificaciones in-app (`notifications/{uid}/items`, que `notifyVenueAdmins` también crea) siguen funcionando independientemente del push — el admin no queda totalmente a ciegas aunque nunca active push.

---

## 6. UX — FLUJOS DE USUARIO

### Flujo principal (happy path)

1. Location admin abre la app → ve nuevo ítem **⚙️ Configuración** en la bottom nav.
2. Toca el ítem → navega a `/admin/settings`.
3. Ve la card "Notificaciones" en estado **inactivo** con texto "Actívalas para no perderte ninguna reserva".
4. Toca **"Activar"** → aparece prompt nativo del navegador.
5. Acepta → botón muestra spinner → token registrado → fila transiciona a estado **"Activas"** con check verde y texto "Activas — recibirás alertas de reservas".
6. Toast de éxito opcional (o cambio de estado visual como confirmación).

### Flujos alternativos

- **Permiso ya concedido en otra parte:** si el admin ya tenía `notificationsEnabled` + permiso `granted` (poco común, pero posible si fue jugador antes), la fila carga directamente en estado "Activas".
- **Permiso bloqueado:** toca "Activar" pero el navegador tiene "denied" → fila pasa a "bloqueado" con instrucciones; no hay prompt.
- **Pendiente de asignación:** admin sin sedes puede activar igual; verá "Activas" aunque todavía no reciba nada hasta que le asignen una sede.

### Estados de UI

| Estado | Qué muestra |
|--------|-------------|
| Cargando | La vista depende de `profile` de `AuthContext`; mientras `profile === null` muestra un skeleton simple de la card (o el skeleton global de auth ya existente). |
| Inactivo | Ícono `Bell` verde, título "Notificaciones", subtítulo "Actívalas para no perderte ninguna reserva", botón "Activar". |
| Activando | Botón con spinner (`enablingPush`), deshabilitado. |
| Activo | Ícono `Bell`, subtítulo verde "Activas — recibirás alertas de reservas", `CheckCircle2` verde, sin botón. |
| Bloqueado | Subtítulo ámbar "Permisos bloqueados en tu navegador", `AlertTriangle` ámbar, texto guía. |
| No soportado | Subtítulo "Tu navegador no soporta notificaciones", sin botón. |
| Error | Toast vía `handleError` (detalle técnico copiable); estado vuelve a "inactivo". |

### Consideraciones mobile-first

- Touch targets ≥ 44px (botón "Activar" con `px-3 py-2`, consistente con `/profile`).
- Contenido con `pb-24 md:pb-0` para no quedar tapado por la bottom nav (regla #9 CLAUDE.md).
- La vista es mobile-first; en desktop (`md+`) la bottom nav no se muestra, por lo que se debe garantizar acceso alternativo (ver Decisiones de Diseño Clave — el location admin opera casi exclusivamente en mobile).
- Copys en español (regla #14).

---

## 7. UI DESIGN — COMPONENTES Y ANIMACIONES

### Componentes nuevos

- **`app/admin/settings/page.tsx`** → página cliente `"use client"`. Contenedor de configuración del location admin. Props: ninguna (lee `useAuth`). Orquesta el estado de push replicando la lógica de `/profile` (estados `pushEnabled`, `browserPermission`, `enablingPush`, derivación de `pushState`).
- **`components/skeletons/SettingsSkeleton.tsx`** (opcional/ligero) → skeleton de la card mientras carga `profile` (regla #9). Alternativamente reusar el gate de `AuthGuard`.
- **Nuevo `NavItem` en `components/BottomNav.tsx`** → ítem "Configuración" con ícono de engranaje (SVG inline estilo `NavIcon`, coherente con los demás íconos de contorno de la barra). Condicionado a `isLocationAdminUser`.

> La fila de notificaciones **no** se extrae a un componente compartido en v1 para minimizar riesgo de regresión en `/profile`; se replica el markup (la fila es pequeña y estable). Ver Decisiones de Diseño Clave.

### Animaciones (Framer Motion)

- **Transición de estado de la fila** (inactivo → activo): fade/scale sutil del ícono de estado (`CheckCircle2`) al aparecer, `AnimatePresence` con `initial={{ scale: 0.8, opacity: 0 }}` → `animate={{ scale: 1, opacity: 1 }}`, duración ~200ms. Coherente con el lenguaje de micro-interacciones de la app.
- **Pill activo de la bottom nav:** el nuevo ítem participa del `LayoutGroup` existente (`nav-active-pill`), por lo que la píldora verde se anima hacia "Configuración" al navegar — sin trabajo extra.
- **Spinner de "Activando":** el mismo spinner CSS (`animate-spin`) usado en `/profile`.

### Responsive

- **Mobile (`< md`):** bottom nav visible con el ítem "Configuración"; página con padding inferior `pb-24`.
- **Desktop (`md+`):** bottom nav oculta (`md:hidden` en el contenedor). El acceso a `/admin/settings` en desktop se resuelve vía Header o navegación directa (ver Decisiones de Diseño Clave). La página en sí es responsive (`max-w-md mx-auto` para la card, centrada).

---

## 8. ANALYTICS

| Evento | Trigger | Propiedades |
|--------|---------|-------------|
| `push_enabled` | Activación exitosa de notificaciones (reusa `logPushEnabled()` existente). | Se propone extender con `{ role: "location_admin", source: "settings" }` para distinguir del opt-in de jugadores. |
| `settings_viewed` | Location admin abre `/admin/settings`. | `{ role: "location_admin" }` |

> `logPushEnabled()` hoy no recibe props. Para no romper call sites existentes, se propone agregar un parámetro opcional `source?: string` (default `"profile"`), y pasar `"settings"` desde la nueva vista. Alternativa mínima: dejar `logPushEnabled()` como está y no diferenciar la fuente (ver Decisiones de Diseño Clave).

---

## 9. ARQUITECTURA TÉCNICA

### Modelo de datos

- **Sin cambios de modelo.** Se reutilizan los campos ya definidos en `UserProfile` (`lib/domain/user.ts`): `fcmTokens?`, `notificationsEnabled?`, `lastTokenPrefix?`, y los diagnósticos que escribe `enablePushNotifications`.

```typescript
// lib/domain/user.ts — YA existente, no se modifica
interface UserProfile {
  // ...
  notificationsEnabled?: boolean;
  fcmTokens?: string[];
  lastTokenPrefix?: string;
  // ...
}
```

### Capa de dominio (`lib/domain/`)

- **Sin funciones nuevas.** Se reutiliza `isLocationAdmin(profile)` para gating. Opcionalmente se puede añadir un helper de presentación `derivePushState(profile, browserPermission)` si se decide compartir la lógica entre `/profile` y `/admin/settings` (candidato a refactor, ver Decisiones de Diseño Clave).

### Capa de API (`lib/`)

- **Sin funciones nuevas.** Se reutiliza `enablePushNotifications(uid)` de `lib/push.ts` tal cual.
- Analytics: extensión opcional de `logPushEnabled(source?)` en `lib/analytics.ts` + nuevo `logSettingsViewed()`.

### Componentes UI (`app/`)

- **`app/admin/settings/page.tsx`** (nuevo): vista de configuración.
- **`components/BottomNav.tsx`** (modificado): nuevo `NavItem` "Configuración" para location admins.

### Backend (`functions/`)

- **Sin cambios.** `notifyVenueAdmins` y `sendBookingPush` ya envían push a location admins con token. Esta feature solo hace que el token exista.

---

## 10. CRITERIOS DE ACEPTACIÓN

- [ ] Un location admin ve el ítem "Configuración" en la bottom nav; un jugador y un super admin **no** lo ven.
- [ ] Navegar a `/admin/settings` siendo location admin renderiza la vista; siendo jugador/super admin redirige a `/`.
- [ ] Tocar "Activar" con permiso concedido registra el token FCM en `users/{uid}.fcmTokens` y setea `notificationsEnabled: true`.
- [ ] Tras activar, la fila muestra estado "Activas" con check verde sin recargar.
- [ ] Con permisos bloqueados en el navegador, la fila muestra estado "bloqueado" con guía y sin botón.
- [ ] En navegador sin soporte, se muestra mensaje de no-soporte sin botón.
- [ ] Un fallo de red al activar muestra toast de error (detalle copiable) y deja el botón disponible para reintentar.
- [ ] Al crear una reserva en una sede asignada, el location admin con token recibe el push (verificación end-to-end del circuito ya existente en backend).
- [ ] La vista respeta `pb-24 md:pb-0` y no queda tapada por la bottom nav.
- [ ] Estado pendiente (sin sedes) puede activar notificaciones sin error.

---

## 11. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---------|--------|
| `docs/LOCATION_ADMIN_SETTINGS_SDD.md` | Nuevo — este documento |
| `app/admin/settings/page.tsx` | Nuevo — vista de configuración con activación de push |
| `components/BottomNav.tsx` | Modificado — nuevo `NavItem` "Configuración" (solo location admins) |
| `components/skeletons/SettingsSkeleton.tsx` | Nuevo (opcional) — skeleton de carga de la vista |
| `lib/analytics.ts` | Modificado (opcional) — `logPushEnabled(source?)` + `logSettingsViewed()` |
| `lib/push.ts` | Sin cambios — se reutiliza `enablePushNotifications` |
| `lib/domain/user.ts` | Sin cambios — se reutiliza `isLocationAdmin` |
| `functions/src/bookings.ts` | Sin cambios — `notifyVenueAdmins` ya envía push |
| `firestore.rules` | Sin cambios — solo verificar cobertura del self-update de `users` |

---

## ⚠️ Decisiones de Diseño Clave — RESUELTAS

1. **Cero cambios de backend y de modelo de datos.** El circuito de envío (`notifyVenueAdmins → sendBookingPush`) ya existe y ya contempla location admins. Esta feature es puramente frontend: darle al admin la forma de registrar su token. → ✅ **Alcance v1: solo notificaciones** (sin toggles por tipo). Se deja la vista extensible para futuras opciones.

2. **Replicar la fila de notificaciones en vez de extraer un componente compartido.** → ✅ **Replicar el markup** en `/admin/settings` (enfoque seguro, cero riesgo de regresión en `/profile`).

3. **Acceso en desktop.** → ✅ **Sí, también desktop.** Además del ítem en la bottom nav (mobile), se agrega un enlace "Configuración ⚙️" en el `Header` (`hidden md:block`) para location admins.

4. **Nombre de la ruta.** → ✅ **`/admin/settings`** (deja explícito que es superficie de administración, consistente con `/admin/*`).

5. **Granularidad de analytics.** → ✅ **Sin cambios de analytics en v1.** Se reutiliza `logPushEnabled()` existente tal cual al activar; no se agregan eventos nuevos ni props para mantener el alcance mínimo.
