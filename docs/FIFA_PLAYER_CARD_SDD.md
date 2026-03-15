# FIFA Player Card — SDD

## Objetivo

Carta de presentación pública estilo FIFA Ultimate Team para cada jugador. Diseño premium dorado con estadísticas, posiciones y foto del jugador.

## Datos Consumidos (de `UserProfile`)

| Campo | Uso en la carta |
|-------|----------------|
| `photoURL` | Foto circular del jugador (165px) |
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

   **TEC recibe bonos adicionales por trayectoria (cap 99):**
   - `hasSchool = true` → +3
   - `hasTournaments = true` → +5
5. **COM (Compromiso):** `Math.max(0, 99 - (noShows * 20) - (lateArrivals * 5))`. Misma fórmula que la página de perfil.
6. **MVP:** Campo `mvpAwards` en la raíz del documento `users/{uid}`. Incrementado por la Cloud Function `sendMvpWinnerNotification` al cerrar la votación.
7. **Pie dominante:** Pill sobresaliendo del borde derecho inferior (🦶 + IZQ/DER/AMB).
8. **Posiciones alternas:** Solo posiciones distintas a `primaryPosition`, como pills en el borde derecho superior con emoji + abreviación.
9. **Stats en fila 1x6:** COM, TEC, FIS, PJ, PG, MVP en una sola fila horizontal.

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
| `components/PlayerCardDrawer.tsx` | Nuevo — bottom sheet para ver la card de otros jugadores desde `/join/[id]` |
| `app/profile/page.tsx` | Modificado — reemplaza avatar + tarjeta de nivel |
| `app/join/[id]/page.tsx` | Modificado — nombres clickeables que abren el drawer con FIFA Card |
| `functions/src/reminders.ts` | Modificado — incrementa `mvpAwards` al cerrar votación MVP |
| `docs/FIFA_PLAYER_CARD_SDD.md` | Nuevo — esta documentación |
| `docs/PUBLIC_PLAYER_CARD_SDD.md` | Nuevo — SDD del perfil público |

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
