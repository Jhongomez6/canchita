# Feature: Sistema de Experiencia (XP) y Niveles de Jugador

## 📋 Specification-Driven Development (SDD)

Sistema de **gamificación por progresión** que premia la **participación constante** del jugador con experiencia (XP) y niveles. Diseñado para motivar la frecuencia de juego, el compromiso y la actitud deportiva — no para premiar solo a los más talentosos.

---

## 0. CONTEXTO Y DIFERENCIACIÓN

Canchita ya tiene varios sistemas de "señales del jugador". Este SDD agrega una **capa de progresión perpetua** que vive en paralelo a los anteriores. Es importante no confundirlos:

| Sistema | Qué mide | Naturaleza | UI |
|---|---|---|---|
| **`level` (skill)** (1-4: Básico/Intermedio/Avanzado/Elite) | Nivel de habilidad técnica para balance de equipos | Estático, lo asigna el onboarding y la re-evaluación admin | Carta FIFA, icono de nivel |
| **`stats` (PJ/PG/PE/PP)** | Histórico de partidos jugados/ganados/empatados/perdidos | Contadores brutos | StatsCard, FIFA card |
| **Rachas** (`weeklyStreak`, `commitmentStreak`, etc.) | Constancia momentánea | Se resetean | QuickStats, drawer |
| **MVP awards** (`mvpAwards`) | Reconocimiento puntual del partido | Contador acumulado | Corona en perfil |
| **Kudos** (`kudosSummary`) | Reconocimiento social tipificado | Contadores por categoría | Badges en drawer |
| **🆕 XP + Nivel** (este SDD) | **Progresión perpetua agregada** que sintetiza todo lo anterior | XP nunca baja por debajo del nivel actual; el nivel solo sube | Barra de progreso, badge de nivel, recompensas, **Overall (1-99) en FIFA Card** |

> **Diferencia clave con `level` de skill**: el `level` de skill puede bajar tras una re-evaluación; el **`xpLevel`** de progresión **nunca baja** — solo avanza. Skill = "qué tan bueno sos jugando ahora". XpLevel = "cuánta historia tenés con Canchita".

> **Integración con FIFA Card**: el `xpLevel` (1-50) **alimenta el OVR (1-99)** que ya está reservado en la FIFA Player Card con valor `?`. Fórmula: `OVR = 49 + xpLevel`. Mapeo 1-1: 50 niveles ↔ 50 valores de Overall (50-99). Cada tier ocupa exactamente 10 puntos de OVR, alineado con la convención FIFA Ultimate Team (Bronze < 65, Silver 65-74, Gold 75+, Special 85+, Icon 90+).

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo
- **Retención**: dar al jugador una **vara visual de su progreso** que crezca con cada partido, no solo con victorias. El sistema actual recompensa al ganador puntual; el XP recompensa al **participante constante**.
- **Motivación**: convertir cada acción dentro de la app (confirmar, llegar a tiempo, calificar, dar kudos) en una **micro-recompensa** que suma a un objetivo de largo plazo.
- **Identidad**: ofrecer un **status público** ("Capitán Nivel 35") que distinga al jugador veterano del nuevo, complementando al nivel de skill.
- **Onboarding reverso**: dar al jugador nuevo un "siguiente paso" claro siempre — "te faltan 30 XP para subir al nivel 4".

### Inspiración (best practices)
- **EA FC / FIFA Ultimate Team**: Niveles de Season Pass con barra de progreso clara y recompensas tangibles por hito.
- **Duolingo**: XP diario, "tu siguiente nivel está a 2 lecciones". Notar: NO copiamos las leagues — fuera de scope V1.
- **Strava**: Achievements por hitos (primer 5K, primer 10K) que conviven con métricas continuas.
- **Pokémon GO / Konami eFootball**: Niveles 1-50 con curva exponencial y tiers nombrados ("Bronze / Silver / Gold / Platinum / Legend").
- **Apple Fitness Activity Rings**: el premio NO es solo el aro cerrado — es la **racha de aros cerrados**.

### Reglas de Negocio

| # | Regla | Impacto UI |
|---|-------|------------|
| 1 | El XP **nunca baja por debajo del umbral del nivel actual**. Si un jugador llega a nivel 12 con 1.000 XP y luego acumula penalizaciones, su XP puede bajar dentro del nivel 12 pero **nunca volver al nivel 11**. | Barra de progreso puede retroceder dentro del nivel, badge de nivel es estable. |
| 2 | El XP **se acumula automáticamente** sin acción del usuario. No hay "reclamar recompensas" — el sistema es transparente. | Toast contextual cuando se gana XP significativo (>=20). |
| 3 | Hay **50 niveles** agrupados en **5 tiers** (10 niveles cada uno): Suplente, Titular, Estrella, Capitán, Leyenda. | Badge muestra `Capitán · Nivel 35`. |
| 4 | El XP se otorga por **acciones positivas** (jugar, ganar, ser puntual, recibir kudos, completar review) y se descuenta por **acciones negativas** (no-show, llegar tarde). | Modal "Subiste de nivel" con confetti al cambiar de nivel. |
| 5 | **Subir de nivel** dispara: (a) notificación in-app, (b) modal celebrativo de un solo dismiss, (c) actualización del badge de nivel en perfil y home. | Modal con confetti + nombre del nuevo nivel. |
| 6 | **Cambiar de tier** (ej: pasar de Titular a Estrella) es un evento especial con notificación push (opt-in) y un modal con animación premium. | Modal premium + push opcional. |
| 7 | El XP es **público** en el drawer ajeno (cualquier user ve el nivel y badge de cualquier otro). El historial detallado por acción es **privado** (solo el dueño lo ve). No hay leaderboard global público en V1 — ranking queda para Fase 2. | Drawer ajeno: solo badge + tier. Perfil propio: historial completo. |
| 8 | Los **achievements** (logros con medalla) son una capa paralela al XP: por hitos discretos (primer MVP, 10 partidos jugados, racha 5 semanas). Cada achievement otorga un **bonus de XP** al desbloquearse. | Sección "Logros" en perfil propio. Notificación al desbloquear. |
| 9 | El sistema es **retroactivo**: al desplegar la feature, una migración calcula el XP histórico de cada jugador desde sus `stats` actuales y le asigna el nivel correspondiente. Nadie arranca de cero. | Modal de bienvenida una sola vez: "Calculamos tu XP histórico — sos Estrella nivel 23". |
| 10 | El XP por una misma acción es **idempotente por contexto** (misma fuente + mismo contexto no duplica). Ej: jugar el partido X solo otorga +25 una vez aunque el doc se actualice múltiples veces. | Sin riesgo de farming por race conditions. |
| 11 | El **Overall (OVR)** que se muestra en la FIFA Player Card se deriva del `xpLevel` con la fórmula `OVR = 49 + xpLevel` (rango 50-99). Si el user aún no tiene `xpLevel` (pre-backfill o user recién creado), muestra `?` como hoy. | La FIFA Card muestra `87` en grande en el header en lugar de `?`. El OVR sube al subir de nivel — mismo evento celebrativo. |
| 12 | La **rarity visual** de la FIFA Card cambia según el tier: **Bronce** (Suplente) → **Plata** (Titular) → **Dorado** (Estrella) → **Verde Canchita** (Capitán, la card actual) → **Cosmic** (Leyenda). 5 variantes visuales. | Cada level-up dentro del mismo tier mantiene la rarity. Cambio de tier desbloquea la rarity nueva — momento celebrativo premium. |
| 13 | La **card verde actual** se preserva tal cual y se reasocia al tier **Capitán** (4to). Los users que hoy ven card verde y tras el backfill no alcancen Capitán verán **otra rarity** (Bronce/Plata/Dorado). Se mitiga con modal de bienvenida que explica la mecánica y proyecta "te falta X para volver a verde". | Modal one-shot post-backfill explica el cambio. |
| 14 | **Modal explicativo de onboarding del sistema XP**: la primera vez que un usuario abre la app después del despliegue de la feature, se muestra un modal educativo que explica (a) qué es el XP, (b) los 5 tiers con su rarity de card, (c) cómo se gana XP, (d) su posición actual. **Se muestra exactamente una vez** y se puede reabrir manualmente desde `/profile`. Persistencia con campo `xpOnboardingSeenAt` en `UserProfile`. | Modal blocking al primer load. Cierre lo persiste. Reabrible desde botón "¿Cómo funciona?" en perfil. |

