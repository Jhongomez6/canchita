# Feature: Registro de Location Admin sin Onboarding de jugador

## 📋 Specification-Driven Development (SDD)

Permitir que dueños/administradores de canchas se registren con Google y queden directamente como `location_admin` sin pasar por el onboarding de 6 pasos del jugador. El super admin les asigna sedes después; mientras tanto el admin no puede operar (estado "esperando asignación").

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo
Hoy todos los registros entran como `roles: ["player"]` y son forzados al onboarding (edad, nivel, posiciones, etc.) por `AuthGuard`. Esto rompe la experiencia para dueños de cancha, que solo necesitan administrar reservas y bloqueos en sus sedes — no juegan ni necesitan rating.

### Reglas de Negocio
| # | Regla | Impacto UI |
|---|-------|------------|
| 1 | Existe una ruta pública `/registro-admin` que setea un flag de intención antes de loguear con Google. | Página dedicada con CTA "Soy dueño de cancha" |
| 2 | Si el usuario llega vía esa ruta y es nuevo, se crea con `roles: ["admin"]`, `adminType: "location_admin"`, `assignedLocationIds: []`, `bookingEnabled: true`. | No redirige a `/onboarding`; queda con acceso al módulo de reservas desde el primer login |
| 3 | Si el usuario llega vía esa ruta pero **ya existe** (login normal), se ignora la intención: no se le cambia el rol. | El flag se descarta tras consumirse |
| 4 | El `location_admin` debe completar su número de teléfono igual que cualquier usuario (contacto del negocio). | Reuso de `/onboarding/phone` |
| 5 | Mientras `assignedLocationIds` esté vacío, el admin ve una pantalla "Esperando asignación de sede" en `/bookings` (su landing actual) — sin acciones disponibles. | Empty state explicativo |
| 6 | El `location_admin` NO debe ver el bottom nav de jugador (matches, ranking, perfil-jugador) porque no tiene rol `player`. | Header/nav debe filtrar por `roles` |
| 7 | El super admin asigna locations desde `/admin/users` (UI ya existe vía `assignLocationsToAdmin`). Una vez asignadas, el admin ya opera normalmente en `/bookings` y `/venues/admin/[id]`. | No requiere cambios |
| 8 | El `location_admin` NO puede convertirse en player desde su perfil (queda fuera de scope; si quisiera jugar tendría que ser flujo aparte). | Botón "ver perfil" lleva a vista mínima sin stats de jugador |
| 9 | Bug fix simple (1-3 líneas) → excepción, no requiere SDD. *(Convención del proyecto, sólo a modo de referencia)* | — |

---

## 2. ESCALABILIDAD

### Volumen esperado
- Pocos registros por mes (decenas, no miles). Cada `location_admin` corresponde a un negocio físico distinto.
- No introduce queries nuevas: el documento de usuario ya existía con la misma estructura.

### Índices Firestore requeridos
- Ninguno nuevo. La query `users where adminType == "location_admin"` ya está soportada (usada por super admin en `/admin/users`).

### Paginación
- N/A para este flujo.

---

## 3. CONCURRENCIA SEGURA

### Operaciones que requieren `runTransaction()`
- Ninguna. La creación del documento `users/{uid}` en `ensureUserProfile()` ya es atómica (`setDoc` único por uid). No hay estado compartido en disputa.

### Race conditions identificadas
- **Escenario:** Usuario abre `/registro-admin` en una pestaña, luego abre la home en otra y se loguea desde ahí antes. → **Mitigación:** El flag de intención vive en `sessionStorage` y solo se consume cuando `ensureUserProfile()` confirma `isNewUser === true`. Si ya existía, el flag se descarta sin efecto.
- **Escenario:** Usuario nuevo se loguea por la pestaña sin intención (home), luego abre `/registro-admin`. → Ya existe como `player`. El flag no lo promueve a admin (regla 3). El usuario tendría que pedirle a un super admin que cambie su rol manualmente.

---

## 4. SEGURIDAD

### Autenticación y autorización
- Cualquier persona con cuenta de Google puede registrarse como `location_admin` (auto-registro abierto, decisión 1b). El "candado" real es que **sin sedes asignadas no puede hacer nada**: las reglas de Firestore validan `assignedLocationIds` para escrituras sobre `bookings`, `blockedSlots`, `venues`, etc.
- El super admin es el único que puede ejecutar `assignLocationsToAdmin()` — esto ya está protegido por `firestore.rules`.

