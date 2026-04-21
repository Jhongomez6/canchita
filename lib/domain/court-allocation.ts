/**
 * ========================
 * COURT ALLOCATION ALGORITHM
 * ========================
 *
 * Specification-Driven Development (SDD)
 * Ref: docs/BOOKING_SYSTEM_SDD.md — Sección 9
 *
 * Algoritmo puro de asignación de canchas: "Smallest Fit First".
 * Sin Firebase, sin React — solo lógica de dominio.
 *
 * ESTRATEGIA:
 * 1. Obtener courts libres en el horario solicitado
 * 2. Filtrar opciones que pueden satisfacer el formato pedido
 * 3. Ordenar por "impacto" ascendente:
 *    - Preferir courts sueltos sobre courts parte de combos grandes
 *    - Si solo hay courts de combos, preferir el que bloquea MENOS combos grandes
 * 4. Retornar courtIds asignados o null si no hay disponibilidad
 *
 * EJEMPLO:
 * Sede con 4 canchas de 6v6 (C1, C2, C3, C4)
 * Combos: ComboA(C1+C2→9v9), ComboB(C3+C4→9v9), ComboFull(C1+C2+C3+C4→11v11)
 *
 * Pedido: 6v6 a las 18:00, todas libres
 * → Todas tienen impacto=2 → desempate: agrupar en un lado
 * → Asignar C1 (primer court del primer combo)
 *
 * Pedido: 6v6, C1 ya ocupada
 * → ComboA roto → C2 impacto=0 (ComboFull también roto)
 * → Asignar C2 (no rompe nada adicional)
 *
 * Pedido: 9v9, C1 ya ocupada
 * → ComboA no viable → ComboB viable (C3+C4 libres) → Asignar C3+C4
 *
 * Pedido: 11v11, C1 ya ocupada
 * → ComboFull no viable → null
 */

import type { Court, CourtCombo, CourtFormat } from "./venue";

// ========================
// TIPOS
// ========================

export interface AllocationInput {
    requestedFormat: CourtFormat;
    courts: Court[];
    combos: CourtCombo[];
    occupiedCourtIds: string[];
    blockedCourtIds: string[];
}

export interface AllocationResult {
    courtIds: string[];
    courtNames: string[];
    comboUsed?: string;
}

interface AllocationOption {
    courtIds: string[];
    courtNames: string[];
    comboId?: string;
    impactScore: number;
}

// ========================
// ALGORITMO PRINCIPAL
// ========================

/**
 * Asigna el mejor conjunto de courts para una reserva.
 * Retorna null si no hay disponibilidad para el formato solicitado.
 */
export function allocateCourts(input: AllocationInput): AllocationResult | null {
    const { requestedFormat, courts, combos, occupiedCourtIds, blockedCourtIds } = input;

    const unavailableIds = new Set([...occupiedCourtIds, ...blockedCourtIds]);
    const activeCourts = courts.filter((c) => c.active);
    const activeCombos = combos.filter((c) => c.active);

    const options: AllocationOption[] = [];

    // Opción 1: courts individuales que matchean el formato
    for (const court of activeCourts) {
        if (court.baseFormat === requestedFormat && !unavailableIds.has(court.id)) {
            const impact = courtImpactScore(court.id, activeCombos, unavailableIds);
            options.push({
                courtIds: [court.id],
                courtNames: [court.name],
                impactScore: impact,
            });
        }
    }

    // Opción 2: combos que producen el formato
    for (const combo of activeCombos) {
        if (combo.resultingFormat === requestedFormat) {
            const allFree = combo.courtIds.every((id) => !unavailableIds.has(id));
            if (allFree) {
                const impact = comboImpactScore(combo.courtIds, activeCombos, unavailableIds);
                const comboCourtNames = combo.courtIds.map((id) => {
                    const court = activeCourts.find((c) => c.id === id);
                    return court?.name ?? id;
                });
                options.push({
                    courtIds: [...combo.courtIds],
                    courtNames: comboCourtNames,
                    comboId: combo.id,
                    impactScore: impact,
                });
            }
        }
    }

    if (options.length === 0) return null;

    // Ordenar por impacto ascendente (menor impacto primero)
    options.sort((a, b) => {
        if (a.impactScore !== b.impactScore) return a.impactScore - b.impactScore;
        // Desempate: preferir menos courts (individual sobre combo)
        if (a.courtIds.length !== b.courtIds.length) return a.courtIds.length - b.courtIds.length;
        // Desempate: orden estable por primer courtId
        return a.courtIds[0].localeCompare(b.courtIds[0]);
    });

    const best = options[0];
    return {
        courtIds: best.courtIds,
        courtNames: best.courtNames,
        comboUsed: best.comboId,
    };
}

