# Feature: Post-Match Review (Rating, Kudos & Reportes)

## 📋 Specification-Driven Development (SDD)

Sistema postpartido que permite a cada jugador (a) calificar su experiencia del partido, (b) dar **kudos tipificados** a sus compañeros, y (c) **reportar de forma privada** a un jugador por mala conducta. El admin recibe la señal de moderación; la comunidad recibe la señal de identidad (badges en perfil).

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo
- **Producto:** capturar señales reales de cada partido (organización, balance de equipos) para iterar.
- **Comunidad:** dar identidad a los jugadores mediante badges acumulados ("Capitán ×12", "Buen toque ×8") que aparecen en el perfil público.
- **Moderación:** dar al admin una herramienta privada y trazable para gestionar comportamientos problemáticos sin exponer al reportador.

### Convivencia con sistemas existentes
| Sistema | Qué hace | Diferencia con esta feature |
|---|---|---|
| **MVP Voting** (`mvpVotes` en `Match`) | 1 voto único por jugador → corona 👑 al mejor del partido, ventana de **2h** | Pantalla independiente. Esta feature no toca ningún archivo del MVP. El review screen muestra un banner contextual al MVP si el partido lleva <2h cerrado y el user aún no votó. |
| **Beta Feedback** (`feedback` collection) | Bugs/ideas/otros sobre la app | Esta feature NO usa esa colección ni `lib/domain/feedback.ts`. Vive en `lib/domain/matchReview.ts`. |

### Reglas de Negocio

| # | Regla | Impacto UI |
|---|---|---|
| 1 | Solo los **usuarios con `uid` que estuvieron en `match.teams.A` o `match.teams.B`** al cierre pueden dar review. Guests no dan review (no tienen sesión) y **no pueden recibir kudos** en esta feature. | Card de home y entrada al review solo aparecen si `wasInClosedMatch(uid)`. |
| 2 | El partido debe estar `status === "closed"` (y por lo tanto tener `closedAt`). Si el partido se **reabre**, las reviews existentes se **congelan**: persisten pero no se aceptan nuevas mientras esté `open`. | Si partido pasa a `open`, la ruta muestra "El partido fue reabierto, no podés enviar review". |
| 3 | **Ventana de envío: 2 días** desde `closedAt`. Pasada la ventana, no se acepta. | Card de home desaparece. La ruta muestra estado "Ventana cerrada". |
| 4 | **Reviews son inmutables** una vez enviadas. No hay edición posterior. Se muestra un **modal de confirmación** antes de enviar. | Botón "Revisar y enviar" → modal con resumen → "Confirmar". |
| 5 | **Un kudo por compañero por partido, máximo 1 categoría**. Solo a jugadores con `uid`. No podés darte kudos a vos mismo. | El botón 🌟 del propio user no se renderiza. Guests no muestran 🌟. |
| 6 | **Un reporte por compañero por partido**. No podés reportarte a vos mismo. **Límite de reportes activos: máximo 2 reportes en estado `pending`** del mismo reporter contra el mismo jugador (cross-partidos). Cuando el admin procesa uno, libera el cupo automáticamente. | Si alcanzó el límite, ícono 🚩 deshabilitado con tooltip "Ya tenés 2 reportes pendientes contra este jugador. Esperá a que el admin los revise." |
| 7 | Los reportes son **privados**: el reportado nunca ve quién lo reportó ni que fue reportado. Solo el reporter y el admin pueden leer un reporte. | UI del reportado no muestra nada. Admin tiene tab dedicada. |
| 8 | El **rating de experiencia** y los **kudos/reportes** se envían en una sola transacción (todo o nada) tras confirmación modal. | Un solo botón "Revisar y enviar" → modal → "Confirmar". |
| 9 | **Alerta automática al admin**: si un usuario recibe ≥3 reportes con motivos distintos en 30 días, se crea un evento de moderación destacado. | Badge rojo + ordering prioritario en `/admin/reports`. |
| 10 | El **trigger del review** es **inmediato**: al cerrar el partido, una Cloud Function crea una **notificación in-app** a cada jugador con link a `/match/[id]/review`. La card en home aparece de inmediato (client-side filter: `status === "closed"` + sin review enviado). Sin push. | Card visible apenas el user abre la app después del cierre. Notif in-app visible en el centro de notificaciones. |
| 11 | Al recibir un kudo, el destinatario recibe una **notificación in-app** (sin push). | Centro de notificaciones: "⚽ [Nombre] te dio un kudo de Buen toque". |

### Lista canónica de kudos

```typescript
const KUDO_META: Record<KudoType, { emoji: string; label: string }> = {
  buen_toque: { emoji: "⚽", label: "Buen toque" },
  goleador:   { emoji: "🎯", label: "Goleador" },
  muralla:    { emoji: "🛡️", label: "Muralla" },
  fair_play:  { emoji: "🤝", label: "Fair play" },
  capitan:    { emoji: "🧢", label: "Capitán" },
};
```

### Lista canónica de motivos de reporte

