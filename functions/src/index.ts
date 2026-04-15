import * as admin from "firebase-admin";

admin.initializeApp();

// 🔔 Exportamos las funciones de recordatorios
export * from "./reminders";

// 💰 Exportamos las funciones de pagos y billetera
export * from "./payments";
export * from "./wallet";
export * from "./codes";
export * from "./cleanup";
