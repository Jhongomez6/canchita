# Feature: Firebase Analytics

## 📋 Specification-Driven Development (SDD)

Este documento explica cómo la **especificación funcional** gobierna completamente la implementación de la feature "Firebase Analytics".

---

## 1. ESPECIFICACIÓN FUNCIONAL (Fuente de Verdad)

### Objetivo
Instrumentar la app con Firebase Analytics (GA4) para medir activación, retención, engagement y crecimiento. Permite responder preguntas clave de producto y tomar decisiones basadas en datos.

### Costo
Firebase Analytics es **100% gratuito** — eventos ilimitados, usuarios ilimitados. Solo BigQuery export (opcional) tiene costo aparte.

### Eventos Automáticos (sin código)
Firebase Analytics trackea automáticamente:
- `session_start`, `first_open`, `screen_view` (navegación por página)
- DAU/WAU/MAU (usuarios activos diarios/semanales/mensuales)
- Retención día 1, 7, 30
- Demografía, dispositivos, país
- Engagement time por sesión

### Eventos Custom

| Evento | Cuándo se dispara | Parámetros | Pregunta que responde |
|--------|-------------------|------------|----------------------|
| `user_registered` | Se crea perfil nuevo en Firestore | — | P1: Activación |
| `onboarding_completed` | Se guarda onboarding con rating calculado | — | P1: Activación |
| `match_joined` | Jugador se une a un partido | `match_id` | P1: Activación |
| `attendance_confirmed` | Jugador confirma asistencia | `match_id` | P1: Activación |
| `match_invitation_copied` | Admin copia link/código para WhatsApp | `match_id` | P2: Crecimiento viral |
| `match_joined_via_explore` | Se une desde `/explore` | `match_id` | P2: Crecimiento viral |
| `guest_added` | Jugador agrega invitado al partido | `match_id` | P2: Crecimiento viral |
| `match_created` | Admin crea partido | `match_id` | P3: Ciclo del admin |
| `teams_balanced` | Admin guarda equipos balanceados | `match_id` | P3: Ciclo del admin |
| `match_closed` | Admin cierra partido y procesa stats | `match_id` | P3: Ciclo del admin |
| `pwa_install_accepted` | Usuario acepta instalar PWA | — | P4: Valor de la PWA |
| `pwa_install_dismissed` | Usuario rechaza instalar PWA | — | P4: Valor de la PWA |
| `push_enabled` | Usuario activa notificaciones push | — | P5: Push y retención |
| `push_prompt_dismissed` | Rechaza prompt de push | — | P5: Push y retención |
| `mvp_voted` | Jugador vota por MVP | `match_id` | P6: Engagement |
| `stats_viewed` | Ve su card/stats de jugador | — | P6: Engagement |
| `player_card_viewed` | Abre la card de otro jugador | — | P6: Engagement |

### User Properties (Segmentación)

| Property | Valores | Descripción |
|----------|---------|-------------|
| `app_mode` | `standalone` / `browser` | Permite segmentar TODOS los reportes por PWA vs browser |
| `platform` | `ios` / `android` / `desktop` | Distribución de dispositivos |
| `user_role` | `player` / `location_admin` / `team_admin` / `super_admin` | Comportamiento por rol |

### Reglas de Negocio

| # | Regla | Implementación |
|---|-------|----------------|
| 1 | Analytics solo se inicializa en browser (no SSR) | `initAnalytics()` en `lib/analytics.ts` usa `isSupported()` |
| 2 | Si analytics no está soportado, las llamadas fallan silenciosamente | Cada helper verifica instancia antes de llamar `logEvent` |
| 3 | `measurementId` es requerido para inicializar | Variable de entorno `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` |
| 4 | `userId` se setea al autenticarse y se limpia al cerrar sesión | `identifyUser()` en `lib/analytics.ts` |
| 5 | User properties se actualizan en cada sesión | Set en `AuthContext` al montar y cuando llega el profile |
| 6 | `ensureUserProfile` retorna `{ isNewUser }` para distinguir registro de login | Modificado en `lib/users.ts` |
| 7 | Eventos de match incluyen `match_id` como parámetro | Permite correlacionar acciones con partidos específicos |

---

## 2. ARQUITECTURA DE LA IMPLEMENTACIÓN

```
ESPECIFICACIÓN (Fuente de Verdad)
        ↓
   ┌────┴─────┐
   ▼          ▼
 MÓDULO    INSTRUMENTACIÓN
 CENTRAL   (1 línea por punto de acción)
   │
   ▼
lib/analytics.ts
  - initAnalytics()
  - identifyUser()
  - setAnalyticsUserProperties()
  - logXxx() helpers tipados
```

### Capa 1: Configuración (`lib/firebase.ts`)
Agrega `measurementId` al objeto `firebaseConfig`.

### Capa 2: Módulo Central (`lib/analytics.ts`)
- Inicialización lazy con cache de instancia
- Verificación de soporte (`isSupported()`)
- Helpers tipados que encapsulan `logEvent()`, `setUserId()`, `setUserProperties()`
- Manejo silencioso de errores (no rompe la app si analytics falla)

### Capa 3: Instrumentación (archivos existentes)
Llamadas de 1 línea en los puntos de acción:

| Archivo | Eventos |
|---------|---------|
| `lib/AuthContext.tsx` | `user_registered`, init, userId, user properties |
| `lib/matches.ts` | `match_created`, `match_joined`, `attendance_confirmed`, `teams_balanced`, `match_closed`, `mvp_voted` |
| `lib/guests.ts` | `guest_added` |
| `hooks/usePWAInstall.ts` | `pwa_install_accepted`, `pwa_install_dismissed` |
| `app/onboarding/page.tsx` | `onboarding_completed` |
| `app/explore/page.tsx` | `match_joined_via_explore` |
| `app/match/[id]/page.tsx` | `match_invitation_copied` |
| `app/profile/page.tsx` | `stats_viewed` |
| `components/PlayerCardDrawer.tsx` | `player_card_viewed` |
| `lib/firebase-messaging.ts` | `push_enabled` |
| `app/page.tsx` | `push_prompt_dismissed` |

---

## 3. FUNNELS DE PRODUCTO

### Funnel de Activación (P1)
```
user_registered → onboarding_completed → match_joined → attendance_confirmed
```

### Funnel del Admin (P3)
```
match_created → teams_balanced → match_closed
```

### Loop Viral (P2)
```
match_invitation_copied → match_joined / match_joined_via_explore → guest_added
```

---

## 4. CRITERIOS DE ACEPTACIÓN

- [ ] Firebase Analytics inicializa correctamente en browser
- [ ] No hay errores en SSR (server-side rendering)
- [ ] `user_registered` se dispara solo para usuarios nuevos, no en cada login
- [ ] User properties `app_mode`, `platform`, `user_role` aparecen en DebugView
- [ ] Todos los eventos aparecen en Firebase Console → Analytics → DebugView
- [ ] La app no se rompe si `measurementId` no está configurado
