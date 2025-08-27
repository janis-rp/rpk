// Lietošana: node import-legacy-csv.cjs legacy.csv

const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");
const admin = require("firebase-admin");
const iconv = require("iconv-lite");

// ---- Firebase Admin (rpklientiem) ----
// izvēlies VIENU inicializācijas bloku; šeit izmantojam konkrēto JSON atslēgu
if (!admin.apps.length) {
  const serviceAccount = require("C:\\Users\\info\\bernudarza-sistema\\sa-rpklientiem.json");
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: "rpklientiem",
  });
}
const db = admin.firestore();
console.log("Project:", admin.app().options.projectId);

// ---- Palīgfunkcijas ----
const toStr = (v) => (v == null ? "" : String(v).trim());

function isValidPK(pk) {
  return /^\d{6}-\d{5}$/.test(String(pk || "").trim()); // LV PK: 6 cipari-5 cipari
}
function normalizePhoneLocal(input) {
  const s = toStr(input);
  const digits = s.replace(/\D/g, "");
  if (!digits) return { phone: null, phoneE164: null };
  if (digits.length === 8) return { phone: Number(digits), phoneE164: "+371" + digits };
  const e164 = digits.startsWith("371") ? "+" + digits : "+" + digits;
  return { phone: digits, phoneE164: e164 };
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
function fmtYMD(dateObj) {
  if (!dateObj) return "";
  const Y = dateObj.getFullYear();
  const M = String(dateObj.getMonth() + 1).padStart(2, "0");
  const D = String(dateObj.getDate()).padStart(2, "0");
  return `${Y}.${M}.${D}`;
}

// ---- Galvenais skrējiens ----
(async () => {
  try {
    const csvPath = process.argv[2] || "legacy.csv";
    if (!fs.existsSync(csvPath)) {
      console.error("CSV fails nav atrasts:", csvPath);
      process.exit(1);
    }

// Nolasām kā Buffer un mēģinām noteikt kodējumu (UTF-8 BOM / UTF-16 / Win-1257)
const buf = fs.readFileSync(csvPath);
let raw;
if (buf[0] === 0xFF && buf[1] === 0xFE) {
  // UTF-16 LE (Excel “Unicode text”)
  raw = iconv.decode(buf, "utf16-le");
} else if (buf[0] === 0xFE && buf[1] === 0xFF) {
  // UTF-16 BE
  raw = iconv.decode(buf, "utf16-be");
} else if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
  // UTF-8 ar BOM
  raw = iconv.decode(buf, "utf8");
} else {
  // Bez BOM — vispirms mēģinām UTF-8, ja redz “ķeburus” (piem., 'Ã'), pārslēdzam uz Windows-1257 (Baltic)
  const tryUtf8 = iconv.decode(buf, "utf8");
  if (/Ã|Â|Ä|Å/.test(tryUtf8)) {
    raw = iconv.decode(buf, "win1257"); // Windows-1257 (LV)
  } else {
    raw = tryUtf8;
  }
}
  

    // TSV (tabu) fails, bez citēšanas; normalizēsim kolonnas
    const rows = parse(raw, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true, // ļaujam atšķirties; pielabosim zemāk
      delimiter: "\t",          // TAB
      quote: null,              // neinterpretē pēdiņas īpaši
      relax_quotes: true,
      trim: true,
    });

    const EXPECTED_COLS = 20; // A..T (0..19)
    rows.forEach((r, i) => {
      if (r.length !== EXPECTED_COLS) {
        console.warn(`[brīdinājums] Rinda ${i + 1}: atrastas ${r.length} kolonnas (gaidītas ${EXPECTED_COLS}).`);
        if (r.length < EXPECTED_COLS) r.push(...Array(EXPECTED_COLS - r.length).fill(""));
        else r.splice(EXPECTED_COLS);
      }
    });

    // Map pēc vecāka personas koda
    const parents = new Map();
    function upsertParent(fromRow, parent) {
      if (!parent.pk) return;
      const key = parent.pk;
      if (!parents.has(key)) {
        parents.set(key, {
          personaskods: key,
          vards: "", uzvards: "", epasts: "", adrese: "",
          phone: null, phoneE164: null,
          updatedOrder: -1,
          childrenMap: new Map(),
        });
      }
      const p = parents.get(key);
      if (parent.first) p.vards = parent.first;
      if (parent.last)  p.uzvards = parent.last;
      if (parent.email) p.epasts = parent.email;
      if (parent.addr)  p.adrese = parent.addr;
      if (parent.phone) {
        const { phone, phoneE164 } = normalizePhoneLocal(parent.phone);
        if (phone !== null) p.phone = phone;
        if (phoneE164) p.phoneE164 = phoneE164;
      }
      p.updatedOrder = fromRow;
      if (parent.child) {
        const cpk = parent.child.personaskods;
        if (cpk) p.childrenMap.set(cpk, parent.child);
      }
    }

    let totalRows = 0;
    rows.forEach((r, idx) => {
      totalRows++;
      const A = toStr(r[0]);  // datums
      const B = toStr(r[1]);  // grupiņa
      const C = toStr(r[2]);  // bērna vārds
      const D = toStr(r[3]);  // bērna uzvārds
      const E = toStr(r[4]);  // bērna PK
      const F = toStr(r[5]);  // dz. datums
      const G = toStr(r[6]);  // bērna adrese
      const H = toStr(r[7]);  const I = toStr(r[8]);  const J = toStr(r[9]);
      const K = toStr(r[10]); const L = toStr(r[11]); const M = toStr(r[12]);
      // N = r[13] ignorējam
      const O = toStr(r[14]); const P = toStr(r[15]); const Q = toStr(r[16]);
      const Rr= toStr(r[17]); const S = toStr(r[18]); const T = toStr(r[19]);

      const dob = fmtYMD(parseDateFlexible(F));
      const startDate = fmtYMD(parseDateFlexible(A));
      const childObj = E ? {
        vards: C || "", uzvards: D || "", personaskods: E,
        dzimsanasDatums: dob || "", saksanasDatums: startDate || "",
        grupina: B || "", adrese: G || "",
      } : null;

      if (isValidPK(J)) {
        upsertParent(idx, { pk: J, first: H, last: I, phone: K, email: L, addr: M, child: childObj });
      }
      if (isValidPK(Q)) {
        upsertParent(idx, { pk: Q, first: O, last: P, phone: Rr, email: T, addr: S, child: childObj });
      }
    });

    const parentsArr = Array.from(parents.values());
    console.log(`Rindu skaits CSV: ${totalRows}`);
    console.log(`Atrasti vecāki (unikāli pēc personas koda): ${parentsArr.length}`);

    // Rakstīšana Firestore kolekcijā "parent"
    const BATCH_LIMIT = 400;
    let written = 0;
    let batch = db.batch();
    let inBatch = 0;

    for (const p of parentsArr) {
      const children = Array.from(p.childrenMap.values());
      delete p.childrenMap;
      const docData = {
        vards: p.vards || null,
        uzvards: p.uzvards || null,
        epasts: p.epasts || null,
        adrese: p.adrese || null,
        personaskods: p.personaskods,
        phone: p.phone ?? null,
        phoneE164: p.phoneE164 || null,
        updatedOrder: p.updatedOrder,
        children,
      };
      const ref = db.collection("parent").doc(p.personaskods);
      batch.set(ref, docData, { merge: true });

      inBatch++;
      if (inBatch >= BATCH_LIMIT) {
        await batch.commit();
        written += inBatch;
        console.log(`Saglabāti ${written}/${parentsArr.length}`);
        batch = db.batch();
        inBatch = 0;
      }
    }
    if (inBatch > 0) { await batch.commit(); written += inBatch; }

    console.log(`Gatavs. Saglabāti vecāki: ${written}.`);
    process.exit(0);
  } catch (e) {
    console.error("Kļūda importā:", e);
    process.exit(1);
  }
})();
