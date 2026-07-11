"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { loginWithGoogle } from "@/lib/auth";
import { isInAppBrowser } from "@/lib/browser";
import { buildReservarReturnTo, buildReservarCTAHref } from "@/lib/domain/landing";
import { logReservationLandingCTAClicked } from "@/lib/analytics";
import { handleError } from "@/lib/utils/error";

const SIGNUP_INTENT_KEY = "signupIntent";

interface ReservarCTAProps {
    venueId: string | null;
    location: "hero" | "final";
    className?: string;
    label?: string;
}

/**
 * CTA de la landing de reservas. Lanza el registro/login con Google DIRECTO (popup)
 * marcando la intención de alta "booking". Tras el login ESPERA a que el AuthContext
 * cree el perfil "solo reservas" (bookingOnly) y recién ahí navega a la sede — así no
 * hay carrera con la creación del perfil (que mandaría por error al onboarding). En
 * navegadores in-app (Instagram/WhatsApp), donde el popup de Google no funciona, cae al
 * flujo `/?returnTo=...` con instructivo. Ref: docs/RESERVAS_LANDING_QR_SDD.md §6/§12
 */
export default function ReservarCTA({ venueId, location, className, label }: ReservarCTAProps) {
    const router = useRouter();
    const { user, profile, loading } = useAuth();
    const [busy, setBusy] = useState(false);
    // Destino pendiente: se navega cuando el perfil ya está cargado tras el login.
    const [pendingDest, setPendingDest] = useState<string | null>(null);

    const text = label ?? (venueId ? "Reservar en esta sede" : "Registrarme y reservar");

    // Tras el login, esperamos a que exista el perfil (creado por AuthContext con el
    // intent "booking") antes de salir de la landing. Evita que AuthGuard alcance a
    // mandar al onboarding y garantiza que el perfil quede como bookingOnly.
    useEffect(() => {
        if (pendingDest && user && profile) {
            router.replace(pendingDest);
        }
    }, [pendingDest, user, profile, router]);

    const handleClick = async () => {
        if (busy) return;
        logReservationLandingCTAClicked(venueId, location, !!user);

        const dest = buildReservarReturnTo(venueId);

        // Sesión activa: directo a la sede/listado, sin re-login.
        if (user) {
            router.push(dest);
            return;
        }

        // Navegador in-app (Instagram/WhatsApp): el popup de Google no funciona.
        // Delegamos a la LandingPage (`/?returnTo=...`) que muestra el instructivo.
        if (isInAppBrowser()) {
            try {
                window.sessionStorage.setItem(SIGNUP_INTENT_KEY, "booking");
            } catch { /* noop */ }
            router.push(buildReservarCTAHref(venueId));
            return;
        }

        setBusy(true);
        try {
            window.sessionStorage.setItem(SIGNUP_INTENT_KEY, "booking");
        } catch { /* sessionStorage no disponible — el intent se pierde, no bloquea */ }

        try {
            await loginWithGoogle();
            // No navegamos aún: el AuthContext consumirá el intent y creará el perfil
            // "solo reservas". El efecto de arriba navega cuando `profile` esté listo.
            setPendingDest(dest);
        } catch (error) {
            try { window.sessionStorage.removeItem(SIGNUP_INTENT_KEY); } catch { /* noop */ }
            setBusy(false);
            // Cerrar el popup / cancelar no es un error para el usuario: no mostramos toast.
            const code = (error as { code?: string } | null)?.code ?? "";
            const cancelled =
                code === "auth/popup-closed-by-user" ||
                code === "auth/cancelled-popup-request" ||
                code === "auth/user-cancelled";
            if (!cancelled) {
                handleError(error, "No pudimos iniciar tu registro. Intenta de nuevo.");
            }
        }
    };

    return (
        <button
            onClick={handleClick}
            disabled={busy || loading}
            aria-label={text}
            className={
                className ??
                "inline-flex items-center justify-center gap-2 bg-[#FCD116] text-[#145c3a] font-black text-base rounded-2xl py-4 px-8 shadow-xl hover:-translate-y-0.5 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            }
        >
            {busy ? "Conectando..." : text}
            {!busy && <ChevronRight className="w-5 h-5" />}
        </button>
    );
}
