# TeamKompass

Static, framework-free HTML/CSS/JS app for managing a youth football team
(squad, events with player ratings, player profiles, opponent analysis). No
build step, no bundler, no test suite.

## Repo layout — read this before editing

- `index.html` / `app.js` / `styles.css` (repo root): a **simpler reference
  copy**. It is *not* what's actually hosted — see `firebase.json`.
- `outputs/team-manager/`: the app actually deployed to the `main` Firebase
  Hosting target (the live "1. FC Königstein U14" site). Includes features
  the root copy doesn't (auth/role mode, opponent analysis, development
  plans, absences, measurements, formation board, mobile stepper UI) and
  syncs to Firestore per-collection (see `cloudCache`/`cloudSave*` in
  `app.js`), not as one JSON blob.
- `outputs/u17/` and `outputs/u15/`: the app deployed to the `u17`/`u15`
  Firebase Hosting targets, one per additional team. Near-byte-identical to
  `outputs/team-manager` — only team-branding strings (name/logo alt text)
  and `firebase-config.js` (`teamId: "U17"` / `"U15"`) differ. Diff against
  `outputs/team-manager` before assuming a change only needs to land once.
  Adding another team (see `FIREBASE_SETUP.md` §6) means one more
  `outputs/<team>/` copy, one more hosting target in `.firebaserc` +
  `firebase.json`, and one more deploy step in
  `.github/workflows/firebase-hosting-merge.yml` — check for new copies
  under `outputs/` rather than assuming the set is still just these three.
- `firestore.rules`: deployed to the real `teamkompass-b8aac` Firebase
  project on every push to `main` that touches this file (see
  `.github/workflows/firestore-rules-deploy.yml`). Trainer role gets
  full read/write; player role is restricted to their own profile/ratings.
  Already generic per `teamId`, so a new team never needs rule changes.

**A feature request against "the app" almost always means every copy**
(root + every `outputs/*` team folder), not just root — root being out of
sync has caused silently-no-op ships before (see git history: #61/#62,
#59/#63). When only one copy is touched, say so explicitly and why.

## PR / merge workflow

Once a PR opened here (by Claude) has green CI and no unresolved blocking
review comments, merge it without waiting for an explicit "please merge"
each time — the repo owner asked for this standing default. This still
means: keep driving CI failures to green and addressing review comments
first, and still ask before merging (or don't merge) if a change is
genuinely ambiguous, architecturally significant, or touches
`firestore.rules`/auth in a way whose real-world effect is uncertain.

Merging to `main` deploys straight to the live, real production app (every
Firebase Hosting target + Firestore rules) with no staging step — there
is no "merge but don't deploy". Treat that as the standing cost of this
default, not a reason to ask each time.

Exception: a PR that adds a *new* hosting target (new `outputs/<team>/`
copy, new entry in `.firebaserc`/`firebase.json`/
`firebase-hosting-merge.yml`) needs the corresponding Firebase Hosting site
created first (`firebase hosting:sites:create <site-id>` or via Firebase
Console — not possible from here without Firebase credentials). Merging
before that site exists makes the new deploy step in the merge workflow
fail on every future merge to `main`, not just this one. Hold that PR and
say so explicitly instead of auto-merging; merge once the repo owner
confirms the site (and the team's first trainer account, per
`FIREBASE_SETUP.md` §6) exists.
