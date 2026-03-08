# Feature: Partidos Privados y UX de Creación

## 📋 Specification-Driven Development (SDD)

Nueva funcionalidad que permite a los "Admins" (Creadores de Partidos) instaurar encuentros de carácter **Privado**. Estos partidos no son visibles en el portal público (Explorar) y solo se pueden acceder mediante el enlace directo. Simultáneamente, se ha modernizado por completo la interfaz gráfica de `Nuevo Partido`.

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo
Soportar la creación de partidos exclusivos (p. ej., cumpleaños, ligas cerradas, alquileres privados) donde no se desean jugadores "random" o "desconocidos" llenando cupos.

### Reglas de Negocio Implementadas

| # | Regla | Impacto / UI |
|---|---|---|
| 1 | Visibilidad Condicional | Si `Match.isPrivate === true`, el partido NO se renderiza bajo ninguna circunstancia en la grilla de `/explore`. Se filtra activamente en el *real-time listener* (`onSnapshot`) y en métodos de respaldo como `getOpenMatches`. |
| 2 | Acceso por Enlace (Link) | La única ruta de acceso a un partido privado es poseer el link directo (`/join/[id]`), comportándose conceptualmente como un "Enlace Oculto" o "Unlisted". |
| 3 | Distintivos Visuales | La interfaz de usuario en `Match Detail` (`/match/[id]`) y `Join Match` (`/join/[id]`) exponen un "badge" dinámico `🔒 Privado` junto al estado del partido si éste es de tipo privado. |
| 4 | UX Renovada de Creación | El listado del formulario `[app/new-match]` deja de ser un esqueleto funcional y adquiere el aspecto Emerald Green, separando semánticamente en "Cards" el `Cuándo`, `Dónde` y la `Configuración`. |
| 5 | Toggle Intuitivo | El flag de privacidad no es un simple checkbox; se construyó un "Toggle Switch" iOS-like para maximizar el feedback háptico/visual del estado público/privado. |

---

## 2. ARQUITECTURA TÉCNICA

### 2.1 Modificaciones en el Modelo Base (`lib/domain/match.ts`)
*   La Interfaz de Lectura y el Input de Escritura (`Match` & `CreateMatchInput`) ahora exigen o toleran el booleano `isPrivate`:
    ```typescript
    export interface Match {
      ...
      isPrivate?: boolean; // If true, hide from Explore
    }
    ```

### 2.2 Mutaciones en Backend Firebase (`lib/matches.ts`)
*   `createMatch(...)`: 
    Recibe el inyector del objeto y fuerza el fallback a `false` obligatoriamente previendo undefined behavior: `isPrivate: match.isPrivate || false`.
*   `getOpenMatches()` (y el *real-time listener* en `/explore`):
    Poseen un interceptor en-memoria `filter(m => !m.isPrivate)` que blinda la exhibición de partidos privados en el frontend. (*Nota: El filter local previene generar índices compuestos de Firebase DB obligatorios para colecciones ligeras*).

### 2.3 Componente Gráfico: `app/new-match/page.tsx`
*   Se reescribió la arquitectura HTML abandonando los `<div>` planos y etiquetas `style={{...}}`.
*   El render ahora abraza `Tailwind CSS`, usando las clases estructurales de la app `bg-slate-50`, las sombras `shadow-lg` y los gradientes del "Header Verde" `from-[#1f7a4f] to-[#145c3a]`.
*   El Slider Nativo (`<input type="range" />`) sustituye al `type="number"` rígido para seleccionar el cupo de maxPlayers.

### 2.4 Soporte de "Badges" UI
*   Incrustación en `app/join/[id]/page.tsx`
*   Incrustación en `app/match/[id]/page.tsx`
    ```tsx
    {match.isPrivate && (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
        🔒 Privado
      </span>
    )}
    ```