```typescript
const REPORT_REASON_META: Record<ReportReason, { label: string; requiresComment: boolean }> = {
  no_show:             { label: "No se presentó al partido", requiresComment: false },
  aggressive_behavior: { label: "Comportamiento agresivo o antideportivo", requiresComment: false },
  level_mismatch:      { label: "Nivel declarado muy distinto al real", requiresComment: false },
  late_no_warning:     { label: "Llegó muy tarde sin avisar", requiresComment: false },
  other:               { label: "Otro", requiresComment: true },
};
```

---

## 2. ESCALABILIDAD

### Volumen esperado
- 1 partido típico = ~14 jugadores.
- Por partido (máximo teórico): 14 reviews + (14 × 13) kudos = **hasta 182 kudos** y un puñado de reportes (<5% de la base).
- A 1 partido / día por venue × 100 venues activos = ~12.700 kudos/día en steady state. Manejable con escritura puntual + agregados en `users/{uid}.kudosSummary`.

### Colecciones nuevas
| Colección | Doc ID | Propósito |
|---|---|---|
| `matchReviews` | `{matchId}_{userUid}` (idempotente) | Rating de experiencia del usuario sobre el partido. |
| `playerKudos` | `{matchId}_{giverUid}_{recipientUid}` (idempotente) | Kudo tipificado. Solo entre usuarios con uid. |
| `playerReports` | `{matchId}_{reporterUid}_{reportedUid}` (idempotente) | Reporte privado. |
| `moderationAlerts` | auto-id | Alerta auto-generada cuando un user acumula ≥3 reportes distintos en 30d. |

### Agregados en `users/{uid}`
Para no leer N kudos en cada visita al perfil, se mantiene un contador denormalizado actualizado por Cloud Function trigger:

```typescript
// users/{uid}.kudosSummary — público, lectura por cualquier user autenticado
interface UserKudosSummary {
  buen_toque: number;
  goleador: number;
  muralla: number;
  fair_play: number;
  capitan: number;
  total: number;
}

// users/{uid}._reportsSummary — solo lectura admin
interface UserReportsSummary {
  pendingCount: number;
  totalCount: number;
  lastReportAt?: string;
}
```

**Nota arquitectónica:** `kudosSummary` y `_reportsSummary` son escritos exclusivamente por **Cloud Functions** (admin SDK) a través de triggers en `playerKudos` y `playerReports`. El cliente no puede escribir en el doc de otro usuario → las Firestore Rules denegarán cualquier intento de patch directo.

### Índices Firestore requeridos
```
playerKudos:    (recipientUid ASC, createdAt DESC)            — historial de kudos recibidos
playerKudos:    (giverUid ASC, matchId ASC)                   — chequeo "ya di kudo en este partido"
playerReports:  (reportedUid ASC, createdAt DESC)             — admin: histórico de un user
playerReports:  (status ASC, createdAt DESC)                  — admin: cola de pendientes
playerReports:  (reporterUid ASC, reportedUid ASC, status ASC) — chequeo "tengo ≥2 pending contra X"
matchReviews:   (matchId ASC, createdAt DESC)                 — admin: reviews de un partido
matchReviews:   (userUid ASC, createdAt DESC)                 — mostrar "tus reviews"
moderationAlerts: (status ASC, createdAt DESC)                — alertas pendientes
```

### Paginación
- Admin reports: `limit(20)` + cursor en `createdAt`.
- Kudos del perfil: solo se muestran los **agregados** (`kudosSummary`), no la lista raw. Si se quiere ver el detalle, hay un drawer "Ver historial" con `limit(20)`.

---

## 3. CONCURRENCIA SEGURA

### Operaciones que requieren `runTransaction()`

#### 3.1 `submitMatchReview(matchId, userUid, payload)`
Transacción única que escribe **todo el review** del usuario sobre ese partido:
1. Lee `matches/{matchId}` → valida `status === "closed"`, `closedAt + 2d ≥ now`, y que `userUid` esté en `teams.A` o `teams.B`.
2. Lee `matchReviews/{matchId}_{userUid}` → si ya existe, aborta con `ReviewAlreadyExistsError` (reviews son inmutables).
3. Para cada kudo a entregar: lee `playerKudos/{matchId}_{giverUid}_{recipientUid}` → escribe si no existe (idempotente por doc id determinístico).
4. Para cada reporte: query `playerReports where reporterUid == me and reportedUid == X and status == "pending"`. Si el count ≥ 2, aborta con `ActiveReportLimitError`. Si pasa, escribe nuevo doc.
5. Escribe `matchReviews/{matchId}_{userUid}` con el rating de experiencia.

Las actualizaciones de `kudosSummary` y `_reportsSummary` en `users/{uid}` las realiza la Cloud Function trigger post-write (no el cliente).

**Atomicidad:** si cualquier paso falla, la transacción aborta completa. El cliente recibe error específico y el user puede ajustar y reintentar.

#### 3.2 `markReportReviewed(reportId, adminUid, action, note)`
Transacción:
1. Lee report → valida `status === "pending"`.
2. Actualiza `status`, `reviewedAt`, `reviewedBy`, `adminAction`, `adminNote`.
3. El decremento de `_reportsSummary.pendingCount` lo ejecuta la Cloud Function trigger post-update.

