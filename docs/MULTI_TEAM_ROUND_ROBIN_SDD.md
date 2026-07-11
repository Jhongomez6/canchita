# Feature: Multi-Equipos (N equipos balanceados) con Round-Robin

## 📋 Specification-Driven Development (SDD)

Cuando hay suficientes jugadores anotados para armar 3-4 equipos, el admin puede generar N equipos balanceados que juegan un torneo round-robin (todos contra todos); el sistema arma la tabla de posiciones a partir de los marcadores de cada enfrentamiento y calcula las stats/XP de cada jugador según el balance de victorias/empates/derrotas de su equipo.

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo

Hoy el balanceo está cableado a **exactamente 2 equipos** (`teams: { A, B }`) en toda la cadena: [lib/domain/team.ts](../lib/domain/team.ts), el modelo `Match` ([lib/domain/match.ts:49-52](../lib/domain/match.ts#L49-L52)), el guardado de score ([app/match/[id]/page.tsx](../app/match/[id]/page.tsx)), el procesamiento de stats ([lib/playerStats.ts](../lib/playerStats.ts)) y el otorgamiento de XP ([functions/src/xp.ts:408](../functions/src/xp.ts#L408)).

Con partidos de mucha convocatoria (16-24 anotados) el organizador termina teniendo que **crear varios partidos separados** o balancear a mano. Esta feature permite, en un solo partido, generar **3 o 4 equipos parejos** y correr un **round-robin** donde cada equipo juega contra cada otro. El admin anota el marcador de cada enfrentamiento y el sistema:
1. Arma la tabla de posiciones en vivo.
2. Determina el campeón.
3. Calcula el resultado (W/D/L) de cada jugador a partir del **balance neto de los fixtures que jugó su equipo**.

### Reglas de Negocio

| # | Regla | Impacto UI |
|---|-------|------------|
| 1 | El modo multi-equipo solo está disponible si hay **≥ 15 jugadores confirmados** (mínimo para 3 equipos de 5). Por debajo, solo modo clásico 2 equipos. | El toggle "Multi-equipos" aparece deshabilitado con tooltip explicativo hasta llegar al umbral. |
| 2 | El admin elige el **número de equipos** `N ∈ {3, 4}`. `N` se limita a `floor(confirmados / MIN_PLAYERS_PER_TEAM)` con `MIN_PLAYERS_PER_TEAM = 5` (15 confirmados → 3 equipos; 20+ → hasta 4). | Selector de N con opciones válidas según convocatoria actual. |
| 3 | Los equipos se reparten con **diferencia máxima de 1 jugador** entre el más grande y el más chico. | Chips con conteo por equipo. |
| 4 | Se distribuye **1 arquero por equipo** cuando hay ≥ N arqueros; el resto va al pool general. | Warning si faltan arqueros (igual que hoy). |
| 5 | El torneo es **round-robin simple**: se generan `C(N,2)` fixtures (N=3 → 3 fixtures; N=4 → 6 fixtures). Cada par juega **una vez**. | Lista de fixtures con marcador editable. |
| 6 | El resultado de cada fixture se registra como `scoreHome` / `scoreAway` (enteros ≥ 0). Un fixture sin marcador es "no jugado". | Inputs numéricos; badge "pendiente" si `null`. |
| 7 | **Tabla de posiciones**: 3 pts victoria, 1 empate, 0 derrota. Desempate: PTS → DIF (dif. de goles) → GF (goles a favor) → orden de creación. | Tabla ordenada con resaltado del líder. |
| 8 | **Campeón** = equipo en la posición 1 de la tabla **una vez que todos los fixtures tienen marcador**. Antes, "líder provisional". | Corona 👑 sobre el equipo líder; label cambia al cerrar. |
| 9 | **Resultado del jugador** (para stats/XP): se deriva del **balance neto de fixtures de su equipo**: `W > L → victoria`, `W == L → empate`, `W < L → derrota`. Es **una sola** clasificación por sesión (no por fixture). | En la vista del jugador se muestra "Tu equipo: 2G 1E 0P → Victoria". |
| 10 | El procesamiento de stats requiere que **todos los fixtures tengan marcador**. | Botón "Cerrar partido" deshabilitado hasta completar; muestra "Faltan N marcadores". |
| 11 | **MVP**: sigue siendo **uno solo por partido** (transversal a todos los equipos). Los candidatos son todos los jugadores de todos los equipos. | Sin cambio de flujo; solo cambia el origen de la lista de candidatos. |
| 12 | Un partido es **clásico o multi**, nunca ambos. Cambiar de modo **descarta** los equipos/fixtures previos (con confirmación). | Modal de confirmación al cambiar de modo. |
| 13 | El modo multi se configura **después de crear** el partido, en la tab **Equipos** — nunca en el formulario de creación. No hay flag "multi-equipo" al crear. El mismo partido puede terminar siendo 2 o N equipos según quién confirme. | La creación es idéntica a hoy; el toggle aparece solo en la tab Equipos al llegar a 15 confirmados. |
| 14 | En la creación se **relaja la validación de `maxPlayers` par** (hoy forzada a número par por asumir 2 equipos): se permiten valores como 15 o 20 para partidos grandes. | El stepper de `maxPlayers` acepta impares/múltiplos de 5. |

---

## 2. ESCALABILIDAD

### Volumen esperado

- App de fútbol amateur en crecimiento gradual. Un partido multi-equipo típico: **15-24 jugadores**, **3-4 equipos** (de 5), **3-6 fixtures**.
- El torneo entero vive **embebido en el documento `matches/{id}`** — no se crea colección nueva.
- Tamaño estimado del sub-objeto `multiTeam`: 4 equipos × ~6 jugadores (objeto Player ~250 bytes) + 6 fixtures (~120 bytes) ≈ **7 KB**. El doc `Match` total queda muy por debajo del límite de **1 MB** de Firestore. Sin riesgo.

### Índices Firestore requeridos

- **Ninguno nuevo.** La tabla de posiciones se calcula **en memoria** (función pura `computeStandings`) tanto en cliente como en la Cloud Function. No hay queries nuevas sobre `matches` ni sub-colecciones.
- Se reutiliza el índice/campo existente `playerUids` (array-contains) para el historial del jugador — los uids de todos los equipos multi se agregan a `playerUids` igual que hoy.

### Paginación

- No aplica. N ≤ 4 equipos y ≤ 6 fixtures se renderizan completos sin virtualización. Las listas de jugadores por equipo (≤ 6-8) tampoco requieren paginación.

---

## 3. CONCURRENCIA SEGURA

### Operaciones que requieren `runTransaction()`

| Operación | Función | Por qué transacción |
|-----------|---------|---------------------|
| **Generar / regenerar N equipos** | `saveMultiTeams(matchId, tournament)` | Un jugador puede unirse/salir mientras el admin balancea; sin transacción se pisaría `players` o `multiTeam`. Lee fresco, valida `status == "open"`, escribe. |
| **Registrar marcador de un fixture** | `saveFixtureScore(matchId, fixtureId, scoreHome, scoreAway)` | Dos admins (owner + location_admin) podrían editar fixtures distintos a la vez; sin transacción, un `update` con el array completo `fixtures` pisa el cambio del otro. Se lee fresco, se muta **solo** el fixture por id, se reescribe el array. |
| **Unirse a partido con equipos ya generados** | `joinMatch` (extensión) | Igual que hoy `assignToSmallestTeam`, pero generalizado a `assignToSmallestMultiTeam`. Lee fresco, asigna al equipo más chico, escribe en la misma transacción. |
| **Cerrar partido / procesar stats** | `processMultiTeamStats(matchId)` | Debe leer fresco todos los fixtures, validar que estén completos, calcular resultados y marcar `statsProcessed`/`xpAwarded` atómicamente para evitar doble conteo. |

### Race conditions identificadas

- **Escenario**: Admin A registra el fixture `T1_T2` mientras Admin B registra `T3_T4`. → **Mitigación**: `saveFixtureScore` corre en `runTransaction`, lee el array `fixtures` fresco, reemplaza únicamente el elemento con `id` coincidente y reescribe. Los dos updates se serializan sin perder datos.
- **Escenario**: Jugador se une justo cuando el admin presiona "Balancear en N equipos". → **Mitigación**: `saveMultiTeams` valida dentro de la transacción que el set de `playerUids` no cambió desde el snapshot usado para balancear (`expectedPlayerCount`); si cambió, aborta con `BusinessError("La lista de jugadores cambió, vuelve a balancear")`.
- **Escenario**: Doble click en "Cerrar partido" → doble procesamiento de stats/XP. → **Mitigación**: bandera `statsProcessed` (stats en cliente) + `xpAwarded` (XP en Cloud Function). La CF `awardXpOnMatchStatsProcessed` ya es idempotente por `xpAwarded === true` ([functions/src/xp.ts:419](../functions/src/xp.ts#L419)); se extiende para el path multi sin romper esa garantía.

---

## 4. SEGURIDAD

### Autenticación y autorización

- **Generar equipos, editar fixtures, cerrar partido**: solo **admin del partido** (creador o admin con permisos sobre la location — mismo criterio de `canViewMatchAdmin` en [lib/domain/match.ts:145](../lib/domain/match.ts#L145)).
- **Leer** `multiTeam`, `fixtures`, `standings`: cualquier jugador autenticado (igual que `teams`/`score` hoy).
- **MVP / kudos / review**: sin cambios de autorización; solo se amplía el conjunto de "jugadores del partido" para incluir a todos los equipos multi.

### Firestore Rules requeridas

**Decisión (opción más simple):** `multiTeam`, `fixtures` y `previousMultiTeam` **heredan el mismo comportamiento que `teams`/`score` tienen hoy** — no se agregan restricciones nuevas. La regla actual de `update` sobre `matches` ([firestore.rules:131-144](../firestore.rules#L131-L144)) ya permite a un jugador del partido escribir esos campos, y **eso es necesario** para los joins tardíos (`assignToSmallestMultiTeam` corre client-side, igual que hoy `assignToSmallestTeam`). Mantener el mismo modelo de confianza evita mover joins a Cloud Functions y no rompe nada.

**No se requiere ningún cambio en `firestore.rules`.** El único campo que ya se bloquea (`payments`) sigue igual.

```javascript
// SIN CAMBIOS — la regla actual ya cubre multiTeam/fixtures igual que teams/score:
allow update: if request.auth != null
  && (
    isAdmin()
    ||
    (
      (request.auth.uid in resource.data.playerUids
        || request.auth.uid in request.resource.data.playerUids)
      && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['payments'])
    )
  );
```

> **Riesgo residual (aceptado):** un jugador podría, técnicamente, editar un marcador de fixture vía API directa — exactamente el mismo riesgo que ya existe hoy con `score` en modo clásico. La UI solo expone la edición a admins. Endurecer esto (bloquear `multiTeam`/`score`/`statsProcessed` a no-admins) queda como mejora futura opcional que exige mover los joins a Cloud Functions; **fuera de alcance de esta feature** por decisión de mantenerlo simple.

### Validaciones de input (OWASP: nunca confiar en el cliente)

Capa de dominio pura (`lib/domain/multiTeam.ts`), invocada tanto en cliente como en la CF:

- `numTeams`: entero en `{3, 4}` y `≤ floor(confirmados / MIN_PLAYERS_PER_TEAM)` con `MIN_PLAYERS_PER_TEAM = 5`.
- `scoreHome` / `scoreAway`: enteros `≥ 0` y `≤ 99` (evita overflow/typos). `null` permitido solo para "pendiente".
- `fixtureId`: debe existir en el array de fixtures generado; rechazar ids desconocidos.
- Cada equipo debe tener `≥ MIN_PLAYERS_PER_TEAM` (5) jugadores tras el balanceo.
- `color` de cada equipo: uno de los 8 válidos de `TEAM_COLOR_CONFIG` ([lib/domain/team-colors.ts:1](../lib/domain/team-colors.ts#L1)).

### Datos sensibles

- Ninguno nuevo. Los objetos `Player` embebidos en equipos ya se exponen hoy (nombre, nivel, posición, foto). No se agregan email/teléfono a `multiTeam`.

---

## 5. TOLERANCIA A FALLOS

### Estados de error y fallbacks

| Error | Causa probable | Fallback UI |
|-------|---------------|-------------|
| `permission-denied` al balancear | Usuario no-admin intentó generar equipos | Toast "No tienes permisos para armar equipos" + oculta el botón. |
| `BusinessError` "lista cambió" | Alguien se unió/salió durante el balanceo | Toast + re-fetch automático de jugadores + resalta el botón "Volver a balancear". |
| Firestore offline / timeout al guardar fixture | Sin red | El input mantiene el valor local (optimista), badge "Sin guardar" ámbar, retry automático al reconectar; toast solo si falla 3 veces. |
| Cierre con fixtures incompletos | Admin presiona cerrar antes de tiempo | Botón deshabilitado + texto "Faltan N marcadores"; nunca llega a Firestore. |
| CF `awardXpOnMatchStatsProcessed` falla parcialmente | Error transitorio en un uid | La CF ya envuelve cada `awardXp` en try/catch por jugador ([functions/src/xp.ts:491](../functions/src/xp.ts#L491)); un fallo aislado no bloquea al resto. `xpAwarded` se marca al final; si la CF muere antes, el re-cierre reintenta (idempotente). |

### Retry strategy

- **Guardar fixture**: retry optimista con backoff (react-query/SWR ya presente para matches). Máximo 3 intentos, luego error al usuario.
- **Balancear**: sin retry automático (es determinista y barato); el usuario reintenta manualmente.
- **Stats/XP**: idempotencia por `statsProcessed`/`xpAwarded`; re-cierre re-ejecuta con reversión (`previousMultiTeam`) sin duplicar.

### Degradación elegante

- Si `computeStandings` recibe fixtures parciales, calcula la tabla **con lo que hay** y marca "provisional". La UI nunca crashea por datos incompletos.
- Si un partido multi viejo carece de `standings` cacheado, se recalcula on-the-fly desde `fixtures` (fuente de verdad).

---

## 6. UX — FLUJOS DE USUARIO

### Flujo principal (happy path) — Admin

0. **Creación (sin cambios de flujo)**: el admin crea el partido normalmente; solo elige un `maxPlayers` alto (ej. 15-20) si anticipa mucha gente. **No hay ninguna opción "multi-equipo" en el formulario de creación** — se decide todo después según la convocatoria real.
1. Partido llega a ≥ 15 confirmados → en la tab **Equipos** aparece el toggle **"Modo: 2 equipos / Multi-equipos"**. El acceso al modo multi está disponible mientras el partido esté **abierto**, **incluso si ya se balancearon los 2 equipos clásicos** (el admin puede cambiar de opinión). Al generar los equipos multi, `saveMultiTeams()` limpia el modo clásico (`teams: null`, `score: null`, `teamsConfirmed: false`) garantizando exclusividad.
2. Admin activa Multi-equipos → selector **"¿Cuántos equipos?"** con opciones válidas (3 / 4) según convocatoria.
3. Admin presiona **"Balancear en N equipos"** → `balanceIntoTeams()` genera N equipos parejos con colores distintos → preview con tabla de calidad.
4. Admin puede **ajustar manualmente** (drag & drop de jugadores entre equipos) → la calidad se recalcula en vivo.
5. Admin presiona **"Confirmar equipos"** → `teamsConfirmed = true` → se generan los `C(N,2)` fixtures en estado "pendiente" → push a jugadores ("¡Equipos listos!").
6. **Día del partido**: admin registra el marcador de cada fixture conforme se juegan. La tabla de posiciones se actualiza en vivo con corona sobre el líder provisional.
7. Cuando **todos los fixtures tienen marcador** → botón **"Cerrar partido"** se habilita.
8. Admin cierra → `processMultiTeamStats` calcula el resultado de cada jugador (balance neto de su equipo), actualiza stats, dispara XP vía CF, abre ventana de MVP.

### Flujo del jugador

1. Ve sus equipos y la tabla de posiciones (solo lectura).
2. Al cerrar: ve "Tu equipo: **2G 1E 0P → Victoria**", su XP ganado y el card de review/MVP.

### Estados de UI

| Estado | Qué muestra |
|--------|-------------|
| Cargando | `MatchTeamsSkeleton` (extender el skeleton existente a N columnas). |
| Vacío (sin balancear) | Empty state con CTA "Balancear en N equipos" + explicación del round-robin. |
| Balanceado, sin confirmar | Preview de equipos + tabla de calidad + botones "Regenerar" / "Confirmar". |
| Confirmado, fixtures pendientes | Grid de equipos + lista de fixtures con inputs de marcador + tabla provisional. |
| Guardando fixture | Badge ámbar "Guardando…" en el fixture puntual. |
| Listo para cerrar | Tabla final + botón "Cerrar partido" habilitado. |
| Error | Toast con `handleError()` ([lib/utils/error.tsx](../lib/utils/error.tsx)) + detalle copiable. |
| Cerrado | Tabla final con campeón coronado + resultado personal del jugador. |

### Consideraciones mobile-first

- Los inputs de marcador usan **`text-base` (≥16px)** para no disparar zoom en iOS (regla #9 de CLAUDE.md).
- La grilla de equipos: **1 columna** en móvil (scroll vertical), **2 columnas** en `md+`.
- La tabla de posiciones scrollea horizontalmente dentro de su contenedor (`overflow-x-auto`) si N=4 con todas las columnas.
- Todo el contenido con `pb-24 md:pb-0` (bottom nav).
- Touch targets de los steppers de marcador ≥ 44px.

---

## 7. UI DESIGN — COMPONENTES Y ANIMACIONES

### Componentes nuevos

- `MultiTeamGrid` → grilla responsive de N equipos. Props: `teams: MultiTeam[]`, `editable: boolean`, `onMovePlayer`.

**Balanceo manual (drag & drop) — se reutiliza el sistema actual:**
- La infraestructura `@dnd-kit/core` de [TeamsTab.tsx:305](../app/match/[id]/components/TeamsTab.tsx#L305) (`DndContext` + columnas droppables) **soporta N columnas de forma nativa** — no cambia. Misma UX: mantener presionado y arrastrar entre equipos, con recálculo de calidad en vivo y auto-guardado debounced.
- ⚠️ **Único cambio necesario**: el handler `handleDragEnd` ([page.tsx:331](../app/match/[id]/page.tsx#L331)) hoy está cableado a 2 equipos (mueve el jugador "al otro equipo", ignorando `over`). Debe generalizarse a leer el **equipo destino** vía `over.id` y mover el jugador al `TeamId` correspondiente. La calidad usa una versión N-equipo de `getBalanceQuality`.
- `TeamCard` (generalización de la tarjeta de equipo actual) → Props: `team: MultiTeam`, `color: TeamColor`, `summary: TeamSummary`.
- `FixtureList` → lista de enfrentamientos. Props: `fixtures: Fixture[]`, `teams`, `onSaveScore`, `readOnly`.
- `FixtureRow` → un enfrentamiento con dos steppers de marcador y estado. Props: `fixture`, `home`, `away`, `onSave`.
- `StandingsTable` → tabla de posiciones. Props: `standings: TeamStanding[]`, `final: boolean`.
- `TeamCountSelector` → selector de N (3/4) con opciones deshabilitadas según convocatoria.

### Animaciones (Framer Motion)

- `AnimatePresence` al **cambiar de modo** (2 ↔ N): fade + slide de la grilla (`duration: 0.25`, `ease: easeInOut`).
- **Reordenamiento de la tabla** al ingresar un marcador: `layout` animation en las filas de `StandingsTable` (las filas se reacomodan suave, `layout` + `transition: { type: "spring", stiffness: 300, damping: 30 }`).
- **Corona del líder**: al cambiar de líder, la 👑 hace un pequeño `scale` pop (`0 → 1.2 → 1`, `duration: 0.4`).
- **Guardado de fixture**: el badge "Guardando…" → "✓" con fade rápido (`0.2s`).
- Drag & drop de jugadores entre equipos: reutilizar el patrón de reordenamiento existente en la tab Equipos.

### Responsive

- Mobile: grilla 1 col; fixtures en tarjetas apiladas; tabla con scroll horizontal.
- Desktop (`md+`): grilla 2 cols (N=3 → 2+1, N=4 → 2+2); fixtures en 2 columnas; tabla completa sin scroll.

---

## 8. ANALYTICS

Convención `snake_case`, siempre con `match_id` (regla #10 de CLAUDE.md).

| Evento | Trigger | Propiedades |
|--------|---------|-------------|
| `multi_team_enabled` | Admin activa el modo multi | `match_id`, `confirmed_count` |
| `multi_teams_balanced` | Se generan N equipos | `match_id`, `num_teams`, `players_count`, `quality_cost` |
| `multi_teams_confirmed` | Admin confirma equipos y se crean fixtures | `match_id`, `num_teams`, `num_fixtures` |
| `fixture_score_saved` | Se guarda el marcador de un fixture | `match_id`, `fixture_id`, `is_first_edit` |
| `multi_team_match_closed` | Cierre con stats procesadas | `match_id`, `num_teams`, `champion_team_id` |

`teams_balanced` (P2 existente) se sigue emitiendo en modo clásico; en multi se usa `multi_teams_balanced` para diferenciar.

---

## 9. ARQUITECTURA TÉCNICA

### Modelo de datos

```typescript
// lib/domain/multiTeam.ts (NUEVO)

export type TeamId = string; // "T1" | "T2" | "T3" | "T4"

export interface MultiTeam {
  id: TeamId;
  name: string;              // "Equipo 1" (editable)
  color: TeamColor;          // de TEAM_COLOR_CONFIG
  players: Player[];         // incluir photoURL + primaryPosition (regla #2 CLAUDE.md)
}

export interface Fixture {
  id: string;                // determinístico: `${homeId}_${awayId}`
  home: TeamId;
  away: TeamId;
  scoreHome: number | null;  // null = no jugado
  scoreAway: number | null;
  playedAt?: string;         // ISO, al registrar marcador
}

export interface MultiTeamTournament {
  format: "round_robin";
  numTeams: number;
  teams: MultiTeam[];
  fixtures: Fixture[];
  confirmed: boolean;
  confirmedAt?: string;
  createdAt: string;
}

// Tabla de posiciones — CALCULADA, no persistida
export interface TeamStanding {
  teamId: TeamId;
  played: number;  // PJ
  won: number;     // G
  drawn: number;   // E
  lost: number;    // P
  goalsFor: number;      // GF
  goalsAgainst: number;  // GC
  goalDiff: number;      // DIF
  points: number;        // PTS
  position: number;      // 1..N (tras ordenar)
}

// Resultado por jugador para stats/XP
export type PlayerSessionResult = "win" | "draw" | "loss";
```

Extensión de `Match` ([lib/domain/match.ts:35](../lib/domain/match.ts#L35)):

```typescript
interface Match {
  // ...campos existentes...
  teams?: { A: Player[]; B: Player[] };  // modo clásico (sin cambios)
  score?: { A: number; B: number };       // modo clásico (sin cambios)
  multiTeam?: MultiTeamTournament;        // NUEVO — modo multi
  previousMultiTeam?: MultiTeamTournament; // NUEVO — para reversión en re-cierre
  matchMode?: "classic" | "multi";        // NUEVO — derivable, pero explícito para queries/UI
}
```

> **Backward compatibility**: `multiTeam` es opcional. Todo el código que lee `teams.A/B` sigue intacto. Un partido es clásico (usa `teams`/`score`) **o** multi (usa `multiTeam`), nunca ambos.

### Capa de dominio (`lib/domain/`)

**`lib/domain/multiTeam.ts` (nuevo):**
- `balanceIntoTeams(players: Player[], numTeams: number, options?): MultiBalanceResult` — generaliza `balanceTeams` a N equipos (snake-draft en N cubetas + mejora local por swaps entre pares de equipos; reparte 1 GK/equipo). Reutiliza la función de costo conceptual de [team.ts](../lib/domain/team.ts).
- `generateFixtures(teams: MultiTeam[]): Fixture[]` — genera las `C(N,2)` combinaciones.
- `computeStandings(teams, fixtures): TeamStanding[]` — pura; tolera fixtures incompletos.
- `getChampion(standings, allFixturesPlayed): TeamId | null`.
- `getTeamNetResult(teamId, fixtures): PlayerSessionResult` — `W>L→win, W==L→draw, W<L→loss`.
- `maxTeamsFor(confirmedCount): number` y `canUseMultiTeam(confirmedCount): boolean`.
- Validaciones (`validateNumTeams`, `validateFixtureScore`) con errores tipados de [lib/domain/errors.ts](../lib/domain/errors.ts).

**`lib/domain/team.ts`**: sin cambios (el algoritmo 2-equipos queda como está). Opcionalmente `balanceTeams` puede delegar a `balanceIntoTeams(players, 2)` en una fase 2, pero **no en este SDD** (evitar riesgo sobre lógica testeada).

### Capa de API (`lib/`)

**`lib/matches.ts` (extender):**
- `saveMultiTeams(matchId, tournament)` — `runTransaction`, valida `status`/conteo.
- `confirmMultiTeams(matchId)` — genera fixtures + `teamsConfirmed`.
- `saveFixtureScore(matchId, fixtureId, scoreHome, scoreAway)` — `runTransaction`, muta 1 fixture.
- `assignToSmallestMultiTeam(tournament, player)` — para joins tardíos (análogo a `assignToSmallestTeam` en [lib/matches.ts:65](../lib/matches.ts#L65)).

**`lib/playerStats.ts` (extender):**
- `updateMultiTeamStats(match, resultByUid, previousResultByUid?)` — `writeBatch` atómico. Deriva el `PlayerSessionResult` de cada jugador vía `getTeamNetResult` y aplica los mismos increments que `updatePlayerStats` (played/won/draw/lost, weeklyStreak, commitmentStreak). Reversión en re-cierre usando `previousMultiTeam`.

### Cloud Functions (`functions/src/xp.ts`)

`awardXpOnMatchStatsProcessed` se extiende: si `after.multiTeam` existe, en vez de leer `score.A/B` y `teams.A/B`:
1. Construye `teamOfUid` recorriendo `multiTeam.teams[].players`.
2. Calcula `getTeamNetResult` por equipo (misma lógica duplicada server-side, como manda la convención de [xp.ts:21-24](../functions/src/xp.ts#L21-L24)).
3. Otorga eventos `match_played` (1×), `match_won`/`match_drawn` según el resultado neto, `match_punctual`/`match_late`/`match_no_show` por attendance. **Idéntica economía que el modo clásico** — un jugador de un equipo ganador recibe el mismo `+10` que en 2 equipos.
4. Marca `xpAwarded = true` (idempotencia intacta).

### Componentes UI (`app/`)

- `app/match/[id]/components/TeamsTab.tsx` (o equivalente) → orquesta modo clásico vs multi.
- `app/match/[id]/page.tsx` → el handler de cierre bifurca: `matchMode === "multi"` → `updateMultiTeamStats`; si no, el flujo actual.
- `app/join/[id]/page.tsx` → vista cerrada: mostrar N equipos + tabla + resultado personal (con el patrón de fallback `photoURL`/`primaryPosition` de regla #3 CLAUDE.md).
- MVP ([componente de votación]) → candidatos = union de `multiTeam.teams[].players`.
- Post-match review: `wasUserInMatch` en [lib/domain/matchReview.ts:204](../lib/domain/matchReview.ts#L204) se extiende para chequear `multiTeam.teams[].players` además de `teams.A/B`.

---

## 10. CRITERIOS DE ACEPTACIÓN

- [ ] Con ≥ 15 confirmados aparece el toggle multi-equipo; por debajo está deshabilitado con tooltip.
- [ ] `balanceIntoTeams` reparte N equipos con diferencia máx. 1 jugador y 1 GK/equipo cuando hay ≥ N arqueros.
- [ ] Se generan exactamente `C(N,2)` fixtures (N=3→3, N=4→6).
- [ ] La tabla de posiciones ordena por PTS → DIF → GF → orden, y tolera fixtures incompletos (provisional).
- [ ] El campeón solo se declara cuando todos los fixtures tienen marcador.
- [ ] El resultado de cada jugador se deriva del balance neto de su equipo (`W>L→win`, etc.).
- [ ] Stats de perfil (played/won/draw/lost) incrementan **1 por sesión** (no por fixture) → win-rate y achievements coherentes.
- [ ] XP otorgado es idéntico en economía al modo clásico (played +25, victoria +10, etc.), idempotente por `xpAwarded`.
- [ ] `saveFixtureScore` con dos admins concurrentes no pierde marcadores (transacción).
- [ ] Re-cierre con marcadores editados revierte y re-aplica stats sin duplicar (via `previousMultiTeam`).
- [ ] Partidos clásicos existentes siguen funcionando sin cambios (backward compat).
- [ ] MVP, kudos y post-match review funcionan con jugadores de todos los equipos.
- [ ] Inputs de marcador con `text-base` (sin zoom iOS); grilla responsive 1/2 columnas.

---

## 11. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---------|--------|
| `lib/domain/multiTeam.ts` | **NUEVO** — tipos, balanceo N-equipos, fixtures, standings, resultado neto, validaciones. |
| `lib/domain/multiTeam.test.ts` | **NUEVO** — tests de balanceo, standings, desempates, resultado neto. |
| `lib/domain/match.ts` | Extender `Match` con `multiTeam`, `previousMultiTeam`, `matchMode`. |
| `lib/domain/matchReview.ts` | `wasUserInMatch` chequea también `multiTeam.teams[].players`. |
| `lib/matches.ts` | `saveMultiTeams`, `confirmMultiTeams`, `saveFixtureScore`, `assignToSmallestMultiTeam`. |
| `lib/playerStats.ts` | `updateMultiTeamStats` (resultado neto por jugador + reversión). |
| `functions/src/xp.ts` | `awardXpOnMatchStatsProcessed` maneja el path `multiTeam` (lógica de resultado neto duplicada server-side). |
| `app/new-match/page.tsx` | Relajar la validación de `maxPlayers` par ([línea ~102](../app/new-match/page.tsx#L102)) para permitir partidos grandes (15/20). Sin flag de modo multi en la creación. |
| `app/match/[id]/page.tsx` | Bifurcar cierre según `matchMode`. |
| `app/match/[id]/components/*` | `MultiTeamGrid`, `FixtureList`, `StandingsTable`, `TeamCountSelector`, `TeamCard`. |
| `app/join/[id]/page.tsx` | Vista cerrada multi-equipo (N equipos + tabla + resultado personal). |
| `components/skeletons/*` | Extender skeleton de equipos a N columnas. |
| `firestore.rules` | Endurecer `update` para proteger campos de resultado (ver §4). |
| `lib/analytics.ts` (o equivalente) | Nuevos eventos `multi_team_*`, `fixture_score_saved`. |

---

## ✅ Decisiones de Diseño (APROBADAS)

Decisiones cerradas con el usuario antes de implementar:

1. **Stats de perfil = 1 por sesión, no por fixture.** ✅ El resultado (victoria/empate/derrota) se deriva del **balance neto** de los fixtures del equipo, pero se registra como **una sola** clasificación por partido. Mantiene coherentes el win-rate, los achievements (`matches_10`, `wins_25`…), las rachas y el Commitment Score.

2. **XP idéntico al modo clásico.** ✅ Un jugador de un equipo con balance ganador recibe el mismo `+10` de victoria que hoy, **no** `+10 × fixtures ganados`. Economía de XP estable, sin micro-bonus por fixture.

3. **Modo multi mutuamente excluyente, en campo nuevo `multiTeam`.** ✅ (Camino A) No reemplaza `teams.A/B`. Preserva 100% la compatibilidad con partidos y código existentes; se evita la migración destructiva de los 20 archivos que leen `teams.A/B` y de los partidos ya guardados.

4. **Umbral y número de equipos.** ✅ Mínimo **15 confirmados** para habilitar multi, `N ∈ {3,4}`, **5 jugadores/equipo** (`MIN_PLAYERS_PER_TEAM = 5`). 15 → 3 equipos; 20+ → hasta 4.

6. **Configuración post-creación (Opción A).** ✅ El modo multi se decide **después de crear el partido**, en la tab Equipos, cuando hay ≥15 confirmados. **No hay flag "multi-equipo" en el formulario de creación** — cero fricción, máxima flexibilidad (el mismo partido puede resolverse como 2 o N equipos según quién llegue). Único ajuste en la creación: relajar la validación de `maxPlayers` par.

5. **Firestore Rules: sin cambios (opción más simple).** ✅ `multiTeam`/`fixtures` heredan el mismo comportamiento permisivo que `teams`/`score` hoy. No se mueven joins a Cloud Functions. Riesgo residual idéntico al actual con `score`, aceptado. Endurecimiento queda como mejora futura fuera de alcance.

---

**Próximo paso**: SDD aprobado. Implementación en este orden:
1. **Dominio** — `lib/domain/multiTeam.ts` + `multiTeam.test.ts` (balanceo N-equipos, fixtures, standings, resultado neto, validaciones).
2. **API** — `lib/matches.ts` (`saveMultiTeams`, `confirmMultiTeams`, `saveFixtureScore`, `assignToSmallestMultiTeam`) + `lib/playerStats.ts` (`updateMultiTeamStats`).
3. **Cloud Function** — extender `awardXpOnMatchStatsProcessed` para el path multi.
4. **UI** — `MultiTeamGrid`, `FixtureList`, `StandingsTable`, `TeamCountSelector` + cierre en `page.tsx` + vista cerrada en `join/[id]`.
5. **Analytics** — eventos `multi_team_*`.
