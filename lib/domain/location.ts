/**
 * ========================
 * LOCATION DOMAIN MODEL
 * ========================
 *
 * Specification-Driven Development (SDD)
 *
 * Modelo de dominio para ubicaciones/canchas.
 *
 * ESPECIFICACIÓN:
 * - Una cancha tiene nombre, dirección, coordenadas y placeId de Google
 * - No se permiten canchas duplicadas (por placeId)
 * - Las canchas pueden estar activas o inactivas
 */

import { ValidationError } from "./errors";

// ========================
// TIPOS
// ========================

export interface Location {
    id: string;
    name: string;
    address: string;
    placeId: string;
    lat: number;
    lng: number;
    createdBy: string;
    active: boolean;
}

export interface LocationSnapshot {
    name: string;
    address: string;
    lat: number;
    lng: number;
}

export interface CreateLocationInput {
    name: string;
    address: string;
    placeId: string;
    lat: number;
    lng: number;
    createdBy: string;
}

// ========================
// VALIDACIONES
// ========================

/**
 * Valida los datos de creación de una ubicación.
 */
export function validateLocationData(data: CreateLocationInput): void {
    if (!data.name || data.name.trim().length < 2) {
        throw new ValidationError("El nombre de la cancha es obligatorio");
    }

    if (!data.address) {
        throw new ValidationError("La dirección es obligatoria");
    }

    if (!data.placeId) {
        throw new ValidationError("El placeId de Google es obligatorio");
    }

    if (typeof data.lat !== "number" || typeof data.lng !== "number") {
        throw new ValidationError("Las coordenadas son obligatorias");
    }

    if (!data.createdBy) {
        throw new ValidationError("El creador es obligatorio");
    }
}