### Convivencia con sistemas existentes
- **Skill `level`** sigue siendo el único campo usado para balance de equipos. El `xpLevel` **no se usa para balance** — es solo gamification.
- **`stats`** sigue existiendo como counters de partidos. El XP **lee de `stats`** para algunos cálculos pero no la reemplaza.
- **Rachas** siguen visibles en sus lugares actuales (QuickStats, drawer). Algunas rachas otorgan bonus de XP al mantenerse — pero las rachas siguen funcionando aunque XP se rompa.
- **MVP awards** siguen contándose por separado. Ser MVP otorga +50 XP además de incrementar `mvpAwards`.
- **FIFA Player Card** ([docs/FIFA_PLAYER_CARD_SDD.md](FIFA_PLAYER_CARD_SDD.md)) hoy muestra `?` en el OVR y es **verde emerald para todos**. Este SDD: (a) reemplaza `?` por `49 + xpLevel`, y (b) introduce **5 rarities visuales** según el tier (Bronce/Plata/Dorado/Verde/Cosmic). La card verde actual se reasocia al tier Capitán.

---

## 2. ESCALABILIDAD

### Volumen esperado
- ~14 jugadores × 1 partido cerrado = **~14 actualizaciones de XP** por partido cerrado.
- A 1.000 partidos/mes: **~14.000 actualizaciones de XP/mes** + eventos puntuales (kudos, reviews).
- Cada actualización = **1 transaction al doc del usuario** (que ya se actualiza al cerrar el partido para `stats`, `streaks`). **No se agrega ningún read extra** — el XP se calcula y se setea en la misma transacción donde ya se actualizan las stats.

### Estructura de datos
**Sin colección nueva.** Todo se denormaliza en `users/{uid}`:

```typescript
interface UserProfile {
  // ...
  xp?: number;                    // XP total acumulado, nunca baja del threshold del nivel actual
  xpLevel?: number;               // Nivel actual (1-50), derivable de xp pero cacheado
  xpTier?: XpTier;                // Tier actual ("suplente" | ... | "leyenda"), cacheado
  xpLastEvent?: string;           // ISO del último evento de XP (para "te quedaste sin actividad")
  xpOnboardingSeenAt?: string;    // ISO de cuándo el user vio el modal explicativo del sistema XP. Si está vacío, se muestra al primer load post-despliegue.
  achievements?: Record<AchievementId, AchievementUnlock>; // Logros desbloqueados
}

interface AchievementUnlock {
  unlockedAt: string;             // ISO
  xpBonus: number;                // XP otorgado al desbloquear
}
```

### Colección opcional: `xpEvents` (auditoría / historial)
Para que el jugador pueda ver "de dónde vino mi XP" y para debugging:

```typescript
// xpEvents/{uid}_{eventKey}  — idempotente por par (uid, eventKey)
interface XpEvent {
  id: string;                     // "{uid}_{source}_{contextId}"
  uid: string;
  source: XpSource;               // "match_played" | "mvp" | "kudo_received" | ...
  contextId: string;              // matchId, kudoId, achievementId, etc.
  amount: number;                 // positivo o negativo
  reason: string;                 // legible: "Jugaste el partido"
  createdAt: string;
}
```

**Política de retención**: mantener `xpEvents` por usuario solo los **últimos 90 días**. Cloud Function scheduled mensual que limpia los más viejos. La fuente de verdad es `users/{uid}.xp`, no el log.

### Índices Firestore requeridos
```
xpEvents:  (uid ASC, createdAt DESC)         — historial del usuario
xpEvents:  (createdAt DESC)                  — cleanup mensual
```

### Paginación
- Historial XP del usuario: `limit(20)` con cursor en `createdAt`.

---

## 3. CONCURRENCIA SEGURA

### Operaciones que requieren transacción

Toda actualización de XP debe ser **atómica** y **idempotente**. El patrón canónico:

```typescript
// Cloud Function: awardXp(uid, source, contextId, amount, reason)
async function awardXp(input: AwardXpInput) {
  const eventId = `${input.uid}_${input.source}_${input.contextId}`;
  const eventRef = db.doc(`xpEvents/${eventId}`);
  const userRef = db.doc(`users/${input.uid}`);

  await db.runTransaction(async (tx) => {
    const eventSnap = await tx.get(eventRef);
    if (eventSnap.exists) return; // idempotente — ya se otorgó

    const userSnap = await tx.get(userRef);
    const userData = userSnap.data() ?? {};

    const currentXp = userData.xp ?? 0;
    const currentLevel = userData.xpLevel ?? 1;
    const levelFloor = xpForLevel(currentLevel); // umbral inferior del nivel actual

    // El XP nunca baja del umbral del nivel actual
    const newXp = Math.max(levelFloor, currentXp + input.amount);
    const newLevel = calcLevelFromXp(newXp);
    const newTier = calcTierFromLevel(newLevel);

    const levelChanged = newLevel !== currentLevel;
    const tierChanged = newTier !== userData.xpTier;

    tx.set(eventRef, {
      uid: input.uid,
      source: input.source,
      contextId: input.contextId,
      amount: input.amount,
      reason: input.reason,
      createdAt: new Date().toISOString(),
    });

    tx.update(userRef, {
      xp: newXp,
      xpLevel: newLevel,
      xpTier: newTier,
      xpLastEvent: new Date().toISOString(),
    });

    // Side effects: notif + analytics — fuera de la transacción, post-commit
    if (levelChanged) scheduleLevelUpNotif(input.uid, currentLevel, newLevel, tierChanged);
  });
}
```

### Race conditions identificadas

| Escenario | Mitigación |
|---|---|
| Dos triggers (kudo + post-match review) escriben XP al mismo user simultáneamente. | Cada uno crea un `xpEvent` distinto. La transacción serializa los reads/writes sobre `users/{uid}`. ✅ |
| Cloud Function se ejecuta dos veces (Firebase retry). | `xpEvents/{uid}_{source}_{contextId}` es idempotente por doc id determinístico. El segundo run lee el evento existente y aborta. ✅ |
| Backfill histórico corre mientras se cierra un partido en vivo. | El backfill usa `source = "backfill_v1"` con `contextId = "history"`. No colisiona con eventos en vivo (`source = "match_played"` con `contextId = matchId`). ✅ |
| Migración inicial corre dos veces. | Idempotente por mismo motivo: doc id `{uid}_backfill_v1_history` único. ✅ |
| User cierra partido → re-abre → re-cierra. | La función que dispara `match_played` valida en el doc del match un flag `xpAwarded.{uid}: true` antes de awardar. Si ya se otorgó, no se vuelve a dar. ✅ |

### Atomicidad multi-XP por partido
Cuando se cierra un partido, **un solo trigger** (`onMatchClose`) itera los jugadores y dispara `awardXp` para cada uno con todas las acciones del partido (jugar, ganar/empatar/perder, puntualidad, MVP). Cada llamada es su propia transacción. Si falla a la mitad de la iteración, los XP entregados antes del fallo persisten — el retry de Firebase reintentará desde el principio, pero la idempotencia garantiza que nadie reciba doble XP.

---

## 4. SEGURIDAD

### Autenticación y autorización

| Recurso | Lectura | Escritura |
|---|---|---|
| `users/{uid}.xp` | **Pública** (cualquier autenticado) — alimenta drawer y leaderboard | **Solo Cloud Functions** (admin SDK). Cliente denegado. |
| `users/{uid}.xpLevel` | Pública | Solo Cloud Functions. |
| `users/{uid}.xpTier` | Pública | Solo Cloud Functions. |
| `users/{uid}.achievements` | Pública | Solo Cloud Functions. |
| `xpEvents/{eventId}` | **Solo el dueño** + admin | Solo Cloud Functions. |

### Firestore Rules (a agregar)

```js
// Proteger campos de XP en users/{uid} — agregar a la regla update existente
match /users/{userId} {
  allow update: if request.auth.uid == userId
    && (!request.resource.data.diff(resource.data).affectedKeys()
        .hasAny(['xp', 'xpLevel', 'xpTier', 'achievements', 'kudosSummary', '_reportsSummary']));
}

// xpEvents: solo lectura del dueño, escritura denegada al cliente
match /xpEvents/{eventId} {
  allow read: if request.auth != null
    && (request.auth.uid == resource.data.uid || isAdmin());
  allow write: if false; // solo Cloud Functions
}
```

### Validaciones de input
Toda la lógica de cálculo de XP vive en **Cloud Functions** que reciben triggers internos (no callable desde cliente). No hay endpoints públicos para "darme XP". Esto cierra completamente la superficie de ataque.

### Datos sensibles
- `xpEvents` puede incluir `contextId` con `matchId`, `kudoId`, etc. No incluir información sensible adicional.
- El leaderboard público muestra `name`, `photoURL`, `xpLevel`, `xpTier` — todo ya público.

