# Feature: Landing de Reservas para QR en Sedes Deportivas

## 📋 Specification-Driven Development (SDD)

Una landing **pública** (sin login) a la que llega la gente al escanear un QR físico en la sede: explica en segundos qué es La Canchita, cómo reservar y cómo instalar la app, con un CTA contundente para registrarse y reservar de inmediato en esa sede.

> **Alcance — qué construye este SDD**:
> - ✅ **Ruta pública** `app/reservar/page.tsx` (server component, indexable, con OG tags), sin `AuthGuard`.
> - ✅ **QR inteligente**: el QR codifica `https://lacanchita.app/reservar?sede=<venueId>`; el `venueId` se propaga al CTA para que, tras registrarse, el usuario aterrice **directo en la reserva de esa sede**.
> - ✅ **Cuenta "solo reservas"** (`bookingOnly`): quien se registra por este flujo **NO pasa por el cuestionario de onboarding** (rating inicial); entra directo a reservar. Ver §12.
> - ✅ **Módulo "Partidos casuales" activable**: dentro de la app, el usuario solo-reservas puede activar los partidos más tarde; ahí (y solo ahí) corre el onboarding. Ver §12.
> - ✅ Sección "cómo instalar" con detección iOS/Android reusando `usePWAInstall()`.
> - ✅ Analytics de la landing (vistas, CTA, install) y de la activación de partidos.
> - ❌ **NO** rediseña el flujo de reserva en sí (ver [RESERVAS_APROBACION_CREA_RESERVA_SDD.md](RESERVAS_APROBACION_CREA_RESERVA_SDD.md)).
> - ❌ **NO** incluye branding por sede (mostrar nombre/foto de la sede en la landing) en v1 — ver Decisión Clave #2 (las sedes no son legibles sin auth).

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo

Convertir el tráfico físico de las sedes deportivas en usuarios registrados que reservan. Hoy no existe punto de entrada público: cualquier ruta distinta de `/` redirige a login (`AuthGuard`), y `/` muestra la `LandingPage` genérica de la app (login con Google), que **no** explica el producto de reservas ni guía la instalación. Un cartel con QR en recepción necesita una página que:

1. **Explique** qué es La Canchita y por qué reservar por la app (concreto, escaneable en < 15s).
2. **Muestre cómo reservar** en 3 pasos.
3. **Guíe la instalación** de la PWA (iOS y Android por separado).
4. **Convierta**: CTA "Registrarme y reservar" que, si el QR trae `sede`, deja al usuario en la reserva de esa sede tras el login.

### Reglas de Negocio

