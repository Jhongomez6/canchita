# Feature: Control de Acceso a Página de Partido (/match/[id])

## 📋 Specification-Driven Development (SDD)

Sistema de control de acceso granular que restringe qué admins pueden ver la página de administración de un partido (`/match/[id]`) según el tier del creador, la location del partido y su visibilidad (público/privado). Se implementa en dos capas: frontend (dominio puro) y Firestore Rules (seguridad a nivel de base de datos).

---

## 1. ESPECIFICACIÓN FUNCIONAL (Fuente de Verdad)

### Objetivo
Restringir la visibilidad de la página admin de partidos para que cada admin solo vea los partidos relevantes a su tier y locations asignadas. La página de join (`/join/[id]`) no se ve afectada y permanece abierta a cualquier usuario con el link.

### Campo desnormalizado: `creatorAdminType`

Se almacena el `adminType` del creador en el documento del partido al momento de creación. Esto evita un `get()` extra en Firestore Rules y simplifica la lógica de dominio.

```typescript
// En Match interface
creatorAdminType?: AdminType; // Tier del admin al crear el partido
```

### Reglas de Acceso

| # | Creador del partido | Quién puede ver `/match/[id]` |
|---|---------------------|-------------------------------|
| 1 | `team_admin` | Solo el creador + `super_admin` |
| 2 | `location_admin` | Creador + otros `location_admin` asignados a la misma `locationId` + `super_admin` |
| 3 | `super_admin` (privado) | Solo el `super_admin` creador |
| 4 | `super_admin` (público) | Creador + `location_admin` asignados a la misma `locationId` |
| 5 | Legacy (sin `creatorAdminType`) | Se trata como `super_admin` público (fallback más permisivo) |

### Reglas transversales

| # | Regla | Implementación |
|---|-------|----------------|
| 1 | `super_admin` siempre puede ver cualquier partido | Primera condición en `canViewMatchAdmin()` |
| 2 | El creador siempre puede ver su propio partido | Segunda condición en `canViewMatchAdmin()` |
| 3 | Un `location_admin` que puede VER un partido NO puede editarlo (solo ver) | `isOwner` sigue siendo `createdBy === uid \|\| isSuperAdmin()` |
| 4 | `/join/[id]` no tiene restricción de acceso | Sin cambios en la página de join |
| 5 | Acceso denegado muestra pantalla informativa con enlace a `/join/[id]` | Indica "Sin permisos de administración" y ofrece unirse como jugador |
| 6 | `team_admin` puede LEER cualquier partido en Firestore | Necesario para `/join/[id]` (como jugador) y para que `/match/[id]` muestre acceso denegado de forma elegante en vez de error de Firebase |

---

## 2. FUNCIÓN DE DOMINIO

```typescript
// lib/domain/match.ts
export function canViewMatchAdmin(
    viewerProfile: UserProfile,
    match: { createdBy: string; locationId: string; isPrivate?: boolean; creatorAdminType?: AdminType }
): boolean
```

Lógica pura sin dependencias de Firebase ni React. Evalúa las 5 reglas de acceso en orden de prioridad.

---

## 3. SEGURIDAD EN DOS CAPAS

### Capa 1: Frontend (`app/match/[id]/page.tsx`)
- `useEffect` evalúa `canViewMatchAdmin()` cuando `profile` y `match` están disponibles
- Si deniega acceso, renderiza 404 en lugar del contenido del partido

### Capa 2: Firestore Rules (`firestore.rules`)
- Non-admins (jugadores) siempre pueden leer (necesario para `/join/[id]`)
- `team_admin` siempre puede leer cualquier partido (helper `isTeamAdmin()`) — su scope de administración se restringe client-side por `canViewMatchAdmin()`
- Admins restringidos con la misma lógica replicada en reglas de seguridad
- Helpers: `isLocationAdminFor(locationId)`, `isTeamAdmin()`, `isSuperAdmin()`

---

## 4. CRITERIOS DE ACEPTACIÓN

- [ ] Partido de `team_admin`: solo el creador y `super_admin` ven `/match/[id]`
- [ ] Partido de `location_admin`: otro `location_admin` de la misma location lo ve, uno de otra location no
- [ ] Partido público de `super_admin`: `location_admin` de la misma location lo ve
- [ ] Partido privado de `super_admin`: solo el super_admin creador lo ve
- [ ] Admin no autorizado ve pantalla "Sin permisos de administración" con botón a `/join/[id]`
- [ ] Jugador accede normalmente a `/join/[id]` sin cambios
- [ ] `team_admin` puede leer documentos de partido en Firestore (no recibe permission-denied)
- [ ] Partidos nuevos se crean con `creatorAdminType` del creador
- [ ] Partidos legacy (sin campo) siguen visibles con fallback permisivo

---

## 5. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---------|--------|
| `lib/domain/match.ts` | `creatorAdminType` en `Match` + `CreateMatchInput` + `canViewMatchAdmin()` |
| `lib/matches.ts` | Persistir `creatorAdminType` en `createMatch()` |
| `app/match/[id]/page.tsx` | Access check con `canViewMatchAdmin()` + render 404 |
| `firestore.rules` | Helpers `isLocationAdminFor()`, `isTeamAdmin()` + regla granular de lectura |
| `lib/domain/user.ts` | Referencia: helpers `isSuperAdmin()`, `isLocationAdmin()` existentes |
