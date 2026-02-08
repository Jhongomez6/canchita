import * as admin from "firebase-admin";

admin.initializeApp();

// 🔔 Exportamos las funciones de recordatorios
export * from "./reminders";
