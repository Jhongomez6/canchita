# Feature: Billetera + Depósitos de Partido (Wompi)

## 📋 Specification-Driven Development (SDD)

Este documento es la fuente de verdad funcional y técnica del sistema de pagos de Canchita. Cubre arquitectura, seguridad, concurrencia, tolerancia a fallos, UX y escalabilidad.

---

## 1. ESPECIFICACIÓN FUNCIONAL

### Objetivo

Reducir no-shows en partidos mediante un sistema de depósito monetario al momento de unirse. Los usuarios recargan saldo en su billetera digital (via Wompi o códigos físicos) y ese saldo se descuenta automáticamente al inscribirse a partidos que requieran depósito.

### Reglas de Negocio

| # | Regla | Detalle |
|---|-------|---------|
| RN-01 | El saldo de la billetera se almacena en **centavos COP** (entero) | Evita errores de punto flotante. `500000` = $5.000 COP |
| RN-02 | Cualquier admin que pueda crear un partido puede configurar un depósito | Toggle default ON para `location_admin`, OFF para el resto. Valores fijos: **$5.000 o $10.000 COP** (dos opciones, no input libre). Default: $5.000 |
| RN-03 | El depósito es **opcional** por partido | Los partidos sin `deposit` mantienen el flujo de join actual sin cambios |
| RN-04 | Al unirse a un partido con depósito, el saldo se deduce **atómicamente** junto con la inscripción | No puede haber inscripción sin débito ni débito sin inscripción |
| RN-05 | El reembolso del depósito solo aplica si el jugador abandona **más de 24 horas antes** del inicio del partido | Después de ese deadline el depósito se pierde |
| RN-06 | Si el admin **borra el partido**, todos los jugadores con depósito reciben reembolso automático sin importar el deadline | Borrar = cancelación antes de jugarse. Cerrar es el flujo normal post-partido — no genera reembolso |
| RN-07 | Los códigos físicos tienen denominaciones fijas: **$20.000 o $50.000 COP** | Denominaciones menores generan recargas demasiado frecuentes |
| RN-08 | Cada código es de **un solo uso** | Una vez canjeado queda `status: "redeemed"` permanentemente |
| RN-09 | Un usuario no puede tener más de **3 recargas Wompi en estado `pending`** simultáneamente | Protección contra abuso y acumulación de transacciones fantasma |
| RN-10 | Los intentos fallidos de canje de código se limitan a **5 por usuario por hora** | Protección contra fuerza bruta |
| RN-11 | Las transacciones `pending` de Wompi expiran tras **2 horas** sin confirmación | Cleanup via scheduled function; no bloquean al usuario si Wompi no responde |
| RN-12 | El balance nunca puede ser negativo | La transacción de débito verifica `balanceCOP >= deposit` antes de ejecutar |
| RN-13 | Las recargas Wompi solo se permiten en **múltiplos de $10.000 COP** | Mínimo $20.000, máximo $500.000 |
| RN-14 | La comisión de Wompi la paga el usuario encima del monto elegido | `fee = Math.ceil((amountCOP × 0.0265 + 700) × 1.19)`. El wallet recibe exactamente el monto elegido |

---

## 2. ESQUEMA DE DATOS (FIRESTORE)

### Colección: `wallets/{uid}`

```typescript
interface WalletDocument {
  uid: string;           // igual al document ID
  balanceCOP: number;    // centavos COP, siempre >= 0
  updatedAt: string;     // ISO — última mutación de balance
  createdAt: string;     // ISO — creación del wallet
}
```

**Acceso**: lectura solo por el propio usuario. Escritura solo via Admin SDK (Firebase Functions). Regla Firestore: `write: if false`.

---

### Colección: `wallet_transactions/{txId}`

```typescript
type WalletTxType =
  | "topup_wompi"     // recarga via Wompi
  | "topup_code"      // canje de código físico
  | "deposit_debit"   // depósito descontado al unirse a partido
  | "deposit_refund"  // reembolso al abandonar dentro del deadline
  | "match_refund"    // reembolso automático al borrarse el partido
  | "manual_credit"   // crédito manual por super_admin (corrección)
  | "manual_debit";   // débito manual por super_admin (corrección)

type WalletTxStatus = "pending" | "completed" | "failed" | "expired";

interface WalletTransactionDocument {
  id: string;
  uid: string;
  type: WalletTxType;
  status: WalletTxStatus;
  amountCOP: number;          // centavos; positivo = crédito, negativo = débito
  balanceAfterCOP: number;    // snapshot del balance tras esta tx (centavos)
  description: string;        // texto en español para el historial
  // Contexto opcional según type:
  matchId?: string;               // deposit_debit, deposit_refund, match_refund
  locationId?: string;            // deposit_debit, deposit_refund, match_refund — para liquidación a canchas
  wompiTransactionId?: string;    // ID interno de Wompi (idempotencia)
  wompiReference?: string;        // referencia que enviamos a Wompi
  paymentMethod?: string;         // "PSE" | "NEQUI" | "CARD" | etc. — guardado en webhook
  totalChargedCents?: number;     // total cobrado al usuario incluyendo comisión Wompi (en centavos)
  finalizedAt?: string;           // ISO — timestamp real de aprobación Wompi
  codeId?: string;                // topup_code
  expiresAt?: string;             // ISO — solo en topup_wompi pending (TTL 2h)
  createdAt: string;
  updatedAt?: string;
}
```

