import { doc, setDoc, increment, getDoc } from "firebase/firestore";
import { db } from "./firebase";

export async function updatePlayerStats(
  players: any[],
  result: "win" | "loss" | "draw",
  matchId: string,
  previousResult?: "win" | "loss" | "draw"
) {
  console.log("Updating stats for match:", matchId);
  console.log("New result:", result);
  console.log("Previous result:", previousResult);

  for (const player of players) {
    if (!player.uid) {
      console.log("⛔ Player sin uid:", player.name);
      continue;
    }

    console.log("Updating stats for:", player.uid);

    // Si hay un resultado previo, primero revertir esas estadísticas
    if (previousResult) {
      await setDoc(
        doc(db, "users", player.uid),
        {
          stats: {
            played: increment(-1),
            won: increment(previousResult === "win" ? -1 : 0),
            lost: increment(previousResult === "loss" ? -1 : 0),
            draw: increment(previousResult === "draw" ? -1 : 0),
          },
        },
        { merge: true }
      );
      console.log("✅ Reverted previous stats for:", player.uid, "- was:", previousResult);
    }

    // Aplicar las nuevas estadísticas
    await setDoc(
      doc(db, "users", player.uid),
      {
        stats: {
          played: increment(1),
          won: increment(result === "win" ? 1 : 0),
          lost: increment(result === "loss" ? 1 : 0),
          draw: increment(result === "draw" ? 1 : 0),
        },
      },
      { merge: true }
    );
    console.log("✅ Applied new stats for:", player.uid, "- now:", result);
  }
}