---

## 5. TOLERANCIA A FALLOS

### Estados de error y fallbacks

| Error | Causa probable | Fallback |
|---|---|---|
| Cloud Function `awardXp` falla por timeout | Latencia Firestore | Firebase reintenta. Idempotencia garantiza no duplicar. Si falla 3×: log en `xpFailures` para revisión manual. |
| `users/{uid}` no existe (user borrado) | Soft-delete entre cierre y trigger | Skip silencioso. Log warning. No se otorga XP a usuarios borrados. |
| `xpEvents` collection bloqueada por billing | Cuota agotada | XP del user se actualiza igual (es el campo crítico). El evento queda perdido pero la fuente de verdad (`users.xp`) está intacta. |
| Migración inicial deja a algún user sin XP | Bug del script de backfill | Cloud Function manual `recalculateXp(uid)` que recorre `stats` + `mvpAwards` + `kudosSummary` y recalcula desde cero. |
| Backfill calcula valores distintos a "verdad" | Datos históricos incompletos | Aceptado: el backfill es **best-effort**. Cualquier desviación se compensa con la actividad futura. |
| Notif de level-up llega después del cambio | Lag de la function | Aceptado. El badge ya se actualizó visualmente en el siguiente refresh del perfil. |

### Retry strategy
- Trigger `onMatchClose`: max 3 retries automáticos (default Firebase).
- Notif de level-up: 1 retry con backoff 5s. Si falla, se omite — no es crítica.
- Backfill: script idempotente, se puede correr múltiples veces.

### Degradación elegante
- Si `xp` no existe en el doc del usuario (user creado antes del despliegue, sin backfill aún): UI muestra "Sin XP aún — jugá tu primer partido" en lugar de romper.
- Si `achievements` no existe: la sección "Logros" muestra el catálogo completo en estado "bloqueado", sin error.
- Si el leaderboard falla: card de home se oculta silenciosamente.

---

## 6. UX — FLUJOS DE USUARIO

### Flujo principal: ganar XP por jugar
1. Admin cierra partido → trigger `onMatchClose` se dispara.
2. La function itera jugadores con `uid` y dispara `awardXp` por cada acción aplicable.
3. Para cada jugador, llega una **notificación in-app agregada**: *"⚽ Ganaste 60 XP por el partido. Vas por 480/600 al Nivel 12."*
4. Cuando el user abre la app, el badge de nivel y la barra de progreso reflejan el nuevo valor.
5. Si cambió de nivel: al abrir la app, aparece un **modal celebrativo de un solo dismiss** con confetti + nombre del nuevo nivel.
6. Si cambió de tier: la celebración es **premium** (animación full-screen 2s + push si está habilitado).

### Flujo: ganar XP por acciones puntuales
- **Confirmar asistencia con +24h**: toast pequeño *"+5 XP"* abajo a la derecha.
- **Recibir un kudo**: ya hay notif "Te dieron un kudo" — se extiende con *"+5 XP"*.
- **Completar post-match review**: toast al enviar *"+10 XP por tu review"*.
- **Llegar puntual** (calculado al cerrar el partido): incluido en el agregado del partido.
- **Desbloquear un achievement**: notif dedicada + modal pequeño con icono del logro + XP otorgado.

### Flujo: penalización por no-show / late
- **No-show**: al cerrar el partido, el agregado del partido refleja `-50 XP` con razón visible en el historial.
- **Late arrival**: `-10 XP` incluido en el agregado.
- **Sin notif celebrativa** para penalizaciones — se reflejan silenciosamente en la barra de progreso (que puede retroceder dentro del nivel, pero nunca bajar de tier).

### Estados de UI

| Estado | Qué muestra |
|---|---|
| Sin XP aún (user nuevo post-despliegue) | Badge "Suplente Nivel 1" + barra 0/100 + tooltip "Jugá tu primer partido y ganá +25 XP". |
| Con XP, dentro de un nivel | Badge "Titular Nivel 14" + barra `350/500 XP` + texto "150 XP para subir". |
| Justo al subir de nivel | Modal celebrativo + confetti + sonido sutil opcional. |
| Cambio de tier | Modal premium full-screen 2s + push opcional. |
| Achievement desbloqueado | Modal pequeño con medalla + XP bonus + CTA "Ver mis logros". |
| Penalización aplicada | Sin modal. Barra retrocede silenciosamente. Visible en historial detallado. |
| Migración inicial al desplegar | Modal una sola vez: "Calculamos tu historia: sos Estrella Nivel 23 con 8.450 XP" + barra animada from-zero-to-current. Si la rarity de la card cambia, el modal incluye un mini-preview lado a lado: "Tu card ahora es **Dorada**". |

### Consideraciones mobile-first
- Badge de nivel **siempre visible** en el header del perfil propio y en el drawer ajeno (clave para el "ahá" social).
- Modales de level-up usan `AnimatePresence` con backdrop blur — no bloquean navegación más de 3s, dismissable con tap fuera.
- Confetti usando `canvas-confetti` (lib liviana ~6kb gzipped) — disparo único de 1.5s.
- Toasts de XP usan el sistema `react-hot-toast` existente con icon `Zap` ámbar.
- Sonidos: **opt-in** vía setting (default off). Si se habilita, "level up chime" suave de 800ms.

---

## 7. UI DESIGN — COMPONENTES Y ANIMACIONES

### Componentes nuevos

| Componente | Ruta | Propósito |
|---|---|---|
| `XpProgressBar` | `components/xp/XpProgressBar.tsx` | Barra horizontal con XP actual / threshold del siguiente nivel. Animación fluida. |
| `XpBadge` | `components/xp/XpBadge.tsx` | Pill compacta con icon del tier + número de nivel. Reusable en drawer, home, profile. |
| `XpTierIcon` | `components/xp/XpTierIcon.tsx` | Icon por tier (Suplente=Sprout, Titular=Shirt, Estrella=Star, Capitán=Trophy, Leyenda=Crown). |
| `LevelUpModal` | `components/xp/LevelUpModal.tsx` | Modal celebrativo standard con confetti + nuevo nivel + XP a próximo. |
| `TierUpModal` | `components/xp/TierUpModal.tsx` | Modal premium full-screen para cambio de tier (animación con gradiente + icon grande). |
| `XpHistoryDrawer` | `components/xp/XpHistoryDrawer.tsx` | Bottom sheet con últimos 20 eventos de XP (acción + razón + monto + fecha). |
| `XpStatsSection` | `components/profile/XpStatsSection.tsx` | Bloque en perfil propio: barra grande + badge + CTA "Ver historial". |
| `AchievementsGrid` | `components/profile/AchievementsGrid.tsx` | Grid 3-col con medallas (desbloqueadas en color, bloqueadas en gris). |
| `AchievementCard` | `components/profile/AchievementCard.tsx` | Card individual con icon + nombre + descripción + XP bonus. |
| `AchievementUnlockedModal` | `components/xp/AchievementUnlockedModal.tsx` | Modal pequeño al desbloquear un logro. |
| `XpOnboardingModal` | `components/xp/XpOnboardingModal.tsx` | **Modal educativo one-shot** que explica qué es el XP, los 5 tiers con previews de rarities, cómo se gana XP, y la posición actual del user. Se muestra al primer load post-despliegue. Persiste en `xpOnboardingSeenAt`. Reabrible desde `/profile`. |
| `XpToast` | `lib/utils/xpToast.ts` | Helper que dispara un toast con icon ⚡ ámbar para "+N XP" en eventos pequeños. |

### Componentes a modificar

| Componente | Cambio |
|---|---|
| `components/FifaPlayerCard.tsx` | **Reemplazar `?` por `OVR = 49 + xpLevel`** + agregar prop `tier?: XpTier` que cambia 4 variables visuales (gradiente del marco, color del shimmer, color del patrón de diamantes, glow detrás de foto). Default `tier="capitan"` para conservar el verde actual como fallback. |
| `PlayerCardDrawer.tsx` | Agregar `XpBadge` debajo del FIFA card, junto a kudos/rachas. |
| `app/profile/page.tsx` | Agregar `XpStatsSection` cerca del top (entre header y FIFA card) + `AchievementsGrid` antes de stats. |
| `app/page.tsx` (home) | (Opcional) Card con `XpProgressBar` mini para usuarios con `played >= 3`. |
| `BottomNav.tsx` | (Opcional fase 2) Indicador rojo si hay achievement nuevo no visto. |
| `components/NotificationsDrawer.tsx` | Renderizar tipos nuevos: `xp_level_up`, `xp_tier_up`, `xp_achievement`. |