**Índices requeridos** (`firestore.indexes.json`):
1. `(uid ASC, createdAt DESC)` — historial del usuario
2. `(wompiReference ASC, status ASC)` — lookup en webhook
3. `(wompiTransactionId ASC)` — idempotencia
4. `(status ASC, expiresAt ASC)` — cleanup de pending expirados

---

### Colección: `topup_codes/{code}`

```typescript
interface TopupCodeDocument {
  code: string;           // document ID — formato XXXX-XXXX
  amountCOP: number;      // centavos: 2000000 ($20k) o 5000000 ($50k)
  status: "available" | "redeemed";
  batchId: string;        // agrupa códigos del mismo lote
  generatedBy: string;    // uid del super_admin
  redeemedBy?: string;    // uid del usuario que lo canjeó
  redeemedAt?: string;    // ISO
  createdAt: string;
}
```

**Acceso**: ningún cliente puede leer ni escribir. Solo Admin SDK via Functions.
El `code` como document ID garantiza unicidad automática y permite lookup O(1) sin índice.

---

### Modificaciones a colecciones existentes

**`matches/{matchId}`** — agregar campos:
```typescript
deposit?: number;  // centavos COP; valores válidos: 500000 ($5k) o 1000000 ($10k)

// Campo en el objeto Player dentro del array players:
depositPaid?: boolean;  // true si el jugador pagó depósito. false o undefined si no pagó (waitlist, sin depósito, canceló)
```

---

## 3. ARQUITECTURA

```
┌─────────────────────────────────────────────────────────┐
│  FRONTEND (Next.js)                                     │
│  - lib/domain/wallet.ts  → tipos puros + helpers        │
│  - lib/wallet.ts         → lecturas Firestore (cliente) │
│  - components/WompiWidget.tsx                           │
│  - app/wallet/page.tsx                                  │
└──────────────────────────┬──────────────────────────────┘
                           │ httpsCallable / onSnapshot
┌──────────────────────────▼──────────────────────────────┐
│  FIREBASE FUNCTIONS (Node 22)                           │
│  - initTopup              (onCall)                      │
│  - wompiWebhook           (onRequest — público)         │
│  - joinWithDeposit        (onCall)                      │
│  - leaveWithRefund        (onCall)                      │
│  - deleteMatchWithRefunds (onCall)                      │
│  - redeemCode             (onCall)                      │
│  - generateCodes          (onCall — super_admin)        │
│  - cleanupPendingTx       (onSchedule — cada 30 min)    │
└──────────────────────────┬──────────────────────────────┘
                           │ Admin SDK (runTransaction)
┌──────────────────────────▼──────────────────────────────┐
│  FIRESTORE                                              │
│  wallets / wallet_transactions / topup_codes / matches  │
└─────────────────────────────────────────────────────────┘
                           │ webhook POST
┌──────────────────────────▼──────────────────────────────┐
│  WOMPI                                                  │
│  PSE / Nequi / Daviplata / Tarjetas                     │
└─────────────────────────────────────────────────────────┘
```

---

## 4. FLUJOS PRINCIPALES

### 4.1 Recarga via Wompi

