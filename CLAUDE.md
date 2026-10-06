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
- `angular/`: the in-progress Angular rewrite (see Jira epic SCRUM-40). Own
  `package.json`, built separately; `npm run verify` also lints, builds and
  tests it. It is **not** one of the copies above and is not deployed until
  its hosting target (`u14`, site `teamkompass-u14`) exists. Its test team
  is `teamId: U14`, data copied from `mein-team` — never write to
  `mein-team` from there.

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

## Scrum workflow (Jira)

Work is planned in Scrum. The repo owner is the **Product Owner**; Claude
acts as the **development team** (and facilitates: proposes sprint plans,
keeps the board current, reports at sprint end).

- Backlog/board: Jira project `SCRUM` ("Teamkompass") on
  `pascalrdcvh.atlassian.net`, board 1. Epics: SCRUM-5 Sicherheit &
  Datenschutz, SCRUM-6 Bugs, SCRUM-7 Neue Funktionen, SCRUM-8 Technik &
  Wartung. Bugs are `Task` + label `bug` (the project has no Bug type),
  features are `Story`.
- **Claude decides sprint scope and goal** (standing instruction from the PO,
  2026-10-01). The PO still owns the product direction and can change any
  sprint at any time; an explicit PO instruction always wins. Work only on
  tickets in the active sprint, plus critical findings (see below).
- **Critical findings are fixed promptly.** Anything affecting data
  protection, security, data loss or wrong core numbers (marks, workload,
  availability) gets priority `High`, goes into the active sprint
  immediately and is worked next — it does not wait for the next sprint.
  Everything else spotted while working becomes a backlog ticket under the
  matching epic — not silently fixed in an unrelated PR.
- Unclear or contradictory acceptance criteria → ask the PO before
  building, don't guess.
- Ticket flow: `Zu erledigen` → `In Bearbeitung` (when starting) →
  `In Überprüfung` (PR open) → `Erledigt` (merged to `main`, i.e. live).
  Put the key in the PR title and commits (`SCRUM-15: …`) and comment the PR
  link plus a short "what changed / how to check" on the ticket.
- **Ticket comments are written for the PO, in plain German (standing
  instruction from the PO, 2026-10-06).** Not developer jargon (no
  "merge", "listener", file names in the main text). Fixed structure:
  **Was jetzt anders ist** (everyday words), **So prüfst du es**
  (numbered click steps with the URL), **Was noch fehlt / wo ich unsicher
  bin**; technical details (PR link, tests) only briefly at the end. Say
  explicitly what was *not* tried in a real browser. Add screenshots when
  they help: Chromium/Playwright is available in the session; attaching to
  Jira (`uploadAttachmentToJiraIssue`, needs a shell `curl` with the upload
  token) may be blocked by the sandbox, then send the images in the chat
  (`SendUserFile`) and say so. Never put credentials into files, tickets or
  commits.
- **Definition of Done:** acceptance criteria met; change applied to every
  app copy (see "Repo layout"); `npm run verify` green, with a test for the
  fix where the logic is testable; PR merged per the merge workflow below;
  ticket updated as above.
- **Working hours (standing instruction from the PO, 2026-10-01).** The PO
  keeps a free coding window of about 5 hours every day, and wants to review
  tickets in the morning. So: Claude does its development work **at night**
  (a scheduled night session, starting around 22:30 Europe/Berlin, finished by
  about 06:30). During the day Claude does **not** start new tickets and does
  **not** push or merge to `main` — not even right after the PO approves
  tickets — unless the PO explicitly asks in chat. Answering questions and
  small Jira housekeeping are fine at any time.
- **Night-session rules.** Work the active sprint, critical tickets first,
  following everything in this file. Nobody can be asked at night, so
  anything that needs a PO decision (changes to `firestore.rules` or auth with
  uncertain real-world effect, new hosting targets, unclear acceptance
  criteria) stays a **Draft PR**, the ticket goes to `In Überprüfung` with a
  comment saying exactly what the PO has to decide. Everything else follows
  the normal merge workflow. Finish with a short report (what is done, what
  waits for the PO).
- **Morning reminder.** A scheduled job (07:49 Europe/Berlin, daily) pushes
  the list of tickets in `In Überprüfung` and Draft PRs waiting for the PO.
- **Sprint rollover is automatic.** As soon as every ticket of the active
  sprint is `Erledigt`, Claude closes the sprint and starts the next one
  without asking (tool: `manageJiraSprint` via the Atlassian MCP `discover`/
  `executeDestructive`; board 1, create or reuse the next future sprint).
  Next sprint = a name with a short goal, two weeks, filled with the
  highest-priority backlog tickets (critical ones first, then the running
  epic), unfinished tickets carried over. Tell the PO in one short Sprint
  Review: done / not done / what the new sprint contains. Claude only acts
  during an open session; if a session finds a finished sprint, it does the
  rollover first.
