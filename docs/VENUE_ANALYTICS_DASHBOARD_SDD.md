# Feature: Dashboard de Analítica de Ocupación e Ingresos

## 📋 Specification-Driven Development (SDD)

Darle al dueño/administrador de una sede una vista histórica de su negocio — ocupación por franja horaria, tendencia de ingresos, ingreso por cancha y por formato, y tasas de inasistencia/cancelación — reutilizando los datos que ya captura el sistema, sin ningún flujo de escritura nuevo.

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo

El `location_admin` hoy solo ve el **balance del día** (`DAILY_BALANCE_PAYMENTS_SDD`), que dejó explícitamente fuera de scope los "reportes históricos (semanal/mensual)". Sin esa vista, el dueño no puede responder preguntas de negocio básicas:

- ¿Cuánto facturé esta semana/mes vs. el período anterior?
- ¿Qué franjas horarias están muertas y cuáles saturadas? (para ajustar precios/horarios)
- ¿Qué cancha o formato rinde más?
- ¿Qué tan grave es mi problema de inasistencias y cancelaciones?

Esta feature agrega un **tab "Analítica"** en `/venues/admin/[id]` que **solo lee y agrega** datos ya existentes (`venues/{id}/payments`, `venues/{id}/blocked_slots`, `venues/{id}/schedules`). Es una feature de **reporting de solo lectura**: no crea colecciones, no escribe nada, no tiene race conditions.

Está detrás de un **feature flag por usuario** (`venueAnalyticsEnabled`), siguiendo el patrón exacto de `hasBookingAccess` / `hasWalletAccess`.

### Reglas de Negocio