// ========================
// IMPACT SCORING
// ========================

/**
 * Calcula el impacto de ocupar un solo court.
 * Impacto = cantidad de combos VIABLES que perderían viabilidad si este court se ocupa.
 * Un combo es viable si todos sus courts están libres.
 */
export function courtImpactScore(
    courtId: string,
    combos: CourtCombo[],
    unavailableIds: Set<string>,
): number {
    return combos.filter((combo) => {
        const isViable = combo.courtIds.every((id) => !unavailableIds.has(id));
        const wouldBreak = combo.courtIds.includes(courtId);
        return isViable && wouldBreak;
    }).length;
}

/**
 * Calcula el impacto de ocupar un conjunto de courts (para un combo).
 * Impacto = cantidad de OTROS combos viables que perderían viabilidad.
 */
export function comboImpactScore(
    courtIds: string[],
    combos: CourtCombo[],
    unavailableIds: Set<string>,
): number {
    const courtIdSet = new Set(courtIds);
    return combos.filter((combo) => {
        // No contar el combo propio
        const isSameCombo = combo.courtIds.length === courtIds.length &&
            combo.courtIds.every((id) => courtIdSet.has(id));
        if (isSameCombo) return false;

        const isViable = combo.courtIds.every((id) => !unavailableIds.has(id));
        const wouldBreak = combo.courtIds.some((id) => courtIdSet.has(id));
        return isViable && wouldBreak;
    }).length;
}

// ========================
// QUERIES DE DISPONIBILIDAD
// ========================

/**
 * Obtiene los combos que siguen siendo viables dado el estado actual de ocupación.
 */
export function getViableCombos(
    combos: CourtCombo[],
    unavailableIds: Set<string>,
): CourtCombo[] {
    return combos.filter(
        (combo) => combo.active && combo.courtIds.every((id) => !unavailableIds.has(id)),
    );
}

/**
 * Verifica si un formato específico tiene disponibilidad.
 */
export function isFormatAvailable(
    format: CourtFormat,
    courts: Court[],
    combos: CourtCombo[],
    unavailableIds: Set<string>,
): boolean {
    const result = allocateCourts({
        requestedFormat: format,
        courts,
        combos,
        occupiedCourtIds: [...unavailableIds],
        blockedCourtIds: [],
    });
    return result !== null;
}

/**
 * Obtiene todos los formatos que tienen disponibilidad en un slot.
 */
export function getAvailableFormatsForSlot(
    courts: Court[],
    combos: CourtCombo[],
    occupiedCourtIds: string[],
    blockedCourtIds: string[],
): CourtFormat[] {
    const unavailableIds = new Set([...occupiedCourtIds, ...blockedCourtIds]);
    const allFormats = new Set<CourtFormat>();

    for (const court of courts) {
        if (court.active) allFormats.add(court.baseFormat);
    }
    for (const combo of combos) {
        if (combo.active) allFormats.add(combo.resultingFormat);
    }

    return [...allFormats].filter((format) =>
        isFormatAvailable(format, courts, combos, unavailableIds),
    );
}
