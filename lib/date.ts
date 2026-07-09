/**
 * "Hoy" en zona horaria de Colombia (America/Bogota, UTC-5 sin horario de verano),
 * independiente de la zona configurada en el dispositivo. Usa el reloj del equipo
 * (ya sincronizado por NTP en la práctica). Formato ISO YYYY-MM-DD.
 */
export function todayColombiaISO(): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date()); // en-CA ⇒ "YYYY-MM-DD"
}

/**
 * "Ayer" en zona horaria de Colombia. Se construye desde el string de hoy
 * (mediodía en -05:00) para evitar shifts de UTC al restar el día.
 */
export function yesterdayColombiaISO(): string {
    const d = new Date(`${todayColombiaISO()}T12:00:00-05:00`);
    d.setDate(d.getDate() - 1);
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(d);
}

export function formatDateSpanish(dateStr: string) {
    if (!dateStr) return "";
    // Si es un ISO completo, tomar solo la fecha
    const baseDate = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr;
    const date = new Date(baseDate + "T00:00:00");

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
    if (!dateStr) return "";
    const baseDate = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr;
    const date = new Date(baseDate + "T00:00:00");
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

// Formato manual para evitar que iOS/Android ignoren `hour12` cuando el SO
// está configurado en formato 24h (bug conocido de toLocaleTimeString).
function build12h(hour: number, minute: number): string {
    const normalizedHour = ((hour % 24) + 24) % 24;
    const normalizedMinute = ((minute % 60) + 60) % 60;
    const suffix = normalizedHour >= 12 ? "PM" : "AM";
    const h12 = normalizedHour % 12 || 12;
    const mm = normalizedMinute.toString().padStart(2, "0");
    return `${h12}:${mm} ${suffix}`;
}

export function formatTime12h(timeStr: string) {
    const [hour, minute] = timeStr.split(":").map(Number);
    return build12h(hour, minute);
}

/**
 * Calcula la hora de fin y la formatea en 12h.
 * Ej: formatEndTime("19:00", 90) → "8:30 PM"
 */
export function formatEndTime(timeStr: string, durationMinutes: number): string {
    const [hour, minute] = timeStr.split(":").map(Number);
    const totalMinutes = hour * 60 + minute + durationMinutes;
    const endHour = Math.floor(totalMinutes / 60);
    const endMinute = totalMinutes % 60;
    return build12h(endHour, endMinute);
}