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
  email?: string;           // Correo vinculado a Google Auth
  photoURL?: string;        // Foto de perfil (Google Auth o Firebase Storage)
  originalGoogleName?: string; // Trazabilidad de seguridad: Nombre original de la cuenta de Google
  roles: UserRole[];        // Roles del usuario (ej: ["player", "admin"])
  adminType?: AdminType;    // Nivel de admin: "super_admin", "location_admin", "team_admin"
  assignedLocationIds?: string[]; // IDs de canchas administradas
  positions?: Position[];   // 1-3 posiciones de juego
  primaryPosition?: Position; // Posición principal preferida (renderizada con 👑)
  stats?: UserStats;        // Estadísticas de partidos
  nameLastChanged?: string; // ISO timestamp del último cambio de nombre
  notificationsEnabled?: boolean;
  applyCTADismissed?: boolean; // El usuario descartó el banner de "Aplicar como Team Admin"
}
```

### Reglas de Negocio

| # | Regla | Implementación |
|---|-------|----------------|
| 1 | Login exclusivamente con Google | `loginWithGoogle()` en `lib/auth.ts` |
| 2 | Roles múltiples: "admin" y/o "player" | `roles: UserRole[]` en `lib/domain/user.ts` |
| 3 | Jerarquía Admin (Tiers) | `adminType` y funciones `isSuperAdmin`, `isLocationAdmin`, etc. |
| 4 | Panel de gestión (Ranking/Admin) | `isSuperAdmin()` restringe áreas globales |
| 5 | Perfil debe tener al menos 1 posición | Redirect en `AuthGuard.tsx` |
| 6 | Máximo 3 posiciones por jugador (y una principal) | Validación en profile page y onboarding |
| 7 | Eliminación de cuenta anonimiza datos personales (Habeas Data) | `deleteUser()` en `lib/users.ts` — reemplaza doc con traza anónima en lugar de borrar |
| 8 | Jugador puede editar su nombre (mínimo 2 palabras) | `updateUserName()` en `lib/users.ts` y validación en `app/profile/page.tsx` |
| 9 | Cambio de nombre solo cada 30 días | `nameLastChanged` + cooldown en profile page |
| 10 | Posiciones y secciones con iconos visuales | `POSITION_ICONS` en domain y `lucide-react` en UI (`FileUser`, `Pencil`, `User`, etc.) |
| 11 | Feedback separado nombre/posiciones | `nameSaved` / `positionsSaved` estados independientes |
| 12 | Carga de foto de perfil | `uploadAvatarBase64` en `lib/storage.ts` y crop con `react-easy-crop` |
| 13 | Optimización de imágenes / Branding | Unoptimized para logos (ahorro quota Vercel) y 48/96/256px + calidad 75 para perfiles |

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
export type AdminType = "super_admin" | "location_admin" | "team_admin";

export interface UserProfile {
  uid: string;
  name: string;
  roles: UserRole[];
  adminType?: AdminType;
  assignedLocationIds?: string[];
  positions?: Position[];
  notificationsEnabled?: boolean;
  applyCTADismissed?: boolean;
  // Habeas Data / Legal Proof
  createdAt?: string;
  authAcceptedVersion?: string;
  // Soft-anonymization (set on account deletion)
  deleted?: boolean;
  deletedAt?: string;
}

export function isAdmin(profile: UserProfile): boolean {
  return profile.roles.includes("admin");
}

export function isSuperAdmin(profile: UserProfile): boolean {
  return profile.adminType === "super_admin";
}

export function isLocationAdmin(profile: UserProfile): boolean {
  return profile.adminType === "location_admin";
}

export function isTeamAdmin(profile: UserProfile): boolean {
  return profile.adminType === "team_admin";
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
export async function updateUserPhoto(uid: string, photoURL: string): Promise<void>
export async function deleteUser(uid: string): Promise<void>
// Anonimización: reemplaza el doc con traza no identificable.
// Conserva: uid, deleted, deletedAt, createdAt, stats, level, rating, positions.
// Elimina: name, email, photoURL, phone, fcmTokens, y todo dato personal.
// El re-registro con la misma cuenta Google genera un nuevo uid → usuario nuevo limpio.
```

**✅ Cumple especificación**: Reglas #4, #6, #7

