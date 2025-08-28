# /docs/folder-structure.md

## Projekta koka skice
```
bernudarza-sistema/
├─ src/
│  ├─ lib/
│  │  ├─ firebase.js                # Firebase inicializācija (export: app, auth, db, storage)
│  │  └─ createParentProfile.js     # ensureParentProfile(user): izveido parent/{uid} ja trūkst
│  ├─ context/
│  │  └─ AuthContext.jsx            # onAuthStateChanged, claims, loading; izsauc ensureParentProfile
│  ├─ routes/
│  │  ├─ ProtectedRoute.jsx         # gaida loading, sargā maršrutus
│  │  ├─ AdminRoute.jsx             # tikai admin (claims.admin)
│  │  └─ RoleRedirect.jsx           # pāradresē pēc lomām
│  ├─ pages/
│  │  ├─ AuthPage.jsx               # login/signup ar kļūdu kartēm un Google/Facebook
│  │  ├─ Parent.jsx                 # vecāka panelis (pieteikumi + "Mani bērni")
│  │  └─ Admin.jsx                  # administratīvie rīki, pieteikumi; (plānots) lomu redaktors, dublikāti
│  ├─ components/
│  │  └─ TopBar.jsx                 # augšējā josla
│  ├─ main.jsx, App.jsx, index.css  # ieeja/ maršruti/ stils
│  └─ ...
├─ functions/
│  ├─ index.js                      # Gen1 authOnCreate + v2 onCall (mergeParentData, adminUnlinkPhone, completeMerge)
│  └─ package.json                  # engines.node=18
├─ scripts/
│  ├─ import-legacy-csv.cjs         # legacy → parent/child; droši docID; status finished
│  └─ backfill-parent-profiles.cjs  # (vienreiz) profilu izveide visiem Auth lietotājiem
├─ firestore.rules                  # drošības noteikumi (skat. architecture.md)
├─ firebase.json                    # hosting rewrites uz SPA; headers
└─ .env.local (Vite)                # VITE_FIREBASE_* parametri
```

## Konfigurācija (Vite ENV)
```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=rpklientiem.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=rpklientiem
VITE_FIREBASE_STORAGE_BUCKET=rpklientiem.appspot.com
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...   # ja izmanto
```

## Būvēšana un izvietošana
- Klients:
  ```bash
  npm run build
  firebase deploy --only hosting
  ```
- Firestore noteikumi:
  ```bash
  firebase deploy --only firestore:rules
  ```
- Functions (Gen1 + Node 18):
  ```bash
  cd functions
  npm i
  firebase deploy --only functions
  ```

## Operāciju “špikeris”
- **Jauna loma lietotājam** (pēc `setUserRoles` ieviešanas):
  1) Admin lapā ievadīt mērķa UID un lomas CSV (`parent,teacher,…`).
  2) Funkcija atjaunos `users/{uid}.roles`, `parent/{uid}.roles` un custom claims.
  3) Lietotājam jāpārstartē sesija, lai claims stātos spēkā.
- **Legacy import**:
  ```bash
  export GOOGLE_APPLICATION_CREDENTIALS=serviceAccountKey.json
  node scripts/import-legacy-csv.cjs legacy.csv --dry
  node scripts/import-legacy-csv.cjs legacy.csv
  ```
- **Backfill profili** (vienreiz):
  ```bash
  export GOOGLE_APPLICATION_CREDENTIALS=serviceAccountKey.json
  node scripts/backfill-parent-profiles.cjs
  ```

## Konvencijas
- `parent.kind`: `profile` (dzīvais) / `legacy` (vēsturiskais).
- Bērna `parentIds`:
  - legacy → tehniskie legacy parent docID;
  - jaunā plūsma → **UID** (dzīvā vecāka profila docID).
- DocID slugi bez atstarpēm, tikai burti/cipari/domuzīmes.
