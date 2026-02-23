/**
 * Utility to sanitize match codes entered by users.
 * Handles the ".ai" trick used for WhatsApp invitations.
 */
export function sanitizeMatchCode(code: string): string {
    let sanitized = code.trim().toLowerCase();

    // Handle full join links: extract ID from /join/[ID]
    if (sanitized.includes("/join/")) {
        const parts = sanitized.split("/join/");
        sanitized = parts[parts.length - 1];
    }

    return sanitized
        .replace(/^https?:\/\//i, "")
        .replace(/\.(ai|app)$/i, "");
}
