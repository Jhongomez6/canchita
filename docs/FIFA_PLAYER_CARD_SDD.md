# FIFA Player Card — SDD

## Objetivo

Carta de presentación pública estilo FIFA Ultimate Team para cada jugador. Diseño premium dorado con estadísticas, posiciones y foto del jugador.

## Datos Consumidos (de `UserProfile`)

| Campo | Uso en la carta |
|-------|----------------|
| `photoURL` | Foto circular del jugador (256px). Optimizada con Next Image a `sizes="256px"` y `quality={75}`. Google photos se upgradan automáticamente de `=s96-c` a `=s400-c`. |
| `name` | Nombre del jugador (centrado con líneas decorativas) |
| `primaryPosition` | Posición principal (debajo del OVR, arriba-izquierda) |
| `positions[]` | Posiciones alternas (pills sobresaliendo del borde derecho superior) |
| `dominantFoot` | Pie dominante (pill sobresaliendo del borde derecho inferior, 🦶 + IZQ/DER/AMB) |
| `stats.played` | PJ — Partidos Jugados |
| `stats.won` | PG — Partidos Ganados |
| `mvpAwards` | MVP — Premios MVP (incrementado por Cloud Function al cerrar votación) |
| `stats.lateArrivals` / `stats.noShows` | COM — Compromiso |
| `techLevel` (1-5) | TEC — Nivel Técnico (mapeado a 0-99) |
| `physLevel` (1-5) | FIS — Nivel Físico (mapeado a 0-99) |
| `hasSchool` | Bono TEC (+3) |
| `hasTournaments` | Bono TEC (+5) |
| `frequency` | Bono TEC y FIS según frecuencia de juego |

## Layout de la Carta

```
┌──────────────────────────────────┐
│ ?                                │
│ ⚡DEL      ┌───────────┐  [⚙️MID]│  ← OVR (42px) + pos abrev + Foto + Alt pills
│            │           │  [🛡️DEF]│     (pills sobresalen borde derecho)
│            │   FOTO    │        │
│            │  (165px)  │        │
│            └───────────┘        │
│                                  │
│  ────────── NOMBRE ──────────    │  ← Nombre con dividers decorativos
│                                  │
│  COM  TEC  FIS  PJ  PG  MVP     │  ← Fila 1x6 de stats
│                             🦶DER│  ← Pie como pill en borde derecho
└──────────────────────────────────┘
```

## Reglas de Negocio

1. **OVR:** Muestra "?" por ahora. Sistema de XP pendiente que calculará el rating visible.
2. **Carta dorada fija:** Gold para todos los usuarios. El sistema de XP futuro determinará tanto el OVR como el diseño/rarity (bronce, gold, emerald).
3. **Abreviación de posiciones (español, 3 letras):**
   - GK → POR
   - DEF → DEF
   - MID → MID
   - FWD → DEL
4. **TEC/FIS mapping (1-5 → 0-99):**
   - 1 → 30
   - 2 → 50
   - 3 → 70
   - 4 → 90
   - 5 → 99

   **TEC recibe bonos adicionales por trayectoria y frecuencia (cap 99):**
   - `hasSchool = true` → +3
   - `hasTournaments = true` → +5
   - `frequency = "weekly"` → +1
   - `frequency = "intense"` → +3

   **FIS recibe bono por frecuencia (cap 99):**
   - `frequency = "weekly"` → +2
   - `frequency = "intense"` → +5

   **Racional:** La frecuencia de juego se traduce en mejor condición física (más fuerte: +5) y mejora marginal de técnica por repetición (menor: +3), ya que la técnica depende más de formación estructurada (escuela/torneos).
