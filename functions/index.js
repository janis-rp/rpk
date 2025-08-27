// functions/index.js
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

function normalizePhone(p) {
  if (!p) return "";
  const raw = String(p).replace(/[^\d+]/g, "");
  if (raw.startsWith("+")) return raw;
  if (/^\d{8,}$/.test(raw)) return "+371" + raw; // LV īsceļš
  return raw;
}

/**
 * mergeParentData — izsauc tikai pats lietotājs (pēc telefona verifikācijas)
 */
exports.mergeParentData = onCall({ region: "us-central1" }, async (request) => {
  const { phone, targetUid } = request.data || {};
  if (!request.auth || !phone || !targetUid) {
    throw new HttpsError("failed-precondition", "Auth and params required.");
  }
  if (request.auth.uid !== targetUid) {
    throw new HttpsError("permission-denied", "Not allowed.");
  }

  const normalized = normalizePhone(phone);

  // Vai servera pusē šim userim tiešām ir šis verificētais telefons?
  const userRecord = await admin.auth().getUser(targetUid).catch(() => null);
  if (!userRecord || normalizePhone(userRecord.phoneNumber || "") !== normalized) {
    throw new HttpsError("failed-precondition", "Phone not verified for this user.");
  }

  const userRef = db.collection("users").doc(targetUid);
  const snap = await userRef.get();
  if (!snap.exists) await userRef.set({ role: "parent" }, { merge: true });
  const current = (await userRef.get()).data() || {};

  // Meklē “parent” kolekcijā pēc telefona vairākos formātos
  const numOnly = Number(normalized.replace(/\D/g, "")); // 8 cipari (LV)
  const [q1, q2, q3] = await Promise.all([
    db.collection("parent").where("phone", "==", numOnly).get(),
    db.collection("parent").where("phone", "==", normalized).get(),
    db.collection("parent").where("phone", "==", String(numOnly)).get(),
  ]);

  const hits = [];
  for (const q of [q1, q2, q3]) {
    if (!q.empty) q.forEach((d) => hits.push({ id: d.id, ...d.data() }));
  }
  const matches = hits.length;

  // Atrodam “bagātāko” ierakstu, lai aizpildītu TRŪKSTOŠOS laukus
  let best = null;
  let bestScore = -1;
  const fields = ["vards", "uzvards", "epasts", "phone", "adrese", "personaskods", "ligumsnr", "statuss", "rek_info"];
  for (const d of hits) {
    const score = fields.reduce((s, f) => s + (d[f] ? 1 : 0), 0);
    if (score > bestScore) { best = d; bestScore = score; }
  }

  const patch = { phoneVerified: true, legacy: { matched: matches > 0, matches } };
  if (best) {
    if (!current.displayName && (best.vards || best.uzvards)) patch.displayName = [best.vards, best.uzvards].filter(Boolean).join(" ");
    if (!current.email && best.epasts) patch.email = best.epasts;
    if (!current.phone && best.phone) patch.phone = String(best.phone);
    if (!current.address && best.adrese) patch.address = best.adrese;
    if (!current.personalCode && best.personaskods) patch.personalCode = best.personaskods;
  }

  await userRef.set(patch, { merge: true });
  return { merged: !!best, matches };
});

/**
 * adminUnlinkPhone — tikai ADMIN:
 * noņem phone no Auth un nullē profilā users/{uid}.phone / phoneVerified
 */
exports.adminUnlinkPhone = onCall({ region: "us-central1" }, async (request) => {
  const { uid } = request.data || {};
  if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
  if (!uid) throw new HttpsError("invalid-argument", "Missing uid.");

  // Pārbaude (admins pēc Firestore users/{caller}.role)
  const callerDoc = await db.collection("users").doc(request.auth.uid).get();
  if (!callerDoc.exists || callerDoc.data().role !== "admin") {
    throw new HttpsError("permission-denied", "Admin only.");
  }

  await admin.auth().updateUser(uid, { phoneNumber: null });
  await db.collection("users").doc(uid).set({ phone: null, phoneVerified: false }, { merge: true });
  await admin.auth().revokeRefreshTokens(uid);

  return { ok: true };
});

/**
 * completeMerge — pēc “Jā, apvienot” plūsmas
 * (paliek us-central1; izmanto admin.firestore.FieldValue)
 */
exports.completeMerge = onCall({ region: "us-central1" }, async (req) => {
  const { sourceUid } = req.data || {};
  const targetUid = req.auth?.uid;
  if (!targetUid) throw new HttpsError("unauthenticated", "Auth required.");
  if (!sourceUid) throw new HttpsError("invalid-argument", "Missing sourceUid.");
  if (sourceUid === targetUid) throw new HttpsError("failed-precondition", "Same account.");

  // 1) Merge intent
  const intentRef = db.collection("mergeIntents").doc(sourceUid);
  const intentSnap = await intentRef.get();
  if (!intentSnap.exists) throw new HttpsError("failed-precondition", "Merge intent not found.");
  const intent = intentSnap.data();

  // 2) Servera pusē pārbaudām telefona atbilstību
  const userRecord = await admin.auth().getUser(targetUid).catch(() => null);
  const targetPhone = normalizePhone(userRecord?.phoneNumber || "");
  if (!targetPhone) throw new HttpsError("failed-precondition", "Target user has no verified phone.");
  if (normalizePhone(intent.phone) !== targetPhone) {
    throw new HttpsError("permission-denied", "Phone mismatch.");
  }

  // 3) users/A un users/B
  const srcRef = db.collection("users").doc(sourceUid);
  const dstRef = db.collection("users").doc(targetUid);
  const [srcSnap, dstSnap] = await Promise.all([srcRef.get(), dstRef.get()]);
  const src = srcSnap.exists ? srcSnap.data() : {};
  const dst = dstSnap.exists ? dstSnap.data() : {};

  // 4) Pārvietojam applications no A uz B
  const appsSnap = await db.collection("applications").where("parentId", "==", sourceUid).get();
  const batch = db.batch();
  appsSnap.forEach((d) => {
    batch.update(d.ref, { parentId: targetUid, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  });

  // 5) Sapludinām users/B ar TRŪKSTOŠAJIEM laukiem no A (telefons paliek B)
  const patchDst = {};
  const prefer = (a, b) => (a == null || a === "" ? b ?? null : a);
  patchDst.displayName  = prefer(dst.displayName,  src.displayName);
  patchDst.email        = prefer(dst.email,        src.email);
  patchDst.address      = prefer(dst.address,      src.address);
  patchDst.personalCode = prefer(dst.personalCode, src.personalCode);
  patchDst.legacy = {
    ...(dst.legacy || {}),
    matched: (dst.legacy?.matched || src.legacy?.matched) ? true : false,
    matches: Math.max(dst.legacy?.matches || 0, src.legacy?.matches || 0),
  };
  patchDst.mergedFrom = sourceUid;
  patchDst.updatedAt = admin.firestore.FieldValue.serverTimestamp();

  batch.set(dstRef, patchDst, { merge: true });

  // 6) Atzīmējam users/A kā apvienotu
  const patchSrc = { mergedTo: targetUid, disabled: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
  batch.set(srcRef, patchSrc, { merge: true });

  // 7) Dzēšam intent
  batch.delete(intentRef);

  await batch.commit();

  return { ok: true, movedApplications: appsSnap.size };
});
