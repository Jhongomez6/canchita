# Feature: Migración a Capacitor (Play Store + App Store)

## 📋 Specification-Driven Development (SDD)

Empaquetar la PWA Next.js actual como app nativa Android/iOS usando Capacitor, sin reescribir la UI ni la lógica de dominio.

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo
Publicar Canchita en Google Play Store y Apple App Store reusando el código Next.js + React 19 existente. Habilitar descubrimiento desde las stores oficiales (no solo "Add to Home Screen") y desbloquear features nativas (push real en iOS, biometría futura, deep links, etc.).

### Reglas de Negocio
| # | Regla | Impacto UI |
|---|-------|------------|
| 1 | La app nativa y la web deben compartir el mismo backend Firebase y datos | Usuario ve los mismos partidos en ambas plataformas |
| 2 | El login Google debe funcionar nativo en iOS/Android (no popup web) | Botón "Continuar con Google" abre flujo nativo del sistema |
| 3 | Push notifications usan APNs (iOS) y FCM (Android) directamente, no Web Push | Permiso de notificación se pide al estilo nativo |
| 4 | La app debe funcionar offline para vistas ya visitadas (cache de assets) | Splash → contenido cacheado si no hay red |
| 5 | Versionado independiente: web puede actualizar instantáneamente, móvil requiere release de store | Mostrar banner "Actualiza la app" si versión < mínima soportada |
| 6 | Deep links `canchita://join/[id]` deben abrir la app si está instalada | Compartir link de partido abre app nativa, no navegador |
| 7 | El service worker actual (`firebase-messaging-sw.js`) NO se usa en nativo | Push se gestiona vía `@capacitor/push-notifications` |

### Decisión arquitectónica clave: Static Export vs Hybrid Remote

**Opción A — Static Export (recomendada)**
- `next build` con `output: "export"` → genera HTML/JS estático en `/out`
- Capacitor empaqueta `/out` dentro del `.apk`/`.ipa`
- Pros: funciona offline, Apple no objeta, performance óptimo
- Contras: hay que migrar `next/image` a `unoptimized: true`, eliminar Server Actions y rutas dinámicas con `generateStaticParams`

**Opción B — Hybrid Remote (no recomendada)**
- Capacitor abre `https://canchita.app` directamente
- Pros: cero cambios de código
- Contras: **Apple rechaza apps que son solo un wrapper de web** (Guideline 4.2). Sin red = pantalla en blanco. Riesgo alto de rechazo.

**Decisión: Opción A** — static export + Capacitor.

---

## 2. ESCALABILIDAD

### Volumen esperado
- Build estático ~10-20 MB (HTML/JS/CSS bundleado)
- APK final estimado: 15-25 MB
- IPA final estimado: 20-30 MB
- Sin impacto en Firestore (mismas queries, mismo backend)

### Índices Firestore requeridos
- Ninguno nuevo. Reusa los índices existentes.

### Paginación
- Sin cambios. La paginación actual de matches/bookings sigue igual.

---

## 3. CONCURRENCIA SEGURA

### Operaciones que requieren `runTransaction()`
- Sin cambios — toda la lógica Firestore se mantiene idéntica.

### Race conditions identificadas
- **Token FCM/APNs duplicado**: Usuario instala app nativa Y tiene PWA en otro dispositivo → 2 tokens activos.
  - **Mitigación**: guardar tokens en array `users/{uid}.pushTokens[]` con metadata `{ token, platform: "web"|"ios"|"android", lastSeen }`. Limpiar tokens > 60 días sin uso.

- **Sesión Firebase Auth divergente**: Login nativo crea credencial separada del web.
  - **Mitigación**: usar `@capacitor-firebase/authentication` que sincroniza con SDK web.

---

## 4. SEGURIDAD

### Autenticación y autorización
- Login Google: migrar a `@capacitor-firebase/authentication` (nativo) + fallback web.
- El `uid` de Firebase es el mismo en web y nativo → reglas Firestore no cambian.

### Firestore Rules requeridas
```
// Sin cambios. Las rules actuales siguen aplicando.
// Solo agregar validación de pushTokens[] en users/{uid}:

match /users/{uid} {
  allow update: if request.auth.uid == uid
    && (!('pushTokens' in request.resource.data.diff(resource.data).affectedKeys())
        || request.resource.data.pushTokens.size() <= 10);
}
```

