// Lietošana:
//   node import-legacy-csv.cjs legacy.csv --dry    # izmēģinājums (nekas netiek rakstīts)
//   node import-legacy-csv.cjs legacy.csv          # reāla rakstīšana

const fs = require("fs");
const { parse } = require("csv-parse/sync");
const admin = require("firebase-admin");
const iconv = require("iconv-lite");

const DRY = process.argv.includes("--dry");

// ───────────────── Firebase Admin (rpklientiem) ─────────────────
if (!admin.apps.length) {
  try {
    // Cloud Shell ieteicamais ceļš: iestati GOOGLE_APPLICATION_CREDENTIALS
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: "rpklientiem",
    });
  } catch (e) {
    // Windows lokālai palaišanai (ja vajag cieto ceļu)
    const serviceAccount = require("C:\\Users\\info\\bernudarza-sistema_key\\serviceAccountKey.json");
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: "rpklientiem",
    });
  }
}
const db = admin.firestore();
const fv = admin.firestore.FieldValue;
console.log("Project:", admin.app().options.projectId);

// ───────────────── Palīgfunkcijas ─────────────────
const toStr = (v) => (v == null ? "" : String(v).trim());
const isValidPK = (pk) => /^\d{6}-\d{5}$/.test(String(pk || "").trim());

function normalizePhoneLocal(input) {
  const s = toStr(input);
  const digits = s.replace(/\D/g, "");
  if (!digits) return { phone: null, phoneE164: null, digits: null };
  if (digits.length === 8) return { phone: Number(digits), phoneE164: "+371" + digits, digits: "371" + digits };
  const e164 = digits.startsWith("371") ? "+" + digits : "+" + digits;
  return { phone: digits, phoneE164: e164, digits };
}
function parseDateFlexible(s) {
  const v = toStr(s);
  if (!v) return null;
  let m = v.match(/^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})$/);
  if (m) { const Y=+m[1], M=+m[2], D=+m[3]; if(M>=1&&M<=12&&D>=1&&D<=31) return new Date(Y,M-1,D); }
  m = v.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})$/);
  if (m) { const D=+m[1], M=+m[2], Y=+m[3]; if(M>=1&&M<=12&&D>=1&&D<=31) return new Date(Y,M-1,D); }
  const d = new Date(v); return isNaN(d.getTime()) ? null : d;
}
const fmtYMDdash = (dateObj) => {
  if (!dateObj) return "";
  const Y = dateObj.getFullYear();
  const M = String(dateObj.getMonth() + 1).padStart(2, "0");
  const D = String(dateObj.getDate()).padStart(2, "0");
  return `${Y}-${M}-${D}`;
};

// slug un unikālais docID ģenerators
const slug = (s) => toStr(s).toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, "-")
  .replace(/-+/g, "-")
  .replace(/^-|-$|^\.+|\.+$/g, "");

function uniquifyId(base, usedSet) {
  if (!usedSet.has(base)) { usedSet.add(base); return base; }
  let n = 2;
  while (usedSet.has(`${base}-${n}`)) n++;
  const u = `${base}-${n}`;
  usedSet.add(u);
  return u;
}

// Vecāka identitātes atslēga (DEDUPE): PK → phone → email → last
function parentKeyFromData({ pk, phoneDigits, email, last }) {
  if (isValidPK(pk)) return `pk:${pk}`;
  if (phoneDigits) return `ph:${phoneDigits}`;
  if (email && email.includes("@")) return `em:${email.toLowerCase()}`;
  if (last) return `ln:${last.toLowerCase()}`;
  return null;
}

// Vecāka DOC ID pēc atslēgas (stabils, bez atstarpēm)
function parentDocIdFromKey(key, first, last) {
  if (!key) return null;
  const [t, valRaw] = key.split(":", 2);
  const val = (valRaw || "").toLowerCase();
  if (t === "pk") return `pk-${val.replace(/[^0-9]/g, "")}`;
  if (t === "ph") return `ph-${val.replace(/[^0-9]/g, "")}`;
  if (t === "em") return `em-${val.replace(/[^a-z0-9]/g, "-")}`;
  if (t === "ln") return `nm-${slug(`${first} ${last}`) || slug(last) || "parent"}`;
  return `parent-${slug(val) || "id"}`;
}

// Bērna atslēga (DEDUPE): PK → (vārds+uzvārds+dz.d.)
function childKeyFromData({ cpk, cFirst, cLast, cDob }) {
  if (isValidPK(cpk)) return `cpk:${cpk}`;
  return `c:${(cFirst||"").toLowerCase()}|${(cLast||"").toLowerCase()}|${(cDob||"").toLowerCase()}`;
}

