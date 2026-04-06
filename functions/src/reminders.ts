import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { APP_URL } from "./config";

const db = admin.firestore();

// 10 days in milliseconds for notification Time-To-Live
const NOTIFICATION_TTL_MS = 10 * 24 * 60 * 60 * 1000;

// Permanently invalid FCM error codes (token will never recover)
const PERMANENT_ERROR_CODES = [
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
];

/**
 * Resilient push sender: wraps sendEachForMulticast with try/catch,
 * cleans up permanently invalid tokens, and returns structured results.
 * Never throws — push is always best-effort.
 */
async function safeSendPush(
  tokens: string[],
  payload: { title: string; body: string },
  url: string,
  context: string
): Promise<{ successCount: number; failureCount: number; invalidTokens: string[] }> {
  if (tokens.length === 0) return { successCount: 0, failureCount: 0, invalidTokens: [] };

  try {
    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title: payload.title, body: payload.body },
      data: { url },
      webpush: {
        notification: { icon: "/icons/icon-192x192.png" },
        fcmOptions: { link: url },
      },
      apns: { payload: { aps: { badge: 1, sound: "default" } } },
    });

    const invalidTokens: string[] = [];
    response.responses.forEach((res, idx) => {
      if (!res.success) {
        const code = res.error?.code || "";
        console.error(`[Push][${context}] token[${idx}] error:`, code, res.error?.message);
        if (PERMANENT_ERROR_CODES.includes(code)) {
          invalidTokens.push(tokens[idx]);
        }
      }
    });

    console.log(`[Push][${context}] sent: ${response.successCount}, failed: ${response.failureCount}`);
    return { successCount: response.successCount, failureCount: response.failureCount, invalidTokens };
  } catch (err) {
    console.error(`[Push][${context}] EXCEPTION (non-fatal):`, err);
    return { successCount: 0, failureCount: tokens.length, invalidTokens: [] };
  }
}

/**
 * Cleans up invalid tokens from a user document.
 */
async function cleanupInvalidTokens(userRef: FirebaseFirestore.DocumentReference, invalidTokens: string[]) {
  if (invalidTokens.length === 0) return;
  try {
    await userRef.update({
      fcmTokens: admin.firestore.FieldValue.arrayRemove(...invalidTokens),
    });
    console.log(`[TokenCleanup] Removed ${invalidTokens.length} stale token(s) from ${userRef.id}`);
  } catch (err) {
    console.error(`[TokenCleanup] Failed to clean tokens for ${userRef.id}:`, err);
  }
}

/**
 * 🔔 Recordatorios automáticos de partidos
 * Corre cada 30 minutos via Cloud Scheduler.
 *
 * Lógica de umbral (threshold-based):
 * Si faltan ≤ 24h y no se ha enviado "24h" → enviar
 * Si faltan ≤ 12h y no se ha enviado "12h" → enviar
 * Si faltan ≤  6h y no se ha enviado "6h"  → enviar
 *
 * Ventaja sobre ventanas: no importa cuándo corra el cron,
 * siempre lo pillará porque una vez que se cruza el umbral,
 * la condición permanece verdadera hasta que se marque como enviado.
 */
export const matchReminders = onSchedule(
  {
    schedule: "every 30 minutes",
    timeZone: "America/Bogota",
    region: "us-central1",
  },
  async () => {
    const now = new Date();

    console.log("⏰ Reminder job running:", now.toISOString());

    const snapshot = await db
      .collection("matches")
      .where("status", "==", "open")
      .get();

    console.log("📋 Matches abiertos:", snapshot.size);

    if (snapshot.empty) {
      console.log("✅ No hay matches abiertos. Fin.");
      return;
    }

    // Umbrales: key → minutos antes del partido
    const thresholds: { key: string; minutes: number }[] = [
      { key: "24h", minutes: 1440 },
      { key: "12h", minutes: 720 },
      { key: "6h", minutes: 360 },
    ];

    for (const doc of snapshot.docs) {
      const match = doc.data();

      // 🔒 Validación: necesitamos startsAt para calcular la diferencia
      if (!match.startsAt) {
        console.log(`❌ Match ${doc.id} sin startsAt — skipping`);
        continue;
      }

      const matchDate = match.startsAt.toDate();
      const diffMinutes =
        (matchDate.getTime() - now.getTime()) / (1000 * 60);

      console.log(
        `⚽ Match ${doc.id} | startsAt: ${matchDate.toISOString()} | diff: ${diffMinutes.toFixed(0)} min`
      );

      // Ignorar partidos que ya pasaron
      if (diffMinutes <= 0) {
        console.log(`⏭️ Match ${doc.id} ya pasó — skipping`);
        continue;
      }

      // Evaluar cada umbral
      for (const { key, minutes } of thresholds) {
        // ¿Ya cruzamos el umbral? (faltan ≤ X minutos)
        if (diffMinutes <= minutes) {
          // ¿Ya se envió este recordatorio?
          if (match.remindersSent?.[key]) {
            console.log(`⛔ Match ${doc.id} — reminder "${key}" ya enviado`);
            continue;
          }

          console.log(`🔔 Match ${doc.id} — enviando reminder "${key}" (faltan ${diffMinutes.toFixed(0)} min)`);
          await sendReminderIfNeeded(doc.id, match, key);
        }
      }
    }

    console.log("✅ Reminder job completado.");
  }
);

