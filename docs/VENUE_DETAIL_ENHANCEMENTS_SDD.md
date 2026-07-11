# Feature: Mejoras a la Página de Detalle de Sede

## 📋 Specification-Driven Development (SDD)

La página de detalle de sede (`app/venues/[id]/page.tsx`) hoy solo muestra nombre, dirección diminuta y el flujo formato → fecha → horario. No "vende" la cancha (sin fotos reales, sin amenidades, sin contacto accionable) ni acompaña bien la decisión de reservar. Este SDD agrega información de sede, contacto/ubicación tocables, preview de políticas, estados vacíos, resumen persistente de la selección y pulido de carga.

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo

Aumentar la conversión y la confianza en el punto de reserva. Quien abre una sede debe poder, sin salir de la app: **ver cómo es la cancha** (fotos + atributos), **saber cómo llegar y contactar**, **entender las reglas antes de comprometerse**, y **tener control claro de lo que está seleccionando**. Además, eliminar fricciones visuales (parpadeo al cambiar de fecha, listas vacías sin explicación).

### Alcance

- ✅ **Info de sede**: galería multi-foto, fila de amenidades con iconos, tipo de superficie, techada/descubierta, subtítulo de tamaño en formatos.
- ✅ **Contacto y ubicación accionables**: dirección legible tocable a Google Maps, botones WhatsApp / llamar.
- ✅ **Preview de políticas** de reserva (colapsable) antes de abrir el `BookingConfirmSheet`.
- ✅ **Empty state** de disponibilidad (día deshabilitado o sin slots libres).
- ✅ **Resumen persistente** de la selección sobre el botón sticky.
- ✅ **Loading local** del `SlotList` al cambiar de fecha (sin parpadeo de datos viejos).
- ✅ **Ventana de fechas configurable** por sede (`bookingWindowDays`).
- ✅ **Edición admin**: galería y amenidades **solo Super Admin**; superficie/cubierta **por cancha** (en el editor de canchas); ventana de fechas.
- ✅ **Galería con subida real a Firebase Storage** (reusa `lib/storage.ts` + `imageCompression`), no URLs pegadas. Ver Decisión Clave #1.
- ❌ **NO** rediseña el flujo de reserva ni el `BookingConfirmSheet` interno (solo se antepone el preview).
- ❌ **NO** agrega reviews/ratings de usuarios (fuera de alcance v1).

### Reglas de Negocio

| # | Regla | Impacto UI |
|---|-------|------------|
| RN-01 | La galería (`gallery`) es un array de URLs de descarga de Firebase Storage (máx **8**), subidas por el Super Admin desde el panel (comprimidas cliente-side). La portada sigue siendo `imageURL`; si `gallery` está vacío se usa solo `imageURL`. Si ambos faltan → placeholder de marca actual. | Carrusel horizontal de fotos; si hay 1 sola, imagen estática |
| RN-02 | Las amenidades (`amenities`) son un set de flags de un catálogo cerrado (`VenueAmenity`). Solo se muestran las presentes; sección oculta si el array está vacío/ausente. | Fila de chips con icono `lucide` + label |
| RN-03 | `surface` (superficie) y `covered` (techada/descubierta) son atributos **por cancha** (`Court.surface`, `Court.covered`). La vista de jugador **agrega** los valores distintos de las canchas activas: si todas comparten superficie ⇒ un solo chip; si difieren ⇒ un chip por cada valor distinto. Ausentes ⇒ no se muestran. | Chips "Sintética" / "Techada" (agregados) |
| RN-04 | La dirección se muestra legible (contraste AA) y es un enlace a Google Maps construido con `lat`/`lng` (fallback: `address` URL-encoded si faltan coords). | Dirección tocable con icono de mapa |
| RN-05 | Si la sede tiene `whatsappNotificationNumber` → botón "WhatsApp"; si tiene `phone` → botón "Llamar". Se muestran solo los que existan. WhatsApp abre `wa.me` con mensaje pre-lleno del nombre de la sede. | Botones de contacto bajo el header |
| RN-06 | El preview de políticas usa `getEffectiveBookingPolicies(venue)`. Si el resultado es `[]` (sede sin políticas) → no se muestra la sección. Colapsado por defecto, muestra las primeras 2 y "Ver todas (N)". | Acordeón de políticas antes del sticky |
| RN-07 | Si el día seleccionado tiene `schedule.enabled === false` o **cero slots** en el schedule → empty state "cerrado / sin horarios este día". Si hay slots pero **ninguno disponible** (todos ocupados o "muy pronto") → empty state distinto "sin cupos libres, prueba otro día". | Dos empty states diferenciados |
| RN-08 | Mientras se recarga el schedule al cambiar de fecha, el `SlotList` muestra un skeleton local en vez de los slots del día anterior. | Skeleton de ~4 filas |
| RN-09 | `bookingWindowDays` (rango **1–30**, default **7**) define cuántos días hacia adelante ofrece el `DateCarousel`. Ausente ⇒ 7 (comportamiento actual). | Carrusel de fechas de longitud configurable |
| RN-10 | El resumen persistente aparece cuando hay `selectedStart` y `selectedEnd`: muestra fecha legible + rango horario (12h AM/PM, consistente con toda la app — nunca 24h) + duración (ej. "Sáb 12 Jul · 8:00 AM – 10:00 AM · 2h") arriba del botón "Confirmar". | Barra-resumen sobre el sticky |
| RN-11 | Todo el contenido visible en **español**; mobile-first (touch targets ≥ 44px, `pb-24 md:pb-0`). | — |
| RN-12 | Los campos nuevos son **retrocompatibles**: toda sede existente (sin `gallery`/`amenities`/`surface`/`covered`/`bookingWindowDays`) renderiza exactamente como hoy salvo las mejoras que no dependen de datos (contacto, mapa, empty states, resumen, loading). | Sin migración de datos |

