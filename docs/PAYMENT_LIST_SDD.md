# Feature: Lista de Cobros (Payment Tracking)

## Specification-Driven Development (SDD)

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo
Permitir al administrador registrar qué jugadores e invitados han pagado después de cerrar el partido.

### Visibilidad
- Solo visible en `/match/[id]` (admin view), tab "Cobros"
- El tab aparece únicamente cuando `match.status === "closed"`
- Solo el owner del partido puede acceder (verificado por `isOwner` en `page.tsx`)

### Flujo de uso
1. El admin cierra el partido → aparece el tab "💰 Cobros"
2. El admin navega al tab y ve la lista de participantes
3. Cada fila muestra nombre, badge de asistencia (o "Invitado") y un botón toggle
4. El admin toca los toggles para marcar jugadores como pagados/pendientes (cambios locales en el draft)
5. El resumen superior se actualiza localmente mientras edita
6. Cuando hay cambios, aparece un botón "Guardar Cobros" en la base
7. El admin toca "Guardar Cobros" → se envía **un bloque único** con todos los cambios a Firestore
8. El tab se actualiza vía Firestore `onSnapshot` en tiempo real

---

## 2. MODELO DE DATOS

### Extensión de Match (`lib/domain/match.ts`)
```typescript
payments?: Record<string, boolean>; // key → hasPaid (true = pagó)
```

#### Convención de keys
| Tipo | Key |
|------|-----|
| Jugador registrado | `uid` del jugador |
| Invitado (guest) | `guest_${invitedBy}_${name}` |

- Campo opcional: si no existe, todos están pendientes (`false` por defecto)
- Escritura por dot-notation: `payments.${key}` = true/false (atómico, sin transacción)

---

## 3. FILTRO DE PARTICIPANTES

### Jugadores (players)
**Regla:** mostrar jugadores que cumplan **cualquiera** de estas condiciones:
- Tengan `attendance` registrado (`"present"`, `"late"`, `"no_show"`) Y `uid` válido, O
- Tengan `confirmed === true` Y `uid` válido

Esto garantiza que se muestren todos los participantes, incluso si no completaron la asistencia.

### Invitados (guests)
Todos los guests con `isWaitlist !== true` (activos en el partido, no en lista de espera).

### Exclusiones
- Jugadores sin `uid`
- Guests en waitlist (`isWaitlist === true`)

---

## 4. ARQUITECTURA

### Archivos modificados
| Archivo | Cambio |
|---------|--------|
| `lib/domain/match.ts` | + `payments?: Record<string, boolean>` en `Match` |
| `lib/matches.ts` | + `togglePayment(matchId, key, hasPaid)` |
| `app/match/[id]/components/MatchAdminTabs.tsx` | + `TabId "payments"`, + `isClosed` prop, tab condicional |
| `app/match/[id]/page.tsx` | + imports, + `isClosed` en `MatchAdminTabs`, + panel `PaymentsTab` |
| `app/match/[id]/components/PaymentsTab.tsx` | NUEVO componente principal |
| `firestore.rules` | Jugadores no pueden escribir campo `payments` |
| `docs/PAYMENT_LIST_SDD.md` | Este documento |

---

## 5. API

### `savePaymentsInBatch` (`lib/matches.ts`)
```typescript
export async function savePaymentsInBatch(
  matchId: string,
  payments: Record<string, boolean>
): Promise<void>
```
- Escribe el mapa completo de pagos en **una sola operación** via `updateDoc` con dot-notation
- Optimiza costo: N cambios = 1 escritura en lugar de N escrituras
- No requiere transacción: updateDoc es atómico a nivel de documento

---

## 6. COMPONENTE `PaymentsTab`

### Props
```typescript
interface PaymentsTabProps {
  match: Match;
  onSavePayments: (payments: Record<string, boolean>) => Promise<void>;
}
```

### Estado interno
- `draftPayments`: Record<string, boolean> — copia local editable de `match.payments`
- `isSaving`: boolean — indica si hay una operación en progreso
- `hasChanges`: boolean — detecta si el draft difiere de `match.payments`

### Funciones puras internas
- `getPayablePlayers(match)` — filtra jugadores con attendance O confirmed
- `getPayableGuests(match)` — filtra guests activos (no waitlist)

### UI
- **Summary bar**: "X pagaron" (emerald) + "X pendientes" (amber) — actualiza en tiempo real con cambios del draft
- **Lista**: avatar + nombre + badge de asistencia/invitado + botón toggle
- **Botón guardar**: Aparece solo si `hasChanges === true`, deshabilitado mientras `isSaving === true`
- Toggles siempre activos (no requieren estado de carga por fila)

---

## 7. SEGURIDAD (Firestore Rules)

La regla `allow update` para jugadores excluye el campo `payments`:
```
&& !request.resource.data.diff(resource.data).affectedKeys().hasAny(['payments'])
```

Los admins (`isAdmin()`) retienen acceso irrestricto a todos los campos.
