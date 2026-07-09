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

async function trackEvent(eventName: string, params?: Record<string, string | number>) {
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

export async function logLocationAdminSignupStarted() {
  await trackEvent("location_admin_signup_started");
}

export async function logLocationAdminSignupCompleted() {
  await trackEvent("location_admin_signup_completed");
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

export async function logTeamColorChanged(matchId: string, team: "A" | "B", color: string) {
  await trackEvent("team_color_changed", { match_id: matchId, team, color });
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

export async function logMatchCreateBlocked(matchId: string, daysStale: number) {
  await trackEvent("match_create_blocked", { match_id: matchId, days_stale: daysStale });
}

export async function logTeamsBalanced(
  matchId: string,
  quality?: { levelDiff: number; positionImbalance: number; candidatesEvaluated: number },
) {
  await trackEvent("teams_balanced", {
    match_id: matchId,
    ...(quality && {
      level_diff: quality.levelDiff,
      position_imbalance: quality.positionImbalance,
      candidates_evaluated: quality.candidatesEvaluated,
    }),
  });
}

export async function logTeamsConfirmed(matchId: string) {
  await trackEvent("teams_confirmed", { match_id: matchId });
}

export async function logMatchClosed(matchId: string) {
  await trackEvent("match_closed", { match_id: matchId });
}

/* =========================
   ANALYTICS — MODO MULTI-EQUIPO (round-robin)
========================= */

export async function logMultiTeamEnabled(matchId: string, confirmedCount: number) {
  await trackEvent("multi_team_enabled", { match_id: matchId, confirmed_count: confirmedCount });
}

export async function logMultiTeamsBalanced(
  matchId: string,
  numTeams: number,
  playersCount: number,
  qualityCost?: number,
) {
  await trackEvent("multi_teams_balanced", {
    match_id: matchId,
    num_teams: numTeams,
    players_count: playersCount,
    ...(qualityCost != null && { quality_cost: qualityCost }),
  });
}

export async function logMultiTeamsConfirmed(matchId: string, numTeams: number, numFixtures: number) {
  await trackEvent("multi_teams_confirmed", {
    match_id: matchId,
    num_teams: numTeams,
    num_fixtures: numFixtures,
  });
}

export async function logFixtureScoreSaved(matchId: string, fixtureId: string, isFirstEdit: boolean) {
  await trackEvent("fixture_score_saved", {
    match_id: matchId,
    fixture_id: fixtureId,
    is_first_edit: isFirstEdit ? 1 : 0,
  });
}

export async function logMultiTeamMatchClosed(matchId: string, numTeams: number, championTeamId: string) {
  await trackEvent("multi_team_match_closed", {
    match_id: matchId,
    num_teams: numTeams,
    champion_team_id: championTeamId,
  });
}

export async function logTeamBalanceFeedback(matchId: string, value: "up" | "down" | null) {
  await trackEvent("team_balance_feedback", {
    match_id: matchId,
    value: value ?? "cleared",
  });
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

/* =========================
   PERFORMANCE / CARGA DE DATOS
   (ver docs/IOS_PWA_HOME_STALE_LOADING_SDD.md)
========================= */

export async function logQueryTimeout(p: {
  source: string;
  fromVisibility: boolean;
  hadCache: boolean;
}) {
  await trackEvent("query_timeout", {
    source: p.source,
    from_visibility: p.fromVisibility ? "true" : "false",
    had_cache: p.hadCache ? "true" : "false",
  });
}

export async function logQueryError(p: {
  source: string;
  fromVisibility: boolean;
  hadCache: boolean;
  errorCode: string;
}) {
  await trackEvent("query_error", {
    source: p.source,
    from_visibility: p.fromVisibility ? "true" : "false",
    had_cache: p.hadCache ? "true" : "false",
    error_code: p.errorCode,
  });
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

/* =========================
   BOOKING / VENUES
========================= */

export async function logVenueViewed(venueId: string, venueName: string, source: "explore" | "direct_link") {
  await trackEvent("venue_viewed", { venue_id: venueId, venue_name: venueName, source });
}

export async function logBookingFormatSelected(venueId: string, format: string) {
  await trackEvent("booking_format_selected", { venue_id: venueId, format });
}

export async function logBookingSlotSelected(venueId: string, format: string, date: string, startTime: string) {
  await trackEvent("booking_slot_selected", { venue_id: venueId, format, date, start_time: startTime });
}

export async function logBookingConfirmed(params: {
  venueId: string;
  bookingId: string;
  format: string;
  date: string;
  startTime: string;
  amountCOP: number;
  paymentMethod: string;
  tierApplied?: boolean;
  tierType?: "percent" | "flat";
  tierMinMinutes?: number;
  tierDiscountCOP?: number;
}) {
  await trackEvent("booking_confirmed", {
    venue_id: params.venueId,
    booking_id: params.bookingId,
    format: params.format,
    date: params.date,
    start_time: params.startTime,
    amount_cop: params.amountCOP.toString(),
    payment_method: params.paymentMethod,
    ...(params.tierApplied !== undefined && { tier_applied: params.tierApplied.toString() }),
    ...(params.tierType && { tier_type: params.tierType }),
    ...(params.tierMinMinutes !== undefined && { tier_min_minutes: params.tierMinMinutes.toString() }),
    ...(params.tierDiscountCOP !== undefined && { tier_discount_cop: params.tierDiscountCOP.toString() }),
  });
}

export async function logVenueFormatTierAdded(params: {
  venueId: string;
  formatId: string;
  minMinutes: number;
  tierType: "percent" | "flat";
  value: number;
}) {
  await trackEvent("venue_format_tier_added", {
    venue_id: params.venueId,
    format_id: params.formatId,
    min_minutes: params.minMinutes.toString(),
    tier_type: params.tierType,
    value: params.value.toString(),
  });
}

export async function logVenueFormatTierRemoved(params: {
  venueId: string;
  formatId: string;
  minMinutes: number;
  tierType: "percent" | "flat";
  value: number;
}) {
  await trackEvent("venue_format_tier_removed", {
    venue_id: params.venueId,
    format_id: params.formatId,
    min_minutes: params.minMinutes.toString(),
    tier_type: params.tierType,
    value: params.value.toString(),
  });
}

export async function logBookingCancelled(params: {
  venueId: string;
  bookingId: string;
  refunded: boolean;
  hoursBeforeStart: number;
  actorRole?: "player" | "admin";
  reasonLength?: number;
}) {
  await trackEvent("booking_cancelled", {
    venue_id: params.venueId,
    booking_id: params.bookingId,
    refunded: params.refunded.toString(),
    hours_before_start: params.hoursBeforeStart.toString(),
    actor_role: params.actorRole ?? "player",
    reason_length: (params.reasonLength ?? 0).toString(),
  });
}

export async function logBookingCancellationStarted(params: {
  venueId: string;
  bookingId: string;
  actorRole: "player" | "admin";
}) {
  await trackEvent("booking_cancellation_started", {
    venue_id: params.venueId,
    booking_id: params.bookingId,
    actor_role: params.actorRole,
  });
}

export async function logBlockedSlotDeleted(params: {
  venueId: string;
  blockedSlotId: string;
  mode: "oneoff" | "instance" | "recurrence";
  isRecurring: boolean;
}) {
  await trackEvent("blocked_slot_deleted", {
    venue_id: params.venueId,
    blocked_slot_id: params.blockedSlotId,
    mode: params.mode,
    is_recurring: params.isRecurring.toString(),
  });
}

export async function logBookingRechargePrompted(venueId: string, amountRequired: number, currentBalance: number, deficit: number) {
  await trackEvent("booking_recharge_prompted", {
    venue_id: venueId,
    amount_required: amountRequired.toString(),
    current_balance: currentBalance.toString(),
    deficit: deficit.toString(),
  });
}

export async function logVenueAdminCourtConfigured(venueId: string, courtsCount: number, combosCount: number) {
  await trackEvent("venue_admin_court_configured", {
    venue_id: venueId,
    courts_count: courtsCount.toString(),
    combos_count: combosCount.toString(),
  });
}

export async function logVenueAdminScheduleUpdated(venueId: string, dayOfWeek: string, slotsCount: number) {
  await trackEvent("venue_admin_schedule_updated", {
    venue_id: venueId,
    day_of_week: dayOfWeek,
    slots_count: slotsCount.toString(),
  });
}

export async function logBlockedSlotCreated(
  venueId: string,
  params: {
    isRecurring: boolean;
    recurrenceType?: string;
    hasEndDate: boolean;
    hasClientName: boolean;
    hasPhone: boolean;
    priceCOP: number;
    priceCalculable: boolean;
    courtsCount: number;
    isBirthday: boolean;
  },
) {
  await trackEvent("blocked_slot_created", {
    venue_id: venueId,
    is_recurring: params.isRecurring.toString(),
    recurrence_type: params.recurrenceType ?? "none",
    has_end_date: params.hasEndDate.toString(),
    has_client_name: params.hasClientName.toString(),
    has_phone: params.hasPhone.toString(),
    price_cop: String(params.priceCOP),
    price_calculable: params.priceCalculable.toString(),
    courts_count: params.courtsCount.toString(),
    is_birthday: params.isBirthday.toString(),
  });
}

export async function logManualReservationBirthdayToggled(params: {
  venueId: string;
  slotId: string;
  from: boolean;
  to: boolean;
}) {
  await trackEvent("manual_reservation_birthday_toggled", {
    venue_id: params.venueId,
    slot_id: params.slotId,
    from: params.from.toString(),
    to: params.to.toString(),
  });
}

export async function logManualReservationStatusChanged(params: {
  venueId: string;
  slotId: string;
  fromStatus: string;
  toStatus: string;
  via: "quick" | "popover";
}) {
  await trackEvent("manual_reservation_status_changed", {
    venue_id: params.venueId,
    slot_id: params.slotId,
    from_status: params.fromStatus,
    to_status: params.toStatus,
    via: params.via,
  });
}

export async function logLocationAdminSubroleSet(params: {
  targetUid: string;
  subrole: "owner" | "staff";
  actorUid: string;
}) {
  await trackEvent("location_admin_subrole_set", {
    target_uid: params.targetUid,
    subrole: params.subrole,
    actor_uid: params.actorUid,
  });
}

export async function logManualReservationQuickDeleteOpened(params: {
  venueId: string;
  slotId: string;
  wasRecurring: boolean;
}) {
  await trackEvent("manual_reservation_quick_delete_opened", {
    venue_id: params.venueId,
    slot_id: params.slotId,
    was_recurring: params.wasRecurring.toString(),
  });
}

export async function logManualReservationCancelled(params: {
  venueId: string;
  slotId: string;
  hadReason: boolean;
  scope: "non_recurring" | "single" | "future" | "all";
  wasRecurring: boolean;
}) {
  await trackEvent("manual_reservation_cancelled", {
    venue_id: params.venueId,
    slot_id: params.slotId,
    had_reason: params.hadReason.toString(),
    scope: params.scope,
    was_recurring: params.wasRecurring.toString(),
  });
}

export async function logManualReservationPaymentRegistered(params: {
  venueId: string;
  slotId: string;
  date: string;
  cashCOP: number;
  transferCOP: number;
  totalCOP: number;
  priceCOP: number;
  diffCOP: number;
  isRecurringInstance: boolean;
}) {
  await trackEvent("manual_reservation_payment_registered", {
    venue_id: params.venueId,
    slot_id: params.slotId,
    date: params.date,
    cash_cop: String(params.cashCOP),
    transfer_cop: String(params.transferCOP),
    total_cop: String(params.totalCOP),
    price_cop: String(params.priceCOP),
    diff_cop: String(params.diffCOP),
    is_recurring_instance: params.isRecurringInstance.toString(),
  });
}

export async function logManualReservationPaymentEdited(params: {
  venueId: string;
  paymentId: string;
  previousCashCOP: number;
  newCashCOP: number;
  previousTransferCOP: number;
  newTransferCOP: number;
  totalCOP: number;
}) {
  await trackEvent("manual_reservation_payment_edited", {
    venue_id: params.venueId,
    payment_id: params.paymentId,
    previous_cash_cop: String(params.previousCashCOP),
    new_cash_cop: String(params.newCashCOP),
    previous_transfer_cop: String(params.previousTransferCOP),
    new_transfer_cop: String(params.newTransferCOP),
    total_cop: String(params.totalCOP),
  });
}

export async function logManualReservationPaymentDeleted(params: {
  venueId: string;
  paymentId: string;
  slotId: string;
  cashCOP: number;
  transferCOP: number;
  totalCOP: number;
}) {
  await trackEvent("manual_reservation_payment_deleted", {
    venue_id: params.venueId,
    payment_id: params.paymentId,
    slot_id: params.slotId,
    cash_cop: String(params.cashCOP),
    transfer_cop: String(params.transferCOP),
    total_cop: String(params.totalCOP),
  });
}

export async function logDailyBalanceViewed(params: {
  venueId: string;
  date: string;
  paymentsCount: number;
  cashCOP: number;
  transferCOP: number;
  totalCOP: number;
}) {
  await trackEvent("daily_balance_viewed", {
    venue_id: params.venueId,
    date: params.date,
    payments_count: params.paymentsCount.toString(),
    cash_cop: String(params.cashCOP),
    transfer_cop: String(params.transferCOP),
    total_cop: String(params.totalCOP),
  });
}

export async function logDailyBalanceDateChanged(params: {
  venueId: string;
  previousDate: string;
  newDate: string;
}) {
  await trackEvent("daily_balance_date_changed", {
    venue_id: params.venueId,
    previous_date: params.previousDate,
    new_date: params.newDate,
  });
}

// ========================
// Venue Analytics Dashboard
// Ref: docs/VENUE_ANALYTICS_DASHBOARD_SDD.md — sin PII (nunca clientName/phone).
// ========================

export async function logVenueAnalyticsViewed(params: {
  venueId: string;
  periodPreset: string;
  rangeDays: number;
  totalRevenueCOP: number;
  occupancyPct: number;
  reservationsCount: number;
  noShowRate: number;
}) {
  await trackEvent("venue_analytics_viewed", {
    venue_id: params.venueId,
    period_preset: params.periodPreset,
    range_days: String(params.rangeDays),
    total_revenue_cop: String(params.totalRevenueCOP),
    occupancy_pct: String(Math.round(params.occupancyPct * 100)),
    reservations_count: String(params.reservationsCount),
    no_show_rate: String(Math.round(params.noShowRate * 100)),
  });
}

export async function logVenueAnalyticsPeriodChanged(params: {
  venueId: string;
  previousPreset: string;
  newPreset: string;
  rangeDays: number;
}) {
  await trackEvent("venue_analytics_period_changed", {
    venue_id: params.venueId,
    previous_preset: params.previousPreset,
    new_preset: params.newPreset,
    range_days: String(params.rangeDays),
  });
}

export async function logVenueAnalyticsHeatmapCellTapped(params: {
  venueId: string;
  dayOfWeek: number;
  hour: number;
  occupancyPct: number;
}) {
  await trackEvent("venue_analytics_heatmap_cell_tapped", {
    venue_id: params.venueId,
    day_of_week: String(params.dayOfWeek),
    hour: String(params.hour),
    occupancy_pct: String(Math.round(params.occupancyPct * 100)),
  });
}

export async function logBlockedSlotRecurrenceExceptionAdded(
  venueId: string,
  blockedSlotId: string,
  exceptDate: string,
) {
  await trackEvent("blocked_slot_recurrence_exception_added", {
    venue_id: venueId,
    blocked_slot_id: blockedSlotId,
    except_date: exceptDate,
  });
}

export async function logBlockedSlotRecurrenceDeleted(
  venueId: string,
  blockedSlotId: string,
) {
  await trackEvent("blocked_slot_recurrence_deleted", {
    venue_id: venueId,
    blocked_slot_id: blockedSlotId,
  });
}

export async function logBlockedSlotConflictsShown(venueId: string, conflictsCount: number) {
  await trackEvent("blocked_slot_conflicts_shown", {
    venue_id: venueId,
    conflicts_count: conflictsCount.toString(),
  });
}

export async function logAdminHourDetailOpened(params: {
  venueId: string;
  date: string;
  startTime: string;
  endTime: string;
  bookingsCount: number;
  blocksCount: number;
}) {
  await trackEvent("admin_hour_detail_opened", {
    venue_id: params.venueId,
    date: params.date,
    start_time: params.startTime,
    end_time: params.endTime,
    bookings_count: String(params.bookingsCount),
    blocks_count: String(params.blocksCount),
  });
}

export async function logAdminHourDetailCreateClicked(params: {
  venueId: string;
  date: string;
  startTime: string;
  endTime: string;
  hadOverlaps: boolean;
}) {
  await trackEvent("admin_hour_detail_create_clicked", {
    venue_id: params.venueId,
    date: params.date,
    start_time: params.startTime,
    end_time: params.endTime,
    had_overlaps: String(params.hadOverlaps),
  });
}

export async function logBlockedSlotConflictsForced(venueId: string, conflictsCount: number) {
  await trackEvent("blocked_slot_conflicts_forced", {
    venue_id: venueId,
    conflicts_count: conflictsCount.toString(),
  });
}

/* =========================
   POST-MATCH REVIEW (P2/P3)
========================= */

export async function logPostMatchReviewCardShown(matchId: string) {
  await trackEvent("post_match_review_card_shown", { match_id: matchId });
}

export async function logPostMatchReviewCardDismissed(matchId: string) {
  await trackEvent("post_match_review_card_dismissed", { match_id: matchId });
}

export async function logPostMatchReviewStarted(
  matchId: string,
  source: "home_card" | "in_app_notif" | "direct",
) {
  await trackEvent("post_match_review_started", { match_id: matchId, source });
}

export async function logPostMatchReviewSubmitted(params: {
  matchId: string;
  rating: number;
  kudosGivenCount: number;
  reportsGivenCount: number;
  hasComment: boolean;
}) {
  await trackEvent("post_match_review_submitted", {
    match_id: params.matchId,
    rating: params.rating.toString(),
    kudos_given_count: params.kudosGivenCount.toString(),
    reports_given_count: params.reportsGivenCount.toString(),
    has_comment: params.hasComment.toString(),
  });
}

export async function logPostMatchReviewAbandoned(matchId: string) {
  await trackEvent("post_match_review_abandoned", { match_id: matchId });
}

export async function logKudoGiven(matchId: string, kudoType: string) {
  await trackEvent("kudo_given", { match_id: matchId, kudo_type: kudoType });
}

export async function logReportSubmitted(matchId: string, reason: string) {
  await trackEvent("report_submitted", { match_id: matchId, reason });
}

export async function logAdminReportActioned(
  reportId: string,
  action: "dismiss" | "warning" | "suspension",
) {
  await trackEvent("admin_report_actioned", { report_id: reportId, action });
}

/* =========================
   XP / LEVELS (gamification)
========================= */

export async function logXpAwarded(params: {
  source: string;
  amount: number;
  newTotalXp: number;
  level: number;
}) {
  await trackEvent("xp_awarded", {
    source: params.source,
    amount: params.amount.toString(),
    new_total_xp: params.newTotalXp.toString(),
    level: params.level.toString(),
  });
}

export async function logXpLevelUp(fromLevel: number, toLevel: number, tier: string) {
  await trackEvent("xp_level_up", {
    from_level: fromLevel.toString(),
    to_level: toLevel.toString(),
    tier,
  });
}

export async function logXpTierUp(fromTier: string, toTier: string, level: number) {
  await trackEvent("xp_tier_up", {
    from_tier: fromTier,
    to_tier: toTier,
    level: level.toString(),
  });
}

export async function logXpAchievementUnlocked(achievementId: string, xpBonus: number) {
  await trackEvent("xp_achievement_unlocked", {
    achievement_id: achievementId,
    xp_bonus: xpBonus.toString(),
  });
}

export async function logXpHistoryViewed() {
  await trackEvent("xp_history_viewed");
}

export async function logXpOnboardingShown(currentTier: string, currentLevel: number) {
  await trackEvent("xp_onboarding_shown", {
    current_tier: currentTier,
    current_level: currentLevel.toString(),
  });
}

export async function logXpOnboardingCompleted(timeSpentSeconds: number) {
  await trackEvent("xp_onboarding_completed", {
    time_spent_seconds: timeSpentSeconds.toString(),
  });
}

export async function logXpOnboardingReopened() {
  await trackEvent("xp_onboarding_reopened");
}

export async function logXpModalDismissed(
  type: "level" | "tier" | "achievement",
  dismissMethod: "cta" | "tap_outside" | "esc" | "auto",
) {
  await trackEvent("xp_modal_dismissed", {
    type,
    dismiss_method: dismissMethod,
  });
}

// ============================================================================
// Reservas con pago externo (RESERVAS_PAGO_EXTERNO_SDD)
// ============================================================================

export async function logBookingPendingCreated(params: {
  venueId: string;
  bookingId: string;
  format: string;
  depositCOP: number;
  ttlHours: number;
}) {
  await trackEvent("booking_pending_created", {
    venue_id: params.venueId,
    booking_id: params.bookingId,
    format: params.format,
    deposit_cop: params.depositCOP.toString(),
    ttl_hours: params.ttlHours.toString(),
  });
}

export async function logPaymentProofUploaded(params: {
  venueId: string;
  bookingId: string;
  fileSizeKB: number;
  attemptNumber: number;
}) {
  await trackEvent("payment_proof_uploaded", {
    venue_id: params.venueId,
    booking_id: params.bookingId,
    file_size_kb: params.fileSizeKB.toString(),
    attempt_number: params.attemptNumber.toString(),
  });
}

export async function logPaymentProofUploadFailed(params: {
  venueId: string;
  bookingId: string;
  reason: string;
}) {
  await trackEvent("payment_proof_upload_failed", {
    venue_id: params.venueId,
    booking_id: params.bookingId,
    reason: params.reason,
  });
}

export async function logWhatsAppNotifyTapped(params: {
  venueId: string;
  bookingId: string;
}) {
  await trackEvent("whatsapp_notify_tapped", {
    venue_id: params.venueId,
    booking_id: params.bookingId,
  });
}

export async function logBookingDepositApproved(params: {
  venueId: string;
  bookingId: string;
  timeToApproveMinutes: number;
}) {
  await trackEvent("booking_deposit_approved", {
    venue_id: params.venueId,
    booking_id: params.bookingId,
    time_to_approve_minutes: params.timeToApproveMinutes.toString(),
  });
}

export async function logBookingAttendanceConfirmed(params: {
  venueId: string;
  bookingId: string;
}) {
  await trackEvent("booking_attendance_confirmed", {
    venue_id: params.venueId,
    booking_id: params.bookingId,
  });
}

export async function logBookingProofRejected(params: {
  venueId: string;
  bookingId: string;
  attemptNumber: number;
}) {
  await trackEvent("booking_proof_rejected", {
    venue_id: params.venueId,
    booking_id: params.bookingId,
    attempt_number: params.attemptNumber.toString(),
  });
}

export async function logBookingStatusAdvanced(params: {
  venueId: string;
  bookingId: string;
  fromStatus: string;
  toStatus: string;
}) {
  await trackEvent("booking_status_advanced", {
    venue_id: params.venueId,
    booking_id: params.bookingId,
    from_status: params.fromStatus,
    to_status: params.toStatus,
  });
}

export async function logVenuePaymentMethodsUpdated(params: {
  venueId: string;
  methodsCount: number;
  hasQR: boolean;
}) {
  await trackEvent("venue_payment_methods_updated", {
    venue_id: params.venueId,
    methods_count: params.methodsCount.toString(),
    has_qr: params.hasQR.toString(),
  });
}

export async function logVenuePendingTTLUpdated(params: {
  venueId: string;
  oldHours: number;
  newHours: number;
}) {
  await trackEvent("venue_pending_ttl_updated", {
    venue_id: params.venueId,
    old_hours: params.oldHours.toString(),
    new_hours: params.newHours.toString(),
  });
}

/* =========================
   🌍 POLLA MUNDIALISTA 2026
   Ref: docs/POLLA_MUNDIALISTA_SDD.md
========================= */

export async function logWorldCupPollOpened() {
  await trackEvent("worldcup_poll_opened");
}

export async function logWorldCupPredictionSaved(matchId: string, homeGoals: number, awayGoals: number) {
  await trackEvent("worldcup_prediction_saved", {
    match_id: matchId,
    home_goals: homeGoals.toString(),
    away_goals: awayGoals.toString(),
  });
}

export async function logWorldCupOthersViewed(matchId: string) {
  await trackEvent("worldcup_others_viewed", { match_id: matchId });
}

export async function logWorldCupLeaderboardViewed(userPosition: number) {
  await trackEvent("worldcup_leaderboard_viewed", { user_position: userPosition.toString() });
}
