# Feature: Roles de Administrador (Admin Tiers)

## 📋 Specification-Driven Development (SDD)

Sistema de roles granulares que permite diferenciar tres niveles de administración: **Super Admin** (dueño de la plataforma), **Location Admin** (dueño de cancha) y **Team Admin** (organizador de equipo amateur). Cada tier tiene permisos específicos sobre la creación de partidos y gestión de locations.

---

## 1. ESPECIFICACIÓN FUNCIONAL (Fuente de Verdad)

### Objetivo
Escalar el modelo de permisos de la app desde un único rol "admin" hacia un sistema de tiers que soporte:
- Dueños de canchas que crean partidos públicos para atraer jugadores
- Organizadores de equipos que crean partidos privados para gestionar sus jugadas
- Un super administrador con control total de la plataforma

### Entidad: AdminType

```typescript
export type AdminType = "super_admin" | "location_admin" | "team_admin";
```

### Extensión de UserProfile

```typescript
export interface UserProfile {
  // ... campos existentes ...
  adminType?: AdminType;           // Tier del admin (solo relevante si roles incluye "admin")
  assignedLocationIds?: string[];   // IDs de locations donde puede operar
}
```

### Reglas de Negocio

| # | Regla | Implementación |
|---|-------|----------------|
| 1 | Existen 3 tiers de admin: super_admin, location_admin, team_admin | `AdminType` union type en `lib/domain/user.ts` |
| 2 | Super Admin tiene acceso total a la plataforma (CRUD partidos, canchas, usuarios, roles) | `isSuperAdmin()` en `lib/domain/user.ts` |
| 3 | Location Admin puede crear partidos **públicos y privados** en sus locations asignadas | `canCreatePublicMatch()` + `canManageLocation()` |
| 4 | Team Admin solo puede crear partidos **privados** en sus locations asignadas | `isTeamAdmin()` + forzar `isPrivate = true` en UI |
| 5 | Un admin puede tener asignadas múltiples locations | `assignedLocationIds: string[]` en `UserProfile` |
| 6 | Super Admin puede operar en **cualquier** location sin restricción | `canManageLocation()` retorna `true` siempre para super_admin |
| 7 | Solo Super Admin puede asignar roles, tiers y locations a otros usuarios | Verificación en UI + Firestore Rules |
| 8 | Un Team Admin puede también ser Player simultáneamente | `roles: ["admin", "player"]` con `adminType: "team_admin"` |
| 13 | Team Admin puede LEER cualquier partido en Firestore | `isTeamAdmin()` helper en `firestore.rules` — necesario para `/join/[id]` como jugador y para mostrar access-denied elegante en `/match/[id]` |
| 9 | Solo Super Admin puede crear nuevas canchas (locations) | `createLocation()` protegido por `isSuperAdmin()` |
| 10 | Solo Super Admin puede acceder a Ranking y Feedback | Verificación en `admin/ranking` y `admin/feedback` |
| 11 | Location/Team Admin solo puede editar partidos que él creó | `match.createdBy === profile.uid` en UI |
| 12 | Super Admin puede editar cualquier partido | Sin restricción de `createdBy` |

---

## 2. ARQUITECTURA DE LA IMPLEMENTACIÓN

### Jerarquía de Permisos

```
┌─────────────────────────────────────────────────┐
│              🏆 SUPER ADMIN                      │
│  ✅ Todo: CRUD partidos, canchas, usuarios       │
│  ✅ Asignar roles y locations                    │
│  ✅ Ranking, Feedback, Panel de usuarios         │
├─────────────────────────────────────────────────┤
│           🏟️ LOCATION ADMIN                      │
│  ✅ Crear partidos públicos y privados           │
│  ⚠️ Solo en locations asignadas                  │
│  ❌ No puede crear canchas ni gestionar usuarios │
├─────────────────────────────────────────────────┤
│            👥 TEAM ADMIN                         │
│  ✅ Crear partidos privados                      │
│  ✅ Puede ser Player simultáneamente             │
│  ⚠️ Solo en locations asignadas                  │
│  ❌ No puede crear partidos públicos             │
│  ❌ No puede crear canchas ni gestionar usuarios │
└─────────────────────────────────────────────────┘
```

### Capas

#### **Capa 1: Dominio** (`lib/domain/user.ts`)

```typescript
export type AdminType = "super_admin" | "location_admin" | "team_admin";

export function isSuperAdmin(profile: UserProfile): boolean {
  return isAdmin(profile) && profile.adminType === "super_admin";
}

export function isLocationAdmin(profile: UserProfile): boolean {
  return isAdmin(profile) && profile.adminType === "location_admin";
}

export function isTeamAdmin(profile: UserProfile): boolean {
  return isAdmin(profile) && profile.adminType === "team_admin";
}

export function canCreatePublicMatch(profile: UserProfile): boolean {
  return isSuperAdmin(profile) || isLocationAdmin(profile);
}

export function canManageLocation(profile: UserProfile, locationId: string): boolean {
  if (isSuperAdmin(profile)) return true;
  return profile.assignedLocationIds?.includes(locationId) ?? false;
}
```

**✅ Cumple especificación**: Reglas #1–#6

#### **Capa 2: API** (`lib/matches.ts`, `lib/locations.ts`, `lib/users.ts`)

- `createMatch()` — valida permisos de tier y location scope antes de insertar
- `getAdminLocations(profile)` — devuelve solo las locations que el admin tiene asignadas (o todas si es super_admin)
- `createLocation()` — protegido, solo super_admin
- `assignAdminType()` / `assignLocationsToAdmin()` — gestión de asignaciones (solo super_admin)

