# Feature: Migración a Capacitor (Play Store + App Store)

## 📋 Specification-Driven Development (SDD)

Empaquetar la PWA Next.js actual como app nativa Android/iOS usando Capacitor, sin reescribir la UI ni la lógica de dominio.

---

## 0. AUDITORÍA DEL ESTADO ACTUAL (datos reales del repo)

Auditoría hecha sobre el commit actual de `main`. Estos números son la base del plan.

### Lo que facilita la migración
- **47 archivos con `"use client"`** — la app es prácticamente toda cliente. No hay SSR significativo.
- **0 usos de `generateStaticParams`, `generateMetadata`, `dynamic = ...`, `revalidate = ...`** — no hay configuración server-rendering que rompa el export.
- **0 Server Actions** — confirmado por búsqueda de `"use server"`.
- **PWA icons ya existen**: [public/icon-1024.png](public/icon-1024.png), `icon-512.png`, `icon-192.png` (+ maskables). Reusables para Capacitor Assets.
- **Cloud Functions ya configuradas**: 10 archivos en [functions/src/](functions/src/) con httpsCallable existente. Migrar lógica server-side ahí es bajo costo.
- **FCM ya usa array de tokens**: [lib/push.ts:42](lib/push.ts#L42) hace `fcmTokens: arrayUnion(token)`. Solo falta metadata de plataforma.

### Bloqueadores concretos identificados
| # | Bloqueador | Ubicación | Plan |
|---|-----------|-----------|------|
| B1 | `signInWithPopup` no funciona en WebView móvil | [lib/auth.ts:13](lib/auth.ts#L13) | Reemplazar por wrapper que use `@capacitor-firebase/authentication` en nativo |
| B2 | API route con Sharp (server-only) | [app/api/process-avatar/route.ts](app/api/process-avatar/route.ts) | Migrar a Cloud Function callable `processAvatar` |
| B3 | API route proxy CORS | [app/api/proxy-image/route.ts](app/api/proxy-image/route.ts) | Llamada directa cliente en nativo (no hay CORS); fallback Cloud Function para web |
| B4 | `next/image` con optimización en 14 archivos | Ver lista abajo | Wrapper condicional `<SmartImage>` que usa `next/image` en web y `<img>` en nativo |
| B5 | 6 rutas dinámicas `[id]` | Ver tabla abajo | Cada una resuelve el ID en cliente — viable con `dynamicParams` o catch-all rewrite |
| B6 | `next.config.ts` define `images.qualities`, `deviceSizes`, `remotePatterns` | [next.config.ts](next.config.ts) | Branch condicional desactiva el bloque `images` completo en build Capacitor |
| B7 | Service worker `firebase-messaging-sw.js` | [public/firebase-messaging-sw.js](public/firebase-messaging-sw.js) | Mantener para web. En nativo se ignora y usa `@capacitor/push-notifications` |

### Archivos con `next/image` (14 — todos requieren wrapper o reemplazo)
- [components/PlayerAvatar.tsx](components/PlayerAvatar.tsx)
- [components/FifaPlayerCard.tsx](components/FifaPlayerCard.tsx)
- [components/Header.tsx](components/Header.tsx)
- [components/AuthGuard.tsx](components/AuthGuard.tsx)
- [components/booking/VenueCard.tsx](components/booking/VenueCard.tsx)
- [components/match-review/TeammateFeedbackList.tsx](components/match-review/TeammateFeedbackList.tsx)
- [app/profile/page.tsx](app/profile/page.tsx)
- [app/registro-admin/page.tsx](app/registro-admin/page.tsx)
- [app/join/[id]/page.tsx](app/join/[id]/page.tsx)
- [app/venues/[id]/page.tsx](app/venues/[id]/page.tsx)
- [app/venues/admin/[id]/page.tsx](app/venues/admin/[id]/page.tsx)
- [app/match/[id]/components/PlayersTab.tsx](app/match/[id]/components/PlayersTab.tsx)
- [app/match/[id]/components/PaymentsTab.tsx](app/match/[id]/components/PaymentsTab.tsx)
- [app/match/[id]/components/AttendanceMode.tsx](app/match/[id]/components/AttendanceMode.tsx)

### Rutas dinámicas y su plan
| Ruta | Tipo de ID | Estrategia para export estático |
|------|-----------|--------------------------------|
| `app/match/[id]/page.tsx` | Firestore matchId | `generateStaticParams` → `[]` + `dynamicParams: true` + fetch cliente |
| `app/match/[id]/review/page.tsx` | matchId | Igual ↑ |
| `app/join/[id]/page.tsx` | matchId | Igual ↑ |
| `app/venues/[id]/page.tsx` | venueId | Igual ↑ |
| `app/venues/admin/[id]/page.tsx` | venueId | Igual ↑ |
| `app/bookings/[id]/page.tsx` | bookingId | Igual ↑ |

Todas ya son `"use client"` y fetchean el doc dinámicamente. El patrón estándar para Capacitor es:
```typescript
export const dynamic = "force-static";
export const dynamicParams = true;
export function generateStaticParams() { return []; }
```

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo
Publicar Canchita en Google Play Store y Apple App Store reusando el código Next.js + React 19 existente. Habilitar descubrimiento desde las stores oficiales (no solo "Add to Home Screen") y desbloquear push real en iOS.

### Reglas de Negocio
| # | Regla | Impacto UI |
|---|-------|------------|
| 1 | La app nativa y la web comparten backend Firebase y datos | Usuario ve los mismos partidos en ambas plataformas |
| 2 | Login Google funciona nativo en iOS/Android (no popup web) | Botón "Continuar con Google" abre flujo nativo del sistema |
| 3 | Push notifications usan APNs (iOS) y FCM (Android) | Permiso de notificación se pide al estilo nativo |
| 4 | La app funciona offline para vistas ya visitadas (assets cacheados en bundle) | Splash → contenido cacheado si no hay red |
| 5 | Versionado independiente: web actualiza instantáneo, móvil requiere release de store | Mostrar banner "Actualiza la app" si versión < mínima soportada |
| 6 | Deep links abren la app si está instalada | Compartir link de partido abre app nativa, no navegador |
| 7 | El SW `firebase-messaging-sw.js` se ignora en nativo | Push se gestiona vía `@capacitor/push-notifications` |
| 8 | `fcmTokens` debe distinguir plataforma para targeting | Token nuevo guarda `{ token, platform, lastSeen }` |

### Decisión arquitectónica: Static Export, no Hybrid Remote

**Opción A — Static Export (elegida)**
- `next build` con `output: "export"` → genera HTML/JS estático en `/out`
- Capacitor empaqueta `/out` dentro del `.apk`/`.ipa`
- **Por qué es viable en Canchita**: la auditoría confirma 47 `"use client"` y cero código server-rendering. La app ya es client-side.
- Contras: hay que mover los 2 API routes a Cloud Functions y envolver `next/image` con un wrapper.

**Opción B — Hybrid Remote (descartada)**
- Capacitor abre `https://canchita.app` directamente
- Apple rechaza apps que son solo wrapper de web (Guideline 4.2.3). Riesgo alto de rechazo.

**Decisión: Opción A.**

---

## 2. ESCALABILIDAD

### Volumen esperado
- Build estático `/out`: estimado 10-20 MB
- APK final: ~15-25 MB
- IPA final: ~20-30 MB
- Sin impacto en Firestore (mismas queries, mismo backend)

### Índices Firestore requeridos
- Ninguno nuevo.

### Paginación
- Sin cambios.

---

## 3. CONCURRENCIA SEGURA

### Operaciones que requieren `runTransaction()`
- Sin cambios — toda la lógica Firestore se mantiene.

### Race conditions identificadas
- **Token FCM/APNs duplicado entre web y nativo**: usuario con PWA + app nativa = 2 tokens activos.
  - **Mitigación**: cambiar `fcmTokens: string[]` a `fcmTokens: Array<{ token, platform, lastSeen }>` con migración compatible. Limpiar tokens > 60 días sin uso desde Cloud Function existente (ya hay [functions/src/cleanup.ts](functions/src/cleanup.ts)).

- **Sesión Auth divergente**: login nativo y web crean credenciales separadas.
  - **Mitigación**: `@capacitor-firebase/authentication` sincroniza la credencial con el SDK web de Firebase. Mismo `uid` → reglas Firestore no cambian.

---

## 4. SEGURIDAD

### Autenticación y autorización
- Migrar [lib/auth.ts](lib/auth.ts) a wrapper que detecte plataforma:
  - Web: sigue usando `signInWithPopup` actual.
  - iOS/Android: `FirebaseAuthentication.signInWithGoogle()` → obtiene credential nativa → `signInWithCredential()` en el SDK web para mantener un solo `auth.currentUser`.
- El `uid` resultante es idéntico al de la web. Las rules Firestore no requieren cambios.

### Firestore Rules requeridas
```
// Validar el nuevo formato de fcmTokens (objetos en lugar de strings)
match /users/{uid} {
  allow update: if request.auth.uid == uid
    && (!('fcmTokens' in request.resource.data.diff(resource.data).affectedKeys())
        || request.resource.data.fcmTokens.size() <= 10);
}
```

### Validaciones de input
- Sin cambios en validaciones de dominio.

### Datos sensibles
- **API keys Firebase**: ya son públicas (config del cliente), sin riesgo de bundlear.
- **Service account Firebase Admin**: NUNCA bundlear. Sigue solo en Cloud Functions.
- **`.keystore` Android + provisioning profile iOS**: fuera del repo. Crear `secrets/` con `.gitignore`.
- **VAPID key**: variable `NEXT_PUBLIC_FIREBASE_VAPID_KEY` solo aplica para web push. En nativo no se usa.

### Deep linking
- Custom scheme: registrar `canchita://` en `AndroidManifest.xml` e `Info.plist`.
- Universal Links iOS: archivo `apple-app-site-association` en `https://canchita.app/.well-known/`.
- Android App Links: `assetlinks.json` en el mismo path.

---

## 5. TOLERANCIA A FALLOS

### Estados de error y fallbacks
| Error | Causa probable | Fallback UI |
|-------|---------------|-------------|
| Sin conexión al iniciar | Usuario offline | Última pantalla cacheada + banner "Sin conexión" |
| Auth nativo cancelado o fallido | Usuario cerró el sheet de Google | Toast "No se pudo iniciar sesión" + retry |
| Permission push denegado | Usuario rechazó | Banner "Activa notificaciones en Ajustes" |
| Versión obsoleta | Cliente < versión mínima | Pantalla bloqueante con link a la store |
| Sharp/imagen falla en Cloud Function | Avatar muy grande o corrupto | Toast "No se pudo procesar la imagen" + revertir |

### Retry strategy
- Queries Firestore: retry automático del SDK (sin cambios).
- Push token registration: exponencial 3 intentos.
- Cloud Function `processAvatar`: retry 2 veces con backoff.

### Degradación elegante
- Sin push → app sigue funcionando, solo se pierden notificaciones.
- Sin deep link → fallback abre URL web en navegador del sistema.

---

## 6. UX — FLUJOS DE USUARIO

### Flujo principal (happy path)
1. Usuario descarga Canchita desde Play/App Store
2. Splash nativo (1-2 seg) → login
3. Tap "Continuar con Google" → flujo nativo del sistema (no popup)
4. Auth exitosa → home con sus partidos
5. Acepta permiso de notificaciones → token APNs/FCM registrado con metadata `platform`
6. Comparte link `canchita.app/join/abc123` → al abrirlo, deep link abre la app nativa en `/join/abc123`

### Estados de UI
| Estado | Qué muestra |
|--------|-------------|
| Splash | Logo + spinner (config en `capacitor.config.ts`) |
| Sin red | Banner superior persistente "Sin conexión" |
| Update requerido | Pantalla bloqueante con botón "Actualizar" → abre store |
| Permiso push pendiente | Banner descartable en home "Activar notificaciones" |

### Consideraciones mobile-first
- **Safe areas**: `env(safe-area-inset-top)` y `env(safe-area-inset-bottom)` en CSS.
- **Bottom nav**: cambiar `pb-24 md:pb-0` (regla 9 de CLAUDE.md) a `pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-0`.
- **Status bar**: configurar color verde (`#1f7a4f`, match `theme_color` del manifest) en `capacitor.config.ts`.
- **Hardware back button (Android)**: navegar atrás en router de Next, no cerrar la app.

---

## 7. UI DESIGN — COMPONENTES Y ANIMACIONES

### Componentes nuevos
- `<OfflineBanner>` — banner persistente cuando `@capacitor/network` reporta `connected: false`
- `<UpdateRequiredScreen>` — pantalla bloqueante de versión obsoleta
- `<NativePushPermissionPrompt>` — reemplazo del prompt web actual

> ⚠️ **`<SmartImage>` descartado** (era una idea inicial). La auditoría confirmó que el 100% de los `<Image>` ya usan `unoptimized`. Basta con `images: { unoptimized: true }` en la rama Capacitor de `next.config.ts` — `next/image` funciona en export estático con esa flag. Cero migración de los 14 archivos.

### Animaciones (Framer Motion)
- Sin cambios. Framer Motion funciona idéntico en WebView nativa.

### Responsive
- Mobile: sin cambios
- Tablet/Desktop: la app nativa solo se distribuye en móvil. iPad usa layout móvil (no se publica versión iPad-optimized en v1).

### Splash screen y íconos
- Reusar [public/icon-1024.png](public/icon-1024.png) como fuente.
- Generar el splash con `@capacitor/assets`:
  ```bash
  npx @capacitor/assets generate \
    --iconBackgroundColor "#1f7a4f" \
    --splashBackgroundColor "#1f7a4f"
  ```
- Crear `assets/splash.png` (2732x2732) — logo verde sobre fondo `#1f7a4f`.

---

## 8. ANALYTICS

| Evento | Trigger | Propiedades |
|--------|---------|-------------|
| `app_installed_native` | Primera apertura tras instalar | `platform`, `app_version` |
| `native_push_permission_granted` | Usuario acepta permiso | `platform` |
| `native_push_permission_denied` | Usuario rechaza permiso | `platform` |
| `deep_link_opened` | App se abre vía deep link | `path`, `source` |
| `app_update_required_shown` | Versión < mínima soportada | `current_version`, `min_version` |

Detectar plataforma con `Capacitor.getPlatform()` → `"web" | "ios" | "android"`. Inyectar como propiedad global en `initAnalytics()` (regla 10 de CLAUDE.md).

---

## 9. ARQUITECTURA TÉCNICA

### Stack adicional
```json
{
  "dependencies": {
    "@capacitor/core": "^6.x",
    "@capacitor/android": "^6.x",
    "@capacitor/ios": "^6.x",
    "@capacitor/app": "^6.x",
    "@capacitor/network": "^6.x",
    "@capacitor/push-notifications": "^6.x",
    "@capacitor/splash-screen": "^6.x",
    "@capacitor/status-bar": "^6.x",
    "@capacitor-firebase/authentication": "^6.x"
  },
  "devDependencies": {
    "@capacitor/cli": "^6.x",
    "@capacitor/assets": "^3.x"
  }
}
```

### Configuración Next.js — branch condicional
```typescript
// next.config.ts
const isCapacitor = process.env.BUILD_TARGET === "capacitor";

const capacitorConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // headers() y remotePatterns no aplican en export estático — Next.js los ignora
};

const webConfig: NextConfig = {
  images: { /* config web actual completa: qualities, deviceSizes, remotePatterns, minimumCacheTTL */ },
  async headers() { /* config web actual */ },
};

const nextConfig: NextConfig = isCapacitor ? capacitorConfig : webConfig;
export default nextConfig;
```

### Route segment config — el gotcha más grande

**Next.js 16 NO acepta expresiones dinámicas en `dynamicParams` o `generateStaticParams`** — solo literales estáticamente analizables. Este código FALLA al build:

```typescript
// ❌ Error: "The exported configuration object needs ... statically parsed"
const isCapacitor = process.env.BUILD_TARGET === "capacitor";
export const dynamicParams = !isCapacitor;
export function generateStaticParams() {
  return isCapacitor ? [{ id: "_" }] : [];
}
```

Además, **`output: "export"` + `dynamicParams: true` también falla** (`"dynamicParams: true" cannot be used with "output: export"`). Esto bloquea soluciones obvias.

**Solución implementada: build script que parchea archivos en disco**

[scripts/build-capacitor.mjs](scripts/build-capacitor.mjs):
1. Lee los 6 `page.tsx` a memoria (backup)
2. Reemplaza `dynamicParams = true` → `false` y `return [];` → `return [{ id: "_" }];`
3. `spawn("next build", { env: { BUILD_TARGET: "capacitor" } })`
4. `finally`: restaura el contenido original (incluso si el build falla)

Los archivos en source control quedan con la config **web por defecto**; el patcher es transitorio.

```json
// package.json
"build:capacitor": "node scripts/build-capacitor.mjs"
```

El placeholder `[{ id: "_" }]` hace que Next genere un HTML basura en `/match/_/index.html` pero **también** compile el chunk JS de la ruta `[id]`. Dentro de Capacitor, la navegación es 100% client-side vía Next router, que usa ese chunk para cualquier ID real.

> ⚠️ **No verificado runtime**: la implementación previa validó que ambos builds pasan (web verde + `/out` generado), pero **no se probó dentro de un APK** que `useParams()` resuelva el ID real al hacer `<Link href="/match/abc123">`. Es el primer punto a validar en Sesión 2.

### Capa de plataforma (nueva: `lib/platform/`)
```
lib/platform/
├── index.ts        # getPlatform(), isNative(), isWeb()
├── auth.ts         # signInWithGoogle() — wrapper web/nativo
├── push.ts         # registerPush() — wrapper web (FCM) / nativo (Capacitor)
└── network.ts      # useNetworkStatus() hook
```

> `index.ts` debe degradar elegantemente cuando Capacitor no esté cargado (web puro):
> ```typescript
> export function getPlatform(): Platform {
>   if (typeof window === "undefined") return "web";
>   const cap = (window as { Capacitor?: { getPlatform?: () => Platform } }).Capacitor;
>   if (cap?.getPlatform) return cap.getPlatform();
>   return "web";
> }
> ```
> Así no hay que importar `@capacitor/core` directamente — el SDK lo inyecta en `window` cuando corre en nativo.

### Refactor concreto de [lib/auth.ts](lib/auth.ts)
```typescript
import { isNative } from "@/lib/platform";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { GoogleAuthProvider, signInWithCredential, signInWithPopup } from "firebase/auth";

export async function loginWithGoogle() {
  if (isNative()) {
    const result = await FirebaseAuthentication.signInWithGoogle();
    const credential = GoogleAuthProvider.credential(result.credential?.idToken);
    return signInWithCredential(auth, credential);
  }
  return signInWithPopup(auth, new GoogleAuthProvider());
}
```

### Migración de API routes a Cloud Functions
**[functions/src/avatars.ts](functions/src/avatars.ts) (NUEVO)** — callable que reemplaza `/api/process-avatar`:
```typescript
export const processAvatar = onCall(async (req) => {
  // Recibe base64 + crop, devuelve { large, thumb } como base64 WebP
  // Sharp ya está disponible como dep del proyecto principal — moverlo a functions/package.json
});
```

**Reemplazo de `/api/proxy-image`**: en nativo no hay CORS, así que `lib/avatarMigration.ts` puede hacer fetch directo. Para web, mover a callable `proxyGoogleAvatar` también.

### Cambios en [lib/avatarProcessing.ts](lib/avatarProcessing.ts) y [lib/avatarMigration.ts](lib/avatarMigration.ts)
- Reemplazar `fetch("/api/process-avatar", ...)` por `httpsCallable(functions, "processAvatar")`.
- Reemplazar `fetch("/api/proxy-image?url=...")` por callable o fetch directo según plataforma.

### Refactor de `fcmTokens` con compatibilidad
```typescript
// Esquema nuevo
type FcmTokenEntry = { token: string; platform: "web"|"ios"|"android"; lastSeen: Timestamp };

// Migración: aceptar tanto string[] como FcmTokenEntry[] en reads.
// Writes nuevos siempre usan el formato objeto.
```

Funciones que envían push (en `functions/src/reminders.ts`, etc.) deben leer `fcmTokens[].token`.

### Capa de dominio (`lib/domain/`)
- Sin cambios. Lógica pura intacta.

### Componentes UI (`app/`)
- `app/layout.tsx` → agregar `<CapacitorBootstrap>` cliente que inicializa status bar, oculta splash, registra listeners de network y back button.
- `app/login/page.tsx` o componente equivalente → usar `loginWithGoogle()` del wrapper.

### Estructura de carpetas final
```
canchita/
├── android/                      # Generado por capacitor (gitignored excepto config)
├── ios/                          # Generado por capacitor (gitignored excepto config)
├── capacitor.config.ts           # NUEVO
├── scripts/build-capacitor.mjs   # NUEVO — patcher de route segment config
├── lib/platform/                 # NUEVO
├── functions/src/avatars.ts      # NUEVO
└── assets/
    ├── icon.png                  # NUEVO — reusa public/icon-1024.png
    └── splash.png                # NUEVO — 2732x2732
```

### Aprendizajes confirmados de un intento previo de implementación

Se hizo un intento parcial (descartado por git) que llegó hasta dejar **ambos builds verdes localmente** (`npm run build` y `npm run build:capacitor`). Aprendizajes verificados empíricamente:

| # | Hallazgo | Implicación |
|---|----------|-------------|
| 1 | Todos los `<Image>` ya usan `unoptimized` | `<SmartImage>` no es necesario. Cero refactor de 14 archivos. |
| 2 | `output: "export"` rechaza `dynamicParams: true` | Hay que usar `dynamicParams: false` + placeholder, o usar el build script patcher. |
| 3 | Route segment config no acepta expresiones (`process.env`, ternarios) | El build script patcher es la única vía limpia para soportar ambos builds. |
| 4 | `useSearchParams` requiere `<Suspense>` boundary en static export | `MatchClient.tsx` y `ReviewClient.tsx` lo usan → server wrappers DEBEN envolverlos. |
| 5 | API routes (`app/api/`) son incompatibles con `output: "export"` | Eliminar antes de buildar; migrar lógica a Cloud Functions ANTES. |
| 6 | Migrar `lib/avatarProcessing.ts` y `lib/avatarMigration.ts` a `httpsCallable` rompe web hasta que `firebase deploy --only functions:processAvatar,functions:proxyGoogleAvatar` se ejecute | **Orden estricto**: (a) escribir Functions → (b) deploy → (c) validar web → (d) borrar API routes |
| 7 | Sharp en Cloud Functions: `Node 22` (engine actual) lo soporta, agregar `"sharp": "^0.34.5"` a `functions/package.json` | Sin issues. Memory `512MiB` y timeout 60s alcanzan. |
| 8 | Web build cambia la etiqueta de rutas dinámicas: antes `ƒ (Dynamic)`, después `● (SSG)` con generateStaticParams vacío | Funcionalmente equivalente (renderiza on-demand para IDs no listados), pero verificar en producción que no hay regresión en cold-start times. |
| 9 | `cross-env` ya no es necesario | El build script usa `spawn(cmd, { env })`. Sigue siendo útil para debugging manual. |
| 10 | Dividir rutas dinámicas en server wrapper + `*Client.tsx` es seguro y mecánico | El client usa `useParams()` que sigue funcionando porque lee del segmento dinámico. No hay que pasar props. |
| 11 | Pendiente sin verificar | Comportamiento de `useParams()` dentro de un APK Capacitor cuando se navega a `/match/abc123` (la ruta solo tiene HTML para `/match/_`). |

---

## 10. CRITERIOS DE ACEPTACIÓN

### Sesión 1 — Static export limpio
- [ ] Cloud Functions `processAvatar` y `proxyGoogleAvatar` deployadas y validadas con la app web
- [ ] `npm run build` (web) pasa sin regresiones, los 14 archivos con `next/image` siguen mostrando imágenes
- [ ] `npm run build:capacitor` genera `/out` sin errores y restaura los 6 `page.tsx` correctamente
- [ ] `npx serve out` sirve la app y se puede navegar a las rutas estáticas
- [ ] Las 2 API routes están eliminadas
- [ ] La web en Vercel sigue funcionando idéntica (smoke test: login, ver partido, subir avatar)

### Sesión 2 — Android emulador
- [ ] App Android compila y se ejecuta en emulador
- [ ] Splash screen aparece y se oculta correctamente
- [ ] Safe areas se respetan (sin contenido tapado por status bar o nav bar)
- [ ] Hardware back button navega atrás en lugar de cerrar la app

### Sesión 3 — Auth + Push nativos
- [ ] Login Google funciona nativo en Android (no popup web)
- [ ] Push notification se recibe en Android (FCM)
- [ ] `fcmTokens` se guarda con `{ token, platform: "android", lastSeen }`
- [ ] Token web sigue funcionando idéntico (compatibilidad de esquema)

### Sesión 4 — iOS + Deep links
- [ ] App iOS compila y se ejecuta en simulador (macOS requerido)
- [ ] Login Google funciona nativo en iOS
- [ ] Push notification se recibe en iOS (APNs)
- [ ] Deep link `canchita://join/abc123` abre la app en `/join/abc123`
- [ ] Universal Link `https://canchita.app/join/abc123` abre app si está instalada

### Sesión 5 — Publicación
- [ ] APK firmado subido a Play Console (internal testing)
- [ ] IPA subido a App Store Connect (TestFlight)
- [ ] Política de privacidad publicada en URL pública
- [ ] Screenshots y descripciones listos para ambas stores

---

## 11. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---------|--------|
| [package.json](package.json) | Agregar deps Capacitor + script `build:capacitor` |
| [next.config.ts](next.config.ts) | Branch condicional `BUILD_TARGET=capacitor` |
| `capacitor.config.ts` | NUEVO — app ID `com.canchita.app`, splash, plugins |
| `lib/platform/index.ts` | NUEVO — degradación elegante a "web" si no hay `window.Capacitor` |
| `lib/platform/auth.ts` | NUEVO |
| `lib/platform/push.ts` | NUEVO |
| `lib/platform/network.ts` | NUEVO |
| `scripts/build-capacitor.mjs` | NUEVO — patcher de route segment config |
| [lib/auth.ts](lib/auth.ts) | Reemplazar `signInWithPopup` con wrapper |
| [lib/push.ts](lib/push.ts) | Adaptar registro de token a esquema con metadata |
| [lib/avatarProcessing.ts](lib/avatarProcessing.ts) | `fetch("/api/...")` → `httpsCallable("processAvatar")`; convertir File a base64 con chunks de `0x8000` para evitar stack overflow |
| [lib/avatarMigration.ts](lib/avatarMigration.ts) | `fetch("/api/proxy-image?url=...")` → `httpsCallable("proxyGoogleAvatar")`; helper `base64ToBlob()` para reconstruir el Blob |
| [app/api/process-avatar/route.ts](app/api/process-avatar/route.ts) | **ELIMINAR** después de migrar a Cloud Function y validar |
| [app/api/proxy-image/route.ts](app/api/proxy-image/route.ts) | **ELIMINAR** después de migrar a Cloud Function y validar |
| `functions/src/avatars.ts` | NUEVO — `processAvatar`, `proxyGoogleAvatar` callables (memory 512MiB, timeout 60s) |
| [functions/package.json](functions/package.json) | Agregar `"sharp": "^0.34.5"` a dependencies |
| [functions/src/index.ts](functions/src/index.ts) | `export * from "./avatars"` |
| 6 rutas dinámicas (split en server wrapper + `*Client.tsx`) | `page.tsx` server (config + Suspense para los que usen useSearchParams); contenido original a `MatchClient.tsx`, `ReviewClient.tsx`, `JoinClient.tsx`, `VenueClient.tsx`, `VenueAdminClient.tsx`, `BookingClient.tsx` |
| [app/layout.tsx](app/layout.tsx) | Agregar `<CapacitorBootstrap>` |
| [app/globals.css](app/globals.css) | Safe areas con `env(safe-area-inset-*)` |
| Componentes con `pb-24 md:pb-0` | Cambiar a `pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-0` |
| [firestore.rules](firestore.rules) | Validar nuevo formato de `fcmTokens[]` |
| `assets/icon.png` | NUEVO — copia de [public/icon-1024.png](public/icon-1024.png) |
| `assets/splash.png` | NUEVO — 2732x2732 |
| `android/` | NUEVO — generado por `npx cap add android` |
| `ios/` | NUEVO — generado por `npx cap add ios` |
| [.gitignore](.gitignore) | Excluir `android/app/build`, `ios/Pods`, `ios/DerivedData`, `secrets/` |
| `public/.well-known/apple-app-site-association` | NUEVO — Universal Links iOS |
| `public/.well-known/assetlinks.json` | NUEVO — App Links Android |

---

## 12. PLAN DE IMPLEMENTACIÓN POR SESIONES

### Sesión 1 — Static export limpio (receta refinada con gotchas)

**Objetivo**: lograr que `npm run build` (web) y `npm run build:capacitor` (out estático) pasen ambos verde, sin tocar Capacitor todavía.

**Orden de operaciones — IMPORTANTE: respetar el orden para no romper web en producción**

#### 1.1 — Cloud Functions (escribir + deploy)

1. Crear [functions/src/avatars.ts](functions/src/avatars.ts) con dos callables:
   - `processAvatar({ imageBase64, crop? }) → { large, thumb }` — Sharp resize 512×512 + 96×96 WebP, memory 512MiB, timeout 60s
   - `proxyGoogleAvatar({ url }) → { imageBase64, contentType }` — valida hostname `lh3.googleusercontent.com`, memory 256MiB, timeout 30s
   - Ambos usan `HttpsError` para errores tipados
2. Agregar `"sharp": "^0.34.5"` a `functions/package.json` dependencies
3. Agregar `export * from "./avatars"` al final de [functions/src/index.ts](functions/src/index.ts)
4. **Deploy y validar EN WEB ACTUAL antes de tocar el cliente**:
   ```bash
   cd functions && npm install && cd ..
   firebase deploy --only functions:processAvatar,functions:proxyGoogleAvatar
   ```
5. Sanity check rápido en Firebase Console → Functions: ambas aparecen activas.

#### 1.2 — Migrar clientes a httpsCallable

6. Modificar [lib/avatarProcessing.ts](lib/avatarProcessing.ts):
   - Reemplazar `fetch("/api/process-avatar", ...)` con `httpsCallable<{ imageBase64, crop? }, AvatarBlobs>(functions, "processAvatar")`
   - Helper `fileToBase64(file)` con `String.fromCharCode.apply(null, chunk)` en bloques de `0x8000` bytes (evita stack overflow con imágenes grandes)
7. Modificar [lib/avatarMigration.ts](lib/avatarMigration.ts):
   - Reemplazar `fetch("/api/proxy-image?url=...")` con `httpsCallable<{ url }, ProxyGoogleAvatarResponse>(functions, "proxyGoogleAvatar")`
   - Helper `base64ToBlob(base64, contentType)` para reconstruir Blob desde la respuesta
8. **Validar en web local con `npm run dev`**: subir avatar nuevo y triggear migración Google. Si ambos funcionan, el deploy de Functions está OK.

#### 1.3 — Eliminar API routes

9. `rm -rf app/api/process-avatar app/api/proxy-image` (o vía explorador). Si la carpeta `app/api/` queda vacía, también eliminarla.

#### 1.4 — Capa de plataforma

10. Crear [lib/platform/index.ts](lib/platform/index.ts) con `getPlatform()`, `isNative()`, `isWeb()`. Detección vía `window.Capacitor?.getPlatform()` sin importar `@capacitor/core` directamente (degrada a `"web"` si no está cargado).

#### 1.5 — Config Next.js con branch condicional

11. Refactorizar [next.config.ts](next.config.ts) en dos objetos `webConfig` y `capacitorConfig`, seleccionar según `process.env.BUILD_TARGET`. Ver código en sección 9.

#### 1.6 — Dividir las 6 rutas dinámicas

12. Para cada una de las 6 rutas, renombrar `page.tsx` → `<Nombre>Client.tsx` (manteniendo `"use client"` y todo el contenido sin cambios). Luego crear nuevo `page.tsx` server-side:

```tsx
// app/match/[id]/page.tsx (ejemplo)
import { Suspense } from "react";  // Solo si MatchClient usa useSearchParams
import MatchClient from "./MatchClient";

// Web: dynamicParams true → server-rendered on demand.
// Capacitor: scripts/build-capacitor.mjs parchea estos valores antes de `next build`.
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

export default function Page() {
  return <Suspense><MatchClient /></Suspense>;  // Suspense solo si hay useSearchParams
}
```

**`<Suspense>` requerido en:**
- `app/match/[id]/page.tsx` (MatchClient usa useSearchParams)
- `app/match/[id]/review/page.tsx` (ReviewClient usa useSearchParams)

**No requerido en:**
- `app/join/[id]/page.tsx`, `app/venues/[id]/page.tsx`, `app/venues/admin/[id]/page.tsx`, `app/bookings/[id]/page.tsx`

> Verificar con `grep useSearchParams app/.../<X>Client.tsx` antes de decidir.

13. Confirmar que cada `<X>Client.tsx` tiene `export default function ...` (debe sobrevivir el rename sin cambios).

#### 1.7 — Build script patcher

14. Crear [scripts/build-capacitor.mjs](scripts/build-capacitor.mjs):
    - Lista los 6 `page.tsx`
    - Para cada uno: lee, backup en memoria, reemplaza `true` → `false` en dynamicParams y `return [];` → `return [{ id: "_" }];` en generateStaticParams
    - `spawn("npx next build", { env: { ...process.env, BUILD_TARGET: "capacitor" }, shell: true })`
    - `try/finally`: restaurar archivos siempre, incluso si build falla
    - Si el regex de reemplazo no matchea, ABORTAR (no escribir nada) para evitar corromper archivos

15. Actualizar `package.json`:
    ```json
    "build:capacitor": "node scripts/build-capacitor.mjs"
    ```

#### 1.8 — Validación final

16. `npm run build` → debe pasar verde. Rutas dinámicas mostrarán `● (SSG)` con `generateStaticParams` vacío (renderiza on-demand para IDs reales). Verificar manualmente que `npm start && curl http://localhost:3000/match/<id-real>` responde 200.
17. `npm run build:capacitor` → debe pasar verde y generar `/out/`. Verificar que los 6 `page.tsx` quedaron RESTAURADOS al contenido web tras el build (`git diff` debería estar limpio en esos archivos).
18. `npx serve out` → navegar a `http://localhost:3000`, validar que el home carga.

**Entregable**: ambos builds verdes, web sin regresión en producción, `/out/` listo para empaquetar en Capacitor.

**No probado todavía (queda para Sesión 2)**: que `useParams()` resuelva el ID real dentro de un APK cuando se navega a `/match/abc123` (el único HTML estático generado es `/match/_/index.html`). El JS chunk debería manejar la navegación cliente correctamente, pero hay que validarlo empíricamente.

### Sesión 2 — Capacitor + Android
Tareas:
- `npm install` deps Capacitor
- `npx cap init` con app ID `com.canchita.app`
- `npx cap add android`
- Crear `assets/icon.png` y `assets/splash.png`, generar con `@capacitor/assets`
- Configurar status bar, splash, safe areas en `capacitor.config.ts`
- Implementar `lib/platform/network.ts` y `<OfflineBanner>`
- Hardware back button listener
- `npx cap sync && npx cap open android`
- Build debug + emulador

**Entregable**: APK debug instalable que muestra la app, con splash + safe areas correctos.

### Sesión 3 — Auth y Push nativos en Android
Tareas:
- Refactor [lib/auth.ts](lib/auth.ts) con wrapper de plataforma
- Configurar `google-services.json` en `android/app/`
- Implementar `lib/platform/push.ts` con `@capacitor/push-notifications`
- Migrar esquema `fcmTokens` a `Array<{ token, platform, lastSeen }>` con compat
- Actualizar [firestore.rules](firestore.rules)
- Actualizar funciones de envío de push en `functions/src/` para nuevo esquema
- Probar login y push end-to-end en Android

**Entregable**: login y push funcionando en Android, esquema FCM migrado.

### Sesión 4 — iOS + Deep links
Requiere acceso a macOS.

Tareas:
- `npx cap add ios`
- Configurar `GoogleService-Info.plist` en `ios/App/App/`
- Configurar APNs en Apple Developer Portal + Firebase Console
- Custom URL scheme `canchita://` en `Info.plist`
- Universal Links: subir `apple-app-site-association` y `assetlinks.json` a `public/.well-known/`
- Probar deep links en ambas plataformas
- Probar login y push en iOS

**Entregable**: app completa funcionando en ambas plataformas, deep links activos.

### Sesión 5 — Publicación
Tareas:
- Generar `.keystore` Android y firmar release
- Subir APK a Play Console (internal testing)
- Generar `.ipa` y subir a App Store Connect (TestFlight)
- Preparar screenshots, descripciones, política de privacidad
- Submit para review

**Entregable**: app en review en ambas stores.

---

## 13. REQUISITOS EXTERNOS (NO TÉCNICOS)

### Cuentas y costos
- **Google Play Console**: USD 25 único
- **Apple Developer Program**: USD 99/año
- **macOS para builds iOS**: Mac físico, Mac mini cloud (~USD 30/mes), o GitHub Actions con runner macOS

### Assets requeridos
- Ícono 1024x1024 PNG — **ya existe en [public/icon-1024.png](public/icon-1024.png)**
- Splash 2732x2732 PNG — **falta crear** (logo sobre fondo `#1f7a4f`)
- Screenshots por plataforma (mín. 2 por tamaño de dispositivo) — **faltan**
- Política de privacidad pública — **revisar [app/privacy/page.tsx](app/privacy/page.tsx)**, debe ser URL accesible sin login
- Descripción corta + larga en español — **falta**
- Categoría: Sports / Deportes

### Tiempo estimado total
- Desarrollo: 5 sesiones (~20-30 horas con Opus)
- Review Apple: 1-3 días promedio
- Review Google: pocas horas a 1 día
