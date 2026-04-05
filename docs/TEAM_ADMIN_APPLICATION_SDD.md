# Feature: Aplicación para Team Admin

## 📋 Specification-Driven Development (SDD)

Flujo in-app que permite a usuarios interesados en organizar partidos **postularse** para recibir el rol `team_admin`. El super_admin revisa las solicitudes con contexto completo del perfil y aprueba o rechaza con un click. Diseñado para controlar la calidad de admins durante la etapa temprana de la plataforma.

---

## 1. ESPECIFICACIÓN FUNCIONAL (Fuente de Verdad)

### Objetivo

Reemplazar la asignación manual directa desde `/admin/users` por un proceso documentado donde:
- El aplicante completa un formulario con información real de su grupo
- El super_admin recibe un snapshot del perfil + respuestas contextuales
- La aprobación es un solo click que dispara la asignación automática de rol
- El proceso queda trazado en Firestore para auditoría

### Entidad: TeamAdminApplication

```typescript
interface TeamAdminApplication {
  uid: string;                          // UID del aplicante
  appliedAt: string;                    // ISO timestamp
  status: "pending" | "approved" | "rejected";
  reviewedBy?: string;                  // UID del super_admin que revisó
  reviewedAt?: string;                  // ISO timestamp de la revisión
  rejectionReason?: string;             // Motivo en caso de rechazo

  // Snapshot del perfil al momento de aplicar (no mutable)
  profileSnapshot: {
    name: string;
    phone: string;
    played: number;
    noShows?: number;
    commitmentScore?: number;           // Calculado con calcCommitmentScore()
    weeklyStreak?: number;
    memberSince: string;                // profile.createdAt
  };

  // Respuestas del formulario
  groupSize: "5-10" | "11-20" | "21-40" | "40+";
  frequency: "weekly" | "2-3x-week" | "monthly";
  experience: "<3m" | "3-12m" | "1-3y" | "3y+";
  venueName: string;
  venueCity: string;
  hasVenueAgreement: "yes" | "no" | "in-progress";
  currentCommunicationChannel: string;
  toolsFeedback: string;                // Qué usa hoy y qué le gusta/disgusta
  problemToSolve: string;               // Qué problema espera resolver con la app
  useCases: string[];                   // Para qué quiere usar la app como admin
  socialLink?: string;                  // Red social del grupo (opcional)
  feedbackWillingness: "yes-call" | "survey-only" | "no";
  groupDescription?: string;            // Descripción libre del grupo (opcional)
  termsAccepted: boolean;
}
```

### Reglas de Negocio

| # | Regla | Implementación |
|---|-------|----------------|
| 1 | Solo usuarios con onboarding completo pueden aplicar | `canApply()` verifica `initialRatingCalculated === true` |
| 2 | Solo usuarios con teléfono verificado pueden aplicar | `canApply()` verifica `profile.phone` |
| 3 | Solo puede existir una solicitud activa por usuario | Firestore doc `applications/{uid}` — el UID es la clave |
| 4 | Un usuario con solicitud pendiente no puede volver a enviar | `canApply()` verifica que no haya `status: "pending"` activo |
| 5 | Un usuario rechazado puede volver a aplicar (sobrescribe el doc) | Al re-aplicar se actualiza el doc existente con nuevas respuestas |
| 6 | Las stats del perfil se guardan en snapshot inmutable al momento de aplicar | `profileSnapshot` se construye en el submit, no se actualiza después |
| 7 | Solo super_admin puede aprobar o rechazar solicitudes | Verificación en `lib/teamAdminApplications.ts` + Firestore Rules |
| 8 | Al aprobar, se asigna automáticamente `adminType: "team_admin"` | `approveApplication()` llama la lógica existente de asignación de roles |
| 9 | Al aprobar, el usuario recibe notificación push + in-app | `sendApplicationResultNotification()` |
| 10 | Al rechazar, el motivo es obligatorio y llega al usuario por in-app notification | Formulario de rechazo requiere `rejectionReason` |
| 11 | Usuarios que ya son admin no ven el CTA en su perfil | Se verifica `isAdmin(profile)` en el perfil |

