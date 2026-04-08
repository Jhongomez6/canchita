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

export async function logWaitlistJoined(matchId: string) {
  await trackEvent("waitlist_joined", { match_id: matchId });
}

export async function logAttendanceUnconfirmed(matchId: string) {
  await trackEvent("attendance_unconfirmed", { match_id: matchId });
}

export async function logWaitlistLeft(matchId: string) {
  await trackEvent("waitlist_left", { match_id: matchId });
}

export async function logGuestRemoved(matchId: string) {
  await trackEvent("guest_removed", { match_id: matchId });
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

export async function logMvpVoted(matchId: string, targetUid: string) {
  await trackEvent("mvp_voted", {
    match_id: matchId,
    target_uid: targetUid,
  });
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

export async function logApplyCTAShown() {
  await trackEvent("apply_cta_shown");
}

export async function logApplyCTAClicked() {
  await trackEvent("apply_cta_clicked");
}

export async function logApplyCTADismissed() {
  await trackEvent("apply_cta_dismissed");
}

export async function logPaymentsSaved(matchId: string, paidCount: number) {
  await trackEvent("payments_saved", {
    match_id: matchId,
    paid_count: paidCount.toString(),
  });
}

/* =========================
   P7: FUNNEL TEAM ADMIN (/apply)
========================= */

export async function logApplyPageViewed() {
  await trackEvent("apply_page_viewed");
}

/**
 * Registra que se ha completado un paso del formulario.
 * @param step El paso que SE ACABA DE TERMINAR (1, 2 o 3)
 */
export async function logApplyStepCompleted(step: number) {
  await trackEvent("apply_step_completed", { step: step.toString() });
}

/**
 * Registra que el usuario retrocedió o salió.
 * @param fromStep El paso donde estaba el usuario cuando decidió retroceder.
 */
export async function logApplyBackClicked(fromStep: number) {
  await trackEvent("apply_back_clicked", { step: fromStep.toString() });
}

export async function logApplySubmitted() {
  await trackEvent("apply_submitted");
}

export async function logApplySuccess() {
  await trackEvent("apply_success");
}

export async function logApplyError(error: string) {
  await trackEvent("apply_error", { error_message: error });
}

/* =========================
   P8: INTERACCIONES HOME / EXPLORE
========================= */

export async function logHeroCardClicked(matchId: string, actionType: "confirm" | "details") {
  await trackEvent("hero_card_clicked", { match_id: matchId, action_type: actionType });
}

export async function logQuickStatsDetailedClicked() {
  await trackEvent("quick_stats_detailed_clicked");
}

export async function logFullHistoryClicked() {
  await trackEvent("full_history_clicked");
}

export async function logJoinByCodeClicked(source: "home" | "explore") {
  await trackEvent("join_by_code_clicked", { source });
}

export async function logNotificationsOpened() {
  await trackEvent("notifications_opened");
}

export async function logPWAInstallClicked() {
  await trackEvent("pwa_install_clicked");
}

export async function logFeedbackOpened() {
  await trackEvent("feedback_opened");
}

export async function logTooltipOpened(tooltipName: string) {
  await trackEvent("tooltip_opened", { tooltip_name: tooltipName });
}

export async function logMatchReportCopied(
  match_id: string,
  type: "invitation" | "roster" | "teams" | "summary",
  channel: "clipboard" | "whatsapp" | "telegram"
) {
  await trackEvent("match_report_copied", {
    match_id,
    report_type: type,
    channel: channel,
  });
}

/* =========================
   CAMPAÑAS
========================= */

export async function logCampaignViewed(campaign: string) {
  await trackEvent("campaign_viewed", { campaign });
}

export async function logCampaignCTAClicked(campaign: string) {
  await trackEvent("campaign_cta_clicked", { campaign });
}

export async function logCampaignWhatsappShared(campaign: string) {
  await trackEvent("campaign_whatsapp_shared", { campaign });
}

export async function logCampaignLinkCopied(campaign: string) {
  await trackEvent("campaign_link_copied", { campaign });
}

export async function logCampaignInstagramClicked(campaign: string) {
  await trackEvent("campaign_instagram_clicked", { campaign });
}

export async function logMatchDeleted(matchId: string) {
  await trackEvent("match_deleted", { match_id: matchId });
}

export async function logPushRemindersSent(matchId: string) {
  await trackEvent("push_reminders_sent", { match_id: matchId });
}

export async function logMatchPlayerAdded(
  matchId: string,
  type: "registered" | "manual"
) {
  await trackEvent("match_player_added", {
    match_id: matchId,
    player_type: type,
  });
}

export async function logAttendanceMarked(matchId: string, status: string) {
  await trackEvent("attendance_marked", {
    match_id: matchId,
    status: status,
  });
}

export async function logAttendanceModeOpened(matchId: string) {
  await trackEvent("attendance_mode_opened", { match_id: matchId });
}

export async function logMatchAdminTabSwitched(matchId: string, tab: string) {
  await trackEvent("match_admin_tab_switched", {
    match_id: matchId,
    tab: tab,
  });
}

export async function logMatchSettingUpdated(
  matchId: string,
  setting: string,
  value: string | number | boolean
) {
  await trackEvent("match_setting_updated", {
    match_id: matchId,
    setting: setting,
    value: value.toString(),
  });
}

export async function logMatchInstructionsSaved(matchId: string) {
  await trackEvent("match_instructions_saved", { match_id: matchId });
}

export async function logMatchMapOpened(matchId: string) {
  await trackEvent("match_map_opened", { match_id: matchId });
}

export async function logMatchCodeCopied(matchId: string) {
  await trackEvent("match_code_copied", { match_id: matchId });
}

export async function logMatchMapDirectionClicked(
  matchId: string,
  provider: "google" | "waze"
) {
  await trackEvent("match_map_direction_clicked", {
    match_id: matchId,
    provider: provider,
  });
}
