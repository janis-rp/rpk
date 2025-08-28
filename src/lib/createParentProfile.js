import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

export async function ensureParentProfile(user) {
  if (!user) return;
  const ref = doc(db, 'parent', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;

  const first = user.displayName?.split(' ')?.[0] ?? null;
  const last = user.displayName?.split(' ')?.slice(1).join(' ') || null;

  await setDoc(
    ref,
    {
      firstName: first,
      lastName: last,
      fullName:
        user.displayName ||
        (first || last ? [first, last].filter(Boolean).join(' ') : null),
      email: user.email || null,
      phoneE164: user.phoneNumber || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
