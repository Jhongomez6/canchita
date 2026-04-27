# Feature: Edit Match Date/Time (Super Admin)

## 📋 Specification-Driven Development (SDD)

Permite al super admin corregir la fecha, hora y duración de un partido ya creado desde la pestaña Configuración.

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo
El super admin necesita poder corregir errores de fecha/hora/duración en partidos ya creados sin tener que borrar y recrear el partido (perdiendo jugadores y datos).

### Reglas de Negocio
| # | Regla | Impacto UI |
|---|-------|------------|
| 1 | Solo `super_admin` puede editar fecha/hora | La sección no se renderiza para otros roles |
| 2 | Se puede editar en partido abierto o cerrado | Sin restricción por estado |
| 3 | No se puede editar si `statsProcessed === true` | Botón deshabilitado + tooltip explicativo |
| 4 | Los tres campos se actualizan atómicamente: `date`, `time`, `startsAt` | Una sola llamada a `updateDoc` |
| 5 | `duration` es editable independientemente (ya existe para owner) | Campo separado (ya implementado en SettingsTab) |
| 6 | La hora debe ser formato HH:MM válido (00:00–23:59) | Validación antes de guardar |
| 7 | La fecha debe ser YYYY-MM-DD válida | Validación con `Date.parse` |

---

## 2. ESCALABILIDAD

### Volumen esperado
- Operación admin infrecuente (< 5 veces/día)
- Sin impacto en escalabilidad

### Índices Firestore requeridos
- Ninguno nuevo — actualiza documento existente por ID

### Paginación
- No aplica

---

## 3. CONCURRENCIA SEGURA

### Operaciones que requieren `runTransaction()`
- No se requiere transacción: la actualización de fecha/hora no compite con operaciones de jugadores
- Simple `updateDoc` es suficiente (campo de metadato, no estado de cupo)

### Race conditions identificadas
- Escenario: admin edita hora mientras jugador confirma asistencia → Sin conflicto, son campos distintos

---

## 4. SEGURIDAD

### Autenticación y autorización
- Solo usuarios con `roles.includes("admin") && adminType === "super_admin"` pueden ver y usar esta sección
- La verificación ocurre en el cliente (UI) y debe verificarse en Firestore Rules

### Firestore Rules requeridas
```
// En la regla de update de matches, agregar condición:
// El super_admin puede actualizar date/time/startsAt en cualquier momento
// (ya existe regla general para admins — verificar que cubra estos campos)
```
> **Nota**: Revisar `firestore.rules` para confirmar que la regla de update de super_admin ya permite modificar `date`, `time`, `startsAt`. Si no existe regla explícita, el `updateDoc` fallará en producción.

### Validaciones de input
- `date`: formato YYYY-MM-DD, fecha parseable por `Date`
- `time`: formato HH:MM, horas 0–23, minutos 0–59
- Ambos campos requeridos antes de guardar

### Datos sensibles
- Ninguno — fecha y hora son datos públicos del partido

---

## 5. TOLERANCIA A FALLOS

### Estados de error y fallbacks
| Error | Causa probable | Fallback UI |
|-------|---------------|-------------|
| Firestore permission denied | Regla no cubre super_admin | Toast error + mantener valores originales |
| Fecha inválida | Input mal formateado | Validación client-side, botón deshabilitado |
| Network error | Desconexión | Toast error con mensaje genérico |

### Retry strategy
- Sin retry automático — el admin puede intentar de nuevo manualmente

### Degradación elegante
- Si falla, los campos vuelven a los valores originales del partido

---

## 6. UX — FLUJOS DE USUARIO

### Flujo principal (happy path)
1. Super admin abre partido → va a pestaña Configuración
2. Ve sección "Fecha y hora (Admin)" con los valores actuales prellenados
3. Modifica fecha y/o hora
4. Hace click en "Guardar cambios"
5. Toast de éxito → campos actualizados en pantalla

### Estados de UI
| Estado | Qué muestra |
|--------|-------------|
| Inicial | Inputs con `match.date` y `match.time` actuales |
| Sin cambios | Botón "Guardar" deshabilitado (gris) |
| Con cambios | Botón "Guardar" activo (verde) |
| Guardando | Botón con spinner + texto "Guardando…" |
| Éxito | Toast verde "Fecha y hora actualizadas" |
| Error | Toast rojo con descripción del error |
| Stats procesadas | Sección visible pero botón deshabilitado + nota explicativa |

