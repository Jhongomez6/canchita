# Feature: Sistema de Suplentes (Lista de Espera)

## 📋 Specification-Driven Development (SDD)

Sistema para permitir a los jugadores anotarse como "Suplentes" en partidos que han alcanzado su límite de capacidad (Llenos) y permitir el re-ingreso dinámico ("Free-for-all") cuando se liberan cupos.

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo
Maximizar la asistencia garantizando que, si un titular cancela o es dado de baja, su lugar sea habilitado inmediatamente para que el primer interesado en la lista de espera pueda tomarlo ("First come, first served").

### Reglas de Negocio Implementadas

| # | Regla | Impacto / UI |
|---|---|---|
| 1 | Habilitación de Lista | Cuando un partido alcanza `maxPlayers` reales (`confirmed == true` + `guests`), el botón de "Confirmar Asistencia" se reemplaza por el botón ámbar "📋 Ingresar como Suplente". |
| 2 | Registro en Partidos | Los suplentes conviven en el mismo array `players`, con `isWaitlist: true`, `confirmed: false`, y un ISO `waitlistJoinedAt`. |
| 3 | Estado de Espera Dedicado | El bloque UI del suplente es completamente independiente del flujo de confirmación normal. Cuando el jugador está en lista de espera (`isWaitlist: true && confirmed: false`), siempre ve el mensaje "📋 Estás en la lista de espera" y el botón "Salir de la lista de espera", independientemente de si el partido está lleno o no. **No hay botón de "Tomar Cupo"** — el suplente debe ser promovido por el admin o salir de la lista manualmente. |
| 4 | Re-ingreso a Lista | Si un jugador previamente canceló (`confirmed: false`, sin `isWaitlist`) y vuelve a unirse a la waitlist, `joinWaitlist()` actualiza su registro existente en lugar de crear uno nuevo, evitando duplicados. |
| 5 | Ocultamiento de Restricciones | Unirse a la lista de espera no cuenta las validaciones de límite de jugadores (la lista de suplentes no tiene frontera, `maxPlayers` virtual = Infinito). |
| 6 | Visibilidad de Espera (UI) | En `/join/[id]`, debajo del contenedor de Titulares Confirmados, existe un contenedor de "📋 Lista de Espera (Suplentes)", ordenado temporalmente con `waitlistJoinedAt`. |
| 7 | Preview en Explorer | En la pantalla `/explore`, los partidos "Llenos" con lista de espera reportan ese subconjunto: ej. `<Badge> Lleno (+2 espera) </Badge>`. |
| 8 | Visibilidad de Admin | En `/match/[id]`, la vista del administrador separa a los Suplentes de los titulares *Pendientes*, con botón de `Eliminar` para expulsar de la zona de espera. |

---

## 2. ARQUITECTURA TÉCNICA

### 2.1 Modelo de Datos (`lib/domain/player.ts`)
Ampliación de la interfaz `Player`:
```typescript
export interface Player {
    uid?: string;
    name: string;
    level: PlayerLevel;
    positions: Position[];
    confirmed: boolean;         // Titular absoluto
    // Propiedades nuevas opcionales
    isWaitlist?: boolean;       // Suplente Flag
    waitlistJoinedAt?: string;  // Timestamp estricto UTC
}

// Nota: A partir de la actualización, los Invitados (`Guest`) también pueden 
// entrar a la lista de espera compartiendo estas propiedades: `isWaitlist`, 
// `confirmed`, y `waitlistJoinedAt`.
```

### 2.2 Capa de API - Firebase Transactions (`lib/matches.ts`)
*   `joinWaitlist(matchId, user)`: Usa `runTransaction(db)`. Previene duplicados reales: si el jugador ya tiene `isWaitlist: true` o `confirmed: true`, no hace nada. Si el jugador existe pero canceló (`confirmed: false`, sin `isWaitlist`), **actualiza** su registro existente en lugar de crear uno nuevo. Esto permite el re-ingreso correcto a la lista de espera tras una cancelación previa.
*   `addGuestToMatch(matchId, playerUid, guestData)`: Permite ingresar a la lista de espera si el partido está lleno (`isWaitlist: true`).
*   `leaveWaitlist(matchId, playerName)`: Operación `updateDoc` con `.filter()` que elimina al suplente por nombre y flag `isWaitlist`.
*   `confirmAttendance(id, user)`: Transforma `confirmed: true` para jugadores regulares no confirmados.

### 2.3 Componentes UI (`app/join/[id]/page.tsx`, `app/match/[id]/page.tsx` & `explore/page.tsx`)

#### Lógica de botones en `/join/[id]` (actualizada)

Los estados del jugador se manejan en **bloques independientes y mutuamente excluyentes**:

| Condición | Bloque mostrado |
|---|---|
| `!isFull && !existingPlayer` | Formulario de unirse |
| `existingPlayer?.confirmed` | "Ya estás confirmado" |
| `!isFull && existingPlayer && !existingPlayer.confirmed && !existingPlayer.isWaitlist` | "⏳ Aún no confirmaste" + botón "✅ Confirmar asistencia" |
| `existingPlayer?.isWaitlist && !existingPlayer.confirmed` | "📋 Estás en la lista de espera" + botón "Salir de la lista de espera" |
| `isFull && !existingPlayer` | Banner "partido lleno" + botón para unirse a lista |

> **Nota**: El bloque de waitlist aplica independientemente de si el partido está lleno o no. Si el jugador tiene `isWaitlist: true`, siempre ve el estado de espera en lugar del flujo de confirmación normal.

*   En la vista de administrador (`MatchDetailPage`), el array `match.players` se filtra con `.filter((p) => !p.isWaitlist)` para separar titulares de suplentes.
*   En `explore`, la badge de capacidad calcula `p.isWaitlist && !p.confirmed` para mostrar la cantidad en espera.
*   El reporte de WhatsApp (`buildRosterReport` en `lib/matchReport.ts`) incluye titulares y suplentes con identificación de invitados.