/**
 * Envía recordatorio solo si:
 * - No se ha enviado antes (anti-spam)
 * - El jugador NO ha confirmado
 */
async function sendReminderIfNeeded(
  matchId: string,
  match: Record<string, unknown>,
  reminderKey: string
) {
  console.log(
    "🔔 Evaluando reminder",
    reminderKey,
    "para match",
    matchId
  );

  // 🛑 Anti-spam
  const remindersSent = match.remindersSent as Record<string, boolean> | undefined;
  if (remindersSent?.[reminderKey]) {
    console.log("⛔ Reminder ya enviado:", reminderKey);
    return;
  }

  type ReminderPlayer = { uid?: string; confirmed?: boolean;[key: string]: unknown };
  const allPlayers = ((match.players as Array<ReminderPlayer>) || []).filter(
    (p) => p.uid && typeof p.uid === "string" && !p.uid.startsWith("guest_")
  ) as Array<{ uid: string; confirmed?: boolean;[key: string]: unknown }>;

  // 🔒 Desduplicar por UID para evitar notificaciones dobles
  const seen = new Set<string>();
  const players = allPlayers.filter((p) => {
    if (seen.has(p.uid)) return false;
    seen.add(p.uid);
    return true;
  });

  if (players.length === 0) return;

  // Batch-read all user documents (1 round-trip instead of N)
  const userRefs = players.map(p => db.collection("users").doc(p.uid));
  const userSnaps = await db.getAll(...userRefs);
  const userDataMap = new Map<string, { data: FirebaseFirestore.DocumentData | undefined; ref: FirebaseFirestore.DocumentReference }>();
  userSnaps.forEach((snap, idx) => {
    userDataMap.set(players[idx].uid, { data: snap.data(), ref: snap.ref });
  });

  const url = `${APP_URL}/join/${matchId}`;

  for (const player of players) {
    // 🎯 MENSAJE DINÁMICO SEGÚN ESTADO
    let title = "⚽ El partido se acerca";
    let body = "";

    if (player.confirmed) {
      title = "⚽ Partido confirmado";
      body = `Cancela tu asistencia si no puedes ir, dale la oportunidad a otro jugador`;
    } else {
      title = "⚽ ¿Vas a jugar?";
      body = `Confirma tu asistencia ahora.`;
    }

    // 1. ALWAYS write in-app notification
    await db.collection("notifications").doc(player.uid).collection("items").add({
      title,
      body,
      type: "match_reminder",
      url: `/join/${matchId}`,
      read: false,
      createdAt: new Date().toISOString(),
      expireAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + NOTIFICATION_TTL_MS)),
    });

    // 2. BEST-EFFORT push via safeSendPush
    const userData = userDataMap.get(player.uid);
    const tokens: string[] = userData?.data?.fcmTokens ?? [];
    if (tokens.length === 0) continue;

    const result = await safeSendPush(tokens, { title, body }, url, `scheduled-${reminderKey}`);
    await cleanupInvalidTokens(userData!.ref, result.invalidTokens);
  }

  // ✅ Marcar reminder como enviado
  await db.collection("matches").doc(matchId).update({
    [`remindersSent.${reminderKey}`]: true,
  });

  console.log("✅ Reminder enviado y marcado:", reminderKey);
}

/**
 * 📣 Enviar recordatorios manuales (On-Demand)
 * Solo puede ser llamado por el admin del sistema o el creador del partido.
 */