### Consideraciones mobile-first
- Inputs `date` y `time` usan `type="date"` y `type="time"` nativos → teclado y picker correctos en iOS/Android
- `text-base` en inputs para prevenir zoom en iOS

---

## 7. UI DESIGN — COMPONENTES Y ANIMACIONES

### Componentes nuevos
- Ningún componente nuevo — se agrega sección dentro de `SettingsTab.tsx`

### Sección en SettingsTab
```tsx
{/* Solo visible para super_admin — prop `isSuperAdmin` */}
{isSuperAdmin && (
  <div className="bg-white rounded-2xl shadow-sm border border-purple-100 p-5">
    <h3>Fecha y hora <span className="badge">Admin</span></h3>
    <input type="date" value={localDate} ... />
    <input type="time" value={localTime} ... />
    <button onClick={handleSaveDatetime}>Guardar cambios</button>
  </div>
)}
```

### Animaciones
- `animate-in fade-in` heredado del contenedor padre (ya existe en SettingsTab)

### Responsive
- Mobile: inputs full-width apilados verticalmente
- Desktop: inputs en fila (flex-row gap-3)

---

## 8. ANALYTICS

| Evento | Trigger | Propiedades |
|--------|---------|-------------|
| `match_datetime_edited` | Super admin guarda nueva fecha/hora | `match_id`, `old_date`, `old_time`, `new_date`, `new_time` |

---

## 9. ARQUITECTURA TÉCNICA

### Modelo de datos
No hay cambios de schema — los campos `date: string`, `time: string`, `startsAt: Timestamp` ya existen en `Match`.

### Capa de dominio (`lib/domain/`)
No requiere cambios — validación simple de strings de fecha/hora.

### Capa de API (`lib/matches.ts`)
Nueva función:
```typescript
export async function updateMatchDatetime(
  matchId: string,
  date: string,   // YYYY-MM-DD
  time: string    // HH:MM
): Promise<void> {
  const startsAt = new Date(`${date}T${time}:00-05:00`);
  await updateDoc(doc(db, "matches", matchId), {
    date,
    time,
    startsAt: Timestamp.fromDate(startsAt),
  });
}
```

### Componentes UI (`app/`)
| Archivo | Cambio |
|---------|--------|
| `app/match/[id]/components/SettingsTab.tsx` | + prop `isSuperAdmin: boolean`, + prop `onUpdateDatetime`, + nueva sección de edición de fecha/hora |
| `app/match/[id]/page.tsx` | + derivar `superAdmin = isSuperAdmin(profile)`, pasar props a `SettingsTab`, + handler `handleUpdateDatetime` que llama `updateMatchDatetime` |
| `lib/matches.ts` | + función `updateMatchDatetime` |

---

## 10. CRITERIOS DE ACEPTACIÓN

- [ ] Solo aparece para usuarios con `adminType === "super_admin"`
- [ ] Los inputs se precargan con `match.date` y `match.time` actuales
- [ ] El botón Guardar está deshabilitado si no hay cambios respecto al partido actual
- [ ] Al guardar, se actualizan `date`, `time` y `startsAt` en Firestore atomicamente
- [ ] El `startsAt` generado usa timezone `-05:00` (Colombia), igual que `createMatch`
- [ ] Toast de éxito al guardar correctamente
- [ ] Toast de error si falla (con detalle copiable via `handleError`)
- [ ] Si `statsProcessed === true`, el botón está deshabilitado con nota explicativa
- [ ] Inputs usan `text-base` (sin zoom iOS)
- [ ] Se emite evento analytics `match_datetime_edited`

---

## 11. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---------|--------|
| `lib/matches.ts` | + `updateMatchDatetime()` |
| `app/match/[id]/components/SettingsTab.tsx` | + sección super-admin de edición de fecha/hora |
| `app/match/[id]/page.tsx` | + handler + props a SettingsTab |
| `firestore.rules` | Verificar que super_admin pueda actualizar `date`/`time`/`startsAt` |
