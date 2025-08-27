// src/pages/ParentSettings.jsx
import { useEffect, useRef, useState } from "react";
import TopBar from "../components/TopBar";
import { useAuth } from "../context/AuthContext";
import { db } from "../db";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { app, auth } from "../firebase";
import { signInWithPhoneNumber } from "firebase/auth";
import { serverTimestamp } from "firebase/firestore";


import {
  RecaptchaVerifier,
  linkWithPhoneNumber,
  updatePhoneNumber,
  PhoneAuthProvider,
} from "firebase/auth";
import { httpsCallable, getFunctions } from "firebase/functions";

// LV telefona normalizācija -> E.164
function normalizeLvPhone(input) {
  if (!input) return "";
  const raw = String(input).replace(/[^\d+]/g, "");
  if (raw.startsWith("+")) return raw;
  if (/^\d{8,}$/.test(raw)) return "+371" + raw;
  return raw;
}

export default function ParentSettings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [address, setAddress] = useState("");
  const [personalCode, setPersonalCode] = useState("");

const [mergePrompt, setMergePrompt] = useState(false);
const [mergePhone, setMergePhone] = useState("");
const [mergeStep, setMergeStep] = useState("idle"); // idle | sms
const [mergeCode, setMergeCode] = useState("");
const mergeConfirmRef = useRef(null);
const mergeSourceUidRef = useRef(null);

  // Telefona verifikācijas stāvoklis
  const [editingPhone, setEditingPhone] = useState(false); // ← ja true, atļaujam ievadi + verifikāciju
  const [step, setStep] = useState("idle"); // idle | sent
  const [code, setCode] = useState("");
  const confirmRef = useRef(null);
  const recaptchaRef = useRef(null);

  useEffect(() => {
    (async () => {
      if (!user) return;
      setLoading(true);
      setMsg(""); setErr("");
      try {
        const ref = doc(db, "users", user.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const d = snap.data();
          setDisplayName(d.displayName || user.displayName || "");
          setEmail(d.email || user.email || "");
          setPhone(d.phone || user.phoneNumber || "");
          setPhoneVerified(!!d.phoneVerified || !!user.phoneNumber);
          setAddress(d.address || "");
          setPersonalCode(d.personalCode || "");
        } else {
          await setDoc(ref, {
            role: "parent",
            email: user.email || "",
            displayName: user.displayName || "",
            phone: "",
            phoneVerified: false,
            address: "",
            personalCode: "",
          });
          setDisplayName(user.displayName || "");
          setEmail(user.email || "");
        }
      } catch {
        setErr("Neizdevās ielādēt profilu.");
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  async function save() {
    setErr(""); setMsg("");
    try {
      const ref = doc(db, "users", user.uid);
      await updateDoc(ref, {
        displayName: displayName || null,
        email: email || null,
        phone: phone || null,
        phoneVerified: !!phoneVerified,
        address: address || null,
        personalCode: personalCode || null,
      });
      setMsg("Saglabāts!");
    } catch {
      setErr("Neizdevās saglabāt.");
    }
  }

  async function startPhoneVerification() {
    setErr(""); setMsg("");
    const normalized = normalizeLvPhone(phone);
    if (!/^\+\d{8,15}$/.test(normalized)) return setErr("Ievadi pareizu nr. (+37120000000).");

    try {
      if (recaptchaRef.current) {
        try { recaptchaRef.current.clear(); } catch {}
        recaptchaRef.current = null;
      }
      recaptchaRef.current = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });

      // ja lietotājam vēl nav piesaistīts tālrunis → linkWithPhoneNumber
      const hasPhoneProvider = (user?.providerData || []).some(p => p.providerId === "phone");
      if (!hasPhoneProvider) {
        const confirmation = await linkWithPhoneNumber(auth.currentUser, normalized, recaptchaRef.current);
        confirmRef.current = confirmation;
      } else {
        // jau piesaistīts – gatavojamies updatePhoneNumber ar PhoneAuthProvider credential
        const provider = new PhoneAuthProvider(auth);
        const verificationId = await provider.verifyPhoneNumber(normalized, recaptchaRef.current);
        confirmRef.current = { verificationId, _mode: "update" };
      }

      setStep("sent");
      setMsg("SMS ar kodu nosūtīts. Ievadi kodu un apstiprini.");
    } catch (e) {
      if (e?.code === "auth/credential-already-in-use") {
    // Telefons jau citā profilā → piedāvā apvienot
    const normalized = normalizeLvPhone(phone);
    setMergePhone(normalized);
    setMergePrompt(true);
    return;
      } else if (e?.code === "auth/too-many-requests") {
        setErr("Pārāk daudz mēģinājumu. Pamēģini vēlāk.");
      } else if (e?.code === "auth/operation-not-supported-in-this-environment") {
        setErr("Šī pārlūka vide neatbalsta SMS verifikāciju.");
      } else {
        setErr("Neizdevās nosūtīt verifikācijas SMS.");
      }
    }
  }

  async function confirmCode() {
    setErr(""); setMsg("");
    try {
      const normalized = normalizeLvPhone(phone);
      if (!confirmRef.current) return setErr("Nav aktīvas verifikācijas sesijas.");

      if (confirmRef.current._mode === "update") {
        // updatePhoneNumber ar PhoneAuthProvider credential
        const cred = PhoneAuthProvider.credential(confirmRef.current.verificationId, code);
        await updatePhoneNumber(auth.currentUser, cred);
      } else {
        // linkWithPhoneNumber
        await confirmRef.current.confirm(code);
      }

      // saglabājam DB
      await updateDoc(doc(db, "users", user.uid), { phone: normalized, phoneVerified: true });
      setPhone(normalized);
      setPhoneVerified(true);
      setEditingPhone(false);
      setStep("idle");
      setCode("");

      // tikai pēc veiksmīgas verifikācijas → merge
      try {
        const fn = httpsCallable(getFunctions(app), "mergeParentData");
        const res = await fn({ phone: normalized, targetUid: user.uid });
        const merged = !!res?.data?.merged;
        const count = Number(res?.data?.matches || 0);
        setMsg(merged ? "Paldies, ka ilgstoši uzticaties mums!" : "Telefona numurs ir verificēts.");
        if (!merged && count > 0) setMsg("Paldies, ka ilgstoši uzticaties mums!");
      } catch {
        setMsg("Telefona numurs ir verificēts.");
      }
    } catch (e) {
      if (e?.code === "auth/invalid-verification-code") setErr("Kods nav pareizs.");
      else if (e?.code === "auth/code-expired") { setErr("Kods ir beidzies. Sāc no jauna."); setStep("idle"); }
      else setErr("Neizdevās apstiprināt kodu.");
    } finally {
      try { recaptchaRef.current?.clear(); } catch {}
      recaptchaRef.current = null;
      confirmRef.current = null;
    }
  }

async function beginMerge() {
  setErr(""); setMsg("");
  try {
    // 1) Saglabājam “source uid” (šis ir pašreizējais konts A)
    mergeSourceUidRef.current = user.uid;

    // 2) Izveidojam merge intent doc (A → phone)
    await setDoc(doc(db, "mergeIntents", user.uid), {
      phone: mergePhone,
      requestedBy: user.uid,
      createdAt: serverTimestamp(),
    });

    // 3) Recaptcha un signInWithPhoneNumber (pieteikšanās profilā B)
    if (recaptchaRef.current) { try { recaptchaRef.current.clear(); } catch {} }
    recaptchaRef.current = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });

    const confirmation = await signInWithPhoneNumber(auth, mergePhone, recaptchaRef.current);
    mergeConfirmRef.current = confirmation;
    setMergeStep("sms");
    setMsg("Ievadi SMS kodu, lai pabeigtu kontu apvienošanu.");
  } catch {
    setErr("Neizdevās sākt apvienošanu.");
    setMergePrompt(false);
  }
}

async function confirmMerge() {
  setErr(""); setMsg("");
  try {
    if (!mergeConfirmRef.current) { setErr("Nav aktīvas apvienošanas sesijas."); return; }
    // 4) Apstiprinām SMS → tagad esi profilā B (ar tālruni)
    const res = await mergeConfirmRef.current.confirm(mergeCode);
    const targetUid = res.user.uid;
    const sourceUid = mergeSourceUidRef.current;

    // 5) Izsaucam servera apvienošanu
    const fn = httpsCallable(getFunctions(app, "us-central1"), "completeMerge");
    await fn({ sourceUid });

    setMsg("Profili apvienoti! (Tavs konts ir sasaistīts ar telefona profilu.)");
    setMergePrompt(false);
    setMergeStep("idle");
    setMergeCode("");

    // (pēc vajadzības) šeit vari piedāvāt “Sasaistīt arī Google/e-pasta pieslēgšanos ar šo kontu”
    // piem.: linkWithPopup(auth.currentUser, googleProvider)
  } catch (e) {
    setErr("Neizdevās pabeigt apvienošanu. " + (e?.message || ""));
  } finally {
    try { recaptchaRef.current?.clear(); } catch {}
    mergeConfirmRef.current = null;
  }
}

  return (
    <div className="min-h-screen bg-sand">
      <TopBar />
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-2xl bg-sandLight shadow-xl ring-1 ring-sandRing p-6">
          <h1 className="text-2xl font-semibold text-brown mb-2">Profila iestatījumi</h1>
          {loading && <div className="text-brown/70">Ielādē...</div>}
          {err && <div className="text-red-600 text-sm mb-3">{err}</div>}
          {msg && <div className="text-green-700 text-sm mb-3">{msg}</div>}

          {!loading && (
            <div className="grid gap-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <input className="rounded-xl border border-sandBorder bg-white px-4 py-3 text-brown"
                  placeholder="Vārds uzvārds" value={displayName} onChange={e=>setDisplayName(e.target.value)} />
                <input className="rounded-xl border border-sandBorder bg-white px-4 py-3 text-brown"
                  placeholder="E-pasts" value={email} onChange={e=>setEmail(e.target.value)} />
              </div>

{mergePrompt && (
  <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
    <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
      <h3 className="text-lg font-semibold text-brown mb-2">Profils ar šādu telefonu jau pastāv</h3>
      <p className="text-brown/80 mb-4">
        Jūs jau esat reģistrējies ar citu profilu. Vēlaties apvienot?
      </p>
      {mergeStep === "idle" && (
        <div className="flex gap-2 justify-end">
          <button onClick={()=>setMergePrompt(false)} className="rounded-xl border border-sandBorder bg-white px-3 py-2 text-brown hover:bg-sand">
            Nē
          </button>
          <button onClick={beginMerge} className="rounded-2xl bg-caramel px-3 py-2 font-semibold text-white shadow hover:bg-cocoa">
            Jā, apvienot
          </button>
        </div>
      )}
      {mergeStep === "sms" && (
        <div className="space-y-3">
          <input
            className="w-full rounded-xl border border-sandBorder bg-white px-4 py-3 text-brown"
            placeholder="SMS kods"
            value={mergeCode}
            onChange={(e)=>setMergeCode(e.target.value)}
          />
          <div className="flex gap-2 justify-end">
            <button onClick={()=>{ setMergePrompt(false); setMergeStep("idle"); setMergeCode(""); }} className="rounded-xl border border-sandBorder bg-white px-3 py-2 text-brown hover:bg-sand">
              Atcelt
            </button>
            <button onClick={confirmMerge} className="rounded-2xl bg-caramel px-3 py-2 font-semibold text-white shadow hover:bg-cocoa">
              Apstiprināt
            </button>
          </div>
        </div>
      )}
    </div>
  </div>
)}

              <div className="grid sm:grid-cols-2 gap-3 items-start">
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-xl border border-sandBorder bg-white px-4 py-3 text-brown disabled:bg-sand"
                    placeholder="+3712……"
                    value={phone}
                    onChange={e=>setPhone(e.target.value)}
                    disabled={phoneVerified && !editingPhone}
                  />
                  {phoneVerified && !editingPhone ? (
                    <button
                      onClick={()=>{ setEditingPhone(true); setMsg(""); setErr(""); }}
                      className="rounded-xl border border-sandBorder bg-white px-3 py-2 text-brown hover:bg-sand text-sm"
                    >
                      Mainīt numuru
                    </button>
                  ) : step === "sent" ? (
                    <button
                      onClick={confirmCode}
                      className="rounded-2xl bg-caramel px-3 py-2 font-semibold text-white shadow hover:bg-cocoa"
                    >
                      Apstiprināt
                    </button>
                  ) : (
                    <button
                      onClick={startPhoneVerification}
                      className="rounded-xl border border-sandBorder bg-white px-3 py-2 text-brown hover:bg-sand text-sm"
                    >
                      Verificēt
                    </button>
                  )}
                </div>

                {step === "sent" && (
                  <input
                    className="rounded-xl border border-sandBorder bg-white px-4 py-3 text-brown"
                    placeholder="SMS kods"
                    value={code}
                    onChange={e=>setCode(e.target.value)}
                  />
                )}
              </div>

              <div id="recaptcha-container"></div>

              <input className="rounded-xl border border-sandBorder bg-white px-4 py-3 text-brown"
                placeholder="Personas kods" value={personalCode} onChange={e=>setPersonalCode(e.target.value)} />

              <input className="rounded-xl border border-sandBorder bg-white px-4 py-3 text-brown"
                placeholder="Adrese" value={address} onChange={e=>setAddress(e.target.value)} />

              <div className="pt-2">
                <button
                  onClick={save}
                  className="rounded-2xl bg-caramel px-4 py-3 font-semibold text-white shadow hover:bg-cocoa focus:outline-none focus:ring-4 focus:ring-caramel/30 transition"
                >
                  Saglabāt
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