// Bērna DOC ID (stabils, bez atstarpēm)
function childDocIdFromKey(key, cFirst, cLast, cDob) {
  const [t, valRaw] = key.split(":", 2);
  if (t === "cpk") return `cpk-${(valRaw||"").replace(/[^0-9]/g,"")}`;
  // nosaukums + dz.d.
  const dd = (cDob||"").replace(/[^0-9]/g,""); // YYYYMMDD
  const base = `nm-${slug(`${cFirst} ${cLast}`)}${dd ? "-" + dd : ""}`;
  return base || `child-${Math.random().toString(36).slice(2,8)}`;
}

// ───────────────── CSV ielāde un apstrāde ─────────────────
(async () => {
  try {
    const csvPath = process.argv[2] || "legacy.csv";
    if (!fs.existsSync(csvPath)) {
      console.error("CSV fails nav atrasts:", csvPath);
      process.exit(1);
    }

    // nolasa ar kodējuma noteikšanu (UTF-8/UTF-16/Win-1257)
    const buf = fs.readFileSync(csvPath);
    let raw;
    if (buf[0] === 0xFF && buf[1] === 0xFE)      raw = iconv.decode(buf, "utf16-le");
    else if (buf[0] === 0xFE && buf[1] === 0xFF) raw = iconv.decode(buf, "utf16-be");
    else if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) raw = iconv.decode(buf, "utf8");
    else {
      const tryUtf8 = iconv.decode(buf, "utf8");
      raw = /Ã|Â|Ä|Å/.test(tryUtf8) ? iconv.decode(buf, "win1257") : tryUtf8;
    }

    const rows = parse(raw, {
      bom: true, skip_empty_lines: true, relax_column_count: true,
      delimiter: "\t", quote: null, relax_quotes: true, trim: true,
    });

    const EXPECTED_COLS = 20; // A..T
    rows.forEach((r, i) => {
      if (r.length !== EXPECTED_COLS) {
        if (r.length < EXPECTED_COLS) r.push(...Array(EXPECTED_COLS - r.length).fill(""));
        else r.splice(EXPECTED_COLS);
      }
    });

    let totalRows = 0;

    // Tilti: maps un unikālie docID komplekti
    const parentsMap = new Map();   // key -> { docId, data }
    const childrenMap = new Map();  // key -> { docId, data, parentIds:Set, parentNames:Set }
    const usedParentDocIds = new Set();
    const usedChildDocIds = new Set();

    for (const r of rows) {
      totalRows++;
      const A = toStr(r[0]);  // datums (sākšana?)
      const B = toStr(r[1]);  // grupiņa
      const C = toStr(r[2]);  // bērna vārds
      const D = toStr(r[3]);  // bērna uzvārds
      const E = toStr(r[4]);  // bērna PK
      const F = toStr(r[5]);  // dz. datums
      const G = toStr(r[6]);  // bērna adrese

      // 1. vecāks
      const H = toStr(r[7]);   // vārds
      const I = toStr(r[8]);   // uzvārds
      const J = toStr(r[9]);   // PK
      const K = toStr(r[10]);  // tel
      const L = toStr(r[11]);  // e-pasts
      const M = toStr(r[12]);  // adrese

      // N = r[13] (ignorējam)

      // 2. vecāks
      const O = toStr(r[14]);  // vārds
      const P = toStr(r[15]);  // uzvārds
      const Q = toStr(r[16]);  // PK
      const Rr= toStr(r[17]);  // tel
      const S = toStr(r[18]);  // adrese
      const T = toStr(r[19]);  // e-pasts

      const cDob = fmtYMDdash(parseDateFlexible(F));
      const cStart = fmtYMDdash(parseDateFlexible(A));

      // ---- BĒRNS (dedupe pēc PK vai vārds+uzvārds+dz.d.) ----
      const cKey = childKeyFromData({ cpk: E, cFirst: C, cLast: D, cDob });
      if (!childrenMap.has(cKey)) {
        const baseId = childDocIdFromKey(cKey, C, D, cDob);
        const docId = uniquifyId(baseId, usedChildDocIds);
        childrenMap.set(cKey, {
          docId,
          data: {
            firstName: C || null,
            lastName: D || null,
            fullName: [C, D].filter(Boolean).join(" ") || null,
            personalCode: isValidPK(E) ? E : null,
            dob: cDob || null,
            address: G || null,
            group: B || null,
            startDate: cStart || null,
            status: "finished", // bijušie klienti
            createdAt: fv.serverTimestamp(),
            updatedAt: fv.serverTimestamp(),
          },
          parentIds: new Set(),
          parentNames: new Set(),
        });
      } else {
        const c = childrenMap.get(cKey);
        const d = c.data;
        if (!d.firstName && C) d.firstName = C;
        if (!d.lastName && D) d.lastName = D;
        if (!d.fullName) d.fullName = [C, D].filter(Boolean).join(" ") || null;
        if (!d.personalCode && isValidPK(E)) d.personalCode = E;
        if (!d.dob && cDob) d.dob = cDob;
        if (!d.address && G) d.address = G;
        if (!d.group && B) d.group = B;
        if (!d.startDate && cStart) d.startDate = cStart;
      }

      // ---- VECĀKI (2 gab.) ----
      const p1Phone = normalizePhoneLocal(K);
      const p1Key = parentKeyFromData({ pk: J, phoneDigits: p1Phone.digits, email: L, last: I });
      const p2Phone = normalizePhoneLocal(Rr);
      const p2Key = parentKeyFromData({ pk: Q, phoneDigits: p2Phone.digits, email: T, last: P });

      function ensureParent(pKey, first, last, pk, phoneObj, email, addr) {
        if (!pKey) return null; // “neliekam iekšā”
        if (!parentsMap.has(pKey)) {
          const baseDocId = parentDocIdFromKey(pKey, first, last);
          const docId = uniquifyId(baseDocId, usedParentDocIds);
          parentsMap.set(pKey, {
            docId,
            data: {
              firstName: first || null,
              lastName: last || null,
              fullName: [first, last].filter(Boolean).join(" ") || null,
              personalCode: isValidPK(pk) ? pk : null,
              email: email || null,
              phone: phoneObj.phone ?? null,
              phoneE164: phoneObj.phoneE164 || null,
              address: addr || null,
              createdAt: fv.serverTimestamp(),
              updatedAt: fv.serverTimestamp(),
            },
          });
        } else {
          const p = parentsMap.get(pKey);
          const d = p.data;
          if (!d.firstName && first) d.firstName = first;
          if (!d.lastName && last) d.lastName = last;
          if (!d.fullName) d.fullName = [first, last].filter(Boolean).join(" ") || null;
          if (!d.personalCode && isValidPK(pk)) d.personalCode = pk;
          if (!d.email && email) d.email = email;
          if (d.phone == null && phoneObj.phone != null) d.phone = phoneObj.phone;
          if (!d.phoneE164 && phoneObj.phoneE164) d.phoneE164 = phoneObj.phoneE164;
          if (!d.address && addr) d.address = addr;
        }
        return parentsMap.get(pKey).docId;
      }

      const p1Id = ensureParent(p1Key, H, I, J, p1Phone, L, M);
      const p2Id = ensureParent(p2Key, O, P, Q, p2Phone, T, S);

      // piesienam bērnam vecāku DOC ID + saglabājam arī “cilvēcīgos” vārdus tikai skatam
      const cRec = childrenMap.get(cKey);
      if (p1Id) { cRec.parentIds.add(p1Id); cRec.parentNames.add([H, I].filter(Boolean).join(" ")); }
      if (p2Id) { cRec.parentIds.add(p2Id); cRec.parentNames.add([O, P].filter(Boolean).join(" ")); }
    }

    const parentsArr = Array.from(parentsMap.values());
    const childrenArr = Array.from(childrenMap.values());

    console.log(`Rindu skaits CSV: ${totalRows}`);
    console.log(`Vecāki (unikāli pēc PK/telefona/epasta/uzvārda): ${parentsArr.length}`);
    console.log(`Bērni (unikāli pēc PK vai vārds+uzvārds+dz.d.): ${childrenArr.length}`);

    if (DRY) {
      console.log("DRY-RUN: Pirmie 2 vecāki:", parentsArr.slice(0,2));
      console.log("DRY-RUN: Pirmie 2 bērni:", childrenArr.slice(0,2).map(c => ({
        docId: c.docId,
        parentIds: Array.from(c.parentIds),
        parentNames: Array.from(c.parentNames),
        data: c.data,
      })));
      process.exit(0);
    }

    // ───────────────── Rakstīšana Firestore ─────────────────
    const BATCH_LIMIT = 400;

    // 1) PARENT kolekcija
    let batch = db.batch(), n = 0, writtenParents = 0;
    for (const p of parentsArr) {
      batch.set(db.collection("parent").doc(p.docId), p.data, { merge: true });
      if (++n >= BATCH_LIMIT) { await batch.commit(); writtenParents += n; n = 0; batch = db.batch(); }
    }
    if (n > 0) { await batch.commit(); writtenParents += n; }

    // 2) CHILD kolekcija (ar parentIds = DOC ID masīvu)
    batch = db.batch(); n = 0; let writtenChildren = 0;
    for (const c of childrenArr) {
      const payload = {
        ...c.data,
        parentIds: Array.from(c.parentIds),
        parentNames: Array.from(c.parentNames).filter(Boolean),
        updatedAt: fv.serverTimestamp(),
      };
      batch.set(db.collection("child").doc(c.docId), payload, { merge: true });
      if (++n >= BATCH_LIMIT) { await batch.commit(); writtenChildren += n; n = 0; batch = db.batch(); }
    }
    if (n > 0) { await batch.commit(); writtenChildren += n; }

    console.log(`GATAVS. Vecāki: ${writtenParents}. Bērni: ${writtenChildren}.`);
    process.exit(0);
  } catch (e) {
    console.error("Kļūda importā:", e);
    process.exit(1);
  }
})();