---

## 2. ESCALABILIDAD

### Volumen esperado

- **Lecturas**: la página ya hace `getVenue` + `getVenueCourts` + `getVenueCombos` (one-shot) y subscribe a bookings/blocked del día. Los campos nuevos de sede (`gallery`, `amenities`, `bookingWindowDays`) viven en el doc `venues/{venueId}`; los de superficie (`surface`, `covered`) en los docs de `courts` **que ya se cargan** → **cero reads adicionales**. Impacto de tamaño despreciable (< 1 KB por doc).
- **Imágenes**: la galería son URLs de descarga de Firebase Storage servidas por `next/image unoptimized`. Se comprimen cliente-side antes de subir (reusa `compressPaymentProof` → ~500 KB máx). 8 fotos × N sedes: costo de Storage marginal (unas pocas MB por sede); ancho de banda de descarga por el CDN de Storage, no por Firestore.
- Tráfico estimado: fase inicial 5–20 sedes, decenas de aperturas de detalle/día. Irrelevante para infra.

### Índices Firestore requeridos

- **Ninguno nuevo.** No se agregan queries; los campos nuevos se leen dentro del doc de sede que ya se carga. Las suscripciones a `bookings`/`blocked_slots` por fecha ya usan sus índices existentes.

### Paginación

- La **galería** se limita por diseño a 8 items (RN-01) → sin paginación, se renderiza completa en un carrusel con scroll horizontal + lazy loading de `next/image`.
- El `DateCarousel` ya es finito (`bookingWindowDays`, máx 30) → sin paginación.

---

## 3. CONCURRENCIA SEGURA

### Operaciones que requieren `runTransaction()`

- **Ninguna nueva en la vista de jugador.** Esta feature es de **lectura y presentación**: no escribe estado compartido. La única escritura es la creación de reserva (`createBooking`), que **no cambia** y ya está cubierta por [RESERVAS_APROBACION_CREA_RESERVA_SDD.md](RESERVAS_APROBACION_CREA_RESERVA_SDD.md).
- **Edición admin** de los campos nuevos usa `updateVenueSettings` (un `updateDoc` sobre el doc de sede). No es estado concurrente sensible (lo edita 1 admin a la vez, no compite con reservas). El patrón actual de "último en guardar gana" es aceptable, igual que el resto de la config de sede.

### Race conditions identificadas

- **N/A para el flujo de reserva** (sin cambios). El único punto de escritura de la feature (config admin de sede) no tiene contención real: la disponibilidad se computa siempre en tiempo real desde `bookings`/`blocked_slots`, no desde los campos nuevos.

---

## 4. SEGURIDAD

### Autenticación y autorización

