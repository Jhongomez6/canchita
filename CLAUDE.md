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