| # | Regla | Impacto UI |
|---|-------|------------|
| RN-01 | La landing es **100% pública**: renderiza sin sesión, sin `AuthGuard`, y **no** lee Firestore. Todo su contenido es estático. | La página carga aunque el usuario nunca haya abierto la app |
| RN-02 | El QR codifica `.../reservar?sede=<venueId>`. Si `sede` está presente y es un id válido (`^[A-Za-z0-9_-]{1,64}$`), el CTA apunta a `/?returnTo=%2Fvenues%2F<venueId>` para aterrizar en esa sede tras el login. | CTA "Reservar en esta sede" |
| RN-03 | Si `sede` falta o es inválido, la landing sigue funcionando como explicativo genérico y el CTA apunta a `/?returnTo=%2Fvenues` (listado de sedes). | CTA "Registrarme y reservar" |
| RN-04 | El CTA lanza el **registro/login con Google directo (popup)**, marcando el intent `"booking"`, y al terminar navega a `/venues/<sede>` (o `/venues`). Excepción: en navegador in-app (Instagram/WhatsApp), donde el popup de Google no funciona, cae a `/?returnTo=...` para que `LandingPage` muestre el instructivo de "abrir en el navegador". | Un solo toque: del CTA al popup de Google |
| RN-05 | Un usuario recién registrado **no tiene acceso a reservar** por defecto (`hasBookingAccess` exige `bookingEnabled`). **Decisión cerrada (A)**: al registrarse con el intent `"booking"`, el alta crea el perfil con `bookingEnabled: true`. | Sin esto, el CTA "reservar" rebota a `/` |
| RN-10 | Quien se registra por la landing lo hace con `signupIntent = "booking"` → el perfil nace **solo-reservas**: `roles: ["player"]`, `bookingEnabled: true`, `bookingOnly: true`. **No** se le fuerza el onboarding (cuestionario de rating) ni el de teléfono. | Va directo a `/venues/<sede>` a reservar, sin cuestionario |
| RN-11 | `AuthGuard` deja de forzar `/onboarding` cuando `profile.bookingOnly === true`. El gate pasa a: `roles.includes("player") && !initialRatingCalculated && !bookingOnly`. Retrocompatible: los perfiles existentes no tienen `bookingOnly` (⇒ comportamiento actual intacto). | Usuario solo-reservas navega libre sin ser redirigido al cuestionario |
| RN-12 | El usuario solo-reservas puede **activar "Partidos casuales"** desde la app (entrada en `/profile`). Al activar: se marca `bookingOnly: false` → `AuthGuard` ahora sí lo lleva al onboarding; al completarlo queda como jugador pleno (`initialRatingCalculated: true`). | Card "Activa los partidos casuales" con explicación + botón |
| RN-13 | Mientras es solo-reservas, su "home" no es la de partidos: `app/page.tsx` lo redirige a `/venues` (reservar) y el `BottomNav` muestra pestañas de reservas, ocultando las centradas en partidos. | Experiencia enfocada en reservar; el módulo de partidos aparece como algo "por activar" |
| RN-06 | La sección "Instalar la app" detecta plataforma: **Android** → botón nativo (`beforeinstallprompt` vía `usePWAInstall`); **iOS** → instrucciones manuales (Compartir → "Agregar a inicio"); **ya instalada (standalone)** → se oculta la sección. | Contenido condicional por plataforma |
| RN-07 | Si el usuario **ya tiene sesión activa** al abrir la landing (raro, pero posible en su propio teléfono), el CTA principal lo lleva directo a la sede/listado sin re-login. | Detección client-side no bloqueante |
| RN-08 | La landing es indexable (SEO) con `metadata` + Open Graph, para que compartir el link por WhatsApp muestre preview. | `<title>`, `description`, `og:image` |
| RN-09 | Todo el contenido visible en **español**; mobile-first (el 100% del tráfico entra por cámara de celular). | — |

---

## 2. ESCALABILIDAD

### Volumen esperado

- La landing es **estática** (server component sin data-fetching). Se sirve desde el CDN de Vercel; costo marginal ~0 y latencia mínima.
- Tráfico estimado: 5–20 sedes × 50–300 escaneos/mes = **~250–6.000 vistas/mes** en fase inicial. Irrelevante para infraestructura.
- **Cero lecturas Firestore** en la landing → no consume cuota de reads ni afecta cuotas de la app.

### Índices Firestore requeridos

- **Ninguno**. La landing no consulta colecciones. Los índices del flujo de reserva downstream ya existen (ver SDD de reservas).

### Paginación

- No aplica (no hay listas dinámicas en la landing).

---

## 3. CONCURRENCIA SEGURA

### Operaciones que requieren `runTransaction()`

- **Ninguna en la landing**. La página no escribe estado compartido: no crea documentos, no toca slots. Es puramente de lectura estática + navegación.

### Race conditions identificadas

- **N/A para esta feature.** Toda la concurrencia sensible (crear/aprobar reserva, bloquear slot) vive en el flujo downstream ya cubierto por [RESERVAS_APROBACION_CREA_RESERVA_SDD.md](RESERVAS_APROBACION_CREA_RESERVA_SDD.md) §3. La landing solo entrega al usuario a ese flujo vía `returnTo`.

