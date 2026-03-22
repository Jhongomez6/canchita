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
 * This hook silently calls getToken() on every mount when the user has push enabled.
 * It ALWAYS writes the fresh token to Firestore (arrayUnion is idempotent) and removes
 * any stale tokens that don't match the new one exactly.
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

        // Always write the fresh token (arrayUnion is idempotent if token already exists)
        const userRef = doc(db, "users", user.uid);
        await updateDoc(userRef, {
          fcmTokens: arrayUnion(newToken),
          lastTokenRefresh: new Date().toISOString(),
          lastTokenDevice: navigator.userAgent.substring(0, 100),
          lastTokenPrefix: newToken.substring(0, 30),
        });

        // Remove any stale tokens that don't match the fresh one exactly
        const oldTokens = profile.fcmTokens || [];
        const staleTokens = oldTokens.filter(t => t !== newToken);
        if (staleTokens.length > 0) {
          await updateDoc(userRef, {
            fcmTokens: arrayRemove(...staleTokens),
          });
          console.log("[TokenRefresh] Removed", staleTokens.length, "stale token(s).");
        }

        console.log("[TokenRefresh] Token refreshed successfully.");
      } catch {
        // Graceful degradation — never break the app for a background refresh
        console.warn("[TokenRefresh] Failed to refresh token (non-fatal).");
      }
    })();
  }, [user, profile]);
}
