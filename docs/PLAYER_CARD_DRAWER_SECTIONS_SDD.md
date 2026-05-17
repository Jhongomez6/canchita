# Feature: Secciones del Player Card Drawer (Reconocimientos + Rachas)

## 📋 Specification-Driven Development (SDD)

Enriquecer el `PlayerCardDrawer` (bottom sheet que se abre al tocar un jugador) con secciones que complementan la FIFA Card: reconocimientos (kudos acumulados) y rachas activas. Mostrar señales de identidad pública del jugador en un solo vistazo.

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo
La FIFA Card hoy muestra solo stats deportivas (PJ, PG, MVP, COM, TEC, FIS). Los jugadores acumulan otras señales — reconocimientos de compañeros, rachas de constancia — que viven aisladas en otras pantallas. Este SDD las consolida bajo la card en el drawer para dar **identidad pública completa** del jugador cuando otro user lo "scoutea".

### Convivencia con sistemas existentes
| Sistema | Qué hace | Relación con esta feature |
|---|---|---|
| **FIFA Player Card** (`docs/FIFA_PLAYER_CARD_SDD.md`) | Carta visual con stats + foto | No se modifica. Se renderizan secciones **debajo** de la card en el drawer. |
| **Post-Match Review** (`docs/POST_MATCH_REVIEW_FEATURE_SDD.md`) | Captura kudos en `users/{uid}.kudosSummary` | Esta feature **lee** el summary y lo muestra como badges. |
| **Player Streaks** (`docs/PLAYER_STREAKS_SDD.md`) | Calcula `weeklyStreak`, `commitmentStreak`, etc. en `UserProfile` | Esta feature **lee** los campos y los muestra como flame icons. |

### Reglas de Negocio
| # | Regla | Impacto UI |
|---|-------|------------|
| 1 | **Reconocimientos visible si** `kudosSummary.total > 0`. Si el jugador no tiene kudos, la sección entera se oculta (sin empty state en el drawer ajeno — el empty state vive en `/profile` propio). | Sección desaparece. |
| 2 | **Rachas visibles si** `(weeklyStreak ?? 0) > 0` OR `(commitmentStreak ?? 0) > 0`. Si ambas son 0/undefined, la sección no se renderiza. | Sección desaparece. |
| 3 | Las rachas mostradas son **públicas** (visibles a cualquier jugador autenticado), mismo criterio que los kudos. | Cualquiera que abra el drawer puede verlas. |
| 4 | Los datos son **read-only**. El drawer no permite editar nada. | Sin CTAs de modificación. |
| 5 | El orden de las secciones desde arriba: FIFA Card → Glass shelf → Reconocimientos → Rachas. | Layout fijo. |

### Lista canónica de rachas a mostrar
Solo mostramos las dos más relevantes para "identidad" pública. Las demás (`unbeatenStreak`, `winStreak`, `mvpStreak`) quedan para futuras iteraciones:

| Field | Display label | Icon | Color activo |
|---|---|---|---|
| `weeklyStreak` | "Semanal" | 🔥 (Flame) | `orange-400` |
| `commitmentStreak` | "Compromiso" | 🔥 (Flame) | `orange-400` |

Si en el futuro se agrega `unbeatenStreak` o similar, esta sección puede acomodar 3-4 valores en grid horizontal.

---

## 2. ESCALABILIDAD

### Volumen
- Cada apertura del drawer = **1 read** a `users/{uid}` (que ya se hace para cargar la FIFA Card).
- No hay queries adicionales. Los kudos y rachas vienen embebidos en el doc del usuario.

### Sin paginación necesaria
Ambas señales son agregados denormalizados (`kudosSummary`, `weeklyStreak`, etc.). No leemos listas.

---

## 3. CONCURRENCIA SEGURA

N/A — feature read-only en cliente. No hay writes. La actualización de `kudosSummary` y los streak fields la hacen Cloud Functions documentadas en sus SDDs respectivos.

---

## 4. SEGURIDAD

### Autenticación
- El drawer ya requiere `request.auth != null` para leer `users/{uid}`.

