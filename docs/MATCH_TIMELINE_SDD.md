# Feature: Timeline del Partido + Confirmación de Equipos

## 📋 Specification-Driven Development (SDD)

Sistema que informa a los jugadores el estado actual del partido mediante un timeline visual en la página `/join/[id]`, introduce un paso de **confirmación de equipos** por parte del admin antes de hacerlos visibles, y muestra el **nombre del organizador** como referente.

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo

Dar visibilidad a los jugadores sobre el progreso del partido (desde la convocatoria hasta el cierre), permitir al admin publicar los equipos de forma controlada, y que los jugadores sepan quién organiza el partido.

### 1.1 Timeline del Partido

Un componente visual compacto (card + dots de progreso) que muestra el paso actual del partido.

**4 pasos del timeline:**

| # | Step ID | Label (ES) | Condición de completado | Subtítulo dinámico |
|---|---------|-----------|------------------------|-------------------|
| 1 | `joining` | Confirmando jugadores | `teamsConfirmed === true` | `{confirmedCount}/{maxPlayers} confirmados` |
| 2 | `teams_confirmed` | Equipos definidos | `teamsConfirmed === true` | `¡Revisa tu equipo abajo!` |
| 3 | `mvp_voting` | Votación MVP | `status === "closed"` | `Vota por la figura del partido` |
| 4 | `closed` | Partido cerrado | `status === "closed"` | `Resultado final registrado` |

**Paso activo:** el primer paso no completado. Todos los pasos anteriores se marcan como completados.

**Info estática (NO es un paso):** Si existe `creatorSnapshot.name`, se muestra como dato fijo: `"Organiza: {name}"` en la parte superior de la card.

### 1.2 Confirmación de Equipos

Nuevo paso intermedio en el flujo admin entre "balancear" y "cerrar partido".

| # | Regla | Impacto |
|---|-------|---------|
| 1 | El admin balancea equipos → se guardan en `match.teams` con `teamsConfirmed: false` | Los jugadores NO ven los equipos aún. Timeline muestra paso 1 (joining) como activo. |
| 2 | El admin puede re-balancear, ajustar con drag-and-drop sin publicar | Cada re-balance o guardado resetea `teamsConfirmed` a `false`. |
| 3 | El admin confirma equipos → `teamsConfirmed: true` | Los jugadores VEN los equipos en `/join/[id]`. Timeline avanza al paso 2 (teams_confirmed). |
| 4 | Confirmar equipos requiere que `teams` exista y `status === "open"` | No se puede confirmar sin equipos ni en partido cerrado. |
| 5 | Al re-balancear después de confirmar, `teamsConfirmed` se resetea a `false` | Los jugadores vuelven a ver la lista plana hasta que el admin re-confirme. |
| 6 | La confirmación es una acción transaccional (`runTransaction`) | Previene race conditions. |

### 1.3 Vista de Equipos Confirmados en Join Page

Cuando `teamsConfirmed === true && match.teams` existe:

| # | Regla | Impacto |
|---|-------|---------|
| 1 | Reemplazar la lista plana de jugadores por la vista de dos equipos | Equipo A (rojo) y Equipo B (azul) en dos columnas. |
| 2 | Cada jugador muestra avatar, nombre, icono de posición | Usar fallback pattern: `p.photoURL \|\| fullPlayer?.photoURL`. |
| 3 | Resaltar el equipo del usuario actual con "(Tú)" | Visual highlight del equipo donde está el usuario. |
| 4 | Solo lectura — sin scores, sin MVP, sin drag-and-drop | Diferente a la vista cerrada (que tiene scores + MVP). |
| 5 | Si `isClosed && teams` → se muestra la vista cerrada existente | Prioridad: cerrado > equipos confirmados > lista plana. |

### 1.4 Nombre del Organizador

| # | Regla | Impacto |
|---|-------|---------|
| 1 | Al crear un partido, guardar `creatorSnapshot: { name, photoURL }` en el documento | Denormalizado, patrón idéntico a `locationSnapshot`. |
| 2 | Se muestra como info estática en la card del timeline | "Organiza: Juan Pérez". |
| 3 | Partidos antiguos sin `creatorSnapshot` no muestran el nombre | Sin fallback fetch. Cero costo extra de lecturas. |

---

## 2. MODELO DE DATOS

### 2.1 Campos nuevos en `Match` (`lib/domain/match.ts`)

```typescript
// Agregar a la interfaz Match:
teamsConfirmed?: boolean;         // true cuando admin publica los equipos
teamsConfirmedAt?: string;        // ISO string del momento de confirmación
creatorSnapshot?: {               // Snapshot del creador al momento de crear
  name: string;
  photoURL?: string;
};
```

### 2.2 Campos nuevos en `CreateMatchInput`

```typescript
// Agregar a CreateMatchInput:
creatorSnapshot?: {
  name: string;
  photoURL?: string;
};
```

### 2.3 Tipo para el Timeline

```typescript
export type TimelineStep = "joining" | "teams_confirmed" | "mvp_voting" | "closed";

export interface TimelineState {
  currentStep: TimelineStep;
  completedSteps: TimelineStep[];
  stepIndex: number;       // 0-based index del paso activo
  totalSteps: number;      // siempre 4
}
```

---

## 3. ARQUITECTURA TÉCNICA

### 3.1 Diagrama de Capas

