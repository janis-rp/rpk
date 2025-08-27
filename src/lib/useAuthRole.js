import { useEffect, useState } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, getIdTokenResult } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export function useAuthRole() {
  const [state, setState] = useState({
    loading: true,
    user: null,
    isAuthed: false,
    isAdminOrManager: false,
    reason: 'init',
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState({
          loading: false,
          user: null,
          isAuthed: false,
          isAdminOrManager: false,
          reason: 'no-user',
        });
        return;
      }

      try {
        // 1) Custom claims
        const token = await getIdTokenResult(user, /* forceRefresh */ true);
        const isAdminClaim = token?.claims?.admin === true;

        // 2) users/{uid}.role
        let roleDocRole = null;
        try {
          const dref = doc(db, 'users', user.uid);
          const snap = await getDoc(dref);
          roleDocRole = snap.exists() ? snap.data().role || null : null;
        } catch (_) {}

        const isAdminOrManager =
          isAdminClaim || roleDocRole === 'admin' || roleDocRole === 'manager';

        setState({
          loading: false,
          user,
          isAuthed: true,
          isAdminOrManager,
          reason: isAdminOrManager ? 'ok' : 'not-admin',
        });
      } catch (e) {
        setState({
          loading: false,
          user,
          isAuthed: true,
          isAdminOrManager: false,
          reason: 'error',
        });
      }
    });

    return () => unsub();
  }, []);

  return state; // {loading, user, isAuthed, isAdminOrManager, reason}
}
