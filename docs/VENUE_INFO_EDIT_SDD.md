# Feature: Edición de información de sede (super admin)

## Specification-Driven Development (SDD)

Permite al super admin editar nombre, dirección, teléfono, descripción, foto de portada y estado activo de una sede directamente desde el panel admin.

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo
El super admin necesita poder actualizar la información pública de una sede sin acceder a Firestore directamente. Actualmente solo puede editar configuración de pagos, canchas y horarios.

### Reglas de Negocio
| # | Regla | Impacto UI |
|---|-------|------------|
| 1 | Solo `super_admin` puede editar info de sede | Tab "Sede" invisible para `location_admin` |
| 2 | Imagen se convierte a data URL en cliente, se sube a Storage al guardar | Preview inmediato, upload diferido |
| 3 | Imagen máx 5 MB, cualquier formato de imagen aceptado | Validación en `handleVenueImageChange` |
| 4 | `phone` y `description` son opcionales — guardar como `undefined` si vacíos | Evita strings vacíos en Firestore |
| 5 | `active=false` oculta la sede para jugadores (`getActiveVenues` filtra por `active==true`) | Toggle visible solo para super admin |

---

## ⚠️ Decisiones de Diseño Clave

- **Upload diferido**: La imagen se sube solo al presionar "Guardar cambios", no al seleccionarla. Esto evita imágenes huérfanas en Storage si el usuario cancela.
- **`handleSave` unificado**: Los campos de info se incluyen siempre en el `updateVenueSettings` call del `handleSave` existente. No hay lógica separada por tab — un solo `Promise.all`.
- **`imageURL` en `updateVenueSettings`**: Se agrega al tipo aceptado en `lib/venues.ts` para persistir la URL final (ya sea la nueva subida o la existente).
- **Path Storage**: `venues/{venueId}/cover.webp` — sobreescritura directa, sin versionado. Simple y suficiente para este scope.

---

## 2. ESCALABILIDAD

### Volumen esperado
- Operación infrecuente (cada semanas/meses por sede)
- Un solo doc de venue — sin queries adicionales

### Índices Firestore requeridos
- Ninguno nuevo

### Paginación
- No aplica

---

## 3. CONCURRENCIA SEGURA

### Operaciones que requieren `runTransaction()`
- No aplica: `updateVenueSettings` usa `updateDoc` simple. Conflicto entre dos admins editando simultáneamente es escenario improbable y aceptable (last-write-wins).

### Race conditions identificadas
- Dos admins guardan al mismo tiempo → last-write-wins en Firestore. Aceptable dado que hay un solo super admin por instalación.

---

## 4. SEGURIDAD

### Autenticación y autorización
- Solo `super_admin` ve y puede interactuar con el tab "Sede"
- Firestore Rules deben permitir `update` en `venues/{id}` solo a super admins (ya existente)

### Validaciones de input
- Imagen: tipo `image/*`, tamaño máx 5 MB (validado en cliente)
- Nombre y dirección: strings no vacíos (responsabilidad del admin, no se bloquea guardado)
- Teléfono y descripción: opcionales, se omiten si están vacíos

### Datos sensibles
- Ninguno en este scope

---

## 5. TOLERANCIA A FALLOS

### Estados de error y fallbacks
| Error | Causa probable | Fallback UI |
|-------|---------------|-------------|
| Upload falla | Permisos Storage / red | `handleError` muestra toast, no se guarda |
| `updateDoc` falla | Permisos Firestore / red | `handleError` muestra toast |
| Archivo muy grande | Usuario sube >5MB | Toast de error, imagen no se carga |

### Retry strategy
- Sin retry automático. El usuario puede intentar guardar de nuevo.

### Degradación elegante
- Si `imageURL` está vacío, se muestra placeholder con icono

---

## 6. UX — FLUJOS DE USUARIO

### Flujo principal (happy path)
1. Super admin abre tab "Sede" → ve campos prellenados con datos actuales
2. Edita nombre / teléfono / descripción → botón "Guardar cambios" se activa
3. Opcionalmente toca la foto → selector de archivo → preview inmediato
4. Presiona "Guardar cambios" → si hay imagen nueva se sube primero, luego `updateVenueSettings`
5. Toast "Cambios guardados" → botón vuelve a desactivarse

### Estados de UI
| Estado | Qué muestra |
|--------|-------------|
| Cargando | Skeleton existente |
| Sin foto | Placeholder con `ImageIcon` + texto "Toca para subir foto" |
| Foto seleccionada | Preview del data URL + aviso "Se subirá al guardar cambios" |
| Guardando | `Loader2` sobre la imagen + botón "Guardando..." |
| Error | Toast con detalle copiable |

### Consideraciones mobile-first
- `text-base` en todos los inputs (anti-zoom iOS)
- `aspect-video` para la foto de portada
- Bottom padding `pb-24 md:pb-0` heredado de la página

---

## 7. UI DESIGN — COMPONENTES Y ANIMACIONES

### Componentes nuevos
- Ninguno — todo inline en `page.tsx`

### Animaciones
- Las existentes de tab switching

### Responsive
- Mobile: stack vertical, foto full-width
- Desktop (md+): igual, max-w-md centra el contenido

---

## 8. ANALYTICS

No se agregan eventos nuevos para este scope. El guardado general ya dispara `logVenueAdminCourtConfigured`.

---

## 9. ARQUITECTURA TÉCNICA

### Modelo de datos
Sin cambios en la interfaz `Venue`. Los campos `name`, `address`, `phone`, `description`, `imageURL`, `active` ya existen.

### Capa de dominio (`lib/domain/`)
Sin cambios.

### Capa de API (`lib/`)
- `lib/storage.ts` → agregar `uploadVenueImage(venueId, dataUrl)`
- `lib/venues.ts` → agregar `imageURL` al tipo de `updateVenueSettings`

### Componentes UI (`app/`)
- `app/venues/admin/[id]/page.tsx` → tab "info" + estado local + lógica de imagen

---

## 10. CRITERIOS DE ACEPTACIÓN

- [ ] Tab "Sede" visible solo para super admin
- [ ] Campos prellenados con datos actuales del venue
- [ ] Cambiar cualquier campo activa el botón "Guardar cambios"
- [ ] Seleccionar imagen muestra preview inmediato y aviso de upload diferido
- [ ] Al guardar con imagen nueva, se sube a `venues/{venueId}/cover.webp` y se persiste la URL
- [ ] Al guardar sin imagen nueva, se conserva `venueImageURL` existente
- [ ] Toggle de sede activa funciona y se persiste
- [ ] Inputs con `text-base` mínimo (no hay zoom en iOS)
- [ ] Archivos >5MB muestran toast de error y no se cargan

---

## 11. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---------|--------|
| `lib/storage.ts` | Agregar `uploadVenueImage` |
| `lib/venues.ts` | Agregar `imageURL` al tipo de `updateVenueSettings` |
| `app/venues/admin/[id]/page.tsx` | Tab "info", estado, lógica de imagen, handleSave actualizado |