#### 3.3 `aggregateKudoOnCreate` (Cloud Function, onCreate `playerKudos`)
Trigger: lee `type` y `recipientUid` → incrementa `users/{recipientUid}.kudosSummary[type]` y `.total` con `FieldValue.increment(1)`. Crea también la notificación in-app al destinatario.

#### 3.4 `aggregateReportOnCreate` (Cloud Function, onCreate `playerReports`)
Trigger: incrementa `users/{reportedUid}._reportsSummary.pendingCount` y `.totalCount`. Luego llama a `checkModerationThreshold`.

#### 3.5 `checkModerationThreshold` (dentro del trigger 3.4)
Cuenta reportes de `reportedUid` en los últimos 30d con motivos distintos. Si ≥3 y no hay alerta activa, crea `moderationAlerts/{id}` con `status: "open"`. Idempotente.

#### 3.6 `notifyPlayersOnMatchClose` (Cloud Function, onUpdate `matches`)
Trigger: cuando `status` cambia de `"open"` a `"closed"`. Itera `playerUids` del match y crea notificación in-app a cada uno con link a `/match/{matchId}/review`. Idempotente con flag `remindersSent.postMatchReviewNotified`.

### Race conditions identificadas

| Escenario | Mitigación |
|---|---|
| Dos jugadores dan kudo a Juan simultáneamente. | Cada uno tiene doc-id distinto (`{matchId}_{giverUid}_juanUid`). El `kudosSummary` lo actualiza Cloud Function con `increment(1)` atómico. ✅ |
| Usuario toca "Confirmar" dos veces rápido (doble tap). | Doc id determinístico → el segundo intento lee el doc ya creado → `ReviewAlreadyExistsError` silencioso. ✅ |
| Usuario envía en `closedAt + 6d 23h`, request llega después de 2d. | La transacción usa `Date.now()` server-side. Si supera ventana, aborta. ✅ |
| Admin marca como revisado dos veces. | Transacción valida `status === "pending"` antes de proceder. Segundo intento aborta. ✅ |
| Reporter envía 3er reporte a X mientras admin está procesando uno. | Query de pendientes se hace dentro de la transacción → lectura consistente. ✅ |

---

## 4. SEGURIDAD

### Autenticación y autorización

| Colección | Lectura | Escritura |
|---|---|---|
| `matchReviews` | Solo el autor + admin | Solo Cloud Functions o cliente en transacción validada. Update denegado (inmutable). |
| `playerKudos` | Cualquier user autenticado (kudos son **públicos** — alimentan badges) | Solo el giver, vía transacción. Update denegado. |
| `playerReports` | Solo el reporter + admin (**PRIVADO**) | Solo el reporter, vía transacción. Update solo admin. Delete denegado. |
| `moderationAlerts` | Solo admin | Solo Cloud Functions. |
| `users/{uid}.kudosSummary` | Cualquier user autenticado | Solo Cloud Functions (admin SDK). Cliente denegado. |
| `users/{uid}._reportsSummary` | Solo admin | Solo Cloud Functions (admin SDK). |

### Firestore Rules (a agregar)

```js
// Helper: verifica si el usuario estuvo en el match cerrado
function wasInClosedMatch(matchId, uid) {
  let match = get(/databases/$(database)/documents/matches/$(matchId)).data;
  return match.status == "closed" && uid in match.get('playerUids', []);
}

match /matchReviews/{reviewId} {
  allow read: if request.auth != null
    && (request.auth.uid == resource.data.userUid || isAdmin());

  allow create: if request.auth != null
    && request.auth.uid == request.resource.data.userUid
    && reviewId == request.resource.data.matchId + "_" + request.auth.uid
    && wasInClosedMatch(request.resource.data.matchId, request.auth.uid)
    && request.resource.data.rating is int
    && request.resource.data.rating >= 1
    && request.resource.data.rating <= 5
    && (!('comment' in request.resource.data)
        || request.resource.data.comment.size() <= 500);

  allow update: if false; // inmutable
  allow delete: if false;
}

match /playerKudos/{kudoId} {
  allow read: if request.auth != null;

  allow create: if request.auth != null
    && request.auth.uid == request.resource.data.giverUid
    && request.resource.data.giverUid != request.resource.data.recipientUid
    && request.resource.data.type in
        ["buen_toque", "goleador", "muralla", "fair_play", "capitan"]
    && wasInClosedMatch(request.resource.data.matchId, request.auth.uid);

  allow update: if false;
  allow delete: if false;
}

match /playerReports/{reportId} {
  allow read: if request.auth != null
    && (request.auth.uid == resource.data.reporterUid || isAdmin());

  allow create: if request.auth != null
    && request.auth.uid == request.resource.data.reporterUid
    && request.resource.data.reporterUid != request.resource.data.reportedUid
    && request.resource.data.reason in
        ["no_show", "aggressive_behavior", "level_mismatch", "late_no_warning", "other"]
    && (
      request.resource.data.reason != "other"
      || ('comment' in request.resource.data && request.resource.data.comment.size() > 0)
    )
    && (!('comment' in request.resource.data)
        || request.resource.data.comment.size() <= 500)
    && wasInClosedMatch(request.resource.data.matchId, request.auth.uid)
    && request.resource.data.status == "pending";

  allow update: if request.auth != null && isAdmin();
  allow delete: if false;
}

match /moderationAlerts/{alertId} {
  allow read: if request.auth != null && isAdmin();
  allow write: if false; // solo Cloud Functions
}
```

