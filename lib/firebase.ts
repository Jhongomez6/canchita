import { initializeApp, getApps } from "firebase/app";
import { getFirestore, initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const isNewApp = getApps().length === 0;
export const app = isNewApp ? initializeApp(firebaseConfig) : getApps()[0];

// initializeFirestore solo se puede llamar una vez por app. Si ya existe (HMR),
// caemos al getFirestore que devuelve la instancia previamente configurada.
export const db = isNewApp
  ? initializeFirestore(app, {
      // Permite enviar objetos con campos `undefined` — Firestore los ignora en lugar
      // de throwear. Crítico para patrones como `phone: value || undefined` en updates.
      ignoreUndefinedProperties: true,
    })
  : getFirestore(app);

export const storage = getStorage(app);
