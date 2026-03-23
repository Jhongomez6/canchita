# Feature: Protección de Concurrencia

## 📋 Specification-Driven Development (SDD)

Este documento describe las medidas de protección contra race conditions y operaciones parciales en el sistema.

---

## 1. ESPECIFICACIÓN FUNCIONAL (Fuente de Verdad)

### Objetivo
Garantizar que todas las operaciones de lectura-escritura sobre documentos de Firestore sean atómicas, eliminando race conditions causadas por el patrón vulnerable `getDoc()` → lógica → `updateDoc()`.

### Reglas de Negocio

| # | Regla | Implementación |
|---|-------|----------------|
| 1 | Toda operación que lee y escribe un mismo documento debe usar `runTransaction` | `lib/matches.ts`: 6 funciones migradas |
| 2 | Las stats de jugadores deben actualizarse atómicamente (all-or-nothing) | `lib/playerStats.ts`: `writeBatch` agrupa todos los updates |
| 3 | El flag `statsProcessed` debe escribirse en el mismo batch que las stats | `updatePlayerStats()` recibe `matchRef` y lo incluye en el batch |
| 4 | La ventana de votación MVP debe ser consistente entre cliente y servidor | 3 horas en ambos (`lib/matches.ts` y `functions/src/reminders.ts`) |
| 5 | El envío de recordatorios manuales debe ser idempotente | `remindersSent.manual` con timestamp de debounce (5 min) |

### Patrón de Transformación

```
ANTES (vulnerable):                      DESPUÉS (protegido):
const snap = await getDoc(ref);          await runTransaction(db, async (tx) => {
if (!snap.exists()) return;                const snap = await tx.get(ref);
const data = snap.data();                 if (!snap.exists()) return;
// ... lógica ...                         const data = snap.data();
await updateDoc(ref, updateData);         // ... lógica idéntica ...
                                           tx.update(ref, updateData);
                                         });
```

---

## 2. ARQUITECTURA DE LA IMPLEMENTACIÓN

### Capa API — `lib/matches.ts`

Funciones migradas a `runTransaction`:

| Función | Campos leídos | Campos escritos |
|---------|--------------|-----------------|
| `unconfirmAttendance()` | `players`, `teams` | `players`, `teams` |
| `leaveWaitlist()` | `players` | `players`, `playerUids` |
| `updatePlayerData()` | `players` | `players` |
| `addPlayerToMatch()` | `players`, `teams` | `players`, `playerUids`, `teams` |
| `deletePlayerFromMatch()` | `players` | `players`, `playerUids` |
| `markPlayerAttendance()` | `players` | `players` |

**Nota sobre `addPlayerToMatch`**: La lectura del perfil de usuario (`getUserProfile`) se ejecuta **antes** de la transacción, ya que el perfil no compite con el documento del match.

### Capa API — `lib/playerStats.ts`

`updatePlayerStats()` usa `writeBatch` para:
1. Combinar reversion + nuevas stats en un solo delta neto por jugador
2. Incluir el update del match (`statsProcessed`, `score`, `previousScore`, `finalReport`) en el mismo batch
3. Garantizar all-or-nothing: si falla, no queda estado parcial

### Backend — `functions/src/reminders.ts`

`sendManualReminder()` agrega chequeo de debounce:
- Lee `remindersSent.manual` (timestamp ISO)
- Si fue enviado hace menos de 5 minutos, rechaza con `already-exists`
- Escribe el timestamp antes de enviar notificaciones

---

## 3. CRITERIOS DE ACEPTACIÓN

### Criterio 1 — Transacciones en matches
**Given** dos usuarios ejecutando la misma operación simultáneamente sobre un partido
**When** ambas operaciones intentan modificar el documento
**Then** una de ellas se reintenta automáticamente con datos frescos (garantía de `runTransaction`)

### Criterio 2 — Atomicidad de stats
**Given** un partido con 20 jugadores que se cierra con score
**When** el batch de stats se ejecuta
**Then** o todos los jugadores reciben sus stats, o ninguno (all-or-nothing)

### Criterio 3 — Idempotencia de stats
**Given** un partido cerrado con `statsProcessed: true`
**When** se reabre y se re-cierra con nuevo score
**Then** las stats previas se revierten y las nuevas se aplican en un solo batch atómico

### Criterio 4 — Ventana MVP consistente
**Given** un partido cerrado hace más de 3 horas
**When** un jugador intenta votar
**Then** tanto el cliente como la Cloud Function rechazan el voto

### Criterio 5 — Idempotencia de reminders manuales
**Given** un admin que acaba de enviar un recordatorio manual
**When** intenta enviar otro inmediatamente
**Then** el sistema rechaza con error "Ya se envió un recordatorio recientemente"

---

## 4. ARCHIVOS INVOLUCRADOS

| Capa | Archivo | Cambio |
|------|---------|--------|
| API | `lib/matches.ts` | 6 funciones → `runTransaction`, ventana MVP 5h → 3h |
| API | `lib/playerStats.ts` | `setDoc` individual → `writeBatch` atómico |
| UI | `app/match/[id]/page.tsx` | Delegar `statsProcessed`/`score`/`previousScore`/`finalReport` al batch |
| Backend | `functions/src/reminders.ts` | Idempotencia en `sendManualReminder` |
