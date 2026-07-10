const storageKey = "teamkompass-data-v2";
const legacyStorageKey = "teamkompass-data-v1";
const themeStorageKey = "teamkompass-theme";

const sampleData = {
  players: [
    { id: "p1", name: "Mika Sommer", positions: ["TW"], number: 1, birthdate: "2002-03-14", status: "Fit" },
    { id: "p2", name: "Jonas Weber", positions: ["IV", "RV"], number: 4, birthdate: "1999-08-22", status: "Fit" },
    { id: "p3", name: "Leon Schulte", positions: ["IV", "LV"], number: 5, birthdate: "2004-01-30", status: "Angeschlagen" },
    { id: "p4", name: "Timo Kranz", positions: ["RV", "RM"], number: 2, birthdate: "2001-05-11", status: "Fit" },
    { id: "p5", name: "Ben Aydin", positions: ["LV", "LM"], number: 19, birthdate: "2005-09-03", status: "Fit" },
    { id: "p6", name: "Noah Klein", positions: ["DM", "ZM"], number: 6, birthdate: "2000-11-18", status: "Fit" },
    { id: "p7", name: "Luis Brandt", positions: ["ZM", "OM"], number: 8, birthdate: "2003-02-07", status: "Fit" },
    { id: "p8", name: "Emil Hartmann", positions: ["OM", "RA"], number: 10, birthdate: "1998-04-25", status: "Pause" },
    { id: "p9", name: "Finn Richter", positions: ["ST", "RA"], number: 7, birthdate: "2002-12-09", status: "Fit" },
    { id: "p10", name: "Malik Özcan", positions: ["LA", "ST"], number: 11, birthdate: "2006-06-17", status: "Fit" },
    { id: "p11", name: "Paul Neumann", positions: ["ST"], number: 9, birthdate: "1997-10-02", status: "Verletzt" }
  ],
  events: [
    {
      id: "e1",
      type: "Training",
      title: "Training Spielfortsetzung",
      date: "2026-06-02",
      intensity: 2,
      location: "Hauptplatz",
      trainingFocus: "Eigener Ballbesitz",
      opponent: "",
      notes: "Schwerpunkt Aufbau über die Sechs.",
      ratings: {
        p1: { attendance: "present", effort: 2, technique: 2, tactics: 3, comprehension: 2, note: "Gute Spieleröffnung." },
        p2: { attendance: "present", effort: 2, technique: 2, tactics: 2, comprehension: 2, note: "Sehr klar im Coaching." },
        p3: { attendance: "limited", effort: 3, technique: 3, tactics: 3, comprehension: 3, note: "Belastung dosiert." },
        p6: { attendance: "present", effort: 1, technique: 2, tactics: 2, comprehension: 2, note: "Viele Lösungen unter Druck." },
        p7: { attendance: "present", effort: 2, technique: 1, tactics: 1, comprehension: 1, note: "Bestes Positionsspiel." },
        p9: { attendance: "present", effort: 2, technique: 2, tactics: 2, comprehension: 2, note: "Gute Tiefenläufe." }
      }
    },
    {
      id: "e2",
      type: "Spiel",
      title: "Heimspiel gegen SV Nord",
      date: "2026-06-06",
      intensity: 3,
      location: "Stadion am Park",
      opponent: "SV Nord",
      goalsFor: 3,
      goalsAgainst: 1,
      matchDuration: 90,
      notes: "3:1 gewonnen, starkes Umschalten nach Ballgewinn.",
      ratings: {
        p1: { attendance: "present", effort: 2, technique: 2, tactics: 2, comprehension: 2, note: "Eine starke Parade." },
        p2: { attendance: "present", effort: 2, technique: 2, tactics: 2, comprehension: 2, note: "Zweikämpfe sauber gelöst." },
        p5: { attendance: "present", effort: 2, technique: 3, tactics: 3, comprehension: 3, note: "Nach vorne mutig." },
        p6: { attendance: "present", effort: 2, technique: 2, tactics: 2, comprehension: 2, note: "Gute Balance." },
        p7: { attendance: "present", effort: 1, technique: 1, tactics: 2, comprehension: 1, note: "Spieler des Tages." },
        p9: { attendance: "present", effort: 2, technique: 2, tactics: 2, comprehension: 2, note: "Tor und Assist." },
        p10: { attendance: "present", effort: 2, technique: 3, tactics: 3, comprehension: 3, note: "Viele Läufe, Abschluss ausbaufähig." },
        p11: { attendance: "absent", effort: "", technique: "", tactics: "", comprehension: "", note: "Verletzt." }
      }
    }
  ],
  developmentPlans: {
    p7: [
      {
        id: "dp1",
        focus: "Orientierung vor Ballannahme",
        goal: "Vor dem ersten Kontakt konsequent Schulterblick einsetzen.",
        actions: "In Rondos und Spielformen gezielt vororientieren lassen.",
        status: "In Arbeit",
        dueDate: "2026-08-31",
        createdAt: "2026-06-02"
      }
    ]
  },
  opponents: [
    {
      id: "o1",
      name: "SV Nord",
      formation: "3-2-3",
      style: "Umschaltspiel",
      strengths: "Schnelle Angriffe über die Außen.",
      weaknesses: "Raum hinter den Außenverteidigern.",
      keyPlayers: "Nr. 9 sehr schnell, Nr. 6 verteilt viele Bälle.",
      setPieces: "Ecken meist auf den ersten Pfosten.",
      gamePlan: "Restverteidigung sichern, nach Ballgewinn schnell breit werden.",
      notes: "Aus dem letzten Heimspiel übernommen.",
      updatedAt: "2026-06-06"
    }
  ],
  selectedEventId: "e2"
};

let state = loadState();
let mobileAccordionsPrepared = false;
const $ = (selector) => document.querySelector(selector);
const standardPositions = ["TW", "IV", "LIB", "LV", "RV", "DM", "ZM", "OM", "LM", "RM", "LA", "RA", "HS", "ST"];

const views = {
  dashboard: $("#dashboardView"),
  squad: $("#squadView"),
  events: $("#eventsView"),
  profiles: $("#profilesView"),
  opponents: $("#opponentsView"),
  teamAnalysis: $("#teamAnalysisView")
};

window.addEventListener("error", (event) => {
  console.error(event.error || event.message);
  const storageState = $("#storageState");
  if (storageState) storageState.textContent = "App-Fehler: Console prüfen";
});

window.addEventListener("unhandledrejection", (event) => {
  console.error(event.reason);
  const storageState = $("#storageState");
  if (storageState) storageState.textContent = "Sync-/App-Fehler";
});

const titles = {
  dashboard: "Dashboard",
  squad: "Kader",
  events: "Events und Bewertungen",
  profiles: "Spielerprofile",
  opponents: "Gegneranalyse",
  teamAnalysis: "Teamanalyse"
};

function initTheme() {
  const storedTheme = localStorage.getItem(themeStorageKey);
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
  applyTheme(storedTheme || (prefersDark ? "dark" : "light"));
}

function applyTheme(theme) {
  const nextTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = nextTheme;
  localStorage.setItem(themeStorageKey, nextTheme);
  const toggle = $("#themeToggle");
  const label = $("#themeToggleText");
  if (toggle) {
    toggle.setAttribute("aria-pressed", String(nextTheme === "dark"));
    toggle.title = nextTheme === "dark" ? "Lightmode einschalten" : "Darkmode einschalten";
  }
  if (label) label.textContent = nextTheme === "dark" ? "Lightmode" : "Darkmode";
}

function toggleTheme() {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  renderAll();
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function chartPalette() {
  return {
    surface: cssVar("--field") || "#fbfcfb",
    panel: cssVar("--panel") || "#ffffff",
    ink: cssVar("--ink") || "#241d1f",
    muted: cssVar("--muted") || "#70686b",
    line: cssVar("--line") || "#e4dcde",
    red: cssVar("--red") || "#d8072e",
    green: cssVar("--green") || "#08714f",
    amber: cssVar("--amber") || "#c9862f",
    soft: cssVar("--soft-panel") || "#f3e8eb"
  };
}

function loadState() {
  const stored = localStorage.getItem(storageKey);
  if (stored) {
    try {
      return normalizeState(JSON.parse(stored));
    } catch {
      return normalizeState(sampleData);
    }
  }

  const legacy = localStorage.getItem(legacyStorageKey);
  if (legacy) {
    try {
      return migrateLegacyState(JSON.parse(legacy));
    } catch {
      return normalizeState(sampleData);
    }
  }

  return normalizeState(sampleData);
}

function normalizeState(data) {
  const events = Array.isArray(data.events) ? data.events : structuredClone(sampleData.events);
  const players = Array.isArray(data.players) ? data.players : structuredClone(sampleData.players);
  const playerIds = new Set(players.map((player) => player.id));
  const developmentPlans = normalizeDevelopmentPlans(data.developmentPlans, playerIds);
  return {
    players: players.map(normalizePlayer),
    events: events.map(normalizeEvent),
    developmentPlans,
    opponents: Array.isArray(data.opponents) ? data.opponents.map(normalizeOpponent) : structuredClone(sampleData.opponents),
    selectedEventId: data.selectedEventId || data.events?.[0]?.id || sampleData.selectedEventId
  };
}

function normalizeDevelopmentPlans(plans = {}, playerIds = new Set()) {
  const normalized = {};
  Object.entries(plans || {}).forEach(([playerId, items]) => {
    if (playerIds.size && !playerIds.has(playerId)) return;
    normalized[playerId] = Array.isArray(items) ? items.map(normalizeDevelopmentPlan) : [];
  });
  playerIds.forEach((playerId) => {
    normalized[playerId] ||= [];
  });
  return normalized;
}

function normalizeDevelopmentPlan(plan = {}) {
  return {
    id: plan.id || `dp${crypto.randomUUID()}`,
    focus: plan.focus || "",
    goal: plan.goal || "",
    actions: plan.actions || "",
    status: plan.status || "Offen",
    dueDate: plan.dueDate || "",
    createdAt: plan.createdAt || new Date().toISOString().slice(0, 10)
  };
}

function normalizeOpponent(opponent = {}) {
  return {
    id: opponent.id || `o${crypto.randomUUID()}`,
    name: opponent.name || "",
    formation: opponent.formation || "",
    style: opponent.style || "Unbekannt",
    strengths: opponent.strengths || "",
    weaknesses: opponent.weaknesses || "",
    keyPlayers: opponent.keyPlayers || "",
    setPieces: opponent.setPieces || "",
    gamePlan: opponent.gamePlan || "",
    notes: opponent.notes || "",
    updatedAt: opponent.updatedAt || new Date().toISOString().slice(0, 10)
  };
}

function normalizePlayer(player) {
  const positions = parsePositions(player.positions || player.position || "");
  if (player.birthdate) return { ...player, positions };
  const year = new Date().getFullYear() - Number(player.age || 20);
  return { ...player, positions, birthdate: `${year}-07-01` };
}

function parsePositions(value) {
  const source = Array.isArray(value) ? value.join(",") : String(value || "");
  const positions = source
    .split(/[,;/|]+/)
    .map((position) => position.trim())
    .filter(Boolean);
  return [...new Set(positions)];
}

function positionText(player) {
  return parsePositions(player.positions || player.position).join(", ") || "-";
}

function positionChips(player) {
  const positions = parsePositions(player.positions || player.position);
  return positions.length
    ? `<div class="position-chips">${positions.map((position) => `<span>${escapeHtml(position)}</span>`).join("")}</div>`
    : "-";
}

function renderPositionPicker(selectedPositions = []) {
  const selected = new Set(selectedPositions);
  $("#positionOptions").innerHTML = standardPositions.map((position) => `
    <label class="position-option">
      <input type="checkbox" value="${position}" ${selected.has(position) ? "checked" : ""} />
      <span>${position}</span>
    </label>
  `).join("");
}

function selectedPlayerPositions() {
  const checked = [...document.querySelectorAll("#positionOptions input:checked")].map((input) => input.value);
  return parsePositions([...checked, $("#playerCustomPositions").value].join(","));
}

function normalizeEvent(event) {
  const ratings = {};
  Object.entries(event.ratings || {}).forEach(([playerId, rating]) => {
    ratings[playerId] = normalizeRating(rating);
  });
  const isGame = event.type === "Spiel";
  return {
    intensity: 2,
    ratings,
    goalsFor: "",
    goalsAgainst: "",
    trainingFocus: isGame ? "" : "Eigener Ballbesitz",
    matchDuration: isGame ? 90 : "",
    ...event,
    ratings,
    intensity: Number(event.intensity || 2),
    goalsFor: event.goalsFor ?? "",
    goalsAgainst: event.goalsAgainst ?? "",
    trainingFocus: isGame ? "" : event.trainingFocus || "Eigener Ballbesitz",
    matchDuration: isGame ? Number(event.matchDuration || 90) : ""
  };
}

function normalizeRating(rating = {}) {
  const fallback = rating.grade || "";
  const normalized = {
    attendance: rating.attendance || "open",
    effort: rating.effort || fallback,
    technique: rating.technique || fallback,
    tactics: rating.tactics || fallback,
    comprehension: rating.comprehension || fallback,
    minutes: rating.minutes ?? "",
    goals: rating.goals ?? "",
    assists: rating.assists ?? "",
    note: rating.note || ""
  };
  normalized.grade = calculatedGrade(normalized);
  return normalized;
}

function calculatedGrade(rating) {
  if (!rating || rating.attendance === "absent") return "";
  const fields = ["effort", "technique", "tactics", "comprehension"];
  if (!fields.every((field) => rating[field])) return "";
  return roundGrade(Number(rating.effort) * 0.3 + Number(rating.technique) * 0.45 + Number(rating.tactics) * 0.2 + Number(rating.comprehension) * 0.05);
}

function migrateLegacyState(data) {
  const migrated = {
    players: Array.isArray(data.players) ? data.players.map(normalizePlayer) : structuredClone(sampleData.players),
    events: structuredClone(sampleData.events),
    selectedEventId: sampleData.selectedEventId
  };
  if (Array.isArray(data.records) && data.records.length) {
    const legacyEvent = {
      id: "e-legacy",
      type: "Training",
      title: "Importierte Leistungsdaten",
      date: data.records.at(-1)?.date || new Date().toISOString().slice(0, 10),
      intensity: 2,
      location: "",
      opponent: "",
      notes: "Aus der alten Leistungserfassung übernommen.",
      ratings: {}
    };
    data.records.forEach((record) => {
      legacyEvent.ratings[record.playerId] = {
        attendance: "present",
        effort: scoreToGrade({ fitness: record.stamina || record.fitness }),
        technique: scoreToGrade({ fitness: record.passes || record.fitness }),
        tactics: scoreToGrade({ fitness: record.passes || record.duels }),
        comprehension: scoreToGrade(record),
        note: record.note || ""
      };
    });
    migrated.events.unshift(legacyEvent);
    migrated.selectedEventId = legacyEvent.id;
  }
  return normalizeState(migrated);
}

function scoreToGrade(record) {
  const score = record.fitness || 70;
  if (score >= 90) return 1;
  if (score >= 78) return 2;
  if (score >= 64) return 3;
  if (score >= 50) return 4;
  if (score >= 35) return 5;
  return 6;
}

function persist() {
  state = normalizeState(state);
  localStorage.setItem(storageKey, JSON.stringify(state));
  if (legacyBlobMode) {
    scheduleLegacyCloudSave();
  } else if (!isCloudActive()) {
    $("#storageState").textContent = `Gespeichert ${new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
  }
}

// ---------------------------------------------------------------------------
// Cloud-Sync. Zwei Modi:
// - Legacy-Blob (Standard, unveraendert seit je her): ein gemeinsames Dokument,
//   kein Login. So verhaelt sich die App weiterhin, solange "enableRoles" in
//   firebase-config.js nicht auf true steht.
// - Rollen-Modus (config.enableRoles === true): echte Anmeldung, Trainer sieht
//   alles, Spieler nur das eigene Profil. Datenmodell + Zugriffsregeln siehe
//   firestore.rules im Repo-Root.
// ---------------------------------------------------------------------------
let currentUser = null;
let currentRole = null; // "trainer" | "player" | null
let currentPlayerId = null;
let authModule = null;
let authInstance = null;
let firestoreDb = null;
let currentTeamId = null;
let cloudUnsubscribers = [];
let legacyBlobMode = false;
let legacyCloudSaveTimer = null;
const cloudCache = { players: [], events: [], ratings: {}, developmentPlans: {}, opponents: [] };

function isCloudActive() {
  return Boolean(firestoreDb);
}

function isCloudTrainer() {
  return isCloudActive() && currentRole === "trainer";
}

function teamDoc(...segments) {
  return firestoreModule.doc(firestoreDb, "teams", currentTeamId, ...segments);
}

function teamCollection(...segments) {
  return firestoreModule.collection(firestoreDb, "teams", currentTeamId, ...segments);
}

async function initDataStore() {
  const config = window.TEAMKOMPASS_CONFIG || {};
  if (config.storage !== "firebase") {
    $("#storageState").textContent = "Lokal gespeichert";
    return;
  }
  currentTeamId = config.teamId || "default-team";
  try {
    const appModule = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js");
    firestoreModule = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js");
    const app = appModule.initializeApp(config.firebase);
    firestoreDb = firestoreModule.getFirestore(app);

    if (!config.enableRoles) {
      await initLegacyBlobSync();
      return;
    }

    authModule = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");
    authInstance = authModule.getAuth(app);
    authModule.onAuthStateChanged(authInstance, (user) => {
      handleAuthStateChanged(user).catch((error) => console.error(error));
    });
  } catch (error) {
    firestoreDb = null;
    $("#storageState").textContent = "Cloud nicht erreichbar";
    console.error(error);
  }
}

// Unveraendertes Verhalten von frueher: ein Dokument, keine Rollen, kein Login.
async function initLegacyBlobSync() {
  legacyBlobMode = true;
  const ref = teamDoc("appState", "current");
  try {
    const snapshot = await firestoreModule.getDoc(ref);
    if (!snapshot.exists()) {
      await firestoreModule.setDoc(ref, { ...normalizeState(state), updatedAt: firestoreModule.serverTimestamp() });
    }
  } catch (error) {
    console.error(error);
  }
  firestoreModule.onSnapshot(ref, (snapshot) => {
    if (!snapshot.exists()) return;
    state = normalizeState(snapshot.data());
    localStorage.setItem(storageKey, JSON.stringify(state));
    renderAll();
    $("#storageState").textContent = "Cloud aktuell";
  }, (error) => console.error(error));
  $("#storageState").textContent = "Cloud verbunden";
}

function scheduleLegacyCloudSave() {
  clearTimeout(legacyCloudSaveTimer);
  legacyCloudSaveTimer = setTimeout(async () => {
    try {
      await firestoreModule.setDoc(teamDoc("appState", "current"), { ...state, updatedAt: firestoreModule.serverTimestamp() });
      $("#storageState").textContent = `Cloud synchronisiert ${new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
    } catch (error) {
      $("#storageState").textContent = "Cloud-Sync fehlgeschlagen";
      console.error(error);
    }
  }, 350);
}