```
1. Usuario abre /wallet → clic "Recargar"
2. Selecciona monto — input libre con chips de acceso rápido ($20k / $50k / $100k)
   Mínimo $20.000 · Máximo $500.000 COP · Solo múltiplos de $10.000 (step=10000).
   Chips sugeridos: $20k / $30k / $50k / $80k. Input libre restringido a múltiplos de 10k.
   El frontend envía pesos (20000). La Function convierte a centavos (2.000.000) para Wompi y Firestore.
   UI muestra desglose antes de confirmar:
     Monto en wallet:  $20.000
     Comisión Wompi:   $  1.464   ← calculada con calcWompiFee()
     ─────────────────────────
     Total a pagar:    $21.464
3. Frontend llama initTopup(amountCOP) via httpsCallable
4. Function:
   a. Valida amountCOP (viene en pesos COP del frontend, ej: 20000 = $20.000)
      Mínimo: 20.000 · Máximo: 500.000 · Solo múltiplos de 10.000
      Rechaza si amountCOP < 20000, > 500000, o amountCOP % 10000 !== 0
   b. Calcula la comisión de Wompi (tarifa real + IVA):
        fee = Math.ceil((amountCOP * 0.0265 + 700) * 1.19)
        totalToCharge = amountCOP + fee
      La Function recibe amountCOP (lo que el usuario quiere en wallet) y calcula totalToCharge.
      Wompi recibe totalToCharge como amount_in_cents (× 100).
      Firestore acredita amountCOP × 100 centavos — no totalToCharge.
   c. Verifica max 3 pending activos para ese uid → rechaza si supera
   d. Genera reference: "topup_{uid}_{ts}_{crypto.randomBytes(4).hex}"
   e. Crea wallet_transactions doc: status="pending", expiresAt=now+2h
   f. Calcula firma: SHA256(reference + totalToChargeInCents + "COP" + INTEGRITY_SECRET)
   g. Retorna {reference, publicKey, totalToChargeInCents, amountCOP, signature, redirectUrl}
5. Frontend carga WompiWidget con esos datos
6. Usuario paga en Wompi (PSE / Nequi / tarjeta)
7. Wompi envía POST a wompiWebhook con evento "transaction.updated"
8. Function acredita amountCOP × 100 centavos al wallet (ver §4.2)
9. Frontend detecta cambio via subscribeToWallet() → muestra nuevo saldo
```

### 4.2 Procesamiento del Webhook de Wompi

```
POST /wompiWebhook (onRequest, público)

1. Verificar checksum:
   hash = SHA256(tx.id + tx.status + tx.amount_in_cents + tx.currency + tx.created_at + EVENTS_SECRET)
   Si hash ≠ checksum header → return 401

2. Si tx.status ≠ "APPROVED" → return 200 (Wompi no reintenta)

3. Guard de idempotencia:
   Buscar wallet_transactions donde wompiTransactionId == tx.id AND status == "completed"
   Si existe → return 200 (entrega duplicada — no hacer nada)

4. Buscar wallet_transactions donde wompiReference == tx.reference AND status == "pending"
   Si no existe → return 200 con log (race condition: webhook llegó antes que el doc se creara)
   Wompi reintenta el webhook en 5min, en el reintento ya existirá el doc

5. runTransaction(adminDb):
   a. Leer wallets/{uid} — crear con balance 0 si no existe
   b. Nuevo balance = balanceCOP + (amountCOP × 100)  ← acredita el neto elegido, no el total cobrado
   c. tx.update(walletRef, { balanceCOP: newBalance, updatedAt: now })
   d. tx.update(txRef, {
        status: "completed",
        wompiTransactionId: tx.id,
        balanceAfterCOP: newBalance,
        paymentMethod: tx.payment_method_type,   // "PSE" | "NEQUI" | "CARD" | etc.
        totalChargedCents: tx.amount_in_cents,   // total cobrado al usuario (con comisión)
        finalizedAt: tx.finalized_at,            // timestamp real de aprobación
        updatedAt: now
      })

6. return 200
```

**Garantía exactly-once**: el paso 3 detecta retries después del éxito. El paso 5 es atómico — dos webhooks concurrentes que pasen el paso 3 están protegidos por el OCC de Firestore.

### 4.3 Join con Depósito

```
1. Usuario ve partido con deposit > 0
2. Frontend llama getWallet(uid) para obtener saldo actual
3. JoinConfirmModal muestra:
   - Depósito requerido: $X.XXX
   - Tu saldo: $Y.YYY
   - Si saldo < depósito → botón bloqueado + "Recarga tu billetera"
4. Usuario confirma → Frontend llama joinWithDeposit({matchId}) via httpsCallable
5. Function:
   a. Leer match → validar: existe, open, uid no está, no lleno, deposit > 0
   b. Leer perfil del usuario (fuera de la tx — no compite con match ni wallet)
   c. runTransaction:
      - Leer wallets/{uid} → si balance < deposit → throw InsufficientBalanceError
      - Leer match (dentro tx para lectura fresca)
      - Re-validar: no lleno, no duplicado (doble click protection)
      - Smart rejoin: si el jugador ya existe en players[] con confirmed: false (canceló antes), actualiza su registro en lugar de crear uno nuevo. No duplica playerUids.
      - Construir playerData con todos los campos requeridos (CLAUDE.md §2), incluyendo depositPaid: true
      - Marca playerData.depositPaid = true — campo clave para reembolsos condicionales
      - tx.update(matchRef, { players: [..., playerData], playerUids: [..., uid] })
      - tx.update(walletRef, { balanceCOP: balance - deposit, updatedAt: now })
      - tx.set(txRef, { type:"deposit_debit", amountCOP: -deposit, matchId, locationId, status:"completed", ... })
6. Return { success: true }
7. Frontend: reload de match + balance vía onSnapshot (ya activo)
```

