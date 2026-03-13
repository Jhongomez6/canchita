# Feature: Sistema de Votación MVP (Jugador Más Valioso)

## 📋 Specification-Driven Development (SDD)

Sistema que permite a los jugadores de un partido cerrado votar por el "MVP" (Jugador Más Valioso). El reconocimiento se procesa en tiempo real y, luego de 5 horas desde el cierre del partido, los votos se bloquean.

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo
Fomentar la camaradería y el compañerismo permitiendo a los participantes destacar al jugador más sobresaliente del encuentro, otorgándole visibilidad en el resumen del partido y en su historial personal.

### Reglas de Negocio Implementadas

| # | Regla | Impacto / UI |
|---|---|---|
| 1 | Votación Libre | Cualquier jugador confirmado puede votar por cualquier otro jugador confirmado o invitado (Guest) presente en el partido (excepto por sí mismo). |
| 2 | Periodo de Votación | La votación se habilita exclusivamente cuando el estado del partido es `closed` (`isClosed === true`). |
| 3 | Tiempo Límite (5h) | Existe un candado de seguridad: la votación cuenta con una ventana máxima de 5 horas contadas a partir de la captura del timestamp `closedAt` (generado al mandar a cerrar el partido). Pasado el tiempo, los botones se inhabilitan en cliente y la mutación falla en Backend. |
| 4 | Anonimato Parcial | Al votar, la UI (que previamente solo decían "¡Reconoce a la figura de hoy!") oculta los detalles exhaustivos de quién vota a quién, pero muestra un conteo aglomerado en tiempo real. |
| 5 | Actualizaciones en Vivo | La UI de `/join/[id]` y `/match/[id]` procesa el array de `mvpVotes` dinámicamente y expone los votos acumulados por jugador. |
| 6 | Destacado Visual 👑 | Aquel jugador (o jugadores en caso de empate) con mayor cantidad de votos obtenidos será decorado en la lista de equipos final con una corona animada (`👑`) de forma inmediata. |
| 7 | Voto Definitivo | Una vez que un usuario emite su voto, este es inmutable. El sistema fuerza una validación de `confirm()` en el cliente, y el backend rechaza intentos de sobrescritura para el mismo `voterUid`. |
| 8 | Cierre Matemático Anticipado | Si durante la votación, un jugador adquiere una ventaja de votos tal que el segundo lugar ya no podría alcanzarlo matemáticamente (ni siquiera asumiendo que todos los votos restantes, `jugadores elegibles confirmados - votos emitidos`, fueran para el segundo), la votación se da por concluida automáticamente antes del límite de tiempo e informa que el MVP ha sido decidido por mayoría aplastante. *Nota: Los Invitados (Guests) son excluidos del conteo de "votos restantes" dado que no poseen cuenta para votar.* |

---

## 2. ARQUITECTURA TÉCNICA

### 2.1 Modelo de Datos (`lib/domain/match.ts` & `lib/domain/user.ts`)
*   Se extendió el modelo `Match`:
    ```typescript
    mvpVotes?: Record<string, string>; // Unifica { UID_Votante : UID_o_Name_Votado }
    closedAt?: string;                 // ISO String estricto generado al cierre
    ```
*   Se extendió el modelo `UserProfile`:
    ```typescript
    mvpAwards?: number; // Contador acumulativo histórico de reconocimientos
    ```

### 2.2 Capa de API - Firebase Transactions (`lib/matches.ts`)
*   `closeMatch(matchId)`: Mutada orgánicamente para incrustar `closedAt: new Date().toISOString()`.
*   `reopenMatch(matchId)`: Remueve o limpia implícitamente `closedAt: null` al reaperturar el estado hacia `open`.
*   `voteForMVP(matchId, voterUid, targetId)`: Envuelve el voto en un `runTransaction(db)` de Firebase para prevenir carreras asíncronas.
    *   Lee la fecha actual `now()` contra la fecha `closedAt` registrada. Lanza un "Error: Periodo terminado" si la diferencia es mayor a 5 horas.
    *   Lee el estado actual de los votos e impide transacciones si el usuario ya emitió uno previamente (`mvpVotes[voterUid]` existente).
    *   Calcula dinámicamente cuántos votos son inalcanzables. Si la diferencia entre el puesto 1 y 2 es mayor a los `remainingVotes` proyectados, aborta transacciones futuras y sella el resultado matemáticamente.
    *   Aplica Firebase Dot Notation (`mvpVotes.[voterUid]: targetId`) garantizando así que un usuario nunca pueda emitir votos dobles concurrentes.

