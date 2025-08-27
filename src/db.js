// src/db.js
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { app } from "./firebase";

export const db = getFirestore(app);

// Izveido user dokumentu, ja neeksistē (default "parent")
export async function ensureUserDoc(user, defaults = {}) {
  if (!user) return;
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      role: "parent",
      email: user.email || null,
      displayName: user.displayName || null,
      phone: "",
      phoneVerified: false,         // ⬅️ jauns
      address: "",
      personalCode: "",
      createdAt: serverTimestamp(),
      groupIds: [],
      ...defaults,
    });
  }
}