// ---- Rollen-Modus: Auth-Status, Ansicht je nach Rolle ----

async function handleAuthStateChanged(user) {
  currentUser = user;
  stopCloudSync();
  if (!user) {
    currentRole = null;
    currentPlayerId = null;
    await showAuthGate();
    return;
  }
  const memberSnap = await firestoreModule.getDoc(teamDoc("members", user.uid));
  if (!memberSnap.exists()) {
    await showAuthGate();
    return;
  }
  const member = memberSnap.data();
  currentRole = member.role;
  currentPlayerId = member.playerId || null;
  hideAuthGate();
  applyRoleRestrictions();
  startCloudSync();
  $("#storageState").textContent = "Cloud verbunden";
}

function startCloudSync() {
  cloudCache.players = [];
  cloudCache.events = [];
  cloudCache.ratings = {};
  cloudCache.developmentPlans = {};
  cloudCache.opponents = [];

  // Event-Metadaten (Titel/Datum/Ergebnis, keine Noten) sind fuer alle Teammitglieder lesbar.
  cloudUnsubscribers.push(firestoreModule.onSnapshot(teamCollection("events"), (snapshot) => {
    cloudCache.events = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    rebuildStateFromCloudCache();
  }, (error) => console.error("events sync", error)));

  if (currentRole === "trainer") {
    cloudUnsubscribers.push(firestoreModule.onSnapshot(teamCollection("players"), (snapshot) => {
      cloudCache.players = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      rebuildStateFromCloudCache();
    }, (error) => console.error("players sync", error)));

    cloudUnsubscribers.push(firestoreModule.onSnapshot(
      firestoreModule.collectionGroup(firestoreDb, "ratings"),
      (snapshot) => {
        cloudCache.ratings = groupRatingsByEvent(snapshot);
        rebuildStateFromCloudCache();
      },
      (error) => console.error("ratings sync", error)
    ));

    cloudUnsubscribers.push(firestoreModule.onSnapshot(
      firestoreModule.collectionGroup(firestoreDb, "developmentPlans"),
      (snapshot) => {
        cloudCache.developmentPlans = groupPlansByPlayer(snapshot);
        rebuildStateFromCloudCache();
      },
      (error) => console.error("development plans sync", error)
    ));

    cloudUnsubscribers.push(firestoreModule.onSnapshot(teamCollection("opponents"), (snapshot) => {
      cloudCache.opponents = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      rebuildStateFromCloudCache();
    }, (error) => console.error("opponents sync", error)));
  } else if (currentRole === "player" && currentPlayerId) {
    // Ein Spieler darf nie die ganze players-Collection auflisten (Firestore-Regeln
    // erlauben Listenabfragen nur, wenn sie fuer JEDES moegliche Ergebnis gelten -
    // deshalb gezielter Get auf das eigene Dokument statt einer Collection-Abfrage).
    cloudUnsubscribers.push(firestoreModule.onSnapshot(teamDoc("players", currentPlayerId), (docSnap) => {
      cloudCache.players = docSnap.exists() ? [{ id: docSnap.id, ...docSnap.data() }] : [];
      rebuildStateFromCloudCache();
    }, (error) => console.error("player sync", error)));

    cloudUnsubscribers.push(firestoreModule.onSnapshot(
      firestoreModule.query(firestoreModule.collectionGroup(firestoreDb, "ratings"), firestoreModule.where("playerId", "==", currentPlayerId)),
      (snapshot) => {
        cloudCache.ratings = groupRatingsByEvent(snapshot);
        rebuildStateFromCloudCache();
      },
      (error) => console.error("ratings sync", error)
    ));

    cloudUnsubscribers.push(firestoreModule.onSnapshot(
      firestoreModule.query(firestoreModule.collectionGroup(firestoreDb, "developmentPlans"), firestoreModule.where("playerId", "==", currentPlayerId)),
      (snapshot) => {
        cloudCache.developmentPlans = groupPlansByPlayer(snapshot);
        rebuildStateFromCloudCache();
      },
      (error) => console.error("development plans sync", error)
    ));
  }
}

function groupRatingsByEvent(snapshot) {
  const byEvent = {};
  snapshot.forEach((docSnap) => {
    const eventId = docSnap.ref.parent.parent?.id;
    if (!eventId) return;
    byEvent[eventId] ||= {};
    byEvent[eventId][docSnap.id] = docSnap.data();
  });
  return byEvent;
}

function groupPlansByPlayer(snapshot) {
  const byPlayer = {};
  snapshot.forEach((docSnap) => {
    const playerId = docSnap.ref.parent.parent?.id;
    if (!playerId) return;
    byPlayer[playerId] ||= [];
    byPlayer[playerId].push({ id: docSnap.id, ...docSnap.data() });
  });
  return byPlayer;
}

function stopCloudSync() {
  cloudUnsubscribers.forEach((unsubscribe) => unsubscribe());
  cloudUnsubscribers = [];
}

function rebuildStateFromCloudCache() {
  const events = cloudCache.events.map((event) => ({ ...event, ratings: cloudCache.ratings[event.id] || {} }));
  state = normalizeState({
    players: cloudCache.players,
    events,
    developmentPlans: cloudCache.developmentPlans,
    opponents: cloudCache.opponents,
    selectedEventId: state.selectedEventId
  });
  localStorage.setItem(storageKey, JSON.stringify(state));
  renderAll();
}

// ---- Granulare Cloud-Schreibvorgaenge (greifen nur im Rollen-Modus als Trainer,
// per Security Rules serverseitig erzwungen - in jedem anderen Modus ein No-Op) ----

async function cloudSavePlayer(player) {
  if (!isCloudTrainer()) return;
  try { await firestoreModule.setDoc(teamDoc("players", player.id), player); } catch (error) { console.error(error); }
}

async function cloudDeletePlayer(playerId) {
  if (!isCloudTrainer()) return;
  try {
    await firestoreModule.deleteDoc(teamDoc("players", playerId));
    const plans = state.developmentPlans?.[playerId] || [];
    await Promise.all(plans.map((plan) => firestoreModule.deleteDoc(teamDoc("players", playerId, "developmentPlans", plan.id))));
    await Promise.all(state.events.map((event) => (
      event.ratings?.[playerId] ? firestoreModule.deleteDoc(teamDoc("events", event.id, "ratings", playerId)) : Promise.resolve()
    )));
  } catch (error) { console.error(error); }
}

async function cloudSaveEvent(event) {
  if (!isCloudTrainer()) return;
  const { ratings, ...meta } = event;
  try { await firestoreModule.setDoc(teamDoc("events", event.id), meta); } catch (error) { console.error(error); }
}

async function cloudDeleteEvent(event) {
  if (!isCloudTrainer()) return;
  try {
    await firestoreModule.deleteDoc(teamDoc("events", event.id));
    await Promise.all(Object.keys(event.ratings || {}).map((playerId) => firestoreModule.deleteDoc(teamDoc("events", event.id, "ratings", playerId))));
  } catch (error) { console.error(error); }
}

async function cloudSaveRating(eventId, playerId, rating) {
  if (!isCloudTrainer()) return;
  try { await firestoreModule.setDoc(teamDoc("events", eventId, "ratings", playerId), { ...rating, playerId }); } catch (error) { console.error(error); }
}

async function cloudSaveDevelopmentPlan(playerId, plan) {
  if (!isCloudTrainer()) return;
  try { await firestoreModule.setDoc(teamDoc("players", playerId, "developmentPlans", plan.id), { ...plan, playerId }); } catch (error) { console.error(error); }
}

async function cloudDeleteDevelopmentPlan(playerId, planId) {
  if (!isCloudTrainer()) return;
  try { await firestoreModule.deleteDoc(teamDoc("players", playerId, "developmentPlans", planId)); } catch (error) { console.error(error); }
}

async function cloudSaveOpponent(opponent) {
  if (!isCloudTrainer()) return;
  try { await firestoreModule.setDoc(teamDoc("opponents", opponent.id), opponent); } catch (error) { console.error(error); }
}

async function cloudDeleteOpponent(opponentId) {
  if (!isCloudTrainer()) return;
  try { await firestoreModule.deleteDoc(teamDoc("opponents", opponentId)); } catch (error) { console.error(error); }
}

// ---- Auth-Gate (Login), Einladungscodes ----
// Trainer-Konten entstehen absichtlich NICHT ueber die App, sondern ausschliesslich
// manuell in der Firebase-Konsole (siehe FIREBASE_SETUP.md) - hier gibt es deshalb
// bewusst keine Selbstregistrierung, nur einen Login.

function showAuthGate() {
  const gate = $("#authGate");
  if (!gate) return;
  gate.hidden = false;
  document.body.classList.add("auth-locked");
  $("#authGateError").textContent = "";
}

