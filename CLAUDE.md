# TeamKompass

Static, framework-free HTML/CSS/JS app for managing a youth football team
(squad, events with player ratings, calendar/training scheduling, player
profiles, opponent analysis). No build step, no bundler, no test suite.

## Repo layout — read this before editing

- `index.html` / `app.js` / `styles.css` (repo root): a **simpler reference
  copy**. It is *not* what's actually hosted — see `firebase.json`.
- `outputs/team-manager/`: the app actually deployed to the `main` Firebase
  Hosting target (the live "1. FC Königstein U14" site). Includes features
  the root copy doesn't (auth/role mode, opponent analysis, development
  plans, absences, measurements, formation board, mobile stepper UI) and
  syncs to Firestore per-collection (see `cloudCache`/`cloudSave*` in
  `app.js`), not as one JSON blob.
- `outputs/u17/`: the app deployed to the `u17` Firebase Hosting target.
  Near-byte-identical to `outputs/team-manager` — only team-branding
  strings (name/logo alt text) and `firebase-config.js` (`teamId: "U17"`)
  differ. Diff the two before assuming a change only needs to land once.
- `firestore.rules`: deployed to the real `teamkompass-b8aac` Firebase
  project on every push to `main` that touches this file (see
  `.github/workflows/firestore-rules-deploy.yml`). Trainer role gets
  full read/write; player role is restricted to their own profile/ratings.

**A feature request against "the app" almost always means all three
copies** (root + both `outputs/*`), not just root — root being out of sync
has caused silently-no-op ships before (see git history: #61/#62, #59/#63).
When only one copy is touched, say so explicitly and why.

## PR / merge workflow

Once a PR opened here (by Claude) has green CI and no unresolved blocking
review comments, merge it without waiting for an explicit "please merge"
each time — the repo owner asked for this standing default. This still
means: keep driving CI failures to green and addressing review comments
first, and still ask before merging (or don't merge) if a change is
genuinely ambiguous, architecturally significant, or touches
`firestore.rules`/auth in a way whose real-world effect is uncertain.

Merging to `main` deploys straight to the live, real production app (both
Firebase Hosting targets + Firestore rules) with no staging step — there
is no "merge but don't deploy". Treat that as the standing cost of this
default, not a reason to ask each time.
