# Feature: Sistema de Foto de Avatar en Dos Tamaños

## 📋 Specification-Driven Development (SDD)

Este documento gobierna la implementación del sistema de fotos de perfil con dos variantes de tamaño: `_thumb` (96×96) y `_large` (512×512), almacenadas en Firebase Storage como WebP.

---

## 1. ESPECIFICACIÓN FUNCIONAL (Fuente de Verdad)

### Objetivo

Eliminar las URLs de Google (`lh3.googleusercontent.com`) de Firestore — son inestables, expiran y generan imágenes rotas en la UI. Todas las fotos de perfil deben residir en Firebase Storage como WebP en dos variantes optimizadas para sus contextos de uso.

### Reglas de Negocio

| # | Regla | Implementación |
|---|-------|----------------|
| 1 | Solo se guardan en Firestore URLs de Firebase Storage (`firebasestorage.googleapis.com`) | `isStorageURL()` en `lib/users.ts` |
| 2 | Dos variantes: `_thumb` 96×96 WebP 0.85 (avatares) y `_large` 512×512 WebP 0.85 (FIFA card/perfil) | `lib/avatarProcessing.ts` + `lib/storage.ts` |
| 3 | Storage paths: `avatars/{uid}_thumb.webp` y `avatars/{uid}_large.webp` | `uploadAvatarBothSizes()` en `lib/storage.ts` |
| 4 | Fotos de Google se migran automáticamente al siguiente login (fire & forget, no bloquea UI) | `migrateGooglePhotoToStorage()` en `lib/avatarMigration.ts` |
| 5 | Fotos legacy en Storage (`avatars/{uid}.webp`) sin thumb también se migran automáticamente | `generateThumbFromStorageURL()` en `lib/avatarMigration.ts` |
| 6 | La migración de Google usa un proxy server-side para evitar restricciones CORS del browser | `GET /api/proxy-image?url=<encoded>` — solo permite `lh3.googleusercontent.com` |
| 7 | Guard de concurrencia evita migraciones duplicadas para el mismo uid en la misma sesión | `Set<string> migrating` módulo-level en `lib/avatarMigration.ts` |
| 8 | Componentes de avatar usan `photoURLThumb ?? photoURL` como fallback | Patrón uniforme en todos los componentes — `unoptimized` en todos los avatares |
| 9 | FIFA card usa `photoURL` (large, 512px) sin `unoptimized` | `FifaPlayerCard.tsx:236` |
| 10 | Al subir foto en perfil se generan las dos variantes en el browser via canvas | `generateAvatarSizes()` en `lib/avatarProcessing.ts` |
| 11 | `ensureUserProfile()` NO guarda URLs de Google en Firestore para usuarios nuevos | Modificación en `lib/users.ts` |
| 12 | Documentos históricos de `match.players` no se migran — el fallback los cubre | Sin scripts de migración masiva |
| 13 | `photoURLThumb` se incluye al construir objetos de jugador para `match.players[]` y `match.teams` | `lib/matches.ts` y sync effect de `app/join/[id]/page.tsx` |

### Campos en Firestore

**Colección `users/{uid}`** — nuevos campos:
```typescript
photoURL?: string;      // URL large (512×512) — Firebase Storage
photoURLThumb?: string; // URL thumb (96×96) — Firebase Storage (NUEVO)
```

### Contextos de uso por tamaño

| Contexto | Variante | Tamaño display |
|----------|----------|----------------|
| Avatar en listas de jugadores (48px) | `photoURLThumb` | 48px |
| Avatar en stack (`PlayerAvatars`) | `photoURLThumb` | 32px |
| MVP voting, score screen | `photoURLThumb` | 48–96px |
| FIFA card / perfil | `photoURL` (large) | 180–256px |
| Preview en edición de perfil | `photoURL` (large) | 96px |

---

## 2. ARQUITECTURA DE LA IMPLEMENTACIÓN

```
┌─────────────────────────────────────────────────────┐
│                   ESPECIFICACIÓN                     │
└─────────────────────────────────────────────────────┘
                         │
         ┌───────────────┼────────────────┐
         ▼               ▼                ▼
    ┌────────┐     ┌──────────┐    ┌──────────────┐
    │ DOMINIO│     │   API    │    │      UI      │
    └────────┘     └──────────┘    └──────────────┘
    UserProfile    storage.ts      profile/page.tsx
    Player         users.ts        Componentes avatar
    Match          matches.ts      AuthContext (trigger)
                   avatarMigration
                   proxy API route
```

