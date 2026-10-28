# Who zzit?

AkxH Games — secret-ballot “Most Likely To…” party game.

- **Online lobbies** (Anonymous Firebase Auth + Firestore)
- **Pass & play** on one phone
- Packs in Firestore (`whozzit_words` / `whozzit_packs`); `/admin` password editor

## Stack

Next.js 15 (App Router) · React 19 · Node 24 · Firebase `akxh-games` · jose override `4.15.9`

## Local

```bash
cp .env.example .env.local   # fill Firebase + ADMIN_PASSWORD (same project as Spycy)
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
| `NEXT_PUBLIC_FIREBASE_API_KEY` | client |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | client |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | client |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | client |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | client |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | client |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | Analytics |
| `ADMIN_PASSWORD` | `/admin` |

Also enable **Anonymous Auth** and deploy `firestore.rules` (whozzit_* matches) on project `akxh-games`.

## Collections

- `whozzit_lobbies`
- `whozzit_words` / `whozzit_packs`
- `whozzit_users`