### Animaciones (Framer Motion)
- **Barra de progreso**: al actualizar, transición spring `stiffness: 100, damping: 20` desde valor previo hacia nuevo (300-600ms).
- **LevelUpModal**: entrada `scale: 0.8 → 1` + `opacity: 0 → 1`, spring. Confetti dispara al montar.
- **TierUpModal**: entrada `y: 100 → 0` + backdrop gradient animado. Auto-dismiss a 2.5s + dismissable manual. **Incluye preview lado a lado de la card vieja → card nueva** con transición animada (la card vieja hace fade out + la nueva entra desde abajo con scale up).
- **XpBadge**: si cambió de nivel en la última sesión, leve pulse + glow ámbar las primeras 5 visualizaciones.
- **AchievementCard**: al desbloquear, flip 3D rápido del estado gris → color.
- **FIFA Card Cosmic (Leyenda)**: gradiente del marco animado en loop infinito (purple→pink→amber→purple, 4s), shimmer multicolor cada 3s, glow pulsante atrás de la foto.
- **XpOnboardingModal**: entrada `scale 0.95 → 1` + backdrop blur fade. Los 5 mini-cards de los tiers entran con stagger 80ms (de Bronce a Cosmic). El mini-card del tier actual del user pulsa sutilmente al montar.

### Layout de `XpOnboardingModal`

Modal blocking single-screen scrolleable (max-height `90vh`, dismissable solo con el CTA principal — no tap fuera ni X, para garantizar que el user lea):

```
┌────────────────────────────────────────┐
│           Tu historia en Canchita      │  ← Hero título centrado
│   Cada partido suma a tu progreso      │  ← Subtítulo
│                                        │
│  ┌──────────────────────────────┐      │
│  │  Sos Estrella Nivel 23       │      │  ← Card destacada con tier actual
│  │  OVR 72 · 3.850 XP           │      │
│  │  [mini-FIFA-card Dorada]     │      │
│  └──────────────────────────────┘      │
│                                        │
│  Los 5 tiers                           │  ← Sección
│  ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐               │  ← 5 mini-badges horizontal
│  │🟫│ │⬜│ │🟨│ │🟩│ │🌈│               │
│  │SU│ │TI│ │ES│ │CA│ │LE│               │
│  │50│ │60│ │70│ │80│ │90│               │  ← OVR mínimo de cada tier
│  └──┘ └──┘ └──┘ └──┘ └──┘               │
│                                        │
│  Cómo ganás XP                         │  ← Sección
│  ⚽ Jugar un partido         +25       │
│  🏆 Ganar / empatar         +5-10      │
│  ⭐ Ser MVP                  +50       │
│  👏 Recibir un kudo          +5        │
│  🔥 Mantener racha semanal  +20/sem    │
│  📝 Calificar el partido    +10        │
│                                        │
│  ⏰ Y cuidado:                          │
│  • Llegar tarde: -10                   │
│  • No presentarse: -50                 │
│                                        │
│       [ Entendido, a jugar ⚡ ]         │  ← CTA full-width
└────────────────────────────────────────┘
```

**Reglas del modal**:
- Se muestra **automáticamente al primer load** después del despliegue si `xpOnboardingSeenAt` está vacío.
- **No dismissable por tap fuera ni ESC** — solo con el CTA. Esto garantiza que el user lo lea al menos una vez (siempre puede cerrarlo rápido tocando el CTA).
- Al cerrar: `updateDoc(users/{uid}, { xpOnboardingSeenAt: new Date().toISOString() })`.
- Reabrible manualmente desde un botón **"¿Cómo funciona?"** en `XpStatsSection` del perfil.
- El mini-card del tier actual del user se destaca visualmente (border pulsante, leve scale up).
- Si el user tiene una rarity de card distinta a la verde actual (caso post-backfill), incluye un mini-mensaje: *"Tu card pasó de verde a [Rarity nueva] basado en tu historia."*

### Diseño visual

#### Tiers, badges y rarities de FIFA Card
Jerarquía visual ascendente: bronce → plata → dorado → verde Canchita → cosmic.
El verde (identidad de marca) se preserva como **rarity del penúltimo tier** — se convierte en un premio.

| Tier | Niveles | **Badge XpBadge** (pill compacta) | **FIFA Card Rarity** (carta completa) |
|---|---|---|---|
| **Suplente** | 1-10 | Bronce: `from-amber-700 to-orange-900` · icon `Sprout` | **Bronce**: marco cobre mate · sin shimmer · patrón diamante apagado · glow café tenue |
| **Titular** | 11-20 | Plata: `from-slate-300 to-slate-500` · icon `Shirt` | **Plata**: marco plateado pulido · shimmer plateado · patrón frío · glow gris claro |
| **Estrella** | 21-30 | Dorado: `from-amber-400 to-amber-600` · icon `Star` | **Dorado**: marco oro FIFA UT clásico · shimmer dorado intenso · patrón ámbar · glow ámbar |
| **Capitán** | 31-40 | Verde: `from-emerald-500 to-emerald-700` · icon `Trophy` | **Verde Canchita** ← (card actual): marco verde emerald · shimmer verde · patrón diamante verde · glow verde |
| **Leyenda** | 41-50 | Cosmic: `from-purple-500 via-pink-500 to-amber-400` · icon `Crown` | **Cosmic**: marco con gradiente animado purple→pink→amber · shimmer multicolor · estrellas flotantes en patrón · glow pulsante rosa-purple · borde con animación shimmer continua |

**Implementación de las 5 rarities en `FifaPlayerCard.tsx`**:
- Prop `tier?: XpTier` (default `"capitan"` para preservar comportamiento actual cuando no hay XP)
- 4 variables CSS por rarity: `frameGradient`, `shimmerColor`, `patternFill`, `glowColor`
- Las animaciones (shimmer, motion entrada) se mantienen; solo cambian colores
- Cosmic agrega 1 animación extra (gradiente del marco animado loop)

#### Layout del badge
```
┌─────────────────────────┐
│  🏆  Capitán · Nivel 35 │  ← Pill compacta, icon a la izq.
└─────────────────────────┘
```

#### Layout de XpStatsSection (perfil propio)
```
┌─────────────────────────────────────────────┐
│  🏆 CAPITÁN                        NIVEL 35 │  ← Tier en caps, nivel a la derecha
│                                             │
│  ████████████████░░░░░░░░░░░░░░  3.240/5.000│  ← Barra con XP actual / threshold
│                                             │
│  1.760 XP para el próximo nivel             │  ← Texto descriptivo
│                                             │
│  Ver historial de XP →                      │  ← Link a drawer
└─────────────────────────────────────────────┘
```

### Responsive
- Mobile: full-width con padding lateral 16px.
- Desktop (md+): `max-w-md` centrado.

---

## 8. ANALYTICS

| Evento | Trigger | Properties |
|---|---|---|
| `xp_awarded` | Cada vez que se otorga XP (cualquier monto) | `source`, `amount`, `new_total_xp`, `level` |
| `xp_level_up` | Subió de nivel (cualquier nivel) | `from_level`, `to_level`, `tier` |
| `xp_tier_up` | Subió de tier | `from_tier`, `to_tier`, `level` |
| `xp_achievement_unlocked` | Desbloqueó un logro | `achievement_id`, `xp_bonus` |
| `xp_history_viewed` | Abrió el drawer de historial | — |
| `xp_onboarding_shown` | Modal de onboarding apareció (primer load post-despliegue) | `current_tier`, `current_level` |
| `xp_onboarding_completed` | User tocó el CTA del modal de onboarding | `time_spent_seconds` |
| `xp_onboarding_reopened` | User abrió manualmente el modal desde el perfil | — |
| `xp_modal_dismissed` | Cerró un modal de level-up | `type` (`level` / `tier` / `achievement`), `dismiss_method` |

**Prioridad**: 
- P1 (Activation): `xp_level_up` y `xp_achievement_unlocked` los primeros 3 días post-onboarding.
- P2 (Engagement): `xp_awarded` (alto volumen), `xp_history_viewed`.
- P3 (Retention): `xp_tier_up` (raro pero crítico para retención de veteranos).

---

## 9. ARQUITECTURA TÉCNICA

### Modelo de datos