#### **Capa 3: UI**
- `components/LandingPage.tsx` — Página de inicio pública. Optimizada con `<img>` nativo para el logo Hero (160px) para bypass de Vercel Image Transformation mantiniendo costo cero por assets estáticos.
- `components/AuthGuard.tsx` — Protege rutas. Implementa loaders de transición con `<Image unoptimized />` para garantizar branding inmediato sin parpadeos ni degradación de cuotas.
- `app/profile/page.tsx` — Dashboard de perfil:
  - Edición de nombre con cooldown 30d y validación (mín. 2 palabras de 2 caracteres). Lee perfil en tiempo real.
  - Posiciones con iconos de `lucide-react` y modo interactivo para selección principal (Corona Lucide)
  - Interfaz modernizada con iconos Lucide (`FileUser`, `Cake`, `User`, `Smartphone`, `Bell`, `Clock`, `Lock`, etc.) para una estética premium.
  - Feedback independiente: `saved` visual con checkmarks Lucide
  - Visualización de estadísticas (PJ, PG, PE, PP, MVP, COM) modernizada con iconos de `lucide-react` (`PlayCircle`, `CheckCircle2`, `Equal`, `XCircle`, `Trophy`, `Heart`).
  - Tracker de "Compromiso" con apoyos visuales y tiers de compromiso representados por iconos Lucide en la `FifaPlayerCard`.
  - **Habeas Data**: Zona de Peligro para eliminación permanente de cuenta (requiere confirmación robusta escribiendo "ELIMINAR" y flujo de re-autenticación OAuth si es necesario).
  - **Habeas Data**: Campos sensibles (Edad y Sexo) son de solo lectura y requieren intervención directiva (admin) para su rectificación, protegiendo la integridad del algoritmo deportivo.
- `app/admin/users/page.tsx` — Panel admin con lista de usuarios tipada `UserProfile[]`. Usa `UserListSkeleton.tsx` para una transición perfecta.
- `app/terms/page.tsx` y `app/privacy/page.tsx` — Páginas legales estáticas públicas (sin AuthGuard) donde se establecen los contratos digitales.
- `lib/constants.ts` — Almacena la constante global `APP_LEGAL_CONSTANTS.CURRENT_TERMS_VERSION` inyectada durante la creación de perfil.
- `lib/AuthContext.tsx` — Centraliza el "Splash Screen" (logo Canchita) que se muestra globalmente durante la carga inicial de cualquier página, reemplazando los parpadeos de skeletons iniciales.

**✅ Cumple especificación**: Reglas #3, #4, #5, #7, #8, #9, #10, Requisitos Legales (Habeas Data Ley 1581)

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
2. **UI** (`app/profile/page.tsx`): Renderiza `{POSITION_ICONS[pos]}` junto a etiquetas y decoraciones de Lucide.

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

### ✅ Criterio 9 (Legal)
**Given** un usuario nuevo
**When** inicia sesión por primera vez con Google
**Then** se registra su `createdAt` y `authAcceptedVersion` como prueba de autorización legal

### ✅ Criterio 10 (Habeas Data)
**Given** un usuario autenticado
**When** escribe "ELIMINAR" en la zona de peligro de su perfil y confirma
**Then** su documento en Firestore es **anonimizado** (todos los datos personales eliminados, traza no identificable conservada) y su cuenta de Firebase Auth es eliminada. Si lleva mucho tiempo logueado, se abre un popup para re-verificar identidad. El re-registro con la misma cuenta Google crea un usuario nuevo desde cero.

**Traza conservada** (no identificable, cumple Ley 1581):
- `uid`, `deleted: true`, `deletedAt`, `createdAt`, `stats`, `level`, `rating`, `positions`

**Eliminado permanentemente**:
- `name`, `email`, `photoURL`, `phone`, `fcmTokens`, `notificationsEnabled`, y todos los demás datos personales

---

## 5. ARCHIVOS INVOLUCRADOS

| Capa | Archivo | Responsabilidad |
|------|---------|----------------|
| Dominio | `lib/domain/user.ts` | UserProfile, UserRole, isAdmin() |
| Dominio | `lib/domain/player.ts` | Position, ALLOWED_POSITIONS, POSITION_LABELS, POSITION_ICONS |
| API | `lib/users.ts` | CRUD Firestore |
| API | `lib/auth.ts` | Login Google |
| API | `lib/storage.ts` | Subida de imágenes a Firebase Storage |
| API | `lib/push.ts` | Push notifications |
| UI | `lib/AuthContext.tsx` | Splash Screen centralizado |
| UI | `components/AuthGuard.tsx` | Guard de rutas |
| UI | `app/profile/page.tsx` | Ficha Técnica con modo vista/edición, re-evaluación y carga de foto |
| UI | `app/admin/users/page.tsx` | Panel admin |
| UI | `components/skeletons/UserListSkeleton.tsx` | Skeleton exacto de usuarios |

---

## 6. CONCLUSIÓN

✅ **Roles tipados como union type** en dominio
✅ **AuthGuard protege rutas** según reglas de negocio
✅ **Posiciones centralizadas** con iconos en `lib/domain/player.ts`
✅ **UI tipada** con `UserProfile` en lugar de `any`
✅ **Modo vista/edición** compacto en perfil con batch save
✅ **Re-evaluación** disponible cada 90 días
✅ **Trazabilidad completa** de cada regla