---

## 2. FLUJO COMPLETO

### Flujo del aplicante

```
[Perfil] → Sección "¿Quieres organizar partidos?"
    │
    ├─ (no aplicó) → Botón "Ver más →" → /apply
    ├─ (pendiente) → Badge "En revisión" (sin botón)
    └─ (rechazado) → Muestra motivo + "Volver a aplicar" → /apply

[/apply — Pantalla 0: Pitch]
    ¿Qué es un Team Admin? / ¿Qué resolvemos? / ¿Qué esperamos?
    → "Quiero aplicar →"

[/apply — Paso 1/3: Tu grupo]
    Tamaño del grupo / Frecuencia / Experiencia / Cancha / Acuerdo con cancha

[/apply — Paso 2/3: Herramientas y motivación]
    Canal actual / Herramientas previas / Problema a resolver

[/apply — Paso 3/3: Uso y compromiso]
    Casos de uso / Red social / Disposición para feedback / Descripción / Términos

    → Submit → Toast "Solicitud enviada"
```

### Flujo del super_admin

```
[/admin/applications] → Lista de solicitudes (badge en Usuarios del bottom nav)
    │
    ├─ Pendientes primero, luego historial
    ├─ Cada card: nombre, foto, stats snapshot + respuestas
    │
    ├─ Aprobar → Modal de confirmación → asigna team_admin → notifica usuario
    └─ Rechazar → Modal con campo de motivo → guarda motivo → notifica usuario
```

---

## 3. PANTALLA 0 — PITCH (Antes del formulario)

**¿Qué es un Team Admin en La Canchita?**
- Eres el organizador: creas el partido, gestionas la lista y armas los equipos
- Puedes seguir jugando: el rol de admin no reemplaza al de jugador

**¿Qué te resolvemos?**
- Adiós a los mensajes de WhatsApp para confirmar asistencia
- Notificaciones y recordatorios automáticos del partido para tus jugadores
- Equipos equilibrados en segundos
- Ve el historial de asistencia de cada jugador y detecta quién siempre cumple y quién falla
- Posibilidad de compartir el partido con jugadores nuevos cuando faltan confirmados

**¿Qué esperamos de ti?**
- Usar la app con tu grupo real (no para testear)
- Compartir feedback honesto sobre lo que funciona y lo que no
- Reportar cualquier problema que encuentres

---

## 4. PREGUNTAS DEL FORMULARIO

### Paso 1 de 3 — Tu grupo

1. **¿Cuántas personas integran tu grupo de fútbol?**
   `"5-10" | "11-20" | "21-40" | "40+"`

2. **¿Con qué frecuencia organizas partidos?**
   `"weekly"` (1 vez/semana) | `"2-3x-week"` (2-3 veces/semana) | `"monthly"` (1-3 veces/mes)

3. **¿Hace cuánto tiempo organizas estos partidos?**
   `"<3m"` | `"3-12m"` | `"1-3y"` | `"3y+"`

4. **¿En qué cancha/s juegas habitualmente?** (texto libre)
   + **Ciudad** (texto libre)

5. **¿Tienes un acuerdo con la cancha (horario fijo, precio pactado)?**
   `"yes"` | `"no"` | `"in-progress"`

### Paso 2 de 3 — Herramientas y motivación

6. **¿Cómo comunicas hoy los partidos a tu grupo?**
   Opciones: WhatsApp / Instagram / Boca en boca / Otra app + campo abierto

7. **¿Has utilizado otras herramientas similares? ¿Qué es lo que más te gusta y lo que más te disgusta de ellas?** (texto libre)

8. **¿Qué problema tienes hoy al organizar partidos que esperas resolver con La Canchita?** (texto libre)
   — *Feedback directo de producto*

### Paso 3 de 3 — Uso y compromiso

