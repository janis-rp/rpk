// src/pages/Manager.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import TopBar from "../components/TopBar";
import { db } from "../db";
import {
  collection, onSnapshot, query, where,
  updateDoc, doc, serverTimestamp, addDoc, getDoc
} from "firebase/firestore";

const BRANCHES = [
  { id: "katlakalns", name: "Katlakalns" },
  { id: "balozi",     name: "Baloži" },
  { id: "alejas",     name: "Alejas" },
];
const branchName = (id) => BRANCHES.find(b => b.id === id)?.name || id;

export default function Manager() {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [parentCache, setParentCache] = useState({}); // { uid: userDocData }

  // lokālie ievadi katram pieteikumam
  const local = useRef({}); // { appId: { startDate, branchId } }

  useEffect(() => {
    setLoading(true);
    const q1 = query(collection(db, "applications"), where("status", "in", ["submitted", "waitlist"]));
    const unsub = onSnapshot(q1, async (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // klienta kārtošana pēc createdAt
      list.sort((a,b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      setApps(list);
      setLoading(false);

      // ielādējam trūkstošos user doc (lai parādītu legacy.matches)
      const cache = { ...parentCache };
      for (const a of list) {
        if (!cache[a.parentId]) {
          const u = await getDoc(doc(db, "users", a.parentId)).catch(()=>null);
          if (u?.exists()) cache[a.parentId] = u.data();
        }
      }
      setParentCache(cache);
    }, (e) => { setErr("Neizdevās ielādēt pieteikumus."); setLoading(false); });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setLocal(appId, patch) {
    local.current[appId] = { ...(local.current[appId] || {}), ...patch };
  }

  async function approve(a) {
    setErr(""); setMsg("");
    const { startDate, branchId } = local.current[a.id] || {};
    const chosenBranch = branchId || a.branchPrefs?.[0] || "";

    if (!startDate) return setErr("Norādi sākuma datumu.");
    if (!chosenBranch) return setErr("Norādi filiāli.");

    try {
      // izveido children/{}
      await addDoc(collection(db, "children"), {
        applicationId: a.id,
        parentId: a.parentId,
        child: a.child,
        branchId: chosenBranch,
        startDate,        // "YYYY-MM-DD"
        endDate: null,
        status: "active",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // atjaunina pieteikumu
      await updateDoc(doc(db, "applications", a.id), {
        status: "approved",
        approvedAt: serverTimestamp(),
        assignedBranch: chosenBranch,
        plannedStartDate: startDate,
        updatedAt: serverTimestamp(),
      });

      setMsg("Pieteikums apstiprināts.");
    } catch (e) {
      setErr("Neizdevās apstiprināt pieteikumu.");
    }
  }

  async function moveToWaitlist(a) {
    try {
      await updateDoc(doc(db, "applications", a.id), { status: "waitlist", updatedAt: serverTimestamp() });
    } catch {}
  }

  return (
    <div className="min-h-screen bg-sand">
      <TopBar />
      <div className="mx-auto max-w-6xl p-6 space-y-6">
        <div className="rounded-2xl bg-sandLight shadow-xl ring-1 ring-sandRing p-6">
          <h1 className="text-2xl font-semibold text-brown mb-2">Jaunie pieteikumi</h1>
          {loading && <div className="text-brown/70">Ielādē...</div>}
          {err && <div className="text-red-600 text-sm">{err}</div>}
          {msg && <div className="text-green-700 text-sm">{msg}</div>}
        </div>

        <div className="grid gap-3">
          {apps.map(a => {
            const u = parentCache[a.parentId] || {};
            const legacyMatches = u?.legacy?.matches || 0;

            return (
              <div key={a.id} className="rounded-xl border border-sandBorder bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="text-brown">
                    <div className="font-semibold text-brown">
                      {a.child?.firstName} {a.child?.lastName}{" "}
                      <span className="text-xs text-brown/60">({a.child?.dob || "-"})</span>
                    </div>
                    <div className="text-sm text-brown/80">
                      {a.anyBranch
                        ? "Der jebkura filiāle"
                        : `Prioritātes: ${(a.branchPrefs || []).map(branchName).join(" → ") || "-"}`}
                    </div>
                    {a.notes && <div className="text-sm text-brown/70 mt-1">Piezīmes: {a.notes}</div>}

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-lg bg-sandLight px-2 py-1 ring-1 ring-sandRing">
                        Vecāks: {a.parentId}
                      </span>
                      {legacyMatches > 0 && (
                        <span className="rounded-lg bg-caramel/10 text-cocoa px-2 py-1 ring-1 ring-caramel/30">
                          Lojāls klients • iepriekšējie ieraksti: {legacyMatches}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 min-w-[260px]">
                    <select
                      defaultValue={a.branchPrefs?.[0] || ""}
                      onChange={(e)=>setLocal(a.id, { branchId: e.target.value })}
                      className="rounded-xl border border-sandBorder bg-white px-3 py-2 text-brown"
                    >
                      <option value="">— Izvēlies filiāli —</option>
                      {BRANCHES.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <input
                      type="date"
                      onChange={(e)=>setLocal(a.id, { startDate: e.target.value })}
                      className="rounded-xl border border-sandBorder bg-white px-3 py-2 text-brown"
                      placeholder="Sākuma datums"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={()=>approve(a)}
                        className="rounded-2xl bg-caramel px-3 py-2 font-semibold text-white shadow hover:bg-cocoa"
                      >
                        Apstiprināt
                      </button>
                      {a.status !== "waitlist" && (
                        <button
                          onClick={()=>moveToWaitlist(a)}
                          className="rounded-xl border border-sandBorder bg-white px-3 py-2 text-brown hover:bg-sand"
                        >
                          Rindā
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {apps.length === 0 && !loading && (
            <div className="rounded-xl border border-sandBorder bg-white p-4 text-brown/70">
              Nav jaunu pieteikumu.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
