# Perfil Público (FIFA Card desde Join) — SDD

## Objetivo

Permitir que cualquier jugador pueda ver la FIFA Card de otro jugador al tapear su nombre en la página de join (`/join/[id]`). La card se muestra en un bottom sheet sin salir de la página.

## Flujo de Usuario

1. Usuario está en `/join/[id]` viendo un partido
2. Tapea la **foto o el nombre** de un jugador (subrayado en nombre indica que es clickeable)
3. Se abre un bottom sheet desde abajo con la FIFA Card del jugador
4. Puede cerrar con: drag hacia abajo, tap en backdrop, o swipe

## Componentes

### `PlayerCardDrawer` (`components/PlayerCardDrawer.tsx`)

Bottom sheet que muestra la FIFA Card de un jugador.

**Props:**
| Prop | Tipo | Descripción |
|------|------|-------------|
| `isOpen` | `boolean` | Controla visibilidad del drawer |
| `onClose` | `() => void` | Callback para cerrar |
| `playerUid` | `string \| null` | UID del jugador a mostrar |

**Comportamiento:**
- Fetch del perfil con `getUserProfile(uid)` de `lib/users.ts`
- Renderiza `FifaPlayerCard` con `animated={true}` dentro de un wrapper `[&>*]:!max-w-[270px]` — la card se presenta a 270px (vs los 185px por defecto) para mejor legibilidad en el bottom sheet
- Entrada suave: opacity+y, delay 0.15s, ease custom
- **Tema visual "Emerald Vitrine"** — fondo de vidrio esmerilado con tinte esmeralda (`rgba(5,20,12,0.96)` + `backdropFilter: blur(20px) saturate(1.2)`)
- Fondo decorativo SVG con campo de fútbol abstracto (líneas, círculo central, áreas de penalti, arcos de esquina) — todo en opacidades `rgba(74,222,128,0.09–0.15)` para no competir con la card
- Resplandor ambiental radial detrás de la card: `w-[320px] h-[520px]`, animación de "respiración" (opacity 0.5↔0.85, scale 0.95↔1.05, ciclo 4s)
- Marco vitrine con borde inset (`green-400/15`) y box-shadow inset
- Iluminación cenital sutil (gradiente descendente `green-400/6`)
- Línea decorativa "estante de vidrio" + sombra blur debajo de la card
- Texto "member since" + mes/año bajo el estante (fade in delay 0.6s) — solo si `profile.createdAt` existe
- Backdrop: `bg-black/50 backdrop-blur-[4px]`
- Altura del sheet: `h-[80vh]`
- Animación: slide-up con spring (`damping: 28, stiffness: 220`)
- Drag-to-dismiss vertical (threshold: 120px offset o 400 velocity)
- Drag handle: pill esmeralda con gradiente y glow sutil
- Línea de acento superior con gradiente `via-green-400/40`

**Estados:**
| Estado | UI |
|--------|-----|
| Loading | `FifaCardSkeleton size="lg"` (270px, proporciones escaladas) con resplandor ambiental detrás |
| Error / no encontrado | Mensaje estilizado con borde esmeralda |
| Usuario eliminado | Mensaje "Este jugador eliminó su cuenta" |
| Éxito | FIFA Card animada (270px) con glow ambiental, estante decorativo y "member since" |

### Elementos tapeables en `/join/[id]`

Tanto la **foto** como el **nombre** del jugador son tapeables en todas las secciones:

| Sección | Condición para ser clickeable |
|---------|-------------------------------|
| Jugadores confirmados (open match) | `p.uid` existe (foto + nombre) |
| Equipo A (closed match) | `p.uid` existe (foto + nombre) |
| Equipo B (closed match) | `p.uid` existe (foto + nombre) |
| Lista de espera | `p.uid` existe Y no es guest (foto + nombre) |
| Votación MVP | `p.uid` existe Y no es guest (foto, con `e.stopPropagation()` para no activar voto) |
| Leaderboard MVP | `p.uid` existe (foto + nombre) |
| Guests | Nunca clickeables (no tienen UID) |

**Estilo clickeable nombre:** `underline decoration-slate-300 underline-offset-2 cursor-pointer`
**Estilo clickeable foto:** `cursor-pointer` en el container de la foto

## Reglas de Negocio

1. **Solo jugadores registrados** tienen perfil clickeable. Guests no tienen UID → no clickeables.
2. **Usuarios eliminados** (`deleted === true`) muestran mensaje informativo, no la card.
3. **El propio perfil** también es clickeable — se muestra la card normalmente.
4. **Firestore rules** actualizadas: cualquier usuario autenticado puede leer cualquier perfil de usuario. La privacidad se mantiene porque la FIFA Card solo renderiza datos públicos (stats, posiciones, foto, nombre) — nunca email, teléfono u otros datos sensibles.

## Archivos Involucrados

| Archivo | Acción |
|---------|--------|
| `components/PlayerCardDrawer.tsx` | Bottom sheet "Emerald Vitrine" con FIFA Card |
| `components/skeletons/FifaCardSkeleton.tsx` | Skeleton reutilizable — acepta `size="sm"` (185px, default) o `size="lg"` (270px, BS) |
| `app/join/[id]/page.tsx` | Modificado — fotos y nombres tapeables en todas las secciones, handlers, render del drawer |
| `lib/users.ts` | Modificado — `upgradeGooglePhotoURL()` mejora resolución de Google photos (`=s96-c` → `=s400-c`) |
| `scripts/upgrade-google-photos.js` | Nuevo — script one-time para migrar fotos existentes en Firestore |
| `firestore.rules` | Modificado — lectura de perfiles abierta a usuarios autenticados |
| `docs/PUBLIC_PLAYER_CARD_SDD.md` | Nuevo — esta documentación |
| `docs/FIFA_PLAYER_CARD_SDD.md` | Modificado — referencia al uso público |

## Criterios de Aceptación

- [x] Tapear foto o nombre de jugador confirmado abre bottom sheet con su FIFA Card
- [x] Tapear foto o nombre en Equipo A/B abre bottom sheet
- [x] Tapear foto o nombre en lista de espera (no guest) abre bottom sheet
- [x] Tapear foto en votación MVP abre bottom sheet (sin activar voto)
- [x] Tapear foto o nombre en leaderboard MVP abre bottom sheet
- [x] Tapear nombre de guest NO abre nada
- [x] Drag hacia abajo cierra el bottom sheet
- [x] Tap en backdrop cierra el bottom sheet
- [x] `FifaCardSkeleton` se muestra mientras carga el perfil (con glow ambiental)
- [x] Usuarios eliminados muestran mensaje apropiado (estilo esmeralda)
- [x] Usuarios no encontrados muestran mensaje apropiado
- [x] Google photos se muestran en alta resolución (s400)
- [x] FIFA Card se presenta a 270px en el bottom sheet (más legible que 185px)
- [x] Bottom sheet tiene altura 80vh para acomodar la card grande
- [x] "Member since" se muestra debajo de la card con fade-in delay
- [x] Skeleton de loading usa `FifaCardSkeleton size="lg"` (proporciones correctas para 270px)
