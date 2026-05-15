# Feature: Onboarding de Nivel (Cold Start)

## 📋 Specification-Driven Development (SDD)

Sistema de evaluación inicial para eliminar subjetividad mediante hitos claros.

---

## 1. ESPECIFICACIÓN FUNCIONAL (Fuente de Verdad)

### Objetivo
Calcular el rating inicial de un jugador nuevo usando hitos objetivos en lugar de autoevaluación subjetiva.

### Fórmula de Rating

| Componente | Valores |
|---|---|
| Base | 200 PP |
| Técnica (1-5) | [0, 80, 160, 240, 320] |
| Físico (1-5) | [0, 50, 100, 150, 200] |
| Escuela de fútbol | +100 |
| Torneos competitivos | +60 |
| Frecuencia | occasional(0), weekly(60), intense(120) |
| Edad 18-35 | +50 |
| Edad 36-45 | 0 |
| Edad 46+ | -50 |
| **Cap** | [100, 950] |

**Rebalanceo (2026-05-15):** El físico subió de 160 → 200 puntos máx (+25%) y torneos bajó de 100 → 60 puntos (-40%). Mantiene el mismo cap, así que los ratings históricos no requieren recálculo de cap.

### Mapeo a Nivel (4 niveles)
| Rating | Nivel |
|---|---|
| < 320 | 1 (Básico) 🌱 |
| 320–500 | 2 (Intermedio) ⚽ |
| 501–700 | 3 (Avanzado) ⚡ |
| > 700 | 4 (Elite) 🔥 |

### Metadatos de Perfil
- Fecha de nacimiento: `birthdate` (YYYY-MM-DD) — fuente de verdad permanente
- Sexo: male / female / other
- Pie dominante: left / right / ambidextrous
- Cancha preferida: 6v6 / 9v9 / 11v11
- Nivel Técnico: 1-5
- Condición Física: 1-5
- Trayectoria: escuela (bool), torneos (bool)
- Frecuencia: occasional / weekly / intense

### Edad — Modelo de Datos
La edad **nunca se almacena**; siempre se calcula desde `birthdate`:
```typescript
getAgeFromBirthdate(birthdate: string): number  // lib/domain/user.ts
```
Usuarios legacy con campo `age: number` (sin `birthdate`) mantienen compatibilidad hacia atrás — la UI usa `age` como fallback si `birthdate` no existe.

### Reglas de Negocio

| # | Regla | Implementación |
|---|---|---|
| 1 | Rating calculado con función pura | `calculateInitialRating()` en `lib/domain/rating.ts` |
| 2 | Cap [100, 950] | `Math.max/min` en función de dominio |
| 3 | Flag `initialRatingCalculated` bloquea app | Check en `AuthGuard.tsx` |
| 4 | Onboarding obligatorio antes de app | Redirect en `AuthGuard.tsx` |
| 5 | Hitos con copy exacto anti-subjetividad | Cards con textos fijos en UI |
| 6 | Posiciones seleccionadas durante onboarding | Step 5 en formulario |
| 7 | Re-evaluación disponible cada 90 días | Cooldown con `onboardingCompletedAt` en profile |
| 8 | Rating oculto al usuario, solo muestra nivel | UI muestra Level, no PP |
| 9 | Edad mínima 18 años — validada contra `birthdate` | `max` en date input = hoy − 18 años |
| 10 | `birthdate` persiste permanentemente; edad no | `saveOnboardingResult` guarda `birthdate`, no `age` |

---

## 2. ARQUITECTURA

```
┌──────────────────────────────────────────────┐
│               ESPECIFICACIÓN                  │
└──────────────────────────────────────────────┘
                     │
       ┌─────────────┼─────────────┐
       ▼             ▼             ▼
  ┌────────┐    ┌─────────┐   ┌──────────┐
  │ DOMINIO│    │   API   │   │    UI    │
  └────────┘    └─────────┘   └──────────┘
  rating.ts     users.ts      /onboarding
  OnboardingData saveResult   6-step form
  RatingResult                AuthGuard
```

### Capas

#### Capa 1: Dominio (`lib/domain/rating.ts`)
- Tipos: `OnboardingData`, `RatingResult`, `TechLevel`, `PhysLevel`, `Frequency`, `Sex`, `Foot`, `CourtSize`
- `calculateInitialRating(data)` — función pura, determinista, sin side effects

**✅ Cumple**: Reglas #1, #2

#### Capa 2: API (`lib/users.ts`)
- `saveOnboardingResult(uid, data)` — persiste rating + metadatos + `initialRatingCalculated: true` + `onboardingCompletedAt`
- `requestReEvaluation(uid)` — resetea `initialRatingCalculated` para permitir nuevo onboarding

**✅ Cumple**: Reglas #3, #7

