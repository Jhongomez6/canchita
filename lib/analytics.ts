/**
 * ========================
 * FIREBASE ANALYTICS MODULE
 * ========================
 *
 * Specification-Driven Development (SDD)
 * See: docs/ANALYTICS_FEATURE_SDD.md
 *
 * Módulo central de analytics con inicialización lazy y helpers tipados.
 * Cada función maneja silenciosamente el caso donde analytics no está
 * disponible (SSR, navegador sin soporte, measurementId faltante).
 */

import { app } from "./firebase";
import type { Analytics } from "firebase/analytics";

// Cached analytics instance
let analyticsInstance: Analytics | null = null;
let initPromise: Promise<Analytics | null> | null = null;

// Lazy-loaded firebase/analytics module (keeps it out of the main bundle)
async function loadAnalyticsSDK() {
  return import("firebase/analytics");
}

/**
 * Inicializa Firebase Analytics lazily.
 * Solo funciona en browser y si el navegador soporta analytics.
 * Cachea la instancia para reutilizar en llamadas posteriores.
 */
export async function initAnalytics(): Promise<Analytics | null> {
  if (analyticsInstance) return analyticsInstance;
  if (typeof window === "undefined") return null;
  if (!process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID) return null;

  if (!initPromise) {
    initPromise = loadAnalyticsSDK()
      .then(async ({ getAnalytics, isSupported }) => {
        const supported = await isSupported();
        if (supported) {
          analyticsInstance = getAnalytics(app);
          return analyticsInstance;
        }
        return null;
      })
      .catch(() => null);
  }

  return initPromise;
}

async function getAnalyticsInstance(): Promise<Analytics | null> {
  return analyticsInstance ?? initAnalytics();
}

async function trackEvent(eventName: string, params?: Record<string, string>) {
  const analytics = await getAnalyticsInstance();
  if (!analytics) return;
  const { logEvent } = await loadAnalyticsSDK();
  logEvent(analytics, eventName, params);
}

/* =========================
   IDENTITY & USER PROPERTIES
========================= */

export async function identifyUser(uid: string) {
  const analytics = await getAnalyticsInstance();
  if (!analytics) return;
  const { setUserId } = await loadAnalyticsSDK();
  setUserId(analytics, uid || null);
}

export async function setAnalyticsUserProperties(
  properties: Record<string, string>
) {
  const analytics = await getAnalyticsInstance();
  if (!analytics) return;
  const { setUserProperties } = await loadAnalyticsSDK();
  setUserProperties(analytics, properties);
}

/* =========================
   P1: FUNNEL DE ACTIVACIÓN
========================= */

export async function logUserRegistered() {
  await trackEvent("user_registered");
}

export async function logOnboardingCompleted() {
  await trackEvent("onboarding_completed");
}

export async function logMatchJoined(matchId: string) {
  await trackEvent("match_joined", { match_id: matchId });
}

export async function logAttendanceConfirmed(matchId: string) {
  await trackEvent("attendance_confirmed", { match_id: matchId });
}

/* =========================
   P2: CRECIMIENTO VIRAL
========================= */

export async function logMatchInvitationCopied(matchId: string) {
  await trackEvent("match_invitation_copied", { match_id: matchId });
}

export async function logMatchJoinedViaExplore(matchId: string) {
  await trackEvent("match_joined_via_explore", { match_id: matchId });
}

export async function logGuestAdded(matchId: string) {
  await trackEvent("guest_added", { match_id: matchId });
}

/* =========================
   P3: CICLO DEL ADMIN
========================= */

export async function logMatchCreated(matchId: string) {
  await trackEvent("match_created", { match_id: matchId });
}

export async function logTeamsBalanced(matchId: string) {
  await trackEvent("teams_balanced", { match_id: matchId });
}

export async function logTeamsConfirmed(matchId: string) {
  await trackEvent("teams_confirmed", { match_id: matchId });
}

export async function logMatchClosed(matchId: string) {
  await trackEvent("match_closed", { match_id: matchId });
}

/* =========================
   P4: VALOR DE LA PWA
========================= */

export async function logPWAInstall(outcome: "accepted" | "dismissed") {
  await trackEvent(`pwa_install_${outcome}`);
}

/* =========================
   P5: PUSH Y RETENCIÓN
========================= */

export async function logPushEnabled() {
  await trackEvent("push_enabled");
}

export async function logPushPromptDismissed() {
  await trackEvent("push_prompt_dismissed");
}

/* =========================
   P6: ENGAGEMENT
========================= */

export async function logMvpVoted(matchId: string) {
  await trackEvent("mvp_voted", { match_id: matchId });
}

export async function logStatsViewed() {
  await trackEvent("stats_viewed");
}

export async function logPlayerCardViewed() {
  await trackEvent("player_card_viewed");
}

export async function logOrganizerContacted(matchId: string) {
  await trackEvent("organizer_contacted", { match_id: matchId });
}
