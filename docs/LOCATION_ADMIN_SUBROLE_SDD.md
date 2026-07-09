# Feature: Sub-rol de Location Admin (Owner vs Staff)

## 📋 Specification-Driven Development (SDD)

Permitir que un dueño de cancha (`owner`) delegue la operación diaria a trabajadores (`staff`) con capacidades reducidas, sin darles acceso a analítica ni a la navegación histórica de reservas.

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo
Hoy `location_admin` es un tier plano: cualquiera con ese tier ve todo lo que el panel de sede permite a un location admin. El dueño de la cancha necesita dar acceso operativo a sus empleados (recepcionistas, encargados de turno) **sin** exponer métricas de negocio ni permitir hurgar en reservas de días pasados. Se introduce un **sub-rol global** dentro de `location_admin`: `owner` (dueño, capacidades completas) y `staff` (trabajador, capacidades reducidas).

Decisión de alcance ya tomada con el usuario:
- El sub-rol es **global por persona** (no por sede). Si una persona es `staff`, es `staff` en todas sus `assignedLocationIds`.
- Se mantiene `isLocationAdmin()` devolviendo `true` para ambos. Solo se agregan gates nuevos para lo restringido. Esto evita tocar los ~decenas de call sites que ya asumen "location admin = puede operar la sede".

### Reglas de Negocio
| # | Regla | Impacto UI |
|---|-------|------------|
| 1 | `locationAdminRole` es `"owner" \| "staff"`; **default `"owner"`** cuando el campo está ausente (retrocompatibilidad: todo location admin existente pasa a ser owner). | Ningún admin actual pierde acceso al desplegar. |
| 2 | Solo `super_admin` puede asignar/cambiar `locationAdminRole` (igual que `adminType` y `assignedLocationIds`). | Selector nuevo en `/admin/users` visible solo a super admin. |
| 3 | El campo solo es relevante si `adminType === "location_admin"`. En `team_admin`/`super_admin` se ignora. | El selector solo aparece cuando el tier es `location_admin`. |
| 4 | **Staff NO ve el tab "Analítica"** del panel de sede. Owner (con flag `venueAnalyticsEnabled`) y super_admin sí. | `visibleTabs` excluye `analytics` para staff. |
| 5 | **Staff en el tab "Reservas" solo opera desde el día anterior al actual en adelante.** La fecha mínima navegable es **ayer** (hoy − 1 día, en zona `America/Bogota`). No puede seleccionar ni navegar más atrás de ayer, ni en la vista "Por hora" (`AdminSlotPicker`) ni en "Calendario" (`AdminBookingCalendar`). El margen de un día cubre correcciones/cierres de la jornada anterior. | Carruseles y navegación de mes acotados; días anteriores a ayer deshabilitados. |
| 6 | Staff conserva el resto de capacidades operativas del location admin: ver pendientes, confirmar asistencia, crear/cancelar reservas manuales (de ayer en adelante), balancear, registrar pagos del día. | Tabs `bookings`, `pending`, `balance` siguen visibles. |
| 7 | Owner conserva exactamente las capacidades actuales del location admin. | Sin cambios visibles para owners. |
| 8 | El tab **"Balance"** (ingresos del día por método de pago) queda **visible para staff** — decisión confirmada. El staff necesita cuadrar caja del día. | Sin gate sobre `balance`. |

---

## 2. ESCALABILIDAD

### Volumen esperado
- Universo pequeño y acotado: `location_admin` es un rol de operación, no de usuario final. Estimado **< 100 location admins** en total a mediano plazo, con **1–5 staff por sede**.
- El campo `locationAdminRole` es un string en el doc `users/{uid}` ya existente → **cero colecciones nuevas, cero documentos nuevos**.

### Índices Firestore requeridos
- **Ninguno.** No se agregan queries nuevas. `locationAdminRole` se lee del perfil ya cargado en `AuthContext` (`getUserProfile`) — no se filtra por él en ninguna query de colección.