### 4.4 Abandono con Reembolso

```
1. Usuario clic "Salirme del partido"
2. Frontend evalúa isDepositRefundable(match.startsAt) para mostrar advertencia en UI
   (El servidor hace su propio check — la UI es solo informativa)
3. Frontend llama leaveWithRefund({matchId}) via httpsCallable
4. Function:
   a. Leer match → verificar que uid está en players
   b. Calcular deadline = startsAt.seconds * 1000 - 24h
   c. refundable = Date.now() < deadline
   d. runTransaction:
      - Leer match fresco
      - Marcar player con `confirmed: false`, `depositPaid: false`, `cancelledAt: now` (NO eliminar del array — el admin puede verlo). Remover uid de `playerUids[]` para liberar cupo.
      - Si match.teams existe → remover player de teams.A o teams.B
      - Si refundable && match.deposit > 0:
          Leer wallet, tx.update(walletRef, { balanceCOP: balance + deposit })
          tx.set(txRef, { type:"deposit_refund", amountCOP: +deposit, matchId, locationId, ... })
      - tx.update(matchRef, { players, playerUids, teams? })
5. Return { refunded: boolean, deadline: string }
```

### 4.5 Reembolso al Borrar Partido (RN-06)

```
Cuando deleteMatch() se llama con hasDeposit=true o confirmedCount > 0:
Frontend llama deleteMatchWithRefunds({matchId}) via httpsCallable

Lógica actualizada:
1. Verificar que el llamante es admin del partido (createdBy o super_admin)
2. Leer match → separar:
   - refundablePlayers = players.filter(p => p.uid && p.confirmed && p.depositPaid)
   - notifiablePlayers = players.filter(p => p.uid)  ← confirmados + waitlist
3. Para cada uid en refundablePlayers (si deposit > 0):
   runTransaction per player:
   - wallet.balanceCOP += match.deposit
   - crear wallet_transaction tipo "match_refund"
   - Idempotencia: skip si ya existe tx "match_refund" para ese matchId+uid
4. Borrar el documento del match
5. Enviar notificación in-app a todos en notifiablePlayers (Promise.all):
   - hasRefund = refundablePlayers.includes(p.uid)
   - Si hasRefund: menciona monto reembolsado, url="/wallet"
   - Si no: "partido cancelado", url="/"
6. Return { refundedCount: N }

Optimización de costos: si no hay depósito Y no hay jugadores con uid, se hace deleteDoc directo sin invocar la Cloud Function.

Flujo normal (closeMatch post-partido) → NO genera reembolsos.
Los jugadores ya jugaron; el depósito fue el compromiso de asistencia.
```

### 4.6 Canje de Código Físico

```
1. Usuario abre RedeemCodeModal, escribe código
2. Frontend llama redeemCode({code}) via httpsCallable
3. Function:
   a. Verificar rate limit: máx 5 intentos fallidos por uid en la última hora
      (contador en wallets/{uid}.failedCodeAttempts + failedCodeAttemptsResetAt)
   b. Normalizar: code.trim().toUpperCase()
   c. runTransaction:
      - Leer topup_codes/{code}
      - Si no existe → incrementar failedCodeAttempts → throw CodeNotFoundError
      - Si status ≠ "available" → incrementar failedCodeAttempts → throw CodeAlreadyRedeemedError
      - Leer wallet (crear si no existe)
      - tx.update(codeRef, { status:"redeemed", redeemedBy: uid, redeemedAt: now })
      - tx.update(walletRef, { balanceCOP: balance + code.amountCOP, updatedAt: now,
                               failedCodeAttempts: 0 }) ← reset en éxito
      - tx.set(txRef, { type:"topup_code", amountCOP: +code.amountCOP, codeId: code, ... })
4. Return { amountCOP: code.amountCOP, newBalanceCOP: newBalance }
```

### 4.7 Patrón depositPaid

El campo `depositPaid: boolean` en el objeto Player es la fuente de verdad para reembolsos condicionales:

- `joinWithDeposit`: establece `depositPaid: true`
- `leaveWithRefund`: establece `depositPaid: false` (el jugador canceló — ya no tiene depósito activo)
- `approveFromWaitlist` / join sin depósito: `depositPaid` permanece undefined/false
- `adminRemovePlayer`: refund SOLO si `depositPaid: true` (`shouldRefund = deposit > 0 && !!player.depositPaid`)
- `deleteMatchWithRefunds`: reembolsa SOLO a `players.filter(p => p.uid && p.confirmed && p.depositPaid)`

Esto evita reembolsar doble a jugadores que cancelaron y volvieron a anotarse, y evita reembolsar a jugadores de waitlist que nunca pagaron.

