import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";

const db = admin.firestore();

/**
 * 🔔 Recordatorios automáticos de partidos
 * Corre cada 5 minutos (modo prueba)
 *
 * Ventanas reales:
 *  - 24h → 1440 min
 *  - 12h → 720 min
 *  - 6h  → 360 min
 */
export const matchReminders = onSchedule(
  "every 60 minutes",
  async () => {
    const now = new Date();

    console.log("⏰ Reminder job running:", now.toISOString());

    const snapshot = await db
      .collection("matches")
      .where("status", "==", "open")
      .get();

    console.log("📋 Matches abiertos:", snapshot.size);

    for (const doc of snapshot.docs) {
      const match = doc.data();

      console.log("⚽ Match:", doc.id);

      // 🔒 Validación fuerte
      if (!match.startsAt) {
        console.log("❌ Match sin startsAt");
        continue;
      }

      const matchDate = match.startsAt.toDate();

      const diffMinutes =
        (matchDate.getTime() - now.getTime()) / (1000 * 60);

      console.log(
        "📆 startsAt:",
        matchDate.toISOString(),
        "| now time:",
        now.toISOString(),
        "| diffMinutes:",
        diffMinutes.toFixed(2)
      );

      /**
       * 🧪 MODO PRUEBA
       * Recordatorio ~5 minutos antes
       * const reminderMinutes = [5];
       */


      /**
       * 🟢 PRODUCCIÓN (cuando quieras)
       * const reminderMinutes = [1440, 720, 360];
       */

      const reminderMinutes = [1440, 720, 360];

      const windowMinutes = 120; // 2 horas de ventana por si hay delay en el cronjob

      for (const min of reminderMinutes) {
        if (
          diffMinutes > 0 &&
          diffMinutes <= min &&
          diffMinutes > min - windowMinutes
        ) {
          await sendReminderIfNeeded(
            doc.id,
            match,
            `${min}m`
          );
        }
      }
    }
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
