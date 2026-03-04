# Feature: PWA Installation Prompts

## 📋 Specification-Driven Development (SDD)

Este documento explica cómo la **especificación funcional** gobierna la implementación de la feature "PWA Installation Prompts" para impulsar la instalación de la aplicación web progresiva y mejorar la experiencia del usuario.

---

## 1. ESPECIFICACIÓN FUNCIONAL (Fuente de Verdad)

### Objetivo
Incrementar la tasa de instalación de la aplicación web progresiva (PWA) en dispositivos móviles (iOS y Android) proporcionando recordatorios proactivos y opciones accesibles, mejorando así la retención y experiencia nativa "standalone".

### Reglas de Negocio

| # | Regla | Implementación |
|---|-------|----------------|
| 1 | Banner Inteligente Proactivo | Mostrar un banner o bottom sheet en toda la app sugiriendo instalar la app |
| 2 | Botón Discreto en Menú | Proveer un botón permanente en el menú del usuario o navegación |
| 3 | Manejo Específico de iOS | Dado que iOS no soporta el prompt automático, mostrar un modal ilustrativo con instrucciones ("Compartir" -> "Agregar a Inicio") |
| 4 | Manejo Nativo de Android | Usar el evento nativo `beforeinstallprompt` para Android/Chrome |
| 5 | Cooldown de Cancelación | Si el usuario descarta ("X") el banner, no volver a mostrar en 7 días |
| 6 | Detección de Instalación | No mostrar promps si la aplicación ya está corriendo en modo `standalone` |

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
    │ UTIL   │     │  HOOKS  │    │    UI    │
    └────────┘     └─────────┘    └──────────┘
    Detección      usePWAInstall  PWAInstallPrompt
    de OS/PWA      State & Auth   Banner & Modal
```

### Capas

#### **Capa 1: Utilidades y Hooks** (`hooks/usePWAInstall.ts`)

Encargada de aislar la lógica del ciclo de vida de PWA:
- Escuchar el evento `beforeinstallprompt`.
- Detectar si es dispositivo iOS (`userAgent`).
- Detectar si la app corre en `standalone`.
- Manejar la lógica de "Descartado" (guardar en `localStorage` con expiración).

#### **Capa 2: UI (Componentes Core)**
- `components/PWAInstallPrompt.tsx`
  - Renderiza el **Smart Banner** en la parte inferior de la pantalla o de forma no intrusiva.
  - Renderiza el **Modal de Instrucciones** específico para iOS cuando un usuario hace clic en el botón del banner (o del menú).
- `components/Header.tsx` o Menú de Perfil
  - Renderiza el **Botón Discreto** de instalación si la app no está en modo standalone.

#### **Capa 3: Estructura Global**
- `app/layout.tsx`
  - Monta el `<PWAInstallPrompt />` para que esté disponible globalmente sin bloquear la renderización de la app.

---

## 3. CRITERIOS DE ACEPTACIÓN ✅

### ✅ Criterio 1
**Given** un usuario nuevo en Android/Chrome
**When** ingresa a la aplicación
**Then** ve un Smart Banner sugiriendo instalarla, y al tocar "Instalar" se dispara el prompt nativo.

### ✅ Criterio 2
**Given** un usuario nuevo en iOS/Safari
**When** ingresa a la aplicación
**Then** ve un Smart Banner sugiriendo instalarla, y al tocar "Instalar" se muestra un Modal ilustrando los iconos de "Compartir" y "Agregar a pantalla de inicio".

### ✅ Criterio 3
**Given** un usuario al que se le muestra el Smart Banner
**When** toca la "X" para descartarlo
**Then** el banner desaparece y no vuelve a mostrarse en al menos 7 días, persistiendo la decisión en `localStorage`.

### ✅ Criterio 4
**Given** un usuario recurrente que no tiene la app instalada
**When** navega por el menú de usuario / perfil
**Then** ve una opción de menú permanente "Instalar App" para iniciar el flujo manualmente.

### ✅ Criterio 5
**Given** un usuario que **ya instaló** la aplicación
**When** abre la aplicación desde su pantalla de inicio (modo standalone)
**Then** ni el Smart Banner ni el botón en el menú se renderizan en absoluto.

---

## 4. ARCHIVOS INVOLUCRADOS

| Capa | Archivo | Responsabilidad |
|------|---------|----------------|
| UI | `components/PWAInstallPrompt.tsx` | UI combinada de Banner proactivo y Modal iOS. |
| UI | `hooks/usePWAInstall.ts` | Hook personalizado para lógica OS, `beforeinstallprompt` y localStorage cooldown. |
| UI | `app/layout.tsx` | Punto de montaje global del prompt. |
| UI | Menú de navegación | Punto de montaje del botón discreto de instalación. |
| Doc | `docs/PWA_INSTALLATION_FEATURE_SDD.md` | Documentación técnica y especificaciones. |
