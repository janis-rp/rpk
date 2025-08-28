# /docs/architecture.md

## Datu modelis

### Kolekcijas
- **`parent`**
  - **Dzīvie profili**: `docId = UID`, ierosinātie lauki:
    - `kind: "profile"`, `source: "auth"`, `roles: ["parent"]`
    - `firstName`, `lastName`, `fullName`, `email`, `phoneE164`, `personalCode?`
    - `createdAt`, `updatedAt`
  - **Legacy**: `docId` tehnisks (`pk-…`, `ph-…`, `em-…`, `nm-…`) 
    - lauki var būt: `vards`, `uzvards`, `epasts`, `phone`, `phoneE164`, `adrese`, `personaskods`, `updatedOrder`, `kind: "legacy"`

- **`child`**
  - `docId`: `cpk-…` vai `nm-vards-uzvards-yyyymmdd`
  - `firstName`, `lastName`, `fullName`, `personalCode?`, `dob?`, `address?`, `group?`
  - `status` (`submitted|waitlist|approved|cancelled|finished|…`)
  - `parentIds: string[]` — **saišu docID**
    - legacy bērniem norāda uz **legacy parent docID**;
    - jaunajiem bērniem norāda uz **UID** (dzīvie profili).
  - `createdAt`, `updatedAt`

- **`users`** (UI metadati)
  - `docId = UID`
  - `roles: string[]`, `legacy?`, `displayName?`, `email?`, `address?`, `personalCode?`, `phone?`, `phoneVerified?`

- **`applications`** (aktīvā pieteikumu plūsma)
  - `parentId = UID`, `child` info + filiāles izvēles, `status`, `createdAt`, `updatedAt`

- **`mergeIntents`**
  - palīgkolekcija datu apvienošanas plūsmai

- **`dedup`** (plānots)
  - potenciālie dublikāti: `{ uid, email, phoneE164, matches: [{id,kind,reason}], status }`

## Saistības
- Vecāks ↔ Bērns: ar **`parentIds`** masīvu bērna dokumentā. Dzīvajā plūsmā — **UID**; legacy — tehniskie parent docID.

## Drošības noteikumi (Firestore Rules — kopsavilkums)
- `parent/{uid}`: 
  - read: admins vai pats lietotājs; 
  - create/update: tikai pats lietotājs (UID sakrīt).
- `users/{uid}`: 
  - read/create/update: tikai pats lietotājs (vai admins).
- `child/{cid}`: 
  - read: admins vai lietotājs, kura UID ir `parentIds`;
  - update: admins vai attiecīgais vecāks, **bez** `parentIds` izmaiņām; 
  - create/delete: tikai admins.
- `applications/{aid}`: 
  - read: admins vai `parentId == UID`;
  - create/update/delete: admins vai `request.resource.data.parentId == UID`.

## Funkcijas (Cloud Functions)
- **Ieviests**
  - `authOnCreate` (Gen1, Node 18): izveido `parent/{uid}` jauniem lietotājiem.
  - `mergeParentData` (v2 onCall): pēc telefona verifikācijas izgūst labāko legacy info un sapludina `users/{uid}`.
  - `adminUnlinkPhone` (v2 onCall): tikai adminiem — noņem Auth phone un attīra `users/{uid}`.
  - `completeMerge` (v2 onCall): apvieno `users` un pārvieto `applications` no `sourceUid` uz `targetUid`.
- **Plānots**
  - `setUserRoles` (v2 onCall): admin maina lietotāja `roles` un custom claims.
  - `checkLegacyDuplicates` (v2 onCall): pārbaude pret legacy pēc e‑pasta/telefona, pieraksts `dedup`.

## Darbplūsmas
- **Login/Signup** → `onAuthStateChanged` → `ensureParentProfile` (ja trūkst) → `RoleRedirect` (admin → `/admin`, citādi `/parent`).
- **Jaunais lietotājs** → `authOnCreate` serverī arī izveido profila dokumentu (rezerves josta).
- **Legacy importi** → skripts `import-legacy-csv.cjs` (Cloud Shell) → status `finished` bērniem.