**Protección de campos en `users/{uid}`** — agregar a la regla de update existente:
```js
// Denegar escritura directa del cliente a campos de sistema
&& (!request.resource.data.diff(resource.data).affectedKeys()
    .hasAny(['kudosSummary', '_reportsSummary']))
```

### Validaciones de input

| Campo | Regla |
|---|---|
| `rating` | integer 1..5, requerido |
| `dimensions.organization` | `"good"` \| `"bad"` \| `null` |
| `dimensions.levelBalance` | `"good"` \| `"bad"` \| `null` |
| `comment` | string opcional, ≤500 chars |
| `kudoType` | enum de los 5 valores fijos |
| `reportReason` | enum de los 5 motivos |
| `reportComment` | string opcional, ≤500 chars. **Obligatorio si `reason === "other"`**. |

Toda validación se duplica en (1) `lib/domain/matchReview.ts` (lanza `ValidationError`), (2) Firestore Rules.

### Datos sensibles
- `playerReports.reporterUid` **nunca** se expone al `reportedUid`. La regla deniega lectura.
- El reportado no recibe ninguna notificación de que fue reportado.
- `users/{uid}._reportsSummary` solo legible por admin.
- Analytics de reportes y kudos **no incluyen** `recipient_uid`.

---

## 5. TOLERANCIA A FALLOS

### Estados de error y fallbacks

| Error | Causa | Fallback UI |
|---|---|---|
| `NetworkError` al enviar | Sin conexión | Toast "Sin conexión, reintentá". Guardar borrador en `localStorage` con key `review_draft_{matchId}_{uid}`. |
| `ReviewAlreadyExistsError` | El user ya envió (doble tap o reintento) | Mostrar pantalla de "Ya calificaste este partido" (resumen read-only). Silencioso si es idempotencia. |
| `MatchNotClosedError` | El partido se reabrió mientras escribía | Toast "El partido fue reabierto, no podés calificar". |
| `WindowExpiredError` | Intentó enviar pasados 2d | Pantalla "La ventana de calificación cerró". |
| `ActiveReportLimitError` | Ya tiene 2 reportes `pending` contra ese jugador | Toast específico + ícono 🚩 deshabilitado para ese jugador. |
| `DuplicateKudoError` | Idempotencia: kudo ya existe | Silencioso (asume éxito previo). |
| `SelfTargetError` | Intentó kudo/reporte a sí mismo | Botones no se renderizan; defensa en rules por si bypass. |
| Cloud Function de notif falla | Error interno | El review se guarda igual. La notif es best-effort. |

### Retry strategy
- Frontend reintenta `submitMatchReview` automáticamente **1 vez** con backoff 2s si es `unavailable` o `deadline-exceeded`.
- Borrador en `localStorage` se elimina al éxito; persiste entre sesiones si falla.
- Cloud Function `notifyPlayersOnMatchClose` es idempotente (flag `remindersSent.postMatchReviewNotified`).

### Degradación elegante
- Si `kudosSummary` no existe en `users/{uid}` (datos viejos), el perfil muestra "Sin kudos aún" en vez de romper.
- Si la Cloud Function de agregado falla, el kudo existe en `playerKudos` y puede re-agregarse con un backfill script.

---

## 6. UX — FLUJOS DE USUARIO

### Flujo principal (happy path)
1. Admin (o trigger automático) cierra partido → `closedAt` se setea.
2. **Inmediatamente**: Cloud Function crea notificación in-app a cada jugador: *"¿Cómo estuvo el partido? Dejá tu calificación"* con deep link a `/match/[id]/review`. La card de home aparece de inmediato.
3. User toca notif o card → navega a `/match/[id]/review`.
4. **Banner MVP** (si `hoursSinceClose < 2` y el user aún no votó): *"¿Ya votaste el MVP? Te quedan X min"* con link a `/join/[id]`.
5. Llena rating de experiencia (estrellas + 2 dimensiones + comentario opcional).
6. Toca 🌟 en compañeros que quiere destacar → sheet con 5 categorías → confirma.
7. Opcionalmente toca 🚩 en alguien → sheet con motivos → confirma.
8. Toca "Revisar y enviar" → **modal de confirmación** con resumen (rating, N kudos, N reportes) → "Confirmar".
9. Loading state → toast de éxito → vuelve a home.
10. La card del home desaparece. El badge del compañero premiado se actualiza cuando la Cloud Function agrega (latencia ~1-2s).

### Flujo del admin
1. Admin entra a `/admin` → ve badge rojo en menú "Reportes" si hay pendientes.
2. Toca "Reportes" → `/admin/reports` muestra cola ordenada:
   - Alertas de moderación primero (`moderationAlerts` con `status: "open"`).
   - Reportes individuales pendientes por `createdAt DESC`.