**✅ Cumple especificación**: Reglas #3, #4, #5, #7, #9

#### **Capa 3: UI**

- `app/new-match/page.tsx` — filtra locations y fuerza `isPrivate` según tier
- `app/admin/users/page.tsx` — panel de gestión de roles/locations (solo super_admin)
- `app/match/[id]/page.tsx` — edición scoped por `createdBy` (o sin restricción para super_admin)
- `components/BottomNav.tsx` — oculta "Usuarios" si no es super_admin
- `components/Header.tsx` — badge visual del tier
- `app/admin/ranking/page.tsx`, `app/admin/feedback/page.tsx` — solo super_admin

**✅ Cumple especificación**: Reglas #7, #10, #11, #12

---

## 3. TRAZABILIDAD: ESPECIFICACIÓN → CÓDIGO

### Regla #4: Team Admin solo partidos privados

1. **Dominio**: `canCreatePublicMatch(profile)` retorna `false` para team_admin
2. **UI** (`app/new-match/page.tsx`): Si `isTeamAdmin(profile)` → `isPrivate = true` y toggle deshabilitado
3. **API**: `createMatch()` valida coherencia tier ↔ isPrivate

### Regla #5: Múltiples locations asignadas

1. **Dominio**: `assignedLocationIds: string[]` en `UserProfile`
2. **API**: `getAdminLocations(profile)` filtra por `assignedLocationIds`
3. **UI** (`app/new-match/page.tsx`): Dropdown solo muestra locations asignadas

### Regla #7: Solo Super Admin asigna roles

1. **Dominio**: `isSuperAdmin(profile)` verifica antes de permitir operación
2. **API** (`lib/users.ts`): `assignAdminType()` verifica super_admin
3. **Firestore Rules**: `update` de `adminType`, `assignedLocationIds` solo por super_admin
4. **UI** (`app/admin/users/page.tsx`): Solo renderiza panel si `isSuperAdmin()`

---

## 4. CRITERIOS DE ACEPTACIÓN ✅

### Criterio 1
**Given** un usuario con `adminType: "team_admin"`
**When** accede a `/new-match`
**Then** solo ve locations asignadas y el toggle de visibilidad está forzado en "Privado"

### Criterio 2
**Given** un usuario con `adminType: "location_admin"`
**When** accede a `/new-match`
**Then** solo ve locations asignadas pero puede elegir entre público y privado

### Criterio 3
**Given** un usuario con `adminType: "super_admin"`
**When** accede a `/new-match`
**Then** ve todas las locations activas y puede crear cualquier tipo de partido

### Criterio 4
**Given** un Team Admin que también es Player
**When** accede a la app
**Then** puede crear partidos privados Y participar como jugador en otros partidos

### Criterio 5
**Given** un Location Admin
**When** intenta acceder a `/admin/users` o `/admin/ranking` o `/admin/feedback`
**Then** es redirigido porque no tiene permisos de Super Admin

### Criterio 6
**Given** un Super Admin
**When** accede a `/admin/users`
**Then** puede asignar `adminType` y `assignedLocationIds` a cualquier usuario con rol admin

### Criterio 7
**Given** un Team Admin o Location Admin
**When** intenta editar un partido que **no** creó
**Then** la edición está bloqueada (no tiene permisos)

### Criterio 8
**Given** un Super Admin
**When** accede al detalle de cualquier partido
**Then** puede editarlo sin restricción de `createdBy`

### Criterio 9
**Given** un Team Admin que también es Player
**When** accede a `/join/[id]` de un partido que NO creó
**Then** puede ver la página y unirse como jugador sin error de permisos de Firestore

### Criterio 10
**Given** un Team Admin que también es Player
**When** accede a `/match/[id]` de un partido que NO creó
**Then** ve pantalla "Sin permisos de administración" con enlace a la vista de jugador (`/join/[id]`)

---

## 5. ARCHIVOS INVOLUCRADOS

| Capa | Archivo | Responsabilidad |
|------|---------|----------------|
| Dominio | `lib/domain/user.ts` | AdminType, helpers de permisos |
| API | `lib/matches.ts` | createMatch() con validación de tier |
| API | `lib/locations.ts` | getAdminLocations() scoped |
| API | `lib/users.ts` | Asignación de admin type y locations |
| Seguridad | `firestore.rules` | `isSuperAdmin()`, `isTeamAdmin()`, protección de campos sensibles, lectura granular de partidos |
| UI | `app/new-match/page.tsx` | Creación de partido scoped por tier |
| UI | `app/admin/users/page.tsx` | Panel de gestión de admins (super_admin only) |
| UI | `app/match/[id]/page.tsx` | Edición scoped por createdBy/tier |
| UI | `components/BottomNav.tsx` | Nav condicional por tier |
| UI | `components/Header.tsx` | Badge de tier visual |
| UI | `app/admin/ranking/page.tsx` | Acceso solo super_admin |
| UI | `app/admin/feedback/page.tsx` | Acceso solo super_admin |

---

## 6. CONCLUSIÓN

✅ **Tres tiers de admin** bien diferenciados con permisos granulares
✅ **Location scoping** mediante `assignedLocationIds` en el perfil
✅ **Team Admin dual-role** puede ser player y admin simultáneamente
✅ **Super Admin** con control total de la plataforma
✅ **Funciones de dominio puras** para verificación de permisos (`isSuperAdmin`, `canCreatePublicMatch`, `canManageLocation`)
✅ **Firestore Rules** reforzadas con `isSuperAdmin()` para campos sensibles
✅ **Trazabilidad completa** de cada regla de negocio