### Firestore Rules requeridas
- **Sin cambios** en reglas. La creación del documento `users/{uid}` por el propio usuario al loguearse ya está permitida; los campos `roles`, `adminType` y `assignedLocationIds` no necesitan reglas nuevas porque el efecto sin asignación es nulo.
- **Validación crítica a verificar manualmente** durante implementación: confirmar que ningún rule permite escritura a `location_admin` con `assignedLocationIds` vacío. Si alguna lo permite, esto sería una vía de escalación de privilegios.

### Validaciones de input
- `/registro-admin` no acepta input del usuario más allá del click "Continuar con Google". Todo lo demás viene de Google OAuth.
- El flag de intención se valida con un valor whitelisted: solo `"location_admin"` es aceptado por `ensureUserProfile()`. Cualquier otro valor cae al default `player`.

### Datos sensibles
- Ningún cambio respecto al modelo actual.

---

## 5. TOLERANCIA A FALLOS

### Estados de error y fallbacks
| Error | Causa probable | Fallback UI |
|-------|---------------|-------------|
| Login con Google falla | Popup bloqueado, in-app browser, red | Mensaje + botón reintentar (mismo patrón que LandingPage) |
| `ensureUserProfile()` falla en escribir el doc | Reglas de Firestore, conexión | Toast "No pudimos crear tu cuenta" + reset del flag |
| Flag presente pero sin red | sessionStorage queda hasta cerrar pestaña | Al recuperar red, se consume normalmente |
| Usuario completa registro pero super admin no lo asigna | Operacional, no técnico | Pantalla "Esperando asignación" con instrucciones de contacto |

### Retry strategy
- Login con Google: el usuario reintenta manualmente (no auto-retry — Google maneja sus propios reintentos internos).
- Escritura del documento: confiar en el SDK de Firestore (offline persistence + retries automáticos).

### Degradación elegante
- Si la URL `/registro-admin` se rompe, el usuario puede loguearse normalmente desde `/` y luego pedir a un super admin que lo eleve. No pierde acceso.

---

## 6. UX — FLUJOS DE USUARIO

### Flujo principal (happy path)
1. Dueño de cancha recibe link `/registro-admin` (compartido por el equipo de Canchita).
2. Llega a la página → ve copy claro "Regístrate como administrador de cancha".
3. Click en "Continuar con Google" → setea `sessionStorage.signupIntent = "location_admin"` → dispara `loginWithGoogle()`.
4. Vuelve del OAuth → `AuthContext` llama a `ensureUserProfile()` con la intención leída de sessionStorage → crea `roles: ["admin"]`, `adminType: "location_admin"`, `assignedLocationIds: []` → borra el flag.
5. `AuthGuard` no lo redirige a `/onboarding` (no tiene rol `player`).
6. `AuthGuard` lo redirige a `/onboarding/phone` (gate de teléfono extendido a admins).
7. Completa teléfono → cae en `/bookings` (landing actual de location admin).
8. Ve empty state: "Tu cuenta está activa. Estamos asignando tu sede — te notificaremos cuando puedas empezar a gestionar reservas."
9. Eventualmente el super admin entra a `/admin/users`, lo busca, le asigna locations.
10. En la próxima carga, el `location_admin` ve sus sedes y opera normalmente.

### Estados de UI
| Estado | Qué muestra |
|--------|-------------|
| Cargando | Skeleton de la landing /registro-admin (logo + dots) |
| Vacío (sin sedes asignadas) | Empty state con icono, copy "Esperando asignación", botón "Volver" deshabilitado o link a perfil |
| Error en login | Toast rojo + botón reintentar |
| Éxito post-registro | Toast verde "Cuenta creada — completa tu teléfono" + redirect a `/onboarding/phone` |

### Consideraciones mobile-first
- Mismo layout que LandingPage actual: gradiente verde, card centrada, botón Google grande.
- Inputs (en `/onboarding/phone` que ya existe): font-size ≥ 16px (regla 9.b del CLAUDE.md).
- `pb-24 md:pb-0` aplica en el empty state de `/bookings`.

---

## 7. UI DESIGN — COMPONENTES Y ANIMACIONES

### Componentes nuevos
- `app/registro-admin/page.tsx` — landing del flujo, reusa estilos de `LandingPage`.
- `components/booking/PendingAssignmentEmptyState.tsx` — empty state que se muestra en `/bookings` cuando `isLocationAdmin(profile) && assignedLocationIds.length === 0`.

