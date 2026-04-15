# Feature: Borrar Partido

## 📋 Specification-Driven Development (SDD)

Este documento describe la feature de **borrado de partidos**, que permite al creador del partido o a un super_admin eliminar permanentemente un partido y todos sus datos.

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo

Permitir que el owner de un partido o un super_admin lo elimine permanentemente, con una confirmación explícita para evitar borrados accidentales.

### Reglas de Negocio

| # | Regla | Implementación |
|---|-------|----------------|
| 1 | Solo el owner (`createdBy`) o super_admin puede borrar | `isOwner` ya definido en `app/match/[id]/page.tsx` |
| 2 | El botón es visible en cualquier estado del partido (abierto o cerrado) | Sin condicional de `isClosed` |
| 3 | Requiere confirmación explícita antes de ejecutar | Diálogo modal de confirmación |
| 4 | Tras borrar, redirige al home `/` | `router.push("/")` |
| 5 | Si el partido tiene jugadores con uid (confirmados o en lista de espera), se usa `deleteMatchWithRefunds` Cloud Function que: reembolsa depósitos a jugadores con `depositPaid: true`, y envía notificaciones in-app a TODOS los jugadores con uid (confirmados + waitlist). Si no hay jugadores ni depósito, se hace `deleteDoc` directo. | `deleteMatch()` en `lib/matches.ts` + `deleteMatchWithRefunds` Cloud Function |
| 8 | Al cancelar el partido, el modal de confirmación informa al admin que los depósitos correspondientes serán reembolsados (cuando `match.deposit > 0`). | Modal en `SettingsTab.tsx` |
| 6 | Firestore permite el borrado solo al owner o super_admin | Actualización en `firestore.rules` |
| 7 | No location_admin ni team_admin de otra cancha puede borrar | Solo `createdBy == auth.uid` o `isSuperAdmin()` |

### Flujo de Usuario

```
Admin abre /match/[id]
         │
         ▼
  Toca "🗑️ Borrar partido"
  (solo visible para isOwner)
         │
         ▼
  Modal de confirmación:
  ┌─────────────────────────────────┐
  │  ⚠️ ¿Borrar este partido?       │
  │                                 │
  │  Esta acción es permanente.     │
  │  Se eliminarán el partido y     │
  │  todos sus datos (jugadores,    │
  │  equipos, votos MVP).           │
  │                                 │
  │  [Cancelar]  [Sí, borrar]       │
  └─────────────────────────────────┘
         │
    ┌────┴────┐
    ▼         ▼
 Cancelar  Confirmar
    │         │
    │         ▼
    │   deleteMatch(matchId)
    │   router.push("/")
    ▼
 Cierra modal
```

---

## 2. ARCHIVOS INVOLUCRADOS

| Capa | Archivo | Cambio |
|------|---------|--------|
| Reglas | `firestore.rules` | Actualizar `allow delete` en `/matches/{matchId}` |
| API | `lib/matches.ts` | `deleteMatch(matchId, opts?: { hasDeposit?: boolean; confirmedCount?: number }): Promise<{ refundedCount: number }>` |
| API | `lib/wallet.ts` | Wrapper `deleteMatchWithRefunds` que llama la Cloud Function via `httpsCallable` |
| Backend | `functions/src/payments.ts` | `deleteMatchWithRefunds` Cloud Function: reembolsos + notificaciones in-app a todos los jugadores con uid |
| UI | `app/match/[id]/page.tsx` | Agregar botón + modal de confirmación para `isOwner` |
| Doc | `docs/DELETE_MATCH_FEATURE_SDD.md` | Este documento |

---

## 3. ESPECIFICACIÓN TÉCNICA

### 3.1 `firestore.rules` — Permiso de Borrado

Reemplazar:
```
allow delete: if false;
```
Por:
```
// 🗑️ Borrar: solo el creador o super_admin
allow delete: if request.auth != null
  && (
    resource.data.createdBy == request.auth.uid
    || isSuperAdmin()
  );
```

La función `isSuperAdmin()` ya existe en el archivo (línea 15).

### 3.2 `lib/matches.ts` — Función `deleteMatch`

```typescript
// In lib/matches.ts
export async function deleteMatch(matchId: string, opts?: { hasDeposit?: boolean; confirmedCount?: number }): Promise<{ refundedCount: number }> {
  const needsFunction = (opts?.hasDeposit ?? false) || (opts?.confirmedCount ?? 0) > 0;
  if (needsFunction) {
    const { deleteMatchWithRefunds } = await import("./wallet");
    return deleteMatchWithRefunds(matchId);
  }
  const ref = doc(db, "matches", matchId);
  await deleteDoc(ref);
  return { refundedCount: 0 };
}
```

