import { initializeApp } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserSessionPersistence,
  GoogleAuthProvider,
  FacebookAuthProvider,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyACV7R3NlNhCSoHoPwuPu1lRiSu1_L3IqM",
  authDomain: "rpklientiem.firebaseapp.com",
  projectId: "rpklientiem",
  storageBucket: "rpklientiem.firebasestorage.app",
  messagingSenderId: "1087370626129",
  appId: "1:1087370626129:web:ba3e29761b7ad77ebda470",
  measurementId: "G-20WQLL2F2W",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
setPersistence(auth, browserSessionPersistence).catch(() => {});
export const googleProvider = new GoogleAuthProvider();
export const facebookProvider = new FacebookAuthProvider();

// analytics lazy
export let analytics = null;
if (typeof window !== "undefined") {
  import("firebase/analytics").then(({ getAnalytics, isSupported }) => {
    isSupported().then((ok) => { if (ok) analytics = getAnalytics(app); });
  });
}