### Validaciones de input
- Sin cambios.

### Datos sensibles
- **API keys de Firebase** ya están expuestas en el bundle web (es normal, son públicas).
- **Service account de Firebase Admin**: NUNCA bundlear en la app nativa. Sigue siendo solo server-side (Cloud Functions).
- **Certificados de firma Android (`.keystore`)** y **provisioning profiles iOS**: guardar fuera del repo, en `secrets/` con `.gitignore`.

### Custom URL scheme y Universal Links
- Registrar `canchita://` en `AndroidManifest.xml` y `Info.plist`.
- Configurar Universal Links iOS con `apple-app-site-association` en `https://canchita.app/.well-known/`.
- Configurar Android App Links con `assetlinks.json` en el mismo path.

---

## 5. TOLERANCIA A FALLOS

### Estados de error y fallbacks
| Error | Causa probable | Fallback UI |
|-------|---------------|-------------|
| Sin conexión al iniciar | Usuario offline | Mostrar última pantalla cacheada + banner "Sin conexión" |
| Firebase Auth nativo falla | Usuario canceló o error de red | Toast "No se pudo iniciar sesión" + opción retry |
| Push notification permission denegado | Usuario rechazó permiso | Mostrar banner "Activa notificaciones en Ajustes" |
| Versión obsoleta | Cliente < versión mínima soportada | Pantalla bloqueante "Actualiza la app" con link a la store |

### Retry strategy
- Reintentos automáticos para queries Firestore (ya implementado).
- Push token registration: retry exponencial 3 veces.

### Degradación elegante
- Si push falla → la app sigue funcionando, solo se pierden notificaciones.
- Si deep link falla → fallback a abrir el navegador con la URL web.

---

## 6. UX — FLUJOS DE USUARIO

### Flujo principal (happy path)
1. Usuario descarga Canchita desde Play/App Store
2. Splash screen nativo (1-2 seg) → pantalla de login
3. Tap "Continuar con Google" → flujo nativo del sistema (no popup web)
4. Auth exitosa → home con sus partidos
5. Permite notificaciones cuando se le pregunta → token APNs/FCM registrado
6. Comparte link `canchita.app/join/abc123` → al abrirlo, deep link abre la app nativa directo en `/join/abc123`

### Estados de UI
| Estado | Qué muestra |
|--------|-------------|
| Splash | Logo + spinner (configurado en `capacitor.config.ts`) |
| Sin red | Banner superior persistente "Sin conexión" |
| Update requerido | Pantalla bloqueante con botón "Actualizar" → abre store |
| Permiso push pendiente | Banner descartable en home "Activar notificaciones" |

### Consideraciones mobile-first
- Safe areas (notch iOS): usar `env(safe-area-inset-top)` y `env(safe-area-inset-bottom)` en CSS.
- Bottom nav `pb-24` debe ajustarse a `pb-[calc(6rem+env(safe-area-inset-bottom))]`.
- Status bar: configurar color en `capacitor.config.ts` para match con tema de la app.
- Hardware back button (Android): debe navegar atrás en el router de Next, no cerrar la app.

---

## 7. UI DESIGN — COMPONENTES Y ANIMACIONES

### Componentes nuevos
- `OfflineBanner` → banner persistente cuando `@capacitor/network` reporta `connected: false`
- `UpdateRequiredScreen` → pantalla bloqueante de versión obsoleta
- `NativePushPermissionPrompt` → reemplazo de prompt web actual, usa `@capacitor/push-notifications`

### Animaciones (Framer Motion)
- Sin cambios. Framer Motion funciona idéntico en WebView nativa.

### Responsive
- Mobile: igual que ahora
- Desktop (md+): la app nativa solo se distribuye en móvil; los tablets iPad usan layout móvil (no se publica versión iPad-optimized en v1)

### Splash screen y íconos
- Generar con `@capacitor/assets`:
  - `assets/icon.png` (1024x1024) → genera todos los tamaños
  - `assets/splash.png` (2732x2732) → genera splashes iOS/Android

---

## 8. ANALYTICS

