import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import { db } from "../db";
import { doc, getDoc } from "firebase/firestore";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const snap = await getDoc(doc(db, "users", u.uid));
          setRole(snap.exists() ? snap.data().role : "parent"); // default ja nav
        } catch {
          setRole("parent");
        }
      } else {
        setRole(null);
      }
      setInitializing(false);
    });
    return () => unsub();
  }, []);

  const isPasswordUser = user?.providerData?.some(p => p.providerId === "password");
  const isVerified = !!user && (!isPasswordUser || user.emailVerified);

  return (
    <AuthContext.Provider value={{ user, role, initializing, isVerified }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