function hideAuthGate() {
  const gate = $("#authGate");
  if (!gate) return;
  gate.hidden = true;
  document.body.classList.remove("auth-locked");
}

function applyRoleRestrictions() {
  document.body.classList.toggle("role-player", currentRole === "player");
  document.body.classList.toggle("role-trainer-cloud", isCloudTrainer());
  $("#signOutBtn").hidden = !isCloudActive();
  $("#migrateDataBtn").hidden = !isCloudTrainer();
  if (currentRole === "player") {
    $("#mobileViewSelect").innerHTML = '<option value="profiles">Profile</option>';
    $("#profilePlayer").disabled = true;
    setView("profiles");
  } else {
    $("#profilePlayer").disabled = false;
    renderAccessManager();
  }
}

async function handleTrainerLogin(event) {
  event.preventDefault();
  const email = $("#trainerLoginEmail").value.trim();
  const password = $("#trainerLoginPassword").value;
  $("#authGateError").textContent = "";
  try {
    await authModule.signInWithEmailAndPassword(authInstance, email, password);
  } catch (error) {
    $("#authGateError").textContent = authErrorMessage(error);
  }
}

async function handlePlayerLogin(event) {
  event.preventDefault();
  const code = $("#playerLoginCode").value.trim();
  $("#authGateError").textContent = "";
  try {
    const inviteRef = teamDoc("invites", code);
    const inviteSnap = await firestoreModule.getDoc(inviteRef);
    if (!inviteSnap.exists() || inviteSnap.data().used) {
      $("#authGateError").textContent = "Dieser Code ist ungueltig oder wurde bereits verwendet.";
      return;
    }
    const playerId = inviteSnap.data().playerId;
    const credential = await authModule.signInAnonymously(authInstance);
    const memberRef = teamDoc("members", credential.user.uid);
    // Transaktion, damit "Code als benutzt markieren" und "Mitgliedschaft anlegen"
    // atomar zusammen gelingen oder beide unterbleiben - kein verbrannter Code ohne
    // zugehoerigen Zugang bei einem Netzwerkfehler zwischen den beiden Schreibvorgaengen.
    await firestoreModule.runTransaction(firestoreDb, async (transaction) => {
      const freshInvite = await transaction.get(inviteRef);
      if (!freshInvite.exists() || freshInvite.data().used) {
        throw new Error("invite-already-used");
      }
      transaction.update(inviteRef, { used: true, claimedBy: credential.user.uid, claimedAt: firestoreModule.serverTimestamp() });
      transaction.set(memberRef, {
        role: "player",
        playerId,
        claimedInviteCode: code,
        expiresAt: freshInvite.data().expiresAt ?? null,
        createdAt: firestoreModule.serverTimestamp()
      });
    });
  } catch (error) {
    if (error.message === "invite-already-used") {
      $("#authGateError").textContent = "Dieser Code wurde inzwischen bereits verwendet.";
    } else {
      $("#authGateError").textContent = authErrorMessage(error);
    }
  }
}

function authErrorMessage(error) {
  const code = error?.code || "";
  if (code.includes("email-already-in-use")) return "Diese E-Mail wird bereits verwendet.";
  if (code.includes("wrong-password") || code.includes("invalid-credential")) return "E-Mail oder Passwort ist falsch.";
  if (code.includes("user-not-found")) return "Kein Trainer-Konto mit dieser E-Mail gefunden.";
  if (code.includes("weak-password")) return "Das Passwort muss mindestens 6 Zeichen haben.";
  if (code.includes("operation-not-allowed")) return "Diese Anmeldemethode ist in der Firebase-Konsole noch nicht aktiviert.";
  if (code.includes("permission-denied") || code.includes("insufficient-permissions")) {
    return "Zugriff von den Firestore-Regeln verweigert (permission-denied). Pruefe, ob firestore.rules wirklich veroeffentlicht wurde.";
  }
  console.error(error);
  return `Etwas ist schiefgelaufen${code ? ` (Code: ${code})` : ""}. Bitte erneut versuchen.`;
}

async function handleSignOut() {
  if (!authInstance) return;
  await authModule.signOut(authInstance);
}

async function createInviteCodeForPlayer(playerId) {
  if (!isCloudTrainer()) return;
  const daysInput = prompt("Zugang befristen? Anzahl Tage ab der Anmeldung eingeben, oder leer lassen fuer unbegrenzten Zugang:", "");
  if (daysInput === null) return;
  const days = Number(daysInput.trim());
  const hasLimit = daysInput.trim() !== "" && Number.isFinite(days) && days > 0;
  const expiresAt = hasLimit ? firestoreModule.Timestamp.fromDate(new Date(Date.now() + days * 24 * 60 * 60 * 1000)) : null;
  const code = String(Math.floor(100000 + Math.random() * 900000));
  try {
    await firestoreModule.setDoc(teamDoc("invites", code), {
      playerId,
      used: false,
      expiresAt,
      createdAt: firestoreModule.serverTimestamp()
    });
    const player = state.players.find((item) => item.id === playerId);
    const validity = hasLimit ? `gueltig fuer ${days} Tage ab der Anmeldung` : "unbegrenzt gueltig";
    alert(`Einladungscode fuer ${player?.name || "Spieler"}: ${code}\n\nGib diesen Code an den Spieler weiter - er gilt einmalig fuer die Anmeldung (${validity}).`);
    renderAccessManager();
  } catch (error) {
    console.error(error);
    alert(`Einladungscode konnte nicht erstellt werden.${cloudErrorSuffix(error)}`);
  }
}

function cloudErrorSuffix(error) {
  const code = error?.code || "";
  return code ? ` (Code: ${code})` : "";
}

async function renderAccessManager() {
  if (!isCloudTrainer()) return;
  const list = $("#accessManagerList");
  if (!list) return;
  try {
    const snapshot = await firestoreModule.getDocs(
      firestoreModule.query(teamCollection("members"), firestoreModule.where("role", "==", "player"))
    );
    const now = new Date();
    list.innerHTML = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      const player = state.players.find((item) => item.id === data.playerId);
      const expiresAtDate = data.expiresAt?.toDate ? data.expiresAt.toDate() : null;
      let status = "Unbegrenzt gueltig";
      if (expiresAtDate) {
        status = expiresAtDate < now
          ? `Abgelaufen seit ${formatDate(expiresAtDate.toISOString().slice(0, 10))}`
          : `Gueltig bis ${formatDate(expiresAtDate.toISOString().slice(0, 10))}`;
      }
      return `
        <div class="access-row">
          <div><strong>${escapeHtml(player?.name || data.playerId)}</strong><span class="muted">${status}</span></div>
          <button class="ghost-button" data-action="revoke-access" data-uid="${docSnap.id}" type="button">Zugang sperren</button>
        </div>
      `;
    }).join("") || `<p class="muted">Noch keine Spieler-Zugaenge vergeben.</p>`;
  } catch (error) {
    console.error(error);
  }
}

async function revokeAccess(uid) {
  if (!isCloudTrainer()) return;
  if (!confirm("Zugang wirklich sperren? Der Spieler muesste sich danach mit einem neuen Code anmelden.")) return;
  try {
    await firestoreModule.deleteDoc(teamDoc("members", uid));
    renderAccessManager();
  } catch (error) {
    console.error(error);
    alert(`Zugang konnte nicht gesperrt werden.${cloudErrorSuffix(error)}`);
  }
}

async function migrateLegacyBlobToCollections() {
  if (!isCloudTrainer()) return;
  if (!confirm("Bestehende Cloud-Daten aus dem alten Format in die neue Struktur uebertragen?")) return;
  try {
    const legacySnap = await firestoreModule.getDoc(teamDoc("appState", "current"));
    if (!legacySnap.exists()) {
      alert("Keine alten Cloud-Daten gefunden.");
      return;
    }
    const legacy = normalizeState(legacySnap.data());
    await Promise.all(legacy.players.map((player) => cloudSavePlayer(player)));
    await Promise.all(legacy.events.map(async (event) => {
      await cloudSaveEvent(event);
      await Promise.all(Object.entries(event.ratings || {}).map(([playerId, rating]) => cloudSaveRating(event.id, playerId, rating)));
    }));
    await Promise.all(Object.entries(legacy.developmentPlans || {}).flatMap(([playerId, plans]) =>
      plans.map((plan) => cloudSaveDevelopmentPlan(playerId, plan))
    ));
    await Promise.all(legacy.opponents.map((opponent) => cloudSaveOpponent(opponent)));
    alert("Migration abgeschlossen. Das alte Dokument bleibt vorerst unveraendert erhalten.");
  } catch (error) {
    console.error(error);
    alert("Migration fehlgeschlagen: " + (error.message || error));
  }
}

function setView(viewName) {
  Object.entries(views).forEach(([name, element]) => element.classList.toggle("active", name === viewName));
  document.querySelectorAll(".nav-tab").forEach((button) => button.classList.toggle("active", button.dataset.view === viewName));
  if ($("#mobileViewSelect")) $("#mobileViewSelect").value = viewName;
  $("#pageTitle").textContent = titles[viewName];
  if (viewName === "dashboard") { renderMetrics(); renderPitch(); renderLeaders(); }
  if (viewName === "squad") {
    renderSquad();
    if (isCloudTrainer()) renderAccessManager();
  }
  if (viewName === "profiles") drawProfile();
  if (viewName === "opponents") renderOpponentAnalysis();
  if (viewName === "teamAnalysis") renderTeamAnalysis();
  prepareMobileAccordions();
}

function prepareMobileAccordions() {
  const isMobile = window.matchMedia?.("(max-width: 720px)")?.matches;
  if (!isMobile || mobileAccordionsPrepared) return;
  document.querySelectorAll(".dashboard-section").forEach((section, index) => {
    section.open = index === 0;
  });
  document.querySelectorAll(".control-disclosure").forEach((section) => {
    section.open = false;
  });
  mobileAccordionsPrepared = true;
}

function selectedEvent() {
  return state.events.find((event) => event.id === state.selectedEventId) || state.events[0];
}

function sortedEvents() {
  return [...state.events].sort((a, b) => new Date(b.date) - new Date(a.date));
}

function playerRatings(playerId) {
  return sortedEvents()
    .map((event) => ({ event, rating: event.ratings?.[playerId] }))
    .filter(({ rating }) => rating && rating.attendance !== "absent" && rating.grade);
}

function playerAverageGrade(playerId) {
  const ratings = playerRatings(playerId);
  if (!ratings.length) return null;
  const sum = ratings.reduce((total, item) => total + Number(item.rating.grade), 0);
  return roundGrade(sum / ratings.length);
}

function playerAttendanceCount(playerId) {
  return state.events.filter((event) => event.ratings?.[playerId]?.attendance === "present" || event.ratings?.[playerId]?.attendance === "limited").length;
}

function playerInjuryRisk(playerId) {
  const player = state.players.find((item) => item.id === playerId);
  const recentRatings = sortedEvents()
    .filter((event) => event.ratings?.[playerId]?.attendance === "present" || event.ratings?.[playerId]?.attendance === "limited")
    .slice(0, 6);
  const load = recentRatings.reduce((sum, event) => {
    const attendanceFactor = event.ratings[playerId].attendance === "limited" ? 0.6 : 1;
    return sum + Number(event.intensity || 2) * attendanceFactor;
  }, 0);
  const averageRecentGrade = recentRatings.length
    ? recentRatings.reduce((sum, event) => sum + Number(event.ratings[playerId].grade || 3), 0) / recentRatings.length
    : 0;
  let score = load * 7;
  if (recentRatings.length >= 4) score += 10;
  if (averageRecentGrade >= 4) score += 12;
  if (player?.status === "Angeschlagen") score += 24;
  if (player?.status === "Verletzt") score += 45;
  if (player?.status === "Pause") score += 10;
  const percentage = Math.max(0, Math.min(100, Math.round(score)));
  const level = percentage >= 70 ? "Hoch" : percentage >= 40 ? "Mittel" : "Niedrig";
  return { percentage, level, load: roundGrade(load), recentEvents: recentRatings.length };
}

function roundGrade(value) {
  return Math.round(value * 10) / 10;
}

function gradeLabel(value) {
  return value ? value.toFixed(1).replace(".", ",") : "-";
}

function gradeToPercent(value) {
  if (!value) return 0;
  return Math.max(0, Math.min(100, Math.round(((6 - value) / 5) * 100)));
}

function intensityLabel(value) {
  const labels = { 1: "niedrig", 2: "mittel", 3: "hoch" };
  return `${value || 2} · ${labels[value] || "mittel"}`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("de-DE");
}

function ageFromBirthdate(value) {
  if (!value) return null;
  const today = new Date();
  const birthdate = new Date(`${value}T00:00:00`);
  let age = today.getFullYear() - birthdate.getFullYear();
  const hadBirthday = today.getMonth() > birthdate.getMonth() || (today.getMonth() === birthdate.getMonth() && today.getDate() >= birthdate.getDate());
  if (!hadBirthday) age -= 1;
  return age;
}

function gameEvents() {
  return state.events.filter((event) => event.type === "Spiel");
}

function gameResult(event) {
  if (event.type !== "Spiel" || event.goalsFor === "" || event.goalsAgainst === "") return null;
  const goalsFor = Number(event.goalsFor);
  const goalsAgainst = Number(event.goalsAgainst);
  return {
    goalsFor,
    goalsAgainst,
    outcome: goalsFor > goalsAgainst ? "Sieg" : goalsFor < goalsAgainst ? "Niederlage" : "Unentschieden"
  };
}

function teamAverageGradeForEvent(event) {
  const grades = Object.values(event.ratings || {})
    .filter((rating) => rating.attendance !== "absent" && rating.grade)
    .map((rating) => Number(rating.grade));
  if (!grades.length) return null;
  return roundGrade(grades.reduce((sum, grade) => sum + grade, 0) / grades.length);
}

