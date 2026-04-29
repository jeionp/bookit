import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];

  // In emulator mode (FIRESTORE_EMULATOR_HOST set), no credentials are required —
  // the Admin SDK connects to the local emulator using just the project ID.
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    return initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });
  }

  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

function lazyProxy<T extends object>(factory: () => T): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      const instance = factory();
      const value = Reflect.get(instance, prop, instance);
      return typeof value === "function" ? (value as Function).bind(instance) : value;
    },
  });
}

export const adminAuth = lazyProxy(() => getAuth(getAdminApp()));
export const adminDb   = lazyProxy(() => getFirestore(getAdminApp()));