export const sendManualReminder = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes estar autenticado para enviar recordatorios");
  }

  const { matchId } = request.data;
  if (!matchId) {
    throw new HttpsError("invalid-argument", "Falta el ID del partido");
  }

  const matchSnap = await db.collection("matches").doc(matchId).get();
  if (!matchSnap.exists) {
    throw new HttpsError("not-found", "El partido no existe");
  }

  const match = matchSnap.data();

  // Validar permisos (Ser Admin o Creador)
  const userSnap = await db.collection("users").doc(request.auth.uid).get();
  const userData = userSnap.data();
  const isAdmin = userData?.roles?.includes("admin") || userData?.role === "admin";
  const isOwner = match?.createdBy === request.auth.uid;

  if (!isAdmin && !isOwner) {
    throw new HttpsError("permission-denied", "No tienes permiso para enviar notificaciones masivas en este partido");
  }

  // Idempotencia: debounce de 5 minutos para evitar envíos duplicados
  const lastManual = match?.remindersSent?.manual;
  if (lastManual) {
    const elapsed = Date.now() - new Date(lastManual).getTime();
    if (elapsed < 5 * 60 * 1000) {
      throw new HttpsError("already-exists", "Ya se envió un recordatorio manual recientemente. Espera unos minutos.");
    }
  }

  // Marcar como enviado ANTES de enviar (previene duplicados por re-invocación)
  await db.collection("matches").doc(matchId).update({
    "remindersSent.manual": new Date().toISOString(),
  });

  const players = (match?.players || []).filter((p: any) => p.uid);
  if (players.length === 0) {
    return { success: true, sentTokens: 0, message: "No hay jugadores registrados" };
  }

  // Desduplicar jugadores por UID (por si hubo un error en la base de datos)
  const uniquePlayersMap = new Map();
  for (const p of players) {
    if (!uniquePlayersMap.has(p.uid)) {
      uniquePlayersMap.set(p.uid, p);
    }
  }
  const uniquePlayers = Array.from(uniquePlayersMap.values());

  // Batch-read all user documents (1 round-trip instead of N)
  const userRefs = uniquePlayers.map((p: any) => db.collection("users").doc(p.uid));
  const userSnaps = await db.getAll(...userRefs);
  const userDataMap = new Map<string, { data: FirebaseFirestore.DocumentData | undefined; ref: FirebaseFirestore.DocumentReference }>();
  userSnaps.forEach((snap, idx) => {
    userDataMap.set(uniquePlayers[idx].uid, { data: snap.data(), ref: snap.ref });
  });

  let sentTokensCount = 0;
  const url = `${APP_URL}/join/${matchId}`;

  for (const player of uniquePlayers) {
    let title = "";
    let body = "";

    if (player.confirmed) {
      title = "⚽ El partido se acerca";
      body = "¿Sigues en pie para el partido? Recuerda avisar si no vas a asistir para liberar tu cupo.";
    } else {
      title = "⚽ ¡Faltas tú!";
      body = "Por favor confirma tu asistencia al partido lo antes posible.";
    }

    // 1. ALWAYS write in-app notification
    await db.collection("notifications").doc(player.uid).collection("items").add({
      title,
      body,
      type: "match_reminder",
      url: `/join/${matchId}`,
      read: false,
      createdAt: new Date().toISOString(),
      expireAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + NOTIFICATION_TTL_MS)),
    });

    // 2. BEST-EFFORT push via safeSendPush
    const userData = userDataMap.get(player.uid);
    const tokens = Array.from(new Set<string>(userData?.data?.fcmTokens ?? []));
    if (tokens.length === 0) continue;

    const result = await safeSendPush(tokens, { title, body }, url, "manual");
    sentTokensCount += result.successCount;
    await cleanupInvalidTokens(userData!.ref, result.invalidTokens);
  }

  console.log(`[Push][manual] Match ${matchId} — total sent: ${sentTokensCount}`);
  return { success: true, sentTokens: sentTokensCount };
});

/**
 * 🏆 Notificación de ganador de MVP (Trigger Reactivo por el Cliente)
 * Valida matemáticamente que el periodo haya acabado, busca a los ganadores,
 * envía Push masivos segmentados y traba la ejecución con Firestore Transactions.
 */