### Flujo: Upload de foto en perfil

```
Usuario selecciona imagen
        │
        ▼
react-easy-crop (recorte circular 1:1)
        │
        ▼
generateAvatarSizes(img, cropArea)  ← lib/avatarProcessing.ts
    ├── canvas 512×512 → data URL WebP 0.85 (large)
    └── canvas 96×96  → data URL WebP 0.85 (thumb)
        │
        ▼
uploadAvatarBothSizes(uid, blobs)  ← lib/storage.ts
    ├── avatars/{uid}_large.webp → Storage → largeURL
    └── avatars/{uid}_thumb.webp → Storage → thumbURL
        │
        ▼
updateUserPhoto(uid, largeURL, thumbURL)  ← lib/users.ts
    └── Firestore: users/{uid}.photoURL + photoURLThumb
```

### Flujo: Migración automática

```
Abrir app (login nuevo o sesión activa)
        │
        ▼
onSnapshot(users/{uid})
        │
        ├─ Caso A: photoURL = lh3.googleusercontent.com && !photoURLThumb
        │          → migrateGooglePhotoToStorage()
        │            GET /api/proxy-image (server-side, sin CORS)
        │            → canvas 512 + 96 → uploadAvatarBothSizes → updateUserPhotoURLs
        │
        ├─ Caso B: photoURL = firebasestorage (legacy {uid}.webp) && !photoURLThumb
        │          → generateThumbFromStorageURL()
        │            fetch directo (URL pública) → canvas 96 → upload _thumb → updateUserPhotoURLs
        │
        └─ Caso C: photoURLThumb ya existe → no hace nada

Guard: Set<uid> en módulo evita lanzar dos migraciones en paralelo para el mismo usuario
```

---

## 3. MÓDULOS

### `lib/avatarProcessing.ts` (NUEVO)

```typescript
export interface AvatarBlobs {
  large: string; // data URL 512×512 WebP 0.85
  thumb: string; // data URL 96×96 WebP 0.85
}

// Para el flujo de perfil: crop preciso + resize a dos tamaños
export async function generateAvatarSizes(
  img: HTMLImageElement,
  cropArea: { x: number; y: number; width: number; height: number }
): Promise<AvatarBlobs>

// Para migración: sin crop, escala completa
export async function generateAvatarSizesFromDataURL(
  dataURL: string
): Promise<AvatarBlobs>
```

### `lib/avatarMigration.ts` (NUEVO)

```typescript
// Guard de concurrencia — módulo-level
const migrating = new Set<string>();

// Caso A: URL de Google → sube large + thumb a Storage
export async function migrateGooglePhotoToStorage(
  uid: string,
  googleURL: string
): Promise<void>

// Caso B: URL legacy de Storage sin thumb → genera y sube solo el thumb
export async function generateThumbFromStorageURL(
  uid: string,
  storageURL: string
): Promise<void>
// Ambas: fire & forget, silencian errores, liberan el guard en finally
```

### `lib/storage.ts` — nueva función

```typescript
export async function uploadAvatarBothSizes(
  uid: string,
  blobs: AvatarBlobs
): Promise<{ largeURL: string; thumbURL: string }>
// Paths: avatars/{uid}_large.webp y avatars/{uid}_thumb.webp
// Upload en paralelo con Promise.all
```

### `lib/users.ts` — modificaciones

```typescript
// Firma ampliada (backward-compatible — photoURLThumb es opcional)
export async function updateUserPhoto(
  uid: string,
  photoURL: string,
  photoURLThumb?: string
): Promise<void>

// Nueva — escribe solo los campos de foto (migración)
export async function updateUserPhotoURLs(
  uid: string,
  photoURL: string,
  photoURLThumb: string
): Promise<void>

// ensureUserProfile: solo guarda photoURL si es URL de Storage
// helper interno:
function isStorageURL(url?: string | null): boolean
```

### `app/api/proxy-image/route.ts` (NUEVO)