### Animaciones (Framer Motion)
- Reuso de animaciones existentes de LandingPage (no se introducen nuevas).
- `AnimatePresence` para la transición del empty state cuando se asignan locations.

### Responsive
- Mobile-first idéntico al resto de la app.
- Desktop: card centrada con `max-w-md`.

---

## 8. ANALYTICS

| Evento | Trigger | Propiedades |
|--------|---------|-------------|
| `location_admin_signup_started` | Click en "Continuar con Google" desde `/registro-admin` | — |
| `location_admin_signup_completed` | `ensureUserProfile()` retorna `isNewUser=true` con intención `location_admin` | `uid` |
| `user_registered` | Reuso del evento existente | Se dispara igual; se diferencia por `user_role` property |

`setAnalyticsUserProperties({ user_role: "admin" })` ya se setea automáticamente por el listener actual en `AuthContext.tsx:124-128` cuando cambia `roles`.

---

## 9. ARQUITECTURA TÉCNICA

### Modelo de datos
Sin cambios en interfaces. Solo se ejercitan campos ya existentes en `UserProfile`:

```typescript
// Documento creado para un location_admin nuevo
{
  uid: "...",
  name: "Juan Pérez",
  email: "juan@cancha.com",
  roles: ["admin"],
  adminType: "location_admin",
  assignedLocationIds: [],         // vacío hasta que super admin asigne
  bookingEnabled: true,            // feature flag de reservas activado al registrarse
  positions: [],                   // vacío, no aplica
  createdAt: "2026-05-05T...",
  authAcceptedVersion: "...",
}
```

### Capa de dominio (`lib/domain/`)
- **`lib/domain/user.ts`**: agregar helper `isPendingLocationAdmin(profile)` → `isLocationAdmin(profile) && (profile.assignedLocationIds?.length ?? 0) === 0`. Útil para AuthGuard, Header, /bookings.

### Capa de API (`lib/`)
- **`lib/users.ts` → `ensureUserProfile()`**: agregar parámetro opcional `signupIntent?: "location_admin"`. Cuando se pasa Y `!snap.exists()`, crear con:
  ```typescript
  roles: ["admin"],
  adminType: "location_admin",
  assignedLocationIds: [],
  bookingEnabled: true,
  ```
  en lugar del default `roles: ["player"]`. La intención se valida con `signupIntent === "location_admin"` (whitelist explícita).

  **Nota sobre `bookingEnabled`:** el flag es estrictamente para acceso al módulo de reservas (gate de UI). No otorga capacidad de operar — eso lo da `assignedLocationIds`. Setearlo `true` desde el registro evita que el location_admin vea pantallas "no tienes acceso a reservas" mientras espera la asignación de sedes; verá la pantalla "Esperando asignación" en `/bookings` que es la UX correcta para su estado.

### Componentes UI (`app/`)
- **`app/registro-admin/page.tsx`** (nuevo): landing pública. Click en "Continuar con Google" hace `sessionStorage.setItem("signupIntent", "location_admin")` antes de `loginWithGoogle()`. Dispara `logLocationAdminSignupStarted()`. Si el usuario ya está logueado, redirige a `/bookings` (si es location admin) o `/` (otros).
- **`lib/AuthContext.tsx`**: leer `sessionStorage.getItem("signupIntent")` antes de `ensureUserProfile()` y limpiarlo (consumido). Pasar como quinto arg. Si `isNewUser` y la intención era `location_admin`, dispara `logLocationAdminSignupCompleted()`.
- **`components/AuthGuard.tsx`**:
  - Redirect a `/onboarding` ya excluye admins (`roles.includes("player")`) — no requiere cambio.
  - Gate de teléfono extendido: aplica a `(player con onboarding completo) || isLocationAdmin(profile)`. La pantalla de redirección también se actualiza con la misma condición.
- **`app/onboarding/phone/page.tsx`**: tras guardar el teléfono, si el usuario es `location_admin` redirigir a `/bookings` en lugar de `/`.
- **`app/bookings/page.tsx`**: si `isPendingLocationAdmin(profile)`, renderizar `<PendingAssignmentEmptyState />` en lugar del listado de bookings y saltar las llamadas a `getUserBookings`/`getActiveVenues`.
- **`components/BottomNav.tsx`**: scoping de tabs por rol.
  - `Inicio` (`/`) y `Buscar` (`/explore`): visibles solo si `isPlayer || isSuperAdmin`. Ocultas para `location_admin` (su home efectivo es `/bookings`).
  - `Historial` (`/history`): visible solo si `isPlayer && !isSuperAdmin` (mantiene comportamiento previo de jugadores; oculto para location_admin).
  - `Perfil` (`/profile`): oculta para `location_admin` — no participa del flujo de jugador, no necesita perfil deportivo.
  - `Reservas`: visible para location_admin (gracias a `bookingEnabled: true`).