3. Toca un reporte → drawer con: jugador reportado (link a perfil), partido (link), motivo, comentario, histórico del reportado.
4. Acciones disponibles (solo registran la acción — no hay suspensión automática):
   - **Descartar** → `status: "dismissed"`.
   - **Advertencia** → `status: "reviewed"`, `adminAction: "warning"`, nota libre.
   - **Suspensión** → `status: "reviewed"`, `adminAction: "suspension"`, nota libre. TODO: integrar con sistema de bans en SDD futuro.
5. Cualquier acción dispara decremento de `_reportsSummary.pendingCount` via Cloud Function trigger.

### Estados de UI

| Estado | Qué muestra |
|---|---|
| Cargando | `MatchReviewSkeleton` |
| Dentro de ventana, sin enviar | Form completo + botón "Revisar y enviar". |
| Ya enviado | Resumen read-only. Sin opción de editar. |
| Partido reabierto | Banner "El partido fue reabierto, no podés calificar". |
| Ventana cerrada (≥2d) | *"La ventana de calificación cerró el [fecha]."* + link a home. |
| Error al cargar | Toast + retry. |

### Consideraciones mobile-first
- Touch targets ≥44×44px para botones de estrellas, kudos y reportes.
- Sheet de kudos y reporte: bottom-sheet slide-up, full-width en mobile, drag-to-dismiss.
- `pb-24 md:pb-0` en la pantalla de review.
- Inputs con `text-base` para evitar zoom iOS.
- Comment textarea altura inicial 3 líneas, expandible.

---

## 7. UI DESIGN — COMPONENTES Y ANIMACIONES

### Componentes nuevos

| Componente | Ubicación | Propósito |
|---|---|---|
| `PostMatchReviewCard` | `components/home/PostMatchReviewCard.tsx` | Card en home con CTA. |
| `MatchReviewPage` | `app/match/[id]/review/page.tsx` | Pantalla principal. |
| `MvpBanner` | `components/match-review/MvpBanner.tsx` | Banner contextual "¿Ya votaste el MVP?" (Phase 1, solo si <2h). |
| `ExperienceRatingSection` | `components/match-review/ExperienceRatingSection.tsx` | Estrellas + 2 dimensiones + comment. |
| `StarRating` | `components/match-review/StarRating.tsx` | 5 estrellas tap-to-select con layout animation. |
| `DimensionChips` | `components/match-review/DimensionChips.tsx` | 2 dimensiones × (👍/👎/skip): organización + nivel parejo. |
| `TeammateFeedbackList` | `components/match-review/TeammateFeedbackList.tsx` | Lista de compañeros (solo con uid) con 🌟 y 🚩. |
| `KudosSheet` | `components/match-review/KudosSheet.tsx` | Bottom sheet con 5 categorías. |
| `ReportSheet` | `components/match-review/ReportSheet.tsx` | Bottom sheet con motivos + comment. |
| `ReviewConfirmModal` | `components/match-review/ReviewConfirmModal.tsx` | Modal de confirmación antes de enviar. |
| `KudosBadges` | `components/profile/KudosBadges.tsx` | Muestra kudosSummary en perfil de jugador. |
| `MatchReviewSkeleton` | `components/skeletons/MatchReviewSkeleton.tsx` | Skeleton de carga. |
| `AdminReportsPage` | `app/admin/reports/page.tsx` | Cola de reportes para admin. |
| `AdminReportRow` | `app/admin/reports/components/AdminReportRow.tsx` | Fila de reporte. |
| `AdminReportDrawer` | `app/admin/reports/components/AdminReportDrawer.tsx` | Drawer con detalle y acciones. |
| `ModerationAlertBanner` | `app/admin/reports/components/ModerationAlertBanner.tsx` | Banner destacado para alertas. |

### Animaciones (Framer Motion)
- `AnimatePresence` en `KudosSheet`, `ReportSheet`, `ReviewConfirmModal`: slide-up desde abajo, spring stiffness 300.
- `layout` prop en `StarRating`: estrellas crecen suavemente al seleccionar.
- `KudosBadges`: stagger animation al montar (`delay: i * 0.05`).
- Toast de éxito al enviar review.

### Responsive
- **Mobile:** sheets full-width slide-up, padding lateral 16px.
- **Desktop (md+):** sheets como modal centrado (max-width 480px) con overlay. Form en 2 columnas: experiencia izquierda, compañeros derecha.

### Diseño visual
- Paleta consistente con MVP voting: tonos cálidos (amber) para kudos, neutrales (slate) para experiencia, rojo muted para reportes.
- Iconos de `lucide-react` excepto los emoji de las 5 categorías de kudo (emoji nativo, parte de la identidad visual).

---

## 8. ANALYTICS