> **Nota sobre RN-05 (booking access)**: si la estrategia elegida (Decisión #1) implica setear `bookingEnabled` al registrarse, esa escritura ocurre **una sola vez por usuario** en el flujo de alta (no concurrente por naturaleza) y se hace idempotente (`set({ bookingEnabled: true }, { merge: true })`).

---

## 4. SEGURIDAD

### Autenticación y autorización

| Acción | Quién | Validación |
|--------|-------|------------|
| Ver la landing `/reservar` | Cualquiera (anónimo) | Ninguna — ruta pública fuera de `AuthGuard` |
| Iniciar registro/login | Cualquiera | Flujo Google existente (`loginWithGoogle`) en `LandingPage` |
| Reservar tras login | Usuario con `hasBookingAccess` | `hasBookingAccess(profile)` en `/venues/[id]` (ya existe) + Decisión #1 |

### Firestore Rules requeridas

- **Ninguna nueva para la landing** (no lee ni escribe Firestore).
- **Cuenta solo-reservas / activación de partidos (§13)**: **no requiere cambio de rules**. El alta con `bookingOnly`/`bookingEnabled` ocurre en el `create` del doc (permitido: `request.auth.uid == userId`). La activación de partidos (self-update de `bookingOnly: false`) también está permitida porque `bookingOnly` **no** está en la lista de campos bloqueados del `allow update` de `users/{userId}` (a diferencia de `roles`/`adminType`/`xpEnabled`, que sí lo están). No hay escalamiento de privilegios: el usuario solo altera su propia experiencia, nunca su rol.
  > Nota: `bookingEnabled` tampoco está en la lista bloqueada hoy (situación preexistente). Como lo seteamos server-side en el alta, no dependemos de esa laxitud; si en el futuro se quiere blindar, se agrega `bookingEnabled` y `bookingOnly` a la lista bloqueada y se togglean vía Cloud Function.
- ⚠️ **Solo si se adopta branding por sede (fuera de alcance v1)**: habría que exponer públicamente un subconjunto mínimo de campos de la sede. Como `match /venues/{venueId}` hoy exige `request.auth != null`, la opción segura sería una colección separada `public_venue_cards/{venueId}` con solo `{ name, imageURL }` y regla `allow read: if true`, escrita por Cloud Function al guardar la sede. **No se implementa en este SDD.**

### Validaciones de input

- **`sede` (query param)** — única entrada de usuario. Sanitizar antes de construir el `returnTo`:
  ```typescript
  const VENUE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
  const sede = typeof raw === "string" && VENUE_ID_RE.test(raw) ? raw : null;
  ```
  Esto **previene open-redirect / path injection** (ej. `sede=//evil.com` o `sede=..%2f..`): sin la validación, un `venueId` malicioso podría inyectar un `returnTo` peligroso. `LandingPage` ya exige que `returnTo` empiece con `/`, pero validamos en origen igualmente (defensa en profundidad).
- El `returnTo` se construye siempre con rutas relativas hardcodeadas (`/venues/${sede}`), nunca concatenando texto libre.

### Datos sensibles

- La landing **no expone ningún dato**: es contenido de marketing estático. Sin PII, sin datos bancarios, sin ids de usuario.

---

## 5. TOLERANCIA A FALLOS

### Estados de error y fallbacks

| Error | Causa probable | Fallback UI |
|-------|---------------|-------------|
| `beforeinstallprompt` nunca dispara | iOS Safari / navegador no compatible / ya instalada | Se muestran **instrucciones manuales** (iOS) o se oculta el botón; nunca un botón muerto |
| App ya instalada (`isStandalone`) | Usuario ya la tiene | Se **oculta** toda la sección de instalación (RN-06) |
| `sede` inválido o ausente | QR mal generado / link compartido sin param | CTA cae a `/?returnTo=%2Fvenues` (genérico), sin romper (RN-03) |
| Analytics no inicializa | Bloqueador / red | Best-effort: la página funciona igual, los logs se pierden silenciosamente |
| JS deshabilitado | Navegador raro | El contenido (server-rendered) y el CTA (link `<a>` normal) **funcionan sin JS**; solo se degradan el botón de install nativo y los trackers |
| Login con Google falla | In-app browser (Instagram/FB) / usuario cancela | `LandingPage` ya maneja el caso `isInAppBrowser()` mostrando aviso de "abrir en navegador"; el CTA delega en ese flujo probado |

### Retry strategy

- No hay operaciones de red propias que reintentar en la landing. El único retry relevante (login) lo maneja `LandingPage`.

### Degradación elegante

- **Sin JS**: el CTA sigue siendo un `<a href="/?returnTo=...">` funcional; el usuario puede registrarse. Solo se pierden el botón de instalación nativo y el tracking.
- **Sin conexión tras cargar**: la página ya está pintada (estática); el CTA navega a `/` que gestiona su propio estado offline.

---

## 6. UX — FLUJOS DE USUARIO

### Flujo principal (happy path)

```
1. Usuario en la sede escanea el QR de recepción
   → abre el navegador del celular en /reservar?sede=venue_abc
2. Ve el HERO: logo + "Reserva tu cancha en segundos" + CTA "Reservar en esta sede"
3. Baja: entiende qué es La Canchita (3 bullets de valor)
4. Ve "Cómo reservar en 3 pasos" (elegir sede/hora → abonar → confirmar)
5. Ve "Instala la app" (detecta su OS y le muestra el paso correcto)
6. Toca el CTA → va a /?returnTo=%2Fvenues%2Fvenue_abc
7. LandingPage: login con Google (1 tap)
8. Post-login: returnTo lo lleva a /venues/venue_abc → reserva
```

### Flujos alternativos

- **Sin `sede`** (link genérico compartido): pasos 1–7 iguales, pero el CTA lleva a `/?returnTo=%2Fvenues` → tras login aterriza en el listado de sedes.
- **Ya logueado en su teléfono**: al tocar el CTA, `LandingPage` detecta sesión y salta directo al `returnTo` sin pedir login (RN-07).
- **iOS**: en "Instalar", ve instrucciones ilustradas (Compartir → "Agregar a inicio") en vez de botón nativo.
- **Ya instalada (standalone)**: la sección de instalación se oculta; el CTA sigue visible.
- **In-app browser (Instagram/WhatsApp webview)**: al intentar login, `LandingPage` muestra el aviso existente de "abrir en Chrome/Safari".

### Estados de UI

| Estado | Qué muestra |
|--------|-------------|
| Carga | Nada especial — server-rendered, pinta instantáneo (no hay skeleton porque no hay fetch) |
| Vacío | N/A (contenido estático siempre presente) |
| Error | Solo degradaciones puntuales de §5 (botón install → instrucciones) |
| Éxito | El CTA navega; el "éxito" real (reserva) ocurre en el flujo downstream |
| Install no disponible | Instrucciones manuales iOS / sección oculta si standalone |

### Consideraciones mobile-first

- Diseñada **primero para móvil** (origen = cámara de celular). Desktop es secundario (link compartido).
- Touch targets ≥ 48px; CTA full-width y **sticky** en la parte inferior en móvil para estar siempre a un pulgar.
- **No** usa `pb-24` de bottom nav (la landing vive fuera del shell con `BottomNav`; es una página autónoma como las de `campaigns/`).
- Accesibilidad: jerarquía `h1/h2/h3` correcta, `alt` en imágenes decorativas vacío (`alt=""` + `aria-hidden`), contraste AA sobre el verde de marca, `aria-label` en el CTA.

---

## 7. UI DESIGN — COMPONENTES Y ANIMACIONES

### Componentes nuevos

| Componente | Ubicación | Props | Propósito |
|------------|-----------|-------|-----------|
| `ReservarLanding` (page) | `app/reservar/page.tsx` | — (server) | Estructura estática: hero, valor, pasos, install, CTA final. Lee `searchParams.sede` |
| `LandingTrackers` | `app/reservar/LandingTrackers.tsx` | `{ venueId: string \| null }` | `"use client"`: dispara `logReservationLandingViewed` on-mount; expone hooks de scroll opcionales |
| `ReservarCTA` | `app/reservar/ReservarCTA.tsx` | `{ venueId: string \| null; location: "hero" \| "final" }` | `"use client"`: link a `/?returnTo=...` + `logReservationLandingCTAClicked`; detecta sesión activa (RN-07) |
| `InstallSection` | `app/reservar/InstallSection.tsx` | — | `"use client"`: usa `usePWAInstall()`; renderiza botón nativo (Android), instrucciones (iOS), u oculto (standalone) |

> Se sigue el patrón de `app/campaigns/camiseta-colombia/` (page server + trackers client), no se toca el shell global.

### Estructura visual (secciones)

1. **Hero** — logo, badge "Reserva online", `h1` "Reserva tu cancha en segundos", subtítulo, `ReservarCTA location="hero"`. Fondo verde marca `#1f7a4f` con SVG de cancha (reusar el patrón del hero de `app/page.tsx`).
2. **¿Qué es La Canchita?** — 3 tarjetas de valor (⚡ Reserva sin llamar · 🔒 Abono seguro por la app · 📅 Ve horarios disponibles al instante).
3. **Cómo reservar en 3 pasos** — timeline vertical (reusar estética de pasos de la campaña): 1) Elige sede, día y hora · 2) Abona y sube tu comprobante · 3) Listo, te confirmamos.
4. **Instala la app** — `InstallSection` (condicional por OS).
5. **CTA final** — fondo oscuro `slate-900`, `ReservarCTA location="final"` + "¿Ya tienes cuenta? Inicia sesión".
6. **Footer** — logo, "La Canchita · Cali, Colombia", links a `/terms` y `/privacy`.

