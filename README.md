# Who zzit?

AkxH Games — secret-ballot “Most Likely To…” party game.

- **No Firebase Auth** — display name + UUID in `localStorage`
- **Online lobbies** via Firestore (`whozzit_lobbies`) with **open rules** (no `request.auth`)
- **Pass & play** fully local (sessionStorage)
- Packs in Firestore (`whozzit_words` / `whozzit_packs`); `/admin` password editor (Admin SDK)

## Stack

Next.js 15 (App Router) · React 19 · Node 24 · Firebase `akxh-games` (Firestore + Analytics only) · jose override `4.15.9`

## Identity (plain English)

Firebase’s “Anonymous Auth” was never a real login — it just minted a throwaway account so security rules could say “signed-in users only.” Who zzit? skips that entirely. Your phone invents a random id (`crypto.randomUUID`), stores it next to your display name, and puts that id on lobby player rows. No password, no Google, no Auth console toggle.

`auth/admin-restricted-operation` meant: “Anonymous sign-in is turned off in the Firebase console.” We no longer call that API, so that error is gone.

## Firestore rules (required for online)

Until rules are published, **Pass & play works**; Online create/join shows a permission / deploy error.

**Console (easiest):** Firebase → project **akxh-games** → Firestore → **Rules** → paste the full `firestore.rules` from this repo → **Publish**.  
Step-by-step: see Project doc `docs/whozzit-firebase-rules.md` (or the copy in the AkxH agent store).

Or: `firebase deploy --only firestore:rules --project akxh-games`

Who zzit collections allow unauthenticated lobby read/write; pack **writes** stay Admin-only. The file also keeps Spycy/Ishaare rules — publish the **whole** file, not whozzit-only.

## Local

```bash
cp .env.example .env.local   # fill Firebase web + Admin + ADMIN_PASSWORD (same project as Spycy)
npm install
npm run dev                  # http://localhost:3000
npm run seed                 # optional: push seed packs to Firestore
```

Preview in **Brave** or **Cursor** browser only.

## Env checklist

| Var | Where |
|-----|--------|
| `SITE_URL` | server |
| `FIREBASE_PROJECT_ID` | Admin SDK |
| `FIREBASE_CLIENT_EMAIL` | Admin SDK |
| `FIREBASE_PRIVATE_KEY` | Admin SDK |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | client (Firestore + Analytics) |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | client config (unused for Auth) |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | client |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | client |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | client |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | client |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | Analytics |
| `ADMIN_PASSWORD` | `/admin` |

**Do not enable Anonymous Auth for Who zzit?** — it is unused.

## Collections

- `whozzit_lobbies`
- `whozzit_words` / `whozzit_packs`
- `whozzit_users` (optional name/presence; keyed by local UUID)