### Paginación
- No aplica. No hay listas nuevas. La lista de admins en `/admin/users` ya existe y no cambia su estrategia de carga.

---

## 3. CONCURRENCIA SEGURA

### Operaciones que requieren `runTransaction()`
- **Ninguna nueva.** Setear `locationAdminRole` es una escritura de un solo campo sobre `users/{uid}` hecha exclusivamente por un super_admin desde `/admin/users`. No es estado compartido concurrente (no hay dos actores compitiendo por el mismo campo simultáneamente en el flujo normal). Se usa `updateDoc` puntual, igual que `updateAdminType`.

### Race conditions identificadas
| Escenario | Riesgo | Mitigación |
|-----------|--------|------------|
| Super admin cambia `locationAdminRole` mientras el staff tiene el panel abierto | El staff podría estar viendo tabs que ya no le corresponden hasta recargar | El perfil se re-lee en cada carga de app y `AuthContext` es la fuente. Los gates de UI son "defensa en profundidad", no un candado de datos. Aceptable: el cambio de rol es raro y administrativo. |
| Se degrada a staff a alguien que estaba creando una reserva de un día pasado | La reserva ya iniciada podría completarse | Las reservas manuales pasan por las reglas/validaciones existentes; el gate de fecha es preventivo en UI. No hay corrupción de datos porque crear una reserva pasada no rompe invariantes del sistema. |

---

## 4. SEGURIDAD

### Autenticación y autorización
- **Escritura de `locationAdminRole`:** solo `super_admin` (server-enforced por Firestore Rules).
- **Lectura:** cualquier autenticado ya puede leer perfiles (`allow read: if request.auth != null`). `locationAdminRole` no es dato sensible (no es PII); vive junto a `roles`/`adminType` que ya son legibles.

### Firestore Rules requeridas
Agregar `locationAdminRole` a la lista de claves protegidas en el `allow update` de `match /users/{userId}` (dos ocurrencias: rama "propio usuario" y rama "isAdmin()"), de modo que **solo super_admin** pueda modificarlo. Diff sobre [firestore.rules](../firestore.rules):

```
// Rama propio usuario (línea ~77-83): agregar 'locationAdminRole' a la lista bloqueada
&& (!request.resource.data.diff(resource.data).affectedKeys().hasAny([
  'role', 'roles', 'adminType', 'assignedLocationIds', 'locationAdminRole',
  'kudosSummary', '_reportsSummary',
  'xp', 'xpLevel', 'xpTier', 'xpLastEvent', 'achievements',
  'firstMatchAt', 'earlyConfirmCount', 'reviewCount', 'perfectMonths',
  'xpEnabled', 'worldCupEnabled'
]))

// Rama isAdmin() (línea ~88-94): mismo agregado, con el escape "|| isSuperAdmin()"
&& (!request.resource.data.diff(resource.data).affectedKeys().hasAny([
  'role', 'roles', 'adminType', 'assignedLocationIds', 'locationAdminRole',
  'kudosSummary', '_reportsSummary',
  'xp', 'xpLevel', 'xpTier', 'xpLastEvent', 'achievements',
  'firstMatchAt', 'earlyConfirmCount', 'reviewCount', 'perfectMonths',
  'xpEnabled', 'worldCupEnabled'
]) || isSuperAdmin())
```

Con esto: un location admin (owner o staff) que intente auto-promoverse editando su propio doc es **rechazado por reglas**; solo super_admin puede setear el campo.

### Validaciones de input
- `locationAdminRole` solo acepta `"owner" | "staff"` (union type en TS). En `updateLocationAdminRole()` no se aceptan otros valores.
- Al degradar/eliminar el rol admin (`revokeAdminRole`), limpiar también `locationAdminRole` con `deleteField()` para no dejar el campo huérfano.