### Lectura
- `kudosSummary` y `commitmentStreak/weeklyStreak` son **públicos** (cualquier user autenticado puede leerlos). Las Firestore Rules ya lo permiten.
- `_reportsSummary` **NO** se expone. Solo admin lo lee.

### Validaciones
Ninguna — solo se renderizan los valores. Si el campo es `undefined` o `0`, la sección no se muestra.

---

## 5. TOLERANCIA A FALLOS

| Caso | Comportamiento |
|---|---|
| `kudosSummary` no existe en el doc (user viejo, pre-feature) | Sección Reconocimientos no se renderiza. Sin error. |
| `weeklyStreak`/`commitmentStreak` no existen | Sección Rachas no se renderiza. Sin error. |
| Photo URL roto (404) | El FIFA Card maneja su propio fallback. Reconocimientos/rachas ajenos. |
| User borrado (`deleted: true`) | El drawer ya muestra "Este jugador eliminó su cuenta" antes de llegar a estas secciones. |

---

## 6. UX — FLUJOS DE USUARIO

### Flujo principal
1. User A toca el avatar/nombre de User B (en `/join/[id]`, en la lista de teammates de `/match/[id]/review`, etc.)
2. Se abre el `PlayerCardDrawer` (slide-up desde abajo).
3. Skeleton mientras carga.
4. Aparece la FIFA Card animada con scale-in.
5. Después de la card, glass shelf line decorativa.
6. Si User B tiene kudos: aparece sección **Reconocimientos** con badges ámbar.
7. Si User B tiene rachas: aparece sección **Rachas** con iconos 🔥 + número.
8. User A cierra con tap fuera, drag-down o ESC.

### Estados
| Estado | Qué muestra |
|---|---|
| Loading | `FifaCardSkeleton` |
| Loaded, sin kudos ni rachas | Solo card + shelf line |
| Loaded, solo kudos | Card + shelf + Reconocimientos |
| Loaded, solo rachas | Card + shelf + Rachas |
| Loaded, ambos | Card + shelf + Reconocimientos + Rachas |
| Error | "No se pudo cargar el perfil" |
| Deleted | "Este jugador eliminó su cuenta" |

### Consideraciones mobile-first
- Drawer altura `h-[66vh]` con `overflow-y-auto` interno. El contenido extra (rachas) puede requerir scroll; se acepta.
- Tap targets de las pills/iconos no necesitan ser interactivos (no-op tap).
- Sin tooltips dentro del drawer (la sesión es exploratoria, no educativa — los tooltips viven en `/profile` propio).

---

## 7. UI DESIGN — COMPONENTES Y ANIMACIONES

### Componentes
- **`PlayerCardDrawer`** (existente) — orquesta el drawer y las secciones
- **`KudosBadges`** (existente) — pills ámbar con emoji + label + count
- **`DrawerStreaks`** (**nuevo**) — `components/profile/DrawerStreaks.tsx`. Renderiza las rachas con el mismo lenguaje visual del drawer (verde fluo + 🔥)

### Layout de la sección Rachas

```
┌──────────────────────────┐
│   RACHAS                 │  ← Label uppercase tracking, green-300/70
│                          │
│   🔥 3      🔥 5         │  ← Iconos flame + número grande
│  Semanal  Compromiso     │  ← Label pequeño abajo
└──────────────────────────┘
```

- Container: `mt-6 w-full max-w-[280px]` (mismo que Reconocimientos)
- Label header: `text-[10px] font-bold text-green-300/70 uppercase tracking-[0.2em]`
- Layout interno: `flex justify-center gap-6` (dos rachas lado a lado)
- Cada item: `flex flex-col items-center` con icon arriba y label abajo
- Icono `Flame` size 24, `text-orange-400 fill-orange-400`
- Número: `text-2xl font-bold text-orange-400`
- Label: `text-[9px] text-green-300/60 uppercase tracking-wider`

### Animación
- Sección entra con `motion.div` igual que Reconocimientos: `initial={{ opacity: 0, y: 10 }}, animate={{ opacity: 1, y: 0 }}, transition={{ duration: 0.4, delay: 0.6 }}`
- Delay 0.6 (vs 0.4 de kudos) — entra después de los kudos para evitar amontonamiento visual

