import { doc, updateDoc, increment } from "firebase/firestore";
import { db } from "./firebase";

export async function updatePlayerStats(
  players: any[],
  result: "win" | "loss" | "draw"
) {
  for (const player of players) {
    if (!player.uid) continue;

    await updateDoc(doc(db, "users", player.uid), {
      "stats.played": increment(1),
      "stats.won": increment(result === "win" ? 1 : 0),
      "stats.lost": increment(result === "loss" ? 1 : 0),
      "stats.draw": increment(result === "draw" ? 1 : 0),
    });
  }
}