function teamStats() {
  const games = gameEvents();
  const results = games.map(gameResult).filter(Boolean);
  const wins = results.filter((result) => result.outcome === "Sieg").length;
  const draws = results.filter((result) => result.outcome === "Unentschieden").length;
  const losses = results.filter((result) => result.outcome === "Niederlage").length;
  const goalsFor = results.reduce((sum, result) => sum + result.goalsFor, 0);
  const goalsAgainst = results.reduce((sum, result) => sum + result.goalsAgainst, 0);
  const eventGrades = state.events.map(teamAverageGradeForEvent).filter(Boolean);
  const avgGrade = eventGrades.length ? roundGrade(eventGrades.reduce((sum, grade) => sum + grade, 0) / eventGrades.length) : null;
  const attendances = state.events.flatMap((event) => Object.values(event.ratings || {}).map((rating) => rating.attendance));
  const attendanceRate = attendances.length
    ? Math.round((attendances.filter((value) => value === "present" || value === "limited").length / attendances.length) * 100)
    : 0;
  const avgIntensity = state.events.length ? roundGrade(state.events.reduce((sum, event) => sum + Number(event.intensity || 2), 0) / state.events.length) : null;
  return { games: games.length, wins, draws, losses, goalsFor, goalsAgainst, avgGrade, attendanceRate, avgIntensity };
}

function birthQuarterCounts() {
  return state.players.reduce((counts, player) => {
    if (!player.birthdate) return counts;
    const month = new Date(`${player.birthdate}T00:00:00`).getMonth();
    const quarter = `Q${Math.floor(month / 3) + 1}`;
    counts[quarter] += 1;
    return counts;
  }, { Q1: 0, Q2: 0, Q3: 0, Q4: 0 });
}

function ageGroupCounts() {
  return state.players.reduce((counts, player) => {
    const age = ageFromBirthdate(player.birthdate);
    if (age === null) return counts;
    const key = age <= 20 ? "U21" : age <= 23 ? "21-23" : age <= 27 ? "24-27" : "28+";
    counts[key] += 1;
    return counts;
  }, { U21: 0, "21-23": 0, "24-27": 0, "28+": 0 });
}

function positionCoverage() {
  const coverage = {};
  state.players.forEach((player) => {
    parsePositions(player.positions || player.position).forEach((position) => {
      coverage[position] = (coverage[position] || 0) + 1;
    });
  });
  return Object.entries(coverage).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "de"));
}

function profileSkillAverages(ratings) {
  const fields = [
    ["effort", "Einsatz"],
    ["technique", "Technik"],
    ["tactics", "Taktik"],
    ["comprehension", "Auffassung"]
  ];
  return fields.map(([field, label]) => {
    const values = ratings.map((item) => Number(item.rating[field])).filter(Boolean);
    return { label, value: values.length ? roundGrade(values.reduce((sum, value) => sum + value, 0) / values.length) : null };
  });
}

function profileAvailability(playerId) {
  const relevant = state.events.map((event) => event.ratings?.[playerId]?.attendance || "open");
  const total = Math.max(relevant.length, 1);
  const present = relevant.filter((value) => value === "present").length;
  const limited = relevant.filter((value) => value === "limited").length;
  const absent = relevant.filter((value) => value === "absent").length;
  return [
    { label: "Anwesend", value: Math.round((present / total) * 100), display: `${present}/${total}` },
    { label: "Teilweise", value: Math.round((limited / total) * 100), display: `${limited}/${total}` },
    { label: "Fehlt", value: Math.round((absent / total) * 100), display: `${absent}/${total}` }
  ];
}

function playerGameStats(playerId) {
  const games = gameEvents();
  const gameRatings = games
    .map((event) => ({ event, rating: event.ratings?.[playerId] }))
    .filter(({ rating }) => rating && rating.attendance !== "absent");
  const appearances = gameRatings.filter(({ rating }) => Number(rating.minutes || 0) > 0 || rating.attendance === "present" || rating.attendance === "limited").length;
  const minutes = gameRatings.reduce((sum, item) => sum + Number(item.rating.minutes || 0), 0);
  const possibleMinutes = games.reduce((sum, event) => sum + Number(event.matchDuration || 90), 0);
  const goals = gameRatings.reduce((sum, item) => sum + Number(item.rating.goals || 0), 0);
  const assists = gameRatings.reduce((sum, item) => sum + Number(item.rating.assists || 0), 0);
  const scorers = goals + assists;
  const gameCount = Math.max(games.length, 0);
  return {
    games: gameCount,
    appearances,
    minutes,
    possibleMinutes,
    goals,
    assists,
    scorers,
    appearanceRate: possibleMinutes ? Math.round((minutes / possibleMinutes) * 100) : 0,
    scorersPerGame: appearances ? roundGrade(scorers / appearances) : null,
    minutesPerGame: appearances ? Math.round(minutes / appearances) : 0
  };
}

function statLabel(value) {
  if (value === null || value === undefined) return "-";
  return String(value).replace(".", ",");
}

function bestDevelopment(ratings) {
  if (ratings.length < 2) return null;
  const first = Number(ratings[0].rating.grade);
  const last = Number(ratings.at(-1).rating.grade);
  return roundGrade(first - last);
}

