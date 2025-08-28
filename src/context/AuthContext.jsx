// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  getIdTokenResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { ensureParentProfile } from '../lib/createParentProfile';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [claims, setClaims] = useState(null);
  const [loading, setLoading] = useState(true); // svarīgi pret “tukšo lapu”

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      try {
        if (!u) {
          setUser(null);
          setClaims(null);
          return;
        }
        setUser(u);
        const unsub = onAuthStateChanged(auth, async (u) => {
          try {
            if (!u) {
              setUser(null);
              setClaims(null);
              return;
            }
            setUser(u);
            try {
              await ensureParentProfile(u);
            } catch (e) {
              console.warn('ensureParentProfile:', e);
            }
            const token = await getIdTokenResult(u, true);
            setClaims(token.claims || {});
          } catch (e) {
            console.error('Auth error:', e);
          } finally {
            setLoading(false);
          }
        });

        // 🔑 kritiski pēc DB migrācijas: izveido profilu, ja nav
        try {
          await ensureParentProfile(u);
        } catch (e) {
          console.warn('ensureParentProfile:', e);
        }

        // custom claims (piem., admin)
        const token = await getIdTokenResult(u, true);
        setClaims(token.claims || {});
      } catch (e) {
        console.error('Auth error:', e);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // (pēc izvēles) Palīgfunkcijas AuthPage vajadzībām
  async function loginEmail(email, password) {
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await ensureParentProfile(cred.user);
    } finally {
      setLoading(false);
    }
  }

  async function signupEmail(email, password) {
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await ensureParentProfile(cred.user);
    } finally {
      setLoading(false);
    }
  }

  async function loginGoogle() {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      await ensureParentProfile(cred.user);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    setLoading(true);
    try {
      await signOut(auth);
    } finally {
      setLoading(false);
    }
  }

  const value = useMemo(
    () => ({
      user,
      claims,
      loading,
      // pēc izvēles eksponējam metodes:
      loginEmail,
      signupEmail,
      loginGoogle,
      logout,
    }),
    [user, claims, loading],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
