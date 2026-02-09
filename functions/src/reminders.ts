import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";

admin.initializeApp();
const db = admin.firestore();

/**
 * Corre cada 60 minutos y revisa partidos abiertos
 * para enviar recordatorios 24h / 12h / 6h antes
 */
export const matchReminders = onSchedule(
  "every 5 minutes",
  async () => {
    const now = new Date();

    const snapshot = await db
      .collection("matches")
      .where("status", "==", "open")
      .get();

    for (const doc of snapshot.docs) {
      const match = doc.data();

      if (!match.date || !match.time) continue;

      const matchDate = new Date(`${match.date}T${match.time}:00`);
      const diffHours =
        (matchDate.getTime() - now.getTime()) / (1000 * 60 * 60);

      // 🔔 Ventanas de recordatorio
      //const reminderHours = [24, 12, 6];
      const reminderHours = [5 / 60];


      for (const hour of reminderHours) {
        // margen de 30 minutos
        if (Math.abs(diffHours - hour) < 0.5) {
          await sendReminderIfNeeded(doc.id, match, hour);
        }
      }
    }
  }
);

/**
 * Envía recordatorios solo si:
 * - No se ha enviado antes (anti-spam)
 * - El jugador NO ha confirmado
 */
async function sendReminderIfNeeded(
  matchId: string,
  match: any,
  hour: number
) {
  // 🛑 PUNTO 3 (ANTI-SPAM) — VALIDACIÓN
  if (match.remindersSent?.[String(hour)]) {
    return;
  }

  const unconfirmedPlayers = (match.players || []).filter(
    (p: any) => !p.confirmed && p.uid
  );

  if (unconfirmedPlayers.length === 0) return;

  for (const player of unconfirmedPlayers) {
    const userSnap = await db.collection("users").doc(player.uid).get();
    const user = userSnap.data();

    if (!user?.fcmTokens || user.fcmTokens.length === 0) continue;

    const message = {
      notification: {
        title: "⚽ Recordatorio de partido",
        body: `No has confirmado tu asistencia`,
      },
      data: {
        url: `/match/${matchId}`,
      },
      tokens: user.fcmTokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    const invalidTokens: string[] = [];

    response.responses.forEach((res, idx) => {
      if (!res.success) {
        invalidTokens.push(user.fcmTokens[idx]);
      }
    });

    if (invalidTokens.length > 0) {
      await userSnap.ref.update({
        fcmTokens: admin.firestore.FieldValue.arrayRemove(...invalidTokens),
      });
    }

  }

  // ✅ PUNTO 3 (ANTI-SPAM) — MARCAR COMO ENVIADO
  await db.collection("matches").doc(matchId).update({
    [`remindersSent.${hour}`]: true,
  });
}