| # | Regla | Impacto UI |
|---|-------|------------|
| RN-01 | El módulo está detrás del flag `venueAnalyticsEnabled` en el perfil del usuario. `hasVenueAnalyticsAccess(profile)` = `isSuperAdmin(profile) || profile.venueAnalyticsEnabled === true`. Sin acceso, el tab "Analítica" no se renderiza y la ruta con `?tab=analytics` cae al tab default. | Tab visible solo si hay acceso |
| RN-02 | La analítica es **solo lectura**: agrega en memoria en el cliente. No escribe ningún documento, no crea colecciones. | Sin CTAs de mutación |
| RN-03 | El período se elige con presets: **Esta semana**, **Este mes** (default), **Mes pasado**, y **Rango personalizado** (dos fechas). El rango máximo es **92 días** (un trimestre) para acotar reads. **Todos los bordes de período se calculan en zona horaria `America/Bogota`; la semana empieza el lunes.** | Selector de período (chips + custom) |
| RN-04 | Los **ingresos** se calculan **solo desde `venues/{id}/payments`** (misma fuente de verdad que el balance diario): suma de `totalCOP`, `cashCOP`, `transferCOP` de los pagos con `date` dentro del rango. Es dinero **realmente cobrado**, no precios teóricos. La card de Ingresos muestra además el **desglose Efectivo / Transferencia** (monto + % del total). | KPI total + desglose por método |
| RN-05 | El **comparativo** es **calendario contra calendario** según el preset: `this_week` vs. la misma ventana 7 días atrás; `this_month` vs. el mismo tramo del mes anterior (día 1 → mismo día, clamp a fin de mes); `last_month` vs. el mes calendario completo anterior; `custom` vs. la ventana de igual duración inmediatamente anterior. La **flecha** indica la dirección real (subió/bajó) y el **color** si el cambio es bueno (verde) o malo (rojo) — semáforo invertido para Inasistencias/Cancelaciones. | Flecha ↑/↓ + signo + % en cada KPI |
| RN-06 | La **ocupación** se mide como `horas-cancha reservadas / horas-cancha disponibles`. **Disponibles** = por cada hora abierta en el schedule, `nº de canchas activas` horas-cancha. **Reservadas** = por instancia, `courtIds.length × duración`, **distribuido por bucket de hora** (una reserva 18:00–20:00 aporta a las horas 18 y 19). Solo cuentan instancias **no canceladas**. **En V1 la ocupación cuenta solo reservas manuales** (el uso real del `location_admin`); los bookings online se excluyen (ver Decisión Clave #3). | Heatmap + KPI "% ocupación" |
| RN-06b | **Bordes de ocupación**: (a) una reserva fuera del horario del schedule (bloqueo manual antes de abrir) generaría rate >100% → **la celda se capa a 100%** pero la reserva se cuenta. (b) Las reservas de **mensualidad (`isMonthly`)** ocupan cancha → **cuentan en ocupación**, pero **no en ingresos** (están excluidas del flujo de pagos, RN-04). La sección de ingresos muestra un microcopy: "No incluye mensualidades". | Celda capada; nota en ingresos |
| RN-07 | El **heatmap** agrupa por **día de la semana (7) × hora del día**. Cada celda = ocupación promedio de esa franja en el rango. La intensidad del color codifica el %. Tap en celda → detalle de esa franja (reservas y % en un popover). | Grid 7×N con escala de color |
| RN-08 | Las reservas **recurrentes** (`recurrence`) se **expanden a instancias** por fecha dentro del rango, respetando `exceptDates` (instancias saltadas) y `statusOverrides[fecha]` (estado por instancia). Una reserva recurrente sin fin (`endDate` ausente) se expande solo hasta el fin del rango consultado. | Transparente al usuario |
| RN-08b | **Semántica de recurrencia**: `daily` = cada día; `weekly` = cada 7 días desde `startDate`; `biweekly` = **cada 14 días** desde `startDate`; `monthly` = **mismo número de día del mes** que `startDate` — si un mes no tiene ese día (ej. inicio el 31, febrero), esa instancia **se salta** (no se corre a otro día). Todas acotadas por `[startDate, endDate?]` y el rango consultado. | Transparente al usuario |
| RN-09 | Las **tasas** se calculan sobre instancias en el rango: `noShowRate = no_show / (jugables)` y `cancellationRate = cancelled / (total agendadas)`. "Jugables" excluye `cancelled`. Se muestran como % con el conteo crudo. **Wording en UI (español, simple)**: la tasa de `no_show` se muestra como **"Inasistencias"** (consistente con el badge existente "No asistió"); la de `cancelled` como **"Cancelaciones"**. El término técnico "no-show" **nunca** aparece en pantalla. | KPIs de calidad operativa |
| RN-10 | **Ingreso por cancha**: cada pago tiene `courtIds`; se atribuye el `totalCOP` a esas canchas (repartido en partes iguales si el pago cubre varias canchas). **Ingreso por formato** — inferencia con fallback: (1) si `courtIds` coincide **exacto** con un `CourtCombo` → su `resultingFormat`; (2) si es **una sola cancha** → su `baseFormat`; (3) si no coincide con nada → bucket **"Mixto/Otro"**. Garantiza que la suma por formato == ingreso total (ningún peso se pierde). | Dos listas rankeadas |
| RN-11 | Si el rango no tiene datos suficientes (sin pagos y sin reservas), se muestra un **empty state** explicativo, no ceros engañosos. | Empty state por sección |
| RN-12 | Todos los montos se manejan en **centavos COP** internamente y se formatean con `formatCOP` (consistente con el resto de la app). | Formato $ unificado |

### No-objetivos (explícitos)

- **No incluye ingresos de bookings online** (depósitos wallet + saldo en sede). V1 = pagos manuales, igual que el balance diario. Unificar es otro SDD.
- **No exportación CSV/PDF** — se posterga (aunque el modelo lo permite después).
- **No pre-agregación / rollups en Firestore** — V1 agrega en el cliente (ver Decisión Clave #2).
- **No forecasting ni recomendaciones automáticas de precio** — solo se muestran los datos; interpretar es del dueño.
- **No comparativa entre sedes** — la vista es por una sede a la vez.
- **No analítica de jugadores/marketing** (quién reserva, retención) — es otro SDD (CRM).

---

## 2. ESCALABILIDAD

### Volumen esperado

Por sede activa (del contexto del `BOOKING_SYSTEM_SDD` y `DAILY_BALANCE_PAYMENTS_SDD`):

- **Pagos**: ~10–30/día → ~300–900/mes → hasta ~2.760 en un trimestre (rango máximo).
- **Reservas manuales (`blocked_slots`)**: cientos de docs por sede (los recurrentes son 1 doc que se expande en memoria; los puntuales 1 doc por fecha).
- **Schedules**: 7 docs (uno por día de la semana). Trivial.

Una consulta de "este mes" lee ~300–900 pagos + los `blocked_slots` **relevantes al rango** (ver optimización abajo) + 7 schedules + canchas/combos (cacheados). Peso < 500 KB. Aceptable para agregación en cliente.

### Índices Firestore requeridos

- **Pagos por rango**: query `venues/{id}/payments where date >= start && date <= end`. Es un **único campo con rango** → Firestore lo resuelve con el índice de campo simple automático. **No requiere índice compuesto.**
- **`blocked_slots` (split, no full-collection)**: en lugar de `getAllBlockedSlots` (que lee **toda** la colección sin filtro y crece sin límite con los años), se usan **dos queries de campo único**:
  1. **Puntuales en rango**: `where date >= start && date <= end` — acota las lecturas de reservas puntuales al período consultado.
  2. **Recurrentes**: `where date == null` — trae solo las plantillas recurrentes (pocas por sede), que luego se expanden en memoria (RN-08b).
  Ambas son campo único → índice automático, **sin índice compuesto**. Ver `getBlockedSlotsForRange` en la capa de API.
- **Schedules / courts / combos**: `getVenueFullSchedule`, `getVenueCourts`, `getVenueCombos` (ya existen). Cacheables (casi estáticos). Sin índice nuevo.

### Optimización de lecturas (performance & costo)

1. **Split de `blocked_slots`** (arriba): acota las puntuales al rango en vez de leer la colección completa. Es la optimización de mayor impacto — evita que la analítica se vuelva más cara a medida que la sede acumula historia.
2. **Caché de sesión**: reutilizar `lib/hooks/createCachedQueryHook.ts` (el mismo patrón del fix de performance de Home/History: TTL + caché + revalidación por `visibilitychange`). `courts`/`combos`/`schedule` se cachean aparte (casi estáticos) de `payments`/`blocked_slots` (por rango). Cambiar de preset no re-lee lo ya traído del mismo rango.
3. **Agregación memoizada**: KPIs, heatmap y breakdowns se computan en **una sola pasada** sobre los datos crudos, envuelta en `useMemo` keyed por `(rawData, period)` — no se recalcula en cada re-render, solo cuando cambian datos o período.

### Paginación

- N/A. El rango está acotado a 92 días (RN-03) y las puntuales se filtran por rango, lo que topa los reads a ~2.760 pagos + puntuales-del-rango como peor caso. No hay listas infinitas; el heatmap y los breakdowns son agregados de tamaño fijo.
- Si una sede a futuro supera este volumen cómodamente en cliente, se migra a rollups pre-agregados (Decisión Clave #2 documenta el camino).

---

## 3. CONCURRENCIA SEGURA

### Operaciones que requieren `runTransaction()`

**Ninguna.** Esta feature es de **solo lectura**. No escribe documentos, no crea colecciones, no muta estado compartido. No aplica el requisito de transacciones de la regla #6 de CLAUDE.md porque no hay writes.

### Race conditions identificadas

- **No hay race conditions de escritura** (no escribe nada).
- **Consistencia de lectura**: si el admin cambia de período mientras una query anterior está en vuelo, la respuesta vieja podría llegar después y pintar datos del período equivocado. → **Mitigación**: cada fetch lleva un `requestId`/`AbortController`; al resolver, se descarta si el período activo ya cambió. Patrón estándar de "última query gana".
- **Datos "en movimiento"**: un pago registrado en otra pestaña mientras se ve el reporte no se refleja hasta re-consultar. → **Decisión**: V1 usa fetch puntual (no `onSnapshot`) con botón/gesto de **refresh**; el reporte es una foto del momento, no live. Es lo correcto para un dashboard analítico (evita re-agregar en cada write).

---

## 4. SEGURIDAD

### Autenticación y autorización

- **Acceso al tab**: `hasVenueAnalyticsAccess(profile)` (super admin siempre; location admin con flag). Además, el `location_admin` solo puede ver sedes en `assignedLocationIds` (ya enforzado por la página admin y las rules existentes).
- **Datos leídos**: `venues/{id}/payments`, `venues/{id}/blocked_slots`, `venues/{id}/schedules`, `venues/{id}/courts`, `venues/{id}/court_combos`. Todos ya tienen reglas de lectura restringidas a `super_admin` o `location_admin` del venue.

### Firestore Rules requeridas

**Ninguna nueva.** La feature no introduce colecciones ni cambia la forma de los datos. Las reglas de lectura de `payments`, `blocked_slots` y `schedules` ya existen y ya restringen a admins del venue. Verificar (no modificar) que sigan siendo:

```javascript
// Ya existentes — solo confirmar que cubren la lectura del dashboard.
match /venues/{venueId}/payments/{paymentId} {
  allow read: if isSignedIn() && (isSuperAdmin() || isLocationAdminFor(venueId));
}
match /venues/{venueId}/blocked_slots/{slotId} {
  allow read: if isSignedIn() && (isSuperAdmin() || isLocationAdminFor(venueId));
}
match /venues/{venueId}/schedules/{day} {
  allow read: if ...; // ya legible (schedules son públicos para el flujo de reserva)
}
```

El flag `venueAnalyticsEnabled` vive en el doc del usuario (`users/{uid}`). Lo activa el **super admin** desde la gestión de usuarios existente (mismo mecanismo que `bookingEnabled`). El usuario solo **lee** su propio flag; no puede auto-activárselo (las rules de `users` ya impiden que un usuario se cambie el rol/flags de admin).

### Validaciones de input

- **Rango de fechas**: `start <= end`, ambas `YYYY-MM-DD` válidas, y `end - start <= 92 días`. Validado en cliente antes de construir la query (evita reads accidentalmente enormes). Firestore igual acota por las rules de lectura por rol.
- **Preset**: enum cerrado (`this_week | this_month | last_month | custom`). Valor desconocido → default `this_month`.

### Datos sensibles

- Los montos y el `clientName`/`clientPhone` de las reservas son **PII operativa del venue**. El dashboard **no expone estos datos a jugadores** — vive dentro del área admin, gateada por rol + flag. Los agregados (totales, %) no son PII, pero el detalle por celda del heatmap podría mostrar nombres de cliente → se mantiene dentro del área admin.

---

## 5. TOLERANCIA A FALLOS

### Estados de error y fallbacks

| Error | Causa probable | Fallback UI |
|-------|---------------|-------------|
| Fetch de pagos falla | Firestore offline / timeout | Sección de ingresos muestra error inline + botón "Reintentar"; el resto del dashboard que sí cargó se mantiene |
| Fetch de `blocked_slots` falla | Offline | Ocupación y tasas muestran error inline + "Reintentar"; ingresos (fuente distinta) pueden seguir visibles |
| `permission-denied` | Perdió rol o desasignación del venue | Toast "Sin permisos para ver la analítica" + redirect a `/` |
| Rango sin datos | Sede nueva / período vacío | Empty state por sección: "Sin datos en este período" + microcopy sugiriendo ampliar el rango |
| Schedule vacío (sin horarios configurados) | Sede sin configurar | Ocupación muestra aviso: "Configura los horarios de la sede para calcular ocupación" con link al tab Horarios; ingresos siguen mostrándose |
| Query excede 92 días (manipulación URL) | Deep-link manual | Se recorta a 92 días + toast informativo |

### Retry strategy

- **Lecturas independientes por sección**: ingresos, ocupación/tasas y breakdowns se cargan con fetches separados. Un fallo en una no tumba las otras (degradación por sección).
- **Retry manual** (botón "Reintentar" por sección). Sin auto-retry agresivo — es un dashboard, no un flujo transaccional.
- **Refresh global**: gesto pull-to-refresh (mobile) / botón refresh (header) re-consulta todo el período activo.

### Degradación elegante

- Si `courts`/`combos` no cargan, los breakdowns "por cancha/por formato" muestran el `courtId` crudo en vez del nombre, pero los totales de ingreso siguen siendo correctos.
- Si solo hay pagos pero no reservas manuales (o viceversa), cada sección muestra lo que tiene; no se bloquea todo el dashboard.

---

## 6. UX — FLUJOS DE USUARIO

### Flujo principal (happy path)

1. `location_admin` (con flag) o `super_admin` entra a `/venues/admin/{id}`.
2. Tap en el tab **"Analítica"**.
3. El dashboard carga con período default **"Este mes"** → skeleton mientras agrega.
4. Ve, de arriba hacia abajo:
   - **Selector de período** (chips: Esta semana · Este mes · Mes pasado · Personalizado).
   - **Fila de KPIs** con comparativo vs. período anterior: Ingresos totales, % Ocupación, Nº reservas, **Inasistencias** (label visible; % de reservas donde el cliente no llegó — nunca se usa el término "no-show" en la UI).
   - **Tendencia de ingresos**: barras por día (rango ≤ 31 días) o por semana (rango mayor).
   - **Heatmap de ocupación**: día de la semana × hora, con leyenda de color.
   - **Ingreso por cancha** (lista rankeada con barra proporcional).
   - **Ingreso por formato** (lista rankeada).
5. Cambia el período → re-agrega y actualiza todas las secciones con transición suave.
6. Tap en una celda del heatmap → popover con el detalle de esa franja (nº reservas, % ocupación, ingreso).

### Flujo alterno — Rango personalizado

1. Tap en chip "Personalizado" → aparecen dos date inputs (desde / hasta).
2. Si `end - start > 92 días` → el "hasta" se recorta y aparece microcopy "Máximo 3 meses por consulta".
3. Al elegir fechas válidas → re-consulta.

### Estados de UI

| Estado | Qué muestra |
|--------|-------------|
| Cargando | Skeleton: fila de 4 KPI cards + bloque de barras + grid de heatmap gris + 2 listas |
| Vacío (sin datos en rango) | Empty state central: ícono `BarChart3` + "Sin datos en este período" + "Prueba con un rango más amplio" |
| Parcial (una sección falla) | Esa sección muestra error inline + "Reintentar"; las demás siguen |
| Error total (permisos) | Toast + redirect |
| Éxito | Dashboard completo con datos |
| Sin horarios configurados | Ocupación con aviso + link a tab Horarios; resto normal |

### Consideraciones mobile-first

- El heatmap es el reto: en mobile, scroll horizontal dentro de un contenedor `overflow-x-auto` (las horas en el eje X pueden ser muchas). Día de la semana en el eje Y (7 filas fijas).
- KPIs: grid `grid-cols-2` en mobile, `md:grid-cols-4`.
- Touch targets de celdas del heatmap ≥ 32×32 px (con gap), y el popover de detalle se abre como bottom sheet en mobile.
- Todo el contenido con `pb-24 md:pb-0` para no quedar tapado por la bottom nav.
- Date inputs con `text-base` (≥16px, anti-zoom iOS) — regla #9 de CLAUDE.md.

### Accesibilidad

- El color del heatmap no es el único canal: cada celda muestra el % en texto (o en su `aria-label` / `title`) para daltonismo.
- Escala de color secuencial accesible (ver sección 7). Contraste del texto sobre celda calculado según intensidad.

---

## 7. UI DESIGN — COMPONENTES Y ANIMACIONES

> Antes de implementar las gráficas, cargar el skill **`dataviz`** para calibrar la paleta secuencial del heatmap y las barras (escala secuencial accesible en claro/oscuro).

### Componentes nuevos

- **`components/booking/VenueAnalyticsView.tsx`** — orquesta todo el tab. Props:
  ```typescript
  { venueId: string }
  ```
  Maneja estado de período, fetches por sección, y compone los sub-componentes.

- **`components/booking/AnalyticsPeriodSelector.tsx`** — chips de preset + inputs de rango personalizado. Props:
  ```typescript
  {
    value: AnalyticsPeriod;              // { preset, start, end }
    onChange: (p: AnalyticsPeriod) => void;
  }
  ```

- **`components/booking/AnalyticsKpiCard.tsx`** — una card de KPI con valor, label y delta comparativo. Props:
  ```typescript
  {
    label: string;
    value: string;                       // ya formateado (formatCOP o %)
    delta?: { pct: number; direction: "up" | "down" | "flat"; positiveIsGood: boolean };
    icon: LucideIcon;
    tone?: "revenue" | "occupancy" | "count" | "warning";
  }
  ```

- **`components/booking/RevenueTrendChart.tsx`** — barras verticales (por día o semana). SVG/divs inline, **sin librería externa** (consistente con el proyecto, evita bundle). Props:
  ```typescript
  { buckets: { label: string; totalCOP: number }[] }
  ```

- **`components/booking/OccupancyHeatmap.tsx`** — grid día-semana × hora. Props:
  ```typescript
  {
    cells: OccupancyCell[];              // { dayOfWeek, hour, rate, reservedHours, availableHours }
    onCellTap?: (cell: OccupancyCell) => void;
  }
  ```

- **`components/booking/RevenueBreakdownList.tsx`** — lista rankeada con barra proporcional (reutilizable para "por cancha" y "por formato"). Props:
  ```typescript
  {
    title: string;
    items: { key: string; label: string; totalCOP: number }[];
  }
  ```

- **`components/skeletons/VenueAnalyticsSkeleton.tsx`** — skeleton de todo el tab.

### Componentes modificados

- **`app/venues/admin/[id]/page.tsx`**:
  - Agregar `"analytics"` al tipo `AdminTab`, a `TAB_LABELS` (`"Analítica"`), `TAB_ICONS` (`BarChart3`) y `ALL_ADMIN_TABS`.
  - `visibleTabs`: incluir `"analytics"` **solo si** `hasVenueAnalyticsAccess(profile)`. Para `super_admin` siempre; para `location_admin` según flag.
  - Renderizar `<VenueAnalyticsView venueId={venueId} />` cuando `activeTab === "analytics"`.
  - Añadir `analytics` a la lista de tabs que ocultan el footer genérico de guardado (`activeTab !== "bookings" && ...`).

### Animaciones (Framer Motion)

- **KPI cards**: stagger `0.05s` al primer mount; el número hace count-up sutil (~0.3s) al cambiar de período.
- **Delta badge**: `AnimatePresence` fade cuando cambia de signo.
- **Barras de tendencia**: crecen desde 0 con `height`/`scaleY` spring (`damping: 24, stiffness: 300`) al cargar; `layout` para reordenar suave al cambiar buckets.
- **Heatmap**: fade-in de celdas con stagger leve por fila; el popover de detalle entra como spring (mobile: slide-up bottom sheet; desktop: pop cerca de la celda).
- **Cambio de período**: crossfade del contenido (`AnimatePresence mode="wait"`) para no parpadear.

### Responsive

- **Mobile (<768px)**: KPIs `grid-cols-2`; heatmap con scroll horizontal; barras compactas; breakdowns full-width apilados.
- **Desktop (md+)**: KPIs `grid-cols-4`; heatmap completo sin scroll; breakdowns en dos columnas (`md:grid-cols-2`).

### Colores y tokens

- KPI "Ingresos": `emerald`. "Ocupación": `blue`. "Reservas": `slate`. "Inasistencias": `rose`/`amber` (tono warning).
- Heatmap: **escala secuencial de un solo tono** (de `slate-100` a `blue-600`) — intensidad = ocupación. Celda 0% = gris muy claro (no vacío/blanco, para distinguir "abierto sin reservas" de "cerrado"). Franja cerrada (fuera de schedule) = con hachurado/gris neutro distinto.
- Delta positivo-bueno: `emerald`; negativo-malo: `rose`; para Inasistencias/Cancelaciones el semáforo se invierte (subir es malo → `rose`).

---

## 8. ANALYTICS

| Evento | Trigger | Propiedades |
|--------|---------|-------------|
| `venue_analytics_viewed` | Mount del tab con datos cargados | `venue_id`, `period_preset`, `range_days`, `total_revenue_cop`, `occupancy_pct`, `reservations_count`, `no_show_rate` |
| `venue_analytics_period_changed` | Cambio de preset o rango | `venue_id`, `previous_preset`, `new_preset`, `range_days` |
| `venue_analytics_heatmap_cell_tapped` | Tap en celda del heatmap | `venue_id`, `day_of_week`, `hour`, `occupancy_pct` |
| `venue_analytics_breakdown_viewed` | Scroll/expand de un breakdown | `venue_id`, `breakdown_type` (`court` \| `format`) |

Convención `snake_case`; montos en centavos COP; **sin PII** (nunca `clientName`/`clientPhone` en propiedades de analytics). Prioridad P3 (Platform/Premium) — se dispara vía `initAnalytics()` lazy.

---

## 9. ARQUITECTURA TÉCNICA

### Modelo de datos

**No hay entidades nuevas persistidas.** Se agregan tipos de **agregación en memoria** (no van a Firestore) y un flag al perfil.

`lib/domain/user.ts` — agregar flag:
```typescript
export interface UserProfile {
  // ...
  venueAnalyticsEnabled?: boolean;   // Acceso al dashboard de analítica de sede (feature flag por usuario)
}

/**
 * Verifica si el usuario tiene acceso al dashboard de analítica de sede.
 * Super admins siempre; otros requieren el flag venueAnalyticsEnabled.
 */
export function hasVenueAnalyticsAccess(profile: UserProfile): boolean {
  return isSuperAdmin(profile) || profile.venueAnalyticsEnabled === true;
}
```

`lib/domain/venue-analytics.ts` (nuevo) — tipos de agregación:
```typescript
export type AnalyticsPeriodPreset = "this_week" | "this_month" | "last_month" | "custom";

export interface AnalyticsPeriod {
  preset: AnalyticsPeriodPreset;
  start: string;   // YYYY-MM-DD (inclusive)
  end: string;     // YYYY-MM-DD (inclusive)
}

export interface RevenueSummary {
  totalCOP: number;
  cashCOP: number;
  transferCOP: number;
  paymentsCount: number;
  avgTicketCOP: number;
}

export interface PeriodComparison<T> {
  current: T;
  previous: T;
  deltaPct: number | null;   // null si previous == 0
}

export interface ReservationInstance {
  reservationId: string;
  date: string;              // YYYY-MM-DD (instancia expandida)
  startTime: string;
  endTime: string;
  courtIds: string[];
  status: ManualReservationStatus;
}

export interface OccupancyCell {
  dayOfWeek: number;         // 0-6
  hour: number;              // 0-23
  reservedHours: number;
  availableHours: number;
  rate: number;              // 0..1 (0 si availableHours == 0)
  open: boolean;             // false si la franja no está en el schedule
}

export interface StatusRates {
  scheduled: number;         // instancias totales agendadas
  noShow: number;
  cancelled: number;
  noShowRate: number;        // no_show / jugables
  cancellationRate: number;  // cancelled / scheduled
}
```

### Capa de dominio (`lib/domain/venue-analytics.ts`)

Funciones **puras** (sin Firebase, sin React), 100% testeables:

```typescript
// Resuelve start/end del período y el rango anterior de igual duración.
// Todos los bordes se computan en America/Bogota; semana empieza lunes (RN-03).
export function resolvePeriod(preset: AnalyticsPeriodPreset, ref: Date, custom?: { start: string; end: string }): AnalyticsPeriod;
export function previousPeriodOf(period: AnalyticsPeriod): AnalyticsPeriod;

// Ingresos desde pagos.
export function computeRevenueSummary(payments: ManualReservationPayment[]): RevenueSummary;
export function bucketRevenueByDay(payments: ManualReservationPayment[], period: AnalyticsPeriod): { label: string; totalCOP: number }[];
export function bucketRevenueByWeek(payments: ManualReservationPayment[], period: AnalyticsPeriod): { label: string; totalCOP: number }[];

// Expansión de reservas recurrentes/puntuales a instancias en el rango.
// Recurrencia (RN-08b): daily / weekly(7d) / biweekly(14d desde startDate) /
// monthly(mismo día del mes; salta meses sin ese día). Respeta exceptDates + statusOverrides.
export function expandReservationInstances(slots: BlockedSlot[], period: AnalyticsPeriod): ReservationInstance[];

// Ocupación. La celda se capa a rate=1 (100%) aunque reservedHours > availableHours (RN-06b).
export function computeAvailableHours(schedules: DaySchedule[], courts: Court[]): Map<string, number>; // key `${dow}_${hour}`
export function computeOccupancyHeatmap(instances: ReservationInstance[], schedules: DaySchedule[], courts: Court[], period: AnalyticsPeriod): OccupancyCell[];
export function computeOverallOccupancy(cells: OccupancyCell[]): number;

// Tasas.
export function computeStatusRates(instances: ReservationInstance[]): StatusRates;

// Breakdowns. revenueByFormat aplica fallback exact-combo → single-court baseFormat → "Mixto/Otro" (RN-10).
export function revenueByCourt(payments: ManualReservationPayment[], courts: Court[]): { key: string; label: string; totalCOP: number }[];
export function revenueByFormat(payments: ManualReservationPayment[], courts: Court[], combos: CourtCombo[]): { key: string; label: string; totalCOP: number }[];

// Comparativo genérico.
export function compare<T extends number>(current: T, previous: T): PeriodComparison<T>;
```

### Capa de API (`lib/venues.ts`)

Dos funciones nuevas; el resto reutiliza lo existente:
```typescript
// Pagos con date en [start, end]. Un solo campo con rango → sin índice compuesto.
export async function getPaymentsInRange(venueId: string, start: string, end: string): Promise<ManualReservationPayment[]>;

// Reservas relevantes al rango SIN leer toda la colección (perf/costo):
//   1. puntuales:   where date >= start && date <= end
//   2. recurrentes: where date == null   (plantillas, se expanden en memoria)
// Devuelve la unión. Ambos queries son de campo único → sin índice compuesto.
export async function getBlockedSlotsForRange(venueId: string, start: string, end: string): Promise<BlockedSlot[]>;
```
Reutiliza: `getVenueFullSchedule(venueId)`, `getVenueCourts(venueId)`, `getVenueCombos(venueId)` (estos tres, cacheados). **Se evita `getAllBlockedSlots`** en este flujo por su lectura full-collection.

### Componentes UI (`app/`, `components/`)

Listados en sección 7. **Sin páginas nuevas** — solo un tab dentro de `/venues/admin/[id]`.

### Backward compatibility

- El flag `venueAnalyticsEnabled` es opcional; ausente = sin acceso (salvo super admin). No requiere migración de usuarios.
- Reservas manuales viejas sin `status` se leen como `pending` (helper `getBlockedSlotStatus` ya lo maneja) → cuentan como agendadas no jugadas.
- Pagos viejos sin `courtIds` (si los hubiera) se agrupan bajo "Sin cancha" en el breakdown, sin romper los totales.

---

## 10. CRITERIOS DE ACEPTACIÓN

- [ ] Tab "Analítica" visible **solo** con `hasVenueAnalyticsAccess(profile)` (super admin siempre; location admin con flag).
- [ ] Con el flag apagado y sin ser super admin, `?tab=analytics` cae al tab default, sin acceso a los datos.
- [ ] Selector de período con presets (Esta semana / Este mes / Mes pasado / Personalizado); default "Este mes".
- [ ] Rango personalizado valida `start <= end` y recorta a máx. 92 días con microcopy.
- [ ] KPIs muestran Ingresos, % Ocupación, Nº reservas e **Inasistencias** con comparativo vs. período anterior (delta absoluto + %). El término "no-show" no aparece en la UI.
- [ ] Ingresos = suma de `totalCOP`/`cashCOP`/`transferCOP` de `payments` en el rango (coincide con la suma de los balances diarios de ese rango).
- [ ] Heatmap día-semana × hora con escala de color secuencial + % en texto por celda; tap abre detalle de franja.
- [ ] Bordes de período calculados en `America/Bogota` con semana iniciando lunes.
- [ ] Reservas recurrentes se expanden por instancia respetando `exceptDates` y `statusOverrides`, con semántica `daily/weekly/biweekly(14d)/monthly(mismo día del mes, salta faltantes)`.
- [ ] Ocupación: reservas multi-hora se reparten por bucket; celda capada a 100%; mensualidades cuentan en ocupación pero no en ingresos (con microcopy "No incluye mensualidades").
- [ ] Ingreso por formato: fallback exact-combo → baseFormat de cancha única → "Mixto/Otro"; la suma por formato == ingreso total.
- [ ] Tasas de inasistencia y cancelación calculadas sobre instancias del rango con conteos crudos visibles.
- [ ] Ingreso por cancha y por formato rankeados; formato inferido vía combos/baseFormat.
- [ ] Empty state por sección cuando no hay datos; aviso especial si no hay horarios configurados.
- [ ] Degradación por sección: el fallo de una fuente no tumba las demás; botón "Reintentar" por sección.
- [ ] Sin escrituras a Firestore en todo el flujo (verificable en Network/emulador).
- [ ] `blocked_slots` se lee con `getBlockedSlotsForRange` (split puntuales-en-rango + recurrentes), **nunca** con `getAllBlockedSlots` (verificable: el nº de lecturas no crece con reservas viejas fuera del rango).
- [ ] `courts`/`combos`/`schedule` cacheados vía `createCachedQueryHook`; cambiar de preset dentro del mismo rango no re-lee.
- [ ] La agregación (KPIs, heatmap, breakdowns) está memoizada y no se recalcula en re-renders sin cambio de datos/período.
- [ ] Eventos `venue_analytics_viewed/period_changed/heatmap_cell_tapped/breakdown_viewed` se disparan sin PII.
- [ ] Mobile: heatmap con scroll horizontal, KPIs en 2 columnas, popover como bottom sheet, `pb-24`.
- [ ] Funciones de `lib/domain/venue-analytics.ts` cubiertas por tests unitarios (expansión de recurrencia, ocupación, comparativo, breakdowns).

---

## 11. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---------|--------|
| `lib/domain/user.ts` | Agregar flag `venueAnalyticsEnabled` + función `hasVenueAnalyticsAccess()` |
| `lib/domain/venue-analytics.ts` | **Nuevo** — tipos y funciones puras de agregación |
| `lib/domain/venue-analytics.test.ts` | **Nuevo** — tests de las funciones puras |
| `lib/venues.ts` | Nuevas funciones `getPaymentsInRange()` y `getBlockedSlotsForRange()` (split puntuales+recurrentes, evita full-collection) |
| `lib/hooks/createCachedQueryHook.ts` | Reutilizar (sin cambios) para cachear courts/combos/schedule y los fetches por rango |
| `lib/analytics.ts` | Nuevos eventos `venue_analytics_*` |
| `components/booking/VenueAnalyticsView.tsx` | **Nuevo** — orquestador del tab |
| `components/booking/AnalyticsPeriodSelector.tsx` | **Nuevo** — selector de período |
| `components/booking/AnalyticsKpiCard.tsx` | **Nuevo** — KPI con comparativo |
| `components/booking/RevenueTrendChart.tsx` | **Nuevo** — barras de tendencia (inline, sin lib) |
| `components/booking/OccupancyHeatmap.tsx` | **Nuevo** — heatmap día×hora |
| `components/booking/RevenueBreakdownList.tsx` | **Nuevo** — lista rankeada reutilizable |
| `components/skeletons/VenueAnalyticsSkeleton.tsx` | **Nuevo** — skeleton del tab |
| `app/venues/admin/[id]/page.tsx` | Nuevo tab "analytics" gateado por flag; render de `VenueAnalyticsView` |
| `firestore.rules` | **Sin cambios** — solo verificar reglas de lectura existentes |

---

## 12. FUERA DE SCOPE

- Ingresos de bookings online (depósito wallet + saldo en sede).
- Exportación CSV/PDF.
- Rollups pre-agregados en Firestore (V1 agrega en cliente).
- Forecasting, recomendaciones de precio, alertas automáticas.
- Comparativa multi-sede.
- CRM / analítica de retención de clientes.
- Analítica en vivo (`onSnapshot`) — V1 es foto con refresh manual.
- Cobro de mensualidades (`isMonthly`) en los ingresos — **decidido** (RN-06b): cuentan en ocupación, se excluyen de ingresos (igual que en el balance diario), con microcopy "No incluye mensualidades".

---

## ⚠️ Decisiones de Diseño Clave

Requieren tu aprobación antes de implementar:

### 1. Feature de solo lectura — sin transacciones ni colecciones nuevas
La regla #6 de CLAUDE.md exige `runTransaction()` para estado compartido, pero **este dashboard no escribe nada**: agrega datos que ya existen. Eso lo hace barato y de bajo riesgo, pero también significa que **no habrá índices ni reglas nuevas** — solo lectura y cómputo en cliente. **Tradeoff**: el reporte es una foto (fetch + refresh manual), no live.

### 2. Agregación en el cliente (no rollups pre-agregados)
Con ~300–900 pagos/mes por sede y rango tope de 92 días, agregar en el navegador es trivial y evita construir Cloud Functions de rollup y una colección `venues/{id}/analytics_daily`. **Por qué ahora**: simplicidad y cero costo de mantenimiento de agregados. **Camino de escape documentado**: si una sede crece hasta que el cliente sufra, se migra a rollups diarios pre-computados por Cloud Function. **Tradeoff**: cada carga vuelve a leer los docs crudos del rango.

### 3. Ocupación V1 cuenta solo reservas manuales (no bookings online)
El `location_admin` opera hoy casi todo por reservas manuales (premisa del `DAILY_BALANCE_PAYMENTS_SDD`). Incluir bookings online exige mezclar dos modelos de datos y de "capacidad" distintos. **Decisión**: V1 mide ocupación e ingresos **solo con datos manuales**, consistente con el balance diario. **Tradeoff**: si una sede recibe muchos bookings online, la ocupación quedará subestimada — se comunica con un aviso y se resuelve en un SDD de "analítica unificada".

### 4. Ingresos = pagos reales registrados (no precios teóricos del schedule)
Se suma lo que el admin **efectivamente registró** en `venues/{id}/payments`, no el `priceCOP` de cada reserva. Así los ingresos del dashboard **cuadran exactamente** con la suma de los balances diarios. **Consecuencia**: reservas jugadas pero sin pago registrado **no cuentan** como ingreso (aparecen en ocupación/tasas, no en dinero). ¿De acuerdo, o prefieres una segunda métrica "ingreso teórico" (precio de lo agendado) junto al "ingreso cobrado"?

### 5. Flag por usuario `venueAnalyticsEnabled` (opt-in), sin auto-encender a location admins
A diferencia de `bookingEnabled` (que se auto-activa al registrarse como location admin), la analítica arranca **apagada** y el super admin la enciende por usuario. **Por qué**: permite un rollout controlado de la feature a sedes piloto. **Alternativa**: auto-encenderla a todo `location_admin` (como bookings). ¿Cuál prefieres?