function renderMetrics() {
  const fitPlayers = state.players.filter((player) => player.status === "Fit").length;
  const gradedRatings = state.players.map((player) => playerAverageGrade(player.id)).filter(Boolean);
  const teamGrade = gradedRatings.length ? roundGrade(gradedRatings.reduce((sum, grade) => sum + grade, 0) / gradedRatings.length) : null;
  const highRiskPlayers = state.players.filter((player) => playerInjuryRisk(player.id).level === "Hoch").length;
  const stats = teamStats();
  const nextEvent = sortedEvents().find((event) => new Date(event.date) >= startOfToday());
  const metrics = [
    ["Kader", state.players.length],
    ["Fit", fitPlayers],
    ["Events", state.events.length],
    ["Teamnote", gradeLabel(teamGrade)],
    ["Bilanz", `${stats.wins}-${stats.draws}-${stats.losses}`],
    ["Tore", `${stats.goalsFor}:${stats.goalsAgainst}`],
    ["Risiko hoch", highRiskPlayers]
  ];
  $("#metricsGrid").innerHTML = metrics.map(([label, value]) => `<article class="metric"><span>${label}</span><strong>${value}</strong></article>`).join("");
  if (nextEvent) $("#metricsGrid").innerHTML += `<article class="metric metric-wide"><span>Nächstes Event</span><strong>${nextEvent.date}</strong><small>${nextEvent.title}</small></article>`;
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function renderPitch() {
  const formations = {
    "4-3-3": [
      { label: "TW", x: 50, y: 90, matches: ["TW"] },
      { label: "LV", x: 18, y: 68, matches: ["LV", "LM"] },
      { label: "IV", x: 38, y: 70, matches: ["IV", "LIB"] },
      { label: "IV", x: 62, y: 70, matches: ["IV", "LIB"] },
      { label: "RV", x: 82, y: 68, matches: ["RV", "RM"] },
      { label: "ZM", x: 28, y: 48, matches: ["ZM", "DM"] },
      { label: "DM", x: 50, y: 43, matches: ["DM", "ZM"] },
      { label: "ZM", x: 72, y: 48, matches: ["ZM", "OM"] },
      { label: "LA", x: 22, y: 22, matches: ["LA", "LM", "ST"] },
      { label: "ST", x: 50, y: 16, matches: ["ST", "HS"] },
      { label: "RA", x: 78, y: 22, matches: ["RA", "RM", "ST"] }
    ],
    "4-2-3-1": [
      { label: "TW", x: 50, y: 90, matches: ["TW"] },
      { label: "LV", x: 18, y: 68, matches: ["LV", "LM"] },
      { label: "IV", x: 38, y: 70, matches: ["IV", "LIB"] },
      { label: "IV", x: 62, y: 70, matches: ["IV", "LIB"] },
      { label: "RV", x: 82, y: 68, matches: ["RV", "RM"] },
      { label: "DM", x: 38, y: 52, matches: ["DM", "ZM"] },
      { label: "DM", x: 62, y: 52, matches: ["DM", "ZM"] },
      { label: "LA", x: 24, y: 33, matches: ["LA", "LM", "OM"] },
      { label: "OM", x: 50, y: 29, matches: ["OM", "ZM", "HS"] },
      { label: "RA", x: 76, y: 33, matches: ["RA", "RM", "OM"] },
      { label: "ST", x: 50, y: 15, matches: ["ST", "HS"] }
    ],
    "3-5-2": [
      { label: "TW", x: 50, y: 90, matches: ["TW"] },
      { label: "IV", x: 28, y: 69, matches: ["IV", "LV"] },
      { label: "IV", x: 50, y: 72, matches: ["IV", "LIB"] },
      { label: "IV", x: 72, y: 69, matches: ["IV", "RV"] },
      { label: "LM", x: 16, y: 48, matches: ["LM", "LV", "LA"] },
      { label: "ZM", x: 36, y: 45, matches: ["ZM", "DM"] },
      { label: "DM", x: 50, y: 42, matches: ["DM", "ZM"] },
      { label: "ZM", x: 64, y: 45, matches: ["ZM", "OM"] },
      { label: "RM", x: 84, y: 48, matches: ["RM", "RV", "RA"] },
      { label: "ST", x: 40, y: 18, matches: ["ST", "HS", "LA"] },
      { label: "ST", x: 60, y: 18, matches: ["ST", "HS", "RA"] }
    ]
  };
  const candidates = state.players
    .filter((player) => player.status !== "Verletzt")
    .sort((a, b) => (playerAverageGrade(a.id) || 9) - (playerAverageGrade(b.id) || 9) || a.number - b.number);
  const slots = formations[$("#formationSelect").value];
  const assigned = assignFormationSlots(slots, candidates);
  $("#pitch").innerHTML = assigned.map(({ slot, player }) => {
    if (!player) {
      return `
        <div class="pitch-player empty-slot" style="left:${slot.x}%;top:${slot.y}%">
          <em>${slot.label}</em>
          <strong>Offen</strong>
          <span>keine passende Position</span>
        </div>
      `;
    }
    const grade = playerAverageGrade(player.id);
    const matchedPosition = bestMatchedPosition(player, slot);
    return `
      <div class="pitch-player" style="left:${slot.x}%;top:${slot.y}%">
        <em>${slot.label}</em>
        <strong>${player.number} ${escapeHtml(player.name.split(" ").at(-1))}</strong>
        <span>${matchedPosition} · Note ${gradeLabel(grade)}</span>
      </div>
    `;
  }).join("");
  const teamGradeEl = $("#pitchTeamGrade");
  if (teamGradeEl) {
    const startingGrades = assigned.map(({ player }) => player && playerAverageGrade(player.id)).filter(Boolean);
    const teamGrade = startingGrades.length ? roundGrade(startingGrades.reduce((sum, value) => sum + value, 0) / startingGrades.length) : null;
    teamGradeEl.textContent = teamGrade ? `Mannschaftsnote Ø ${gradeLabel(teamGrade)}` : "Mannschaftsnote noch ohne Bewertungen";
  }
}

// Waehlt aus allen verfuegbaren Spielern die beste GESAMT-Elf fuer die Formation:
// jeder Spieler besetzt hoechstens einen Slot und nur eine Position, die er laut
// seinem Profil auch spielen kann (slot.matches). Optimiert wird per Bitmask-DP
// (ein Slot pro Bit) zuerst auf moeglichst wenige offene Positionen, danach auf
// den besten Notendurchschnitt der Elf - statt slot-fuer-slot naiv den jeweils
// besten verfuegbaren Spieler zu nehmen, was einzelne Positionen unnoetig
// freilassen oder eine schwaechere Gesamtelf ergeben kann.
function assignFormationSlots(slots, candidates) {
  const slotCount = slots.length;
  const fullMask = (1 << slotCount) - 1;
  const eligibility = candidates.map((player) => {
    const positions = parsePositions(player.positions || player.position);
    return slots.reduce((bits, slot, index) => (slot.matches.some((label) => positions.includes(label)) ? bits | (1 << index) : bits), 0);
  });

  let dp = new Array(fullMask + 1).fill(Infinity);
  let parent = new Array(fullMask + 1).fill(null);
  dp[0] = 0;

  candidates.forEach((player, playerIndex) => {
    const bits = eligibility[playerIndex];
    if (!bits) return;
    const positions = parsePositions(player.positions || player.position);
    const grade = playerAverageGrade(player.id) || 9;
    const dpNext = dp.slice();
    const parentNext = parent.slice();
    for (let mask = 0; mask <= fullMask; mask++) {
      if (!Number.isFinite(dp[mask])) continue;
      for (let slotIndex = 0; slotIndex < slotCount; slotIndex++) {
        const bit = 1 << slotIndex;
        if (!(bits & bit) || (mask & bit)) continue;
        // winziger Bonus fuer die exakt gelistete Position, damit bei gleicher
        // Note die natuerlichere Position bevorzugt wird (Notenunterschiede sind
        // immer mindestens 0.1, dieser Bonus veraendert also nie die echte Wahl)
        const cost = grade + (positions.includes(slots[slotIndex].label) ? 0 : 0.01);
        const newMask = mask | bit;
        if (dp[mask] + cost < dpNext[newMask]) {
          dpNext[newMask] = dp[mask] + cost;
          parentNext[newMask] = { prevMask: mask, playerIndex, slotIndex };
        }
      }
    }
    dp = dpNext;
    parent = parentNext;
  });

  let bestMask = 0;
  for (let mask = 0; mask <= fullMask; mask++) {
    if (!Number.isFinite(dp[mask])) continue;
    if (popcount(mask) > popcount(bestMask) || (popcount(mask) === popcount(bestMask) && dp[mask] < dp[bestMask])) {
      bestMask = mask;
    }
  }

  const slotPlayer = new Array(slotCount).fill(null);
  for (let mask = bestMask; mask; ) {
    const step = parent[mask];
    if (!step) break;
    slotPlayer[step.slotIndex] = candidates[step.playerIndex];
    mask = step.prevMask;
  }

  return slots.map((slot, index) => ({ slot, player: slotPlayer[index] || null }));
}

function popcount(mask) {
  let count = 0;
  for (let value = mask; value; value >>= 1) count += value & 1;
  return count;
}

function bestMatchedPosition(player, slot) {
  const positions = parsePositions(player.positions || player.position);
  if (positions.includes(slot.label)) return slot.label;
  return slot.matches.find((label) => positions.includes(label)) || positions[0] || slot.label;
}

function renderLeaders() {
  const leaders = state.players
    .map((player) => ({ player, grade: playerAverageGrade(player.id), events: playerAttendanceCount(player.id) }))
    .filter((item) => item.grade)
    .sort((a, b) => a.grade - b.grade)
    .slice(0, 6);
  $("#leaderList").innerHTML = leaders.map(({ player, grade, events }) => `
    <article class="leader-item">
      <div><strong>${player.name}</strong><br><small class="muted">${events} Events · ${positionText(player)}</small></div>
      <strong>${gradeLabel(grade)}</strong>
      <div class="bar"><span style="width:${gradeToPercent(grade)}%"></span></div>
    </article>
  `).join("") || `<p class="muted">Noch keine Bewertungen vorhanden.</p>`;
}

function renderSquad() {
  const query = $("#searchInput").value.trim().toLowerCase();
  const position = $("#positionFilter").value;
  const players = state.players.filter((player) => {
    const positions = parsePositions(player.positions || player.position);
    const matchesQuery = [player.name, positionText(player), player.status, String(player.number)].join(" ").toLowerCase().includes(query);
    const matchesPosition = position === "all" || positions.includes(position);
    return matchesQuery && matchesPosition;
  });
  $("#playerTable").innerHTML = players.map((player) => {
    const statusClass = player.status === "Verletzt" ? "danger" : player.status === "Angeschlagen" ? "warning" : "";
    const risk = playerInjuryRisk(player.id);
    return `
      <tr>
        <td data-label="Spieler"><div class="player-cell"><span class="number-badge">${player.number}</span><strong>${player.name}</strong></div></td>
        <td data-label="Positionen">${positionChips(player)}</td>
        <td data-label="Geburtsdatum">${formatDate(player.birthdate)}</td>
        <td data-label="Status"><span class="status-pill ${statusClass}">${player.status}</span></td>
        <td data-label="Events">${playerAttendanceCount(player.id)}</td>
        <td data-label="Note">${gradeLabel(playerAverageGrade(player.id))}</td>
        <td data-label="Risiko"><span class="risk-pill ${risk.level.toLowerCase()}">${risk.level}</span></td>
        <td class="row-actions" data-label="Aktionen">
          <button class="ghost-button" data-action="profile" data-id="${player.id}">Profil</button>
          <button class="ghost-button" data-action="edit" data-id="${player.id}">Bearbeiten</button>
          <button class="ghost-button" data-action="invite" data-id="${player.id}">Einladen</button>
          <button class="ghost-button" data-action="delete" data-id="${player.id}">Löschen</button>
        </td>
      </tr>
    `;
  }).join("");
}

function renderSelects() {
  const selectedProfilePlayer = $("#profilePlayer").value;
  const playerOptions = [...state.players]
    .sort((a, b) => a.number - b.number)
    .map((player) => `<option value="${player.id}">${player.number} · ${player.name}</option>`)
    .join("");
  $("#profilePlayer").innerHTML = playerOptions;
  if (state.players.some((player) => player.id === selectedProfilePlayer)) $("#profilePlayer").value = selectedProfilePlayer;

  const selectedPosition = $("#positionFilter").value;
  const positionOptions = [...new Set(state.players.flatMap((player) => parsePositions(player.positions || player.position)))]
    .sort((a, b) => a.localeCompare(b, "de"))
    .map((position) => `<option value="${escapeHtml(position)}">${escapeHtml(position)}</option>`)
    .join("");
  $("#positionFilter").innerHTML = `<option value="all">Alle Positionen</option>${positionOptions}`;
  if ([...$("#positionFilter").options].some((option) => option.value === selectedPosition)) $("#positionFilter").value = selectedPosition;

  const eventOptions = sortedEvents().map((event) => `<option value="${event.id}">${event.date} · ${event.type} · ${event.title}</option>`).join("");
  $("#eventSelect").innerHTML = eventOptions;
  if (selectedEvent()) $("#eventSelect").value = selectedEvent().id;
}

function renderEvents() {
  const events = sortedEvents();
  $("#eventList").innerHTML = events.map((event) => {
    const rated = Object.values(event.ratings || {}).filter((rating) => rating.grade && rating.attendance !== "absent").length;
    const active = event.id === selectedEvent()?.id ? "active" : "";
    const result = gameResult(event);
    return `
      <button class="event-card ${active}" data-event-id="${event.id}">
        <span class="event-type">${event.type}</span>
        <strong>${event.title}</strong>
        <small>${event.date}${event.opponent ? ` · vs. ${event.opponent}` : ""}${result ? ` · ${result.goalsFor}:${result.goalsAgainst}` : ""}</small>
        <span>Intensität ${intensityLabel(event.intensity)}</span>
        <span>${rated} Bewertungen</span>
      </button>
    `;
  }).join("") || `<p class="muted">Noch keine Events angelegt.</p>`;
  renderRatingTable();
}

function renderRatingTable() {
  const event = selectedEvent();
  if (!event) {
    $("#eventEditorTitle").textContent = "Event bewerten";
    $("#eventEditorMeta").textContent = "Lege zuerst ein Event an.";
    $("#ratingTable").innerHTML = "";
    return;
  }

  $("#eventEditorTitle").textContent = event.title;
  const result = gameResult(event);
  const matchDuration = event.type === "Spiel" ? Number(event.matchDuration || 90) : "";
  $("#eventEditorMeta").textContent = `${event.type} · ${event.date}${result ? ` · Ergebnis ${result.goalsFor}:${result.goalsAgainst}` : ""} · Intensität ${intensityLabel(event.intensity)}${event.location ? ` · ${event.location}` : ""}`;
  if (matchDuration) $("#eventEditorMeta").textContent += ` · ${matchDuration} Min.`;
  $("#selectedEventIntensity").value = String(event.intensity || 2);
  $("#selectedGoalsFor").value = event.goalsFor === "" ? 0 : event.goalsFor;
  $("#selectedGoalsAgainst").value = event.goalsAgainst === "" ? 0 : event.goalsAgainst;
  $("#selectedMatchDuration").value = matchDuration || 90;
  $("#selectedTrainingFocus").value = event.trainingFocus || "Eigener Ballbesitz";
  $("#selectedGoalsFor").disabled = event.type !== "Spiel";
  $("#selectedGoalsAgainst").disabled = event.type !== "Spiel";
  $("#selectedMatchDuration").disabled = event.type !== "Spiel";
  ["selectedGoalsFor", "selectedGoalsAgainst", "selectedMatchDuration"].forEach((id) => {
    $(`#${id}`).closest("label").hidden = event.type !== "Spiel";
  });
  $("#selectedTrainingFocus").disabled = event.type !== "Training";
  $("#selectedTrainingFocus").closest("label").hidden = event.type !== "Training";
  renderRatingTableHead(event.type === "Spiel");
  const filter = $("#ratingFilter").value;
  const players = [...state.players].sort((a, b) => a.number - b.number).filter((player) => {
    const attendance = event.ratings?.[player.id]?.attendance || "open";
    if (filter === "present") return attendance === "present" || attendance === "limited";
    if (filter === "missing") return attendance === "absent" || attendance === "open";
    return true;
  });

  $("#ratingTable").innerHTML = players.map((player) => {
    const rating = event.ratings?.[player.id] || {};
    const attendance = rating.attendance || "open";
    const gameFields = event.type === "Spiel" ? `
        <td data-label="Minuten"><input class="rating-input small-number" data-player-id="${player.id}" data-field="minutes" type="number" min="0" max="${matchDuration || 90}" value="${rating.minutes ?? ""}" /></td>
        <td data-label="Tore"><input class="rating-input small-number" data-player-id="${player.id}" data-field="goals" type="number" min="0" max="20" value="${rating.goals ?? ""}" /></td>
        <td data-label="Vorlagen"><input class="rating-input small-number" data-player-id="${player.id}" data-field="assists" type="number" min="0" max="20" value="${rating.assists ?? ""}" /></td>
    ` : "";
    return `
      <tr class="attendance-row attendance-${attendance}">
        <td data-label="Spieler"><div class="player-cell"><span class="number-badge">${player.number}</span><strong>${player.name}</strong></div></td>
        <td data-label="Anwesenheit">${selectHtml(player.id, "attendance", attendance, [
          ["open", "Offen"],
          ["present", "Anwesend"],
          ["limited", "Teilweise"],
          ["absent", "Fehlt"]
        ])}</td>
        <td data-label="Gesamtnote"><span class="computed-grade">${gradeLabel(calculatedGrade(rating))}</span></td>
        <td data-label="Einsatz">${gradeSelectHtml(player.id, "effort", rating.effort)}</td>
        <td data-label="Technik">${gradeSelectHtml(player.id, "technique", rating.technique)}</td>
        <td data-label="Taktik">${gradeSelectHtml(player.id, "tactics", rating.tactics)}</td>
        <td data-label="Auffassung">${gradeSelectHtml(player.id, "comprehension", rating.comprehension)}</td>
        ${gameFields}
        <td data-label="Notiz"><input class="rating-note" data-player-id="${player.id}" data-field="note" value="${escapeHtml(rating.note || "")}" placeholder="Kurznotiz" /></td>
      </tr>
    `;
  }).join("");
}

function renderRatingTableHead(isGame) {
  $("#ratingTableHead").innerHTML = `
    <th>Spieler</th>
    <th>Anwesenheit</th>
    <th>Gesamtnote</th>
    <th>Einsatz</th>
    <th>Technik</th>
    <th>Taktik</th>
    <th>Auffassungsgabe</th>
    ${isGame ? "<th>Min.</th><th>Tore</th><th>Vorlagen</th>" : ""}
    <th>Notiz</th>
  `;
}

function selectHtml(playerId, field, value, options) {
  return `<select class="rating-input" data-player-id="${playerId}" data-field="${field}">${options.map(([optionValue, label]) => `<option value="${optionValue}" ${String(value) === optionValue ? "selected" : ""}>${label}</option>`).join("")}</select>`;
}

function gradeSelectHtml(playerId, field, value) {
  const options = [["", "-"], [1, "1"], [2, "2"], [3, "3"], [4, "4"], [5, "5"], [6, "6"]];
  return selectHtml(playerId, field, value || "", options.map(([optionValue, label]) => [String(optionValue), label]));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char]));
}

function openPlayerDialog(player) {
  $("#dialogTitle").textContent = player ? "Spieler bearbeiten" : "Spieler anlegen";
  const positions = player ? parsePositions(player.positions || player.position) : [];
  const customPositions = positions.filter((position) => !standardPositions.includes(position));
  $("#playerId").value = player?.id || "";
  $("#playerName").value = player?.name || "";
  renderPositionPicker(positions);
  $("#playerCustomPositions").value = customPositions.join(", ");
  $("#playerNumber").value = player?.number || nextNumber();
  $("#playerBirthdate").value = player?.birthdate || "2006-07-01";
  $("#playerStatus").value = player?.status || "Fit";
  $("#playerDialog").showModal();
}

function nextNumber() {
  const used = new Set(state.players.map((player) => player.number));
  for (let number = 1; number <= 99; number += 1) {
    if (!used.has(number)) return number;
  }
  return 99;
}

function savePlayer(event) {
  event.preventDefault();
  const id = $("#playerId").value || `p${crypto.randomUUID()}`;
  const positions = selectedPlayerPositions();
  if (!positions.length) {
    $("#playerCustomPositions").setCustomValidity("Bitte mindestens eine Position auswählen oder eintragen.");
    $("#playerCustomPositions").reportValidity();
    return;
  }
  $("#playerCustomPositions").setCustomValidity("");
  const number = Number($("#playerNumber").value);
  if (state.players.some((item) => item.id !== id && item.number === number)) {
    $("#playerNumber").setCustomValidity(`Rückennummer ${number} ist bereits vergeben.`);
    $("#playerNumber").reportValidity();
    return;
  }
  $("#playerNumber").setCustomValidity("");
  const player = {
    id,
    name: $("#playerName").value.trim(),
    positions,
    number,
    birthdate: $("#playerBirthdate").value,
    status: $("#playerStatus").value
  };
  const existingIndex = state.players.findIndex((item) => item.id === id);
  if (existingIndex >= 0) state.players[existingIndex] = player;
  else state.players.push(player);
  $("#playerDialog").close();
  persist();
  cloudSavePlayer(player);
  renderAll();
}

function openEventDialog() {
  $("#eventTitle").value = "";
  $("#eventType").value = "Training";
  $("#eventDate").valueAsDate = new Date();
  $("#eventIntensity").value = "2";
  $("#eventLocation").value = "";
  $("#eventTrainingFocus").value = "Eigener Ballbesitz";
  $("#eventOpponent").value = "";
  $("#eventGoalsFor").value = 0;
  $("#eventGoalsAgainst").value = 0;
  $("#eventMatchDuration").value = 90;
  $("#eventNotes").value = "";
  syncEventGameFields();
  $("#eventDialog").showModal();
}

function syncEventGameFields() {
  const isGame = $("#eventType").value === "Spiel";
  ["eventOpponent", "eventGoalsFor", "eventGoalsAgainst", "eventMatchDuration"].forEach((id) => {
    const field = $(`#${id}`);
    field.disabled = !isGame;
    field.closest("label").hidden = !isGame;
  });
  const trainingFocus = $("#eventTrainingFocus");
  trainingFocus.disabled = isGame;
  trainingFocus.closest("label").hidden = isGame;
}

