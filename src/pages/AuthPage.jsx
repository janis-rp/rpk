// src/pages/AuthPage.jsx
import { useEffect, useState } from "react";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  sendEmailVerification,
  onAuthStateChanged,
} from "firebase/auth";
import { auth, googleProvider, facebookProvider } from "../firebase";
import { ensureUserDoc } from "../db";

const actionCodeSettings = {
  // Darbosies gan uz portal.raibapupa.lv, gan mana.raibapupa.lv
  url: `${window.location.origin}/?verified=1`,
  handleCodeInApp: false,
};

export default function AuthPage() {
  const params = new URLSearchParams(window.location.search);
  const initialMode = params.get("mode") || "login";

  const [mode, setMode] = useState(initialMode); // 'login' | 'register' | 'reset' | 'verify'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState("");
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u || null));
    return () => unsub();
  }, []);

  function mapError(e) {
    const c = e?.code || "";
    if (c.includes("user-not-found")) return "Šis lietotājs nav atrasts. Lūdzu reģistrējies.";
    if (c.includes("wrong-password")) return "Nepareiza parole.";
    if (c.includes("invalid-email")) return "Nederīgs e-pasts.";
    if (c.includes("email-already-in-use")) return "E-pasts jau ir reģistrēts. Lūdzu pieslēdzies.";
    if (c.includes("weak-password")) return "Parole ir par vāju (min. 6 simboli).";
    if (c.includes("too-many-requests")) return "Pārāk daudz mēģinājumu. Pamēģini vēlreiz nedaudz vēlāk.";
    return "Radās kļūda. Lūdzu mēģini vēlreiz.";
  }

  async function handleEmailLogin(e) {
    e.preventDefault();
    setErr(""); setMsg(""); setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      // Izveido users/{uid}, ja nav
      await ensureUserDoc(cred.user);

      const isPassword = cred.user.providerData.some(p=>p.providerId === "password");
      if (isPassword && !cred.user.emailVerified) {
        try { await sendEmailVerification(cred.user, actionCodeSettings); } catch {}
        setMode("verify");
        setMsg(`Apstiprinājuma e-pasts nosūtīts uz ${cred.user.email}.`);
        return;
      }
      // Veiksmīgs login → uz sākumu (ProtectedRoute + RoleRedirect aizvedīs uz pareizo paneli)
      window.location.href = "/";
    } catch (e) {
      const m = mapError(e);
      setErr(m);
      if (m.includes("nav atrasts")) setMode("register");
    } finally { setLoading(false); }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setErr(""); setMsg(""); setLoading(true);
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
      if (displayName) await updateProfile(user, { displayName });
      // izveido user dokumentu ar default role=parent
      await ensureUserDoc(user, { displayName: user.displayName || displayName || null });

      await sendEmailVerification(user, actionCodeSettings);
      setMode("verify");
      setMsg(`Profils izveidots! Apstiprinājuma e-pasts nosūtīts uz ${user.email}.`);
    } catch (e) {
      setErr(mapError(e));
    } finally { setLoading(false); }
  }

  async function handleReset(e) {
    e.preventDefault();
    setErr(""); setMsg(""); setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMsg("Paroles atjaunošanas saite nosūtīta uz e-pastu.");
    } catch (e) {
      setErr(mapError(e));
    } finally { setLoading(false); }
  }

  async function handleSocialLogin(providerName) {
    setErr(""); setMsg(""); setSocialLoading(providerName);
    try {
      const provider = providerName === "google" ? googleProvider : facebookProvider;
      const cred = await signInWithPopup(auth, provider);
      // Izveido users/{uid}, ja nav (ar default role=parent)
      await ensureUserDoc(cred.user);

      // Ja tas ir password konts bez verificēta e-pasta (reti pēc social), palūdz verifikāciju
      const isPassword = cred.user.providerData.some(p=>p.providerId === "password");
      if (isPassword && !cred.user.emailVerified) {
        try { await sendEmailVerification(cred.user, actionCodeSettings); } catch {}
        setMode("verify"); setMsg(`Apstiprinājuma e-pasts nosūtīts uz ${cred.user.email}.`);
        return;
      }
      window.location.href = "/";
    } catch {
      setErr(`Neizdevās pieslēgties ar ${providerName}.`);
    } finally { setSocialLoading(""); }
  }

  async function resendVerification() {
    setErr(""); setMsg("");
    try {
      if (auth.currentUser) {
        await sendEmailVerification(auth.currentUser, actionCodeSettings);
        setMsg(`Apstiprinājuma e-pasts atkārtoti nosūtīts uz ${auth.currentUser.email}.`);
      } else {
        setErr("Lūdzu vispirms pieslēdzies ar savu e-pastu.");
      }
    } catch {
      setErr("Neizdevās nosūtīt apstiprinājumu.");
    }
  }

  async function refreshVerificationStatus() {
    setErr(""); setMsg("");
    try {
      if (auth.currentUser) {
        await auth.currentUser.reload();
        if (auth.currentUser.emailVerified) {
          setMode("login");
          setMsg("E-pasts apstiprināts! Vari pieslēgties.");
        } else {
          setErr("E-pasts vēl nav apstiprināts. Pārbaudi pastu (arī Spam) vai sūti vēlreiz.");
        }
      } else {
        setErr("Lūdzu pieslēdzies ar e-pastu.");
      }
    } catch {
      setErr("Neizdevās atjaunot statusu.");
    }
  }

  return (
    <div className="min-h-screen bg-sand flex items-center justify-center p-6">
      {/* Dekoratīvs fons */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-16 -left-16 h-72 w-72 rounded-full bg-sandRing blur-3xl opacity-60"></div>
        <div className="absolute -bottom-20 -right-10 h-80 w-80 rounded-full bg-sandBorder blur-3xl opacity-50"></div>
      </div>

      <div className="w-full max-w-md rounded-2xl bg-sandLight shadow-xl ring-1 ring-sandRing p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-caramel flex items-center justify-center text-white font-bold">✓</div>
          <h1 className="text-2xl font-semibold text-brown">
            {mode === "login" && "Pieslēgties"}
            {mode === "register" && "Reģistrēties"}
            {mode === "reset" && "Atjaunot paroli"}
            {mode === "verify" && "Apstiprini savu e-pastu"}
          </h1>
          <p className="text-sm text-cocoa/80 mt-1">
            {mode === "login" && "Ievadi e-pastu un paroli vai izvēlies sociālo kontu"}
            {mode === "register" && "Izveido jaunu profilu ar e-pastu un paroli"}
            {mode === "reset" && "Ievadi e-pastu, lai saņemtu paroles atjaunošanas saiti"}
            {mode === "verify" && (user?.email ? `E-pasts: ${user.email}` : "Pārbaudi savu pastkasti")}
          </p>
        </div>

        {err && <p className="text-red-600 text-sm mb-3">{err}</p>}
        {msg && <p className="text-green-700 text-sm mb-3">{msg}</p>}

        {mode === "login" && (
          <>
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <input
                type="email"
                placeholder="E-pasts"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-sandBorder bg-white px-4 py-3 text-brown placeholder-cocoa/50
                           focus:outline-none focus:ring-4 focus:ring-caramel/20 focus:border-caramel transition"
                required
              />
              <input
                type="password"
                placeholder="Parole"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-sandBorder bg-white px-4 py-3 text-brown placeholder-cocoa/50
                           focus:outline-none focus:ring-4 focus:ring-caramel/20 focus:border-caramel transition"
                required
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-caramel px-4 py-3 font-semibold text-white shadow
                           hover:bg-cocoa active:scale-[.99]
                           disabled:opacity-50 disabled:cursor-not-allowed
                           focus:outline-none focus:ring-4 focus:ring-caramel/30 transition">
                {loading ? "Pieslēdzas..." : "Pieslēgties"}
              </button>
            </form>

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-sandRing" />
              <span className="text-xs text-brown/70">vai</span>
              <div className="h-px flex-1 bg-sandRing" />
            </div>

            <div className="space-y-3">
              <button
                onClick={() => handleSocialLogin("google")}
                disabled={socialLoading === "google"}
                className="w-full rounded-xl border border-sandBorder bg-white px-4 py-3 text-brown shadow-sm
                           hover:bg-sand active:scale-[.99]
                           disabled:opacity-50 disabled:cursor-not-allowed
                           focus:outline-none focus:ring-4 focus:ring-caramel/20 transition
                           flex items-center justify-center gap-2">
                {/* Google ikona */}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 533.5 544.3" className="h-5 w-5">
                  <path fill="#4285F4" d="M533.5 278.4c0-18.5-1.7-36.3-5-53.6H272v101.5h147c-6.3 34-25.2 62.8-53.8 82.1v68.1h86.7c50.7-46.7 81.6-115.6 81.6-198.1z"/><path fill="#34A853" d="M272 544.3c72.8 0 134-24.1 178.7-65.8l-86.7-68.1c-24.1 16.2-55 25.8-92 25.8-70.7 0-130.7-47.7-152.2-111.8H31.5v70.3C76 487.6 167.8 544.3 272 544.3z"/><path fill="#FBBC05" d="M119.8 324.4c-10.1-30.3-10.1-63.7 0-94l.1-70.3H31.5c-42.3 84.6-42.3 149.9 0 234.5l88.3-70.2z"/><path fill="#EA4335" d="M272 107.7c38.4-.6 75.3 13.9 103.7 40.7l77.3-77.3C405.9 24.6 344.8-.1 272 0 167.8 0 76 56.7 31.5 162.1l88.3 70.3C141.3 155.3 201.3 107.6 272 107.7z"/>
                </svg>
                {socialLoading === "google" ? "Pieslēdzas ar Google..." : "Pieslēgties ar Google"}
              </button>

              <button
                onClick={() => handleSocialLogin("facebook")}
                disabled={socialLoading === "facebook"}
                className="w-full rounded-xl border border-sandBorder bg-white px-4 py-3 text-brown shadow-sm
                           hover:bg-sand active:scale-[.99]
                           disabled:opacity-50 disabled:cursor-not-allowed
                           focus:outline-none focus:ring-4 focus:ring-caramel/20 transition
                           flex items-center justify-center gap-2">
                {/* Facebook ikona */}
                <svg viewBox="0 0 24 24" className="h-5 w-5" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.675 0h-21.35C.595 0 0 .594 0 1.326v21.348C0 23.406.595 24 1.325 24h11.494v-9.294H9.847v-3.622h2.972V8.413c0-2.943 1.796-4.548 4.416-4.548 1.256 0 2.337.093 2.651.135v3.073l-1.82.001c-1.427 0-1.703.678-1.703 1.673v2.195h3.406l-.444 3.622h-2.962V24h5.807C23.406 24 24 23.406 24 22.674V1.326C24 .594 23.406 0 22.675 0z" />
                </svg>
                {socialLoading === "facebook" ? "Pieslēdzas ar Facebook..." : "Pieslēgties ar Facebook"}
              </button>
            </div>

            <div className="mt-6 text-center text-sm text-brown">
              <button className="text-cocoa hover:text-brown" onClick={() => setMode("reset")}>Aizmirsu paroli</button>
              <div className="mt-2">
                Nav profila?{" "}
                <button className="text-cocoa hover:text-brown" onClick={() => setMode("register")}>Reģistrēties</button>
              </div>
            </div>
          </>
        )}

        {mode === "register" && (
          <form onSubmit={handleRegister} className="space-y-4">
            <input
              type="text"
              placeholder="Vārds (nav obligāts)"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-xl border border-sandBorder bg-white px-4 py-3 text-brown placeholder-cocoa/50
                         focus:outline-none focus:ring-4 focus:ring-caramel/20 focus:border-caramel transition"
            />
            <input
              type="email"
              placeholder="E-pasts"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-sandBorder bg-white px-4 py-3 text-brown placeholder-cocoa/50
                         focus:outline-none focus:ring-4 focus:ring-caramel/20 focus:border-caramel transition"
              required
            />
            <input
              type="password"
              placeholder="Parole"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-sandBorder bg-white px-4 py-3 text-brown placeholder-cocoa/50
                         focus:outline-none focus:ring-4 focus:ring-caramel/20 focus:border-caramel transition"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-caramel px-4 py-3 font-semibold text-white shadow
                         hover:bg-cocoa active:scale-[.99]
                         disabled:opacity-50 disabled:cursor-not-allowed
                         focus:outline-none focus:ring-4 focus:ring-caramel/30 transition">
              {loading ? "Veido profilu..." : "Izveidot profilu"}
            </button>
            <p className="mt-4 text-center text-sm text-brown">
              Jau ir konts?{" "}
              <button className="text-cocoa hover:text-brown" onClick={() => setMode("login")}>Pieslēgties</button>
            </p>
          </form>
        )}

        {mode === "reset" && (
          <form onSubmit={handleReset} className="space-y-4">
            <input
              type="email"
              placeholder="Tavs e-pasts"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-sandBorder bg-white px-4 py-3 text-brown placeholder-cocoa/50
                         focus:outline-none focus:ring-4 focus:ring-caramel/20 focus:border-caramel transition"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-caramel px-4 py-3 font-semibold text-white shadow
                         hover:bg-cocoa active:scale-[.99]
                         disabled:opacity-50 disabled:cursor-not-allowed
                         focus:outline-none focus:ring-4 focus:ring-caramel/30 transition">
              {loading ? "Sūta..." : "Nosūtīt saiti"}
            </button>
            <p className="mt-4 text-center text-sm text-brown">
              <button className="text-cocoa hover:text-brown" onClick={() => setMode("login")}>Atpakaļ uz pieslēgšanos</button>
            </p>
          </form>
        )}

        {mode === "verify" && (
          <div className="space-y-4">
            <p className="text-brown/90 text-sm">
              Lūdzu atver apstiprinājuma e-pastu, ko nosūtījām uz{" "}
              <strong>{user?.email || email || "tavu e-pastu"}</strong>. Pēc apstiprināšanas nospied
              “Pārbaudīt statusu”.
            </p>
            <button
              onClick={resendVerification}
              className="w-full rounded-xl border border-sandBorder bg-white px-4 py-3 text-brown shadow-sm
                         hover:bg-sand focus:outline-none focus:ring-4 focus:ring-caramel/20 transition">
              Nosūtīt apstiprinājuma e-pastu vēlreiz
            </button>
            <button
              onClick={refreshVerificationStatus}
              className="w-full rounded-2xl bg-caramel px-4 py-3 font-semibold text-white shadow
                         hover:bg-cocoa focus:outline-none focus:ring-4 focus:ring-caramel/30 transition">
              Es apstiprināju — pārbaudīt statusu
            </button>
            <p className="text-center text-sm text-brown">
              <button className="text-cocoa hover:text-brown" onClick={() => setMode("login")}>Atpakaļ uz pieslēgšanos</button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
