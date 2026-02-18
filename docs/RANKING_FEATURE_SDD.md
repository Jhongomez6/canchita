# Feature: Ranking de Jugadores

## 📋 Specification-Driven Development (SDD)

Este documento explica cómo la **especificación funcional** gobierna la implementación de la feature "Ranking de Jugadores".

---

## 1. ESPECIFICACIÓN FUNCIONAL (Fuente de Verdad)

### Objetivo
Visualizar el desempeño global de los jugadores en una tabla interactiva, accesible solo para administradores.

### Entidad: PlayerRanking

```typescript
interface PlayerRanking {
  uid: string;
  name: string;
  played: number;   // Partidos jugados (PJ)
  won: number;      // Partidos ganados (PG)
  lost: number;     // Partidos perdidos (PP)
  draw: number;     // Partidos empatados (PE)
}
```

### Reglas de Negocio

| # | Regla | Implementación |
|---|-------|----------------|
| 1 | Solo admin puede acceder al ranking | Verificación manual de `profile.role` + redirect |
| 2 | Se leen todos los usuarios de la colección `users` | `getPlayersRanking()` en `lib/usersList.ts` |
| 3 | Valores por defecto 0 si `stats` no existe | Fallback `stats.played ?? 0` etc. |
| 4 | Tabla permite ordenar asc/desc por cualquier métrica | `sortField` + `sortDir` state en UI |
| 5 | Jugadores manuales (sin `uid`) no aparecen | Solo documentos de `users` collection (registrados) |

---

## 2. ARQUITECTURA DE LA IMPLEMENTACIÓN

```
┌─────────────────────────────────────────────────────┐
│                   ESPECIFICACIÓN                     │
└─────────────────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
    ┌────────┐     ┌─────────┐    ┌──────────┐
    │ DOMINIO│     │   API   │    │    UI    │
    └────────┘     └─────────┘    └──────────┘
    UserStats      getPlayers     RankingPage
    UserProfile    Ranking()      Header link
```

### Capas

#### **Capa 1: Dominio** (`lib/domain/user.ts`)

Tipos ya existentes reutilizados:

```typescript
export interface UserStats {
    played: number;
    won: number;
    lost: number;
    draw: number;
}
```

**✅ Cumple especificación**: Los stats se acumulan atómicamente vía `updatePlayerStats()`

#### **Capa 2: API** (`lib/usersList.ts`)

```typescript
export async function getPlayersRanking(): Promise<PlayerRanking[]> {
  const snapshot = await getDocs(collection(db, "users"));
  return snapshot.docs.map((d) => {
    const data = d.data();
    const stats = data.stats ?? {};
    return {
      uid: d.id,
      name: data.name ?? "Sin nombre",
      played: stats.played ?? 0,
      won: stats.won ?? 0,
      lost: stats.lost ?? 0,
      draw: stats.draw ?? 0,
    };
  });
}
```

**✅ Cumple especificación**: Reglas #2, #3, #5

#### **Capa 3: UI** (`app/admin/ranking/page.tsx`)

- Protección admin con `getUserProfile()` + redirect (igual que `admin/users`)
- Estado `sortField` (played/won/lost/draw) y `sortDir` (asc/desc)
- Headers clicables alternan dirección de ordenamiento
- Medallas 🥇🥈🥉 para top 3
- Colores contextuales: verde (ganados), amarillo (empates), rojo (perdidos)

**✅ Cumple especificación**: Reglas #1, #4

---

## 3. TRAZABILIDAD: ESPECIFICACIÓN → CÓDIGO

### Regla #1: Solo admin accede

1. **UI** (`app/admin/ranking/page.tsx`):
```typescript
getUserProfile(user.uid).then((p) => {
  if (p?.role !== "admin") router.replace("/");
});
```

### Regla #4: Ordenamiento dinámico

1. **UI**: Click en header alterna `sortField` y `sortDir`
2. **UI**: Array se ordena con `[...players].sort()` antes de renderizar

---

## 4. CRITERIOS DE ACEPTACIÓN ✅

### ✅ Criterio 1
**Given** un usuario no-admin
**When** accede a `/admin/ranking`
**Then** es redirigido a `/`

### ✅ Criterio 2
**Given** un admin accede al ranking
**When** los datos cargan
**Then** se muestran PJ, PG, PE, PP correctamente con valores por defecto 0

### ✅ Criterio 3
**Given** la tabla de ranking visible
**When** admin hace clic en "PG"
**Then** la lista se ordena de mayor a menor victorias

### ✅ Criterio 4
**Given** jugadores manuales sin `uid`
**When** se carga el ranking
**Then** no aparecen (solo documentos de `users` collection)

---

## 5. ARCHIVOS INVOLUCRADOS

| Capa | Archivo | Responsabilidad |
|------|---------|----------------|
| Dominio | `lib/domain/user.ts` | UserStats, UserProfile |
| API | `lib/usersList.ts` | getPlayersRanking() |
| API | `lib/playerStats.ts` | updatePlayerStats() (alimenta stats) |
| UI | `app/admin/ranking/page.tsx` | Tabla interactiva |
| UI | `components/Header.tsx` | Link "Ranking 🏆" (admin only) |

---

## 6. CONCLUSIÓN

✅ **Datos reales** consumidos de `users` collection con stats atómicos
✅ **Ordenamiento dinámico** por cualquier métrica estadística
✅ **Acceso protegido** — solo admins
✅ **Diseño coherente** con el resto de la app
✅ **Jugadores manuales excluidos** naturalmente (no tienen documento en `users`)