### Datos sensibles
- **Nota honesta de límite de seguridad:** la restricción de Analítica y de fechas pasadas es **UI-level (autorización de presentación), no un límite de secreto de datos.** Las reservas (`bookings`) de una sede ya son legibles por cualquier location admin asignado según las reglas actuales. Un staff con conocimiento técnico podría leer datos históricos vía SDK. Si se requiere que el staff **nunca** pueda leer analítica/histórico a nivel de datos, sería un cambio mayor de Firestore Rules (particionar lectura de `bookings` por rol) y queda **fuera de este alcance**. Para el caso de negocio (evitar que el trabajador *vea en la app* métricas y navegue el pasado) el gate de UI es suficiente. Confirmar que este nivel es aceptable.

---

## 5. TOLERANCIA A FALLOS

### Estados de error y fallbacks
| Error | Causa probable | Fallback UI |
|-------|---------------|-------------|
| `locationAdminRole` ausente/undefined | Perfil viejo pre-feature | Se trata como `owner` (default). Sin degradación. |
| Perfil no carga (Firestore offline) | Sin red | El panel ya maneja loading/error con `loadData` retry; sin rol resuelto no se renderizan tabs restringidas hasta tener perfil. Fail-closed razonable. |
| Update de rol rechazado por reglas (no super admin) | Actor sin permiso | `handleError()` muestra toast con detalle técnico copiable; el `<select>` revierte al valor previo (estado optimista revertido). |
| Staff deep-linkea `?tab=analytics` por URL | Link viejo / manipulación | `visibleTabs` no incluye `analytics` para staff → `initialTab` cae al default; el guard de `activeTab` no renderiza el bloque. |
| Staff deep-linkea a una reserva pasada | Notificación push antigua | El componente de reservas fuerza `selectedDate >= minDate` (ayer); si el deep-link trae fecha anterior, se hace clamp a `minDate`. |

### Retry strategy
- El update de rol es idempotente; el usuario puede reintentar tras un toast de error. No hay retry automático (acción administrativa manual).

### Degradación elegante
- Si el rol no puede resolverse, se aplica el **default más restrictivo coherente**: se muestra el panel operativo (bookings/pending/balance) pero se ocultan analítica hasta confirmar owner. En la práctica, como el default de campo ausente es `owner`, esto solo afecta el caso de perfil totalmente no cargado (que ya bloquea el render por loading).

---

## 6. UX — FLUJOS DE USUARIO

### Flujo principal A — Super admin asigna un staff (happy path)
1. Super admin entra a `/admin/users` → busca al usuario → le da rol **admin** y tier **Location Admin**.
2. Aparece el selector nuevo **"Sub-rol de sede"** con opciones `👑 Dueño (Owner)` / `🧑‍💼 Trabajador (Staff)`.
3. Selecciona **Staff** → `updateLocationAdminRole(uid, "staff")` → toast `success` "Sub-rol actualizado".
4. Asigna las canchas (`assignedLocationIds`) como hoy.

### Flujo principal B — Staff opera el panel de sede
1. Staff abre `/venues/admin/[id]` de una sede asignada.
2. Ve tabs: **Reservas · Pendientes · Balance** (sin Analítica).
3. En **Reservas → Por hora**: el carrusel de días arranca en **ayer** (hoy − 1) y permite avanzar al futuro. No hay días anteriores a ayer.
4. En **Reservas → Calendario**: los días anteriores a **ayer** están **deshabilitados** (no seleccionables, atenuados); el botón "mes anterior" no navega por debajo del mes que contiene a ayer.
5. Crea una reserva manual para ayer, hoy o el futuro → funciona igual que hoy.

### Estados de UI
| Estado | Qué muestra |
|--------|-------------|
| Cargando | Skeleton actual del panel de sede (sin cambios). |
| Vacío | Estados vacíos existentes de cada tab. |
| Error | Toast + retry existentes. |
| Éxito (asignación de rol) | Toast `success` + `<select>` refleja el nuevo valor. |
| Restringido (staff) | Tab Analítica ausente; días pasados atenuados/deshabilitados con `cursor-not-allowed`. |

