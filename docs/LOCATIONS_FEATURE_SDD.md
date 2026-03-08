# Feature: Gestión de Ubicaciones/Canchas

## 📋 Specification-Driven Development (SDD)

Este documento explica cómo la **especificación funcional** gobierna la implementación de la feature "Gestión de Ubicaciones".

---

## 1. ESPECIFICACIÓN FUNCIONAL (Fuente de Verdad)

### Objetivo
Permitir que un administrador registre canchas usando Google Places API, validando duplicados, y que estas se usen como referencia al crear partidos.

### Entidad: Location

```typescript
interface Location {
  id: string;
  name: string;           // Nombre de la cancha
  address: string;        // Dirección completa
  lat: number;            // Latitud
  lng: number;            // Longitud
  active: boolean;        // Si está activa
}
```

### Reglas de Negocio

| # | Regla | Implementación |
|---|-------|----------------|
| 1 | Solo Super Admin puede crear canchas | Verificación de `isSuperAdmin()` en UI y Backend |
| 2 | No se permiten canchas duplicadas (mismo nombre) | `DuplicateLocationError` en `lib/locations.ts` |
| 3 | Datos de ubicación vienen de Google Places API | `app/locations/new/page.tsx` |
| 4 | Las canchas activas aparecen al crear partidos | `getActiveLocations()` en `lib/locations.ts` |

---

## 2. ARQUITECTURA DE LA IMPLEMENTACIÓN

```
┌─────────────────────────────────────────────────────┐
│                   ESPECIFICACIÓN                     │
└─────────────────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
    ┌────────┐     ┌─────────┐    ┌──────────┐
    │ DOMINIO│     │   API   │    │    UI    │
    └────────┘     └─────────┘    └──────────┘
    Location       Firestore      New Location
    Validaciones   CRUD ops       New Match (select)
```

### Capas

#### **Capa 1: Dominio** (`lib/domain/location.ts`)

```typescript
export interface Location {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  active: boolean;
}

export interface CreateLocationInput {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export function validateLocationName(name: string): void {
  if (!name || name.trim().length < 2) {
    throw new ValidationError("El nombre de la cancha debe tener al menos 2 caracteres");
  }
}
```

**✅ Cumple especificación**: Regla #2 (validación base)

#### **Capa 2: API** (`lib/locations.ts`)

```typescript
export async function addLocation(input: CreateLocationInput, createdBy: UserProfile): Promise<string> {
  if (!isSuperAdmin(createdBy)) {
    throw new Error("Solo los Super Admins pueden crear canchas.");
  }

  // Verificar duplicados
  const existing = await getDocs(
    query(collection(db, "locations"), where("name", "==", input.name))
  );
  if (!existing.empty) {
    throw new DuplicateLocationError("Ya existe una cancha con ese nombre");
  }
  // Crear
  const docRef = await addDoc(collection(db, "locations"), {
    ...input, active: true
  });
  return docRef.id;
}
```

**✅ Cumple especificación**: Reglas #2, #4

#### **Capa 3: UI**
1. **Creación** (`app/locations/new/page.tsx`):
   - Integración con Google Places Autocomplete API
   - Formulario con nombre, dirección auto-completada
   - Latitud/longitud extraídos automáticamente

2. **Visualización** (`app/match/[id]/page.tsx` y `app/join/[id]/page.tsx`):
   - **Accordion View**: Header con nombre de cancha y chevron rotativo.
   - **Interacción**: Click expande para mostrar mapa (iframe) y botones.
   - **Navegación**: Links directos a Waze/Maps.

**✅ Cumple especificación**: Regla #3

---

## 3. TRAZABILIDAD: ESPECIFICACIÓN → CÓDIGO

### Regla #2: No duplicados

1. **Dominio**: `DuplicateLocationError` en `lib/domain/errors.ts`
2. **API**: Query de verificación en `addLocation()`
3. **UI**: Captura error y muestra mensaje

### Regla #4: Canchas activas en selector

1. **API**: `getActiveLocations()` filtra `active: true`
2. **UI** (`app/new-match/page.tsx`): Dropdown con `locations.map(l => ...)`

---

## 4. CRITERIOS DE ACEPTACIÓN ✅

### ✅ Criterio 1
**Given** un admin
**When** busca una cancha por Google Places
**Then** el formulario se completa con nombre, dirección y coordenadas

### ✅ Criterio 2
**Given** una cancha con nombre ya existente
**When** el admin intenta agregarla
**Then** se muestra error de duplicado

---

## 5. ARCHIVOS INVOLUCRADOS

| Capa | Archivo | Responsabilidad |
|------|---------|----------------|
| Dominio | `lib/domain/location.ts` | Location, CreateLocationInput, validaciones |
| Dominio | `lib/domain/errors.ts` | DuplicateLocationError |
| API | `lib/locations.ts` | CRUD Firestore |
| API | `lib/maps.ts` | Helpers Google Maps/Waze |
| UI | `app/locations/new/page.tsx` | Formulario con Places API |
| UI | `app/new-match/page.tsx` | Selector de canchas |

---

## 6. CONCLUSIÓN

✅ **Google Places API integrado** para autocompletado
✅ **Validación de duplicados** en capa API con error tipado
✅ **Tipos de dominio** compartidos entre API y UI
✅ **Canchas reutilizables** en creación de partidos
