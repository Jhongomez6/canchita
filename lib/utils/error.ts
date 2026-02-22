import { toast } from "react-hot-toast";

/**
 * Utilidad centralizada para manejar errores en la aplicación.
 * Registra el error en consola con contexto completo y extrae
 * un mensaje amigable para mostrar al usuario mediante un Toast.
 * 
 * @param error - El error atrapado (e.g., en un bloque catch)
 * @param fallbackMessage - Mensaje por defecto si no se puede extraer uno específico
 */
export function handleError(error: unknown, fallbackMessage = "Ha ocurrido un error inesperado") {
    // 1. Log detallado (para developers)
    console.error("[App Error]:", error);

    // 2. Extraer el mensaje amigable
    let displayMessage = fallbackMessage;

    if (error instanceof Error) {
        // Errores conocidos de Firebase o del Dominio
        if (error.message === "MATCH_FULL") {
            displayMessage = "El partido ya está completo.";
        } else if (error.message.includes("permission-denied")) {
            displayMessage = "No tienes permisos para realizar esta acción.";
        } else if (error.message.includes("not-found")) {
            displayMessage = "El recurso solicitado no fue encontrado.";
        } else {
            displayMessage = error.message;
        }
    } else if (typeof error === "string") {
        displayMessage = error;
    }

    // 3. Mostrar Toast al usuario
    toast.error(displayMessage, {
        duration: 4000,
        style: {
            maxWidth: '500px',
        },
    });
}