function saveEvent(event) {
  event.preventDefault();
  const newEvent = {
    id: `e${crypto.randomUUID()}`,
    type: $("#eventType").value,
    title: $("#eventTitle").value.trim(),
    date: $("#eventDate").value,
    intensity: Number($("#eventIntensity").value),
    location: $("#eventLocation").value.trim(),
    trainingFocus: $("#eventType").value === "Training" ? $("#eventTrainingFocus").value : "",
    opponent: $("#eventOpponent").value.trim(),
    goalsFor: $("#eventType").value === "Spiel" ? Number($("#eventGoalsFor").value) : "",
    goalsAgainst: $("#eventType").value === "Spiel" ? Number($("#eventGoalsAgainst").value) : "",
    matchDuration: $("#eventType").value === "Spiel" ? Number($("#eventMatchDuration").value || 90) : "",
    notes: $("#eventNotes").value.trim(),
    ratings: {}
  };
  state.events.push(newEvent);
  state.selectedEventId = newEvent.id;
  $("#eventDialog").close();
  persist();
  cloudSaveEvent(newEvent);
  renderAll();
  setView("events");
}

function updateRating(playerId, field, value, rerender = true) {
  const event = selectedEvent();
  if (!event) return;
  event.ratings ||= {};
  event.ratings[playerId] ||= { attendance: "open", grade: "", effort: "", technique: "", tactics: "", comprehension: "", minutes: "", goals: "", assists: "", note: "" };
  event.ratings[playerId][field] = ["effort", "technique", "tactics", "comprehension", "minutes", "goals", "assists"].includes(field) && value !== "" ? Number(value) : value;
  if (field === "minutes" && value !== "") {
    event.ratings[playerId].minutes = Math.min(Number(event.matchDuration || 90), Math.max(0, Number(value)));
  }
  if (field === "attendance" && value === "absent") {
    event.ratings[playerId].grade = "";
    event.ratings[playerId].effort = "";
    event.ratings[playerId].technique = "";
    event.ratings[playerId].tactics = "";
    event.ratings[playerId].comprehension = "";
    event.ratings[playerId].minutes = "";
    event.ratings[playerId].goals = "";
    event.ratings[playerId].assists = "";
  } else {
    event.ratings[playerId].grade = calculatedGrade(event.ratings[playerId]);
  }
  persist();
  cloudSaveRating(event.id, playerId, event.ratings[playerId]);
  if (rerender) renderEvents();
}

function deleteSelectedEvent() {
  const event = selectedEvent();
  if (!event) return;
  if (!confirm(`"${event.title}" wirklich löschen? Alle Bewertungen dieses Events gehen verloren.`)) return;
  state.events = state.events.filter((item) => item.id !== event.id);
  state.selectedEventId = state.events[0]?.id || "";
  persist();
  cloudDeleteEvent(event);
  renderEvents();
}

function updateSelectedEventMeta(field, value) {
  const event = selectedEvent();
  if (!event) return;
  const numericValue = Number(value);
  if (field === "intensity") event[field] = numericValue;
  else if (field === "trainingFocus") event[field] = event.type === "Training" ? value : "";
  else if (field === "matchDuration") event[field] = event.type === "Spiel" ? Math.max(1, numericValue || 90) : "";
  else event[field] = event.type === "Spiel" ? numericValue : "";
  persist();
  cloudSaveEvent(event);
  renderEvents();
}

function drawProfile() {
  const playerId = $("#profilePlayer").value || state.players[0]?.id;
  const player = state.players.find((item) => item.id === playerId);
  const ratings = playerRatings(playerId).sort((a, b) => new Date(a.event.date) - new Date(b.event.date));
  renderProfileHeader(player, ratings);
  renderProfileChart(player, ratings);
  renderProfileHistory(ratings);
  renderProfileDeepAnalysis(playerId, ratings);
  renderDevelopmentPlans(playerId);
  renderAnalyticsCards(playerId, ratings);
}

function renderDevelopmentPlans(playerId) {
  const plans = state.developmentPlans?.[playerId] || [];
  $("#developmentPlanList").innerHTML = plans.map((plan) => `
    <article class="development-item">
      <div>
        <span class="status-pill ${plan.status === "Erreicht" ? "success" : plan.status === "In Arbeit" ? "warning" : ""}">${escapeHtml(plan.status)}</span>
        <strong>${escapeHtml(plan.focus)}</strong>
        <p>${escapeHtml(plan.goal)}</p>
        <small class="muted">${plan.dueDate ? `Ziel bis ${formatDate(plan.dueDate)} · ` : ""}${escapeHtml(plan.actions || "Keine Maßnahmen notiert.")}</small>
      </div>
      <div class="row-actions">
        <button class="ghost-button" data-action="edit-plan" data-id="${plan.id}" type="button">Bearbeiten</button>
        <button class="ghost-button" data-action="delete-plan" data-id="${plan.id}" type="button">Löschen</button>
      </div>
    </article>
  `).join("") || `<p class="muted">Noch kein Förderplan für diesen Spieler angelegt.</p>`;
}

function resetDevelopmentPlanForm() {
  $("#developmentPlanId").value = "";
  $("#developmentPlanFocus").value = "";
  $("#developmentPlanGoal").value = "";
  $("#developmentPlanActions").value = "";
  $("#developmentPlanStatus").value = "Offen";
  $("#developmentPlanDueDate").value = "";
}

function saveDevelopmentPlan(event) {
  event.preventDefault();
  const playerId = $("#profilePlayer").value || state.players[0]?.id;
  if (!playerId) return;
  state.developmentPlans ||= {};
  state.developmentPlans[playerId] ||= [];
  const id = $("#developmentPlanId").value || `dp${crypto.randomUUID()}`;
  const plan = {
    id,
    focus: $("#developmentPlanFocus").value.trim(),
    goal: $("#developmentPlanGoal").value.trim(),
    actions: $("#developmentPlanActions").value.trim(),
    status: $("#developmentPlanStatus").value,
    dueDate: $("#developmentPlanDueDate").value,
    createdAt: state.developmentPlans[playerId].find((item) => item.id === id)?.createdAt || new Date().toISOString().slice(0, 10)
  };
  const existingIndex = state.developmentPlans[playerId].findIndex((item) => item.id === id);
  if (existingIndex >= 0) state.developmentPlans[playerId][existingIndex] = plan;
  else state.developmentPlans[playerId].push(plan);
  resetDevelopmentPlanForm();
  persist();
  cloudSaveDevelopmentPlan(playerId, plan);
  drawProfile();
}

function editDevelopmentPlan(planId) {
  const playerId = $("#profilePlayer").value || state.players[0]?.id;
  const plan = state.developmentPlans?.[playerId]?.find((item) => item.id === planId);
  if (!plan) return;
  $("#developmentPlanId").value = plan.id;
  $("#developmentPlanFocus").value = plan.focus;
  $("#developmentPlanGoal").value = plan.goal;
  $("#developmentPlanActions").value = plan.actions;
  $("#developmentPlanStatus").value = plan.status;
  $("#developmentPlanDueDate").value = plan.dueDate;
}

function deleteDevelopmentPlan(planId) {
  const playerId = $("#profilePlayer").value || state.players[0]?.id;
  if (!playerId) return;
  if (!confirm("Diesen Förderplan wirklich löschen?")) return;
  state.developmentPlans ||= {};
  state.developmentPlans[playerId] = (state.developmentPlans?.[playerId] || []).filter((plan) => plan.id !== planId);
  persist();
  cloudDeleteDevelopmentPlan(playerId, planId);
  drawProfile();
}

function renderProfileHeader(player, ratings) {
  const average = playerAverageGrade(player?.id);
  const risk = player ? playerInjuryRisk(player.id) : null;
  $("#profileHeader").innerHTML = player ? `
    <div class="profile-card">
      <div class="profile-number">${player.number}</div>
      <div>
        <strong>${player.name}</strong>
        <span>${positionText(player)} · ${formatDate(player.birthdate)} · ${ageFromBirthdate(player.birthdate) ?? "-"} Jahre · ${player.status}</span>
      </div>
      <div class="profile-grade">
        <span>Ø Note</span>
        <strong>${gradeLabel(average)}</strong>
      </div>
      <div class="risk-panel">
        <div>
          <span>Verletzungsrisiko</span>
          <strong>${risk.level} · ${risk.percentage}%</strong>
        </div>
        <div class="risk-meter"><span class="${risk.level.toLowerCase()}" style="width:${risk.percentage}%"></span></div>
        <small>Belastung ${risk.load} aus ${risk.recentEvents} jüngsten Events</small>
      </div>
    </div>
  ` : `<p class="muted">Noch kein Spieler vorhanden.</p>`;
}

function renderProfileChart(player, ratings) {
  const canvas = $("#trendChart");
  const ctx = canvas.getContext("2d");
  const colors = chartPalette();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = colors.surface;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 1;
  for (let grade = 1; grade <= 6; grade += 1) {
    const y = 54 + (grade - 1) * 54;
    ctx.beginPath();
    ctx.moveTo(58, y);
    ctx.lineTo(940, y);
    ctx.stroke();
    ctx.fillStyle = colors.muted;
    ctx.fillText(String(grade), 28, y + 4);
  }
  ctx.fillStyle = colors.ink;
  ctx.font = "700 18px system-ui";
  ctx.fillText(player ? `${player.name} · Notenentwicklung` : "Notenentwicklung", 58, 28);
  if (!ratings.length) {
    ctx.fillStyle = colors.muted;
    ctx.fillText("Noch keine benoteten Events vorhanden.", 58, 190);
    return;
  }
  const points = ratings.map((item, index) => ({
    x: 76 + (index * 850) / Math.max(ratings.length - 1, 1),
    y: 54 + (Number(item.rating.grade) - 1) * 54,
    item
  }));
  ctx.strokeStyle = colors.red;
  ctx.lineWidth = 4;
  ctx.beginPath();
  points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
  ctx.stroke();
  points.forEach((point) => {
    ctx.fillStyle = colors.green;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.muted;
    ctx.font = "12px system-ui";
    ctx.fillText(point.item.event.date.slice(5), point.x - 16, 344);
  });
}

function renderProfileHistory(ratings) {
  $("#profileHistory").innerHTML = ratings.map(({ event, rating }) => `
    <article class="record-item">
      <div>
        <strong>${event.title}</strong>
        <small>${event.date} · ${event.type}${gameResult(event) ? ` · ${gameResult(event).goalsFor}:${gameResult(event).goalsAgainst}` : ""} · Intensität ${intensityLabel(event.intensity)} · Note ${rating.grade}</small>
        <p class="muted">${rating.note || event.notes || "Keine Notiz"}</p>
      </div>
      <span class="grade-badge">${rating.grade}</span>
    </article>
  `).join("") || `<p class="muted">Für diesen Spieler gibt es noch keine Bewertungen.</p>`;
}

function renderProfileDeepAnalysis(playerId, ratings) {
  $("#profileSkillBars").innerHTML = profileSkillAverages(ratings).map((item) => `
    <article class="analysis-bar-row">
      <div><strong>${item.label}</strong><span>${gradeLabel(item.value)}</span></div>
      <div class="analysis-bar"><span style="width:${gradeToPercent(item.value)}%"></span></div>
    </article>
  `).join("");
  $("#profileAvailabilityBars").innerHTML = profileAvailability(playerId).map((item) => `
    <article class="analysis-bar-row">
      <div><strong>${item.label}</strong><span>${item.display}</span></div>
      <div class="analysis-bar availability"><span style="width:${item.value}%"></span></div>
    </article>
  `).join("");
}

function renderAnalyticsCards(playerId, ratings = playerRatings(playerId)) {
  const average = playerAverageGrade(playerId);
  const gameRatings = ratings.filter((item) => item.event.type === "Spiel");
  const trainingRatings = ratings.filter((item) => item.event.type === "Training");
  const last = ratings.at(-1)?.rating.grade;
  const previous = ratings.at(-2)?.rating.grade;
  const trend = last && previous ? Number(previous) - Number(last) : null;
  const risk = playerInjuryRisk(playerId);
  const recentIntensity = ratings.slice(-3).map((item) => item.event.intensity || 2);
  const avgIntensity = recentIntensity.length ? roundGrade(recentIntensity.reduce((sum, value) => sum + Number(value), 0) / recentIntensity.length) : null;
  const development = bestDevelopment(ratings);
  const bestEvent = ratings.length ? ratings.reduce((best, item) => Number(item.rating.grade) < Number(best.rating.grade) ? item : best, ratings[0]) : null;
  const gameStats = playerGameStats(playerId);
  const cards = [
    ["Notenschnitt", gradeLabel(average)],
    ["Spiel-Schnitt", gradeLabel(averageOf(gameRatings))],
    ["Training-Schnitt", gradeLabel(averageOf(trainingRatings))],
    ["Bewertete Events", ratings.length],
    ["Teilnahmen", playerAttendanceCount(playerId)],
    ["Trend", trend === null ? "-" : `${trend > 0 ? "+" : ""}${roundGrade(trend)}`],
    ["Risiko", `${risk.level} · ${risk.percentage}%`],
    ["Ø Intensität zuletzt", avgIntensity ? avgIntensity.toFixed(1).replace(".", ",") : "-"],
    ["Entwicklung Saison", development === null ? "-" : `${development > 0 ? "+" : ""}${gradeLabel(development)}`],
    ["Bestes Event", bestEvent ? `${gradeLabel(bestEvent.rating.grade)} · ${bestEvent.event.type}` : "-"],
    ["Einsatzquote", `${gameStats.appearanceRate}%`],
    ["Scorer/Spiel", statLabel(gameStats.scorersPerGame)],
    ["Tore + Vorlagen", `${gameStats.goals} + ${gameStats.assists}`],
    ["Min./Spiel", gameStats.minutesPerGame || "-"]
  ];
  $("#analyticsCards").innerHTML = cards.map(([label, value]) => `<article class="insight-card"><span class="muted">${label}</span><strong>${value}</strong></article>`).join("");
}

