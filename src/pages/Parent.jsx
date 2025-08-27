// src/pages/Parent.jsx
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import TopBar from "../components/TopBar";
import { db } from "../db";
import {
  addDoc, collection, serverTimestamp, query, where,
  onSnapshot, doc, updateDoc, deleteDoc
} from "firebase/firestore";

const BRANCHES = [
  { id: "katlakalns", name: "Katlakalns" },
  { id: "balozi",     name: "Baloži" },
  { id: "alejas",     name: "Alejas" },
];
const branchName = (id) => BRANCHES.find(b => b.id === id)?.name || id;

// 👶 vecuma validācija
function isValidDob(dobStr) {
  if (!dobStr) return false;
  const today = new Date(); today.setHours(0,0,0,0);
  const dob = new Date(dobStr); dob.setHours(0,0,0,0);
  if (Number.isNaN(dob.getTime())) return false;
  // nedrīkst nākotnē
  if (dob.getTime() > today.getTime()) return false;

  // aprēķinām pilnus gadus
  let years = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) years--;

  // “nepārsniedz 6” => atļaujam <= 6 gadi
  if (years > 6) return false;
  // gadījumā, ja ir tieši 6, bet šodiena ir pēc dzimšanas dienas? (tas jau ietilpst >6 nosacījumā)
  return true;
}

export default function Parent() {
  const { user } = useAuth();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  // Forma
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
    const q = query(collection(db, "applications"), where("parentId", "==", user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
        setApps(list);
        setLoading(false);
      },
      (e) => { setErr("Neizdevās ielādēt pieteikumus. " + (e?.message || "")); setLoading(false); }
    );
    return () => unsub();
  }, [user]);

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

  return (
    <div className="min-h-screen bg-sand">
      <TopBar />
      <div className="mx-auto max-w-4xl p-6 space-y-6">
        {/* Forma */}
        <div className="rounded-2xl bg-sandLight shadow-xl ring-1 ring-sandRing p-6">
          <h2 className="text-xl font-semibold text-brown mb-4">
            {editingId ? "Labot pieteikumu" : "Pieteikt bērnu"}
          </h2>

          {err && <p className="text-red-600 text-sm mb-3">{err}</p>}
          {msg && <p className="text-green-700 text-sm mb-3">{msg}</p>}

          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <input className="rounded-xl border border-sandBorder bg-white px-4 py-3 text-brown"
              placeholder="Bērna vārds *" value={firstName} onChange={e=>setFirst(e.target.value)} required />
            <input className="rounded-xl border border-sandBorder bg-white px-4 py-3 text-brown"
              placeholder="Bērna uzvārds" value={lastName} onChange={e=>setLast(e.target.value)} />
            <input className="rounded-xl border border-sandBorder bg-white px-4 py-3 text-brown"
              placeholder="Personas kods" value={personalCode} onChange={e=>setPk(e.target.value)} />
            <input className="rounded-xl border border-sandBorder bg-white px-4 py-3 text-brown"
              type="date" placeholder="Dzimšanas datums *" value={dob} onChange={e=>setDob(e.target.value)} required />

            <div className="sm:col-span-2">
              <textarea className="w-full rounded-xl border border-sandBorder bg-white px-4 py-3 text-brown"
                placeholder="Piezīmes" rows={3} value={notes} onChange={e=>setNotes(e.target.value)} />
            </div>

            {/* Filiāles */}
            <div className="sm:col-span-2">
              <div className="flex flex-wrap gap-4 mb-2">
                <label className="inline-flex items-center gap-2 text-brown">
                  <input type="radio" name="mode" value="any" checked={mode==="any"} onChange={()=>setMode("any")} />
                  <span>Der jebkura filiāle</span>
                </label>
                <label className="inline-flex items-center gap-2 text-brown">
                  <input type="radio" name="mode" value="ranked" checked={mode==="ranked"} onChange={()=>setMode("ranked")} />
                  <span>Norādīt prioritātes</span>
                </label>
              </div>

              {mode==="ranked" && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <select className="rounded-xl border border-sandBorder bg-white px-4 py-3 text-brown"
                          value={p1} onChange={e=>setP1(e.target.value)}>
                    <option value="">1. prioritāte</option>
                    {rankedOptions(p1).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <select className="rounded-xl border border-sandBorder bg-white px-4 py-3 text-brown"
                          value={p2} onChange={e=>setP2(e.target.value)}>
                    <option value="">2. prioritāte</option>
                    {rankedOptions(p2).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <select className="rounded-xl border border-sandBorder bg-white px-4 py-3 text-brown"
                          value={p3} onChange={e=>setP3(e.target.value)}>
                    <option value="">3. prioritāte</option>
                    {rankedOptions(p3).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="sm:col-span-2 flex gap-3 pt-2">
              <button type="submit"
                className="rounded-2xl bg-caramel px-4 py-3 font-semibold text-white shadow hover:bg-cocoa focus:outline-none focus:ring-4 focus:ring-caramel/30 transition">
                {editingId ? "Saglabāt izmaiņas" : "Pieteikt bērnu"}
              </button>
              {editingId && (
                <button type="button" onClick={resetForm}
                  className="rounded-xl border border-sandBorder bg-white px-4 py-3 text-brown hover:bg-sand">
                  Atcelt labošanu
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Saraksts */}
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