5. **COM (Compromiso):** `Math.max(0, Math.min(99, 99 - noShows×20 - lateArrivals×6 + played))`. Computado en display — no se almacena en Firestore. El `+played` da recuperación (+1 por partido puntual). Los late arrivals no recuperan (neto 0). Los no-shows no incrementan `played`. Misma fórmula que `StatsCard`.
6. **MVP:** Campo `mvpAwards` en la raíz del documento `users/{uid}`. Incrementado por la Cloud Function `sendMvpWinnerNotification` al cerrar la votación.
7. **Pie dominante:** Pill sobresaliendo del borde derecho inferior (🦶 icon SportShoe + IZQ/DER/AMB).
8. **Posiciones alternas:** Solo posiciones distintas a `primaryPosition`, como pills en el borde derecho superior con emoji + abreviación.
9. **Stats en fila 1x6:** COM, TEC, FIS, PJ, PG, MVP en una sola fila horizontal.
10. **Google Photos upgrade:** `ensureUserProfile()` en `lib/users.ts` reemplaza `=s96-c` → `=s400-c` en login. Script one-time `scripts/upgrade-google-photos.js` migra usuarios existentes.

## Efectos Visuales

- **Shimmer:** Gradiente diagonal dorado animado (3s duración, 5s pausa, loop infinito)
- **Entrada:** Animación con Framer Motion (`opacity 0→1, y 30→0, rotateY -8→0`)
- **Textura:** Patrón de diamantes SVG rotado 45° a ~6% opacidad
- **Marco doble:** Borde exterior con gradiente dorado (`from-yellow-500 via-amber-600 to-amber-900`) + interior con gradiente más oscuro
- **Borde inferior:** Gradiente dorado decorativo
- **Glow detrás de foto:** `bg-yellow-400/15 blur-xl` circular

## Archivos Involucrados

| Archivo | Acción |
|---------|--------|
| `components/FifaPlayerCard.tsx` | Nuevo — componente de la carta |
| `components/PlayerCardDrawer.tsx` | Nuevo — bottom sheet "Emerald Vitrine" para ver la card de otros jugadores |
| `components/skeletons/FifaCardSkeleton.tsx` | Nuevo — skeleton reutilizable con forma exacta de la FIFA Card |
| `components/skeletons/ProfileSkeleton.tsx` | Modificado — usa `FifaCardSkeleton` y refleja layout actual del perfil |
| `app/profile/page.tsx` | Modificado — reemplaza avatar + tarjeta de nivel por FIFA Card |
| `app/join/[id]/page.tsx` | Modificado — fotos y nombres clickeables que abren el drawer con FIFA Card |
| `lib/users.ts` | Modificado — `upgradeGooglePhotoURL()` convierte `=s96-c` → `=s400-c` en login |
| `scripts/upgrade-google-photos.js` | Nuevo — script one-time para migrar fotos existentes a s400 |
| `functions/src/reminders.ts` | Modificado — incrementa `mvpAwards` al cerrar votación MVP |
| `next.config.ts` | Modificado — agrega `qualities` para optimización de imágenes |
| `docs/FIFA_PLAYER_CARD_SDD.md` | Nuevo — esta documentación |
| `docs/PUBLIC_PLAYER_CARD_SDD.md` | Nuevo — SDD del perfil público |

### Reglas de Visualización de Branding
- El logo "La Canchita" en el pico inferior de la carta utiliza el prop `unoptimized` en `<Image />` para asegurar que el asset de marca no consuma cuota de transformación de imágenes de Vercel (manteniendo costo cero por assets de branding).
- El logo utiliza `priority` para evitar parpadeos durante la entrada animada de la carta.

## Criterios de Aceptación
- [x] Carta dorada renderiza en `/profile` con "?" como OVR
- [x] Stats muestran COM, TEC, FIS, PJ, PG, MVP en fila 1x6
- [x] Posición principal con emoji + abreviación en español (3 letras)
- [x] Posiciones alternas como pills con emoji sobresaliendo del borde derecho
- [x] Pie dominante como pill sobresaliendo del borde derecho inferior
- [x] `mvpAwards` se incrementa correctamente en Firestore al cerrar votación
- [x] Shimmer animado funciona sin lag
- [x] Fallbacks para datos faltantes (sin foto, sin stats, sin techLevel)
- [x] Responsive en móvil (375px+)
- [x] Card visible como perfil público desde la página de join (ver `docs/PUBLIC_PLAYER_CARD_SDD.md`)
- [x] Fotos y nombres de jugadores son tapeables en todas las secciones del join
- [x] Google profile photos se upgradan a s400 en login y con script de migración
- [x] ProfileSkeleton refleja layout actual con FifaCardSkeleton
- [x] El logo de branding inferior usa `unoptimized` para control de costos.