### 4.8 Notificaciones in-app del sistema de pagos

Las siguientes Cloud Functions envían notificaciones in-app (fuera de la transaction, best-effort):

| Function | Destinatario | Condición | URL |
|----------|-------------|-----------|-----|
| adminRemovePlayer | jugador retirado | siempre (si tiene uid) | /wallet si refund, /join/[id] si no |
| deleteMatchWithRefunds | todos con uid (confirmados + waitlist) | siempre al borrar | /wallet si refund, / si no |
| wompiWebhook | usuario que recargó | pago APPROVED | /wallet |

---

## 5. SEGURIDAD

### 5.1 Autenticación y Autorización

| Función | Mecanismo | Quién puede llamarla |
|---------|-----------|---------------------|
| `initTopup` | `onCall` — verifica token automáticamente | Cualquier usuario autenticado |
| `joinWithDeposit` | `onCall` | Cualquier usuario autenticado |
| `leaveWithRefund` | `onCall` | El propio jugador (validado en la función) |
| `deleteMatchWithRefunds` | `onCall` | Admin del partido (validado: `isAdmin()`) |
| `redeemCode` | `onCall` | Cualquier usuario autenticado |
| `generateCodes` | `onCall` | Solo `super_admin` (validado: `isSuperAdmin()`) |
| `wompiWebhook` | `onRequest` — público | Solo verificado por checksum SHA256 |
| `cleanupPendingTx` | `onSchedule` | Solo Firebase (scheduled) |

### 5.2 Verificación del Webhook de Wompi

Wompi indica dinámicamente qué propiedades incluir en el hash mediante `event.signature.properties` (array de paths como `"transaction.id"`). **No usar campos fijos** — el orden y las propiedades pueden variar por tipo de evento.

```typescript
const properties: string[] = event.signature?.properties ?? [];
const timestamp: number = event.timestamp;

// Resolver cada path sobre event.data (ej: "transaction.id" → event.data.transaction.id)
const payloadValues = properties.map((prop: string) => {
  const parts = prop.split(".");
  let val: any = event.data;
  for (const part of parts) { val = val?.[part]; }
  return String(val ?? "");
});

const sigPayload = [...payloadValues, String(timestamp), eventsSecret].join("");
const expectedHash = createHash("sha256").update(sigPayload).digest("hex");

if (expectedHash !== event.signature?.checksum) {
  res.status(401).send("Invalid signature");
  return;
}
```

### 5.3 Feature Flag `walletEnabled`

La billetera está disponible solo para usuarios con acceso explícito. La regla en `lib/domain/user.ts`:

```typescript
export function hasWalletAccess(profile: UserProfile): boolean {
  return isSuperAdmin(profile) || profile.walletEnabled === true;
}
```

- `super_admin` siempre tiene acceso.
- Cualquier otro usuario necesita `walletEnabled: true` en su documento `users/{uid}`.
- Si no tiene acceso: `/wallet` redirige a `/`, el chip de saldo en el header no aparece.
- Para habilitar un usuario: Firestore Console → `users/{uid}` → agregar campo `walletEnabled: true`.

### 5.4 Rate Limiting

**`initTopup`** — máximo 3 recargas Wompi en estado `pending` por usuario:
```typescript
const pendingCount = await db.collection("wallet_transactions")
  .where("uid", "==", uid)
  .where("type", "==", "topup_wompi")
  .where("status", "==", "pending")
  .count().get();
if (pendingCount.data().count >= 3) throw new HttpsError("resource-exhausted", "...");
```

**`redeemCode`** — máximo 5 intentos fallidos por hora. Campos en `wallets/{uid}`:
```typescript
failedCodeAttempts: number;
failedCodeAttemptsResetAt: string; // ISO — cuando se resetea el contador
```

### 5.5 Entropía de Referencias

```typescript
import { randomBytes } from "crypto";
const reference = `topup_${uid}_${Date.now()}_${randomBytes(4).toString("hex")}`;
```

`Math.random()` NO es criptográficamente seguro. Siempre usar `crypto.randomBytes`.

### 5.6 Firestore Rules

```javascript
match /wallets/{uid} {
  allow read: if request.auth != null && request.auth.uid == uid;
  allow write: if false;
}
match /wallet_transactions/{txId} {
  allow read: if request.auth != null && resource.data.uid == request.auth.uid;
  allow write: if false;
}
match /topup_codes/{code} {
  allow read, write: if false;
}
```

---

## 6. CONCURRENCIA

### 6.1 Operaciones protegidas con `runTransaction`