| Evento | Trigger | Properties |
|---|---|---|
| `post_match_review_card_shown` | Card aparece en home | `match_id` |
| `post_match_review_started` | User abre `/match/[id]/review` | `match_id`, `source` (`home_card` \| `in_app_notif` \| `direct`) |
| `post_match_review_submitted` | Envío exitoso | `match_id`, `rating`, `kudos_given_count`, `reports_given_count`, `has_comment` |
| `post_match_review_abandoned` | Sale sin enviar (unmount sin submit) | `match_id` |
| `kudo_given` | Por cada kudo en el envío | `match_id`, `kudo_type` |
| `report_submitted` | Por cada reporte | `match_id`, `reason` |
| `admin_report_actioned` | Admin marca un reporte | `report_id`, `action` |

**Prioridad:** P2 (Engagement) para `post_match_review_submitted` y `kudo_given`. P3 para `report_*` y `admin_*`.

---

## 9. ARQUITECTURA TÉCNICA

### Modelo de datos

```typescript
// lib/domain/matchReview.ts

export type KudoType =
  | "buen_toque" | "goleador" | "muralla" | "fair_play" | "capitan";

export type ReportReason =
  | "no_show" | "aggressive_behavior" | "level_mismatch" | "late_no_warning" | "other";

export type ReportStatus = "pending" | "reviewed" | "dismissed";

export type AdminReportAction = "warning" | "suspension" | "dismissed";

export type DimensionValue = "good" | "bad" | null;

export interface MatchReviewDimensions {
  organization: DimensionValue;  // organización del partido
  levelBalance: DimensionValue;  // equipos parejos
}

export type Rating = 1 | 2 | 3 | 4 | 5;

export interface MatchReview {
  id?: string;          // {matchId}_{userUid}
  matchId: string;
  userUid: string;
  rating: Rating;
  dimensions: MatchReviewDimensions;
  comment?: string;
  createdAt: string;    // ISO
}

export interface PlayerKudo {
  id?: string;          // {matchId}_{giverUid}_{recipientUid}
  matchId: string;
  giverUid: string;
  giverName: string;    // snapshot
  recipientUid: string; // siempre uid (no guests)
  recipientName: string;// snapshot
  type: KudoType;
  createdAt: string;
}

export interface PlayerReport {
  id?: string;          // {matchId}_{reporterUid}_{reportedUid}
  matchId: string;
  reporterUid: string;
  reportedUid: string;
  reportedName: string; // snapshot
  reason: ReportReason;
  comment?: string;
  status: ReportStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  adminAction?: AdminReportAction;
  adminNote?: string;
}

export interface UserKudosSummary {
  buen_toque: number;
  goleador: number;
  muralla: number;
  fair_play: number;
  capitan: number;
  total: number;
}

export interface ModerationAlert {
  id?: string;
  reportedUid: string;
  reportedName: string;
  triggerCount: number;
  windowDays: 30;
  reportIds: string[];
  status: "open" | "resolved";
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}
```

### Capa de dominio (`lib/domain/matchReview.ts`)

Funciones puras (sin Firebase, sin React):

```typescript
// Elegibilidad
canSubmitReview(match: Match, userUid: string, now: Date): boolean
wasUserInMatch(match: Match, userUid: string): boolean
isReviewWindowExpired(closedAt: string, now: Date): boolean
getReviewWindowEnd(closedAt: string): Date
hoursSinceClose(closedAt: string, now: Date): number
shouldShowHomeCard(closedAt: string, hasSubmitted: boolean, now: Date): boolean
shouldShowMvpBanner(closedAt: string, hasVotedMvp: boolean, now: Date): boolean // <2h y sin voto

// Límite activos
hasReachedActiveReportLimit(
  previousReports: PlayerReport[],
  reporterUid: string,
  reportedUid: string
): boolean  // true si ≥2 con status === "pending"

// Validaciones
validateRating(rating: unknown): asserts rating is Rating
validateDimensions(dim: unknown): asserts dim is MatchReviewDimensions
validateComment(comment: unknown): asserts comment is string | undefined
validateKudoType(t: unknown): asserts t is KudoType
validateReportPayload(p: { reason: ReportReason; comment?: string }): void

// Metadata y defaults
KUDO_META: Record<KudoType, { emoji: string; label: string }>
REPORT_REASON_META: Record<ReportReason, { label: string; requiresComment: boolean }>
emptyKudosSummary(): UserKudosSummary
```

### Capa API (`lib/matchReview.ts`)

```typescript
// Jugador
submitMatchReview(input: {
  matchId: string;
  userUid: string;
  rating: Rating;
  dimensions: MatchReviewDimensions;
  comment?: string;
  kudos: Array<{ recipientUid: string; recipientName: string; type: KudoType }>;
  reports: Array<{ reportedUid: string; reportedName: string; reason: ReportReason; comment?: string }>;
}): Promise<void>

getMyReview(matchId: string, userUid: string): Promise<MatchReview | null>
getKudosSummary(uid: string): Promise<UserKudosSummary>
getKudosHistoryForUser(uid: string, limit?: number): Promise<PlayerKudo[]>

// Admin
listPendingReports(opts: { limit: number; cursor?: string }): Promise<PlayerReport[]>
listReportsForUser(reportedUid: string): Promise<PlayerReport[]>
markReportReviewed(reportId: string, adminUid: string, action: AdminReportAction, note?: string): Promise<void>
listModerationAlerts(): Promise<ModerationAlert[]>
resolveModerationAlert(alertId: string, adminUid: string): Promise<void>
```