### 2.3 Reglas de Visualización de Jugadores en Vista Cerrada

Cuando el partido está cerrado, los jugadores en los bloques de Equipo A/B y en los botones de votación MVP se toman de `match.teams.A/B`. Estos objetos pueden no tener `photoURL` ni `primaryPosition` si el partido fue balanceado antes del fix de Regla #13 del SDD de Balanceo.

**Patrón obligatorio** para cualquier listado de `match.teams.X` en la vista `/join/[id]`:

```typescript
const fullPlayer = match.players?.find((mp: Player) => mp.uid === p.uid);
const photoURL = p.photoURL || fullPlayer?.photoURL;
const primaryPosition = p.primaryPosition || fullPlayer?.primaryPosition;
```

Usar `photoURL` y `primaryPosition` (resueltos) en lugar de `p.photoURL` y `p.primaryPosition` directamente.

### 2.4 Componentes Mutados UI (`app/join/[id]/page.tsx` & `app/match/[id]/page.tsx`)
*   Se reubicó el _Widget_ (`MVP VOTING CARD`) justo debajo del bloque de Resultados del Partido para optimizar el flujo narrativo (marcador final -> y luego premio individual).
*   Los botones de votación fueron refactorizados para mostrarse agrupados lógicamente por "🔴 Equipo A" y "🔵 Equipo B", facilitando la visualización y reconocimiento rápido por parte del usuario.
*   La tarjeta de MVP implementa una estética "Soft-Amber" sutil en lugar de gradientes intensos, mejorando la armonía visual global.
*   Mensajería Dinámica: En base a la longitud de la lista final de ganadores (`currentMVPs`), se exponen mensajes descriptivos para aclarar situaciones (ej. "🤝 ¡Empate! Hoy se comparte el podio." vs "⭐ Ganador indiscutible.").
*   El render de Titulares en los Equipos inyecta visualmente los campos extra (`isMvp` + "píldora" de votos `[# v.]`).
*   La corona dorada (`👑`) tiene comportamiento dinámico: parpadea (`animate-pulse`/`animate-bounce`) mientras la votación está abierta indicando un evento en curso, pero se vuelve una insignia permanente estática (`drop-shadow-sm`) una vez que el MVP ha sido definido oficialmente (es decir, cuando la votación se cierra).

### 2.4 Notificaciones Push de MVP (FCM)
*   Se implementó una arquitectura **Reactiva (Client-Triggered)** en lugar de un Cronjob constante en el servidor.
*   El componente React (`app/join/[id]/page.tsx`) posee un listener (`useEffect`) que detecta el momento exacto en el que el cliente evalúa que `votingClosed === true`.
*   Si la notificación no fue enviada aún (`!match.remindersSent?.mvp`), el cliente hace un PING silencioso a Cloud Functions (`triggerMvpNotification`).
*   La Cloud Function `sendMvpWinnerNotification` no confía ciegamente: vuelve a descargar los datos vía Transacción de Firestore, realiza la matemática de cierre nuevamente de forma estricta por seguridad, y extrae a los ganadores.
*   Crea y despacha tres posibles arrays de notificaciones personalizadas (multicast) dependiendo de si el dispositivo pertenece al **Ganador Único**, a los **Ganadores en Empate**, o al **Resto de Participantes**. Finalmente graba la bandera de idempotencia `remindersSent.mvp: true` para sellar envíos futuros.
