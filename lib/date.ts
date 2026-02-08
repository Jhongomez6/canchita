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



export function formatTime12h(timeStr: string) {
    const [hour, minute] = timeStr.split(":").map(Number);
    const date = new Date();
    date.setHours(hour, minute);

    return date.toLocaleTimeString("es-CO", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    });
}