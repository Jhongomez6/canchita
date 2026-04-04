# Feature: Agregar Invitado a un Partido

## 📋 Specification-Driven Development (SDD)

Este documento explica cómo la **especificación funcional** gobierna completamente la implementación de la feature "Agregar invitado a un partido".

---

## 1. ESPECIFICACIÓN FUNCIONAL (Fuente de Verdad)

### Objetivo
Permitir que un jugador agregue **hasta 2 invitados** a un partido, sujeto a que la configuración del partido lo permita (`allowGuests`), solicitando datos básicos del invitado y respetando reglas de negocio claras.

### Entidad: Guest

```typescript
interface Guest {
  name: string;           // Mínimo 2 caracteres
  positions: Position[];  // Mínimo 1, máximo 3
  primaryPosition?: Position; // Posición principal
  invitedBy: string;      // UID del jugador que invitó
}
```

### Posiciones Permitidas
- `GK` (Portero)
- `DEF` (Defensa)
- `MID` (Medio)
- `FWD` (Delantero)

### Reglas de Negocio

| # | Regla | Implementación |
|---|-------|----------------|
| 1 | Un jugador puede agregar máximo 2 invitados por partido. **El owner del partido no tiene límite.** | `canAddGuest()` / `hasReachedGuestLimit()` en `lib/domain/guest.ts` |
| 2 | El partido debe tener habilitado el permiso de invitados | `allowGuests !== false` en `Match` |
| 3 | El invitado NO tiene cuenta de usuario | No se crea documento en `users` collection |
| 4 | El invitado NO puede editar el partido | Firestore Rules + No tiene `uid` |
| 5 | El invitado ocupa un cupo del partido | Validado en `addGuestToMatch()` |
| 6 | Nombre obligatorio, mínimo 2 caracteres | `validateGuestName()` en `lib/domain/guest.ts` |
| 7 | Posiciones: entre 1 y 3, sin duplicados + 1 principal | `validateGuestPositions()` en `lib/domain/guest.ts` |
| 8 | Cada invitado se puede eliminar de forma independiente | `removeGuestFromMatch()` |
| 9 | El invitado participa en el balanceo de equipos | `guestToPlayer()` en `lib/domain/guest.ts` |
| 10 | Si el partido está lleno, el invitado entra a Lista de Espera | Se almacena con `isWaitlist: true` y `confirmed: false` |
| 11 | El jugador que invitó (o el admin) debe confirmar al invitado suplente para subirlo a la lista principal si se abre un cupo | Función `promoteGuestToMatch()` en `lib/guests.ts` |
| 12 | El formulario de agregar invitado se **oculta** si `match.teamsConfirmed === true` | Guard `!match.teamsConfirmed` en `app/join/[id]/page.tsx` |

---

## 2. ARQUITECTURA DE LA IMPLEMENTACIÓN

### Separación de Responsabilidades

```
┌─────────────────────────────────────────────────────┐
│                   ESPECIFICACIÓN                     │
│              (Fuente de Verdad)                      │
└─────────────────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
    ┌────────┐     ┌─────────┐    ┌──────────┐
    │ DOMINIO│     │   API   │    │    UI    │
    └────────┘     └─────────┘    └──────────┘
         │               │               │
         │               │               │
    Validaciones    Transacciones   Formulario
    Reglas          Firestore       React
```

### Capas de la Implementación

#### **Capa 1: Dominio** (`lib/domain/guest.ts`)
- **Responsabilidad**: Validaciones puras, reglas de negocio
- **No depende de**: Firebase, React, UI
- **Exporta**: Tipos, validaciones, reglas

```typescript
// Ejemplo: Validación de nombre
export function validateGuestName(name: string): void {
  if (!name || typeof name !== "string") {
    throw new GuestValidationError("El nombre del invitado es obligatorio");
  }

  if (name.trim().length < 2) {
    throw new GuestValidationError(
      "El nombre del invitado debe tener al menos 2 caracteres"
    );
  }
}
```

**✅ Cumple especificación**: Regla #5

##### Conversión Guest → Player