export const sendMvpWinnerNotification = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes estar autenticado para activar notificaciones.");
  }

  const { matchId } = request.data;
  if (!matchId) {
    throw new HttpsError("invalid-argument", "Falta el ID del partido");
  }

  const matchRef = db.collection("matches").doc(matchId);

  interface PushData {
    tokensToWinners: string[];
    tokensToTies: string[];
    tokensToOthers: string[];
    winnerNames: string[];
    // For in-app notifications
    winnerUids: string[];
    tieUids: string[];
    otherUids: string[];
  }

  let pushData: PushData | null = null;

  await db.runTransaction(async (transaction) => {
    const matchSnap = await transaction.get(matchRef);
    if (!matchSnap.exists) {
      throw new HttpsError("not-found", "El partido no existe");
    }

    const match = matchSnap.data() as any;

    // 1. Validar Idempotencia (Prevención de SPAM masivo si 20 jugadores abren el partido al tiempo)
    if (match.remindersSent?.mvp) {
      throw new HttpsError("already-exists", "La notificación de MVP ya fue enviada previamente.");
    }

    // 2. Autenticación Matemática Severa (No confiamos en el cliente ciegamente)
    const eligibleUIDs = new Set(
      (match.players || [])
        .filter((p: any) => p.confirmed && p.uid && !p.uid.startsWith("guest_"))
        .map((p: any) => p.uid)
    );
    if (match.createdBy) eligibleUIDs.add(match.createdBy);

    const totalEligibleVoters = eligibleUIDs.size;
    const votesCast = match.mvpVotes ? Object.keys(match.mvpVotes).filter(uid => eligibleUIDs.has(uid)).length : 0;
    const remainingVotes = totalEligibleVoters - votesCast;

    const voteCounts: Record<string, number> = {};
    if (match.mvpVotes) {
      Object.values(match.mvpVotes).forEach((votedId) => {
        voteCounts[votedId as string] = (voteCounts[votedId as string] || 0) + 1;
      });
    }

    const sortedMVPLeaderboard = Object.entries(voteCounts).sort(([, a], [, b]) => b - a);
    const topMvpScore = sortedMVPLeaderboard.length > 0 ? sortedMVPLeaderboard[0][1] : 0;
    const secondHighestScore = sortedMVPLeaderboard.length > 1 ? sortedMVPLeaderboard[1][1] : 0;

    const mathematicallyClosed = (topMvpScore > 0) && (topMvpScore > secondHighestScore + remainingVotes);
    const allEligibleVoted = totalEligibleVoters > 0 && remainingVotes <= 0;

    const closedTime = match.closedAt ? new Date(match.closedAt).getTime() : 0;
    const now = new Date().getTime();
    const hoursSinceClosed = closedTime ? (now - closedTime) / (1000 * 60 * 60) : 0;
    const timeLimitClosed = hoursSinceClosed > 2;

    const isClosed = match.status === "closed";
    const votingClosed = isClosed && (timeLimitClosed || mathematicallyClosed || allEligibleVoted);

    if (!votingClosed) {
      throw new HttpsError("failed-precondition", "La votación de MVP aún no está matemáticamente finalizada.");
    }

    // 3. Obtener Líderes
    if (topMvpScore === 0) {
      transaction.update(matchRef, { "remindersSent.mvp": true });
      return;
    }

    const currentMVPs = sortedMVPLeaderboard
      .filter(([, score]) => score === topMvpScore && score > 0)
      .map(([id]) => id);

    const winnerNames: string[] = [];
    const allPlayersAndGuests = [
      ...(match.players || []),
      ...(match.guests || []).map((g: any) => ({ uid: `guest_${g.name}`, name: g.name }))
    ];

    for (const mvpId of currentMVPs) {
      const p = allPlayersAndGuests.find((p: any) => p.uid === mvpId || p.name === mvpId);
      if (p) winnerNames.push(p.name);
    }

    // 4. Preparar colas de Tokens y UIDs según público
    const tokensToWinners: string[] = [];
    const tokensToTies: string[] = [];
    const tokensToOthers: string[] = [];
    const winnerUids: string[] = [];
    const tieUids: string[] = [];
    const otherUids: string[] = [];

    const physicalPlayers = (match.players || []).filter((p: any) => p.uid && !p.uid.startsWith("guest_"));

    // ALL reads must happen before ANY writes (firebase-admin v10+ requirement)
    const playerSnapshots = new Map<string, FirebaseFirestore.DocumentSnapshot>();
    for (const player of physicalPlayers) {
      const pSnap = await transaction.get(db.collection("users").doc(player.uid));
      playerSnapshots.set(player.uid, pSnap);
    }

    // Now process data and queue writes
    for (const player of physicalPlayers) {
      const pSnap = playerSnapshots.get(player.uid)!;
      const pData = pSnap.data();
      const tokens = Array.from(new Set<string>(pData?.fcmTokens ?? []));

      const isMVP = currentMVPs.includes(player.uid) || currentMVPs.includes(player.name);

      if (isMVP) {
        // Incrementar mvpAwards en el perfil del ganador
        transaction.update(db.collection("users").doc(player.uid), {
          mvpAwards: admin.firestore.FieldValue.increment(1),
        });
        if (currentMVPs.length > 1) {
          tieUids.push(player.uid);
          if (tokens.length > 0) tokensToTies.push(...tokens);
        } else {
          winnerUids.push(player.uid);
          if (tokens.length > 0) tokensToWinners.push(...tokens);
        }
      } else {
        otherUids.push(player.uid);
        if (tokens.length > 0) tokensToOthers.push(...tokens);
      }
    }

    pushData = {
      tokensToWinners,
      tokensToTies,
      tokensToOthers,
      winnerNames,
      winnerUids,
      tieUids,
      otherUids,
    };

    // 5. SELLAR BARRERA ANTI-SPAM
    transaction.update(matchRef, { "remindersSent.mvp": true });
  });

  // ============================================
  // 🚀 SIDE-EFFECTS FUERA DE LA TRANSACCIÓN
  // ============================================
  if (!pushData) {
    return { success: true, message: "Partido sellado, sin notificaciones despachables." };
  }

  const { tokensToWinners, tokensToTies, tokensToOthers, winnerNames, winnerUids, tieUids, otherUids } = pushData as PushData;
  const namesString = winnerNames.join(", ");
  const isTie = winnerNames.length > 1;
  const othersBody = isTie
    ? `${namesString} la rompieron y fueron elegidos como las figuras de la cancha en tu último partido.`
    : `${namesString} la rompió y fue elegido como la figura de la cancha en tu último partido.`;
  const now = new Date().toISOString();

  let totalSent = 0;
  const urlParams = { url: `${APP_URL}/join/${matchId}` };

  // === IN-APP NOTIFICATIONS (ALWAYS) ===
  const inAppPromises: Promise<any>[] = [];

  for (const uid of winnerUids) {
    inAppPromises.push(db.collection("notifications").doc(uid).collection("items").add({
      title: "⭐ ¡Felicidades crack!",
      body: "Fuiste elegido como el MVP indiscutible del último partido.",
      type: "mvp",
      url: `/join/${matchId}`,
      read: false,
      createdAt: now,
      expireAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + NOTIFICATION_TTL_MS)),
    }));
  }

  for (const uid of tieUids) {
    inAppPromises.push(db.collection("notifications").doc(uid).collection("items").add({
      title: "🤝 ¡Empate!",
      body: "Tú y otros jugadores compartieron el título MVP del último partido. ¡Cracks!",
      type: "mvp",
      url: `/join/${matchId}`,
      read: false,
      createdAt: now,
      expireAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + NOTIFICATION_TTL_MS)),
    }));
  }

  for (const uid of otherUids) {
    inAppPromises.push(db.collection("notifications").doc(uid).collection("items").add({
      title: "🏆 ¡Habemus MVP!",
      body: othersBody,
      type: "mvp",
      url: `/join/${matchId}`,
      read: false,
      createdAt: now,
      expireAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + NOTIFICATION_TTL_MS)),
    }));
  }

  await Promise.all(inAppPromises);

  // === PUSH NOTIFICATIONS (BEST-EFFORT via safeSendPush) ===
  const mvpUrl = urlParams.url;

  const resWinners = await safeSendPush(tokensToWinners,
    { title: "⭐ ¡Felicidades crack!", body: "Fuiste elegido como el MVP indiscutible del último partido." },
    mvpUrl, "mvp-winner");
  totalSent += resWinners.successCount;

  const resTies = await safeSendPush(tokensToTies,
    { title: "🤝 ¡Empate!", body: "Tú y otros jugadores compartieron el título MVP del último partido. ¡Cracks!" },
    mvpUrl, "mvp-tie");
  totalSent += resTies.successCount;

  const resOthers = await safeSendPush(tokensToOthers,
    { title: "🏆 ¡Habemus MVP!", body: othersBody },
    mvpUrl, "mvp-others");
  totalSent += resOthers.successCount;

  console.log(`[Push][mvp] Match ${matchId} — total sent: ${totalSent}`);
  return { success: true, message: "Notificaciones despachadas a los jugadores" };
});

