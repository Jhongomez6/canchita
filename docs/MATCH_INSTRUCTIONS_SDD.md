# Feature: Instrucciones del Partido

## 📋 Specification-Driven Development (SDD)

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo

Comunicar a los jugadores la dinámica y condiciones del partido (journey) de forma clara y sin fricción, directamente en la página `/join/[id]`. El organizador puede agregar instrucciones específicas (pago, puntualidad, etc.) que se muestran junto al journey estándar de la plataforma.

### Problema que resuelve

Los jugadores que se unen a un partido —especialmente los nuevos— no tienen contexto sobre:
- Cuándo y cómo se asignan los equipos
- Qué hacer con el pago
- Cómo funciona la votación MVP
- Instrucciones particulares del organizador (monto, puntualidad, etc.)

### Principio de diseño

**Sin fricción**: la información se muestra inline, visible sin acción del usuario, sin bloquear el flujo de join. No es un modal, no es un paso obligatorio.

---

## 2. REGLAS DE NEGOCIO

| Regla | Detalle |
|-------|---------|
| Las instrucciones son opcionales | Si `match.instructions` está vacío, solo se muestra el journey genérico |
| Solo el owner puede escribir instrucciones | Campo editable en SettingsTab del admin |
| Máximo 500 caracteres | Para evitar textos excesivos |
| Las instrucciones se muestran a todos los visitantes | Confirmados, pendientes y visitantes no registrados |
| El panel se expande automáticamente | Solo si `match.instructions` tiene contenido |

---

## 3. JOURNEY ESTÁNDAR DE LA PLATAFORMA

Los siguientes pasos son fijos y se muestran siempre. Son la fuente de verdad de `JOURNEY_STEPS` en el componente.

| # | Ícono | Título | Descripción |
|---|-------|--------|-------------|
| 1 | ⏰ | Sé puntual | Llega 10 minutos antes. Tu puntaje de compromiso está en juego. |
| 2 | ⚽ | Equipos automáticos | Cuando el cupo esté completo, el organizador balancea los equipos. Revisa tu camiseta en la app antes de llegar. |
| 3 | 🤝 | Juego limpio | Respeto en todo momento. El árbitro somos todos. |
| 4 | ⭐ | Vota por el MVP | Al terminar, reconoce al jugador que marcó la diferencia. |

---

## 4. MODELO DE DATOS

### Cambio en `Match` (`lib/domain/match.ts`)

```typescript
interface Match {
  // ... campos existentes ...
  instructions?: string; // Instrucciones libres del organizador, máx 500 chars
}
```

No requiere migración: campo opcional, retrocompatible con todos los partidos existentes.

### Firestore Rules

El campo `instructions` queda cubierto por las reglas existentes de update del owner. No requiere cambios.

---

## 5. COMPONENTES

### `components/MatchInstructionsPanel.tsx` (nuevo)

**Props:**
```typescript
interface MatchInstructionsPanelProps {
  instructions?: string;
}
```

**Comportamiento:**
- Panel colapsable con toggle
- Expandido por defecto si `instructions` tiene contenido
- Colapsado por defecto si no hay instrucciones del organizador
- Animación: Framer Motion `AnimatePresence` + `motion.div`
- Sección "Nota del organizador": borde verde, solo visible si `instructions` existe
- Sección "Journey": 4 pasos del array `JOURNEY_STEPS`

**Ubicación en `/join/[id]`:** después del `<MatchTimeline>`, antes de la card de confirmación de asistencia.

### `app/new-match/page.tsx` (modificado)

Nueva card "Instrucciones para jugadores" (opcional) antes del botón de crear:
- `<textarea>` con max 500 caracteres y contador
- Solo se persiste si el campo tiene contenido (evita guardar string vacío)
- Se pasa como `instructions` a `createMatch()`

### `app/match/[id]/components/SettingsTab.tsx` (modificado)

Nueva sección "Instrucciones para jugadores":
- `<textarea>` con max 500 caracteres
- Contador de caracteres visible
- Guardado al perder el foco (`onBlur` → `onUpdateInstructions`)
- Placeholder con ejemplo concreto
- Solo visible para el owner (`isOwner`)

---

## 6. FLUJO DE USUARIO

### Jugador que se une

```
Llega a /join/[id]
  → Ve info del partido (fecha, hora, lugar)
  → Ve MatchTimeline (estado del partido)
  → Ve MatchInstructionsPanel [NUEVO]
      ↳ Si hay instrucciones: expandido, nota del org. arriba + journey abajo
      ↳ Si no hay instrucciones: colapsado, "¿Cómo funciona?" como toggle
  → Ve botón de confirmar asistencia
```

### Organizador que escribe instrucciones

```
Va a /match/[id] → Settings
  → Sección "Instrucciones para jugadores"
  → Escribe en textarea → pierde foco → se guarda automáticamente
  → Toast: "Instrucciones guardadas"
```

---

## 7. CRITERIOS DE ACEPTACIÓN

- [ ] El panel aparece en `/join/[id]` entre el timeline y la card de asistencia
- [ ] Sin instrucciones del org → panel colapsado, se puede expandir para ver el journey
- [ ] Con instrucciones del org → panel expandido por defecto, nota del org. destacada en verde
- [ ] El organizador puede escribir hasta 500 caracteres en SettingsTab
- [ ] Los cambios se persisten en Firestore al perder el foco
- [ ] Partidos existentes (sin `instructions`) funcionan igual
- [ ] El panel es visible para usuarios no autenticados (visitantes)

---

## 8. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---------|--------|
| `lib/domain/match.ts` | Agregar `instructions?: string` a la interfaz `Match` |
| `components/MatchInstructionsPanel.tsx` | **Nuevo** — panel con journey + notas del org. |
| `app/join/[id]/page.tsx` | Importar y renderizar `<MatchInstructionsPanel>` |
| `app/new-match/page.tsx` | Agregar card "Instrucciones" (opcional) en el formulario de creación |
| `lib/matches.ts` | Agregar `instructions?: string` al tipo de `createMatch` |
| `app/match/[id]/components/SettingsTab.tsx` | Agregar textarea + prop `onUpdateInstructions` |
| `app/match/[id]/page.tsx` | Pasar `onUpdateInstructions` a `SettingsTab` |
