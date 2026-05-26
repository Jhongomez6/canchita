/**
 * ========================
 * XP TOAST HELPER
 * ========================
 *
 * Helper para mostrar toasts de XP ganado con icon ⚡ ámbar.
 * Usado por handlers del cliente para feedback inmediato en acciones
 * que otorgan XP "puntual" (confirmar, dar kudo, completar review).
 *
 * El XP real se otorga server-side por Cloud Functions — este toast es feedback UI.
 */

import toast from "react-hot-toast";

export function xpToast(amount: number, label?: string) {
    const sign = amount >= 0 ? "+" : "";
    const message = label ? `${label} (${sign}${amount} XP)` : `${sign}${amount} XP`;
    if (amount >= 0) {
        toast.success(`⚡ ${message}`, {
            duration: 2500,
            style: {
                background: "#0d3d26",
                color: "#d1fae5",
                border: "1px solid #34d399",
            },
        });
    } else {
        toast(`⚠️ ${message}`, {
            duration: 2500,
            style: {
                background: "#7c2d12",
                color: "#fed7aa",
                border: "1px solid #f97316",
            },
        });
    }
}