### Cloud Functions (`functions/src/postMatchReview.ts`)

```typescript
// Trigger: onUpdate de matches — cuando status cambia a "closed".
// Crea notif in-app a cada jugador. Idempotente con flag remindersSent.postMatchReviewNotified.
notifyPlayersOnMatchClose: firestore.onDocumentUpdated("matches/{matchId}", ...)

// Trigger: onCreate de playerKudos.
// Incrementa kudosSummary del recipient + crea notif in-app al recipient.
aggregateKudoOnCreate: firestore.onDocumentCreated("playerKudos/{id}", ...)

// Trigger: onCreate de playerReports.
// Incrementa _reportsSummary del reported + llama checkModerationThreshold.
aggregateReportOnCreate: firestore.onDocumentCreated("playerReports/{id}", ...)

// Trigger: onUpdate de playerReports (status cambia de "pending").
// Decrementa _reportsSummary.pendingCount del reported.
decrementPendingOnReview: firestore.onDocumentUpdated("playerReports/{id}", ...)
```

### Componentes UI

```
app/
  match/[id]/review/page.tsx
  admin/reports/page.tsx
  admin/reports/components/
    AdminReportRow.tsx
    AdminReportDrawer.tsx
    ModerationAlertBanner.tsx
components/
  home/PostMatchReviewCard.tsx
  match-review/
    MvpBanner.tsx
    ExperienceRatingSection.tsx
    StarRating.tsx
    DimensionChips.tsx
    TeammateFeedbackList.tsx
    KudosSheet.tsx
    ReportSheet.tsx
    ReviewConfirmModal.tsx
  profile/KudosBadges.tsx
  skeletons/MatchReviewSkeleton.tsx
```

---

## 10. CRITERIOS DE ACEPTACIÓN

### Jugador
- [ ] Notificación in-app creada inmediatamente al cerrar el partido para todos los jugadores.
- [ ] Card de review aparece inmediatamente en home tras el cierre.
- [ ] Card desaparece al enviar review o pasados 2 días desde `closedAt`.
- [ ] Banner del MVP visible en review screen si `hoursSinceClose < 2` y el user no votó aún.
- [ ] Solo usuarios que estuvieron en `teams.A/B` pueden calificar.
- [ ] Si partido reabre, form bloqueado (reviews existentes se conservan).
- [ ] Rating con estrellas 1-5 obligatorio.
- [ ] 2 dimensiones (organización, nivel parejo) opcionales.
- [ ] Comentario opcional, máx 500 chars.
- [ ] Kudos: 1 por compañero, solo a users con uid, no a sí mismo.
- [ ] Reportes: 1 por compañero por partido, no a sí mismo, máximo 2 activos `pending` cross-partidos.
- [ ] Si motivo de reporte es "Otro", el comment es obligatorio.
- [ ] Modal de confirmación muestra resumen antes de enviar.
- [ ] Envío atómico: todo o nada.
- [ ] Idempotencia: doble tap en "Confirmar" no duplica.
- [ ] Reviews son inmutables: no hay botón de editar.
- [ ] Borrador en localStorage si hay error de red.

### Notificaciones
- [ ] Notif in-app al recipient cuando recibe un kudo.
- [ ] Notif in-app al jugador al cerrar el partido con deep link al review.
- [ ] Flags de idempotencia evitan duplicados.

### Perfil
- [ ] Perfil de jugador muestra `KudosBadges` con summary acumulado.
- [ ] Drawer "Ver historial" muestra kudos paginados.
- [ ] Si user no tiene kudos, mensaje vacío amigable.

### Admin
- [ ] Tab `/admin/reports` con cola ordenada (alertas primero, luego pendientes).
- [ ] Badge rojo en navegación admin si hay reportes pendientes.
- [ ] Drawer de detalle muestra motivo, comentario, histórico del reportado.
- [ ] Acciones: descartar, advertencia, suspensión (todas solo registran — sin bloqueo automático).
- [ ] Al accionar un reporte, libera cupo de "reportes activos" del reporter.
- [ ] Auto-alerta cuando un user acumula ≥3 reportes con motivos distintos en 30d.
- [ ] Reportes son privados: el reportado nunca los ve.

### Seguridad
- [ ] Firestore Rules bloquean lectura cruzada de reviews y reports.
- [ ] Cliente no puede patch directo a `kudosSummary` ni `_reportsSummary`.
- [ ] Analytics no incluye `recipient_uid` en eventos de kudo/report.

### Performance
- [ ] Perfil de jugador carga kudos summary en <500ms (1 doc read).
- [ ] Pantalla de review carga en <1s con skeleton.
- [ ] Envío de review con 13 kudos resuelve en <2s.

---