### Animaciones (Framer Motion)

| Elemento | Tipo | Detalle |
|----------|------|---------|
| Tarjetas de valor | Fade + slide-up on-scroll | `initial {opacity:0, y:16}` → `whileInView {opacity:1, y:0}`, `viewport={{ once:true }}`, stagger 80ms |
| Pasos del timeline | Reveal secuencial on-scroll | Igual patrón, stagger 120ms |
| CTA sticky móvil | Slide-up de entrada | `initial {y:80}` → `animate {y:0}` al montar |
| Instrucciones iOS (acordeón) | `AnimatePresence` height | Expandir/colapsar suave 200ms |
| CTA hover/tap | `active:scale-[0.98]` + `hover:-translate-y-0.5` | Consistente con CTAs existentes |

### Responsive

- **Mobile (< md)**: 1 columna, `max-w-xl mx-auto px-6`, CTA sticky inferior (`fixed bottom-0` con `pb-safe`).
- **Desktop (md+)**: mismo layout centrado `max-w-xl`; CTA deja de ser sticky y vive inline; tarjetas de valor pueden ir en grid 3-col.
- Tipografía: `h1` `text-4xl md:text-5xl font-black`; cuerpos `text-base` (nunca menor en elementos interactivos).

---

## 8. ANALYTICS