### Consideraciones mobile-first
- El selector de sub-rol en `/admin/users` usa `text-base` (≥16px, regla anti-zoom iOS) igual que el `<select>` de tier existente.
- Días deshabilitados en el calendario mantienen touch target ≥44px pero sin handler (evita taps frustrados).
- Respetar `pb-24 md:pb-0` ya presente en las páginas.

---

## 7. UI DESIGN — COMPONENTES Y ANIMACIONES

### Componentes nuevos
- **Ninguno nuevo.** Se extienden componentes existentes. En vez de un booleano se pasa una **fecha mínima** (`minDate?: string` en formato `YYYY-MM-DD`), que es más expresiva que `allowPast` y permite el margen de un día:
  - `AdminSlotPicker` → nueva prop `minDate?: string` (default: sin límite → usa `twoMonthsBackISO()`). Cuando viene seteada, `DateCarousel` recibe `startDate={minDate}`.
  - `AdminBookingCalendar` → ya recibe `isSuper`; agregar prop `minDate?: string` (default: sin límite). Cuando viene seteada: deshabilitar días `< minDate` y bloquear `prevMonth` por debajo del mes que contiene `minDate`.
  - `/admin/users` → un `<select>` adicional condicional (`adminType === "location_admin"`).

### Animaciones (Framer Motion)
- El selector de sub-rol aparece/desaparece con `AnimatePresence` (fade + height) al cambiar el tier a/desde `location_admin`, consistente con cómo aparece hoy el bloque "Canchas Asignadas".
- Sin animaciones nuevas en el calendario; solo estilos de estado deshabilitado (opacidad).

### Responsive
- Mobile: selector full-width bajo el selector de tier.
- Desktop (md+): mismo layout de tarjeta de usuario existente en `/admin/users`.

---

## 8. ANALYTICS

| Evento | Trigger | Propiedades |
|--------|---------|-------------|
| `location_admin_subrole_set` | Super admin cambia el sub-rol de un location admin | `target_uid`, `subrole` (`"owner"`/`"staff"`), `actor_uid` |
| `venue_staff_past_nav_blocked` | Staff intenta seleccionar un día pasado en Reservas (opcional, para medir fricción) | `venue_id`, `attempted_date` |

> Seguir convención `snake_case`. `location_admin_subrole_set` es P4 (Platform/admin ops). El segundo evento es opcional; incluirlo solo si se quiere medir si el límite molesta al staff.

---

## 9. ARQUITECTURA TÉCNICA

### Modelo de datos
```typescript
// lib/domain/user.ts
export type LocationAdminRole = "owner" | "staff";

export interface UserProfile {
  // ...campos existentes...
  adminType?: AdminType;
  assignedLocationIds?: string[];
  locationAdminRole?: LocationAdminRole;  // solo relevante si adminType === "location_admin"; ausente ⇒ "owner"
}
```

### Capa de dominio (`lib/domain/user.ts`) — funciones puras nuevas
```typescript
// Owner (dueño) — o campo ausente por retrocompat. NO incluye super_admin.
export function isLocationOwner(profile: UserProfile): boolean {
  return isLocationAdmin(profile) && (profile.locationAdminRole ?? "owner") === "owner";
}

// Staff (trabajador).
export function isLocationStaff(profile: UserProfile): boolean {
  return isLocationAdmin(profile) && profile.locationAdminRole === "staff";
}

// ¿Puede ver el tab/dashboard de analítica de sede?
// Staff NO; owner requiere el flag venueAnalyticsEnabled; super_admin siempre.
export function canViewVenueAnalytics(profile: UserProfile): boolean {
  if (isSuperAdmin(profile)) return true;
  if (isLocationStaff(profile)) return false;
  return hasVenueAnalyticsAccess(profile); // owner con flag
}

// Fecha mínima navegable en Reservas.
// Staff: ayer (hoy − 1 día, zona America/Bogota). Resto: undefined (sin límite).
export function minBookingDate(profile: UserProfile): string | undefined {
  if (!isLocationStaff(profile)) return undefined;
  return yesterdayColombiaISO();
}
```

