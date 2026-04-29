import { initializeApp, getApps } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Prevent re-initializing on hot reload.
// Guard against missing env vars during static build-time rendering (e.g. /_not-found)
// where NEXT_PUBLIC_* vars may not be present in the Vercel Preview environment.
const app = getApps().length
  ? getApps()[0]
  : firebaseConfig.apiKey
  ? initializeApp(firebaseConfig)
  : initializeApp({ ...firebaseConfig, apiKey: "__build_placeholder__" });

export const auth = getAuth(app);
export const db = getFirestore(app);

// Connect to local emulators when NEXT_PUBLIC_USE_EMULATOR=true
// Only runs once — guard against hot-reload double-connect
if (
  process.env.NEXT_PUBLIC_USE_EMULATOR === "true" &&
  typeof window !== "undefined"
) {
  try {
    connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "localhost", 8080);
  } catch {
    // Already connected — safe to ignore on hot reload
  }
}
