# Feature: Buscar / Explorar Partidos (Explore Matches)

## 📋 Specification-Driven Development (SDD)

Sistema para descubrir y unirse a partidos públicos abiertos, y sistema para utilizar códigos de invitación privados (Links para ingreso directo al partido).

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo
Proveer un componente central para que los jugadores (incluso aquellos sin partidos asignados próximos) puedan encontrar partidos públicos `open` y con cupos disponibles; o puedan ingresar a la fuerza un código de invitación privado (`matchId`) si les compartieron el acceso de manera paralela.

### Reglas de Negocio Implementadas

| # | Regla | Estado |
|---|---|---|
| 1 | URL de Búsqueda | La página oficial es `/explore`. |
| 2 | Redirección Empty State | Home redirige a `/explore` cuando un usuario toca "Buscar partidos". |
| 3 | Input Código Privado | Proporciona un `input` de texto. Al recibir el ID y presionar "Ir", envía a `/join/[id]`. |
| 4 | Visibilidad de Partidos | La lista solo consulta e itera partidos cuyo `status` es estrictamente igual a `open`. |
| 5 | Filtro de Fecha | Se omiten los partidos del pasado. Los partidos se filtran en tiempo de ejecución de cliente validando que `matchDate > nowDate`. |
| 6 | Ordenamiento Temporal | El listado final siempre está ordenado cronológicamente (el partido más pronto de primero). |
| 7 | Etiquetas de Cupo | Renderiza automáticamente cuántos cupos le quedan al partido o si el partido está "`Lleno`" superponiéndose en el diseño de `MatchCard`. |
| 8 | BottomNav Integration | El botón de la lupa en el `BottomNav` es el acceso directo general hacia `/explore`. |

---

## 2. ARQUITECTURA TÉCNICA

### 2.1 API & Firebase (`lib/matches.ts`)
*   Se agregó la función `getOpenMatches()`:
    *   Usa `where("status", "==", "open")` sobre Firestore localmente.
    *   Filtra en la respuesta en memoria las fechas obsoletas parseando `<YYYY-MM-DD>T<HH:mm>:00-05:00`.
    *   Aplica `array.sort()` basado en milisegundos.

### 2.2 Modelado de Dominio (`lib/domain/match.ts`)
*   No hubo cambios en el modelo. Se re-utilizaron las interfaces `Match` y `Location` existentes.

### 2.3 UI Components (`app/explore/page.tsx` & `components/BottomNav.tsx`)
*   **Explore Page**: Renderiza SSR y ejecuta `useEffect` para cargar `getOpenMatches()` y luego los respectivos detalles de la sede `Location` (db locations) requeridos para el `MatchCard`.
*   **Gestión de Estados**: Utiliza un Skeleton Loader nativo mientras solicita datos a Firebase.
*   **MatchCard Integration**: Re-utiliza el `<MatchCard/>`, inyectando sobre el mismo un div condicional absoluto indicando capacidad (Lleno/Disponibilidad).
*   **BottomNav**: `<Link>` agregado entre "Inicio" y "Perfil" (o Ranking/Usuarios para admins).

---

## 3. COMPORTAMIENTO ESPERADO (User Journeys)

### Flujo 1: Ingreso a través de Código Privado
**Given** que el usuario recibe el código `abc123xd` por WhatsApp.
**When** el usuario navega a "Buscar" (Lupa) y lo prega en la sección *🔐 Código de invitación*.
**Then** pulsa Enter o el botón "Ir", y la App ejecuta `router.push('/join/abc123xd')` directo a la página de Confirmación.

### Flujo 2: El Partido Público se Llenó
**Given** que un partido abierto alcanza la capacidad de `maxPlayers`.
**When** cualquier usuario ingresa a `/explore`.
**Then** el partido sigue listado, pero se muestra con un Badge alert "Lleno" en la tarjeta, de esa manera sigue estando al tanto del evento aunque ya no haya lugares garantizados para el.

### Flujo 3: Primer ingreso a Canchita
**Given** un jugador que recién pasó el onboarding `initialRatingCalculated == true`.
**When** el sistema detecta que no tiene `matches` a la vista en su iteración de Inicio.
**Then** su dashboard muestra la tarjeta vacía con un link "Buscar partidos", logrando redirigirlo exitosamente y orgánicamente a `/explore`.
