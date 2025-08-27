// src/pages/Admin.jsx
import { useEffect, useMemo, useState } from "react";
import TopBar from "../components/TopBar";
import { db } from "../db";
import {
  collection, onSnapshot, orderBy, query, updateDoc, doc, serverTimestamp
} from "firebase/firestore";
import { httpsCallable, getFunctions } from "firebase/functions";
import { app } from "../firebase";
import { useAuth } from "../context/AuthContext";

const BRANCHES = [
  { id: "katlakalns", name: "Katlakalns" },
  { id: "balozi",     name: "Baloži" },
  { id: "alejas",     name: "Alejas" },
];
const branchName = (id) => BRANCHES.find(b => b.id === id)?.name || id;
const STATUS = ["submitted", "waitlist", "approved", "cancelled"];

function AdminActions() {
  const { user, initializing } = useAuth();
  const [unlinkUid, setUnlinkUid] = useState("");
  const [opMsg, setOpMsg] = useState("");
  const [opErr, setOpErr] = useState("");

  async function handleUnlink() {
    setOpMsg(""); setOpErr("");
    if (!user) { setOpErr("Tu neesi ielogojies (vai sesija beigusies)."); return; }

    try {
      // us-central1 — tur arī ir deploy
      const fns = getFunctions(app, "us-central1");
      const fn = httpsCallable(fns, "adminUnlinkPhone");
      await fn({ uid: unlinkUid.trim() });
      setOpMsg("Telefona numurs noņemts un profils atjaunināts.");
    } catch (e) {
      setOpErr(`${e?.code || "error"} – ${e?.message || "Neizdevās noņemt telefonu."}`);
    }
  }

  return (
    <div className="rounded-2xl bg-sandLight shadow-xl ring-1 ring-sandRing p-6">
      <h2 className="text-lg font-semibold text-brown mb-3">Administratīvās darbības</h2>
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="rounded-xl border border-sandBorder bg-white px-4 py-2 text-brown"
          placeholder="Lietotāja UID (piem., socHWF…)"
          value={unlinkUid}
          onChange={(e)=>setUnlinkUid(e.target.value)}
        />
        <button
          onClick={handleUnlink}
          disabled={initializing || !user || !unlinkUid.trim()}
          className="rounded-xl border border-sandBorder bg-white px-3 py-2 text-brown hover:bg-sand disabled:opacity-50"
        >
          Noņemt telefona numuru
        </button>
      </div>
      {user && <div className="text-xs text-brown/60 mt-2">Tu esi ielogojies kā: {user.uid}</div>}
      {opMsg && <div className="text-green-700 text-sm mt-2">{opMsg}</div>}
      {opErr && <div className="text-red-600 text-sm mt-2 break-all">{opErr}</div>}
    </div>
  );
}

export default function Admin() {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    setLoading(true);
    setErr("");
    const q = query(collection(db, "applications"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setApps(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (e) => { setErr("Neizdevās ielādēt pieteikumus. " + (e?.message||"")); setLoading(false); }
    );
    return () => unsub();
  }, []);

  async function changeStatus(aid, val) {
    try {
      await updateDoc(doc(db, "applications", aid), { status: val, updatedAt: serverTimestamp() });
    } catch {
      alert("Neizdevās atjaunināt statusu.");
    }
  }

  const totalByStatus = useMemo(() => {
    const m = Object.fromEntries(STATUS.map(s => [s, 0]));
    for (const a of apps) m[a.status] = (m[a.status] || 0) + 1;
    return m;
  }, [apps]);

  return (
    <div className="min-h-screen bg-sand">
      <TopBar />
      <div className="mx-auto max-w-6xl p-6 space-y-6">
        {/* Admin rīki */}
        <AdminActions />

        <div className="rounded-2xl bg-sandLight shadow-xl ring-1 ring-sandRing p-6">
          <h1 className="text-2xl font-semibold text-brown mb-2">Pieteikumi</h1>
          {loading && <div className="text-brown/70">Ielādē...</div>}
          {err && <div className="text-red-600 text-sm">{err}</div>}

          <div className="flex flex-wrap gap-3 text-sm text-brown/80 mt-3">
            {STATUS.map(s => (
              <div key={s} className="rounded-xl border border-sandBorder bg-white px-3 py-2">
                {s}: <b>{totalByStatus[s] ?? 0}</b>
              </div>
            ))}
            <div className="rounded-xl border border-sandBorder bg-white px-3 py-2">
              Kopā: <b>{apps.length}</b>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-sandLight shadow-xl ring-1 ring-sandRing p-6">
          <div className="grid gap-3">
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
                      Vecāks: <span className="font-medium">{a.parentId}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-sm text-brown/70">Statuss</label>
                    <select
                      value={a.status}
                      onChange={(e) => changeStatus(a.id, e.target.value)}
                      className="rounded-xl border border-sandBorder bg-white px-3 py-2 text-brown"
                    >
                      {STATUS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            ))}
            {apps.length === 0 && !loading && <div className="text-brown/70">Nav pieteikumu.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