```typescript
// lib/domain/xp.ts (NUEVO)

export type XpTier = "suplente" | "titular" | "estrella" | "capitan" | "leyenda";

export type XpSource =
  // Partido
  | "match_confirmed"          // confirmó asistencia
  | "match_confirmed_early"    // confirmó >24h antes
  | "match_played"             // asistió al partido
  | "match_won"                // bonus por ganar
  | "match_drawn"              // bonus por empatar
  | "match_punctual"           // llegó a tiempo
  | "match_mvp"                // fue MVP
  | "match_no_show"            // penalización por no-show
  | "match_late"               // penalización por llegar tarde
  // Social
  | "kudo_received"            // recibió un kudo
  | "kudo_given"               // dio un kudo
  | "post_match_review_done"   // completó review
  // Rachas
  | "weekly_streak_milestone"  // mantiene racha semanal (cada semana)
  | "commitment_streak_milestone" // milestone de compromiso (cada 5 partidos puntuales)
  // Achievements
  | "achievement_bonus"        // bonus por desbloquear logro
  // Sistema
  | "backfill_v1";             // migración inicial

export type AchievementId =
  // Partidos jugados
  | "first_match" | "matches_10" | "matches_25" | "matches_50" | "matches_100" | "matches_250"
  // Victorias
  | "first_win" | "wins_10" | "wins_25" | "wins_50"
  // MVP
  | "first_mvp" | "mvp_5" | "mvp_10" | "mvp_25"
  // Rachas
  | "weekly_streak_3" | "weekly_streak_5" | "weekly_streak_10" | "weekly_streak_25"
  | "commitment_streak_10" | "commitment_streak_25" | "commitment_streak_50"
  // Sociales
  | "first_kudo_received" | "kudos_10" | "kudos_25" | "kudos_50" | "kudos_100"
  // Compromiso
  | "perfect_month"            // 4 partidos en un mes sin late ni no-show
  | "early_bird"               // 10 confirmaciones >24h antes
  // Especiales
  | "veteran_year"             // 1 año desde el primer partido
  | "review_master"            // completó 20 reviews
  | "all_tiers";               // alcanzó Leyenda

export interface AchievementDef {
  id: AchievementId;
  label: string;
  description: string;
  icon: LucideIcon | string;   // lucide o emoji
  xpBonus: number;
  tier: "bronze" | "silver" | "gold" | "platinum";
  category: "matches" | "wins" | "mvp" | "streaks" | "social" | "commitment" | "special";
  checkUnlock: (stats: AchievementCheckContext) => boolean;
}

export interface AchievementCheckContext {
  played: number;
  won: number;
  mvpAwards: number;
  kudosTotal: number;
  weeklyStreak: number;
  commitmentStreak: number;
  earlyConfirmCount: number;
  reviewCount: number;
  daysSinceFirstMatch: number;
  perfectMonths: number;
  xpTier: XpTier;
}

export interface AchievementUnlock {
  unlockedAt: string;          // ISO
  xpBonus: number;
}

export interface XpEvent {
  id: string;                  // "{uid}_{source}_{contextId}"
  uid: string;
  source: XpSource;
  contextId: string;
  amount: number;
  reason: string;              // legible en español
  createdAt: string;           // ISO
}

export interface XpAwardInput {
  uid: string;
  source: XpSource;
  contextId: string;
  amount: number;
  reason: string;
}

// Extensión de UserProfile (lib/domain/user.ts)
interface UserProfile {
  // ...
  xp?: number;
  xpLevel?: number;
  xpTier?: XpTier;
  xpLastEvent?: string;
  achievements?: Partial<Record<AchievementId, AchievementUnlock>>;
}
```

### Tabla canónica de XP por acción

| Source | XP | Razón |
|---|---|---|
| `match_confirmed` | +5 | Confirmaste tu lugar |
| `match_confirmed_early` | +5 extra | Confirmaste con más de 24h de anticipación |
| `match_played` | +25 | Jugaste el partido |
| `match_won` | +10 extra | ¡Ganaron el partido! |
| `match_drawn` | +5 extra | Empate |
| `match_punctual` | +5 | Llegaste a tiempo |
| `match_mvp` | +50 | Fuiste MVP |
| `match_no_show` | **−50** | Faltaste sin avisar |
| `match_late` | **−10** | Llegaste tarde |
| `kudo_received` | +5 | Recibiste un kudo (max 5 por partido) |
| `kudo_given` | +2 | Diste un kudo (max 5 por partido) |
| `post_match_review_done` | +10 | Calificaste el partido |
| `weekly_streak_milestone` | +20 | Mantuviste tu racha semanal |
| `commitment_streak_milestone` | +30 | Cada 5 partidos de racha de compromiso |
| `achievement_bonus` | variable | Ver tabla de achievements |

### Tabla canónica de achievements (selección clave)

| ID | Label | XP Bonus | Condición |
|---|---|---|---|
| `first_match` | Debut | 50 | `played >= 1` |
| `matches_10` | Habitué | 100 | `played >= 10` |
| `matches_25` | Veterano | 200 | `played >= 25` |
| `matches_50` | Imparable | 400 | `played >= 50` |
| `matches_100` | Centenario | 1000 | `played >= 100` |
| `first_win` | Primera Victoria | 50 | `won >= 1` |
| `wins_10` | Ganador | 150 | `won >= 10` |
| `wins_25` | Triunfador | 300 | `won >= 25` |
| `first_mvp` | Primer MVP | 100 | `mvpAwards >= 1` |
| `mvp_5` | Figura Repetida | 300 | `mvpAwards >= 5` |
| `mvp_10` | Figura del Predio | 600 | `mvpAwards >= 10` |
| `weekly_streak_5` | Constancia | 200 | `weeklyStreak >= 5` |
| `weekly_streak_10` | Inquebrantable | 500 | `weeklyStreak >= 10` |
| `commitment_streak_25` | Reloj Suizo | 400 | `commitmentStreak >= 25` |
| `kudos_25` | Querido | 200 | `kudosSummary.total >= 25` |
| `kudos_100` | Ídolo | 800 | `kudosSummary.total >= 100` |
| `perfect_month` | Mes Perfecto | 300 | 4+ partidos en un mes sin late/no-show |
| `early_bird` | Madrugador | 150 | 10 confirmaciones >24h antes |
| `veteran_year` | Aniversario | 500 | 1 año desde el primer partido |
| `review_master` | Crítico | 200 | 20 reviews completadas |
| `all_tiers` | Leyenda Confirmada | 2000 | Alcanzó Leyenda (nivel 41) |

### Curva de niveles (50 niveles)

```typescript
// lib/domain/xp.ts

/** XP total acumulado necesario para alcanzar el nivel N (inclusive). */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  // Curva: exponente 1.45 — balance entre alcanzable y aspiracional.
  // xp_total(50) ≈ 14.112. Leyenda (n=41) ≈ 10.516.
  // Con 1 partido/sem (~70 XP/sem): Leyenda en ~3.9 años.
  // Con 2 partidos/sem (~120 XP/sem): Leyenda en ~2.3 años.
  return Math.floor(50 * Math.pow(level - 1, 1.45));
}

/** Nivel correspondiente a un XP total. */
export function calcLevelFromXp(xp: number): number {
  if (xp <= 0) return 1;
  // Inversa aproximada de xpForLevel, capada a 50
  for (let level = 50; level >= 1; level--) {
    if (xp >= xpForLevel(level)) return level;
  }
  return 1;
}

/** Tier correspondiente a un nivel. */
export function calcTierFromLevel(level: number): XpTier {
  if (level <= 10) return "suplente";
  if (level <= 20) return "titular";
  if (level <= 30) return "estrella";
  if (level <= 40) return "capitan";
  return "leyenda";
}

/** XP requerido para el próximo nivel (relativo al nivel actual). */
export function xpToNextLevel(xp: number): { current: number; needed: number; nextLevelXp: number } {
  const level = calcLevelFromXp(xp);
  if (level >= 50) return { current: xp - xpForLevel(50), needed: 0, nextLevelXp: xpForLevel(50) };
  const currentLevelFloor = xpForLevel(level);
  const nextLevelFloor = xpForLevel(level + 1);
  return {
    current: xp - currentLevelFloor,
    needed: nextLevelFloor - xp,
    nextLevelXp: nextLevelFloor - currentLevelFloor,
  };
}

/**
 * Overall (1-99) que se muestra en la FIFA Player Card.
 * Mapeo 1-1: nivel 1 → OVR 50, nivel 50 → OVR 99.
 * Si el user no tiene xpLevel (pre-backfill), retornar null → la card muestra `?`.
 */
export function calcOverallFromLevel(xpLevel: number | undefined): number | null {
  if (xpLevel === undefined || xpLevel === null || xpLevel < 1) return null;
  return Math.min(99, Math.max(50, 49 + xpLevel));
}
```

**Tabla de referencia (XP total por nivel + OVR de FIFA Card)** — exponente 1.45:

