/**
 * Utility to sanitize match codes entered by users.
 * Handles the ".app" trick used for WhatsApp invitations.
 */
export function sanitizeMatchCode(code: string): string {
    return code.trim().toLowerCase().replace(/\.app$/i, "");
}
