"use client";

import { useEffect } from "react";
import { logReservationLandingViewed } from "@/lib/analytics";

/**
 * Dispara el evento de vista de la landing de reservas una sola vez al montar.
 * Componente sin UI. Ref: docs/RESERVAS_LANDING_QR_SDD.md §8
 */
export default function LandingTrackers({ venueId }: { venueId: string | null }) {
    useEffect(() => {
        logReservationLandingViewed(venueId);
    }, [venueId]);

    return null;
}