| Nivel | Tier | XP total | XP del tier | **OVR** |
|---|---|---|---|---|
| 1 | Suplente | 0 | — | **50** |
| 5 | Suplente | 373 | — | **54** |
| 10 | Suplente | 1.210 | — | **59** |
| 11 | Titular | 1.409 | 0 | **60** |
| 20 | Titular | 3.574 | 2.165 | **69** |
| 21 | Estrella | 3.850 | 0 | **70** |
| 30 | Estrella | 6.597 | 2.747 | **79** |
| 31 | Capitán | 6.928 | 0 | **80** |
| 40 | Capitán | 10.140 | 3.212 | **89** |
| 41 | Leyenda | 10.516 | 0 | **90** |
| 50 | Leyenda | 14.112 | ~3.600 | **99** |

**Lectura del balance**:
- Suplente → Titular: ~5 meses con 1 partido/sem (rápido — engancha al user nuevo).
- Capitán: ~1.5 años con 2 partidos/sem (objetivo de mediano plazo claro).
- Leyenda: ~2.3 años con 2 partidos/sem, ~3.9 con 1/sem (prestigio real, alcanzable con dedicación).

### Capa de dominio (`lib/domain/xp.ts`)
Funciones puras (sin Firebase, sin React):

```typescript
// Cálculos
xpForLevel(level: number): number
calcLevelFromXp(xp: number): number
calcTierFromLevel(level: number): XpTier
xpToNextLevel(xp: number): { current, needed, nextLevelXp }
clampXpToLevelFloor(xp: number, level: number): number   // garantiza que xp >= floor del nivel
calcOverallFromLevel(xpLevel: number | undefined): number | null   // OVR 50-99 para la FIFA Card

// Cálculo del agregado de XP por partido
computeMatchXp(input: {
  isPlayer: boolean;
  won: boolean;
  drawn: boolean;
  lost: boolean;
  wasMvp: boolean;
  wasLate: boolean;
  wasNoShow: boolean;
  confirmedEarly: boolean;
}): Array<{ source: XpSource; amount: number; reason: string }>

// Achievements
ACHIEVEMENT_DEFS: Record<AchievementId, AchievementDef>
checkAchievementsToUnlock(context: AchievementCheckContext, already: AchievementId[]): AchievementId[]

// Metadata visual
TIER_META: Record<XpTier, { label, color, icon, gradient }>
SOURCE_META: Record<XpSource, { label, icon, color }>

// Backfill helper
estimateHistoricalXp(profile: UserProfile): number  // calcula XP histórico desde stats + mvpAwards + kudosSummary
```

### Capa API (`lib/xp.ts`)
```typescript
// Cliente: solo lectura (escritura denegada por rules)
getXpHistory(uid: string, limit?: number): Promise<XpEvent[]>
getMyXpSummary(uid: string): Promise<{
  xp: number;
  level: number;
  tier: XpTier;
  toNext: { current, needed, nextLevelXp };
  achievements: AchievementId[];
}>
// NOTA: getLeaderboard se difiere a Fase 2 (fuera de scope V1).
```

### Cloud Functions (`functions/src/xp.ts` — NUEVO)

```typescript
// 1) Trigger: onUpdate de matches — cuando status pasa a "closed".
//    Calcula y otorga XP a cada jugador con uid por: jugar, ganar/empatar/perder,
//    puntualidad, MVP. Idempotente por flag match.xpAwarded[uid] = true.
awardXpOnMatchClose: firestore.onDocumentUpdated("matches/{matchId}", ...)

// 2) Trigger: onCreate de playerKudos.
//    +5 XP al recipient (kudo_received) + +2 XP al giver (kudo_given).
//    Cap de 5 kudos/partido por jugador (validar contra otros kudos del mismo partido).
awardXpOnKudoCreated: firestore.onDocumentCreated("playerKudos/{id}", ...)

// 3) Trigger: onCreate de matchReviews.
//    +10 XP al user que escribió el review.
awardXpOnReviewCreated: firestore.onDocumentCreated("matchReviews/{id}", ...)

// 4) Trigger: onCreate de notifications cuyo tipo es "confirmation".
//    Lee el match y otorga +5 XP por confirmar + bonus si >24h antes.
//    ALTERNATIVA: hookear directamente en la API que actualiza confirmed=true del player.
awardXpOnConfirmation: callable o trigger según infra

// 5) Trigger: onUpdate de users — cuando cambian stats relevantes (stats, mvpAwards, kudosSummary, weeklyStreak, commitmentStreak).
//    Revisa achievements no desbloqueados, los marca y otorga bonus XP.
checkAchievementsOnUserUpdate: firestore.onDocumentUpdated("users/{uid}", ...)

// 6) Scheduled mensual: limpia xpEvents > 90 días.
cleanupOldXpEvents: pubsub.schedule("0 3 1 * *", ...)   // 1ro de cada mes 3am

// 7) Callable admin: recalcular XP de un usuario desde cero (rescate).
recalculateUserXp: https.onCall({ uid }) → require admin
```

### Migración inicial (backfill)
Script one-shot al desplegar (`scripts/backfillXp.ts`):

```typescript
// Para cada user en users/:
//   1. Si ya tiene xp definido → skip.
//   2. Calcular xp_estimado:
//      xp = (stats.played * 25)              // jugar
//         + (stats.won * 10)                  // ganar
//         + (stats.draw * 5)                  // empatar
//         + (mvpAwards * 50)                  // MVP
//         + (kudosSummary.total * 5)          // kudos recibidos
//         - ((stats.noShows ?? 0) * 50)       // no-shows
//         - ((stats.lateArrivals ?? 0) * 10)  // late
//   3. xp = max(0, xp)
//   4. level = calcLevelFromXp(xp); tier = calcTierFromLevel(level)
//   5. Escribir xpEvents/{uid}_backfill_v1_history con el monto agregado.
//   6. Update users/{uid} con { xp, xpLevel, xpTier, xpLastEvent }.
//   7. Setear flag _migration.xpBackfillV1: { runAt, version: 1 } para evitar re-run.
```

### Componentes UI (estructura final)

```
app/
  profile/page.tsx               (modificar — insertar XpStatsSection + AchievementsGrid)
  page.tsx                       (modificar — insertar LeaderboardCard opcional)
components/
  xp/
    XpProgressBar.tsx            (nuevo)
    XpBadge.tsx                  (nuevo)
    XpTierIcon.tsx               (nuevo)
    LevelUpModal.tsx             (nuevo)
    TierUpModal.tsx              (nuevo)
    XpHistoryDrawer.tsx          (nuevo)
    AchievementUnlockedModal.tsx (nuevo)
    XpOnboardingModal.tsx        (nuevo — modal educativo one-shot)
  profile/
    XpStatsSection.tsx           (nuevo)
    AchievementsGrid.tsx         (nuevo)
    AchievementCard.tsx          (nuevo)
  PlayerCardDrawer.tsx           (modificar — agregar XpBadge)
  NotificationsDrawer.tsx        (modificar — soportar tipos nuevos)
  skeletons/
    XpStatsSkeleton.tsx          (nuevo)
lib/
  domain/xp.ts                   (nuevo — fuente de verdad de cálculos)
  domain/user.ts                 (modificar — extender UserProfile)
  domain/notification.ts         (modificar — agregar tipos xp_level_up, xp_tier_up, xp_achievement)
  xp.ts                          (nuevo — capa Firestore para lectura)
  utils/xpToast.ts               (nuevo — helper de toasts)
  analytics.ts                   (modificar — registrar 7 eventos nuevos)
functions/src/
  xp.ts                          (nuevo — todos los triggers y functions)
  index.ts                       (modificar — exportar xp)
scripts/
  backfillXp.ts                  (nuevo — migración inicial)
firestore.rules                  (modificar — proteger campos + xpEvents)
firestore.indexes.json           (modificar — 3 índices nuevos)
```

---

## 10. CRITERIOS DE ACEPTACIÓN

### Sistema base
- [ ] `UserProfile` tiene `xp`, `xpLevel`, `xpTier`, `xpLastEvent`, `achievements`.
- [ ] El XP nunca baja por debajo del threshold del nivel actual.
- [ ] El nivel y tier se recalculan automáticamente al cambiar el XP.
- [ ] `xpEvents` se crea por cada awarding, idempotente por `{uid}_{source}_{contextId}`.
- [ ] Cliente NO puede escribir en `xp`, `xpLevel`, `xpTier`, `achievements` (rules deniegan).

