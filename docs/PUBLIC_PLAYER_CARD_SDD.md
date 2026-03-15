# Perfil Público (FIFA Card desde Join) — SDD

## Objetivo

Permitir que cualquier jugador pueda ver la FIFA Card de otro jugador al tapear su nombre en la página de join (`/join/[id]`). La card se muestra en un bottom sheet sin salir de la página.

## Flujo de Usuario

1. Usuario está en `/join/[id]` viendo un partido
2. Tapea el nombre de un jugador (subrayado indica que es clickeable)
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
- Renderiza `FifaPlayerCard` con `animated={true}`
- Backdrop: `bg-slate-900/40 backdrop-blur-[2px]`
- Animación: slide-up con spring (`damping: 28, stiffness: 220`)
- Drag-to-dismiss vertical (threshold: 120px offset o 400 velocity)
- Drag handle pill gris en la parte superior

**Estados:**
| Estado | UI |
|--------|-----|
| Loading | Skeleton pulsante (185x320px) |
| Error / no encontrado | Mensaje "Perfil no encontrado" |
| Usuario eliminado | Mensaje "Este jugador eliminó su cuenta" |
| Éxito | FIFA Card animada |

### Secciones clickeables en `/join/[id]`

| Sección | Condición para ser clickeable |
|---------|-------------------------------|
| Jugadores confirmados (open match) | `p.uid` existe |
| Equipo A (closed match) | `p.uid` existe |
| Equipo B (closed match) | `p.uid` existe |
| Lista de espera | `p.uid` existe Y no es guest |
| Guests | Nunca clickeables (no tienen UID) |

**Estilo clickeable:** `underline decoration-slate-300 underline-offset-2 cursor-pointer`

## Reglas de Negocio

1. **Solo jugadores registrados** tienen perfil clickeable. Guests no tienen UID → no clickeables.
2. **Usuarios eliminados** (`deleted === true`) muestran mensaje informativo, no la card.
3. **El propio perfil** también es clickeable — se muestra la card normalmente.
4. **Firestore rules** actualizadas: cualquier usuario autenticado puede leer cualquier perfil de usuario. La privacidad se mantiene porque la FIFA Card solo renderiza datos públicos (stats, posiciones, foto, nombre) — nunca email, teléfono u otros datos sensibles.

## Archivos Involucrados

| Archivo | Acción |
|---------|--------|
| `components/PlayerCardDrawer.tsx` | Nuevo — bottom sheet con FIFA Card |
| `app/join/[id]/page.tsx` | Modificado — estado, handlers, nombres clickeables, render del drawer |
| `firestore.rules` | Modificado — lectura de perfiles abierta a usuarios autenticados |
| `docs/PUBLIC_PLAYER_CARD_SDD.md` | Nuevo — esta documentación |
| `docs/FIFA_PLAYER_CARD_SDD.md` | Modificado — referencia al uso público |

## Criterios de Aceptación

- [ ] Tapear nombre de jugador confirmado abre bottom sheet con su FIFA Card
- [ ] Tapear nombre en Equipo A/B abre bottom sheet
- [ ] Tapear nombre en lista de espera (no guest) abre bottom sheet
- [ ] Tapear nombre de guest NO abre nada
- [ ] Drag hacia abajo cierra el bottom sheet
- [ ] Tap en backdrop cierra el bottom sheet
- [ ] Loading skeleton se muestra mientras carga el perfil
- [ ] Usuarios eliminados muestran mensaje apropiado
- [ ] Usuarios no encontrados muestran mensaje apropiado