| Evento | Trigger | Propiedades |
|--------|---------|-------------|
| `reservation_landing_viewed` | On-mount de `LandingTrackers` | `venue_id` (string\|null), `has_sede` (bool) |
| `reservation_landing_cta_clicked` | Click en cualquier `ReservarCTA` | `venue_id`, `cta_location` ("hero"\|"final"), `logged_in` (bool) |
| `reservation_landing_install_shown` | `InstallSection` renderiza opción de instalar | `platform` ("android"\|"ios") |
| `reservation_landing_install_clicked` | Click en botón instalar (Android) o "ver instrucciones" (iOS) | `platform` |
| `booking_only_signup_completed` | Alta creada con `signupIntent = "booking"` | `venue_id` (si venía en el returnTo) |
| `casual_matches_activated` | Usuario solo-reservas activa partidos casuales | — (se disparará `onboarding_completed` al terminar el cuestionario) |

> Convención `snake_case`, `initAnalytics()` **lazy** (nunca importar analytics directo), definidas como `logReservationLanding*()` / `logBookingOnlySignupCompleted()` / `logCasualMatchesActivated()` en `lib/analytics.ts` siguiendo el patrón de `logCampaign*` y `logLocationAdminSignupCompleted`. No se incluye `match_id` (no aplica: esto es pre-reserva).

---

## 9. ARQUITECTURA TÉCNICA

### Modelo de datos

```typescript
// lib/domain/user.ts — UserProfile
/** Cuenta creada por el flujo de reservas: entra directo a reservar,
 *  sin el cuestionario de onboarding. Al activar "Partidos casuales"
 *  se pone en false y se corre el onboarding. Ausente ⇒ false (cuenta normal). */
bookingOnly?: boolean;

// lib/users.ts
export type SignupIntent = "location_admin" | "booking"; // + "booking"
```

- `bookingEnabled` ya existe (feature flag de reservas) — se reutiliza.
- `bookingOnly` es el único campo nuevo. Retrocompatible: ausente ⇒ cuenta normal (comportamiento actual intacto).

### Capa de dominio (`lib/domain/`)

- Función pura nueva (opcional, para testear el sanitizado):
  ```typescript
  // lib/domain/landing.ts (nuevo, pequeño)
  export function sanitizeVenueIdParam(raw: unknown): string | null;
  export function buildReservarReturnTo(venueId: string | null): string; // "/venues/<id>" | "/venues"
  ```
  Puras, sin Firebase, testeables — cubren el requisito de seguridad §4 y RN-02/03.

### Capa de API (`lib/`)

- **Landing**: sin funciones Firestore nuevas.
- **Alta solo-reservas** — `ensureUserProfile()` (`lib/users.ts`): nueva rama `signupIntent === "booking"` que crea el perfil con `roles: ["player"]`, `bookingEnabled: true`, `bookingOnly: true`. El intent se propaga por el mecanismo existente (`localStorage["signupIntent"]` → `consumeSignupIntent()` en `AuthContext` → `ensureUserProfile`). El CTA de la landing setea `localStorage.setItem("signupIntent", "booking")` antes de navegar a `/?returnTo=...`.
- **Activar partidos casuales** — nueva función `activateCasualMatches(uid)` (`lib/users.ts`): `updateDoc(users/{uid}, { bookingOnly: false })`. Idempotente. Tras el snapshot, `AuthGuard` redirige a `/onboarding` automáticamente (RN-11/RN-12).