/**
 * 💬 Notificación de Feedback Resuelto (Dual Channel: In-App + Push)
 * El admin marca un feedback como resuelto y el usuario recibe notificación.
 * SIEMPRE escribe in-app notification. Push es best-effort.
 */
export const notifyFeedbackResolved = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes estar autenticado.");
  }

  const { feedbackId } = request.data;
  if (!feedbackId) {
    throw new HttpsError("invalid-argument", "Falta el ID del feedback.");
  }

  // Validate caller is admin
  const callerSnap = await db.collection("users").doc(request.auth.uid).get();
  const callerData = callerSnap.data();
  const callerIsAdmin = callerData?.roles?.includes("admin") || callerData?.role === "admin";

  if (!callerIsAdmin) {
    throw new HttpsError("permission-denied", "Solo administradores pueden resolver feedback.");
  }

  // Read feedback
  const feedbackRef = db.collection("feedback").doc(feedbackId);
  const feedbackSnap = await feedbackRef.get();

  if (!feedbackSnap.exists) {
    throw new HttpsError("not-found", "El feedback no existe.");
  }

  const feedback = feedbackSnap.data() as {
    userId: string;
    userName: string;
    type: "bug" | "idea" | "other";
    message: string;
    status: string;
  };

  if (feedback.status === "resolved") {
    throw new HttpsError("already-exists", "Este feedback ya fue resuelto.");
  }

  // Build contextual message
  let title = "";
  let body = "";

  switch (feedback.type) {
    case "bug":
      title = "🔧 ¡Tu reporte fue solucionado!";
      body = `El bug que reportaste fue corregido: "${feedback.message.substring(0, 80)}${feedback.message.length > 80 ? "..." : ""}"`;
      break;
    case "idea":
      title = "💡 ¡Tu idea fue implementada!";
      body = `La idea que propusiste fue aplicada: "${feedback.message.substring(0, 80)}${feedback.message.length > 80 ? "..." : ""}"`;
      break;
    default:
      title = "✅ ¡Tu feedback fue atendido!";
      body = `Tu feedback fue revisado y atendido: "${feedback.message.substring(0, 80)}${feedback.message.length > 80 ? "..." : ""}"`;
      break;
  }

  const now = new Date().toISOString();

  // 1. ALWAYS write in-app notification
  await db.collection("notifications").doc(feedback.userId).collection("items").add({
    title,
    body,
    type: "feedback_resolved",
    read: false,
    createdAt: now,
    expireAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + NOTIFICATION_TTL_MS)),
  });

  // 2. Update feedback status
  await feedbackRef.update({
    status: "resolved",
    resolvedAt: now,
  });

  console.log(`💬 Feedback ${feedbackId} resuelto (in-app only)`);
  return {
    success: true,
    message: "Feedback resuelto y usuario notificado via in-app notification.",
  };
});

