# Feature: Usuarios y Autenticación

## 📋 Specification-Driven Development (SDD)

Este documento explica cómo la **especificación funcional** gobierna la implementación de la feature "Usuarios y Autenticación".

---

## 1. ESPECIFICACIÓN FUNCIONAL (Fuente de Verdad)

### Objetivo
Gestionar usuarios con autenticación Google, perfiles con roles y posiciones, y notificaciones push.

### Entidad: UserProfile

```typescript
interface UserProfile {
  uid: string;              // Firebase Auth UID
  name: string;             // Nombre del jugador (editable)
  role: "admin" | "player"; // Rol del usuario
  positions?: Position[];   // 1-2 posiciones de juego
  stats?: UserStats;        // Estadísticas de partidos
  nameLastChanged?: string; // ISO timestamp del último cambio de nombre
  notificationsEnabled?: boolean;
}
```

### Reglas de Negocio

| # | Regla | Implementación |
|---|-------|----------------|
| 1 | Login exclusivamente con Google | `loginWithGoogle()` en `lib/auth.ts` |
| 2 | Roles: "admin" o "player" | `UserRole` type en `lib/domain/user.ts` |
| 3 | Solo admin accede a panel de gestión | `isAdmin()` en `lib/domain/user.ts` |
| 4 | Perfil debe tener al menos 1 posición | Redirect en `AuthGuard.tsx` |
| 5 | Máximo 2 posiciones por jugador | Validación en profile page |
| 6 | Admin puede eliminar usuarios | `deleteUser()` en `lib/users.ts` |
| 7 | Jugador puede editar su nombre | `updateUserName()` en `lib/users.ts` |
| 8 | Cambio de nombre solo cada 30 días | `nameLastChanged` + cooldown en profile page |

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
    UserProfile    Firestore      AuthGuard
    UserRole       Auth ops       Profile Page
    isAdmin()      CRUD users     Admin Panel
```

### Capas

#### **Capa 1: Dominio** (`lib/domain/user.ts`)

```typescript
export type UserRole = "admin" | "player";

export interface UserProfile {
  uid: string;
  name: string;
  role: UserRole;
  positions?: Position[];
  notificationsEnabled?: boolean;
}

export function isAdmin(profile: UserProfile): boolean {
  return profile.role === "admin";
}
```

**✅ Cumple especificación**: Reglas #2, #3

#### **Capa 2: API** (`lib/users.ts`)

```typescript
export async function getUserProfile(uid: string): Promise<UserProfile | null>
export async function getAllUsers(): Promise<UserProfile[]>
export async function updateUserPositions(uid: string, positions: Position[]): Promise<void>
export async function updateUserName(uid: string, name: string): Promise<void>
export async function deleteUser(uid: string): Promise<void>
```

**✅ Cumple especificación**: Reglas #4, #6, #7

#### **Capa 3: UI**
- `components/AuthGuard.tsx` — Protege rutas, redirige a `/profile` si incompleto
- `app/profile/page.tsx` — Edición de nombre (con cooldown 30d), posiciones, y visualización de estadísticas (PJ/PG/PE/PP)
- `app/admin/users/page.tsx` — Panel admin con lista de usuarios tipada `UserProfile[]`

**✅ Cumple especificación**: Reglas #3, #4, #5, #7, #8

---

## 3. TRAZABILIDAD: ESPECIFICACIÓN → CÓDIGO

### Regla #3: Solo admin accede a gestión

1. **Dominio**: `isAdmin(profile)` en `lib/domain/user.ts`
2. **UI**: `AuthGuard.tsx` redirige si `role !== "admin"`
3. **UI**: `app/admin/users/page.tsx` verifica `profile.role === "admin"`

### Regla #4: Perfil debe tener posiciones

1. **UI** (`AuthGuard.tsx`):
```typescript
if (profile.role === "player" &&
    (!profile.positions || profile.positions.length === 0) &&
    pathname !== "/profile") {
  router.replace("/profile");
}
```

2. **UI** (`app/profile/page.tsx`):
```typescript
{ALLOWED_POSITIONS.map((pos: Position) => {
  const selected = positions.includes(pos);
  // ...render checkbox
})}
```

---

## 4. CRITERIOS DE ACEPTACIÓN ✅

### ✅ Criterio 1
**Given** un usuario nuevo
**When** inicia sesión con Google
**Then** se crea su perfil y se redirige a `/profile`

### ✅ Criterio 2
**Given** un jugador sin posiciones configuradas
**When** intenta acceder a cualquier ruta
**Then** es redirigido a `/profile`

### ✅ Criterio 3
**Given** un admin
**When** accede a `/admin/users`
**Then** ve la lista completa de usuarios con opción de eliminar

### ✅ Criterio 4
**Given** un jugador que nunca ha cambiado su nombre
**When** edita el campo nombre y guarda
**Then** el nombre se actualiza y se registra `nameLastChanged`

### ✅ Criterio 5
**Given** un jugador que cambió su nombre hace menos de 30 días
**When** accede a `/profile`
**Then** el campo nombre está deshabilitado y muestra la fecha disponible

---

## 5. ARCHIVOS INVOLUCRADOS

| Capa | Archivo | Responsabilidad |
|------|---------|----------------|
| Dominio | `lib/domain/user.ts` | UserProfile, UserRole, isAdmin() |
| Dominio | `lib/domain/player.ts` | Position, ALLOWED_POSITIONS, POSITION_LABELS |
| API | `lib/users.ts` | CRUD Firestore |
| API | `lib/auth.ts` | Login Google |
| API | `lib/AuthContext.tsx` | Context de autenticación |
| API | `lib/push.ts` | Push notifications |
| UI | `components/AuthGuard.tsx` | Guard de rutas |
| UI | `app/profile/page.tsx` | Configuración perfil |
| UI | `app/admin/users/page.tsx` | Panel admin |

---

## 6. CONCLUSIÓN

✅ **Roles tipados como union type** en dominio
✅ **AuthGuard protege rutas** según reglas de negocio
✅ **Posiciones centralizadas** en `lib/domain/player.ts`
✅ **UI tipada** con `UserProfile` en lugar de `any`
✅ **Trazabilidad completa** de cada regla