Helpers de fecha en zona Colombia (nuevos, en `lib/utils/date.ts` o donde vivan los helpers de fecha):
```typescript
// "Hoy" real en Colombia (America/Bogota, UTC-5, sin DST), independiente
// de la zona horaria del dispositivo. Usa el reloj del equipo (NTP).
export function todayColombiaISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date()); // en-CA ⇒ "YYYY-MM-DD"
}

// Ayer en Colombia. Se construye desde el string para evitar shifts de UTC.
export function yesterdayColombiaISO(): string {
  const d = new Date(`${todayColombiaISO()}T12:00:00-05:00`);
  d.setDate(d.getDate() - 1);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}
```
> `isLocationAdmin()`, `canManageLocation()`, `canCreatePublicMatch()`, `canUseDeposit()` **no cambian** — siguen aplicando a owner y staff por igual.
> `hasVenueAnalyticsAccess()` queda como está; los call sites de UI del panel migran a `canViewVenueAnalytics()`.

### Capa de API (`lib/users.ts`) — funciones nuevas
```typescript
export async function updateLocationAdminRole(uid: string, role: LocationAdminRole) {
  const ref = doc(db, "users", uid);
  await updateDoc(ref, { locationAdminRole: role });
}
```
Y en `revokeAdminRole()` agregar `locationAdminRole: deleteField()` al update de limpieza.

### Componentes UI (`app/`)
- [app/venues/admin/[id]/page.tsx](../app/venues/admin/[id]/page.tsx):
  - `canSeeAnalytics` pasa a derivarse de `canViewVenueAnalytics(profile)` (línea ~134).
  - Calcular `minDate = profile ? minBookingDate(profile) : undefined` y pasarlo a `AdminSlotPicker` y `AdminBookingCalendar` (líneas ~1036 y ~1064).
- [components/booking/AdminSlotPicker.tsx](../components/booking/AdminSlotPicker.tsx): prop `minDate`; `startDate` del `DateCarousel` = `minDate ?? twoMonthsBackISO()` (línea ~305). Clamp de `selectedDate` inicial a `≥ minDate` cuando esté seteada.
- [components/booking/AdminBookingCalendar.tsx](../components/booking/AdminBookingCalendar.tsx): prop `minDate`; deshabilitar días `< minDate` en el grid (línea ~183+) y bloquear `prevMonth` por debajo del mes que contiene `minDate` (línea ~185).
- [app/admin/users/page.tsx](../app/admin/users/page.tsx): `<select>` de sub-rol condicional a `adminType === "location_admin"`, con handler `handleUpdateLocationAdminRole` (espejo de `handleUpdateAdminType`, líneas ~99-103 / ~236-245).
- [firestore.rules](../firestore.rules): agregar `locationAdminRole` a ambas listas de claves protegidas (§4).

---

## 10. CRITERIOS DE ACEPTACIÓN

- [ ] Un location admin sin `locationAdminRole` sigue viendo y operando todo como antes (default owner).
- [ ] Un super admin puede setear `owner`/`staff` desde `/admin/users`; el selector solo aparece con tier `location_admin`.
- [ ] Un location admin **no** puede auto-cambiarse el sub-rol (rechazo por Firestore Rules, verificado con test manual o `@firebase/rules-unit-testing`).
- [ ] Un staff **no ve** el tab "Analítica" en `/venues/admin/[id]`; un owner con flag sí.
- [ ] Un staff en "Reservas → Por hora" puede ver **ayer** pero no días anteriores a ayer.
- [ ] Un staff en "Reservas → Calendario" ve deshabilitados los días anteriores a ayer y no puede navegar a meses previos al que contiene ayer.
- [ ] La fecha "hoy/ayer" se calcula en zona `America/Bogota` aunque el dispositivo esté en otra zona horaria.
- [ ] Un owner conserva navegación completa (pasado y futuro) en ambas vistas.
- [ ] `revokeAdminRole` limpia `locationAdminRole` junto con `adminType`/`assignedLocationIds`.
- [ ] Deep-link `?tab=analytics` como staff cae al tab default sin romper.
- [ ] Evento `location_admin_subrole_set` se dispara al asignar sub-rol.

