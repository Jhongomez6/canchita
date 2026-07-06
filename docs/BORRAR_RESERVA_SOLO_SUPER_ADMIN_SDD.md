# Feature: Borrado permanente de reservas — solo Super Admin

## 📋 Specification-Driven Development (SDD)

Los location admins ya no pueden **borrar** (hard-delete) reservas: solo pueden **cancelarlas** (que conserva el registro en el historial). El borrado permanente queda reservado a super admins. Aplica a reservas manuales; las reservas online ya solo se pueden cancelar.

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo
Hoy un location admin puede eliminar permanentemente reservas manuales (borra el doc de `blocked_slots`), perdiendo la traza para auditoría/finanzas. Queremos que un location admin solo pueda **cancelar** (marca `status: "cancelled"`, conserva el registro) y que el **hard-delete** sea exclusivo de super admins.

### Alcance del término "borrar" (hard-delete)
Solo las operaciones que **eliminan el documento** de Firestore:

| Operación | Dónde | Efecto | Antes | Después |
|-----------|-------|--------|-------|---------|
| `deleteBlockedSlot` modo `oneoff` | `DeleteBlockedSlotSheet` → botón "Eliminar" | `tx.delete(slotRef)` | super + location | **super only** |
| `cancelManualReservation` scope `all` | `CancelManualReservationSheet` → "Toda la recurrencia (eliminar)" | `deleteDoc(slotRef)` | super + location | **super only** |

**NO cambian** (siguen disponibles para location admin — conservan historial):
- Cancelar (`status: "cancelled"`) — scopes `non_recurring`, `single`, `future`.
- `deleteBlockedSlot` modo `instance` ("cancelar solo este día" → `arrayUnion(exceptDates)`).
- `deleteBlockedSlot` modo `recurrence` ("terminar recurrencia" → trunca `endDate`, preserva instancias pasadas).

### Reservas online (`bookings`)
No existe ningún hard-delete: solo `cancelBooking`. Sin cambios de código. (No se endurecen rules porque `bookings` no expone `delete` directo a admins hoy.)

### Reglas de Negocio
| # | Regla | Impacto UI |
|---|-------|------------|
| 1 | Solo super admin puede hard-delete una reserva manual | Location admin: al tocar una reserva cancelada **no recurrente**, no se abre `DeleteBlockedSlotSheet` (card no clickable) |
| 2 | Location admin no ve la opción "Toda la recurrencia (eliminar)" | El selector de scope en `CancelManualReservationSheet` omite `all` |
| 3 | Cancelar sigue disponible para todos los admins del venue | Sin cambios en el flujo de cancelación |
| 4 | Enforcement server-side, no solo UI | `firestore.rules` + Cloud Function validan el rol |

---

## 2. ESCALABILIDAD
Sin impacto. No cambian queries, índices ni volumen. Es un cambio de autorización.

---

## 3. CONCURRENCIA SEGURA
Sin cambios en transacciones. `deleteBlockedSlot` ya corre en `runTransaction()`; solo se agrega un check de rol antes de la escritura. `cancelManualReservation` scope `all` (`deleteDoc`) queda bloqueado por rules para location admin.

---

## 4. SEGURIDAD

### Autorización (fuente de verdad = server)
Defensa en dos capas: **UI** (oculta affordances) + **enforcement** (rules + function). Un location admin que llame la API directamente debe recibir `permission-denied`.

### Firestore Rules — `venues/{venueId}/blocked_slots/{slotId}`
Hoy un único `allow write` cubre create/update/delete. Se separa para que `delete` sea super-only:

```
match /blocked_slots/{slotId} {
  allow read: if request.auth != null;
  allow create, update: if request.auth != null
    && (isSuperAdmin() || isLocationAdminFor(venueId));
  // Hard-delete permanente: solo super admin. Location admin cancela (update status).
  allow delete: if request.auth != null && isSuperAdmin();
}
```

> Nota: el Cloud Function `deleteBlockedSlot` usa el Admin SDK y **no** pasa por rules; su autorización se refuerza en código (ver §9). Estas rules cubren el `deleteDoc` client-side de `cancelManualReservation` scope `all`.

### Cloud Function `deleteBlockedSlot` (modo `oneoff`)
```typescript
const isSuper = userData?.adminType === "super_admin";
if (mode === "oneoff" && !isSuper) {
  throw new HttpsError("permission-denied", "Solo super admins pueden eliminar reservas");
}
// instance / recurrence: sigue permitido a location admin asignado
```

### Datos sensibles
Ninguno nuevo expuesto.

---

## 5. TOLERANCIA A FALLOS