```
┌─────────────────────────────────────────────────────┐
│                   ESPECIFICACIÓN                     │
└─────────────────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
    ┌────────┐     ┌─────────┐    ┌──────────┐
    │ DOMINIO│     │   API   │    │    UI    │
    └────────┘     └─────────┘    └──────────┘
    getMatch       confirmTeams   MatchTimeline
    TimelineState  createMatch    JoinPage teams
    (función pura) saveTeams mod  Admin confirm btn
```

### 3.2 Capa de Dominio (`lib/domain/match.ts`)

Nueva función pura `getMatchTimelineState()`:
- Entrada: `Pick<Match, "status" | "teams" | "teamsConfirmed" | "mvpVotes">`, `confirmedCount`, `maxPlayers`
- Salida: `TimelineState`
- Lógica:
  - Si `status === "closed"` → todos los pasos completados, `currentStep = "closed"`, `stepIndex = 3`
  - Si `teamsConfirmed === true` → pasos 1-2 completados, `currentStep = "teams_confirmed"`, `stepIndex = 1`
  - Default → `currentStep = "joining"`, `stepIndex = 0`

### 3.3 Capa de API (`lib/matches.ts`)

1. **`createMatch()`** — Agregar `creatorSnapshot` al documento:
   ```typescript
   creatorSnapshot: {
     name: profile.name,
     photoURL: profile.photoURL || null,
   }
   ```

2. **`confirmTeams(matchId)`** — Nueva función transaccional:
   ```typescript
   await runTransaction(db, async (transaction) => {
     const snap = await transaction.get(ref);
     const data = snap.data();
     if (!data?.teams) throw new BusinessError("No hay equipos balanceados");
     if (data.status !== "open") throw new BusinessError("El partido no está abierto");
     transaction.update(ref, {
       teamsConfirmed: true,
       teamsConfirmedAt: new Date().toISOString(),
     });
   });
   ```

3. **`saveTeams()`** — Modificar para resetear confirmación:
   ```typescript
   await updateDoc(ref, { teams, teamsConfirmed: false });
   ```

### 3.4 Capa de UI

#### Componente `MatchTimeline` (`components/MatchTimeline.tsx`)

Card compacta con:
- Línea de organizador (si existe `creatorSnapshot`)
- Label + subtítulo del paso actual
- 4 dots de progreso (● completado, ○ pendiente, con paso activo resaltado)
- Indicador "Paso X de 4"
- Framer Motion para transiciones
- Iconos de `lucide-react`: `Users`, `Shield`, `Trophy`, `Lock`

#### Join Page (`app/join/[id]/page.tsx`)

- Timeline entre card de detalles y card de asistencia
- Condicional triple para área de jugadores/equipos:
  1. `isClosed && teams` → vista cerrada existente (scores + MVP)
  2. `teamsConfirmed && teams` → vista de equipos confirmados (solo lectura)
  3. Default → lista plana de jugadores confirmados

#### Admin TeamsTab (`app/match/[id]/components/TeamsTab.tsx`)

- Botón "Confirmar equipos" con diálogo de confirmación
- Badge "Equipos publicados" cuando `teamsConfirmed === true`
- Re-balance automáticamente despublica

---

## 4. ANALYTICS

Nuevo evento:
- `teams_confirmed` — Se dispara cuando el admin confirma/publica los equipos. Incluye `match_id`.

---

## 5. CRITERIOS DE ACEPTACIÓN

| # | Criterio | Verificación |
|---|----------|-------------|
| 1 | Al crear un partido nuevo, `creatorSnapshot` contiene nombre y foto del creador | Inspeccionar documento en Firestore |
| 2 | La card del timeline muestra "Organiza: {nombre}" en la join page | Visual en `/join/[id]` |
| 3 | El timeline muestra "Confirmando jugadores" con contador actualizado en real-time | Confirmar asistencia desde otro dispositivo y ver actualización |
| 4 | Balancear equipos en admin NO muestra equipos a jugadores | Verificar que `/join/[id]` sigue mostrando lista plana |
| 5 | Confirmar equipos en admin muestra equipos a jugadores | Verificar que `/join/[id]` muestra vista de dos equipos |
| 6 | Re-balancear después de confirmar oculta equipos a jugadores | Verificar reset de `teamsConfirmed` |
| 7 | El timeline avanza al cerrar el partido mostrando "Partido cerrado" | Visual en `/join/[id]` |
| 8 | Partidos antiguos sin `creatorSnapshot` no muestran organizador y no hacen fetch extra | Verificar con partido existente |
| 9 | La vista de equipos confirmados muestra avatares, posiciones, y "(Tú)" correctamente | Visual en `/join/[id]` |
| 10 | El botón "Confirmar equipos" solo aparece cuando hay equipos sin confirmar | Visual en admin |

---

## 6. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---------|--------|
| `lib/domain/match.ts` | Tipos `TimelineStep`, `TimelineState`, `creatorSnapshot`. Función `getMatchTimelineState()` |
| `lib/matches.ts` | Modificar `createMatch()`, `saveTeams()`. Nueva `confirmTeams()` |
| `lib/analytics.ts` | Nuevo `logTeamsConfirmed()` |
| `components/MatchTimeline.tsx` | Nuevo componente |
| `app/join/[id]/page.tsx` | Integrar timeline, vista equipos confirmados |
| `app/match/[id]/components/TeamsTab.tsx` | Botón confirmar equipos |
| `app/match/[id]/page.tsx` | Handler y props para confirmar |
| `components/skeletons/JoinSkeleton.tsx` | Skeleton del timeline |
| `firestore.rules` | Verificar cobertura |
