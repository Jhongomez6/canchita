import { useEffect, useRef } from "react";
import { User } from "firebase/auth";
import { getMessaging, getToken } from "firebase/messaging";
import { doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db, app } from "../firebase";
import { getSwRegistration } from "../firebase-messaging";
import type { UserProfile } from "../domain/user";

/**
 * Auto-refreshes the FCM token on every app load.
 *
 * FCM tokens rotate automatically (Google-controlled). Without periodic refresh,
 * stored tokens become stale → Cloud Functions send to dead tokens → they get cleaned up
 * → user ends up with 0 tokens → push stops forever.
 *
 * This hook silently calls getToken() on every mount when the user has push enabled,
 * compares with the stored token prefix, and updates Firestore if it changed.
 */
export function useTokenRefresh(user: User | null, profile: UserProfile | null) {
  const hasRefreshed = useRef(false);

  useEffect(() => {
    if (!user || !profile) return;
    if (hasRefreshed.current) return;

    // Only refresh if user previously opted in
    if (!profile.notificationsEnabled) return;

    // Only refresh if browser permission is still granted
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    hasRefreshed.current = true;

    (async () => {
      try {
        const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
        if (!vapidKey) return;

        const messaging = getMessaging(app);
        const swRegistration = await getSwRegistration();

        const newToken = await getToken(messaging, {
          vapidKey,
          serviceWorkerRegistration: swRegistration || undefined,
        });

        if (!newToken) return;

        const newPrefix = newToken.substring(0, 30);
        const storedPrefix = profile.lastTokenPrefix || "";

        // Token hasn't changed — nothing to do
        if (newPrefix === storedPrefix) return;

        // Token changed — swap old for new in Firestore
        const userRef = doc(db, "users", user.uid);
        const updates: Record<string, unknown> = {
          fcmTokens: arrayUnion(newToken),
          lastTokenRefresh: new Date().toISOString(),
          lastTokenDevice: navigator.userAgent.substring(0, 100),
          lastTokenPrefix: newPrefix,
        };

        // Remove old token if we know it
        const oldTokens = profile.fcmTokens || [];
        if (oldTokens.length > 0) {
          // Find stale tokens (any token that doesn't match the new one)
          const staleTokens = oldTokens.filter(t => t.substring(0, 30) !== newPrefix);
          if (staleTokens.length > 0) {
            // We need two separate updates: arrayUnion + arrayRemove can't be combined atomically
            // First add the new token, then remove stale ones
            await updateDoc(userRef, updates);
            await updateDoc(userRef, {
              fcmTokens: arrayRemove(...staleTokens),
            });
            console.log("[TokenRefresh] Token rotated. Removed", staleTokens.length, "stale token(s).");
            return;
          }
        }

        await updateDoc(userRef, updates);
        console.log("[TokenRefresh] Token refreshed.");
      } catch {
        // Graceful degradation — never break the app for a background refresh
        console.warn("[TokenRefresh] Failed to refresh token (non-fatal).");
      }
    })();
  }, [user, profile]);
}
