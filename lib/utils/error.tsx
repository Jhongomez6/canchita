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

    // 2. Extraer el mensaje amigable y detalles técnicos
    let displayMessage = fallbackMessage;
    let technicalDetails = "";

    if (error instanceof Error) {
        if (error.message === "MATCH_FULL") {
            displayMessage = "El partido ya está completo.";
        } else if (error.message.includes("permission-denied")) {
            displayMessage = "No tienes permisos para realizar esta acción.";
        } else if (error.message.includes("not-found")) {
            displayMessage = "El recurso solicitado no fue encontrado.";
        } else {
            displayMessage = error.message;
        }
        technicalDetails = `${error.name}: ${error.message}\n${error.stack || ''}`;
    } else if (typeof error === "string") {
        displayMessage = error;
        technicalDetails = error;
    } else {
        try {
            technicalDetails = JSON.stringify(error, null, 2);
        } catch {
            technicalDetails = "No details available";
        }
    }

    // 3. Función para copiar los detalles técnicos
    const handleCopyDetails = () => {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(technicalDetails)
                .then(() => toast.success("¡Detalles copiados al portapapeles!"))
                .catch(() => toast.error("No se pudo copiar el error."));
        } else {
            // Fallback para entornos sin soporte de Clipboard API
            const textArea = document.createElement("textarea");
            textArea.value = technicalDetails;
            textArea.style.position = "fixed";
            textArea.style.left = "-999999px";
            textArea.style.top = "-999999px";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                document.execCommand('copy');
                toast.success("¡Detalles copiados al portapapeles!");
            } catch (err) {
                console.error("Fallback: Ops, unable to copy", err);
                toast.error("No se pudo copiar el error.");
            }
            document.body.removeChild(textArea);
        }
        // Ocultar el toast original si el usuario ya copió los detalles
        toast.dismiss(toastId);
    };

    // 4. Mostrar Toast customizado al usuario
    const toastId = toast.custom((t) => (
        <div
            className={`${t.visible ? 'animate-enter' : 'animate-leave'
                } max-w-md w-full bg-white shadow-xl rounded-2xl pointer-events-auto flex ring-1 ring-black ring-opacity-5 overflow-hidden`}
        >
            <div className="p-4 flex-1">
                <div className="flex items-start">
                    <div className="flex-shrink-0 pt-0.5">
                        <span className="text-xl">⚠️</span>
                    </div>
                    <div className="ml-3 flex-1">
                        <p className="text-sm font-bold text-slate-800">
                            Error
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                            {displayMessage}
                        </p>
                        {/* Botón de copia expuesto como utilidad de PWA/Móvil */}
                        <button
                            onClick={handleCopyDetails}
                            className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition-colors"
                        >
                            <span>📋</span> Copiar detalles técnicos
                        </button>
                    </div>
                </div>
            </div>
            <div className="flex border-l border-slate-100">
                <button
                    onClick={() => toast.dismiss(t.id)}
                    className="w-full border border-transparent rounded-none rounded-r-2xl p-4 flex items-center justify-center text-sm font-medium text-[#1f7a4f] hover:text-[#16603c] focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]"
                >
                    Cerrar
                </button>
            </div>
        </div>
    ), {
        duration: 6000,
        position: "top-center"
    });
}