function downloadProfilePdf() {
  const playerId = $("#profilePlayer").value || state.players[0]?.id;
  const player = state.players.find((item) => item.id === playerId);
  if (!player) return;
  const ratings = playerRatings(playerId).sort((a, b) => new Date(a.event.date) - new Date(b.event.date));
  const average = playerAverageGrade(playerId);
  const gameStats = playerGameStats(playerId);
  const logoUrl = new URL("./assets/club-logo.svg", window.location.href).href;
  const performanceGraph = profilePerformanceSvg(ratings);
  const skillRows = profileSkillAverages(ratings).map((item) => `
    <tr><td>${item.label}</td><td>${gradeLabel(item.value)}</td><td><div class="bar"><span style="width:${gradeToPercent(item.value)}%"></span></div></td></tr>
  `).join("");
  const availabilityRows = profileAvailability(playerId).map((item) => `
    <tr><td>${item.label}</td><td>${item.display}</td><td>${item.value}%</td></tr>
  `).join("");
  const highlightRows = [...ratings]
    .sort((a, b) => Number(a.rating.grade) - Number(b.rating.grade))
    .slice(0, 3)
    .map(({ event, rating }) => `
      <tr>
        <td>${formatDate(event.date)}</td>
        <td>${escapeHtml(event.title)}</td>
        <td>${event.type}</td>
        <td>${gradeLabel(rating.grade)}</td>
      </tr>
    `).join("");
  const report = window.open("", "_blank");
  if (!report) return;
  report.document.write(`
    <!doctype html>
    <html lang="de">
      <head>
        <meta charset="utf-8" />
        <title>Spielerprofil ${escapeHtml(player.name)}</title>
        <style>
          body { margin: 32px; color: #241d1f; font-family: Arial, Helvetica, sans-serif; }
          header { display: flex; align-items: center; justify-content: space-between; gap: 20px; border-bottom: 4px solid #d8072e; padding-bottom: 18px; }
          img { width: 82px; height: 82px; }
          h1 { margin: 0 0 6px; font-size: 30px; }
          h2 { margin-top: 28px; font-size: 18px; }
          .muted { color: #70686b; }
          .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 20px; }
          .card { border: 1px solid #e4dcde; border-radius: 8px; padding: 12px; }
          .card span { display: block; color: #70686b; font-size: 12px; }
          .card strong { display: block; margin-top: 6px; color: #a90624; font-size: 22px; }
          .section-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 18px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
          th, td { border-bottom: 1px solid #e4dcde; padding: 8px; text-align: left; vertical-align: top; }
          th { color: #70686b; text-transform: uppercase; font-size: 10px; }
          .bar { height: 8px; min-width: 120px; overflow: hidden; border-radius: 999px; background: #f3e8eb; }
          .bar span { display: block; height: 100%; background: linear-gradient(90deg, #d8072e, #08714f); }
          .graph { margin-top: 12px; border: 1px solid #e4dcde; border-radius: 8px; background: #fffafa; }
          .note { margin-top: 18px; padding: 10px 12px; border-radius: 8px; background: #fff7f9; color: #70686b; font-size: 12px; }
          @media print { body { margin: 18mm; } }
        </style>
      </head>
      <body>
        <header>
          <div>
            <p class="muted">1. FC Königstein U14 · Spielerprofil</p>
            <h1>${escapeHtml(player.name)}</h1>
            <div class="muted">Nr. ${player.number} · ${escapeHtml(positionText(player))} · ${formatDate(player.birthdate)} · ${player.status}</div>
          </div>
          <img src="${logoUrl}" alt="Logo" />
        </header>
        <section class="cards">
          <div class="card"><span>Ø Note</span><strong>${gradeLabel(average)}</strong></div>
          <div class="card"><span>Bewertete Events</span><strong>${ratings.length}</strong></div>
          <div class="card"><span>Teilnahmen</span><strong>${playerAttendanceCount(playerId)}</strong></div>
          <div class="card"><span>Einsatzquote</span><strong>${gameStats.appearanceRate}%</strong></div>
          <div class="card"><span>Scorer/Spiel</span><strong>${statLabel(gameStats.scorersPerGame)}</strong></div>
          <div class="card"><span>Tore + Vorlagen</span><strong>${gameStats.goals} + ${gameStats.assists}</strong></div>
          <div class="card"><span>Min./Spiel</span><strong>${gameStats.minutesPerGame || "-"}</strong></div>
          <div class="card"><span>Spiele</span><strong>${gameStats.appearances}/${gameStats.games}</strong></div>
        </section>
        <section class="section-grid">
          <div>
            <h2>Kompetenzprofil</h2>
            <table>
              <thead><tr><th>Kriterium</th><th>Ø Note</th><th>Profil</th></tr></thead>
              <tbody>${skillRows || `<tr><td colspan="3">Keine Bewertungen vorhanden.</td></tr>`}</tbody>
            </table>
          </div>
          <div>
            <h2>Verfügbarkeit</h2>
            <table>
              <thead><tr><th>Status</th><th>Events</th><th>Anteil</th></tr></thead>
              <tbody>${availabilityRows}</tbody>
            </table>
          </div>
        </section>
        <h2>Leistungsentwicklung</h2>
        <div class="graph">${performanceGraph}</div>
        <h2>Bestleistungen</h2>
        <table>
          <thead>
            <tr><th>Datum</th><th>Event</th><th>Typ</th><th>Gesamt</th></tr>
          </thead>
          <tbody>${highlightRows || `<tr><td colspan="4">Keine Bewertungen vorhanden.</td></tr>`}</tbody>
        </table>
        <div class="note">Der Report ist bewusst komprimiert und zeigt nicht die komplette Saisonhistorie. Die vollständige Historie bleibt im Spielerprofil der App verfügbar.</div>
      </body>
    </html>
  `);
  report.document.close();
  report.focus();
  setTimeout(() => report.print(), 300);
}

function profilePerformanceSvg(ratings) {
  const width = 760;
  const height = 260;
  const left = 54;
  const right = 24;
  const top = 30;
  const bottom = 38;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const rows = ratings.map((item, index) => ({
    x: left + (index * plotWidth) / Math.max(ratings.length - 1, 1),
    y: top + ((Number(item.rating.grade) - 1) / 5) * plotHeight,
    grade: Number(item.rating.grade),
    label: item.event.date.slice(5)
  }));
  const grid = [1, 2, 3, 4, 5, 6].map((grade) => {
    const y = top + ((grade - 1) / 5) * plotHeight;
    return `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" stroke="#e4dcde" /><text x="24" y="${y + 4}" font-size="12" fill="#70686b">${grade}</text>`;
  }).join("");
  if (!rows.length) {
    return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="260" role="img" aria-label="Keine Leistungsdaten">${grid}<text x="${left}" y="138" font-size="14" fill="#70686b">Noch keine benoteten Events vorhanden.</text></svg>`;
  }
  const path = rows.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
  const points = rows.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="5" fill="#d8072e" /><text x="${point.x - 14}" y="${height - 12}" font-size="11" fill="#70686b">${point.label}</text>`).join("");
  return `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="260" role="img" aria-label="Leistungsentwicklung">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#fffafa" />
      ${grid}
      <path d="${path}" fill="none" stroke="#d8072e" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
      ${points}
      <text x="${left}" y="20" font-size="15" font-weight="700" fill="#241d1f">Notenverlauf nach Event</text>
    </svg>
  `;
}

function averageOf(items) {
  if (!items.length) return null;
  return roundGrade(items.reduce((sum, item) => sum + Number(item.rating.grade), 0) / items.length);
}

function renderTeamAnalysis() {
  const stats = teamStats();
  const quarters = birthQuarterCounts();
  const coverage = positionCoverage();
  const focusCounts = trainingFocusCounts();
  const thinPositions = coverage.filter(([, count]) => count <= 1).map(([position]) => position).slice(0, 6);
  const highRisk = state.players
    .map((player) => ({ player, risk: playerInjuryRisk(player.id) }))
    .sort((a, b) => b.risk.percentage - a.risk.percentage)
    .slice(0, 3);
  const topPlayers = state.players
    .map((player) => ({ player, grade: playerAverageGrade(player.id), events: playerAttendanceCount(player.id) }))
    .filter((item) => item.grade)
    .sort((a, b) => a.grade - b.grade)
    .slice(0, 3);
  const cards = [
    ["Spiele", stats.games],
    ["Bilanz", `${stats.wins} S · ${stats.draws} U · ${stats.losses} N`],
    ["Torverhältnis", `${stats.goalsFor}:${stats.goalsAgainst}`],
    ["Ø Teamnote", gradeLabel(stats.avgGrade)],
    ["Teilnahmequote", `${stats.attendanceRate}%`],
    ["Ø Intensität", stats.avgIntensity ? stats.avgIntensity.toFixed(1).replace(".", ",") : "-"],
    ["Training BB/GGB", `${focusCounts["Eigener Ballbesitz"]}/${focusCounts["Gegnerischer Ballbesitz"]}`],
    ["Training Umschalten", focusCounts.Umschalten],
    ["Geburten Q1/Q2", `${quarters.Q1}/${quarters.Q2}`],
    ["Geburten Q3/Q4", `${quarters.Q3}/${quarters.Q4}`],
    ["Positionslücken", thinPositions.length || "-"]
  ];
  $("#teamAnalysisCards").innerHTML = cards.map(([label, value]) => `<article class="insight-card"><span class="muted">${label}</span><strong>${value}</strong></article>`).join("");
  $("#teamInsightList").innerHTML = `
    <article class="team-insight">
      <strong>Topform</strong>
      ${topPlayers.map(({ player, grade }) => `<span>${player.name} · Note ${gradeLabel(grade)}</span>`).join("") || "<span>Noch keine Bewertungen.</span>"}
    </article>
    <article class="team-insight">
      <strong>Belastung im Blick</strong>
      ${highRisk.map(({ player, risk }) => `<span>${player.name} · ${risk.level} (${risk.percentage}%)</span>`).join("")}
    </article>
    <article class="team-insight">
      <strong>Spielauswertung</strong>
      <span>${stats.wins} Siege, ${stats.draws} Unentschieden, ${stats.losses} Niederlagen</span>
      <span>${stats.goalsFor} Tore erzielt, ${stats.goalsAgainst} Gegentore</span>
    </article>
    <article class="team-insight">
      <strong>Trainingssteuerung</strong>
      <span>Eigener Ballbesitz: ${focusCounts["Eigener Ballbesitz"]} Einheiten</span>
      <span>Gegnerischer Ballbesitz: ${focusCounts["Gegnerischer Ballbesitz"]} Einheiten</span>
      <span>Umschalten: ${focusCounts.Umschalten} Einheiten</span>
    </article>
    <article class="team-insight">
      <strong>Kaderstruktur</strong>
      <span>Geburtsquartale: Q1 ${quarters.Q1}, Q2 ${quarters.Q2}, Q3 ${quarters.Q3}, Q4 ${quarters.Q4}</span>
      <span>Knapp besetzt: ${thinPositions.join(", ") || "keine auffälligen Lücken"}</span>
    </article>
  `;
  drawTeamTrendChart();
  drawBirthQuarterChart();
  drawPositionCoverageChart();
  drawTrainingFocusChart();
}

function drawTeamTrendChart() {
  const canvas = $("#teamTrendChart");
  const ctx = canvas.getContext("2d");
  const colors = chartPalette();
  const events = [...state.events]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((event) => ({ event, grade: teamAverageGradeForEvent(event) }))
    .filter((item) => item.grade);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = colors.surface;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 1;
  for (let grade = 1; grade <= 6; grade += 1) {
    const y = 54 + (grade - 1) * 54;
    ctx.beginPath();
    ctx.moveTo(58, y);
    ctx.lineTo(940, y);
    ctx.stroke();
    ctx.fillStyle = colors.muted;
    ctx.fillText(String(grade), 28, y + 4);
  }
  ctx.fillStyle = colors.ink;
  ctx.font = "700 18px system-ui";
  ctx.fillText("Teamnoten nach Event", 58, 28);
  if (!events.length) {
    ctx.fillStyle = colors.muted;
    ctx.fillText("Noch keine Teamnoten vorhanden.", 58, 190);
    return;
  }
  const points = events.map((item, index) => ({
    x: 76 + (index * 850) / Math.max(events.length - 1, 1),
    y: 54 + (Number(item.grade) - 1) * 54,
    item
  }));
  ctx.strokeStyle = colors.red;
  ctx.lineWidth = 4;
  ctx.beginPath();
  points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
  ctx.stroke();
  points.forEach((point) => {
    ctx.fillStyle = point.item.event.type === "Spiel" ? colors.red : colors.green;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.muted;
    ctx.font = "12px system-ui";
    ctx.fillText(point.item.event.date.slice(5), point.x - 16, 344);
  });
}

function drawBirthQuarterChart() {
  const counts = birthQuarterCounts();
  drawBarChart($("#birthQuarterChart"), Object.entries(counts).map(([label, value]) => ({ label, value })), "Geborene Spieler je Quartal", chartPalette().red);
}

function drawPositionCoverageChart() {
  const rows = positionCoverage().slice(0, 10).map(([label, value]) => ({ label, value }));
  drawBarChart($("#positionCoverageChart"), rows, "Positionsabdeckung", chartPalette().green);
}

function trainingFocusCounts() {
  const counts = {
    "Eigener Ballbesitz": 0,
    "Gegnerischer Ballbesitz": 0,
    Umschalten: 0
  };
  state.events
    .filter((event) => event.type === "Training")
    .forEach((event) => {
      const focus = event.trainingFocus || "Eigener Ballbesitz";
      counts[focus] = (counts[focus] || 0) + 1;
    });
  return counts;
}