### Componentes UI (`app/`)

- **Landing**: `app/reservar/page.tsx` (server), `app/reservar/LandingTrackers.tsx`, `app/reservar/ReservarCTA.tsx`, `app/reservar/InstallSection.tsx` (client). Reusa `usePWAInstall()`, logo, paleta `#1f7a4f`.
- **Gating solo-reservas**:
  - `components/AuthGuard.tsx` — el gate de onboarding (useEffect + render guard) agrega `&& !profile.bookingOnly`.
  - `app/page.tsx` — redirige `bookingOnly` a `/venues` (análogo al redirect actual de location admins a `/bookings`).
  - `components/BottomNav.tsx` — para `bookingOnly`, set de pestañas orientado a reservas (Reservar / Mis reservas / Perfil); oculta las centradas en partidos.
- **Activación de partidos** — `components/booking/ActivateCasualMatchesCard.tsx` (**NUEVO**): card en `/profile` con copy explicativo + botón "Activar partidos casuales" → `activateCasualMatches(uid)`.

### `firestore.rules`

- **Sin cambios** (ver §4).

---

## 10. CRITERIOS DE ACEPTACIÓN

- [ ] `/reservar` carga **sin sesión** y sin redirigir a login (fuera de `AuthGuard`).
- [ ] Con `?sede=<idVálido>`, el CTA apunta a `/?returnTo=%2Fvenues%2F<id>` y tras login aterriza en esa sede.
- [ ] Con `sede` ausente/ inválido, el CTA cae a `/?returnTo=%2Fvenues` sin romper.
- [ ] Un `sede` malicioso (`//evil.com`, `..%2f`) es descartado por el sanitizado (no genera open-redirect).
- [ ] En Android compatible aparece el botón de instalación nativo; al tocarlo dispara el prompt.
- [ ] En iOS se muestran instrucciones manuales (Compartir → Agregar a inicio), no un botón muerto.
- [ ] Si la app ya está instalada (standalone), la sección de instalación se oculta.
- [ ] La página funciona con JS deshabilitado (CTA = link `<a>` navegable).
- [ ] El preview de WhatsApp/redes muestra título, descripción e imagen (OG tags).
- [ ] Un usuario nuevo que llega por el QR **puede efectivamente reservar** tras registrarse (Decisión #1 resuelta).
- [ ] Un usuario nuevo del QR **NO** ve el cuestionario de onboarding: entra directo a `/venues/<sede>`.
- [ ] Su home (`/`) redirige a `/venues` y el `BottomNav` muestra pestañas de reservas.
- [ ] En `/profile` ve la card "Activar partidos casuales"; al activarla corre el onboarding y queda como jugador pleno.
- [ ] Un usuario existente (onboarding ya hecho) que escanea el QR **no** sufre regresiones (el intent solo aplica en el `create`).
- [ ] Se emiten los eventos de analytics con sus propiedades (landing + `booking_only_signup_completed` + `casual_matches_activated`).
- [ ] Contenido 100% en español; mobile-first; touch targets ≥ 48px.

---

## 11. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---------|--------|
| `app/reservar/page.tsx` | **NUEVO** — server component, `metadata` + OG, estructura estática, lee `searchParams.sede` |
| `app/reservar/LandingTrackers.tsx` | **NUEVO** — client, log de vista |
| `app/reservar/ReservarCTA.tsx` | **NUEVO** — client, CTA + returnTo + detección de sesión |
| `app/reservar/InstallSection.tsx` | **NUEVO** — client, `usePWAInstall`, iOS/Android/standalone |
| `lib/domain/landing.ts` | **NUEVO** — `sanitizeVenueIdParam`, `buildReservarReturnTo` (puras) |
| `lib/domain/landing.test.ts` | **NUEVO** — tests de sanitizado / returnTo |
| `lib/analytics.ts` | + `logReservationLanding*`, `logBookingOnlySignupCompleted`, `logCasualMatchesActivated` |
| `lib/domain/user.ts` | + campo `bookingOnly?: boolean` en `UserProfile` |
| `lib/users.ts` | `SignupIntent` += `"booking"`; rama de alta solo-reservas en `ensureUserProfile`; nueva `activateCasualMatches(uid)` |
| `lib/AuthContext.tsx` | Log `booking_only_signup_completed` cuando `isNewUser && signupIntent === "booking"` |
| `components/AuthGuard.tsx` | Gate de onboarding += `&& !profile.bookingOnly` (useEffect + render guard) |
| `app/page.tsx` | Redirigir `bookingOnly` a `/venues` |
| `components/BottomNav.tsx` | Set de pestañas para `bookingOnly` (orientado a reservas) |
| `app/profile/page.tsx` | Render de `ActivateCasualMatchesCard` para `bookingOnly` |
| `components/booking/ActivateCasualMatchesCard.tsx` | **NUEVO** — activar partidos casuales |
| `components/LandingPage.tsx` | Hero menciona reservas + nueva tarjeta "Reserva tu cancha" con link a `/reservar` (landing principal `lacanchita.app`) |
| `public/reservar/` | **NUEVO** (assets) — imagen OG (`og.png`), mockups de pasos/install si aplican |

---

## 12. CUENTA SOLO-RESERVAS Y MÓDULO «PARTIDOS CASUALES»

### Objetivo

Quien llega por el QR quiere **reservar una cancha**, no evaluarse para armar partidos. Forzar el cuestionario de onboarding (rating inicial: nivel, posiciones, físico, etc.) sería fricción que mata la conversión. Por eso el alta desde reservas crea una **cuenta solo-reservas** que entra directo a reservar, y deja los **partidos casuales** como un módulo opcional que el usuario activa cuando quiera (y solo entonces corre el cuestionario).

### Modelo de estados de la cuenta

```
                 signupIntent = "booking"
   (QR/landing) ─────────────────────────▶  SOLO-RESERVAS
                                             roles: ["player"]
                                             bookingEnabled: true
                                             bookingOnly: true
                                             initialRatingCalculated: (ausente)
                                             → NO onboarding · home = /venues
                                                     │
                          activa "Partidos casuales" │  activateCasualMatches()
                          (bookingOnly = false)      ▼
                                             JUGADOR PLENO (tras onboarding)
                                             bookingOnly: false
                                             initialRatingCalculated: true
                                             → home de partidos normal


   (registro normal, sin intent) ─────────▶  JUGADOR (flujo actual, con onboarding)
```

### Reglas

| # | Regla | Nota |
|---|-------|------|
| SR-01 | El alta con `signupIntent = "booking"` crea `{ roles:["player"], bookingEnabled:true, bookingOnly:true }`. | Reusa el intent pipeline existente (como `location_admin`) |
| SR-02 | Mientras `bookingOnly === true`: `AuthGuard` **no** fuerza `/onboarding` ni `/onboarding/phone`; `app/page.tsx` redirige a `/venues`. | El usuario navega y reserva sin cuestionario |
| SR-03 | Activar partidos: `bookingOnly = false`. En el siguiente snapshot, `AuthGuard` detecta `player + !initialRatingCalculated + !bookingOnly` → redirige a `/onboarding`. Al completarlo, `initialRatingCalculated = true`. | Un solo toggle dispara el flujo de onboarding ya existente |
| SR-04 | La activación es **irreversible** en v1 (no se vuelve a "solo-reservas"). No hay caso de uso para desactivar. | Simplicidad |
| SR-05 | Un usuario que YA existe (cuenta normal con onboarding hecho) y escanea el QR **no** se ve afectado: `ensureUserProfile` solo aplica el intent en el `create`; para docs existentes ignora el intent. | Sin regresiones para usuarios actuales |
| SR-06 | El teléfono no se fuerza a la cuenta solo-reservas. Si el flujo de reserva lo requiere, se pide inline en el sheet de reserva (fuera de alcance de este SDD; hoy no lo exige). | Menos fricción |

### Flujos de UI

**Alta solo-reservas** (continuación del flujo §6): tras el login, `returnTo` deja al usuario en `/venues/<sede>`. No ve onboarding. Reserva normalmente.

**Activar partidos casuales**:
```
1. Usuario solo-reservas entra a /profile
2. Ve la card "🎽 Activa los partidos casuales"
   "Arma y únete a partidos con otros jugadores. Te haremos unas preguntas
    rápidas para calcular tu nivel."  [Activar]
3. Toca "Activar" → activateCasualMatches(uid) → bookingOnly=false
4. AuthGuard redirige a /onboarding (cuestionario existente)
5. Completa → initialRatingCalculated=true → home de partidos normal
```

### Estados de UI (cuenta solo-reservas)

| Estado | Qué muestra |
|--------|-------------|
| Home (`/`) | Redirección a `/venues` (no ve la home de partidos) |
| BottomNav | Reservar · Mis reservas · Perfil (sin pestañas de partidos) |
| `/profile` | Perfil básico + card "Activar partidos casuales" |
| Durante activación | Botón en loading; luego redirect a onboarding |
| Post-onboarding | Experiencia de jugador pleno estándar |

---

## 13. FEATURE FLAG — Encendido/apagado por super admin (sin redeploy)

La landing de reservas está detrás de un **flag global dinámico** que el super admin prende/apaga desde la app, sin tocar código ni redeployar.

### Modelo
- Doc Firestore **`config/reservations`** → `{ landingEnabled: boolean }`. Ausente ⇒ **apagado**.
- **Rules**: lectura **pública** (`allow read: if true` — solo expone un booleano; la landing se ve sin sesión), escritura **solo super admin**.

### Superficies gateadas
| Superficie | Cómo lee el flag | Si está apagado |
|-----------|------------------|-----------------|
| Ruta pública `/reservar` (server component) | REST de Firestore (`isReservarLandingEnabledServer`, `revalidate: 15s`) | `notFound()` → 404 |
| Landing principal `LandingPage` (cliente) | `getReservationsConfig()` (SDK, estado) | Oculta tarjeta/mención de reservas |
| Toggle admin (`ReservationsLandingToggle`) | `subscribeToReservationsConfig` (en vivo) | Muestra "Apagada" |

### Archivos
| Archivo | Rol |
|---------|-----|
| `lib/reservationsConfig.ts` | Cliente: `getReservationsConfig`, `subscribeToReservationsConfig`, `setReservationsLandingEnabled` |
| `lib/reservationsConfig.server.ts` | Server: `isReservarLandingEnabledServer` (REST, sin SDK cliente) |
| `components/booking/ReservationsLandingToggle.tsx` | Switch en `/venues` (self-gated a super admin) |
| `firestore.rules` | `match /config/reservations` (read público, write super admin) |

> **Deploy**: las **rules requieren `firebase deploy --only firestore:rules` manual**. Hasta desplegarlas, el flag queda apagado (read/write denegados por default) y el toggle no persiste. El front auto-deploya en push a `main`.

---

## ⚠️ Decisiones de Diseño Clave (CERRADAS)

1. **Acceso a reservar para usuarios nuevos — RESUELTO (Opción A).** Hoy `hasBookingAccess(profile)` exige `bookingEnabled === true` o super admin; `/venues/[id]` redirige a `/` si no lo cumple. **Decisión**: el alta con `signupIntent = "booking"` crea el perfil con `bookingEnabled: true`. Cambio mínimo y dirigido; conserva el gating para el resto de flujos.

6. **Cuenta solo-reservas sin onboarding + módulo «Partidos casuales» activable — NUEVO (decisión del usuario).** Quien se registra por el QR **no** pasa por el cuestionario: nace `bookingOnly: true` y va directo a reservar. El módulo de partidos casuales se activa después desde `/profile` (flip de `bookingOnly` → corre el onboarding existente). Retrocompatible (perfiles sin `bookingOnly` = comportamiento actual) y sin cambios de Firestore Rules. Activación irreversible en v1. Ver §12. **Confirmar el nombre visible del módulo** ("Partidos casuales") y la ubicación de la entrada de activación (`/profile`).

2. **Landing genérica vs. branding por sede — RESUELTO (Genérica).** El QR trae `sede`, pero las sedes **no son legibles sin auth** (`match /venues` exige `request.auth`). **Decisión v1**: landing **genérica** (no muestra nombre/foto de la sede) + deep-link inteligente que lleva a la sede correcta tras login. El branding por sede (colección pública `public_venue_cards` + rules + Cloud Function) queda como mejora futura, **fuera de alcance v1**.

3. **URL del QR — RESUELTO (`?sede=`).** Formato: `lacanchita.app/reservar?sede=<venueId>`. Directo, sin mapeo slug→venueId. La variante `/reservar/<slug>` queda descartada para v1.

4. **CTA lanza Google directo (popup).** El CTA dispara `loginWithGoogle()` en el acto (como `registro-admin`), setea el intent `"booking"` y al resolver navega a `/venues/<sede>`. Un solo toque, sin pantalla intermedia. Fallback: en navegador in-app (Instagram/WhatsApp) cae a `/?returnTo=...` (instructivo de `LandingPage`), porque el popup de Google no funciona ahí.

5. **Sin dependencia de Firestore en la landing.** Página estática de marketing (como `campaigns/`), cero reads, servida por CDN. Cualquier dato dinámico queda para después del login.