## 11. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---|---|
| `lib/domain/matchReview.ts` | **Nuevo**: tipos, validaciones, funciones puras. |
| `lib/domain/errors.ts` | **Modificar**: agregar `ReviewNotEligibleError`, `ReviewWindowExpiredError`, `ReviewAlreadyExistsError`, `ActiveReportLimitError`, `SelfTargetError`. |
| `lib/domain/user.ts` | **Modificar**: agregar `kudosSummary?: UserKudosSummary` y `_reportsSummary?: UserReportsSummary` a `UserProfile`. |
| `lib/matchReview.ts` | **Nuevo**: API Firestore (`submitMatchReview`, transacciones, queries admin). |
| `app/match/[id]/review/page.tsx` | **Nuevo**: pantalla principal de review. |
| `app/admin/reports/page.tsx` | **Nuevo**: cola de reportes para admin. |
| `app/admin/reports/components/*.tsx` | **Nuevo**: row, drawer, banner de alerta. |
| `components/home/PostMatchReviewCard.tsx` | **Nuevo**: card en home. |
| `app/page.tsx` (home) | **Modificar**: integrar `PostMatchReviewCard`. |
| `components/match-review/*.tsx` | **Nuevo**: MvpBanner, rating section, sheets, modal de confirmación, lista. |
| `components/profile/KudosBadges.tsx` | **Nuevo**: badges en perfil. |
| `app/player/[uid]/page.tsx` | **Modificar**: agregar `KudosBadges`. |
| `components/skeletons/MatchReviewSkeleton.tsx` | **Nuevo**: skeleton. |
| `functions/src/postMatchReview.ts` | **Nuevo**: 4 triggers (notifOnClose, aggregateKudo, aggregateReport, decrementPending). |
| `functions/src/index.ts` | **Modificar**: exportar nuevas functions. |
| `firestore.rules` | **Modificar**: 4 colecciones nuevas + proteger `kudosSummary`/`_reportsSummary` en user rule. |
| `firestore.indexes.json` | **Modificar**: agregar 8 índices. |
| `lib/analytics.ts` | **Modificar**: registrar 7 eventos nuevos. |
| `components/admin/AdminNav.tsx` (o equiv.) | **Modificar**: agregar tab "Reportes" con badge rojo. |
| `docs/MVP_VOTING_FEATURE_SDD.md` | **Corregir**: ventana de votación era 3h en el SDD pero el código implementa **2h** (`hoursSinceClosed > 2` en `lib/mvp.ts`). |

---

## 12. PLAN DE IMPLEMENTACIÓN

### Sesión 1 — Dominio y modelo
- `lib/domain/matchReview.ts` con tipos, constantes y funciones puras.
- `lib/domain/errors.ts`: nuevos errores de review.
- `lib/domain/user.ts`: extender `UserProfile` con summaries.
- `firestore.rules`: 4 colecciones nuevas + proteger campos.
- `firestore.indexes.json`: 8 índices.

### Sesión 2 — Backend / API
- `lib/matchReview.ts` con `submitMatchReview` y queries admin.
- Cloud Functions: `notifyPlayersOnMatchClose`, `aggregateKudoOnCreate`, `aggregateReportOnCreate`, `decrementPendingOnReview`, `checkModerationThreshold`.

### Sesión 3 — UI Jugador
- `PostMatchReviewCard` en home.
- `/match/[id]/review/page.tsx` completo con sheets, `MvpBanner`, modal de confirmación.
- `KudosBadges` en perfil de jugador.
- Skeleton.

### Sesión 4 — UI Admin
- `/admin/reports/page.tsx`.
- Drawer con detalle y acciones.
- `ModerationAlertBanner`.
- Badge rojo en navegación admin.

Cada sesión termina en estado deployable. Feature flag `NEXT_PUBLIC_POST_MATCH_REVIEW_ENABLED` para evitar exponer UI incompleta.

---

## 13. DECISIONES CERRADAS

| Decisión | Resolución |
|---|---|
| Trigger del review | Inmediato: notif in-app al cerrar + card en home. Sin push. |
| Dimensiones | Solo organización + nivel parejo (sin "estado de cancha"). |
| Edición del rating | No. Reviews inmutables. Modal de confirmación antes de enviar. |
| Kudos a guests | No. Solo jugadores con `uid`. |
| Notif al recibir kudo | In-app solamente. Sin push. |
| MVP + Review | Pantallas independientes. MVP no se toca. Banner contextual en review screen si <2h y sin voto. |
| Partido reabierto | Reviews existentes se congelan; no se borran, no se aceptan nuevas mientras esté `open`. |
| Acciones de admin | Solo registra (warning / dismissal). Sin suspensión automática. TODO: SDD de bans/suspensiones. |
| Privacidad del reporter | Solo admin lo ve. El reportado nunca se entera. |
| Feedback al reporter | Notif genérica "tu reporte fue revisado". Sin detalles. |
| Límite de reportes | Máximo 2 `pending` por par reporter→reportado (cross-partidos). Sin cooldown temporal. |
| Ventana MVP | 2 horas (código fuente: `hoursSinceClosed > 2` en `lib/mvp.ts`). SDD del MVP tiene un error tipográfico (dice 3h). |
| Ranking público de kudos | Fase 2. Por ahora solo perfil individual. |