| Operación | Documentos en la transacción |
|-----------|------------------------------|
| `initTopup` | `wallet_transactions` (create) |
| `wompiWebhook` | `wallets/{uid}`, `wallet_transactions/{txId}` |
| `joinWithDeposit` | `wallets/{uid}`, `matches/{matchId}`, `wallet_transactions` |
| `leaveWithRefund` | `wallets/{uid}`, `matches/{matchId}`, `wallet_transactions` |
| `deleteMatchWithRefunds` | `wallets/{uid×N}`, `wallet_transactions×N` — via `writeBatch` |
| `redeemCode` | `wallets/{uid}`, `topup_codes/{code}`, `wallet_transactions` |

### 6.2 Hotspot en `matches/{matchId}`

Para partidos de fútbol amateur (máx 20 jugadores), la probabilidad de join simultáneo exacto es negligible. En caso de contención, Firestore reintenta automáticamente hasta 5 veces — transparente para el usuario.

### 6.3 Doble clic / doble submit

`joinWithDeposit` re-valida dentro de la transacción que el uid no está ya en `players[]`. Si dos llamadas llegan en paralelo, la primera gana y la segunda falla con `DuplicatePlayerError` — el balance nunca se descuenta dos veces.

### 6.4 Doble canje de código

`redeemCode` usa `runTransaction`. Si dos usuarios intentan canjear el mismo código simultáneamente, uno gana y el otro reintenta la tx, ahora ve `status !== "available"` y falla con `CodeAlreadyRedeemedError`. Imposible doble crédito.

---

## 7. TOLERANCIA A FALLOS

### 7.1 Race Condition del Webhook

Si el webhook llega antes de que Firebase escriba el documento `wallet_transactions` en `initTopup`, la función retorna 200 sin procesar. Wompi reintenta a los 5 minutos — en el reintento el doc ya existe. Se retorna 200 (no 404) para que Wompi siga reintentando.

### 7.2 Transacciones Pending Huérfanas

Campo `expiresAt = createdAt + 2h`. Scheduled function `cleanupPendingTx` corre cada 30 minutos:

```typescript
export const cleanupPendingTx = onSchedule("every 30 minutes", async () => {
  const expired = await db.collection("wallet_transactions")
    .where("status", "==", "pending")
    .where("expiresAt", "<=", new Date().toISOString())
    .get();
  const batch = db.batch();
  expired.docs.forEach(doc =>
    batch.update(doc.ref, { status: "expired", updatedAt: new Date().toISOString() })
  );
  await batch.commit();
});
```

Las tx expiradas no cuentan para el límite de 3 pending activas (RN-09).

### 7.3 Fallo en `deleteMatchWithRefunds`

Idempotencia explícita: antes de cada reembolso verifica si ya existe una `wallet_transaction` de tipo `match_refund` para ese `(uid, matchId)`. El campo `match.refundsProcessed: true` se escribe solo cuando todos los reembolsos completaron.

### 7.4 Estado "Procesando" en la UI

La página `/wallet` usa `subscribeToWallet(uid, callback)` — un `onSnapshot` activo. Cuando el webhook actualiza `wallets/{uid}`, el listener lo detecta en tiempo real.

La URL de redirección post-pago es `https://lacanchita.app/wallet?topup=pending`. La página detecta el query param y muestra un banner "Verificando tu pago..." hasta que el `onSnapshot` detecte el nuevo balance.

**Timeout de 60 segundos**: si el webhook no llega en ese tiempo, el banner cambia a "Tu pago está siendo procesado. Si fue aprobado, el saldo aparecerá en unos minutos." Esto evita que el spinner quede pegado si Wompi tarda o falla en entregar el webhook. El balance igual se actualiza en cuanto llegue el webhook via `onSnapshot`.

### 7.5 Crash Post-Débito en `joinWithDeposit`

Si la función crashea después de que la transacción completa pero antes de retornar al cliente, el cliente recibe error de red. Al reintentar, la tx falla con `DuplicatePlayerError` — la UI debe tratar esto como éxito silencioso (refetch del match).

---

## 8. UX

### 8.1 Desglose de Comisión en Recarga

Antes de confirmar el pago, el usuario ve:
```
Monto en tu wallet:   $30.000
Comisión Wompi:       $ 1.630   ← calcWompiFee(30000)
──────────────────────────────
Total a pagar:        $31.630
```

### 8.2 JoinConfirmModal con Depósito

Cuando `match.deposit > 0`:
```
┌─────────────────────────────────────┐
│  ⚽ ¡Listo para jugar!             │
│  📍 Cancha El Estadio              │
│  📅 Sábado 19 Abr · 8:00 AM       │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ 💰 Depósito requerido       │   │
│  │ Depósito:        $5.000     │   │
│  │ Tu saldo:        $32.000    │   │
│  │ Saldo tras unirte: $27.000  │   │
│  └─────────────────────────────┘   │
│                                     │
│  [ Entendido, me anoto! ]          │
└─────────────────────────────────────┘
```