| Evento | Trigger | Propiedades |
|--------|---------|-------------|
| `app_installed_native` | Primera apertura tras instalar | `platform: "ios"\|"android"`, `app_version` |
| `native_push_permission_granted` | Usuario acepta permiso de push | `platform` |
| `native_push_permission_denied` | Usuario rechaza permiso de push | `platform` |
| `deep_link_opened` | App se abre vía deep link | `path`, `source` |
| `app_update_required_shown` | Se muestra pantalla de update obligatorio | `current_version`, `min_version` |

Detectar plataforma con `Capacitor.getPlatform()` → `"web" | "ios" | "android"`. Incluir como propiedad global en todos los eventos.

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

### Configuración Next.js
`next.config.ts` necesita branch condicional para builds nativos:
```typescript
const isCapacitor = process.env.BUILD_TARGET === "capacitor";

const nextConfig: NextConfig = {
  ...(isCapacitor && {
    output: "export",
    images: { unoptimized: true },
    trailingSlash: true,
  }),
  // ... resto de config web
};
```

Nuevo script en `package.json`:
```json
"build:capacitor": "BUILD_TARGET=capacitor next build && npx cap sync"
```

### Capa de dominio (`lib/domain/`)
- Sin cambios. Toda la lógica pura sigue funcionando.

### Capa de plataforma (nueva: `lib/platform/`)
- `lib/platform/index.ts` → `getPlatform()`, `isNative()`, `isWeb()`
- `lib/platform/auth.ts` → wrapper que usa Capacitor Firebase Auth en nativo, SDK web en web
- `lib/platform/push.ts` → wrapper que usa Capacitor Push en nativo, FCM web en web
- `lib/platform/network.ts` → estado de conexión

### Capa de API (`lib/`)
- `lib/users.ts` → modificar registro de token para soportar array `pushTokens[]`
- Resto sin cambios.

### Componentes UI (`app/`)
- `app/layout.tsx` → inicializar Capacitor plugins (status bar, splash hide, network listener) en un `<CapacitorProvider>` cliente
- `app/login/page.tsx` → usar `lib/platform/auth.ts` en lugar de Firebase web directo

### Estructura de carpetas nueva
```
canchita/
├── android/              # Proyecto Android (gitignored excepto config)
├── ios/                  # Proyecto iOS (gitignored excepto config)
├── capacitor.config.ts   # Config principal de Capacitor
├── lib/platform/         # Wrappers web/nativo
└── assets/
    ├── icon.png          # 1024x1024 fuente
    └── splash.png        # 2732x2732 fuente
```

### Limitaciones conocidas que requieren refactor
| Feature actual | Problema en static export | Solución |
|---|---|---|
| `next/image` con remotePatterns | No funciona con `unoptimized: true` | Usar `<img>` plano o configurar Firebase Storage URLs directas |
| Server Actions (si las hay) | No funcionan en static export | Migrar a Cloud Functions o llamadas Firestore directas |
| Rutas dinámicas `[id]` sin `generateStaticParams` | Error en build | Usar `dynamicParams: true` + cliente fetcheado, o pre-generar rutas conocidas |
| API routes (`app/api/`) | No funcionan en static export | Mover a Cloud Functions |
| `firebase-messaging-sw.js` | No se usa en nativo | Mantener para web, en nativo usar `@capacitor/push-notifications` |

**Auditoría previa requerida**: antes de implementar, revisar todo el repo y listar:
- Todas las rutas dinámicas → confirmar que funcionan con export
- Todas las llamadas a `next/image` → contar y planear migración
- Cualquier API route o Server Action en uso

---

## 10. CRITERIOS DE ACEPTACIÓN

- [ ] `npm run build:capacitor` genera `/out` sin errores
- [ ] App Android compila y se ejecuta en emulador
- [ ] App iOS compila y se ejecuta en simulador (requiere macOS)
- [ ] Login Google funciona nativo en Android e iOS
- [ ] Push notification se recibe en Android (FCM) e iOS (APNs)
- [ ] Deep link `canchita://join/abc123` abre la app en la pantalla correcta
- [ ] Hardware back button (Android) navega atrás correctamente
- [ ] Safe areas se respetan en iPhone con notch (sin contenido tapado)
- [ ] Splash screen se muestra y oculta correctamente
- [ ] Banner "Sin conexión" aparece al perder red
- [ ] App publicada en Play Store internal testing
- [ ] App publicada en TestFlight (iOS)
- [ ] Auditoría: cero `next/image` con optimización en builds nativos
- [ ] Versión web sigue funcionando idéntica (no hay regresión)

