// src/pages/Parent.jsx
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import TopBar from "../components/TopBar";
import { db } from "../lib/firebase"; // ⬅️ nomainīts no ../db uz ../lib/firebase
import {
  addDoc, collection, serverTimestamp, query, where,
  onSnapshot, doc, updateDoc, deleteDoc, orderBy
} from "firebase/firestore";

const BRANCHES = [
  { id: "katlakalns", name: "Katlakalns" },
  { id: "balozi",     name: "Baloži" },
  { id: "alejas",     name: "Alejas" },
];
const branchName = (id) => BRANCHES.find(b => b.id === id)?.name || id;

// 👶 vecuma validācija (izmantojam gan pieteikumiem, gan bērna kartiņai)
function isValidDob(dobStr) {
  if (!dobStr) return false;
  const today = new Date(); today.setHours(0,0,0,0);
  const dob = new Date(dobStr); dob.setHours(0,0,0,0);
  if (Number.isNaN(dob.getTime())) return false;
  if (dob.getTime() > today.getTime()) return false;
  let years = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) years--;
  return years <= 6;
}

// Tulkojumi bērna statusam (UI)
const STATUS_LV = {
  waitlist: "rindā",
  approved: "apstiprināts",
  contract: "līgums",
  finished: "beidzis",
  withdrawn: "izstājies",
};

