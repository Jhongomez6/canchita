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
| 2 | Roles múltiples: "admin" y/o "player" | `roles: UserRole[]` en `lib/domain/user.ts` |
| 3 | Solo admin accede a panel de gestión | `roles.includes("admin")` |
| 4 | Perfil debe tener al menos 1 posición | Redirect en `AuthGuard.tsx` |
| 5 | Máximo 2 posiciones por jugador | Validación en profile page |
| 6 | Admin puede eliminar usuarios | `deleteUser()` en `lib/users.ts` |
| 7 | Jugador puede editar su nombre | `updateUserName()` en `lib/users.ts` |
| 8 | Cambio de nombre solo cada 30 días | `nameLastChanged` + cooldown en profile page |
| 9 | Posiciones con iconos visuales | `POSITION_ICONS` en `lib/domain/player.ts` |
| 10 | Feedback separado nombre/posiciones | `nameSaved` / `positionsSaved` estados independientes |

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
                                  AuthContext (Real-time Profile)
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
  return profile.roles.includes("admin");
}
```

**✅ Cumple especificación**: Reglas #2, #3, #9

> **Nota**: `POSITION_ICONS` (`🧤 🛡️ ⚙️ ⚡`) centralizado en `lib/domain/player.ts` junto a `POSITION_LABELS`.

#### **Capa 2: API** (`lib/users.ts`)

```typescript
export async function getUserProfile(uid: string): Promise<UserProfile | null>
export async function getAllUsers(): Promise<UserProfile[]>
export async function updatePlayerAttributes(uid: string, data: { dominantFoot?: string; preferredCourt?: string })
export async function updateUserPositions(uid: string, positions: Position[]): Promise<void>
export async function updateUserName(uid: string, name: string): Promise<void>
export async function deleteUser(uid: string): Promise<void>
```

**✅ Cumple especificación**: Reglas #4, #6, #7

#### **Capa 3: UI**
- `components/AuthGuard.tsx` — Protege rutas, redirige a `/profile` si incompleto. Consume `profile` localmente del Contexto global para eliminar el "flash de carga" evitando renders intermedios.
- `app/profile/page.tsx` — Dashboard de perfil:
  - Edición de nombre con cooldown 30d y validación (mín. 2 caracteres). Lee perfil en tiempo real.
  - Posiciones con iconos emoji (`POSITION_ICONS`) y bloqueo durante guardado
  - Feedback independiente: `nameSaved` vs `positionsSaved`
  - Visualización de estadísticas (PJ/PG/PE/PP) apoyada por *CSS Tooltips* explicativos (optimizados para Mobile Touch).
  - Tracker de "Compromiso" con apoyos visuales (*Tooltips Touch*) enseñando la fórmula de penalización por llegadas tarde y faltas.
- `app/admin/users/page.tsx` — Panel admin con lista de usuarios tipada `UserProfile[]`

**✅ Cumple especificación**: Reglas #3, #4, #5, #7, #8, #9, #10

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
  // ...render con POSITION_ICONS[pos] + POSITION_LABELS[pos]
})}
```

### Regla #9: Posiciones con iconos visuales

1. **Dominio** (`lib/domain/player.ts`):
```typescript
export const POSITION_ICONS: Record<Position, string> = {
    GK: "🧤", DEF: "🛡️", MID: "⚙️", FWD: "⚡",
};
```
2. **UI** (`app/profile/page.tsx`): Renderiza `{POSITION_ICONS[pos]} {POSITION_LABELS[pos]}`

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

### ✅ Criterio 6
**Given** un jugador que guarda nombre, posiciones o atributos
**When** hace clic en "Guardar cambios" en modo edición
**Then** todos los cambios se persisten en batch y vuelve a modo vista con feedback

### ✅ Criterio 7
**Given** un jugador en modo vista
**When** accede a `/profile`
**Then** ve toda su información (nombre, edad, posiciones, pie, cancha, nivel) como read-only en una sola pantalla

### ✅ Criterio 8
**Given** un jugador cuyo onboarding se completó hace más de 90 días
**When** solicita nueva autoevaluación desde su perfil
**Then** se resetea `initialRatingCalculated` y es redirigido a `/onboarding`

---

## 5. ARCHIVOS INVOLUCRADOS

| Capa | Archivo | Responsabilidad |
|------|---------|----------------|
| Dominio | `lib/domain/user.ts` | UserProfile, UserRole, isAdmin() |
| Dominio | `lib/domain/player.ts` | Position, ALLOWED_POSITIONS, POSITION_LABELS, POSITION_ICONS |
| API | `lib/users.ts` | CRUD Firestore |
| API | `lib/auth.ts` | Login Google |
| API | `lib/AuthContext.tsx` | Context de autenticación |
| API | `lib/push.ts` | Push notifications |
| UI | `components/AuthGuard.tsx` | Guard de rutas |
| UI | `app/profile/page.tsx` | Ficha Técnica con modo vista/edición y re-evaluación |
| UI | `app/admin/users/page.tsx` | Panel admin |

---

## 6. CONCLUSIÓN

✅ **Roles tipados como union type** en dominio
✅ **AuthGuard protege rutas** según reglas de negocio
✅ **Posiciones centralizadas** con iconos en `lib/domain/player.ts`
✅ **UI tipada** con `UserProfile` en lugar de `any`
✅ **Modo vista/edición** compacto en perfil con batch save
✅ **Re-evaluación** disponible cada 90 días
✅ **Trazabilidad completa** de cada regla
