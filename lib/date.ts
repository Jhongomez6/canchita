export function formatDateSpanish(dateStr: string) {
    const date = new Date(dateStr + "T00:00:00");

    const formatted = date.toLocaleDateString("es-CO", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
    });

    // Capitalizar primera letra (día)
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}



export function formatDateShort(dateStr: string): string {
    const date = new Date(dateStr + "T00:00:00");
    const formatted = date.toLocaleDateString("es-CO", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
    });
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins} min`;
    if (mins === 0) return hours === 1 ? "1 hora" : `${hours} horas`;
    return `${hours}h ${mins}m`;
}

export function formatTime12h(timeStr: string) {
    const [hour, minute] = timeStr.split(":").map(Number);
    const date = new Date();
    date.setHours(hour, minute);

    return date.toLocaleTimeString("es-CO", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    }).replace(/\s*[ap]\.\s*m\./i, m => ' ' + m.replace(/[\s.]/g, '').toUpperCase());
}

/**
 * Calcula la hora de fin y la formatea en 12h.
 * Ej: formatEndTime("19:00", 90) → "8:30 p.m."
 */
export function formatEndTime(timeStr: string, durationMinutes: number): string {
    const [hour, minute] = timeStr.split(":").map(Number);
    const date = new Date();
    date.setHours(hour, minute + durationMinutes);

    return date.toLocaleTimeString("es-CO", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    }).replace(/\s*[ap]\.\s*m\./i, m => ' ' + m.replace(/[\s.]/g, '').toUpperCase());
}