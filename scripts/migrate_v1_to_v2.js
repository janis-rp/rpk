/* eslint-disable no-undef */
// scripts/migrate_v1_to_v2.js
// Migrācija uz shēmu: child/{id} ar parentIds: string[]
//  - 1) child.parentId -> parentIds: [uid] (un dzēš parentId)
//  - 2) parent.children[] (LV lauki) -> upsert child doc (pēc personaskods; ja nav, pēc vards+uzvards+dzimsanasDatums)
//  - Datumu normalizācija: "YYYY.MM.DD" vai "DD.MM.YYYY" -> "YYYY-MM-DD"
//  - Idempotents (droši palaist atkārtoti)
//  - DRY-RUN: node scripts/migrate_v1_to_v2.js --dry

const admin = require('firebase-admin');
const DRY = process.argv.includes('--dry');

// ⚙️ ŠEIT norādi, kur glabājas vecāka Auth UID vecā dokumentā.
// Ja tavos parent docs ir 'authUid' vai cits lauks — nomaini te:
const PARENT_UID_FIELD = 'uid';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const fv = admin.firestore.FieldValue;

function isLikelyUid(str) {
  // Heuristika: Firebase UID parasti ir 20-36 zīmju alfanumerisks; ne sākas ar +371
  return (
    typeof str === 'string' &&
    /[A-Za-z]/.test(str) &&
    str.length >= 20 &&
    str.length <= 40
  );
}

function normalizeDate(s) {
  if (!s || typeof s !== 'string') return null;
  const t = s.trim();
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  // YYYY.MM.DD
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(t)) return t.replace(/\./g, '-');
  // DD.MM.YYYY
  const m1 = t.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`;
  // DD-MM-YYYY
  const m2 = t.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;
  return null;
}

function mapStatus(s) {
  if (!s) return null;
  const key = String(s).toLowerCase();
  const map = {
    rindā: 'waitlist',
    waitlist: 'waitlist',
    apstiprināts: 'approved',
    approved: 'approved',
    līgums: 'contract',
    contract: 'contract',
    beidzis: 'finished',
    finished: 'finished',
    izstājies: 'withdrawn',
    withdrawn: 'withdrawn',
    submitted: 'waitlist',
  };
  return map[key] || null;
}

function fingerprintFromChild(emb) {
  // Izmanto kā fallback identificēšanai, ja nav personaskods
  const fn = (emb.vards || emb.firstName || '').trim().toLowerCase();
  const ln = (emb.uzvards || emb.lastName || '').trim().toLowerCase();
  const dob = normalizeDate(emb.dzimsanasDatums || emb.dob || '');
  return `${fn}|${ln}|${dob || ''}`;
}

async function findExistingChildByEmbedded(emb) {
  // 1) mēģinām pēc personaskods
  const pk = emb.personaskods || emb.personalCode;
  if (pk) {
    const q = await db
      .collection('child')
      .where('personalCode', '==', pk)
      .limit(1)
      .get();
    if (!q.empty) return q.docs[0];
  }
  // 2) mēģinām pēc fingerprint
  const fp = fingerprintFromChild(emb);
  if (fp && fp !== '||') {
    const q = await db
      .collection('child')
      .where('fingerprint', '==', fp)
      .limit(1)
      .get();
    if (!q.empty) return q.docs[0];
  }
  return null;
}

function buildChildPayloadFromEmbedded(emb, isNew) {
  const dob = normalizeDate(emb.dzimsanasDatums || emb.dob);
  const startDate = normalizeDate(emb.saksanasDatums || emb.startDate);
  const status = mapStatus(emb.status) || null;

  const payload = {
    firstName: emb.vards ?? emb.firstName ?? null,
    lastName: emb.uzvards ?? emb.lastName ?? null,
    personalCode: emb.personaskods ?? emb.personalCode ?? null,
    dob: dob,
    group: emb.grupina ?? emb.group ?? null,
    address: emb.adrese ?? emb.address ?? null,
    startDate: startDate,
    status: status, // ja nav zināms, paliek null; admin varēs iestatīt
    fingerprint: fingerprintFromChild(emb),
    updatedAt: fv.serverTimestamp(),
  };
  if (isNew) payload.createdAt = fv.serverTimestamp();
  return payload;
}

async function upsertChildForParent(parentUid, emb) {
  // Atrodam vai izveidojam child doc un pievienojam parentUid
  let existing = await findExistingChildByEmbedded(emb);
  let ref = existing ? existing.ref : db.collection('child').doc();
  const isNew = !existing;

  const payload = buildChildPayloadFromEmbedded(emb, isNew);

  if (DRY) {
    console.log(`[DRY] upsert child ${ref.id}`, {
      addParent: parentUid,
      payload,
    });
  } else {
    await ref.set(payload, { merge: true });
    await ref.set({ parentIds: fv.arrayUnion(parentUid) }, { merge: true });
  }
}

async function step1_convertChildParentId() {
  console.log('Step 1: Convert child.parentId -> parentIds[]');
  const snap = await db.collection('child').get();
  let count = 0;
  for (const d of snap.docs) {
    const data = d.data();
    if (typeof data.parentId === 'string') {
      const uid = data.parentId;
      const upd = {
        parentIds: fv.arrayUnion(uid),
        parentId: fv.delete(),
        updatedAt: fv.serverTimestamp(),
      };
      if (DRY) console.log(`[DRY] child ${d.id} ->`, upd);
      else await d.ref.set(upd, { merge: true });
      count++;
    }
  }
  console.log(`Step 1 done: ${count} documents updated.`);
}

async function step2_parentChildrenEmbedded() {
  console.log('Step 2: parent.children[] -> child docs + parentIds');
  const parents = await db.collection('parent').get();
  let processed = 0,
    missingUid = 0;

  for (const p of parents.docs) {
    const pdata = p.data() || {};
    const parentUid =
      pdata[PARENT_UID_FIELD] || (isLikelyUid(p.id) ? p.id : null);

    if (!Array.isArray(pdata.children) || pdata.children.length === 0) continue;

    if (!parentUid) {
      missingUid++;
      console.warn(
        `[WARN] parent ${p.id} lacks UID (${PARENT_UID_FIELD}); skipping add parentIds (children will be created/merged without link).`,
      );
    }

    for (const emb of pdata.children) {
      // Uztaisi/atjauno child doc
      if (parentUid) {
        await upsertChildForParent(parentUid, emb || {});
      } else {
        // Vismaz izveido/atjauno child doc bez parentIds (pēc tam varēsim sasaistīt manuāli ar merge rīku)
        let existing = await findExistingChildByEmbedded(emb || {});
        let ref = existing ? existing.ref : db.collection('child').doc();
        const isNew = !existing;
        const payload = buildChildPayloadFromEmbedded(emb || {}, isNew);
        if (DRY)
          console.log(`[DRY] upsert child (no parentUid) ${ref.id}`, payload);
        else await ref.set(payload, { merge: true });
      }
      processed++;
    }
  }
  console.log(
    `Step 2 done: processed ${processed} embedded children. Parents without UID: ${missingUid}.`,
  );
}

(async () => {
  try {
    await step1_convertChildParentId();
    await step2_parentChildrenEmbedded();
    console.log('Migration finished.', DRY ? '(dry-run)' : '');
    process.exit(0);
  } catch (e) {
    console.error('Migration failed:', e);
    process.exit(1);
  }
})();