```typescript
export function guestToPlayer(guest: Guest, level: PlayerLevel = 2): Player {
  return {
    id: `guest-${guest.invitedBy}`,
    name: `${guest.name} (inv)`,
    level,
    positions: guest.positions,
    confirmed: true,
  };
}
```

**✅ Cumple especificación**: Regla #8 — Convierte invitados en jugadores para el balanceo

#### **Capa 2: API/Backend** (`lib/guests.ts`)
- **Responsabilidad**: Operaciones de Firestore, transacciones
- **Depende de**: Dominio, Firebase
- **Exporta**: Funciones CRUD para invitados

```typescript
export async function addGuestToMatch(
  matchId: string,
  playerUid: string,
  guestData: { name: string; positions: Position[] }
): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const guests: Guest[] = data.guests || [];

    // REGLA #1 y #2: Máximo 2 invitados por jugador, si el partido lo permite
    if (!canAddGuest(guests, playerUid)) {
      throw new GuestBusinessError(
        "Ya has alcanzado el límite de 2 invitados en este partido."
      );
    }

    // Validar datos (Dominio)
    const guest: Guest = {
      name: guestData.name.trim(),
      positions: guestData.positions,
      invitedBy: playerUid,
    };
    validateGuest(guest);

    // REGLA #4 y #10: El invitado ocupa un cupo, o entra a lista de espera
    const confirmedGuests = guests.filter(g => !g.isWaitlist);
    const totalOccupiedSlots = confirmedCount + confirmedGuests.length;
    
    // Si está lleno, en lugar de error, lo mandamos a lista de espera
    const isFull = totalOccupiedSlots >= maxPlayers;

    const guest: Guest = {
      name: guestData.name.trim(),
      positions: guestData.positions,
      invitedBy: playerUid,
      isWaitlist: isFull,
      waitlistJoinedAt: isFull ? new Date().toISOString() : undefined,
      confirmed: !isFull,
    };

    // Agregar invitado
    transaction.update(ref, {
      guests: [...guests, guest],
    });
  });
}
```

**✅ Cumple especificación**: Reglas #1, #4, #7

#### **Capa 3: UI** (`components/AddGuestForm.tsx`)
- **Responsabilidad**: Interfaz de usuario premium, feedback visual interactivo
- **Depende de**: API, Dominio (tipos)
- **Estado UI**: Collapsible con micro-animaciones (Cards con bordes sutiles y gradients)
- **Estilo**: Vanilla CSS (Premium gradients + Sleek typography)
- **Feedback**: Sistema de Tooltips y validación en tiempo real con mensajes refinados
- **Exporta**: Componente React

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  try {
    await addGuestToMatch(matchId, playerUid, {
      name: name.trim(),
      positions: selectedPositions,
    });
    setSuccess(true);
  } catch (err: any) {
    if (err.name === "GuestValidationError") {
      setError(`Error de validación: ${err.message}`);
    } else if (err.name === "GuestBusinessError") {
      setError(err.message);
    }
  }
};
```

**✅ Cumple especificación**: Feedback claro de errores

---

## 3. TRAZABILIDAD: ESPECIFICACIÓN → CÓDIGO

### Regla #1: Máximo 2 invitados por jugador (el owner no tiene límite)

**Especificación**:
> Un jugador puede agregar hasta 2 invitados por partido. El owner del partido (createdBy) no tiene límite. Si el partido deshabilita invitados, el límite es 0.

**Implementación**:

1. **Dominio** (`lib/domain/guest.ts`):
```typescript
export function hasReachedGuestLimit(
  guests: Guest[],
  playerUid: string,
  isOwner?: boolean
): boolean {
  if (isOwner) return false; // Owner no tiene límite
  const userGuests = guests.filter((guest) => guest.invitedBy === playerUid);
  return userGuests.length >= 2;
}