| Error | Causa | Fallback UI |
|-------|-------|-------------|
| `permission-denied` en `deleteBlockedSlot` | Location admin fuerza la llamada | Toast de error (vía `handleError`); no debería alcanzarse porque la UI oculta el botón |
| `deleteDoc` denegado por rules (scope `all`) | Location admin fuerza el scope | Toast "Error al cancelar la reserva"; la UI ya oculta el radio `all` |

Degradación: si la UI de un location admin quedara desincronizada, el server rechaza — el peor caso es un toast, sin borrado.

---

## 6. UX — FLUJOS DE USUARIO

### Location admin
1. Reserva **activa** → botones footer: avanzar / editar / **cancelar** (tarro). Igual que hoy.
2. Reserva **cancelada, no recurrente** → tap en la card **no hace nada** (antes abría el sheet de eliminar). Queda en el historial.
3. Reserva **cancelada, recurrente** → tap abre `DeleteBlockedSlotSheet` con "Cancelar solo este día" y "Terminar recurrencia" (sin hard-delete del doc — ninguna de esas dos borra el doc).
4. Cancelar recurrencia → scopes visibles: "Solo este día", "Este día y los siguientes". **No** aparece "Toda la recurrencia (eliminar)".

### Super admin
Sin cambios: ve y puede usar todas las opciones, incluido el hard-delete.

### Estados de UI
| Estado | Qué muestra |
|--------|-------------|
| Card cancelada no-recurrente (location admin) | No clickable, opacada, con motivo de cancelación |
| Card cancelada no-recurrente (super) | Clickable → sheet con "Eliminar" |
| Selector scope cancelación (location admin) | 2 opciones (single, future) |
| Selector scope cancelación (super) | 3 opciones (single, future, all) |

---

## 7. UI DESIGN — COMPONENTES Y ANIMACIONES

Sin componentes nuevos ni animaciones nuevas. Se agrega la prop `isSuper: boolean` a componentes existentes y condicionales de render.

---

## 8. ANALYTICS
Sin eventos nuevos. `logBlockedSlotDeleted` / `logManualReservationCancelled` se mantienen (solo se disparan cuando la operación procede, que ahora es super-only para delete).

---

## 9. ARQUITECTURA TÉCNICA

### Propagación de `isSuper`
`app/venues/admin/[id]/page.tsx` ya calcula `const isSuper = profile ? isSuperAdmin(profile) : false` (línea 133). Se propaga como prop a:
- `AdminBookingCalendar` → `AdminBlockCard`
- `HourDetailDrawer` → `AdminBlockCard`
- `CancelManualReservationSheet`
- `DeleteBlockedSlotSheet` (guarda defensiva del botón `oneoff`)

### `AdminBlockCard`
```typescript
// clickable solo si: hay handler, está cancelada, y (es super O es recurrente)
const clickable = !!onClick && cancelled && (isSuper || !!block.recurrence);
```

### `CancelManualReservationSheet`
```typescript
const scopes = isSuper ? ["single", "future", "all"] : ["single", "future"];
```

### `DeleteBlockedSlotSheet`
El botón "Eliminar" (modo `oneoff`, solo visible cuando `!isRecurring`) se condiciona además a `isSuper`. Para recurrentes no hay cambio (instance/recurrence siguen).

---

## 10. CRITERIOS DE ACEPTACIÓN

- [ ] Location admin: tocar reserva cancelada no-recurrente no abre nada.
- [ ] Location admin: `CancelManualReservationSheet` no muestra "Toda la recurrencia (eliminar)".
- [ ] Location admin: puede cancelar (single/future) y terminar recurrencia normalmente.
- [ ] Super admin: sin cambios; puede eliminar y usar scope `all`.
- [ ] `deleteBlockedSlot` modo `oneoff` llamado por location admin → `permission-denied`.
- [ ] `deleteDoc` de `blocked_slots` por location admin → denegado por rules.
- [ ] Reservas online siguen solo cancelables (sin regresión).

---

## 11. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---------|--------|
| `firestore.rules` | Separar `write` de `blocked_slots`: `create, update` (super+location) / `delete` (super only) |
| `functions/src/blocked-slots.ts` | `deleteBlockedSlot`: modo `oneoff` requiere `super_admin` |
| `components/booking/AdminBlockCard.tsx` | Prop `isSuper`; `clickable` incluye `(isSuper \|\| recurrence)` |
| `components/booking/CancelManualReservationSheet.tsx` | Prop `isSuper`; ocultar scope `all` si no es super |
| `components/booking/DeleteBlockedSlotSheet.tsx` | Prop `isSuper`; guarda del botón `oneoff` |
| `components/booking/AdminBookingCalendar.tsx` | Prop `isSuper` → `AdminBlockCard` |
| `components/booking/HourDetailDrawer.tsx` | Prop `isSuper` → `AdminBlockCard` |
| `app/venues/admin/[id]/page.tsx` | Pasar `isSuper` a los 4 componentes |