| Acción | Quién | Validación |
|--------|-------|------------|
| Ver detalle de sede (incl. campos nuevos) | Usuario con `hasBookingAccess` | Ya existe (redirect a `/` si no) + `allow read: if request.auth != null` |
| Editar `gallery` / `amenities` de la sede | **Solo Super Admin** | Se agregan a la lista bloqueada del `allow update` de `venues/{venueId}` |
| Editar `bookingWindowDays` de la sede | Super Admin o Location Admin | Operacional (como `weekendMinLeadHours`), no sensible |
| Editar `surface` / `covered` de una cancha | Super Admin o Location Admin | Sub-colección `courts` — regla `write` existente |
| Subir imágenes de galería a Storage | **Solo Super Admin** | `storage.rules` nueva ruta `venues/{venueId}/gallery/**` |

### Firestore Rules requeridas

**Cambio en `venues/{venueId}`**: `gallery` y `amenities` pasan a ser editables **solo por Super Admin** (Decisión #3). Se agregan a la lista bloqueada para Location Admin, junto a `paymentMethods` y `hidePricesForLocationAdmins`:

```
// firestore.rules — venues/{venueId}
allow update: if request.auth != null
  && (
    isSuperAdmin()
    || (
      isLocationAdminFor(venueId)
      && !request.resource.data.diff(resource.data).affectedKeys()
           .hasAny(['paymentMethods', 'hidePricesForLocationAdmins',
                    'gallery', 'amenities'])   // ← nuevas keys bloqueadas
    )
  );
```

> `bookingWindowDays` **no** se bloquea (lo edita también el Location Admin). `surface`/`covered` viven en la sub-colección `courts`, cuya regla `write` ya permite Super Admin **o** Location Admin — sin cambios ahí.

**Cambio en `storage.rules`** — nueva ruta para la galería, escritura solo Super Admin, lectura para autenticados:

```
// storage.rules
match /venues/{venueId}/gallery/{imageId} {
  allow read: if request.auth != null;
  allow write: if request.auth != null
    && firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.roles.hasAny(['super_admin'])
    && request.resource.size < 2 * 1024 * 1024        // < 2 MB (ya viene comprimida)
    && request.resource.contentType.matches('image/.*');
}
```

> El check exacto de Super Admin debe alinearse con cómo `isSuperAdmin()` está definido en `firestore.rules` (rol en `users/{uid}`). Se replica esa lógica en `storage.rules` con `firestore.get`.

### Validaciones de input

Validaciones puras en `lib/domain/venue.ts` (nunca confiar en el cliente — OWASP):

- **`gallery`**: array de ≤ `MAX_GALLERY_IMAGES` (8); cada item string no vacío que empiece por `https://` (URLs de descarga de Storage; previene `javascript:`/`data:` injection en `src`). Función `validateGallery(urls: string[])`.
- **`amenities`**: array de valores dentro de `VENUE_AMENITIES` (enum cerrado); sin duplicados. Función `validateAmenities()`.
- **`surface`** (por cancha): valor dentro de `SURFACE_TYPES` o `undefined`. Validado en `validateCourt`/al guardar canchas.
- **`covered`** (por cancha): `boolean | undefined`.
- **Archivo de imagen** (antes de subir): reusar `validatePaymentProofFile` (tipo image, tamaño) + `compressPaymentProof` de `lib/utils/imageCompression.ts`.
- **`bookingWindowDays`**: entero `1..30`. Función `validateBookingWindowDays()`.
- **URLs de mapa/WhatsApp**: se construyen con datos ya validados de la sede y `encodeURIComponent`; nunca se concatena texto libre del usuario. WhatsApp reusa `validateWhatsAppNumber` (ya existe).

### Datos sensibles

- Ningún campo nuevo es sensible. La galería y amenidades son contenido de marketing público (dentro de la app autenticada). No hay PII nueva. `phone`/`whatsappNotificationNumber` ya se exponen hoy en el doc de sede a cualquier usuario autenticado (contacto público de la sede, no de un usuario). La restricción de escritura a Super Admin (galería/amenidades) es por **gobernanza de contenido** (que el owner de sede no suba fotos inapropiadas), no por confidencialidad.

---

## 5. TOLERANCIA A FALLOS

### Estados de error y fallbacks

| Error | Causa probable | Fallback UI |
|-------|---------------|-------------|
| Una imagen de la galería 404/timeout | URL rota / CDN caído | `onError` oculta ese slide; si TODAS fallan → placeholder de marca (patrón de `VenueCard`) |
| `gallery` ausente pero `imageURL` presente | Sede legacy | Se muestra `imageURL` como imagen única (sin carrusel) |
| Ambos ausentes | Sede sin fotos | Degradado verde de marca + icono/emoji (comportamiento actual) |
| `getVenueSchedule` falla | Firestore offline / permisos | `handleError` (toast) + empty state "No pudimos cargar los horarios · reintentar" con botón que re-dispara el fetch |
| Schedule tarda | Red lenta | Skeleton local del `SlotList` (RN-08) hasta resolver |
| Google Maps no abre | Sin app de mapas | Es un `<a href>` a `https://www.google.com/maps/...` → el navegador lo maneja; nunca botón muerto |
| WhatsApp no instalado | — | `wa.me` abre WhatsApp Web/tienda; degradación del navegador |
| `bookingWindowDays` inválido en el doc | Dato corrupto | `clampBookingWindowDays()` lo acota a `1..30`; default 7 |
| Falla la subida de una foto (admin) | Red / Storage / archivo inválido | `handleError` (toast) + el estado del uploader vuelve a `idle`; la galería no se altera hasta que la subida resuelve con URL (mismo patrón que `PaymentProofUploader`) |
| Imagen muy pesada | Foto grande | `validatePaymentProofFile` + `compressPaymentProof` la reducen antes de subir; si excede el límite tras comprimir, se rechaza con toast |

### Retry strategy

- **Schedule**: el empty state de error ofrece "Reintentar" (re-ejecuta el `useEffect` de carga vía un `retryKey`). Las suscripciones a bookings/blocked reintentan solas (Firestore SDK).
- **Imágenes**: sin retry automático — se ocultan; el usuario puede reservar igual (las fotos no son bloqueantes).

### Degradación elegante

- La feature es **aditiva**: si cualquier bloque nuevo falla (galería, amenidades, contacto), el flujo core formato → fecha → horario → confirmar sigue intacto. Ningún bloque nuevo es prerequisito de reservar.

---

## 6. UX — FLUJOS DE USUARIO

### Flujo principal (happy path)

```
1. Usuario abre /venues/<id>
2. Ve el header: carrusel de fotos (swipe) + botón atrás
3. Debajo: nombre, dirección tocable (→ mapa), botones WhatsApp/Llamar
4. Fila de amenidades (⚡ luz · 🅿️ parqueadero · 🚿 camerinos · superficie · techada)
5. (Opcional) descripción de la sede
6. Preview de políticas colapsado ("Antes de reservar · ver reglas")
7. Selecciona Formato → Fecha → toca horarios (se suman)
8. Al seleccionar, aparece la barra-resumen ("Sáb 12 · 8–10 · 2h") + botón "Confirmar · $X"
9. Toca Confirmar → BookingConfirmSheet (sin cambios) → reserva
```

### Flujos alternativos

- **Cambio de fecha**: al tocar otro día, el `SlotList` muestra skeleton mientras carga; luego anima la entrada de los nuevos slots (transición existente del `SlotList`).
- **Día cerrado / sin horarios**: empty state "La sede no abre este día" con sugerencia de elegir otra fecha.
- **Sin cupos libres**: empty state "No quedan horarios libres · prueba otro día"; los slots ocupados igual pueden verse (comportamiento actual del filtro).
- **Sede sin fotos/amenidades/políticas**: cada sección se oculta; la página se ve limpia, no rota.
- **Error de carga de horarios**: empty state con "Reintentar".

### Estados de UI

| Estado | Qué muestra |
|--------|-------------|
| Cargando (inicial) | Skeleton de página existente, **ampliado** para reflejar galería + fila de amenidades |
| Cargando (cambio de fecha) | Skeleton local de slots (RN-08); el resto de la página permanece |
| Vacío — día cerrado | Icono calendario + "La sede no abre este día" |
| Vacío — sin cupos | Icono reloj + "No quedan horarios libres hoy · prueba otro día" |
| Error — horarios | "No pudimos cargar los horarios" + botón Reintentar |
| Sin selección | Sin barra-resumen ni sticky (como hoy) |
| Con selección | Barra-resumen + botón Confirmar sticky |
| Éxito | Navega a `/bookings/<id>` (sin cambios) |

### Consideraciones mobile-first

- Carrusel de fotos con **scroll-snap** horizontal, indicador de puntos; touch-friendly.
- Botones de contacto ≥ 44px, full-width en fila.
- La barra-resumen respeta el `sticky bottom-20 md:bottom-4` actual y el `pb-24 md:pb-0`.
- Dirección y chips con `text-base`/`text-sm` legibles (nunca `text-slate-400 text-xs` para info accionable — se corrige el contraste AA actual).
- Inputs del editor admin con `text-base` (regla anti-zoom iOS).

---

## 7. UI DESIGN — COMPONENTES Y ANIMACIONES

### Componentes nuevos

| Componente | Ubicación | Props | Propósito |
|------------|-----------|-------|-----------|
| `VenueGallery` | `components/booking/VenueGallery.tsx` | `{ images: string[]; venueName: string }` | Carrusel scroll-snap con dots; fallback a placeholder de marca |
| `VenueAmenities` | `components/booking/VenueAmenities.tsx` | `{ amenities?: VenueAmenity[]; anyCovered?: boolean }` | Chips de servicios + chip destacado "Cancha techada" si aplica; se oculta si no hay nada |
| `VenueFormatPicker` | `components/booking/VenueFormatPicker.tsx` | `{ formats; selected; onSelect; venueFormats?; courts; combos }` | Picker de formato en **filas ricas** (nombre + tamaño + superficie/condición + precio dentro de cada fila). Antepone **pestañas por deporte solo si la sede tiene >1 deporte**; con 1 deporte, solo filas. La superficie vive dentro de cada opción → sin ambigüedad multi-deporte |
| `VenueContactActions` | `components/booking/VenueContactActions.tsx` | `{ venue: Pick<Venue,"phone"\|"whatsappNotificationNumber"\|"lat"\|"lng"\|"address"\|"name"> }` | Dirección→mapa + botones WhatsApp/Llamar |
| `BookingPoliciesPreview` | `components/booking/BookingPoliciesPreview.tsx` | `{ policies: string[] }` | Acordeón: 2 visibles + "Ver todas (N)" con `AnimatePresence` |
| `SelectionSummaryBar` | `components/booking/SelectionSummaryBar.tsx` | `{ date: string; startTime: string; endTime: string; durationLabel: string }` | Resumen compacto sobre el sticky |
| `SlotListSkeleton` | `components/skeletons/SlotListSkeleton.tsx` | — | ~4 filas pulse para la recarga por fecha |
| `VenueAmenitiesEditor` | `components/booking/VenueAmenitiesEditor.tsx` | `{ value: VenueAmenity[]; onChange }` | Editor admin (Super Admin): toggles de amenidades. Superficie/cubierta NO van acá (son por cancha → `CourtConfigEditor`) |
| `VenueGalleryEditor` | `components/booking/VenueGalleryEditor.tsx` | `{ venueId: string; value: string[]; onChange }` | Editor admin (Super Admin): sube a Storage (reusa `imageCompression` + `uploadVenueGalleryImage`), thumbnails con quitar/reordenar, máx 8 |

> **Decisión de diseño del picker (iterada con el usuario):** en vez de la grilla de cards, la vista de jugador usa `VenueFormatPicker` con **filas de ancho completo** (patrón Playtomic/Matchi): cada formato lleva su tamaño, superficie/condición y precio dentro de la fila, lo que elimina la ambigüedad de mostrar superficies sueltas en sedes multi-deporte. Las **pestañas por deporte** aparecen solo cuando hay más de un deporte (si no, degradan a filas planas). `FormatSelector` (grilla) se conserva para el admin (`AdminSlotPicker`).

### Animaciones (Framer Motion)

| Elemento | Tipo | Detalle |
|----------|------|---------|
| Galería (slides) | Scroll-snap nativo | CSS `snap-x snap-mandatory`; dots con `layoutId` para el activo |
| Amenidades / contacto | Fade-in on-mount | `initial {opacity:0, y:8}` → `animate` stagger 40ms |
| Preview de políticas | `AnimatePresence` height | Expandir/colapsar 200ms al tocar "Ver todas" |
| Barra-resumen | Slide-up de entrada | `initial {y:20, opacity:0}` → `animate {y:0, opacity:1}` al aparecer selección |
| Skeleton de slots | Pulse | `animate-pulse` (Tailwind), sin Framer |
| Empty states | Fade-in | `initial {opacity:0}` → `animate {opacity:1}` |

### Responsive

- **Mobile (< md)**: 1 columna, `max-w-md mx-auto` (como hoy). Galería full-bleed en el header (h-48/h-56). Contacto en fila de 2-3 botones.
- **Desktop (md+)**: mismo `max-w-md` centrado (consistente con el resto de la app booking). Barra-resumen deja de ser tan protagonista pero se mantiene.
- Chips de amenidades: `flex flex-wrap gap-2`.

---

## 8. ANALYTICS

| Evento | Trigger | Propiedades |
|--------|---------|-------------|
| `venue_gallery_swiped` | Usuario cambia de slide en la galería (primer swipe por sesión de vista) | `venue_id`, `image_count` |
| `venue_contact_clicked` | Toca WhatsApp / Llamar / Mapa | `venue_id`, `channel` ("whatsapp"\|"phone"\|"map") |
| `venue_policies_expanded` | Expande el preview de políticas | `venue_id`, `policy_count` |
| `booking_no_availability_shown` | Se muestra un empty state de disponibilidad | `venue_id`, `date`, `reason` ("closed"\|"no_slots_free") |

> Convención `snake_case`, `initAnalytics()` **lazy**, definidos como `logVenueGallerySwiped()`, `logVenueContactClicked()`, `logVenuePoliciesExpanded()`, `logBookingNoAvailabilityShown()` en `lib/analytics.ts`, siguiendo el patrón de `logVenueViewed`/`logBooking*`. No aplica `match_id` (es pre-reserva, contexto de sede). Reutiliza el `venue_id` ya presente en el resto de eventos de booking.

---

## 9. ARQUITECTURA TÉCNICA

### Modelo de datos

```typescript
// lib/domain/venue.ts — nuevos tipos

/** Amenidades de una sede. Catálogo cerrado; se renderiza icono + label. */
export type VenueAmenity =
    | "parking"       // Parqueadero
    | "lighting"      // Iluminación nocturna
    | "showers"       // Duchas
    | "lockers"       // Camerinos / lockers
    | "shoe_rental"   // Alquiler de guayos
    | "cafeteria"     // Cafetería / bar
    | "bathrooms"     // Baños
    | "wifi";         // WiFi

export const VENUE_AMENITIES: VenueAmenity[] = [
    "parking", "lighting", "showers", "lockers",
    "shoe_rental", "cafeteria", "bathrooms", "wifi",
];

export const VENUE_AMENITY_LABELS: Record<VenueAmenity, string> = { /* español */ };
// El icono lucide por amenidad vive en el componente (no en dominio).

/** Tipo de superficie de las canchas de la sede. */
export type SurfaceType = "synthetic" | "natural" | "hardcourt" | "sand" | "parquet";
export const SURFACE_TYPES: SurfaceType[] = ["synthetic", "natural", "hardcourt", "sand", "parquet"];
export const SURFACE_LABELS: Record<SurfaceType, string> = { /* Sintética, Natural, ... */ };

/** Ventana de reserva (días hacia adelante). */
export const MIN_BOOKING_WINDOW_DAYS = 1;
export const MAX_BOOKING_WINDOW_DAYS = 30;
export const DEFAULT_BOOKING_WINDOW_DAYS = 7;
export const MAX_GALLERY_IMAGES = 8;

// lib/domain/venue.ts — interface Venue (campos nuevos, todos opcionales)
export interface Venue {
    // ...campos actuales...
    /** Galería de fotos (URLs de descarga de Storage). Portada sigue en imageURL. Máx 8. */
    gallery?: string[];
    /** Amenidades presentes en la sede. */
    amenities?: VenueAmenity[];
    /** Días reservables hacia adelante (1–30). Ausente ⇒ 7. */
    bookingWindowDays?: number;
    // NOTA: surface/covered NO van acá — son por cancha (Decisión #2).
}

// lib/domain/venue.ts — interface Court (campos nuevos, opcionales)
export interface Court {
    // ...campos actuales (id, name, baseFormat, active, sortOrder)...
    /** Tipo de superficie de esta cancha. */
    surface?: SurfaceType;
    /** true = techada/cubierta. Ausente ⇒ desconocido (no se muestra). */
    covered?: boolean;
}
```

### Capa de dominio (`lib/domain/`)

Funciones puras nuevas en `lib/domain/venue.ts` (+ tests en `venue.test.ts` si existe, o `venueDetail.test.ts`):

```typescript
export function validateGallery(urls: string[]): void;          // ≤8, https only
export function validateAmenities(a: VenueAmenity[]): void;     // enum + sin duplicados
export function validateBookingWindowDays(n: number): void;     // entero 1..30
export function clampBookingWindowDays(n: number | undefined): number; // → 1..30, default 7
export function buildMapsUrl(v: Pick<Venue,"lat"|"lng"|"address">): string; // google maps
export function buildVenueWhatsAppUrl(num: string, venueName: string): string; // wa.me + msg
export function galleryImages(v: Pick<Venue,"gallery"|"imageURL">): string[]; // merge portada+galería
export function formatSelectionSummary(date: string, start: string, end: string): {
    dateLabel: string; timeRange: string; durationLabel: string;
}; // "Sáb 12 Jul", "8:00 AM – 10:00 AM", "2h"

// Agregación de superficie/cubierta desde las canchas activas (Decisión #2):
export function venueSurfaces(courts: Court[]): SurfaceType[];   // distintos, orden de SURFACE_TYPES
export function venueCoverage(courts: Court[]): { anyCovered: boolean; anyUncovered: boolean };
```

> `buildMapsUrl` usa `https://www.google.com/maps/search/?api=1&query=<lat>,<lng>` (o `query=<address encoded>` si faltan coords). `buildVenueWhatsAppUrl` reusa el formato de `formatWhatsAppNotifyMessage` adaptado a pre-reserva.

### Capa de API (`lib/`)

- `updateVenueSettings` (`lib/venues.ts`) **amplía su `Partial<Pick<...>>`** para aceptar `gallery`, `amenities`, `bookingWindowDays`. `surface`/`covered` se persisten con las canchas (flujo de guardado de `courts` existente en el panel admin). `createVenue`/`CreateVenueInput` **no** cambian.
- **Storage** (`lib/storage.ts`): nueva `uploadVenueGalleryImage(venueId: string, blob: Blob): Promise<{ url: string; path: string }>` — sube a `venues/{venueId}/gallery/{uuid}.jpg` y devuelve la download URL, siguiendo el patrón de `uploadPaymentProof`. Opcional: `deleteVenueGalleryImage(path)` para limpieza al quitar una foto.

### Componentes UI (`app/`)

- **`app/venues/[id]/page.tsx`** (jugador): orquesta los componentes nuevos; agrega estado `scheduleLoading` para el skeleton local; pasa `labelStyle="client"` a `FormatSelector`; usa `clampBookingWindowDays(venue.bookingWindowDays)` como `daysAhead`; deriva empty states desde `schedule` + `slots`.
- **`app/venues/admin/[id]/page.tsx`** (admin): monta `VenueGalleryEditor` y `VenueAmenitiesEditor` (solo si `isSuperAdmin`) + input de `bookingWindowDays` (super o location admin), guardando vía `updateVenueSettings`.
- **`components/booking/CourtConfigEditor.tsx`**: cada cancha gana un select de superficie + toggle "techada" (persisten en `Court.surface`/`Court.covered`).

### `firestore.rules` y `storage.rules`

- **`firestore.rules`**: `gallery` + `amenities` agregadas a la lista bloqueada para Location Admin en `venues/{venueId}` (ver §4).
- **`storage.rules`**: nueva ruta `venues/{venueId}/gallery/**` con escritura solo Super Admin (ver §4).

---

## 10. CRITERIOS DE ACEPTACIÓN

- [ ] Una sede con `gallery` de N fotos muestra un carrusel con swipe + dots; con 1 foto, imagen estática; sin fotos, placeholder de marca.
- [ ] Las amenidades presentes se muestran como chips con icono; sin amenidades, la sección no aparece.
- [ ] `surface` y `covered` se muestran como chips cuando existen; ausentes, no se muestran.
- [ ] La dirección es legible (contraste AA) y abre Google Maps con las coordenadas de la sede.
- [ ] Aparecen botones WhatsApp y/o Llamar solo si la sede tiene esos datos; WhatsApp abre `wa.me` con mensaje pre-lleno.
- [ ] El preview de políticas muestra 2 y expande al resto; si la sede no tiene políticas, no aparece.
- [ ] Día cerrado / sin slots ⇒ empty state "cerrado"; día con todo ocupado ⇒ empty state "sin cupos".
- [ ] Al cambiar de fecha se ve un skeleton local de slots, no los del día anterior.
- [ ] Con selección activa, se ve la barra-resumen con fecha + rango + duración sobre el botón Confirmar.
- [ ] `bookingWindowDays` configurado en admin cambia la longitud del carrusel de fechas (acotado 1–30); ausente ⇒ 7.
- [ ] Un `gallery` con URL no http(s) es rechazado por `validateGallery` en el editor admin.
- [ ] Los formatos muestran subtítulo de tamaño (ej. "Doble (9vs9)").
- [ ] Una sede legacy (sin ningún campo nuevo) renderiza sin errores y con las mejoras no-dependientes de datos.
- [ ] Se emiten los eventos de analytics nuevos con sus propiedades.
- [ ] Contenido 100% en español; touch targets ≥ 44px; sin regresiones en el flujo de reserva.

---

## 11. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---------|--------|
| `lib/domain/venue.ts` | + tipos `VenueAmenity`/`SurfaceType`, constantes, campos en `Venue` y `Court`, y helpers puros (`validate*`, `clampBookingWindowDays`, `buildMapsUrl`, `buildVenueWhatsAppUrl`, `galleryImages`, `formatSelectionSummary`, `venueSurfaces`, `venueCoverage`) |
| `lib/domain/venue.test.ts` | **NUEVO/AMPLIAR** — tests de los helpers/validadores/agregación |
| `lib/venues.ts` | Ampliar `Pick` de `updateVenueSettings` con `gallery`, `amenities`, `bookingWindowDays` |
| `lib/storage.ts` | + `uploadVenueGalleryImage()` (y opcional `deleteVenueGalleryImage()`) |
| `lib/analytics.ts` | + `logVenueGallerySwiped`, `logVenueContactClicked`, `logVenuePoliciesExpanded`, `logBookingNoAvailabilityShown` |
| `app/venues/[id]/page.tsx` | Orquesta componentes nuevos, `scheduleLoading`, empty states, `labelStyle="client"`, `bookingWindowDays`, agrega superficies de canchas |
| `components/booking/VenueGallery.tsx` | **NUEVO** |
| `components/booking/VenueAmenities.tsx` | **NUEVO** |
| `components/booking/VenueContactActions.tsx` | **NUEVO** |
| `components/booking/BookingPoliciesPreview.tsx` | **NUEVO** |
| `components/booking/SelectionSummaryBar.tsx` | **NUEVO** |
| `components/skeletons/SlotListSkeleton.tsx` | **NUEVO** |
| `components/booking/FormatSelector.tsx` | Sin cambios de código (se usa prop `labelStyle="client"` desde la página) |
| `components/booking/CourtConfigEditor.tsx` | + select de superficie + toggle "techada" por cancha |
| `app/venues/admin/[id]/page.tsx` | Monta editores de galería/amenidades (super admin) + input de ventana |
| `components/booking/VenueGalleryEditor.tsx` | **NUEVO** — admin (sube a Storage) |
| `components/booking/VenueAmenitiesEditor.tsx` | **NUEVO** — admin |
| `firestore.rules` | Bloquear `gallery`/`amenities` para Location Admin en `venues/{venueId}` |
| `storage.rules` | **NUEVO match** `venues/{venueId}/gallery/**` — escritura solo Super Admin |

---

## ⚠️ Decisiones de Diseño Clave (CERRADAS)

1. **Galería con subida real a Firebase Storage — CERRADO.** El Super Admin sube fotos desde el panel; se comprimen cliente-side (`compressPaymentProof`) y se guardan en `venues/{venueId}/gallery/`. Reusa `lib/storage.ts` + `imageCompression`. No se pegan URLs.

2. **Superficie y "techada/descubierta" a nivel de CANCHA — CERRADO.** `Court.surface` + `Court.covered`. La vista de jugador **agrega** los valores distintos de las canchas activas (`venueSurfaces`, `venueCoverage`): si todas coinciden → un chip; si difieren → varios. Se editan por cancha en `CourtConfigEditor`.

3. **Galería y amenidades: edición solo Super Admin — CERRADO.** Se bloquean para Location Admin en `firestore.rules` y `storage.rules`. `bookingWindowDays` y `surface`/`covered` (canchas) siguen editables por Location Admin (operacionales, no de contenido).

4. **Catálogo cerrado de amenidades — CERRADO.** Parqueadero, iluminación, duchas, camerinos, alquiler de guayos, cafetería, baños, WiFi. (Se descartó "alquiler de balón".) La "cancha techada" se cubre con `Court.covered`.

5. **Empty state distingue "cerrado" vs "sin cupos" — CERRADO.** Dos mensajes según la causa (RN-07).