/**
 * 🧪 DIAGNOSTIC: Test Push Notification Pipeline
 * Sends a test push to the calling user and returns detailed results.
 * Admin-only. Helps diagnose why push notifications aren't arriving.
 */
export const testPushNotification = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes estar autenticado.");
  }

  const uid = request.auth.uid;

  // 1. Read user profile
  const userSnap = await db.collection("users").doc(uid).get();
  if (!userSnap.exists) {
    return { success: false, error: "User document not found in Firestore" };
  }

  const userData = userSnap.data();
  const tokens: string[] = userData?.fcmTokens ?? [];
  const notificationsEnabled = userData?.notificationsEnabled ?? false;

  const diagnostics: Record<string, unknown> = {
    uid,
    notificationsEnabled,
    tokenCount: tokens.length,
    tokens: tokens.map((t: string) => t.substring(0, 25) + "..."),
  };

  if (tokens.length === 0) {
    return {
      success: false,
      diagnostics,
      error: "No FCM tokens found. User needs to enable push notifications first.",
    };
  }

  // 2. Try sending a test notification
  try {
    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: "🧪 Test Push Notification",
        body: `Diagnóstico exitoso. ${new Date().toISOString()}`,
      },
      data: {
        url: `${APP_URL}/`,
      },
      webpush: {
        notification: { icon: "/icons/icon-192x192.png" },
        fcmOptions: { link: `${APP_URL}/` },
      },
      apns: { payload: { aps: { badge: 1, sound: "default" } } },
    });

    const results = response.responses.map((res, idx) => ({
      tokenPrefix: tokens[idx].substring(0, 25) + "...",
      success: res.success,
      messageId: res.messageId || null,
      errorCode: res.error?.code || null,
      errorMessage: res.error?.message || null,
    }));

    diagnostics.fcmResults = results;
    diagnostics.successCount = response.successCount;
    diagnostics.failureCount = response.failureCount;

    console.log("🧪 Push test results:", JSON.stringify(diagnostics, null, 2));

    return {
      success: response.successCount > 0,
      diagnostics,
      message: response.successCount > 0
        ? `Push enviado exitosamente a ${response.successCount}/${tokens.length} dispositivos. Si no llega, el problema está en el Service Worker del navegador.`
        : `Todos los tokens fallaron. Ver errorCode para detalles.`,
    };
  } catch (err: any) {
    console.error("🧪 Push test EXCEPTION:", err);
    return {
      success: false,
      diagnostics,
      error: `FCM exception: ${err.code || err.message || String(err)}`,
    };
  }
});