#### Capa 3: UI (`app/onboarding/page.tsx`)
- Paso 1: Datos personales (fecha de nacimiento `type="date"`, sexo, pie, cancha)
- Paso 2: Nivel técnico (5 hito cards)
- Paso 3: Condición física (5 hito cards)
- Paso 4: Trayectoria (escuela, torneos, frecuencia)
- Paso 5: Posiciones de juego (1-2, con iconos emoji)
- Paso 6: Animación "Calculando..." con mensajes rotativos
- Paso 7: Resultado con nivel (rating oculto)

**✅ Cumple**: Reglas #4, #5, #6, #8

#### AuthGuard (`components/AuthGuard.tsx`)
- Prioridad: `roles.includes("player") && !initialRatingCalculated` → redirect `/onboarding`
- Posiciones ya no forzadas (se seleccionan en onboarding)

**✅ Cumple**: Reglas #3, #4

---

## 3. TRAZABILIDAD

### Regla #1: Función pura de rating
1. **Dominio**: `calculateInitialRating()` recibe `OnboardingData`, retorna `RatingResult`
2. **Sin side effects**: no accede a Firebase ni estado externo

### Regla #3: AuthGuard bloquea sin rating
1. **useEffect**: verifica `profile.initialRatingCalculated`
2. **Render gate**: muestra "Preparando tu evaluación..." mientras redirige

### Regla #5: Copy anti-subjetividad
1. **TECH_OPTIONS**: 5 niveles con descripción concreta
2. **PHYS_OPTIONS**: 5 niveles con métricas específicas

---

## 4. CRITERIOS DE ACEPTACIÓN

### ✅ Criterio 1
**Given** un jugador nuevo sin `initialRatingCalculated`
**When** intenta acceder a cualquier ruta
**Then** es redirigido a `/onboarding`

### ✅ Criterio 2
**Given** un jugador en onboarding
**When** completa los 4 pasos y envía
**Then** ve animación "Calculando..." por 3s y luego su rating

### ✅ Criterio 3
**Given** un jugador que finaliza onboarding
**When** ve el resultado
**Then** el rating está entre [100, 950] y el nivel es 1, 2, 3 o 4

### ✅ Criterio 4
**Given** un jugador con onboarding completo
**When** accede a la app
**Then** no es redirigido a `/onboarding`

---

## 5. ARCHIVOS INVOLUCRADOS

| Capa | Archivo | Responsabilidad |
|---|---|---|
| Dominio | `lib/domain/rating.ts` | OnboardingData, RatingResult, calculateInitialRating() |
| Dominio | `lib/domain/user.ts` | UserProfile con campos de onboarding |
| API | `lib/users.ts` | saveOnboardingResult(), requestReEvaluation() |
| UI | `app/onboarding/page.tsx` | Formulario multi-step |
| UI | `app/profile/page.tsx` | Ficha Técnica con nivel + re-evaluación |
| UI | `components/AuthGuard.tsx` | Gate de onboarding |

---

## 6. FLUJO DE NAVEGACIÓN

```
Login → AuthGuard → ¿initialRatingCalculated?
  ├─ NO  → /onboarding (7 pasos incl. posiciones) → Home (con full reload para refetch)
  └─ SÍ  → App normal
             └─ /profile → Ficha Técnica (nivel + re-evaluación a los 90 días)
```

---

## 7. MIGRACIÓN — Rebalanceo 2026-05-15

Script: [scripts/recalculate-user-levels.js](../scripts/recalculate-user-levels.js)

### Estrategia de migración por caso

| Estado del user | Acción | Justificación |
|---|---|---|
| `initialRatingCalculated: true` + datos crudos completos | Recalcula `rating` + `level` con nuevos pesos | Los nuevos pesos cambian el rating final |
| `initialRatingCalculated: true` + datos crudos faltantes (legacy) | Solo remapea `level` desde el `rating` existente | Sin datos crudos no se puede recalcular el rating; al menos mantenemos el nivel coherente con los nuevos umbrales |
| `initialRatingCalculated: true` + sin `rating` ni datos | Salteado con warning | Caso anómalo, requiere intervención manual |
| `initialRatingCalculated` falsy | Salteado silencioso | Aún no completaron onboarding |

### Por qué algunos usuarios son "legacy"

Antes del commit `c29def9 "saving all data from onboarding form"`, el flujo de onboarding **no persistía** los campos crudos (`techLevel`, `physLevel`, `hasSchool`, `hasTournaments`, `frequency`). Solo guardaba `rating` y `level` finales. Estos usuarios se identifican en runtime: tienen `initialRatingCalculated: true` y `rating` pero les faltan los crudos.

### Uso del script

```powershell
node scripts/recalculate-user-levels.js --dry-run   # imprime cambios sin escribir
node scripts/recalculate-user-levels.js             # aplica los cambios
```

Salida marca cada caso con un emoji: `🔄` recálculo completo, `🧓` legacy (solo nivel), `⚠️` salteado por datos insuficientes.