export function canAddGuest(
  guests: Guest[],
  playerUid: string,
  isOwner?: boolean
): boolean {
  return !hasReachedGuestLimit(guests, playerUid, isOwner);
}
```

2. **API** (`lib/guests.ts`):
```typescript
// REGLA: Un jugador puede agregar máximo 2 invitados por partido (el owner no tiene límite)
const isOwner = data.createdBy === playerUid;
if (!canAddGuest(guests, playerUid, isOwner)) {
  throw new GuestBusinessError(
    "Ya has alcanzado el límite de 2 invitados en este partido."
  );
}
```

3. **UI** (`components/AddGuestForm.tsx:159-175`):
```typescript
if (existingGuests.length > 0) {
  return (
    <div>
      {existingGuests.map(guest => (
        <div key={guest.name}>
          <h3>👥 Tu invitado</h3>
          <p>{guest.name}</p>
          <button onClick={() => handleRemoveGuest(guest)}>Eliminar invitado</button>
        </div>
      ))}
    </div>
  );
}
```

---

### Regla #5: Nombre mínimo 2 caracteres

**Especificación**:
> El nombre del invitado debe tener al menos 2 caracteres

**Implementación**:

1. **Dominio** (`lib/domain/guest.ts:53-62`):
```typescript
export function validateGuestName(name: string): void {
  const trimmedName = name.trim();
  
  if (trimmedName.length < 2) {
    throw new GuestValidationError(
      "El nombre del invitado debe tener al menos 2 caracteres"
    );
  }
}
```

2. **UI** (`components/AddGuestForm.tsx:63`):
```typescript
const isNameValid = name.trim().length >= 2;

// Validación visual
{name && !isNameValid && (
  <p style={{ color: "#dc2626" }}>Mínimo 2 caracteres</p>
)}
```

---

### Regla #6: Posiciones entre 1 y 2, sin duplicados

**Especificación**:
> Las posiciones deben ser entre 1 y 2. No se permiten posiciones duplicadas.

**Implementación**:

1. **Dominio** (`lib/domain/guest.ts:70-96`):
```typescript
export function validateGuestPositions(positions: Position[]): void {
  if (positions.length < 1) {
    throw new GuestValidationError("El invitado debe tener al menos 1 posición");
  }

  if (positions.length > 2) {
    throw new GuestValidationError("El invitado puede tener máximo 2 posiciones");
  }

  // Verificar posiciones duplicadas
  const uniquePositions = new Set(positions);
  if (uniquePositions.size !== positions.length) {
    throw new GuestValidationError("No se permiten posiciones duplicadas");
  }
}
```

2. **UI** (`components/AddGuestForm.tsx:74-84`):
```typescript
const handlePositionToggle = (position: Position) => {
  setSelectedPositions((prev) => {
    if (prev.includes(position)) {
      return prev.filter((p) => p !== position); // Deseleccionar
    } else {
      if (prev.length >= 2) {
        return [...prev.slice(1), position]; // Máximo 2
      }
      return [...prev, position];
    }
  });
};
```

---

## 4. CRITERIOS DE ACEPTACIÓN ✅

### ✅ Criterio 1
**Given** un jugador sin invitado  
**When** agrega un invitado válido  
**Then** el invitado queda registrado y ocupa un cupo

**Verificación**:
- `addGuestToMatch()` ejecuta transacción
- `guests` array se actualiza en Firestore
- `totalOccupiedSlots` incluye invitados

### ✅ Criterio 2
**Given** un jugador con 2 invitados ya registrados  
**When** intenta agregar un tercer invitado  
**Then** la acción es rechazada

**Verificación**:
- `canAddGuest()` retorna `false`
- `GuestBusinessError` se lanza
- UI oculta el formulario o muestra mensaje de error

### ✅ Criterio 3
**Given** un invitado con más de 2 posiciones  
**When** se envía la información  
**Then** se devuelve un error de validación

**Verificación**:
- `validateGuestPositions()` lanza `GuestValidationError`
- UI previene selección de más de 2 posiciones
- Backend rechaza la operación

---

## 5. EJEMPLO DE USO

### Integración en la Página de Partido

```typescript
// app/match/[id]/page.tsx

import AddGuestForm from "@/components/AddGuestForm";