---

## 11. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---------|--------|
| `lib/domain/user.ts` | Tipo `LocationAdminRole`; campo `locationAdminRole`; funciones `isLocationOwner`, `isLocationStaff`, `canViewVenueAnalytics`, `minBookingDate` |
| `lib/utils/date.ts` | Helpers `todayColombiaISO()`, `yesterdayColombiaISO()` (zona `America/Bogota`) |
| `lib/users.ts` | `updateLocationAdminRole()`; limpieza en `revokeAdminRole()` |
| `app/venues/admin/[id]/page.tsx` | `canSeeAnalytics` vía `canViewVenueAnalytics`; pasar `minDate` a los dos componentes de reservas |
| `components/booking/AdminSlotPicker.tsx` | Prop `minDate`; acotar `startDate` del `DateCarousel` y clamp de fecha inicial |
| `components/booking/AdminBookingCalendar.tsx` | Prop `minDate`; deshabilitar días `< minDate` y bloquear `prevMonth` |
| `components/booking/BlockedSlotForm.tsx` | Prop `minDate`; `min` en el input de fecha de la reserva manual |
| `app/admin/users/page.tsx` | `<select>` de sub-rol + `handleUpdateLocationAdminRole` |
| `firestore.rules` | `locationAdminRole` en ambas listas de claves protegidas (solo super_admin escribe) |
| `lib/analytics.ts` | Evento `location_admin_subrole_set` (y opcional `venue_staff_past_nav_blocked`) |

---

## ⚠️ Decisiones de Diseño Clave

1. **Sub-rol como campo aparte, NO como nuevo `adminType` — confirmado (Opción A).** `locationAdminRole` sub-clasifica dentro de `location_admin`; `isLocationAdmin()` sigue `true` para ambos. Esto evita tocar decenas de call sites y hace la migración trivial (default `owner`).

2. **Default `owner` para campo ausente.** Todo location admin existente se vuelve owner al desplegar, sin migración de datos. **Riesgo aceptado:** si en el futuro se quiere que "sin rol definido" sea el más restrictivo, habría que hacer backfill explícito.

3. **La restricción es UI-level, no un límite de datos — confirmado.** Staff no *ve* analítica ni histórico en la app, pero `match /bookings` tiene `allow list: if request.auth != null` (abierto a todos, requerido por `getBookingsForDate()` para disponibilidad). Cerrarlo a nivel de datos rompería el flujo de reservas de todos los usuarios y requeriría mover las lecturas detrás de Cloud Functions callable — rediseño mayor, fuera de alcance. Se acepta el gate de UI (el riesgo de lectura vía SDK ya existe hoy para cualquier location_admin).

4. **Tab "Balance" (ingresos del día) visible para staff — confirmado.** El staff necesita cuadrar caja del día. Es la única vista financiera que ve; Analítica (tendencias/agregados históricos) sigue siendo owner-only.

5. **Límite = ayer (hoy − 1) en zona `America/Bogota`, con reloj del dispositivo** (`yesterdayColombiaISO()`), no hora de servidor. Se calcula en zona Colombia para dar la fecha real del país aunque el dispositivo esté mal configurado de zona. El margen de un día permite al staff cerrar/corregir la jornada anterior. **Confirmado con el usuario:** no se usa hora de servidor (sería sobre-ingeniería para un gate de UI; solo blindaría contra manipulación deliberada del reloj, que de todos modos no es un límite de datos).