Si saldo insuficiente:
```
│  ┌─────────────────────────────┐   │
│  │ ⚠️ Saldo insuficiente       │   │
│  │ Depósito:   $5.000          │   │
│  │ Tu saldo:   $2.000          │   │
│  │ Te faltan:  $3.000          │   │
│  └─────────────────────────────┘   │
│  [ Recargar billetera ]            │
│  [ Cancelar ]                      │
```

### 8.3 Selector de Depósito en Formulario de Partido

En la card "Configuración" (⚙️) de `app/new-match/page.tsx`, debajo de los toggles existentes:

```
[ toggle ] Requerir depósito 💰

  Cuando ON → mostrar selector de dos opciones:
  ( ) $5.000   ← default
  ( ) $10.000

  "Los jugadores necesitan este saldo en su billetera para inscribirse."
```

- Toggle default **ON** para `location_admin`, **OFF** para el resto
- Valores fijos: $5.000 o $10.000 (radio buttons, no input libre)
- El monto se guarda en centavos: 500000 o 1000000

### 8.4 Feedback de Reembolso al Abandonar

```
{ refunded: true }  → toast "Depósito de $X.XXX devuelto a tu billetera"
{ refunded: false } → toast "Te has salido. El depósito no se reembolsa
                             porque faltan menos de 24 horas para el partido."
```

### 8.5 Página /wallet

```
┌─────────────────────────────────────┐
│  Mi Billetera                       │
│          $47.000 COP                │ ← onSnapshot tiempo real
│                                     │
│  [ Recargar ]  [ Canjear código ]  │
│                                     │
│  ── Movimientos ──────────────────  │
│  ↑ Recarga Wompi      +$30.000      │
│  ↓ Depósito partido   -$5.000       │
│  ↑ Canje de código    +$20.000      │
└─────────────────────────────────────┘
```

Historial paginado: 20 items iniciales, carga más al hacer scroll.
↑ verde = crédito, ↓ rojo = débito.

### 8.6 Notificación Push Post-Recarga

Cuando `wompiWebhook` acredita exitosamente:
> "✅ Recarga exitosa — $30.000 acreditados en tu billetera Canchita"

---

## 9. ESCALABILIDAD

- Las Functions escalan automáticamente. `maxInstances: 10` en functions de pagos para controlar costos.
- El saldo NO se embebe en `users/{uid}` — evita re-renders del AuthContext en cada transacción.
- La query de historial `(uid, createdAt DESC)` está indexada con paginación — costo constante.
- Hotspot en matches: aceptable para volúmenes de fútbol amateur (ver §6.2).

---

## 10. CRITERIOS DE ACEPTACIÓN

### CA-01 — Recarga Wompi exitosa
**Given** un usuario con saldo $0  
**When** completa una recarga de $20.000 via Wompi sandbox (APPROVED)  
**Then** su saldo muestra $20.000 en tiempo real, historial muestra "topup_wompi +$20.000"

### CA-02 — Desglose de comisión correcto
**Given** un usuario que elige recargar $30.000  
**When** ve el resumen antes de pagar  
**Then** ve: Monto en wallet $30.000 · Comisión $1.630 · Total $31.630

### CA-03 — Join con depósito
**Given** partido con `deposit: 500000` ($5.000) y usuario con saldo $20.000  
**When** se anota al partido  
**Then** queda inscrito Y saldo pasa a $15.000 atómicamente

### CA-04 — Saldo insuficiente
**Given** usuario con saldo $3.000 y partido con depósito $5.000  
**When** intenta unirse  
**Then** botón bloqueado mostrando "Te faltan $2.000"

### CA-05 — Reembolso dentro del deadline
**Given** usuario inscrito en partido que empieza en 48 horas  
**When** abandona el partido  
**Then** depósito reembolsado, transacción "deposit_refund" en historial

### CA-06 — Sin reembolso fuera del deadline
**Given** usuario inscrito en partido que empieza en 12 horas  
**When** abandona el partido  
**Then** sale del partido, NO recibe reembolso, toast informativo visible

### CA-07 — Reembolso al borrar partido
**Given** partido con 8 jugadores con depósito pagado  
**When** admin borra el partido  
**Then** los 8 jugadores reciben su depósito de vuelta

### CA-07b — Sin reembolso al cerrar partido (flujo normal)
**Given** partido con jugadores con depósito que ya se jugó  
**When** admin cierra el partido post-partido  
**Then** el partido se cierra, ningún jugador recibe reembolso

### CA-08 — Idempotencia del webhook
**Given** Wompi entrega el mismo webhook dos veces  
**When** ambas llegan a wompiWebhook  
**Then** el saldo solo se acredita una vez

### CA-09 — Validación de múltiplos en recarga
**Given** usuario intenta recargar $25.000 (no múltiplo de $10k)  
**When** intenta confirmar  
**Then** la UI bloquea la acción antes de llamar la Function