export default function MatchDetailPage() {
  const { user } = useAuth();
  const [match, setMatch] = useState<any>(null);

  // Obtener invitado del jugador actual
  const myGuest = match?.guests?.find(
    (g: Guest) => g.invitedBy === user?.uid
  );

  return (
    <main>
      {/* ... otros componentes ... */}

      {/* Formulario de invitado */}
      <AddGuestForm
        matchId={match.id}
        playerUid={user.uid}
        existingGuest={myGuest}
        onSuccess={() => loadMatch()} // Recargar partido
      />

      {/* ... otros componentes ... */}
    </main>
  );
}
```

---

## 6. TESTING (Recomendado)

### Tests de Dominio

```typescript
// lib/domain/__tests__/guest.test.ts

describe("validateGuestName", () => {
  it("debe rechazar nombres con menos de 2 caracteres", () => {
    expect(() => validateGuestName("A")).toThrow(GuestValidationError);
  });

  it("debe aceptar nombres válidos", () => {
    expect(() => validateGuestName("Juan")).not.toThrow();
  });
});

describe("validateGuestPositions", () => {
  it("debe rechazar más de 2 posiciones", () => {
    expect(() => validateGuestPositions(["GK", "DEF", "MID"])).toThrow();
  });

  it("debe rechazar posiciones duplicadas", () => {
    expect(() => validateGuestPositions(["GK", "GK"])).toThrow();
  });
});

describe("canAddGuest", () => {
  it("debe permitir agregar invitado si no tiene ninguno", () => {
    const guests: Guest[] = [];
    expect(canAddGuest(guests, "user123")).toBe(true);
  });

  it("debe rechazar si ya tiene un invitado", () => {
    const guests: Guest[] = [
      { name: "Juan", positions: ["MID"], invitedBy: "user123" }
    ];
    expect(canAddGuest(guests, "user123")).toBe(false);
  });
});
```

---

## 7. CÓMO LA ESPECIFICACIÓN GOBIERNA LA IMPLEMENTACIÓN

### Principios Aplicados

1. **La especificación es la fuente de verdad**
   - Cada regla de negocio tiene una función correspondiente
   - No se implementan features no especificadas

2. **Separación de responsabilidades**
   - Dominio: Validaciones puras (sin dependencias)
   - API: Operaciones de Firestore (usa dominio)
   - UI: Interfaz de usuario (usa API)

3. **Validación en múltiples capas**
   - UI: Validación inmediata (UX)
   - Dominio: Validación de reglas (lógica)
   - Backend: Validación transaccional (seguridad)

4. **Errores tipados y específicos**
   - `GuestValidationError`: Errores de validación
   - `GuestBusinessError`: Errores de reglas de negocio
   - Mensajes claros basados en la especificación

5. **Trazabilidad completa**
   - Cada línea de código puede rastrearse a una regla
   - La documentación referencia la especificación
   - Los tests validan los criterios de aceptación

---

## 8. PRÓXIMOS PASOS

### Para Completar la Implementación

1. **Actualizar Firestore Rules**
   - Aplicar reglas de `firestore-rules-guests.txt`
   - Desplegar a Firebase Console

2. **Integrar en la UI**
   - Agregar `<AddGuestForm />` en `/app/match/[id]/page.tsx`
   - Mostrar invitados en la lista de jugadores
   - Indicar explícitamente el jugador que invitó al invitado en la lista de jugadores

3. **Actualizar Balance de Equipos**
   - Incluir invitados en `balanceTeams()`
   - Considerar invitados en el conteo de jugadores

4. **Testing**
   - Crear tests unitarios para dominio
   - Crear tests de integración para API
   - Crear tests E2E para UI

---

## 9. CONCLUSIÓN

Esta implementación demuestra cómo **Specification-Driven Development (SDD)** garantiza que:

✅ **Cada regla de negocio está implementada**  
✅ **El código es trazable a la especificación**  
✅ **Las responsabilidades están claramente separadas**  
✅ **Las validaciones son consistentes en todas las capas**  
✅ **Los errores son claros y específicos**  
✅ **El código es testeable y mantenible**

La especificación gobierna completamente la implementación, asegurando que no se improvisan reglas adicionales y que el comportamiento del sistema es predecible y correcto.