### Responsive
- Mobile: layout horizontal 2-col centrado
- Desktop (md+): mismo layout (drawer es mobile-first)

---

## 8. ANALYTICS

N/A — la vista pasiva no genera eventos. El evento `player_card_viewed` (ya existente, lo dispara `PlayerCardDrawer`) cubre el envoltorio. Si en el futuro algún elemento se vuelve clickeable (ej. "Ver todas mis rachas") agregamos eventos.

---

## 9. ARQUITECTURA TÉCNICA

### Modelo de datos
Sin cambios. Reutiliza:
```typescript
// UserProfile (ya existente)
interface UserProfile {
  // ...
  kudosSummary?: UserKudosSummary;    // post-match review
  weeklyStreak?: number;               // player streaks
  lastPlayedWeek?: string;             // player streaks (para calcular streak displayed)
  commitmentStreak?: number;           // player streaks
  // ...
}
```

### Capa de dominio
Reutiliza `getDisplayedWeeklyStreak({ weeklyStreak, lastPlayedWeek })` de `lib/domain/user.ts` — devuelve el streak ajustado por la semana actual (si el user no jugó esta semana ni la pasada, devuelve 0).

### Capa de API
Sin cambios — el drawer ya hace `getUserProfile(uid)` que trae todo el doc.

### Componentes UI
```
components/
  PlayerCardDrawer.tsx       (modificar — montar DrawerStreaks debajo de KudosBadges)
  profile/
    KudosBadges.tsx          (sin cambios)
    DrawerStreaks.tsx        (NUEVO)
```

---

## 10. CRITERIOS DE ACEPTACIÓN

- [ ] El drawer muestra la sección "Rachas" solo si `weeklyStreak > 0` o `commitmentStreak > 0`.
- [ ] La racha semanal usa `getDisplayedWeeklyStreak({ weeklyStreak, lastPlayedWeek })` para reflejar el valor mostrado al user (no el raw del doc).
- [ ] La sección se posiciona debajo de Reconocimientos. Si no hay kudos, queda inmediatamente después de la shelf line.
- [ ] La animación de entrada (delay 0.6s) no genera flickering ni overlap con la FIFA Card escalada — el spacer existente (introducido para arreglar el overlap de kudos) sigue funcionando.
- [ ] Si ambas rachas son 0/undefined, la sección no se monta (no aparece label "RACHAS" vacío).
- [ ] No se exponen datos sensibles. El componente no lee `_reportsSummary` ni otros campos privados.
- [ ] Mobile: el contenido es scrolleable dentro del drawer si excede los 66vh.
- [ ] No se introducen reads adicionales de Firestore — el doc ya viene cargado.

---

## 11. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---------|--------|
| `components/profile/DrawerStreaks.tsx` | **Nuevo** — componente con label + 2 items (semanal + compromiso) |
| `components/PlayerCardDrawer.tsx` | **Modificar** — montar `<DrawerStreaks profile={profile} />` después del bloque de Reconocimientos |
| `docs/PLAYER_CARD_DRAWER_SECTIONS_SDD.md` | **Nuevo** — este documento |

---

## 12. DECISIONES CERRADAS

| Decisión | Resolución |
|---|---|
| ¿Cuántas rachas mostrar? | Solo `weeklyStreak` y `commitmentStreak` (las 2 más relevantes para identidad). El resto (`unbeatenStreak`, `winStreak`, `mvpStreak`) queda para fase futura. |
| ¿Tooltips dentro del drawer? | No. Los tooltips educativos viven en `/profile` propio (QuickStats). El drawer ajeno es exploratorio. |
| ¿Empty state si no hay rachas? | No — la sección entera se oculta. Consistente con el comportamiento de Reconocimientos. |
| ¿Mostrar rachas ajenas o solo propias? | Públicas, igual que kudos. El drawer es para "scoutear" otros jugadores. |
| ¿Animar el flame con `pulseAnimation`? | No por ahora — el QuickStats del home usa pulse para llamar atención al user propio. En el drawer ajeno preferimos algo más sobrio y estático. |
| ¿Botón "Ver más" o link a perfil completo? | No. El drawer ajeno no navega a otras pantallas; es self-contained. |