### CA-10 — Selector de depósito en nuevo partido
**Given** admin `location_admin` abre el formulario de nuevo partido  
**When** ve la card Configuración  
**Then** el toggle de depósito aparece ON por default con $5.000 seleccionado

### CA-11 — Canje de código
**Given** código físico válido de $20.000  
**When** usuario lo canjea  
**Then** saldo sube $20.000, código queda "redeemed". Segundo canje → "Este código ya fue canjeado"

### CA-12 — Rate limit de canje
**Given** usuario con 5 intentos fallidos en la última hora  
**When** intenta un 6to canje  
**Then** error "Demasiados intentos. Espera antes de intentar de nuevo."

---

## 11. ARCHIVOS INVOLUCRADOS

| Capa | Archivo | Acción |
|------|---------|--------|
| Dominio | `lib/domain/wallet.ts` | Crear — tipos puros + helpers, incluye `calcWompiFee(amountCOP)` |
| Dominio | `lib/domain/match.ts` | Modificar — `deposit?: number`, `isDepositRefundable()` |
| Dominio | `lib/domain/errors.ts` | Modificar — `InsufficientBalanceError`, `WalletNotFoundError`, `CodeAlreadyRedeemedError`, `CodeNotFoundError` |
| API cliente | `lib/wallet.ts` | Crear — `getWallet`, `getWalletTransactions`, `subscribeToWallet` |
| API cliente | `lib/matches.ts` | Modificar — `createMatch` acepta `deposit`, nuevo `leaveMatch` |
| Functions | `functions/src/payments.ts` | Crear — `initTopup`, `wompiWebhook`, `joinWithDeposit`, `leaveWithRefund`, `deleteMatchWithRefunds` |
| Functions | `functions/src/wallet.ts` | Crear — `redeemCode` |
| Functions | `functions/src/codes.ts` | Crear — `generateCodes` |
| Functions | `functions/src/cleanup.ts` | Crear — `cleanupPendingTx` (scheduled cada 30 min) |
| Functions | `functions/src/index.ts` | Modificar — exportar nuevas functions |
| UI | `components/WalletBalance.tsx` | Crear — chip de saldo reutilizable |
| UI | `components/WompiWidget.tsx` | Crear — carga script Wompi + llama initTopup |
| UI | `components/RedeemCodeModal.tsx` | Crear — bottom-sheet canje de código |
| UI | `components/JoinConfirmModal.tsx` | Modificar — props `deposit` + `userBalanceCOP` |
| UI | `app/wallet/page.tsx` | Crear — página de billetera |
| UI | `app/admin/codes/page.tsx` | Crear — generación y descarga de lotes |
| UI | `app/join/[id]/page.tsx` | Modificar — flujo de join con depósito |
| UI | `app/new-match/page.tsx` | Modificar — toggle depósito + radio $5k/$10k en card Configuración |
| Infra | `firestore.rules` | Modificar — reglas wallet/transactions/codes |
| Infra | `firestore.indexes.json` | Modificar — 4 índices nuevos |

---

## 12. VARIABLES DE ENTORNO

```bash
# Frontend (.env.local)
NEXT_PUBLIC_WOMPI_PUBLIC_KEY=pub_test_...

# Firebase Functions
WOMPI_EVENTS_SECRET=...        # verificar checksum del webhook
WOMPI_INTEGRITY_SECRET=...     # calcular firma de transacciones
```

El Admin SDK en Functions se inicializa con `admin.initializeApp()` sin configuración adicional.

---

## 13. ORDEN DE IMPLEMENTACIÓN

**Fase 1 — Dominio**
1. `lib/domain/errors.ts` — 4 errores
2. `lib/domain/wallet.ts` — tipos, `calcWompiFee`, helpers puros
3. `lib/domain/match.ts` — `deposit` + `isDepositRefundable`

**Fase 2 — Infraestructura**
4. `firestore.rules`
5. `firestore.indexes.json`

**Fase 3 — Firebase Functions**
6. `functions/src/payments.ts`
7. `functions/src/wallet.ts`
8. `functions/src/codes.ts`
9. `functions/src/cleanup.ts`
10. `functions/src/index.ts`

**Fase 4 — Capa de datos cliente**
11. `lib/wallet.ts`
12. `lib/matches.ts`

**Fase 5 — UI**
13. `components/WalletBalance.tsx`
14. `components/JoinConfirmModal.tsx`
15. `app/join/[id]/page.tsx`
16. `app/new-match/page.tsx`
17. `components/WompiWidget.tsx`
18. `components/RedeemCodeModal.tsx`
19. `app/wallet/page.tsx`
20. `app/admin/codes/page.tsx`
21. Navegación — link "Billetera" en Header o perfil
