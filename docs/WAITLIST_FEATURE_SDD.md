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
| 2 | Registro en Partidos | Los suplentes conviven en memoria en el mismo sub-documento JSON de `players`, pero almacenan el flag `isWaitlist: true`, un ISO `waitlistJoinedAt` estricto y un `confirmed: false`. |
| 3 | Ascenso Válvula Libre | Si un Titular sale, los Suplentes mantienen su enumeración pero pierden la restricción de botón gris inhabilitado. El botón verde grande se habilita y pasa a llamarse "🏃‍♂️ ¡Tomar Cupo y Confirmar!". El que lo presione primero entra titular (Transacción FIFO `joinMatch` Firestore). |
| 4 | Ocultamiento de Restricciones | Unirse a la lista de espera no cuenta las validaciones de límite de usuarios (al contrario de `joinMatch`) ya que la lista de suplentes, por definición técnica, no tiene frontera (`maxPlayers` virtual = Infinito). |
| 5 | Visibilidad de Espera (UI) | En `/join/[id]`, debajo del contenedor de Titulares Confirmados, existe un contenedor de "📋 Lista de Espera (Suplentes)", ordenado temporalmente en UI usando el delta visual de `waitlistJoinedAt`. |
| 6 | Preview en Explorer | En la pantalla `/explore`, los partidos que están "Llenos" pero tienen lista de espera reportan explícitamente ese subconjunto: ej. `<Badge> Lleno (+2 espera) </Badge>`. |
| 7 | Visibilidad de Admin | En `/match/[id]`, la vista del administrador separa a los Suplentes de la cuadrícula general de *Jugadores* para evitar confundirlos con los titulares *Pendientes*, e incluye un botón especial de `Eliminar` por si el administrador decide expulsar a alguien de la zona de espera. |

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
*   `joinWaitlist(matchId, user)`: Utiliza localmente un `runTransaction(db)` idéntico al proceso de unirse. Agrega la data cruda del suplente y le impone el flag `isWaitlist` con fecha generada allí mismo y previene duplicidad.
*   `addGuestToMatch(matchId, playerUid, guestData)`: Permite ahora ingresar a la lista de espera con lógica idéntica si el partido ya está lleno (`isWaitlist: true`).
*   `leaveWaitlist(matchId, playerName)`: Operación CRUD destructiva (no transaccional extrema) usando `updateDoc` que ejecuta un `.filter()` quitando del Array local el objeto con ese nombre & Flag de validación Waitlist (por seguridad frente a clones).
*   `confirmAttendance(id, user)`: Fue reutilizada semánticamente para que cuando un Waitlist tome la vacante, repise sus propios datos transmutando automáticamente `confirmed: true`.

### 2.3 Componentes Mutados UI (`app/join/[id]/page.tsx`, `app/match/[id]/page.tsx` & `explore/page.tsx`)
*   Se re-factorizó iterativamente la lógica booleana del render de los botones basados en variables `isFull`, `isClosed`, y `existingPlayer`.
*   Añadida la inyección visual extra post-array map en `explore` calculando la longitud del flag `p.isWaitlist && !p.confirmed`.
*   En la vista particular de administrador (`MatchDetailPage`), el render del array `match.players` principal recibió el `.filter((p: Player) => !p.isWaitlist)` con exclusión estricta y se iteró su clon ordenado cronológicamente debajo, sumando la directiva de mutación de base de datos (`deletePlayerFromMatch`).
*   Se unificó la generación de los reportes para compartir en WhatsApp dentro de `lib/matchReport.ts` (función `buildRosterReport`) la cual incluye ahora automáticamente a los titulares y a los suplentes (identificando a los "Invitados de" correctamente).
*   En las listas de suplentes de la UI pública y admin, se muestra explícitamente el nombre del usuario anfitrión `(Invitado de {hostName})` alineado a la derecha en su layout para mayor claridad visual.
