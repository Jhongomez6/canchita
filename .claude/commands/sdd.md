---
description: Crea un SDD completo para una nueva feature como fuente de verdad antes de implementar
---

Crea un Specification-Driven Development (SDD) document completo para la siguiente feature: **$ARGUMENTS**

## Instrucciones

1. Determina el nombre del archivo: `docs/[NOMBRE_EN_MAYUSCULAS_CON_GUIONES]_SDD.md`
2. Explora el codebase relevante con Glob/Grep para entender el contexto existente (modelos de datos, componentes relacionados, patrones usados)
3. Genera el SDD completo siguiendo el template obligatorio definido en CLAUDE.md regla #1
4. Guarda el archivo en `docs/`
5. Presenta al usuario un resumen de las decisiones de diseño más importantes y pregunta si quiere ajustar algo antes de proceder con la implementación

## Criterios de calidad del SDD

El SDD debe ser **específico y accionable**, no genérico. Cada sección debe:

### Escalabilidad
- Estimar volúmenes reales basados en el contexto de Canchita (app de fútbol amateur, crecimiento gradual)
- Identificar índices Firestore compuestos concretos que se necesitarán
- Definir estrategia de paginación si hay listas

### Concurrencia segura
- Listar CADA operación de escritura que puede tener race conditions
- Para cada una: describir el escenario de conflicto y cómo `runTransaction()` lo resuelve

### Seguridad
- Escribir las Firestore Rules exactas (no genéricas) que se necesitan
- Identificar validaciones de input específicas al dominio
- Señalar si hay datos que no deben estar en queries públicas

### Tolerancia a fallos
- Definir el comportamiento concreto para cada error conocido (Firestore offline, timeout, permisos denegados)
- Especificar qué ve el usuario en cada caso de fallo

### UX
- Describir el flujo completo paso a paso (no solo el happy path)
- Especificar TODOS los estados de UI: cargando, vacío, error, éxito, parcial
- Incluir consideraciones de accesibilidad y mobile-first

### UI Design
- Ser específico sobre animaciones: qué elemento, qué tipo de transición, qué duración
- Definir componentes nuevos con sus props principales
- Especificar breakpoints responsive concretos

### Analytics
- Nombrar eventos en `snake_case` siguiendo la convención del proyecto
- Incluir todas las propiedades de contexto relevantes

## Importante

- Escribe TODO el contenido del SDD en **español** (siguiendo la convención del proyecto para contenido visible/documentación)
- Variables, tipos, nombres de funciones en **inglés**
- Sé concreto: usa nombres reales de archivos, colecciones, componentes del proyecto
- Al final del SDD, agrega una sección `## ⚠️ Decisiones de Diseño Clave` con los 3-5 puntos más importantes que el usuario debe revisar y aprobar antes de implementar