```typescript
// GET /api/proxy-image?url=<encodedURL>
// Allowlist: ["lh3.googleusercontent.com"]
// 403 para dominios no permitidos
// Cache-Control: public, max-age=300
export async function GET(request: Request): Promise<Response>
```

---

## 4. ARCHIVOS INVOLUCRADOS

| Archivo | Acción | Capa |
|---------|--------|------|
| `lib/domain/user.ts` | + `photoURLThumb?: string` | Dominio |
| `lib/domain/player.ts` | + `photoURLThumb?: string` | Dominio |
| `lib/domain/match.ts` | + `photoURLThumb?` en `creatorSnapshot` | Dominio |
| `lib/avatarProcessing.ts` | **NUEVO** | Dominio |
| `lib/avatarMigration.ts` | **NUEVO** — migración Google + legacy Storage | API |
| `lib/storage.ts` | + `uploadAvatarBothSizes` | API |
| `lib/users.ts` | Modificar `updateUserPhoto`, `ensureUserProfile`; + `updateUserPhotoURLs` | API |
| `lib/matches.ts` | + `photoURLThumb` en `joinMatch`, `joinWaitlist`, `addPlayerToMatch` | API |
| `lib/AuthContext.tsx` | + triggers migración (Casos A y B) en `onSnapshot` | API |
| `app/api/proxy-image/route.ts` | **NUEVO** | API |
| `app/profile/page.tsx` | Reemplazar `applyCrop` + bloque upload en `saveAll` | UI |
| `app/join/[id]/page.tsx` | + `photoURLThumb` en sync effect + `unoptimized` en renders | UI |
| `components/home/IdentityHeader.tsx` | `photoURLThumb ?? photoURL` | UI |
| `components/PlayerAvatars.tsx` | `photoURLThumb ?? photoURL` | UI |
| `app/match/[id]/components/PlayerItem.tsx` | + prop `photoURLThumb` + fallback | UI |
| `app/match/[id]/components/PlayerRow.tsx` | `photoURLThumb ?? photoURL` | UI |
| `app/match/[id]/components/AttendanceMode.tsx` | `photoURLThumb ?? photoURL` | UI |
| `app/match/[id]/components/PaymentsTab.tsx` | + `photoURLThumb` en `PayableEntry` | UI |
| `app/match/[id]/components/PlayersTab.tsx` | `photoURLThumb ?? photoURL` en picker y waitlist | UI |
| `app/match/[id]/components/TeamColumn.tsx` | pasa `photoURLThumb` a `PlayerItem` | UI |

---

## 5. CRITERIOS DE ACEPTACIÓN

| # | Criterio | Verificación |
|---|----------|-------------|
| 1 | Upload de foto nueva crea `avatars/{uid}_large.webp` y `avatars/{uid}_thumb.webp` en Storage | Firebase Console |
| 2 | Firestore `users/{uid}` tiene `photoURL` y `photoURLThumb` tras upload | Firebase Console |
| 3 | Usuario con URL de Google en Firestore migra al siguiente login | Revisar Firestore antes/después de login |
| 4 | Migración no se repite si `photoURLThumb` ya existe | Re-login → no aparece tráfico a `/api/proxy-image` |
| 5 | Usuario sin `photoURLThumb` ve su avatar usando `photoURL` (fallback) | UI sin imágenes rotas |
| 6 | FIFA card sigue mostrando imagen grande | Inspecionar `src` del `<Image>` en FifaPlayerCard |
| 7 | Proxy rechaza dominios externos con 403 | `GET /api/proxy-image?url=https://evil.com/img` → 403 |
| 8 | Usuarios nuevos (primer login) no tienen URL de Google en Firestore | Crear cuenta nueva → revisar Firestore |

---

## 6. COMPATIBILIDAD HACIA ATRÁS

- **Archivos viejos en Storage** (`avatars/{uid}.webp`): permanecen válidos. Usuarios que no actualicen su foto seguirán viendo la imagen desde ese path.
- **Match documents históricos**: no se migran. El patrón `photoURLThumb ?? photoURL` en componentes garantiza que no haya regresiones.
- **`updateUserPhoto(uid, url)` sin thumb**: sigue funcionando — `photoURLThumb` es opcional.