### Integración FIFA Card
- [ ] La FIFA Player Card muestra `OVR = 49 + xpLevel` en lugar de `?`.
- [ ] OVR 50-99 cubre el rango completo (nivel 1 → 50, nivel 50 → 99).
- [ ] Si `xpLevel` es undefined (user pre-backfill, muy raro), la card muestra `?` como fallback y rarity default Verde Canchita.
- [ ] Subir de nivel actualiza el OVR en la card sin re-render forzado del resto.
- [ ] Las 5 rarities (Bronce/Plata/Dorado/Verde/Cosmic) renderizan correctamente cambiando el prop `tier`.
- [ ] La rarity Cosmic anima el gradiente del marco en loop (~4s).
- [ ] Cambio de tier dispara `TierUpModal` con preview lado-a-lado de la transición de card.
- [ ] Modal post-backfill explica si la card cambió de rarity.

### Onboarding modal
- [ ] `XpOnboardingModal` aparece automáticamente al primer load si `xpOnboardingSeenAt` está vacío.
- [ ] El modal NO se cierra con tap fuera, ESC, ni botón X — solo con el CTA principal.
- [ ] Al cerrar, se persiste `xpOnboardingSeenAt = now()` en el doc del user.
- [ ] El modal se puede reabrir manualmente desde el botón "¿Cómo funciona?" en `XpStatsSection`.
- [ ] El modal muestra: tier actual del user, los 5 tiers con preview, tabla "Cómo ganás XP", tabla "Y cuidado" (penalizaciones).
- [ ] Si la rarity de la card del user cambió (post-backfill), incluye mensaje explicativo del cambio.
- [ ] El modal es scrolleable internamente si excede `90vh`.
- [ ] Analytics: `xp_onboarding_shown` al aparecer, `xp_onboarding_completed` al cerrar con CTA.

### Otorgamiento de XP
- [ ] Al cerrar un partido, cada jugador con `uid` recibe XP agregado por jugar/ganar/MVP/puntualidad.
- [ ] No-show descuenta -50 XP. Late descuenta -10 XP.
- [ ] Confirmar asistencia otorga +5 XP. Confirmar >24h antes otorga +10 XP total (+5 bonus).
- [ ] Recibir un kudo otorga +5 XP al recipient (cap 5 kudos/partido).
- [ ] Dar un kudo otorga +2 XP al giver (cap 5 kudos/partido).
- [ ] Completar post-match review otorga +10 XP.
- [ ] Re-cerrar un partido no duplica XP (flag `xpAwarded[uid]`).

### Achievements
- [ ] Trigger en `users/{uid}` detecta achievements desbloqueables al cambiar stats.
- [ ] Cada achievement desbloqueado otorga su XP bonus configurado.
- [ ] Achievement no se desbloquea dos veces.
- [ ] Catálogo de 25+ achievements iniciales implementado.

### UI Perfil propio
- [ ] `XpStatsSection` visible en `/profile` con barra de progreso animada.
- [ ] `AchievementsGrid` muestra logros desbloqueados en color y bloqueados en gris.
- [ ] `XpHistoryDrawer` lista los últimos 20 eventos del usuario.

### UI Drawer ajeno
- [ ] `XpBadge` aparece en el `PlayerCardDrawer` (entre FIFA card y kudos).
- [ ] El drawer NO muestra el historial detallado del otro jugador (privado).

### Modales y notificaciones
- [ ] Al subir de nivel, `LevelUpModal` aparece con confetti al abrir la app.
- [ ] Al subir de tier, `TierUpModal` aparece con animación premium.
- [ ] Notificación in-app por cada level-up y tier-up.
- [ ] Push notification (opt-in) solo por tier-up.
- [ ] Al desbloquear un achievement, `AchievementUnlockedModal` aparece.
- [ ] Penalizaciones NO disparan modal (silencio respetuoso).

### Migración
- [ ] Backfill calcula y asigna XP histórico a todos los usuarios existentes.
- [ ] Modal único de bienvenida explica el sistema al usuario migrado.
- [ ] Backfill es idempotente (re-run no cambia valores).

### Performance
- [ ] El cierre de un partido con 14 jugadores resuelve XP de todos en <5s.
- [ ] El leaderboard global (top 50) resuelve en <500ms.
- [ ] El drawer de historial carga en <300ms.

### Seguridad
- [ ] Cliente recibe `permission-denied` al intentar setear `xp` directamente.
- [ ] `xpEvents` solo legible por el dueño + admin.
- [ ] Cloud Functions no exponen endpoints callable para "darme XP" sin validación.

### Analytics
- [ ] Los 7 eventos definidos se disparan en sus triggers correctos.
- [ ] `xp_awarded` incluye `source`, `amount`, `new_total_xp`, `level`.

---

## 11. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---|---|
| `lib/domain/xp.ts` | **Nuevo** — tipos, cálculos, catálogo de achievements, metadata visual. |
| `lib/domain/user.ts` | **Modificar** — extender `UserProfile` con `xp`, `xpLevel`, `xpTier`, `xpLastEvent`, `achievements`. |
| `lib/domain/notification.ts` | **Modificar** — agregar tipos `xp_level_up`, `xp_tier_up`, `xp_achievement`. |
| `lib/domain/errors.ts` | **Modificar** — agregar `XpAwardError` (uso interno de functions). |
| `lib/xp.ts` | **Nuevo** — API Firestore (queries de lectura del cliente). |
| `lib/utils/xpToast.ts` | **Nuevo** — helper de toasts con icon ámbar. |
| `lib/analytics.ts` | **Modificar** — registrar 7 eventos nuevos. |
| `app/profile/page.tsx` | **Modificar** — insertar `XpStatsSection` y `AchievementsGrid`. |
| `app/page.tsx` | **(Opcional)** insertar card de progreso XP en home. |
| `components/FifaPlayerCard.tsx` | **Modificar** — reemplazar `?` por `OVR = 49 + xpLevel` en el header. Mantener `?` como fallback si no hay xpLevel. |
| `docs/FIFA_PLAYER_CARD_SDD.md` | **Modificar** — actualizar la regla #1 ("OVR: Muestra ? por ahora") para apuntar a este SDD y la fórmula. |
| `components/PlayerCardDrawer.tsx` | **Modificar** — insertar `XpBadge`. |
| `components/NotificationsDrawer.tsx` | **Modificar** — render de tipos nuevos. |
| `components/xp/XpProgressBar.tsx` | **Nuevo** |
| `components/xp/XpBadge.tsx` | **Nuevo** |
| `components/xp/XpTierIcon.tsx` | **Nuevo** |
| `components/xp/LevelUpModal.tsx` | **Nuevo** |
| `components/xp/TierUpModal.tsx` | **Nuevo** |
| `components/xp/XpHistoryDrawer.tsx` | **Nuevo** |
| `components/xp/AchievementUnlockedModal.tsx` | **Nuevo** |
| `components/xp/XpOnboardingModal.tsx` | **Nuevo** — modal explicativo one-shot del sistema XP. Bloquea hasta CTA. Persiste `xpOnboardingSeenAt`. |
| `components/profile/XpStatsSection.tsx` | **Nuevo** |
| `components/profile/AchievementsGrid.tsx` | **Nuevo** |
| `components/profile/AchievementCard.tsx` | **Nuevo** |
| `components/skeletons/XpStatsSkeleton.tsx` | **Nuevo** |
| `functions/src/xp.ts` | **Nuevo** — todos los triggers (awardOnMatchClose, awardOnKudo, awardOnReview, awardOnConfirmation, checkAchievements, cleanup, recalculate). |
| `functions/src/index.ts` | **Modificar** — exportar xp. |
| `scripts/backfillXp.ts` | **Nuevo** — migración inicial. |
| `firestore.rules` | **Modificar** — proteger campos `xp/xpLevel/xpTier/achievements` + reglas para `xpEvents`. |
| `firestore.indexes.json` | **Modificar** — 3 índices nuevos. |
| `package.json` | **Modificar** — agregar `canvas-confetti` (~6kb). |

---

## 12. PLAN DE IMPLEMENTACIÓN (4 sesiones con Opus)

### Sesión 1 — Dominio, modelo, reglas
- `lib/domain/xp.ts` con todos los cálculos, curva de niveles, catálogo de achievements.
- Extender `UserProfile`, `Notification`.
- `firestore.rules`: proteger campos + `xpEvents`.
- `firestore.indexes.json`: 3 índices.
- Tests unitarios de la curva de niveles y de `checkAchievementsToUnlock`.

### Sesión 2 — Backend / Cloud Functions
- `functions/src/xp.ts` con todos los triggers.
- Helper `awardXp` idempotente.
- `computeMatchXp` integrado en el trigger de close.
- Trigger de achievements sobre updates de user.
- Trigger scheduled de cleanup.
- Callable admin para recalcular.