function drawTrainingFocusChart() {
  const rows = Object.entries(trainingFocusCounts()).map(([label, value]) => ({ label, value }));
  drawPieChart($("#trainingFocusChart"), rows, "Trainingsfokus nach Spielphase");
}

function drawPieChart(canvas, rows, title) {
  const ctx = canvas.getContext("2d");
  const palette = chartPalette();
  const colors = [palette.red, palette.green, palette.amber];
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = palette.surface;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = palette.ink;
  ctx.font = "700 18px system-ui";
  ctx.fillText(title, 28, 30);
  if (!total) {
    ctx.fillStyle = palette.muted;
    ctx.font = "14px system-ui";
    ctx.fillText("Noch keine Trainings angelegt.", 28, 170);
    return;
  }
  let startAngle = -Math.PI / 2;
  rows.forEach((row, index) => {
    const slice = (row.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(170, 174);
    ctx.arc(170, 174, 96, startAngle, startAngle + slice);
    ctx.closePath();
    ctx.fillStyle = colors[index % colors.length];
    ctx.fill();
    startAngle += slice;
  });
  rows.forEach((row, index) => {
    const y = 112 + index * 48;
    const percentage = Math.round((row.value / total) * 100);
    ctx.fillStyle = colors[index % colors.length];
    ctx.fillRect(340, y - 16, 18, 18);
    ctx.fillStyle = palette.ink;
    ctx.font = "700 14px system-ui";
    ctx.fillText(row.label, 372, y);
    ctx.fillStyle = palette.muted;
    ctx.font = "13px system-ui";
    ctx.fillText(`${row.value} Einheiten · ${percentage}%`, 372, y + 20);
  });
}

function drawBarChart(canvas, rows, title, color) {
  const ctx = canvas.getContext("2d");
  const palette = chartPalette();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = palette.surface;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = palette.ink;
  ctx.font = "700 18px system-ui";
  ctx.fillText(title, 28, 30);
  const max = Math.max(...rows.map((row) => row.value), 1);
  const barAreaTop = 58;
  const barHeight = Math.min(34, (canvas.height - 88) / Math.max(rows.length, 1) - 8);
  rows.forEach((row, index) => {
    const y = barAreaTop + index * (barHeight + 10);
    const width = Math.round((row.value / max) * (canvas.width - 170));
    ctx.fillStyle = palette.muted;
    ctx.font = "12px system-ui";
    ctx.fillText(row.label, 28, y + barHeight / 2 + 4);
    ctx.fillStyle = palette.soft;
    ctx.fillRect(92, y, canvas.width - 130, barHeight);
    ctx.fillStyle = color;
    ctx.fillRect(92, y, width, barHeight);
    ctx.fillStyle = palette.ink;
    ctx.font = "700 12px system-ui";
    ctx.fillText(String(row.value), 104 + width, y + barHeight / 2 + 4);
  });
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `teamkompass-export-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function renderOpponentAnalysis() {
  const opponents = [...(state.opponents || [])].sort((a, b) => a.name.localeCompare(b.name, "de"));
  $("#opponentCount").textContent = `${opponents.length} Gegner`;
  $("#opponentList").innerHTML = opponents.map((opponent) => `
    <article class="opponent-card">
      <div class="opponent-card-head">
        <div>
          <span class="event-type">${escapeHtml(opponent.style)}</span>
          <strong>${escapeHtml(opponent.name)}</strong>
          <small class="muted">${opponent.formation ? `Formation ${escapeHtml(opponent.formation)} · ` : ""}aktualisiert ${formatDate(opponent.updatedAt)}</small>
        </div>
        <div class="row-actions">
          <button class="ghost-button" data-action="edit-opponent" data-id="${opponent.id}" type="button">Bearbeiten</button>
          <button class="ghost-button" data-action="delete-opponent" data-id="${opponent.id}" type="button">Löschen</button>
        </div>
      </div>
      <div class="opponent-detail-grid">
        ${opponent.strengths ? opponentDetail("Stärken", opponent.strengths) : ""}
        ${opponent.weaknesses ? opponentDetail("Schwächen", opponent.weaknesses) : ""}
        ${opponent.keyPlayers ? opponentDetail("Schlüsselspieler", opponent.keyPlayers) : ""}
        ${opponent.setPieces ? opponentDetail("Standards", opponent.setPieces) : ""}
        ${opponent.gamePlan ? opponentDetail("Matchplan", opponent.gamePlan) : ""}
        ${opponent.notes ? opponentDetail("Notizen", opponent.notes) : ""}
      </div>
    </article>
  `).join("") || `<p class="muted">Noch keine Gegneranalyse angelegt.</p>`;
}

function opponentDetail(label, value) {
  return `<section><span>${label}</span><p>${escapeHtml(value)}</p></section>`;
}

function resetOpponentForm() {
  $("#opponentId").value = "";
  $("#opponentName").value = "";
  $("#opponentFormation").value = "";
  $("#opponentStyle").value = "Unbekannt";
  $("#opponentStrengths").value = "";
  $("#opponentWeaknesses").value = "";
  $("#opponentKeyPlayers").value = "";
  $("#opponentSetPieces").value = "";
  $("#opponentGamePlan").value = "";
  $("#opponentNotes").value = "";
}

function saveOpponent(event) {
  event.preventDefault();
  state.opponents ||= [];
  const id = $("#opponentId").value || `o${crypto.randomUUID()}`;
  const opponent = {
    id,
    name: $("#opponentName").value.trim(),
    formation: $("#opponentFormation").value.trim(),
    style: $("#opponentStyle").value,
    strengths: $("#opponentStrengths").value.trim(),
    weaknesses: $("#opponentWeaknesses").value.trim(),
    keyPlayers: $("#opponentKeyPlayers").value.trim(),
    setPieces: $("#opponentSetPieces").value.trim(),
    gamePlan: $("#opponentGamePlan").value.trim(),
    notes: $("#opponentNotes").value.trim(),
    updatedAt: new Date().toISOString().slice(0, 10)
  };
  const existingIndex = state.opponents.findIndex((item) => item.id === id);
  if (existingIndex >= 0) state.opponents[existingIndex] = opponent;
  else state.opponents.push(opponent);
  resetOpponentForm();
  persist();
  cloudSaveOpponent(opponent);
  renderOpponentAnalysis();
}

function editOpponent(opponentId) {
  const opponent = state.opponents?.find((item) => item.id === opponentId);
  if (!opponent) return;
  $("#opponentId").value = opponent.id;
  $("#opponentName").value = opponent.name;
  $("#opponentFormation").value = opponent.formation;
  $("#opponentStyle").value = opponent.style || "Unbekannt";
  $("#opponentStrengths").value = opponent.strengths;
  $("#opponentWeaknesses").value = opponent.weaknesses;
  $("#opponentKeyPlayers").value = opponent.keyPlayers;
  $("#opponentSetPieces").value = opponent.setPieces;
  $("#opponentGamePlan").value = opponent.gamePlan;
  $("#opponentNotes").value = opponent.notes;
  $("#opponentName").focus();
}

function deleteOpponent(opponentId) {
  const opponent = (state.opponents || []).find((item) => item.id === opponentId);
  if (!confirm(`Gegnerprofil "${opponent?.name || ""}" wirklich löschen?`)) return;
  state.opponents = (state.opponents || []).filter((opponent) => opponent.id !== opponentId);
  persist();
  cloudDeleteOpponent(opponentId);
  renderOpponentAnalysis();
}

function renderAll() {
  safeRender(renderMetrics, "Dashboard-Kennzahlen");
  safeRender(renderPitch, "Startelf");
  safeRender(renderLeaders, "Formkurve");
  safeRender(renderSelects, "Auswahllisten");
  safeRender(renderSquad, "Kader");
  safeRender(renderEvents, "Events");
  safeRender(drawProfile, "Spielerprofile");
  safeRender(renderOpponentAnalysis, "Gegneranalyse");
  safeRender(renderTeamAnalysis, "Teamanalyse");
}

function safeRender(fn, label) {
  try {
    fn();
  } catch (error) {
    console.error(`${label} konnte nicht gerendert werden`, error);
    $("#storageState").textContent = `${label}: Fehler`;
  }
}

document.querySelectorAll(".nav-tab").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
$("#mobileViewSelect").addEventListener("change", (event) => setView(event.target.value));
window.addEventListener("resize", () => {
  if (!window.matchMedia?.("(max-width: 720px)")?.matches) mobileAccordionsPrepared = false;
  prepareMobileAccordions();
});
$("#formationSelect").addEventListener("change", renderPitch);
$("#searchInput").addEventListener("input", renderSquad);
$("#positionFilter").addEventListener("change", renderSquad);
$("#addPlayerTop").addEventListener("click", () => openPlayerDialog());
$("#closeDialogBtn").addEventListener("click", () => $("#playerDialog").close());
$("#cancelDialogBtn").addEventListener("click", () => $("#playerDialog").close());
$("#playerForm").addEventListener("submit", savePlayer);
$("#positionOptions").addEventListener("change", () => $("#playerCustomPositions").setCustomValidity(""));
$("#playerCustomPositions").addEventListener("input", () => $("#playerCustomPositions").setCustomValidity(""));
$("#playerNumber").addEventListener("input", () => $("#playerNumber").setCustomValidity(""));
$("#exportBtn").addEventListener("click", exportData);
$("#themeToggle").addEventListener("click", toggleTheme);
$("#newEventBtn").addEventListener("click", openEventDialog);
$("#heroEventBtn").addEventListener("click", () => {
  setView("events");
  openEventDialog();
});
$("#heroAnalysisBtn").addEventListener("click", () => setView("teamAnalysis"));
$("#quickEventBtn").addEventListener("click", () => {
  setView("events");
  openEventDialog();
});
$("#quickPlayerBtn").addEventListener("click", () => openPlayerDialog());
$("#quickProfileBtn").addEventListener("click", () => setView("profiles"));
$("#quickOpponentBtn").addEventListener("click", () => setView("opponents"));
$("#eventForm").addEventListener("submit", saveEvent);
$("#eventType").addEventListener("change", syncEventGameFields);
$("#closeEventDialogBtn").addEventListener("click", () => $("#eventDialog").close());
$("#cancelEventDialogBtn").addEventListener("click", () => $("#eventDialog").close());
$("#eventSelect").addEventListener("change", (event) => {
  state.selectedEventId = event.target.value;
  persist();
  renderEvents();
});
$("#ratingFilter").addEventListener("change", renderRatingTable);
$("#deleteEventBtn").addEventListener("click", deleteSelectedEvent);
$("#selectedEventIntensity").addEventListener("change", (event) => updateSelectedEventMeta("intensity", event.target.value));
$("#selectedGoalsFor").addEventListener("change", (event) => updateSelectedEventMeta("goalsFor", event.target.value));
$("#selectedGoalsAgainst").addEventListener("change", (event) => updateSelectedEventMeta("goalsAgainst", event.target.value));
$("#selectedMatchDuration").addEventListener("change", (event) => updateSelectedEventMeta("matchDuration", event.target.value));
$("#selectedTrainingFocus").addEventListener("change", (event) => updateSelectedEventMeta("trainingFocus", event.target.value));
$("#profilePlayer").addEventListener("change", () => {
  resetDevelopmentPlanForm();
  drawProfile();
});
$("#profilePdfBtn").addEventListener("click", downloadProfilePdf);
$("#developmentPlanForm").addEventListener("submit", saveDevelopmentPlan);
$("#cancelDevelopmentPlanBtn").addEventListener("click", resetDevelopmentPlanForm);
$("#opponentForm").addEventListener("submit", saveOpponent);
$("#cancelOpponentBtn").addEventListener("click", resetOpponentForm);

$("#developmentPlanList").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.action === "edit-plan") editDevelopmentPlan(button.dataset.id);
  if (button.dataset.action === "delete-plan") deleteDevelopmentPlan(button.dataset.id);
});

$("#opponentList").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.action === "edit-opponent") editOpponent(button.dataset.id);
  if (button.dataset.action === "delete-opponent") deleteOpponent(button.dataset.id);
});

$("#playerTable").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const player = state.players.find((item) => item.id === button.dataset.id);
  if (button.dataset.action === "profile") {
    $("#profilePlayer").value = player.id;
    setView("profiles");
    drawProfile();
  }
  if (button.dataset.action === "edit") openPlayerDialog(player);
  if (button.dataset.action === "invite" && player) createInviteCodeForPlayer(player.id);
  if (button.dataset.action === "delete" && player) {
    if (!confirm(`"${player.name}" wirklich löschen? Alle Bewertungen und der Förderplan dieses Spielers gehen verloren.`)) return;
    cloudDeletePlayer(player.id);
    state.players = state.players.filter((item) => item.id !== player.id);
    state.events.forEach((item) => delete item.ratings?.[player.id]);
    delete state.developmentPlans?.[player.id];
    persist();
    renderAll();
  }
});

$("#eventList").addEventListener("click", (event) => {
  const card = event.target.closest("[data-event-id]");
  if (!card) return;
  state.selectedEventId = card.dataset.eventId;
  persist();
  renderEvents();
});

$("#ratingTable").addEventListener("change", (event) => {
  const input = event.target.closest(".rating-input");
  if (!input) return;
  updateRating(input.dataset.playerId, input.dataset.field, input.value);
});

$("#ratingTable").addEventListener("input", (event) => {
  const input = event.target.closest(".rating-note");
  if (!input) return;
  updateRating(input.dataset.playerId, input.dataset.field, input.value, false);
});

$("#trainerLoginForm").addEventListener("submit", handleTrainerLogin);
$("#playerLoginForm").addEventListener("submit", handlePlayerLogin);
$("#signOutBtn").addEventListener("click", handleSignOut);
$("#migrateDataBtn").addEventListener("click", migrateLegacyBlobToCollections);
$("#accessManagerList").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action='revoke-access']");
  if (!button) return;
  revokeAccess(button.dataset.uid);
});

initTheme();
prepareMobileAccordions();
renderAll();
initDataStore();
