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
| `mvp_voted` | Jugador vota por MVP | `match_id`, `target_uid` | P6: Engagement |
| `waitlist_joined` | Jugador se anota en lista de espera | `match_id` | P1: Activación |
| `attendance_unconfirmed` | Jugador libera su cupo | `match_id` | P6: Engagement |
| `waitlist_left` | Jugador sale de lista de espera | `match_id` | P6: Engagement |
| `guest_removed` | Se elimina un invitado | `match_id` | P6: Engagement |
| `match_map_opened` | Jugador abre el mapa del partido | `match_id` | P6: Engagement |
| `match_code_copied` | Jugador copia el código del partido | `match_id` | P6: Engagement |
| `match_map_direction_clicked` | Click en Google Maps o Waze | `match_id`, `provider` | P6: Engagement |
| `stats_viewed` | Ve su card/stats de jugador | — | P6: Engagement |
| `player_card_viewed` | Abre la card de otro jugador | — | P6: Engagement |
| `organizer_contacted` | Jugador contacta organizador por WhatsApp | `match_id` | P6: Engagement |
| `apply_cta_shown` | Se muestra banner CTA de Team Admin | — | P1: Activación |
| `apply_cta_clicked` | Click en Ver más del CTA | — | P1: Activación |
| `apply_cta_dismissed` | Click en descartar banner CTA | — | P1: Activación |
| `apply_page_viewed` | Al entrar a `/apply` | — | P7: Conversión Team Admin |
| `apply_step_completed` | Al completar un paso (1, 2, 3) | `step` | P7: Conversión Team Admin |
| `apply_back_clicked` | Al retroceder o salir de un paso | `step` | P7: Conversión Team Admin |
| `apply_submitted` | Al intentar enviar la solicitud | — | P7: Conversión Team Admin |
| `apply_success` | Al recibir éxito de la API | — | P7: Conversión Team Admin |
| `apply_error` | Si la API de aplicación falla | `error_message` | P7: Conversión Team Admin |
| `hero_card_clicked` | Click en el CTA del Hero Card | `match_id`, `action_type` | P8: Engagement Home |
| `quick_stats_detailed_clicked` | Click en "Ver estadísticas" de rachas | — | P8: Engagement Home |
| `full_history_clicked` | Click en "Ver historial completo" | — | P8: Engagement Home |
| `join_by_code_clicked` | Envío de formulario "Unirme con código" | `source` | P8: Viralidad |
| `notifications_opened` | Click en la campana de notificaciones | — | P8: Engagement |
| `pwa_install_clicked` | Click en el botón de instalar PWA (Perfil) | — | P8: PWA |
| `feedback_opened` | Apertura del widget de feedback beta | — | P8: Engagement |
| `tooltip_opened` | User opens an informational tooltip | `tooltip_name` | P8: Engagement |
| `match_report_copied` | Admin copies or shares a match report | `match_id`, `report_type` (invitation, roster, teams, summary), `channel` (clipboard, whatsapp, telegram) | P8: Engagement |
| `match_closed` | Admin permanently closes a match | `match_id` | P8: Engagement |
| `match_deleted` | Admin deletes a match | `match_id` | P8: Engagement |
| `teams_balanced` | Admin balances teams automatically | `match_id` | P8: Engagement |
| `teams_confirmed` | Admin publishes teams to players | `match_id` | P8: Engagement |
| `push_reminders_sent` | Admin sends manual push notifications | `match_id` | P8: Engagement |
| `match_player_added` | Admin manually adds a player | `match_id`, `player_type` (registered, manual) | P8: Engagement |
| `attendance_marked` | Admin marks player attendance | `match_id`, `status` (present, late, no_show, all_present) | P8: Engagement |
| `attendance_mode_opened` | Admin opens "Pasar Lista" mode | `match_id` | P8: Engagement |
| `match_admin_tab_switched` | Admin navigates between admin tabs | `match_id`, `tab` | P8: Engagement |
| `match_setting_updated` | Admin updates a match setting | `match_id`, `setting` (max_players, duration, allow_guests), `value` | P8: Engagement |
| `match_instructions_saved` | Admin saves match instructions | `match_id` | P8: Engagement |

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
| `app/profile/page.tsx` | `stats_viewed`, `apply_cta_clicked` |
| `components/PlayerCardDrawer.tsx` | `player_card_viewed` |
| `app/join/[id]/page.tsx` | `organizer_contacted` |
| `lib/firebase-messaging.ts` | `push_enabled` |
| `app/page.tsx` | `push_prompt_dismissed`, `apply_cta_shown`, `apply_cta_clicked`, `apply_cta_dismissed` |

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