9. **¿Para qué quieres usar La Canchita como admin?** (checkbox múltiple)
   - Organizar convocatorias
   - Llevar lista de asistencia
   - Armar equipos equilibrados
   - Cobrar cuota del partido
   - Compartir el partido con jugadores nuevos

10. **Red social del grupo** — Instagram, WhatsApp Community, etc. (opcional)

11. **¿Estarías dispuesto a darnos feedback mensual a través de una breve llamada o encuesta para mejorar la app?** *(The Golden Question)*
    `"yes-call"` (Sí, con gusto) | `"survey-only"` (Prefiero solo la encuesta) | `"no"` (Por ahora no)

12. **Cuéntanos algo sobre tu equipo** (opcional, max 280 chars)
    Placeholder: *"¿Cómo surgió el grupo, qué los une, algún dato curioso...?"*

13. **Checkbox de términos:** "Entiendo que soy responsable de la información de mi grupo y que La Canchita puede revocar el acceso si se hace mal uso."

---

## 5. VALIDACIONES AUTOMÁTICAS (gates — bloquean acceso al formulario)

```typescript
// lib/domain/teamAdminApplication.ts
export type ApplicationValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

export function canApply(
  profile: UserProfile,
  existingApplication?: TeamAdminApplication
): ApplicationValidationResult {
  if (!profile.initialRatingCalculated)
    return { ok: false, reason: "Debes completar tu perfil de jugador primero" };
  if (!profile.phone)
    return { ok: false, reason: "Necesitas verificar tu número de teléfono" };
  if (existingApplication?.status === "pending")
    return { ok: false, reason: "Ya tienes una solicitud en revisión" };
  return { ok: true };
}
```

**Stats informativas** (no bloquean, se incluyen en el snapshot para el admin):
| Campo | Fuente | Qué indica |
|-------|--------|------------|
| `played` | `profile.stats.played` | Experiencia en la plataforma |
| `noShows` | `profile.stats.noShows` | Confiabilidad |
| `commitmentScore` | `calcCommitmentScore(stats)` | Score 0-99 de compromiso |
| `weeklyStreak` | `profile.weeklyStreak` | Regularidad de juego |
| `memberSince` | `profile.createdAt` | Antigüedad en la app |

---

## 6. PUNTOS DE ENTRADA EN LA UI

### Para jugadores — CTA en Inicio y Perfil (`app/page.tsx` y `app/profile/page.tsx`)

Nueva sección entre Estadísticas y Notificaciones (Perfil) y Banner en pantalla principal (Inicio), visible solo si `!isAdmin(profile)`:

```
Estados posibles:
├─ Inicio/Home   → Banner promocional con botón "Descartar" que oculta permanentemente marcando `applyCTADismissed` en su perfil, o botón "Ver más"
├─ Perfil (Sin)  → "¿Quieres organizar partidos?" + botón "Ver más →" → /apply
├─ Perfil (Pend) → "Solicitud enviada" + badge "En revisión"
└─ Perfil (Rech) → "Solicitud no aprobada" + motivo + "Volver a aplicar →"
```

### Para super_admin — Panel de revisión

- **Home Quick Action** (`app/page.tsx`): Botón "Solicitudes" en el banner de acciones rápidas (Emerald/Amber style) con badge de notificaciones en tiempo real.
- **Bottom nav** (`components/BottomNav.tsx`): badge numérico en ítem "Usuarios" con conteo de `pending`.
- **Header** (`components/Header.tsx`): link "Aplicaciones" en navbar desktop (entre Usuarios y Ranking).
- **Diseño**: Siguiendo la estética **Light Mode** de la app (Slate backgrounds, white cards, emerald accents).

---

## 7. ARQUITECTURA DE LA IMPLEMENTACIÓN

### Capa Dominio (`lib/domain/teamAdminApplication.ts`)
- Tipo `TeamAdminApplication`
- Función `canApply(profile, existingApplication?)`
- Función `buildProfileSnapshot(profile)` — construye el snapshot al momento de enviar

