import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";

const db = admin.firestore();

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
  match: any,
  reminderKey: string
) {
  console.log(
    "🔔 Evaluando reminder",
    reminderKey,
    "para match",
    matchId
  );

  // 🛑 Anti-spam
  if (match.remindersSent?.[reminderKey]) {
    console.log("⛔ Reminder ya enviado:", reminderKey);
    return;
  }

  const players = (match.players || []).filter((p: any) => p.uid);

  if (players.length === 0) return;

  for (const player of players) {
    const userSnap = await db.collection("users").doc(player.uid).get();
    const user = userSnap.data();
    const tokens = user?.fcmTokens ?? [];

    if (tokens.length === 0) continue;

    // 🎯 MENSAJE DINÁMICO SEGÚN ESTADO

    let title = "⚽ El partido se acerca";
    let body = "";

    if (player.confirmed) {
      title = "⚽ Partido confirmado";
    } else {
      title = "⚽ ¿Vas a jugar?";
    }


    if (player.confirmed) {
      body = `Cancela tu asistencia si no puedes ir, dale la oportunidad a otro jugador`;
    } else {
      body = `Confirma tu asistencia ahora.`;
    }

    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title,
        body,
      },
      data: {
        url: `https://la-canchita.vercel.app/join/${matchId}`,
      },
    });


    // 🧹 Limpieza de tokens inválidos
    const invalidTokens: string[] = [];

    response.responses.forEach((res, idx) => {
      if (!res.success) {
        invalidTokens.push(tokens[idx]);
      }
    });

    if (invalidTokens.length > 0) {
      await userSnap.ref.update({
        fcmTokens: admin.firestore.FieldValue.arrayRemove(
          ...invalidTokens
        ),
      });

      console.log(
        "🧹 Tokens inválidos removidos:",
        invalidTokens.length
      );
    }
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

  let sentTokensCount = 0;

  for (const player of uniquePlayers) {
    const pSnap = await db.collection("users").doc(player.uid).get();
    const pData = pSnap.data();
    // Desduplicar tokens en caso de que el cliente haya registrado la misma llave web dos veces
    const tokens = Array.from(new Set<string>(pData?.fcmTokens ?? []));

    if (tokens.length === 0) continue;

    let title = "";
    let body = "";

    if (player.confirmed) {
      title = "⚽ El partido se acerca";
      body = "¿Sigues en pie para el partido? Recuerda avisar si no vas a asistir para liberar tu cupo.";
    } else {
      title = "⚽ ¡Faltas tú!";
      body = "Por favor confirma tu asistencia al partido lo antes posible.";
    }

    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title,
        body,
      },
      data: {
        url: `https://la-canchita.vercel.app/join/${matchId}`,
      },
    });

    sentTokensCount += response.successCount;

    // 🧹 Limpiar tokens inválidos tras el broadcast
    const invalidTokens: string[] = [];
    response.responses.forEach((res: any, idx: number) => {
      if (!res.success) {
        invalidTokens.push(tokens[idx]);
      }
    });

    if (invalidTokens.length > 0) {
      await pSnap.ref.update({
        fcmTokens: admin.firestore.FieldValue.arrayRemove(...invalidTokens),
      });
    }
  }

  console.log(`📣 Manual Reminder enviado para match ${matchId} a ${sentTokensCount} dispositivos`);
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
    const timeLimitClosed = hoursSinceClosed > 5;

    const isClosed = match.status === "closed";
    const votingClosed = isClosed && (timeLimitClosed || mathematicallyClosed || allEligibleVoted);

    if (!votingClosed) {
      throw new HttpsError("failed-precondition", "La votación de MVP aún no está matemáticamente finalizada.");
    }

    // 3. Obtener Líderes
    if (topMvpScore === 0) {
      // Nadie votó por nadie. Solo sellamos la bandera.
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

    // 4. Preparar colas de Tokens según público
    const tokensToWinners: string[] = [];
    const tokensToTies: string[] = [];
    const tokensToOthers: string[] = [];

    const physicalPlayers = (match.players || []).filter((p: any) => p.uid && !p.uid.startsWith("guest_"));

    for (const player of physicalPlayers) {
      const pSnap = await transaction.get(db.collection("users").doc(player.uid));
      const pData = pSnap.data();
      const tokens = Array.from(new Set<string>(pData?.fcmTokens ?? []));

      if (tokens.length === 0) continue;

      const isMVP = currentMVPs.includes(player.uid) || currentMVPs.includes(player.name);

      if (isMVP) {
        if (currentMVPs.length > 1) {
          tokensToTies.push(...tokens);
        } else {
          tokensToWinners.push(...tokens);
        }
      } else {
        tokensToOthers.push(...tokens);
      }
    }

    pushData = {
      tokensToWinners,
      tokensToTies,
      tokensToOthers,
      winnerNames
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

  const { tokensToWinners, tokensToTies, tokensToOthers, winnerNames } = pushData as PushData;
  const namesString = winnerNames.join(", ");

  let totalSent = 0;
  const urlParams = { url: `https://la-canchita.vercel.app/join/${matchId}` };

  // A) Mensajes a Ganador(es) únicos
  if (tokensToWinners.length > 0) {
    const res = await admin.messaging().sendEachForMulticast({
      tokens: tokensToWinners,
      notification: {
        title: "⭐ ¡Felicidades crack!",
        body: "Fuiste elegido como el MVP indiscutible del último partido.",
      },
      data: urlParams,
    });
    totalSent += res.successCount;
  }

  // B) Mensajes a Ganadores en Empate
  if (tokensToTies.length > 0) {
    const res = await admin.messaging().sendEachForMulticast({
      tokens: tokensToTies,
      notification: {
        title: "🤝 ¡Empate!",
        body: "Tú y otros jugadores compartieron el título MVP del último partido. ¡Cracks!",
      },
      data: urlParams,
    });
    totalSent += res.successCount;
  }

  // C) Mensajes al Resto (Participantes)
  if (tokensToOthers.length > 0) {
    const res = await admin.messaging().sendEachForMulticast({
      tokens: tokensToOthers,
      notification: {
        title: "🏆 ¡Habemus MVP!",
        body: `${namesString} la rompió y fue elegido como la figura de la cancha en tu último partido.`,
      },
      data: urlParams,
    });
    totalSent += res.successCount;
  }

  console.log(`📣 Notificaciones de MVP enviadas exitosamente para match ${matchId}. Total: ${totalSent}`);
  return { success: true, message: "Notificaciones despachadas a los jugadores" };
});