/**
 * ⚽ Notificación de equipos confirmados (Trigger reactivo por Firestore)
 * Se dispara cuando el admin publica los equipos (teamsConfirmed: false → true).
 * Notifica a todos los jugadores con uid del partido (in-app + push).
 * Idempotente: usa remindersSent.teamsConfirmed como barrera.
 */
export const teamsConfirmedNotification = onDocumentUpdated(
  { document: "matches/{matchId}", region: "us-central1" },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();

    // Solo actuar cuando teamsConfirmed cambia de falsy → true
    if (!after?.teamsConfirmed || before?.teamsConfirmed === true) return;

    // Idempotencia
    if (after?.remindersSent?.teamsConfirmed) return;

    const matchId = event.params.matchId;
    const matchRef = db.collection("matches").doc(matchId);

    // Sellar barrera anti-duplicados
    await matchRef.update({ "remindersSent.teamsConfirmed": true });

    type TeamPlayer = { uid?: string; name?: string; [key: string]: unknown };
    const teamsA: TeamPlayer[] = after?.teams?.A ?? [];
    const teamsB: TeamPlayer[] = after?.teams?.B ?? [];
    const allTeamPlayers = [...teamsA, ...teamsB];

    // Recopilar UIDs únicos (excluir guests)
    const seen = new Set<string>();
    const uids: string[] = [];
    for (const p of allTeamPlayers) {
      if (p.uid && typeof p.uid === "string" && !p.uid.startsWith("guest_") && !seen.has(p.uid)) {
        seen.add(p.uid);
        uids.push(p.uid);
      }
    }

    if (uids.length === 0) {
      console.log(`[TeamsConfirmed] Match ${matchId} — sin jugadores con uid, nada que notificar`);
      return;
    }

    // Batch-read todos los usuarios
    const userRefs = uids.map(uid => db.collection("users").doc(uid));
    const userSnaps = await db.getAll(...userRefs);
    const userDataMap = new Map<string, { data: FirebaseFirestore.DocumentData | undefined; ref: FirebaseFirestore.DocumentReference }>();
    userSnaps.forEach((snap, idx) => {
      userDataMap.set(uids[idx], { data: snap.data(), ref: snap.ref });
    });

    const url = `${APP_URL}/join/${matchId}`;
    const title = "⚽ ¡Ya están los equipos!";
    const body = "El organizador publicó los equipos para tu partido. ¡Mirá quién es tu compañero!";
    const now = new Date().toISOString();
    const expireAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + NOTIFICATION_TTL_MS));

    const inAppPromises: Promise<any>[] = [];
    const allTokens: string[] = [];
    const tokenToUserRef = new Map<string, FirebaseFirestore.DocumentReference>();

    for (const uid of uids) {
      // 1. In-app notification (siempre)
      inAppPromises.push(
        db.collection("notifications").doc(uid).collection("items").add({
          title,
          body,
          type: "teams_confirmed",
          url: `/join/${matchId}`,
          read: false,
          createdAt: now,
          expireAt,
        })
      );

      // 2. Recopilar tokens para push en batch
      const userData = userDataMap.get(uid);
      const tokens: string[] = Array.from(new Set<string>(userData?.data?.fcmTokens ?? []));
      for (const token of tokens) {
        allTokens.push(token);
        tokenToUserRef.set(token, userData!.ref);
      }
    }

    await Promise.all(inAppPromises);

    if (allTokens.length > 0) {
      const result = await safeSendPush(allTokens, { title, body }, url, "teams-confirmed");

      // Limpiar tokens inválidos por usuario
      const invalidByUser = new Map<string, string[]>();
      for (const invalidToken of result.invalidTokens) {
        const ref = tokenToUserRef.get(invalidToken);
        if (!ref) continue;
        const list = invalidByUser.get(ref.id) ?? [];
        list.push(invalidToken);
        invalidByUser.set(ref.id, list);
      }
      for (const [, ref] of [...tokenToUserRef.entries()].filter(([t]) => result.invalidTokens.includes(t))) {
        const invalidTokens = invalidByUser.get(ref.id) ?? [];
        await cleanupInvalidTokens(ref, invalidTokens);
      }
    }

    console.log(`[TeamsConfirmed] Match ${matchId} — notificados ${uids.length} jugadores`);
  }
);