### Capa API (`lib/teamAdminApplications.ts` y `lib/users.ts`)
- `getMyApplication(uid)` — lee `applications/{uid}`
- `submitApplication(uid, formData)` — crea o sobreescribe (para re-aplicar)
- `getPendingApplications()` — lista para el admin (filtrada por `status: "pending"`)
- `getAllApplications()` — historial completo para el admin
- `approveApplication(applicationUid, reviewerUid)` — actualiza status + asigna rol
- `rejectApplication(applicationUid, reviewerUid, reason)` — actualiza status + guarda motivo
- `getPendingApplicationsCount()` — para el badge del bottom nav
- `dismissApplyCTA(uid)` en `lib/users.ts` — actualiza `applyCTADismissed = true`

### Capa UI
- `app/apply/page.tsx` — Pitch + formulario multi-paso (3 pasos) — Light Theme consistently
- `app/admin/applications/page.tsx` — Panel de revisión solo super_admin (Light Theme)
- `app/profile/page.tsx` — Nueva sección con estado de aplicación
- `app/page.tsx` — Banner promocional (CTA) + Quick Action (Super Admin Access)
- `components/BottomNav.tsx` — Badge en "Usuarios"
- `components/Header.tsx` — Link "Aplicaciones"

### Seguridad (`firestore.rules`)
- `applications/{uid}`: el owner puede crear/leer su propia solicitud
- Solo super_admin puede leer todas las solicitudes
- Solo super_admin puede actualizar `status`, `reviewedBy`, `reviewedAt`, `rejectionReason`

---

## 8. CRITERIOS DE ACEPTACIÓN ✅

### Criterio 1 — Gates de acceso
**Given** un usuario sin onboarding completado o sin teléfono
**When** intenta acceder a `/apply`
**Then** ve mensaje explicativo y botón para completar lo que falta

### Criterio 2 — Formulario completo
**Given** un usuario eligible
**When** accede a `/apply`
**Then** ve la pantalla de pitch y puede navegar los 3 pasos del formulario

### Criterio 3 — Envío y estado
**Given** un usuario que completó el formulario
**When** hace submit
**Then** se crea el doc en `applications/{uid}`, ve toast de confirmación y su perfil muestra "En revisión"

### Criterio 4 — Panel admin
**Given** un super_admin
**When** accede a `/admin/applications`
**Then** ve la lista de aplicaciones con stats del perfil y respuestas del formulario

### Criterio 5 — Aprobación
**Given** un super_admin aprueba una solicitud
**When** confirma en el modal
**Then** el usuario recibe `adminType: "team_admin"` + notificación y puede crear partidos privados

### Criterio 6 — Rechazo
**Given** un super_admin rechaza con un motivo
**When** confirma en el modal
**Then** el usuario recibe notificación in-app con el motivo y puede volver a aplicar

### Criterio 7 — Re-aplicación
**Given** un usuario rechazado
**When** vuelve a completar y enviar el formulario
**Then** el doc existente se sobrescribe con las nuevas respuestas y status: "pending"

### Criterio 8 — Usuarios que ya son admin
**Given** un usuario que ya tiene rol de admin
**When** accede a su perfil
**Then** no ve la sección de aplicación para team admin

---

## 9. ARCHIVOS INVOLUCRADOS

| Capa | Archivo | Responsabilidad |
|------|---------|----------------|
| Dominio | `lib/domain/teamAdminApplication.ts` | Tipo, `canApply()`, `buildProfileSnapshot()` |
| API | `lib/teamAdminApplications.ts` | CRUD Firestore para applications |
| Seguridad | `firestore.rules` | Reglas para collection `applications` |
| UI | `app/apply/page.tsx` | Pitch + formulario multi-paso |
| UI | `app/admin/applications/page.tsx` | Panel de revisión super_admin |
| UI | `app/profile/page.tsx` | Sección CTA / estado de aplicación |
| UI | `app/page.tsx` | Banner promocional CTA |
| UI | `components/BottomNav.tsx` | Badge pendientes en ítem Usuarios |
| UI | `components/Header.tsx` | Link Aplicaciones en navbar desktop |
