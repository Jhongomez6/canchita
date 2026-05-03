/**
 * ========================
 * USERS LIST API
 * ========================
 *
 * Specification-Driven Development (SDD)
 *
 * Funciones de consulta para listados de usuarios.
 * Usa tipos del dominio (`lib/domain/user.ts`).
 *
 * ESPECIFICACIÓN:
 * - getPlayersRanking() retorna estadísticas de todos los usuarios
 * - Valores por defecto (0) si stats no existen
 */

import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import { getDisplayedWeeklyStreak } from "./domain/user";

// ========================
// TIPOS
// ========================

export interface PlayerRanking {
    uid: string;
    name: string;
    played: number;
    won: number;
    lost: number;
    draw: number;
    winRate: number;
    commitmentStreak: number;
    weeklyStreak: number;
    mvpAwards: number;
}

// ========================
// FUNCIONES
// ========================

/**
 * Obtiene el ranking de todos los jugadores registrados.
 * Regla: Valores por defecto 0 si el campo stats no existe.
 */
export async function getPlayersRanking(): Promise<PlayerRanking[]> {
    const usersRef = collection(db, "users");
    const snapshot = await getDocs(usersRef);

    return snapshot.docs.map((d) => {
        const data = d.data();
        const stats = data.stats ?? {};
        const played = Math.max(0, stats.played ?? 0);
        const won = Math.max(0, stats.won ?? 0);

        return {
            uid: d.id,
            name: data.name ?? "Sin nombre",
            played,
            won,
            lost: Math.max(0, stats.lost ?? 0),
            draw: Math.max(0, stats.draw ?? 0),
            winRate: played > 0 ? Math.round((won / played) * 100) : 0,
            commitmentStreak: Math.max(0, data.commitmentStreak ?? 0),
            weeklyStreak: getDisplayedWeeklyStreak({
                weeklyStreak: data.weeklyStreak,
                lastPlayedWeek: data.lastPlayedWeek,
            }),
            mvpAwards: Math.max(0, data.mvpAwards ?? 0),
        };
    });
}