/**
 * 🏆 Notificación de partido cerrado / Votación MVP (Trigger reactivo)
 * Se dispara cuando status cambia de open → closed.
 * Notifica a todos los jugadores confirmados con uid (in-app + push).
 * Idempotente: usa remindersSent.mvpVotingOpen como barrera.
 */
export const matchClosedNotification = onDocumentUpdated(
  { document: "matches/{matchId}", region: "us-central1" },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();

    // Solo actuar cuando status cambia de open → closed
    if (after?.status !== "closed" || before?.status !== "open") return;

    // Idempotencia
    if (after?.remindersSent?.mvpVotingOpen) return;

    const matchId = event.params.matchId;
    const matchRef = db.collection("matches").doc(matchId);

    // Sellar barrera anti-duplicados
    await matchRef.update({ "remindersSent.mvpVotingOpen": true });

    const players = after?.players ?? [];
    
    // Recopilar UIDs únicos (excluir guests)
    const seen = new Set<string>();
    const uids: string[] = [];
    for (const p of players) {
      if (p.confirmed && p.uid && typeof p.uid === "string" && !p.uid.startsWith("guest_") && !seen.has(p.uid)) {
        seen.add(p.uid);
        uids.push(p.uid);
      }
    }

    if (uids.length === 0) {
      console.log(`[MatchClosed] Match ${matchId} — sin jugadores con uid, nada que notificar`);
      return;
    }

    // Batch-read todos los usuarios
    const userRefs = uids.map(uid => db.collection("users").doc(uid));
    const userSnaps = await db.getAll(...userRefs);
    const userDataMap = new Map<string, { data: FirebaseFirestore.DocumentData | undefined; ref: FirebaseFirestore.DocumentReference }>();
    userSnaps.forEach((snap, idx) => {
      userDataMap.set(uids[idx], { data: snap.data(), ref: snap.ref });
    });

    const url = `${APP_URL}/join/${matchId}`;
    const title = "🏆 ¡Partido terminado!";
    const body = "Ya puedes votar por el MVP del partido.";
    const now = new Date().toISOString();
    const expireAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + NOTIFICATION_TTL_MS));

    const inAppPromises: Promise<any>[] = [];
    const allTokens: string[] = [];
    const tokenToUserRef = new Map<string, FirebaseFirestore.DocumentReference>();

    for (const uid of uids) {
      // 1. In-app notification
      inAppPromises.push(
        db.collection("notifications").doc(uid).collection("items").add({
          title,
          body,
          type: "mvp_voting_open",
          url: `/join/${matchId}`,
          read: false,
          createdAt: now,
          expireAt,
        })
      );

      // 2. Recopilar tokens para push
      const userData = userDataMap.get(uid);
      const tokens: string[] = Array.from(new Set<string>(userData?.data?.fcmTokens ?? []));
      for (const token of tokens) {
        allTokens.push(token);
        tokenToUserRef.set(token, userData!.ref);
      }
    }

    await Promise.all(inAppPromises);

    if (allTokens.length > 0) {
      const result = await safeSendPush(allTokens, { title, body }, url, "match-closed");

      // Limpiar tokens inválidos
      const invalidByUser = new Map<string, string[]>();
      for (const invalidToken of result.invalidTokens) {
        const ref = tokenToUserRef.get(invalidToken);
        if (!ref) continue;
        const list = invalidByUser.get(ref.id) ?? [];
        list.push(invalidToken);
        invalidByUser.set(ref.id, list);
      }
      for (const [, ref] of [...tokenToUserRef.entries()].filter(([t]) => result.invalidTokens.includes(t))) {
        const invalidTokens = invalidByUser.get(ref.id) ?? [];
        await cleanupInvalidTokens(ref, invalidTokens);
      }
    }

    console.log(`[MatchClosed] Match ${matchId} — notificados ${uids.length} jugadores`);
  }
);

/**
 * 📱 Clear iOS App Badge
 * Sends a silent push with badge: 0 to clear the PWA icon badge on iOS.
 * Called by the client when the user reads all notifications.
 */
export const clearIOSBadge = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login required");

  const userSnap = await db.collection("users").doc(uid).get();
  const tokens: string[] = userSnap.data()?.fcmTokens ?? [];
  if (tokens.length === 0) return { success: true };

  await admin.messaging().sendEachForMulticast({
    tokens,
    data: { type: "badge_clear" },
    apns: {
      payload: {
        aps: {
          badge: 0,
          "content-available": 1,
        },
      },
    },
  });

  return { success: true };
});

