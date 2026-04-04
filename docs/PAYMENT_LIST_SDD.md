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
4. El admin toca "Pendiente" para marcarlo como pagado → botón cambia a "Pagó ✓"
5. El admin toca "Pagó ✓" para revertir → botón vuelve a "Pendiente"
6. El resumen superior se actualiza en tiempo real vía Firestore `onSnapshot`

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
**Regla primaria:** jugadores con `attendance === "present" | "late" | "no_show"` y `uid` válido.

**Fallback:** si ningún jugador tiene `attendance` registrado, mostrar todos con `confirmed === true` y `uid` válido.

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

### `togglePayment` (`lib/matches.ts`)
```typescript
export async function togglePayment(
  matchId: string,
  key: string,
  hasPaid: boolean
): Promise<void>
```
- Escribe `payments.${key}` = `hasPaid` via `updateDoc` con dot-notation
- No requiere transacción: cada toggle es una escritura independiente y atómica

---

## 6. COMPONENTE `PaymentsTab`

### Props
```typescript
interface PaymentsTabProps {
  match: Match;
  onTogglePayment: (key: string, hasPaid: boolean) => Promise<void>;
}
```

### Funciones puras internas
- `getPayablePlayers(match)` — filtra jugadores con attendance o fallback confirmed
- `getPayableGuests(match)` — filtra guests activos (no waitlist)

### UI
- **Summary bar**: "X pagaron" (emerald) + "X pendientes" (amber)
- **Lista**: avatar + nombre + badge de asistencia/invitado + botón toggle
- Estado visual reactivo: llega via `onSnapshot` del match en el padre

---

## 7. SEGURIDAD (Firestore Rules)

La regla `allow update` para jugadores excluye el campo `payments`:
```
&& !request.resource.data.diff(resource.data).affectedKeys().hasAny(['payments'])
```

Los admins (`isAdmin()`) retienen acceso irrestricto a todos los campos.
