# Feature: Captura de Teléfono Móvil en Onboarding

## 1. Visión General
Esta característica tiene como objetivo solicitar obligatoriamente el número de teléfono celular de los jugadores.
- **Propósito:** Permitir que los capitanes o administradores de los partidos puedan contactar a los jugadores en caso de novedades, cambios de horario o cancelaciones de última hora.
- **Retrocompatibilidad (Hard-wall):** Para asegurar que el 100% de la base de usuarios tenga un teléfono registrado, se implementará un bloqueo (hard-wall) que obligará a los usuarios antiguos a ingresar su teléfono la próxima vez que abran la aplicación.

## 2. Decisiones de Diseño Principal

### 2.1 Privacidad del Dato 
- El número de teléfono se almacenará en el documento principal del usuario `users/{uid}`.
- **Visualización Estricta:** A nivel de interfaz, el número de teléfono de cualquier jugador solo será decodificado y mostrado si el usuario que está viendo la pantalla tiene el rol `admin`.
- Un jugador normal (no-admin) **nunca** podrá ver el teléfono de otro jugador en pantallas como detalles de partido o lista de amigos.

### 2.2 Validación y Experiencia de Usuario (UX)
Como primera iteración (MVP) y para evitar costos de mensajería (SMS/OTP) o fricción innecesaria que bloquee la retención:
- **Validación Visual (Regex):** Se utilizará una validación de formato estricta para números de **Colombia**. 
- **Criterio:** El número ingresado deberá tener exactamente 10 dígitos numéricos y comenzar obligatoriamente con el dígito `"3"`. 
- **Máscara UI:** En el input se sugerirá el formato (`3XX XXX XXXX`) y no se permitirá avanzar si la validación falla (`/^3\d{9}$/.test(phone)`).

### 2.3 Explicación Contextual (Copy)
En la pantalla donde se solicite el teléfono se deberá, obligatoriamente, mostrar el siguiente descargo de responsabilidad para dar tranquilidad al usuario:
> *"Lo necesitamos para que el capitán del partido pueda contactarte en caso de alguna novedad con tus partidos y solo será usado en caso de que sea necesario."*

---

## 3. Modelo de Dominio

### `lib/domain/user.ts`
El modelo de datos se expandirá para soportar el nuevo atributo.
```typescript
export interface UserProfile {
    // ... otros atributos
    phone?: string; // Nuevo atributo (ej: "3123456789")
}
```

---

## 4. Cambios en Componentes y API

### 4.1 Onboarding de Nuevos Usuarios (`app/onboarding/page.tsx`)
- Se insertará un nuevo paso temprano (ej: Paso 2) dedicado netamente a capturar este dato.
- La función de progreso (`canNext()`) se actualizará para reaccionar a la expresión regular: `/^3\d{9}$/.test(phone)`.
- El payload final que se manda a `saveOnboardingResult` incluirá la variable `phone`.

### 4.2 Guardado de Datos (`lib/users.ts`)
- Se interceptará la llamada a `saveOnboardingResult` agregando el tipado del teléfono.
- Se creará un método `updateUserPhone(uid, phone)` para procesar exclusivamente el dato en escenarios de retrocompatibilidad.

### 4.3 Redirección Obligatoria (AuthGuard)
Para garantizar la captura en perfiles antiguos:
- El componente `AuthGuard` monitoreará el estado del perfil.
- **Regla:** `Si (roles incluye "player") Y (initialRatingCalculated === true) Y (phone es nulo)`
- **Acción:** Redirigir a `/onboarding/phone`. El usuario no podrá escapar de esta ruta navegando a otras páginas, ya que AuthGuard lo devolverá ahí.

### 4.4 Página Aislada (`app/onboarding/phone/page.tsx`)
Una página nueva que funciona similar al onboarding general pero enfocada solo en este dato. Se usará para "desatascar" a los usuarios antiguos que sean atrapados por el AuthGuard.

### 4.5 Propagación en Matches y Vistas
- Cuando un jugador se une a un partido (o lista de espera), su `phone` será copiado en su entrada de `players[]` (`lib/matches.ts`).
- En la vista de detalles del partido (`app/join/[id]/page.tsx` y `app/match/[id]/page.tsx`), se añadirá un renderizado condicional del tipo `tel:+57...` si el usuario tiene rol `admin`.

---

## 5. Escalabilidad Futura (Roadmap)
Si se descubre empíricamente que los usuarios están mintiendo o ingresando números falsos (ej: `0999999999`), el sistema podrá evolucionar hacia un flujo de **Verificación OTP (One-Time Password)** a través de Firebase Phone Auth o Twilio API. Esto requeriría añadir un flag `phoneVerified: boolean` al modelo en el futuro. Por ahora, el paso visual es suficiente.
