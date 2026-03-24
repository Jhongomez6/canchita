# Canchita — Instrucciones para Claude Code

## Reglas de desarrollo

### 1. Documentación SDD obligatoria

Cada feature o fix significativo debe estar documentado en `docs/`. Los SDDs son la fuente de verdad funcional. Al crear o modificar funcionalidad:

- Si la feature ya tiene SDD → actualizar las secciones afectadas (reglas de negocio, criterios de aceptación, archivos involucrados).
- Si es una feature nueva → crear `docs/NOMBRE_FEATURE_SDD.md` siguiendo el formato existente.

### 2. Datos de jugador en `match.teams`

Cuando se construyen objetos de jugador para guardar en `match.teams.A` o `match.teams.B` (ej. en `handleBalance()` o en cualquier save de equipos), **siempre incluir**:

```typescript
{
  uid,
  name,
  level,
  positions,
  primaryPosition,   // ← obligatorio
  photoURL,          // ← obligatorio
  confirmed,
}
```

Sin `photoURL` y `primaryPosition`, la vista cerrada del join (`/join/[id]`) no puede mostrar avatares ni el icono de posición correcto.

### 3. Fallback en vista cerrada (`/join/[id]`)

Siempre que se iteren jugadores de `match.teams.A/B` para renderizarlos en la vista cerrada, usar el patrón de fallback:

```typescript
const fullPlayer = match.players?.find((mp: Player) => mp.uid === p.uid);
const photoURL = p.photoURL || fullPlayer?.photoURL;
const primaryPosition = p.primaryPosition || fullPlayer?.primaryPosition;
```

Esto garantiza compatibilidad con partidos guardados antes de que los objetos de team incluyeran esos campos.

### 4. Arquitectura por capas

| Capa | Ubicación | Regla |
|------|-----------|-------|
| Dominio | `lib/domain/` | Lógica pura, sin Firebase, sin React |
| API | `lib/matches.ts`, `lib/users.ts`, etc. | Operaciones Firestore |
| UI | `app/` | Solo presentación y orquestación |

No mezclar lógica de dominio en la UI ni llamadas a Firestore en el dominio.

### 5. Firestore Rules

Cualquier cambio de estructura de datos debe reflejarse en `firestore.rules`. Revisar siempre que las reglas de lectura/escritura sean consistentes con los nuevos campos.

### 6. Concurrencia con Transactions

Toda operación que modifique estado compartido en Firestore (join, leave, confirm, add guest, balance teams) **debe usar `runTransaction()`**. Nunca hacer read + write separados — causa race conditions con múltiples usuarios simultáneos.

```typescript
await runTransaction(db, async (transaction) => {
  const snap = await transaction.get(ref);
  const data = snap.data();
  // Validar reglas de negocio con datos frescos
  // Modificar y guardar en la misma transacción
  transaction.update(ref, { /* updates */ });
});
```

### 7. Errores de dominio tipados

Usar las clases de error de `lib/domain/errors.ts` en lugar de `throw new Error()` genérico:

| Clase | Uso |
|-------|-----|
| `ValidationError` | Input inválido del usuario |
| `BusinessError` | Violación de regla de negocio |
| `MatchFullError` | Partido lleno |
| `DuplicatePlayerError` | Jugador ya existe |
| `GuestValidationError` | Validación de invitado |

En la UI, capturar errores con `handleError()` de `lib/utils/error.tsx` que muestra toasts con detalle técnico copiable.

### 8. Nombres de tipos y convenciones TypeScript

| Sufijo | Significado | Ejemplo |
|--------|-------------|---------|
| (sin sufijo) | Entidad completa | `Match`, `Player`, `Location` |
| `Input` | Datos para crear/actualizar | `CreateMatchInput`, `LocationInput` |
| `Snapshot` | Datos embebidos en otra entidad | `LocationSnapshot` |

Status y enums como union types:
```typescript
type MatchStatus = "open" | "closed";
type PlayerLevel = 1 | 2 | 3;
type Position = "GK" | "DEF" | "MID" | "FWD";
```

### 9. Convenciones de UI

- **Animaciones**: Usar Framer Motion (`motion.div`, `AnimatePresence`) para transiciones y drawers.
- **Notificaciones**: `react-hot-toast` con `toast.success()` / `toast.error()` — nunca `alert()`.
- **Iconos**: Solo `lucide-react`.
- **Skeletons**: Cada página con carga async debe tener su skeleton en `components/skeletons/`.
- **Bottom nav padding**: Todo contenido de página debe incluir `pb-24 md:pb-0` para no quedar tapado por la navegación inferior móvil.

### 10. Eventos de analytics

Seguir la convención `snake_case` y las prioridades del SDD de analytics:

- **P1 (Activation)**: `user_registered`, `onboarding_completed`, `match_joined`
- **P2 (Engagement)**: `attendance_confirmed`, `teams_balanced`, `match_closed`
- **P3 (Premium)**: `mvp_voted`, `player_card_viewed`
- **P4 (Platform)**: `pwa_install`, `push_enabled`

Siempre incluir `match_id` cuando el evento es sobre un partido. Usar `initAnalytics()` lazy — nunca importar analytics directamente.

### 11. Guest → Player: conversión y límites

- Jugadores regulares: máximo **2 guests** por partido.
- Owner del partido: guests **ilimitados**.
- Usar `guestToPlayer()` de `lib/domain/guest.ts` para convertir guest a player (agrega sufijo `(inv)` al nombre).
- Los guests tienen estado `isWaitlist` y `waitlistJoinedAt` cuando el partido está lleno.

### 12. Commits y ramas

Formato de commits: `tipo: descripción concisa`

| Prefijo | Uso |
|---------|-----|
| `feat:` | Nueva funcionalidad |
| `fix:` | Corrección de bug |
| `refactor:` | Reestructuración sin cambio funcional |
| `docs:` | Solo documentación |

### 13. PWA y Service Worker

- El service worker (`firebase-messaging-sw.js`) usa cache-busting con `?v=N` — incrementar al hacer cambios.
- El hook `usePWAInstall()` maneja instalación con cooldown configurable para no molestar al usuario.
- El refresh de token FCM ocurre en cada carga de app (`useTokenRefresh`) para evitar tokens muertos.

### 14. Idioma

Todo el contenido visible al usuario (labels, toasts, placeholders, mensajes de error) debe estar en **español**. Los nombres de variables, funciones, tipos e interfaces se escriben en **inglés**.
