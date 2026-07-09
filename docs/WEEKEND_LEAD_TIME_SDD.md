# Feature: Anticipación mínima en fin de semana

## 📋 Specification-Driven Development (SDD)

En fin de semana, un cliente no puede reservar un horario que empiece con menos de 2 horas de anticipación respecto al momento actual.

Extiende el sistema de reservas — Ref: `docs/BOOKING_SYSTEM_SDD.md`.

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo
Evitar reservas de última hora en los días de mayor demanda (sábado y domingo), donde la sede necesita margen operativo para preparar la cancha y confirmar el abono. Solo aplica a reservas hechas por **clientes** (jugadores), nunca a la reserva manual del admin.

### Reglas de Negocio
| # | Regla | Impacto UI |
|---|-------|------------|
| 1 | Si la fecha de la reserva cae en fin de semana (sábado o domingo), el `startTime` del slot debe ser ≥ `now + weekendMinLeadHours`. | Slots dentro de la ventana aparecen como no disponibles ("Muy pronto"). |
| 2 | Entre semana (lun–vie) no hay anticipación mínima; solo el filtro existente de "no reservar en el pasado". | Sin cambios. |
| 3 | La ventana es **configurable por sede** (`Venue.weekendMinLeadHours`, 0–12h). `0` o ausente = sin restricción. Se edita en el panel admin. | Input numérico en la config de la sede. |
| 4 | La regla NO aplica a la reserva manual del admin (`AdminSlotPicker`). | Admin puede seguir reservando cualquier hora futura. |

**Nota:** Como la anticipación se mide contra `now`, la regla solo tiene efecto real en reservas del **mismo día** de fin de semana. Un sábado reservado con días de antelación nunca cae dentro de la ventana.

---

## 2. ESCALABILIDAD
Sin impacto. Es un filtro puro en memoria sobre los slots ya cargados. No agrega queries ni índices.

---

## 3. CONCURRENCIA SEGURA
Sin operaciones nuevas de escritura. La validación de servidor (§4) se ejecuta antes de la transacción existente de `createBooking`, no la modifica.

---

## 4. SEGURIDAD

### Autenticación y autorización
Sin cambios. La regla aplica a cualquier cliente autenticado que use el flujo `createBooking`.

### Validación de input (defensa en profundidad)
El cliente oculta los slots inválidos, pero **el servidor vuelve a validar** en `createBooking` (OWASP: nunca confiar en el cliente). Si un cliente manipulado envía un slot de fin de semana dentro de la ventana de 2h, la función lanza `HttpsError("failed-precondition", ...)`.

La validación de servidor usa hora de Colombia (`America/Bogota`, UTC-5) para calcular `now`, consistente con el cálculo de `todayISO` existente.

---

## 5. TOLERANCIA A FALLOS
| Error | Causa probable | Fallback UI |
|-------|---------------|-------------|
| Slot rechazado por servidor | Cliente con reloj adelantado / manipulación | Toast de error de `createBooking` (ya existente vía `handleError`). |

---

## 6. UX — FLUJOS DE USUARIO

### Flujo principal
1. Cliente abre una sede un sábado por la mañana → los slots que empiezan en menos de 2h se ven deshabilitados con la etiqueta "Muy pronto".
2. Cliente selecciona un slot válido (≥2h) → flujo de reserva normal.

### Estados de UI
| Estado | Qué muestra |
|--------|-------------|
| Slot en ventana de 2h (fin de semana) | Deshabilitado, etiqueta "Muy pronto" en vez de "Ocupado". |
| Slot válido | Normal. |

---

## 7. UI DESIGN
Se reutiliza `SlotList`. Se agrega un campo opcional `unavailableReason` a `SlotItem` para diferenciar "Ocupado" (cancha llena) de "Muy pronto" (anticipación).

---

## 8. ANALYTICS
Sin eventos nuevos.

---

## 9. ARQUITECTURA TÉCNICA

### Modelo de datos (`Venue`)
```typescript
/** Anticipación mínima (horas) para clientes en fin de semana. 0/ausente = sin restricción. */
weekendMinLeadHours?: number;
```

### Capa de dominio (`lib/domain/venue.ts`)
```typescript
export const MIN_WEEKEND_LEAD_HOURS = 0;
export const MAX_WEEKEND_LEAD_HOURS = 12;
export const DEFAULT_WEEKEND_LEAD_HOURS = 2;
export function isWeekendDate(dateStr: string): boolean;
export function minLeadMinutesForDate(dateStr: string, weekendLeadHours = 0): number;
export function validateWeekendLeadHours(hours: number): void;
// generateTimeSlots(schedule, date, nowISO?, minLeadMinutes = 0)
```

### Servidor (`functions/src/bookings.ts`)
Validación en `createBooking` tras leer el venue (usa `venue.weekendMinLeadHours`).

### Admin (`app/venues/admin/[id]/page.tsx`)
Input numérico de horas en la config de la sede; se persiste con `updateVenueSettings`.

---

## 10. CRITERIOS DE ACEPTACIÓN
- [ ] Admin configura las horas de anticipación por sede (0–12h) y se persiste.
- [ ] Sábado/domingo con `weekendMinLeadHours>0`: slots dentro de la ventana se muestran deshabilitados ("Muy pronto").
- [ ] Sábado/domingo: slots fuera de la ventana reservables normalmente.
- [ ] `weekendMinLeadHours=0` o ausente: sin restricción.
- [ ] Lun–vie: sin cambios de comportamiento.
- [ ] Reserva manual del admin no se ve afectada.
- [ ] `createBooking` rechaza en servidor un slot de fin de semana dentro de la ventana.

---

## 11. ARCHIVOS INVOLUCRADOS
| Archivo | Cambio |
|---------|--------|
| `lib/domain/venue.ts` | Campo `weekendMinLeadHours` en `Venue`, constantes, helpers, `validateWeekendLeadHours`, param `minLeadMinutes` en `generateTimeSlots`. |
| `lib/venues.ts` | `updateVenueSettings` acepta y valida `weekendMinLeadHours`. |
| `app/venues/[id]/page.tsx` | Pasar `minLeadMinutes` según fecha + config de la sede; marcar `unavailableReason`. |
| `components/booking/SlotList.tsx` | Etiqueta "Muy pronto" vía `unavailableReason`. |
| `app/venues/admin/[id]/page.tsx` | Input de horas en la config + carga/guardado. |
| `functions/src/bookings.ts` | Validación de servidor en `createBooking` usando `venue.weekendMinLeadHours`. |