---

## 11. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---------|--------|
| `package.json` | Agregar deps Capacitor + script `build:capacitor` |
| `next.config.ts` | Branch condicional `BUILD_TARGET=capacitor` |
| `capacitor.config.ts` | NUEVO — config de app ID, splash, plugins |
| `lib/platform/index.ts` | NUEVO — detección de plataforma |
| `lib/platform/auth.ts` | NUEVO — wrapper auth web/nativo |
| `lib/platform/push.ts` | NUEVO — wrapper push web/nativo |
| `lib/platform/network.ts` | NUEVO — estado de conexión |
| `app/layout.tsx` | Inicializar Capacitor plugins |
| `app/login/page.tsx` | Usar wrapper de auth |
| `lib/users.ts` | Soporte `pushTokens[]` con metadata |
| `app/globals.css` | Safe areas con `env(safe-area-inset-*)` |
| `firestore.rules` | Validación de `pushTokens[]` size |
| `assets/icon.png` | NUEVO — fuente de íconos |
| `assets/splash.png` | NUEVO — fuente de splash |
| `android/` | NUEVO — proyecto Android generado |
| `ios/` | NUEVO — proyecto iOS generado |
| `.gitignore` | Excluir `android/app/build`, `ios/Pods`, secrets |
| `public/.well-known/apple-app-site-association` | NUEVO — Universal Links iOS |
| `public/.well-known/assetlinks.json` | NUEVO — App Links Android |

---

## 12. PLAN DE IMPLEMENTACIÓN POR SESIONES

Recomiendo dividir en 4-5 sesiones con Opus:

### Sesión 1 — Auditoría + Static Export
- Auditar `next/image`, rutas dinámicas, API routes, Server Actions
- Configurar `next.config.ts` con branch `BUILD_TARGET=capacitor`
- Lograr que `next build` con export funcione end-to-end
- **Entregable**: `/out` se genera sin errores y sirve correctamente con `npx serve out`

### Sesión 2 — Setup Capacitor + Android
- Instalar Capacitor, generar proyectos Android/iOS
- Configurar `capacitor.config.ts`, íconos, splash con `@capacitor/assets`
- Implementar `lib/platform/index.ts` y `network.ts`
- Build Android funcional en emulador
- **Entregable**: APK debug instalable que muestra la app

### Sesión 3 — Auth nativo + Push nativo
- Integrar `@capacitor-firebase/authentication` para login Google
- Integrar `@capacitor/push-notifications` con FCM/APNs
- Refactorizar `users.ts` para `pushTokens[]`
- **Entregable**: login y push funcionando en Android nativo

### Sesión 4 — Deep links + Safe areas + iOS
- Configurar custom scheme + Universal Links / App Links
- Ajustar CSS con safe areas
- Hardware back button
- Build iOS en simulador (requiere macOS)
- **Entregable**: app completa funcionando en ambas plataformas

### Sesión 5 — Publicación
- Generar keystore Android y firmar release
- Subir a Play Console (internal testing)
- Subir a App Store Connect (TestFlight)
- Preparar screenshots, descripciones, política de privacidad
- **Entregable**: app en review en ambas stores

---

## 13. REQUISITOS EXTERNOS (NO TÉCNICOS)

### Cuentas y costos
- **Google Play Console**: pago único USD 25
- **Apple Developer Program**: USD 99/año
- **macOS para builds iOS**: Mac físico, Mac mini cloud (~USD 30/mes), o GitHub Actions con runner macOS

### Assets requeridos
- Ícono 1024x1024 PNG
- Splash 2732x2732 PNG
- Screenshots por plataforma (mín. 2 por tamaño de dispositivo)
- Política de privacidad pública (URL)
- Descripción corta + larga en español
- Categoría: Sports / Deportes

### Tiempo estimado total
- Desarrollo: 4-5 sesiones (~15-25 horas con Opus)
- Review Apple: 1-3 días promedio
- Review Google: pocas horas a 1 día