- **`components/Header.tsx`**: en la nav desktop, los enlaces `Partidos`, `Explorar`, `Perfil` se ocultan para `location_admin`. El badge de admin, las notificaciones (🔔), wallet y botón "Salir" siguen visibles.

---

## 10. CRITERIOS DE ACEPTACIÓN

- [ ] Visitar `/registro-admin` sin sesión muestra una landing con CTA Google.
- [ ] Click en CTA + login con cuenta de Google nueva → se crea documento `users/{uid}` con `roles: ["admin"]`, `adminType: "location_admin"`, `assignedLocationIds: []`, `bookingEnabled: true`.
- [ ] `hasBookingAccess(profile)` retorna `true` para el usuario recién creado (verificable en consola o porque no es expulsado de `/bookings`).
- [ ] Usuario nuevo es redirigido a `/onboarding/phone` (no a `/onboarding`).
- [ ] Tras completar teléfono, cae en `/bookings` y ve el empty state "Esperando asignación".
- [ ] Bottom nav del jugador (Inicio, Buscar, Historial, Perfil) no aparece para este usuario.
- [ ] Header desktop no muestra los enlaces "Partidos", "Explorar" ni "Perfil" para `location_admin`.
- [ ] Usuario existente que entra por `/registro-admin` no se le altera su rol — sigue siendo lo que era.
- [ ] Después de que super admin le asigna 1+ location desde `/admin/users`, en la próxima carga ve sus sedes en `/bookings` y opera normalmente.
- [ ] `sessionStorage` queda limpio tras consumirse el flag (verificable en DevTools).
- [ ] Eventos `location_admin_signup_started` y `location_admin_signup_completed` se disparan en los puntos correctos.
- [ ] No hay regresión en el flujo de registro de jugadores (player sigue yendo a `/onboarding`).

---

## 11. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---------|--------|
| `app/registro-admin/page.tsx` | **Nuevo** — landing pública con CTA Google y seteo del flag |
| `lib/users.ts` | Modificar `ensureUserProfile()`: nuevo arg `signupIntent`, branch para crear como `location_admin` con `bookingEnabled: true` |
| `lib/AuthContext.tsx` | Leer/limpiar `sessionStorage.signupIntent` y pasarlo a `ensureUserProfile()`; disparar `logLocationAdminSignupCompleted()` |
| `lib/domain/user.ts` | Agregar helper `isPendingLocationAdmin()` |
| `components/AuthGuard.tsx` | Extender gate de teléfono para incluir `location_admin` |
| `app/onboarding/phone/page.tsx` | Redirigir a `/bookings` cuando el usuario es `location_admin` |
| `app/bookings/page.tsx` | Branch para `PendingAssignmentEmptyState` cuando `isPendingLocationAdmin` |
| `components/booking/PendingAssignmentEmptyState.tsx` | **Nuevo** — empty state "Esperando asignación de sede" |
| `components/BottomNav.tsx` | Ocultar Inicio / Buscar / Historial / Perfil para `location_admin` |
| `components/Header.tsx` | Ocultar enlaces desktop "Partidos" / "Explorar" / "Perfil" para `location_admin` |
| `lib/analytics.ts` | Agregar `logLocationAdminSignupStarted()` y `logLocationAdminSignupCompleted()` |
| `firestore.rules` | Sin cambios. Verificar manualmente que ningún rule deja escribir a `location_admin` con `assignedLocationIds` vacío |

---

## 12. FUERA DE SCOPE (no se hace en esta feature)

- Que un `location_admin` también sea `player` (registrarse como ambos). Si en el futuro se necesita, sería un toggle en su perfil que lo manda al onboarding de jugador.
- Notificación automática al super admin cuando se registra un nuevo `location_admin`. Por ahora la asignación es proactiva del super admin (puede agregarse después si fricciona).
- Validación de identidad del dueño (KYC). Auto-registro abierto significa que cualquiera puede crear la cuenta; el control real es la asignación manual de sedes por el super admin.
- Rate limiting de registros. Volumen esperado bajo, no necesario.
- Email de bienvenida. Puede agregarse en una iteración posterior con Cloud Function `onCreate` sobre `users` filtrando `adminType == "location_admin"`.
