import * as admin from "firebase-admin";

admin.initializeApp();

// 🔔 Exportamos las funciones de recordatorios
export * from "./reminders";

// 💰 Exportamos las funciones de pagos y billetera
export * from "./payments";
export * from "./wallet";
export * from "./codes";
export * from "./cleanup";

// 🏟️ Exportamos las funciones de reservas
export * from "./bookings";

// 🚫 Exportamos las funciones de bloqueos (puntuales + recurrentes)
export * from "./blocked-slots";

// ⭐ Post-Match Review: notificaciones, agregación de kudos/reportes y moderación
export * from "./postMatchReview";

// ⚡ Sistema de XP / Niveles: triggers, achievements, backfill
export * from "./xp";