export default function Parent() {
  const { user } = useAuth();

  // ─────────────────────────────────────────────────────────────
  // 1) PIETEIKUMI (esošā tava sadaļa — saglabājam)
  // ─────────────────────────────────────────────────────────────
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  // Forma (PIETEIKUMS)
  const [editingId, setEditingId] = useState(null);
  const [firstName, setFirst] = useState("");
  const [lastName, setLast] = useState("");
  const [personalCode, setPk] = useState("");
  const [dob, setDob] = useState(""); // YYYY-MM-DD
  const [notes, setNotes] = useState("");
  const [mode, setMode] = useState("any"); // 'any' | 'ranked'
  const [p1, setP1] = useState(""); const [p2, setP2] = useState(""); const [p3, setP3] = useState("");

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    setErr("");
    const qApps = query(
      collection(db, "applications"),
      where("parentId", "==", user.uid),
      // ja ir createdAt timestamps, kārtojam:
      // orderBy("createdAt", "desc")  // (ja izveidots index, vari atkomentēt)
    );
    const unsub = onSnapshot(
      qApps,
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
        setApps(list);
        setLoading(false);
      },
      (e) => { setErr("Neizdevās ielādēt pieteikumus. " + (e?.message || "")); setLoading(false); }
    );
    return () => unsub();
  }, [user, db]);

  const rankedOptions = useMemo(() => {
    const used = new Set([p1, p2, p3].filter(Boolean));
    return (exclude) => BRANCHES.filter(b => !used.has(b.id) || b.id === exclude);
  }, [p1, p2, p3]);

  function resetForm() {
    setEditingId(null);
    setFirst(""); setLast(""); setPk(""); setDob(""); setNotes("");
    setMode("any"); setP1(""); setP2(""); setP3("");
    setMsg(""); setErr("");
  }

  async function submit(e) {
    e.preventDefault();
    setErr(""); setMsg("");

    if (!firstName) return setErr("Norādi bērna vārdu.");
    if (!dob) return setErr("Norādi dzimšanas datumu.");
    if (!isValidDob(dob)) return setErr("Dzimšanas datums nevar būt nākotnē, un bērna vecums nedrīkst pārsniegt 6 gadus.");

    try {
      const payload = {
        parentId: user.uid,
        child: { firstName, lastName, personalCode, dob },
        anyBranch: mode === "any",
        branchPrefs: mode === "any" ? [] : [p1, p2, p3].filter(Boolean),
        notes: notes || "",
        status: "submitted",
        updatedAt: serverTimestamp(),
      };
      if (editingId) {
        await updateDoc(doc(db, "applications", editingId), payload);
        setMsg("Pieteikums atjaunots.");
      } else {
        await addDoc(collection(db, "applications"), { ...payload, createdAt: serverTimestamp() });
        setMsg("Pieteikums pievienots.");
      }
      resetForm();
    } catch {
      setErr("Neizdevās saglabāt. Pamēģini vēlreiz.");
    }
  }

  function fillForEdit(a) {
    setEditingId(a.id);
    setFirst(a.child?.firstName || "");
    setLast(a.child?.lastName || "");
    setPk(a.child?.personalCode || "");
    setDob(a.child?.dob || "");
    setNotes(a.notes || "");
    if (a.anyBranch) { setMode("any"); setP1(""); setP2(""); setP3(""); }
    else { setMode("ranked"); setP1(a.branchPrefs?.[0] || ""); setP2(a.branchPrefs?.[1] || ""); setP3(a.branchPrefs?.[2] || ""); }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteApp(id) {
    if (!confirm("Dzēst pieteikumu?")) return;
    try { await deleteDoc(doc(db, "applications", id)); }
    catch { /* ignore */ }
  }

  // ─────────────────────────────────────────────────────────────
  // 2) MANI BĒRNI (JAUNĀ sadaļa ar child + parentIds)
  // ─────────────────────────────────────────────────────────────
  const [kids, setKids] = useState([]);
  const [kLoading, setKLoading] = useState(true);
  const [kErr, setKErr] = useState("");
  const [kMsg, setKMsg] = useState("");

  // Forma (BĒRNS)
  const [kEditingId, setKEditingId] = useState(null);
  const [kFirst, setKFirst] = useState("");
  const [kLast, setKLast] = useState("");
  const [kPk, setKPk] = useState("");
  const [kDob, setKDob] = useState(""); // YYYY-MM-DD

  useEffect(() => {
    if (!user) return;
    setKLoading(true);
    setKErr("");
    const qKids = query(
      collection(db, "child"),
      where("parentIds", "array-contains", user.uid),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(
      qKids,
      (snap) => {
        setKids(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setKLoading(false);
      },
      (e) => { setKErr("Neizdevās ielādēt bērnu sarakstu. " + (e?.message || "")); setKLoading(false); }
    );
    return () => unsub();
  }, [user, db]);

  function resetKidForm() {
    setKEditingId(null);
    setKFirst(""); setKLast(""); setKPk(""); setKDob("");
    setKMsg(""); setKErr("");
  }

  async function submitKid(e) {
    e.preventDefault();
    setKErr(""); setKMsg("");
    if (!kFirst) return setKErr("Norādi bērna vārdu.");
    if (!kDob) return setKErr("Norādi dzimšanas datumu.");
    if (!isValidDob(kDob)) return setKErr("Dzimšanas datums nevar būt nākotnē, un bērna vecums nedrīkst pārsniegt 6 gadus.");

    try {
      if (kEditingId) {
        await updateDoc(doc(db, "child", kEditingId), {
          firstName: kFirst,
          lastName: kLast,
          personalCode: kPk,
          dob: kDob,
          updatedAt: serverTimestamp(),
          // parentIds nemainām šeit (drošības noteikumi to arī aizsargās)
        });
        setKMsg("Bērna dati atjaunoti.");
      } else {
        await addDoc(collection(db, "child"), {
          firstName: kFirst,
          lastName: kLast,
          personalCode: kPk,
          dob: kDob,
          status: "waitlist",               // pēc noklusējuma; admin var mainīt
          parentIds: [user.uid],            // savienojums ar šo vecāku
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setKMsg("Bērns pievienots.");
      }
      resetKidForm();
    } catch {
      setKErr("Neizdevās saglabāt bērna datus. Pamēģini vēlreiz.");
    }
  }

  function fillKidForEdit(k) {
    setKEditingId(k.id);
    setKFirst(k.firstName || "");
    setKLast(k.lastName || "");
    setKPk(k.personalCode || "");
    setKDob(k.dob || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteKid(id) {
    if (!confirm("Dzēst bērna kartiņu?")) return;
    try { await deleteDoc(doc(db, "child", id)); }
    catch { /* ignore */ }
  }

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-sand">
      <TopBar />
      <div className="mx-auto max-w-4xl p-6 space-y-6">

        {/* ——— JAUNĀ SADAĻA: BĒRNI ——— */}
        <div className="rounded-2xl bg-sandLight shadow-xl ring-1 ring-sandRing p-6">
          <h2 className="text-xl font-semibold text-brown mb-4">
            {kEditingId ? "Labot bērna kartiņu" : "Pievienot bērna kartiņu"}
          </h2>

          {kErr && <p className="text-red-600 text-sm mb-3">{kErr}</p>}
          {kMsg && <p className="text-green-700 text-sm mb-3">{kMsg}</p>}

          <form onSubmit={submitKid} className="grid gap-3 sm:grid-cols-2">
            <input className="rounded-xl border border-sandBorder bg-white px-4 py-3 text-brown"
              placeholder="Bērna vārds *" value={kFirst} onChange={e=>setKFirst(e.target.value)} required />
            <input className="rounded-xl border border-sandBorder bg-white px-4 py-3 text-brown"
              placeholder="Bērna uzvārds" value={kLast} onChange={e=>setKLast(e.target.value)} />
            <input className="rounded-xl border border-sandBorder bg-white px-4 py-3 text-brown"
              placeholder="Personas kods" value={kPk} onChange={e=>setKPk(e.target.value)} />
            <input className="rounded-xl border border-sandBorder bg-white px-4 py-3 text-brown"
              type="date" placeholder="Dzimšanas datums *" value={kDob} onChange={e=>setKDob(e.target.value)} required />

            <div className="sm:col-span-2 flex gap-3 pt-2">
              <button type="submit"
                className="rounded-2xl bg-caramel px-4 py-3 font-semibold text-white shadow hover:bg-cocoa focus:outline-none focus:ring-4 focus:ring-caramel/30 transition">
                {kEditingId ? "Saglabāt izmaiņas" : "Pievienot bērnu"}
              </button>
              {kEditingId && (
                <button type="button" onClick={resetKidForm}
                  className="rounded-xl border border-sandBorder bg-white px-4 py-3 text-brown hover:bg-sand">
                  Atcelt labošanu
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Saraksts: MANI BĒRNI */}
        <div className="rounded-2xl bg-sandLight shadow-xl ring-1 ring-sandRing p-6">
          <h2 className="text-xl font-semibold text-brown mb-4">Mani bērni</h2>
          {kLoading && <div className="text-brown/70">Ielādē...</div>}
          {!kLoading && kids.length === 0 && <div className="text-brown/70">Nav bērnu kartīšu.</div>}

          <div className="space-y-3">
            {kids.map(k => (
              <div key={k.id} className="rounded-xl border border-sandBorder bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="text-brown">
                    <div className="font-semibold">
                      {k.firstName} {k.lastName}{" "}
                      <span className="text-xs text-brown/60">({k.dob || "-"})</span>
                    </div>
                    <div className="text-sm text-brown/80">
                      Statuss: {STATUS_LV[k.status] || "-"}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={()=>fillKidForEdit(k)}
                      className="rounded-xl border border-sandBorder bg-white px-3 py-2 text-brown hover:bg-sand">
                      Rediģēt
                    </button>
                    <button onClick={()=>deleteKid(k.id)}
                      className="rounded-xl border border-sandBorder bg-white px-3 py-2 text-brown hover:bg-sand">
                      Dzēst
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ——— ESOŠĀ SADAĻA: PIETEIKUMI ——— */}
        <div className="rounded-2xl bg-sandLight shadow-xl ring-1 ring-sandRing p-6">
          <h2 className="text-xl font-semibold text-brown mb-4">Mani pieteikumi</h2>

          {loading && <div className="text-brown/70">Ielādē...</div>}
          {!loading && apps.length === 0 && <div className="text-brown/70">Vēl nav pieteikumu.</div>}

          <div className="space-y-3">
            {apps.map(a => (
              <div key={a.id} className="rounded-xl border border-sandBorder bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="text-brown">
                    <div className="font-semibold">
                      {a.child?.firstName} {a.child?.lastName}{" "}
                      <span className="text-xs text-brown/60">({a.child?.dob || "-"})</span>
                    </div>
                    <div className="text-sm text-brown/80">
                      {a.anyBranch
                        ? "Der jebkura filiāle"
                        : `Prioritātes: ${a.branchPrefs?.map(branchName).join(" → ") || "-"}`}
                    </div>
                    {a.notes && <div className="text-sm text-brown/70 mt-1">Piezīmes: {a.notes}</div>}
                    <div className="text-xs mt-1">
                      Statuss: <span className="font-medium">{a.status}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={()=>fillForEdit(a)}
                      className="rounded-xl border border-sandBorder bg-white px-3 py-2 text-brown hover:bg-sand">
                      Rediģēt
                    </button>
                    <button onClick={()=>deleteApp(a.id)}
                      className="rounded-xl border border-sandBorder bg-white px-3 py-2 text-brown hover:bg-sand">
                      Dzēst
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
