/**
 * Utility to sanitize match codes entered by users.
 * Handles the ".ai" trick used for WhatsApp invitations.
 *
 * Supported inputs:
 *  - Plain code: "ABC123"
 *  - WhatsApp trick: "ABC123.ai" / "ABC123.app"
 *  - Full URL: "https://la-canchita.vercel.app/join/ABC123"
 *  - URL + suffix: "https://…/join/ABC123.ai?ref=wa"
 */
export function sanitizeMatchCode(code: string): string {
    let sanitized = code.trim();

    // Handle full join links: extract ID from /join/[ID] (case-insensitive search)
    const joinIdx = sanitized.toLowerCase().lastIndexOf("/join/");
    if (joinIdx !== -1) {
        sanitized = sanitized.substring(joinIdx + "/join/".length);
    }

    return sanitized
        .replace(/^https?:\/\//i, "")  // Strip protocol
        .replace(/[?#].*$/, "")         // Strip query params and hash
        .replace(/\/+$/, "")            // Strip trailing slashes
        .replace(/\.(ai|app)$/i, "");   // Strip .ai / .app suffix
}
