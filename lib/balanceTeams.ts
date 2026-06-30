/**
 * ========================
 * BALANCE TEAMS API
 * ========================
 *
 * Specification-Driven Development (SDD)
 *
 * Re-exporta la lógica de balanceo desde la capa de dominio.
 * Este archivo se mantiene como wrapper por backward compatibility.
 */

// Re-export todo desde el dominio
export { balanceTeams, getTeamSummary, sortTeamForDisplay, getBalanceQuality, DEFAULT_WEIGHTS } from "./domain/team";
export type {
    Team,
    BalanceResult,
    TeamSummary,
    BalanceWeights,
    BalanceOptions,
    BalanceQuality,
} from "./domain/team";
export type { Player } from "./domain/player";