**Lógica de decisión:**
- Si `hasDeposit || confirmedCount > 0` → llama `deleteMatchWithRefunds` Cloud Function (reembolsos + notificaciones + borrado)
- Si no hay depósito NI jugadores con uid → `deleteDoc` directo (optimización de costos)

### 3.3 `app/match/[id]/page.tsx` — Botón + Modal

**Importar:**
```typescript
import { ..., deleteMatch } from "@/lib/matches";
```

**Estado:**
```typescript
const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
const [deleting, setDeleting] = useState(false);
```

**Handler:**
```typescript
async function handleDeleteMatch() {
  if (!matchId) return;
  setDeleting(true);
  try {
    await deleteMatch(matchId);
    router.push("/");
  } catch (err) {
    handleError(err, "No se pudo borrar el partido");
    setDeleting(false);
    setShowDeleteConfirm(false);
  }
}
```

**Botón** (al final de las acciones de admin, zona de peligro):
```tsx
{isOwner && (
  <button
    onClick={() => setShowDeleteConfirm(true)}
    className="w-full py-3 bg-red-50 text-red-600 border border-red-200
               rounded-xl font-bold text-sm hover:bg-red-100 transition-colors"
  >
    🗑️ Borrar partido
  </button>
)}
```

**Modal de confirmación:**
```tsx
{showDeleteConfirm && (
  <div className="fixed inset-0 z-[70] flex items-center justify-center
                  bg-black/60 backdrop-blur-sm p-4">
    <div className="bg-white rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl">
      <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex
                      items-center justify-center mx-auto mb-4 text-3xl">
        ⚠️
      </div>
      <h3 className="text-xl font-black mb-2 text-slate-800">¿Borrar partido?</h3>
      <p className="text-sm text-slate-500 mb-6">
        Esta acción es permanente. Se eliminarán el partido y todos sus datos
        (jugadores, equipos, votos MVP).
      </p>
      <div className="flex flex-col gap-3">
        <button
          onClick={handleDeleteMatch}
          disabled={deleting}
          className="w-full bg-red-500 hover:bg-red-600 text-white font-bold
                     py-3.5 rounded-xl transition-all disabled:opacity-50"
        >
          {deleting ? "Borrando..." : "Sí, borrar partido"}
        </button>
        <button
          onClick={() => setShowDeleteConfirm(false)}
          disabled={deleting}
          className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700
                     font-bold py-3.5 rounded-xl transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  </div>
)}
```

---

## 4. CRITERIOS DE ACEPTACIÓN

### AC-1: Visibilidad del botón — Owner

**Given** un admin que es el creador del partido (`createdBy == user.uid`)
**When** abre `/match/[id]`
**Then** ve el botón "🗑️ Borrar partido" al final de la página

### AC-2: Visibilidad del botón — Super Admin

**Given** un super_admin
**When** abre cualquier `/match/[id]`
**Then** ve el botón "🗑️ Borrar partido"

### AC-3: No visible para otros admins

**Given** un location_admin o team_admin que NO es el creador del partido
**When** abre `/match/[id]`
**Then** NO ve el botón "🗑️ Borrar partido"

### AC-4: Flujo de confirmación

**Given** el owner ve el botón
**When** lo toca
**Then** aparece un modal de confirmación con advertencia de acción permanente

### AC-5: Cancelar no borra

**Given** el modal está abierto
**When** el usuario toca "Cancelar"
**Then** el modal se cierra y el partido sigue existiendo

### AC-6: Confirmar borra y redirige

**Given** el modal está abierto
**When** el usuario confirma
**Then** si el partido tiene depósito o jugadores → Cloud Function maneja reembolsos + notificaciones + borrado; si no → delete directo en Firestore. El usuario es redirigido a `/`.

### AC-7: Seguridad en Firestore

**Given** un usuario autenticado que NO es owner ni super_admin
**When** intenta hacer un delete directo en Firestore
**Then** la operación es rechazada por las security rules

---

## 5. PLAN DE VERIFICACIÓN

1. Abrir un partido como owner → ver botón al final de la página
2. Tocar el botón → ver modal de confirmación
3. Cancelar → partido sigue existiendo
4. Confirmar → partido eliminado, redirigir a `/`
5. Verificar en Firebase Console que el documento fue borrado
6. Abrir el mismo partido como location_admin no owner → no ver botón
7. Abrir como super_admin → ver botón en cualquier partido