### Sesión 3 — UI Jugador (perfil propio + modales)
- `XpStatsSection`, `XpProgressBar`, `XpBadge`, `XpTierIcon`.
- `AchievementsGrid`, `AchievementCard`.
- `XpHistoryDrawer`.
- `LevelUpModal`, `TierUpModal`, `AchievementUnlockedModal`.
- Integración en `/profile`.
- Toasts pequeños para XP eventos.
- `canvas-confetti` integrado.

### Sesión 4 — Drawer ajeno, notificaciones, rarities, onboarding, migración
- `XpBadge` en `PlayerCardDrawer`.
- Tipos nuevos en `NotificationsDrawer`.
- **`FifaPlayerCard` recibe prop `tier`** + implementación de las 5 rarities (Bronce/Plata/Dorado/Verde/Cosmic) con sus 4 variables visuales.
- `TierUpModal` con preview lado-a-lado de card vieja → card nueva.
- **`XpOnboardingModal`** + integración del trigger automático en root layout (`app/layout.tsx` o equivalente) que chequea `xpOnboardingSeenAt`.
- Botón "¿Cómo funciona?" en `XpStatsSection` que reabre el modal.
- Script `scripts/backfillXp.ts` + modal de bienvenida post-backfill (incluye preview de la rarity nueva si cambia).
- Feature flag `NEXT_PUBLIC_XP_ENABLED` para gating.
- QA end-to-end con partido de prueba + verificación visual de las 5 rarities + verificación del onboarding modal.

Cada sesión termina en estado deployable detrás del feature flag.

---

## 13. DECISIONES CERRADAS

| Decisión | Resolución |
|---|---|
| ¿XP por skill o por experiencia? | Por experiencia. El `level` de skill existente se mantiene independiente. |
| ¿El XP puede bajar? | Sí dentro del nivel actual, **nunca** por debajo del threshold del nivel actual. No hay "demote" de nivel. |
| ¿Cuántos niveles? | 50, agrupados en 5 tiers de 10. |
| ¿Curva exponencial? | Suave (exponente 1.45) — balance entre alcanzable para el casual y aspiracional para Leyenda. Total ~14.000 XP. Leyenda en ~3.9 años con 1 partido/sem o ~2.3 años con 2/sem. |
| ¿Backfill histórico? | Sí. Nadie arranca de cero. Cálculo: 25/jugado + 10/ganado + 5/empatado + 50/MVP + 5/kudo - 50/no-show - 10/late. |
| ¿Push por cada subida de nivel? | No. Solo por cambio de tier (5 veces en la vida del usuario máximo). Notif in-app sí para cada level. |
| ¿XP por confirmar incluido o solo por jugar? | Incluido — premia el comportamiento de planificación. +5 por confirmar, +5 extra por confirmar con >24h. |
| ¿Penalizar al perder? | No. Perder otorga lo mismo que jugar (+25). Solo se descuenta por **no aparecer** o **llegar tarde**. |
| ¿XP por dar kudos? | Sí. +2 XP por kudo dado (cap 5/partido). Premia participación social, no farming. |
| ¿Leaderboard público? | **Fase 2.** Diferido a un SDD futuro. V1 no expone ranking — solo badge en drawer ajeno. |
| ¿Achievements son retroactivos? | Sí. El backfill detecta los que aplican y los desbloquea con su XP bonus. |
| ¿Sonidos? | Opt-in. Default off. |
| ¿Modales bloquean navegación? | No. Auto-dismiss a 3s + dismissable manual. |
| ¿Tier "Leyenda" tiene unlock cosmético? | Fase 2 — borde animado cosmic en avatar. En esta versión solo el badge cambia de gradiente. |
| ¿Decay si el user deja de jugar? | **No**. El XP es permanente — sin decay temporal. Las rachas existentes (`weeklyStreak`, `commitmentStreak`) ya cumplen el rol de "señal de actividad reciente" y sí se rompen. División: badge XP = historia, rachas = presente. Fase 2 podría agregar atenuación visual sutil (no pérdida de nivel) si `xpLastEvent > 60d`. |
| ¿XP transferible entre cuentas? | No. El XP muere con la cuenta (consistente con `stats`). |
| ¿Cómo se vincula con el OVR de la FIFA Card? | Mapeo 1-1 lineal: `OVR = 49 + xpLevel`. Rango 50-99. Cada tier = 10 puntos de OVR. |
| ¿La rarity de la card cambia con el OVR? | **Sí en V1**. 5 rarities: Bronce (Suplente), Plata (Titular), Dorado (Estrella), Verde Canchita (Capitán, la card actual), Cosmic (Leyenda). |
| ¿Por qué el verde queda en Capitán y no en Estrella? | El verde es la identidad de marca de Canchita. Asignarlo al **penúltimo** tier lo convierte en un premio aspiracional, no en el default. Estrella usa dorado FIFA UT clásico que también es muy prestigioso. |
| ¿Qué hacemos con los users que hoy ven card verde y caen en Bronce/Plata? | Modal one-shot post-backfill explica la mecánica con tono motivacional: "Tu card refleja tu historia. Estás a X XP de tu card Verde Canchita". Sin lenguaje de "degradación". |
| ¿Cosmic vs Icon blanco para Leyenda? | **Cosmic** (purple→pink→amber animado). Más distintivo visualmente y más memorable que blanco iridiscente. Decisión final. |
| ¿Qué pasa con el OVR si todavía no se corrió el backfill? | Fallback `?` y rarity Verde Canchita (preserva el look actual). El backfill garantiza que todos los users existentes reciban xpLevel ≥ 1. |

---

## 14. DECISIONES PENDIENTES DE FEEDBACK

| # | Pregunta | Default propuesto |
|---|---|---|
| 1 | ¿Mostrar el `XpBadge` en otros lugares del flow (ej: lista de jugadores del partido, al lado del nombre)? | Solo en drawer + perfil + home. No saturar todas las listas. |
| 2 | ¿Qué pasa con los `team_admin` y `location_admin` que no juegan? | No reciben XP por partidos donde no estuvieron. Pueden alcanzar achievements de "organizador" en una fase futura. |
| 3 | ¿Achievement "all_tiers" tiene un cosmético especial? | Sí en fase 2 — sticker animado en perfil. Por ahora solo bonus de 2000 XP. |
| 4 | ¿Banner explicativo del sistema en el primer login post-feature? | **Confirmado — Decisión cerrada.** Ver `XpOnboardingModal` en sección 7. Aparece una vez, persiste `xpOnboardingSeenAt`, reabrible desde perfil. |

---

## 15. ANTI-GOALS (qué este SDD NO hace)

- ❌ **No reemplaza el skill `level`** para balance de equipos. Sigue siendo `level` 1-4 el campo usado.
- ❌ **No genera ranking de "mejor jugador"** — el XP premia constancia, no calidad. Para "calidad" ya están MVP y kudos.
- ❌ **No tiene monedas / tienda / unlockeables comprables** — el sistema es 100% cosmético/status. Mantener simple.
- ❌ **No tiene leagues / temporadas / resets** — XP es perpetuo. Una temporada futura sería otro SDD.
- ❌ **No tiene leaderboard global** — diferido a Fase 2. V1 solo expone el badge en perfil propio y drawer ajeno.
- ❌ **No tiene decay temporal** — el XP no baja por inactividad. Hibernación se evalúa en fase 2.
- ❌ **No tiene Pay-to-XP** — no se compra XP. Punto.
- ❌ **No incluye misiones / quests semanales** — quedan para fase 2 si la retención lo justifica.
- ❌ **No incluye challenges 1v1 / equipos** — feature de competencia es otro dominio.
- ❌ **No agrega rarities adicionales** (ej. "TOTW", "Hero", "Inform"). Las 5 rarities están fijas: Bronce/Plata/Dorado/Verde/Cosmic. Eventos especiales serían otro SDD.

---

## 16. MÉTRICAS DE ÉXITO

Definir antes del despliegue para evaluar 30/60/90 días después:

| Métrica | Baseline | Target 30d | Target 90d |
|---|---|---|---|
| Retención semanal (% de usuarios activos que vuelven en 7d) | actual | +10% | +20% |
| Partidos jugados por usuario activo / mes | actual | +15% | +25% |
| Tasa de confirmación temprana (>24h antes) | actual | 2× | 3× |
| Tasa de no-shows | actual | -30% | -50% |
| Tasa de completion de post-match review | actual | +20% | +40% |
| Apertura de `/profile` por usuario / semana | actual | +50% | +100% |
| `xp_history_viewed` events / DAU | — | establecer | establecer |

---

**Fin del SDD.** Documento listo para revisión y aprobación antes de implementar.
