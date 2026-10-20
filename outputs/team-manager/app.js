const storageKey = "teamkompass-data-v2";
const legacyStorageKey = "teamkompass-data-v1";
const themeStorageKey = "teamkompass-theme";
const cacheStampKey = "teamkompass-cache-written-at";

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

// 14 feste Positionszonen auf dem Feld (x/y-Zentrum + Breite in % von .pitch),
// in die Spieler per Drag & Drop oder ueber die Kaderauswahl (Klick) gestellt
// werden koennen. Jede Zone kann beliebig viele Spieler aufnehmen (z.B. 3x IV
// bei Dreierkette) - sie werden per Flexbox innerhalb der Zonenbreite verteilt.
// Muss vor loadState()/normalizeState() stehen, da normalizeLineup() das schon
// beim initialen Laden benoetigt.
const PITCH_ZONES = {
  TW: { x: 50, y: 92, width: 16 },
  LV: { x: 17, y: 68, width: 20 },
  IV: { x: 50, y: 70, width: 54 },
  LIB: { x: 50, y: 79, width: 22 },
  RV: { x: 83, y: 68, width: 20 },
  DM: { x: 50, y: 54, width: 42 },
  ZM: { x: 50, y: 46, width: 60 },
  LM: { x: 17, y: 46, width: 20 },
  RM: { x: 83, y: 46, width: 20 },
  OM: { x: 50, y: 30, width: 66 },
  LA: { x: 19, y: 20, width: 24 },
  HS: { x: 50, y: 18, width: 30 },
  ST: { x: 50, y: 14, width: 46 },
  RA: { x: 81, y: 20, width: 24 }
};

// Baender von hinten nach vorne - die Formationsbezeichnung (z.B. "4-3-3") wird
// nie manuell gepflegt, sondern immer live aus der Summe pro Band abgeleitet
// (leere Baender werden uebersprungen). So aendert sich der Titel automatisch,
// sobald Spieler per Drag & Drop verschoben werden.
const PITCH_BANDS = [
  ["LV", "IV", "LIB", "RV"],
  ["DM"],
  ["LM", "ZM", "RM"],
  ["OM"],
  ["LA", "HS", "ST", "RA"]
];

// Formations-Vorschlaege als Anzahl Spieler pro Zone (TW immer 1). Mehr als
// eine benoetigte Zone (z.B. OM x3 fuer eine 3er-Reihe hinter der Spitze bei
// 4-2-3-1) wird von der Zone selbst per Flexbox nebeneinander verteilt.
const FORMATION_PRESETS = [
  { TW: 1, LV: 1, IV: 2, RV: 1, ZM: 3, LA: 1, ST: 1, RA: 1 },
  { TW: 1, LV: 1, IV: 2, RV: 1, DM: 2, OM: 3, ST: 1 },
  { TW: 1, LV: 1, IV: 2, RV: 1, LM: 1, ZM: 2, RM: 1, ST: 2 },
  { TW: 1, LV: 1, IV: 2, RV: 1, DM: 1, ZM: 2, OM: 1, ST: 2 },
  { TW: 1, LV: 1, IV: 2, RV: 1, DM: 1, LM: 1, ZM: 2, RM: 1, ST: 1 },
  { TW: 1, IV: 3, LM: 1, ZM: 3, RM: 1, ST: 2 },
  { TW: 1, IV: 3, LM: 1, ZM: 2, RM: 1, LA: 1, ST: 1, RA: 1 },
  { TW: 1, LV: 1, IV: 3, RV: 1, ZM: 3, ST: 2 },
  { TW: 1, LV: 1, IV: 2, RV: 1, LM: 1, ZM: 3, RM: 1, ST: 1 }
];

// Gruende der Abwesenheitserfassung. "Verletzung" ist dabei mehr als ein Label:
// solche Eintraege setzen den Status auf "Verletzt" und gehen in den
// Belastungsindikator ein (siehe isInjuryAbsence/playerInjuryRisk).
// Muss vor loadState()/normalizeState() stehen, da normalizeAbsence() das schon
// beim initialen Laden benoetigt.
const ABSENCE_INJURY_REASON = "Verletzung";
const ABSENCE_FIXED_REASONS = [ABSENCE_INJURY_REASON, "Urlaub", "Klassenfahrt", "Schule", "Sperre"];

let state = loadState();
let mobileAccordionsPrepared = false;
const $ = (selector) => document.querySelector(selector);

// Haengt einen Listener nur an, wenn es das Element wirklich gibt.
// Ohne diese Pruefung reisst eine einzige fehlende Schaltflaeche das Laden
// der gesamten App ab - etwa wenn ein Browser nach einem Update noch eine
// aeltere index.html aus seinem Zwischenspeicher ausliefert, das frische
// app.js aber schon geladen hat.
function on(selector, type, handler, options) {
  const element = $(selector);
  if (element) element.addEventListener(type, handler, options);
  return element;
}
const standardPositions = ["TW", "IV", "LIB", "LV", "RV", "DM", "ZM", "OM", "LM", "RM", "LA", "RA", "HS", "ST"];

const views = {
  dashboard: $("#dashboardView"),
  squad: $("#squadView"),
  events: $("#eventsView"),
  profiles: $("#profilesView"),
  opponents: $("#opponentsView"),
  teamAnalysis: $("#teamAnalysisView")
};

// RENDER-SCHEDULER START
// SCRUM-35: Rendern nach Cloud-Snapshots. Reine Logik ohne DOM-Zugriff (testbar).
// - request() buendelt viele Snapshots auf hoechstens einen Durchlauf je `delay` ms.
// - Ein Durchlauf rendert nur die sichtbare Ansicht; alle anderen gelten als veraltet
//   ("dirty") und werden beim Aktivieren per consume() nachgerendert.
// - clear() verwirft einen geplanten Durchlauf (ein synchrones renderAll() war schneller).
function createRenderScheduler({ viewNames, activeView, renderShared, renderView, onFlush, delay = 80, timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) } }) {
  const dirty = new Set();
  let pending = null;
  const flush = () => {
    pending = null;
    renderShared();
    const active = activeView();
    viewNames.forEach((name) => {
      if (name === active) {
        dirty.delete(name);
        renderView(name);
      } else {
        dirty.add(name);
      }
    });
    if (onFlush) onFlush();
  };
  return {
    request() {
      if (pending === null) pending = timers.set(flush, delay);
    },
    clear() {
      if (pending !== null) timers.clear(pending);
      pending = null;
      dirty.clear();
    },
    consume(name) {
      return dirty.delete(name);
    },
    isPending: () => pending !== null,
    isDirty: (name) => dirty.has(name),
    flush
  };
}

// Kennzahlen (Durchschnittsnote, Verletzungsrisiko, sortierte Events) sind innerhalb eines
// Render-Durchlaufs konstant. Ausserhalb eines Durchlaufs (Eingabe-Handler) wird nie gecacht.
function createRenderPassMemo() {
  let memo = null;
  return {
    run(fn) {
      if (memo) return fn();
      memo = new Map();
      try {
        return fn();
      } finally {
        memo = null;
      }
    },
    get(kind, key, compute) {
      if (!memo) return compute();
      const id = `${kind}:${key}`;
      if (!memo.has(id)) memo.set(id, compute());
      return memo.get(id);
    }
  };
}
// RENDER-SCHEDULER END

const renderPassMemoizer = createRenderPassMemo();
const renderPassMemo = (kind, key, compute) => renderPassMemoizer.get(kind, key, compute);
const withRenderPass = (fn) => renderPassMemoizer.run(fn);

const VIEW_RENDER_STEPS = {
  dashboard: [[() => renderMetrics(), "Dashboard-Kennzahlen"], [() => renderPitch(), "Startelf"], [() => renderLeaders(), "Formkurve"]],
  squad: [[() => renderSquad(), "Kader"]],
  events: [[() => renderEvents(), "Events"]],
  profiles: [[() => drawProfile(), "Spielerprofile"]],
  opponents: [[() => renderOpponentAnalysis(), "Gegneranalyse"]],
  teamAnalysis: [[() => renderTeamAnalysis(), "Teamanalyse"]]
};

const renderScheduler = createRenderScheduler({
  viewNames: Object.keys(VIEW_RENDER_STEPS),
  activeView: () => Object.keys(views).find((name) => views[name].classList.contains("active")),
  renderShared: () => withRenderPass(() => safeRender(renderSelects, "Auswahllisten")),
  renderView: (name) => withRenderPass(() => VIEW_RENDER_STEPS[name].forEach(([fn, label]) => safeRender(fn, label))),
  onFlush: () => document.dispatchEvent(new CustomEvent("teamkompass:render"))
});

function requestCloudRender() {
  renderScheduler.request();
}

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

function applyTeamBrand() {
  const teamName = window.TEAMKOMPASS_CONFIG?.teamName || "TeamKompass";
  document.querySelectorAll(".brand strong, .welcome-kicker").forEach((element) => { element.textContent = teamName; });
  document.querySelectorAll(".club-logo").forEach((image) => { image.alt = `${teamName} Logo`; });
}

function applyTheme(theme) {
  const nextTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = nextTheme;
  localStorage.setItem(themeStorageKey, nextTheme);
  const toggle = $("#themeToggle");
  const label = $("#themeToggleText");
  if (toggle) {
    // Aktionsname statt Schalter: kein aria-pressed, das dem Namen widersprechen wuerde.
    const action = nextTheme === "dark" ? "Lightmode einschalten" : "Darkmode einschalten";
    toggle.setAttribute("aria-label", action);
    toggle.title = action;
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

// ---- Diagramme ----
// Die Zeichenflaechen richten sich nach ihrer tatsaechlichen Breite im Layout
// statt nach einer festen 980px-Bitmap. Ohne das wuerde die Bitmap auf dem
// Handy auf gut ein Drittel gestaucht und alle Beschriftungen waeren nur noch
// wenige Pixel gross.
function setupChartCanvas(canvas, heightFor) {
  const fallbackWidth = ($(".main")?.clientWidth || window.innerWidth || 720) - 56;
  const width = Math.max(Math.round(canvas.clientWidth || fallbackWidth), 240);
  const height = Math.max(Math.round(typeof heightFor === "function" ? heightFor(width) : heightFor), 150);
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const palette = chartPalette();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = palette.surface;
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  return { ctx, width, height, palette, compact: width < 520 };
}

function chartFonts(compact) {
  return compact
    ? { title: "700 13px system-ui", label: "10px system-ui", value: "700 11px system-ui", legend: "11px system-ui", empty: "12px system-ui" }
    : { title: "700 18px system-ui", label: "12px system-ui", value: "700 13px system-ui", legend: "13px system-ui", empty: "14px system-ui" };
}

// Ruhige, einheitliche Diagrammfarben (--chart-* in base.css, hell und dunkel). Neben der Farbe
// unterscheiden Markerformen und Beschriftungen die Reihen (SCRUM-94).
function chartPalette() {
  return {
    surface: cssVar("--field") || "#ffffff",
    panel: cssVar("--panel") || "#ffffff",
    ink: cssVar("--ink") || "#241d1f",
    muted: cssVar("--muted") || "#70686b",
    line: cssVar("--line") || "#e4dcde",
    soft: cssVar("--soft-neutral") || "#e9e7ec",
    series: [
      cssVar("--chart-1") || "#3f6c99",
      cssVar("--chart-2") || "#2c8579",
      cssVar("--chart-3") || "#b9812a",
      cssVar("--chart-4") || "#b5505f"
    ]
  };
}

function chartRoundRect(ctx, x, y, w, h, radius) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Zeichnet einen Marker der Form circle/square/diamond/triangle um (x, y).
function chartMarker(ctx, shape, x, y, r) {
  ctx.beginPath();
  if (shape === "square") {
    chartRoundRect(ctx, x - r, y - r, r * 2, r * 2, r * 0.3);
  } else if (shape === "diamond") {
    ctx.moveTo(x, y - r * 1.25);
    ctx.lineTo(x + r * 1.25, y);
    ctx.lineTo(x, y + r * 1.25);
    ctx.lineTo(x - r * 1.25, y);
    ctx.closePath();
  } else if (shape === "triangle") {
    ctx.moveTo(x, y - r * 1.2);
    ctx.lineTo(x + r * 1.2, y + r * 0.9);
    ctx.lineTo(x - r * 1.2, y + r * 0.9);
    ctx.closePath();
  } else {
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
}

// Gleichmaessige, ueberschwingungsfreie Kurve durch die Punkte (monotone kubische Interpolation).
function chartSmoothPath(ctx, points) {
  ctx.moveTo(points[0].x, points[0].y);
  if (points.length < 3) {
    points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
    return;
  }
  const count = points.length;
  const widths = [];
  const slopes = [];
  for (let i = 0; i < count - 1; i += 1) {
    widths[i] = points[i + 1].x - points[i].x || 1;
    slopes[i] = (points[i + 1].y - points[i].y) / widths[i];
  }
  const tangents = [slopes[0]];
  for (let i = 1; i < count - 1; i += 1) tangents[i] = slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2;
  tangents[count - 1] = slopes[count - 2];
  for (let i = 0; i < count - 1; i += 1) {
    if (slopes[i] === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const a = tangents[i] / slopes[i];
    const b = tangents[i + 1] / slopes[i];
    const sum = a * a + b * b;
    if (sum > 9) {
      const scale = 3 / Math.sqrt(sum);
      tangents[i] = scale * a * slopes[i];
      tangents[i + 1] = scale * b * slopes[i];
    }
  }
  for (let i = 0; i < count - 1; i += 1) {
    const w = widths[i] / 3;
    ctx.bezierCurveTo(points[i].x + w, points[i].y + tangents[i] * w, points[i + 1].x - w, points[i + 1].y - tangents[i + 1] * w, points[i + 1].x, points[i + 1].y);
  }
}

// ---- Hover-/Fokus-Werte der Diagramme (Maus, Touch, Pfeiltasten) ----
// Jedes Diagramm meldet seine Messpunkte als { ax, ay, test(x, y), text }; der Tooltip zeigt den Wert
// des getroffenen Punkts. Die vollstaendige Wertliste steht zusaetzlich als aria-label am Canvas.
const chartHitState = new WeakMap();
let chartTooltipEl = null;

function chartTooltipElement() {
  if (!chartTooltipEl) {
    chartTooltipEl = document.createElement("div");
    chartTooltipEl.className = "chart-tooltip";
    chartTooltipEl.setAttribute("aria-hidden", "true");
    chartTooltipEl.hidden = true;
    document.body.append(chartTooltipEl);
  }
  return chartTooltipEl;
}

function hideChartTooltip() {
  if (chartTooltipEl) chartTooltipEl.hidden = true;
}

function showChartTooltip(canvas, hit) {
  const tip = chartTooltipElement();
  tip.textContent = hit.text;
  tip.hidden = false;
  const box = canvas.getBoundingClientRect();
  const tipBox = tip.getBoundingClientRect();
  const left = Math.min(Math.max(box.left + hit.ax - tipBox.width / 2, 8), window.innerWidth - tipBox.width - 8);
  const above = box.top + hit.ay - tipBox.height - 12;
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(above < 8 ? box.top + hit.ay + 16 : above)}px`;
}

function chartHitAt(canvas, event) {
  const state = chartHitState.get(canvas);
  if (!state?.hits.length) return -1;
  const box = canvas.getBoundingClientRect();
  const x = event.clientX - box.left;
  const y = event.clientY - box.top;
  let best = -1;
  let bestDistance = Infinity;
  state.hits.forEach((hit, index) => {
    if (!hit.test(x, y)) return;
    const distance = Math.hypot(hit.ax - x, hit.ay - y);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

function bindChartHits(canvas) {
  const showIndex = (index) => {
    const state = chartHitState.get(canvas);
    if (!state || index < 0 || index >= state.hits.length) {
      hideChartTooltip();
      return;
    }
    state.active = index;
    showChartTooltip(canvas, state.hits[index]);
  };
  const onPointer = (event) => showIndex(chartHitAt(canvas, event));
  canvas.addEventListener("pointermove", onPointer);
  canvas.addEventListener("pointerdown", onPointer);
  canvas.addEventListener("pointerleave", hideChartTooltip);
  canvas.addEventListener("blur", hideChartTooltip);
  canvas.addEventListener("focus", () => {
    if (canvas.matches(":focus-visible")) showIndex(0);
  });
  canvas.addEventListener("keydown", (event) => {
    const state = chartHitState.get(canvas);
    if (!state?.hits.length) return;
    const last = state.hits.length - 1;
    const keys = { ArrowRight: Math.min(state.active + 1, last), ArrowDown: Math.min(state.active + 1, last), ArrowLeft: Math.max(state.active - 1, 0), ArrowUp: Math.max(state.active - 1, 0), Home: 0, End: last };
    if (event.key === "Escape") {
      hideChartTooltip();
      return;
    }
    if (!(event.key in keys)) return;
    event.preventDefault();
    showIndex(keys[event.key]);
  });
  window.addEventListener("scroll", hideChartTooltip, { passive: true });
}

// Setzt Textalternative und Messpunkte eines Diagramms. Ohne Punkte (leeres Diagramm) ist es nicht fokussierbar.
function describeChart(canvas, label, hits = []) {
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", label);
  const existing = chartHitState.get(canvas);
  const state = existing || { hits: [], active: -1 };
  state.hits = hits;
  state.active = -1;
  chartHitState.set(canvas, state);
  if (!existing) bindChartHits(canvas);
  if (hits.length) canvas.tabIndex = 0;
  else canvas.removeAttribute("tabindex");
  hideChartTooltip();
}

function chartSummary(title, items) {
  const text = items.join(", ");
  return `${title}: ${text.length > 700 ? `${text.slice(0, 700)} …` : text}`;
}

// Welche Rubrikenbeschriftungen (Datum) angezeigt werden: jede step-te plus immer die letzte,
// ohne dass die vorletzte mit der letzten zusammenstoesst.
function chartLabelIndices(count, step) {
  const indices = [];
  for (let i = 0; i < count; i += step) indices.push(i);
  const last = count - 1;
  while (indices.length && last - indices[indices.length - 1] < step && indices[indices.length - 1] !== last) indices.pop();
  if (indices[indices.length - 1] !== last) indices.push(last);
  return new Set(indices);
}

// Schreibt einen Hinweis mittig in die leere Zeichenflaeche und bricht ihn um.
function drawChartPlaceholder(chart, text) {
  const { ctx, width, height, palette, compact } = chart;
  ctx.fillStyle = palette.muted;
  ctx.font = chartFonts(compact).empty;
  ctx.textAlign = "center";
  const maxWidth = width - 24;
  const lines = [];
  let line = "";
  text.split(" ").forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  });
  if (line) lines.push(line);
  const startY = height / 2 - ((lines.length - 1) * 16) / 2 + 4;
  lines.forEach((entry, index) => ctx.fillText(entry, width / 2, startY + index * 16));
  ctx.textAlign = "left";
}

// Kleine Legende: Marker + Text, bricht bei Platzmangel um. Gibt die naechste freie y-Position zurueck.
function drawChartLegend(chart, items, x, y) {
  const { ctx, width, palette, compact } = chart;
  ctx.font = chartFonts(compact).legend;
  let cursorX = x;
  let cursorY = y;
  items.forEach((item) => {
    const labelWidth = ctx.measureText(item.label).width;
    if (cursorX > x && cursorX + 22 + labelWidth > width - 12) {
      cursorX = x;
      cursorY += 18;
    }
    ctx.fillStyle = item.color;
    chartMarker(ctx, item.shape || "circle", cursorX + 5, cursorY - 4, 4.5);
    ctx.fill();
    ctx.fillStyle = palette.ink;
    ctx.fillText(item.label, cursorX + 15, cursorY);
    cursorX += 15 + labelWidth + 18;
  });
  return cursorY;
}

// Gemeinsamer Notenverlauf fuer Spieler- und Teamform (Schulnoten 1 bis 6, 1 = oben = beste Note).
// entries: { label, grade, color?, shape?, kind?, detail? }; options.legend: Marker-Legende.
function drawGradeTrendChart(canvas, title, entries, emptyText, options = {}) {
  if (!canvas) return;
  const chart = setupChartCanvas(canvas, (width) => (width < 520 ? Math.round(width * 0.8) : Math.round(width / 2.6)));
  const { ctx, width, height, palette, compact } = chart;
  const font = chartFonts(compact);
  const lineColor = palette.series[0];

  ctx.fillStyle = palette.ink;
  ctx.font = font.title;
  ctx.fillText(title, 12, compact ? 18 : 24);

  if (!entries.length) {
    drawChartPlaceholder(chart, emptyText);
    describeChart(canvas, `${title}: ${emptyText}`);
    return;
  }

  let headBottom = compact ? 18 : 24;
  if (options.legend?.length) headBottom = drawChartLegend(chart, options.legend, 12, headBottom + (compact ? 16 : 20));
  ctx.fillStyle = palette.muted;
  ctx.font = font.label;
  ctx.textAlign = "right";
  ctx.fillText("1 = beste Note", width - 12, compact ? 18 : 24);
  ctx.textAlign = "left";

  const left = compact ? 24 : 36;
  const right = width - (compact ? 14 : 24);
  const top = headBottom + (compact ? 26 : 32);
  const bottom = height - (compact ? 24 : 30);
  const yFor = (grade) => top + ((Number(grade) - 1) * (bottom - top)) / 5;

  // Heller Bereich fuer die Noten 1 bis 3 (gut), dezente gestrichelte Hilfslinien.
  ctx.fillStyle = `${lineColor}14`;
  chartRoundRect(ctx, left, yFor(1), right - left, yFor(3) - yFor(1), 6);
  ctx.fill();
  ctx.font = font.label;
  ctx.setLineDash([2, 5]);
  ctx.lineWidth = 1;
  for (let grade = 1; grade <= 6; grade += 1) {
    ctx.strokeStyle = palette.line;
    ctx.beginPath();
    ctx.moveTo(left, yFor(grade));
    ctx.lineTo(right, yFor(grade));
    ctx.stroke();
    ctx.fillStyle = palette.muted;
    ctx.textAlign = "right";
    ctx.fillText(String(grade), left - 8, yFor(grade) + 3.5);
  }
  ctx.setLineDash([]);
  ctx.textAlign = "left";

  const span = Math.max(entries.length - 1, 1);
  const points = entries.map((entry, index) => ({
    x: entries.length === 1 ? (left + right) / 2 : left + (index * (right - left)) / span,
    y: yFor(entry.grade),
    entry
  }));

  if (points.length > 1) {
    const fill = ctx.createLinearGradient(0, top, 0, bottom);
    fill.addColorStop(0, `${lineColor}30`);
    fill.addColorStop(1, `${lineColor}00`);
    ctx.beginPath();
    chartSmoothPath(ctx, points);
    ctx.lineTo(points[points.length - 1].x, bottom);
    ctx.lineTo(points[0].x, bottom);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = compact ? 2.5 : 3;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    chartSmoothPath(ctx, points);
    ctx.stroke();
  }

  // Wertbeschriftung: bei wenigen Punkten alle, sonst nur den letzten und den besten.
  const showAllValues = points.length <= (compact ? 5 : 9);
  const bestIndex = points.reduce((best, point, index) => (point.entry.grade < points[best].entry.grade ? index : best), 0);
  const labelStep = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor((right - left) / (compact ? 42 : 64)))));
  const labelled = chartLabelIndices(points.length, labelStep);
  const markerRadius = compact ? 4.5 : 6;
  points.forEach((point, index) => {
    const isLast = index === points.length - 1;
    const color = point.entry.color || lineColor;
    if (isLast) {
      ctx.fillStyle = `${color}33`;
      chartMarker(ctx, point.entry.shape, point.x, point.y, markerRadius + 5);
      ctx.fill();
    }
    ctx.fillStyle = isLast ? color : palette.surface;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    chartMarker(ctx, point.entry.shape, point.x, point.y, markerRadius);
    ctx.fill();
    ctx.stroke();
    if (showAllValues || isLast || index === bestIndex) {
      ctx.fillStyle = palette.ink;
      ctx.font = font.value;
      ctx.textAlign = "center";
      ctx.fillText(gradeLabel(Number(point.entry.grade)), Math.min(Math.max(point.x, left + 10), right - 10), point.y - markerRadius - 7);
      ctx.textAlign = "left";
    }
    if (!labelled.has(index)) return;
    ctx.fillStyle = palette.muted;
    ctx.font = font.label;
    ctx.textAlign = "center";
    ctx.fillText(point.entry.label, Math.min(Math.max(point.x, left + 12), right - 12), bottom + (compact ? 15 : 19));
    ctx.textAlign = "left";
  });

  const hitRadius = compact ? 18 : 22;
  describeChart(
    canvas,
    chartSummary(`${title} (Schulnote, 1 ist die beste)`, entries.map((entry) => `${entry.label} ${entry.kind ? `${entry.kind} ` : ""}Note ${gradeLabel(Number(entry.grade))}`)),
    points.map((point) => ({
      ax: point.x,
      ay: point.y,
      test: (x, y) => Math.hypot(point.x - x, point.y - y) <= hitRadius || (Math.abs(point.x - x) <= (right - left) / span / 2 && y >= top - 8 && y <= bottom + 8),
      text: `${point.entry.detail || point.entry.label}${point.entry.kind ? ` · ${point.entry.kind}` : ""}: Note ${gradeLabel(Number(point.entry.grade))}`
    }))
  );
}

// Rollen-Modus: Ohne Anmeldung darf weder der lokale Zwischenspeicher noch die
// Demo-Datenbasis in die Oberflaeche gelangen - die Daten kommen erst nach der
// Rollenpruefung aus der Cloud.
function isRoleModeConfigured() {
  const config = window.TEAMKOMPASS_CONFIG || {};
  return config.storage === "firebase" && Boolean(config.enableRoles);
}

function loadState() {
  if (isRoleModeConfigured()) return normalizeState({ players: [], events: [], opponents: [] });
  try {
    // Der frueher im Planungsbereich einstellbare Wert wird weiter respektiert,
    // damit bestehende Installationen ihre Aufbewahrungsdauer behalten. Ohne
    // gespeicherten Wert gelten 90 Tage.
    const workspace = JSON.parse(localStorage.getItem("teamkompass-workspace-v1") || "{}");
    const retentionMs = Number(workspace.retentionDays || 90) * 86400000;
    const stamp = Number(localStorage.getItem(cacheStampKey) || Date.now());
    if (Date.now() - stamp > retentionMs) {
      localStorage.removeItem(storageKey);
      localStorage.removeItem(legacyStorageKey);
      localStorage.removeItem(cacheStampKey);
    }
  } catch { /* Ungültige lokale Metadaten dürfen den App-Start nicht blockieren. */ }
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
  const absences = normalizeAbsences(data.absences, playerIds);
  const lineup = normalizeLineup(data.lineup, playerIds);
  const eventLineups = normalizeEventLineups(data.eventLineups || data.lineup?.byEvent, playerIds);
  const measurements = normalizeMeasurements(data.measurements, playerIds);
  return {
    players: players.map(normalizePlayer),
    events: events.map(normalizeEvent),
    developmentPlans,
    absences,
    lineup,
    eventLineups,
    measurements,
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
    selfReflection: plan.selfReflection || "",
    selfReflectionAt: plan.selfReflectionAt || "",
    coachReview: plan.coachReview || "",
    reviewDate: plan.reviewDate || "",
    status: plan.status || "Offen",
    dueDate: plan.dueDate || "",
    createdAt: plan.createdAt || localIsoDate()
  };
}

function normalizeAbsences(absences = {}, playerIds = new Set()) {
  const normalized = {};
  Object.entries(absences || {}).forEach(([playerId, items]) => {
    if (playerIds.size && !playerIds.has(playerId)) return;
    normalized[playerId] = Array.isArray(items) ? items.map(normalizeAbsence) : [];
  });
  playerIds.forEach((playerId) => {
    normalized[playerId] ||= [];
  });
  return normalized;
}

function normalizeAbsence(absence = {}) {
  return {
    id: absence.id || `ab${crypto.randomUUID()}`,
    kind: isInjuryAbsence(absence) ? "injury" : "absence",
    label: absence.label || "",
    detail: absence.detail || "",
    from: absence.from || "",
    to: absence.to || ""
  };
}

// Eine Verletzung ist ein eigener Abwesenheitsgrund: sie setzt den Status auf
// "Verletzt" statt nur "Abwesend" und zaehlt im Belastungsindikator mit. Eintraege
// von vor dieser Unterscheidung kennen das Feld noch nicht - dort wurde eine
// Verletzung als Freitext gepflegt, deshalb zaehlt hilfsweise auch das Label.
function isInjuryAbsence(absence) {
  if (absence?.kind) return absence.kind === "injury";
  return /^verletz/i.test((absence?.label || "").trim());
}

// Anzeigename inkl. Verletzungsart ("Verletzung · Muskelfaserriss Oberschenkel").
function absenceTitle(absence) {
  const detail = (absence?.detail || "").trim();
  return detail ? `${absence.label} · ${detail}` : absence?.label || "";
}

function absencePeriodText(absence) {
  if (!absence?.to) return `seit ${formatDate(absence?.from)} · Ende offen`;
  return `${formatDate(absence.from)} – ${formatDate(absence.to)}`;
}

function normalizeMeasurements(measurements = {}, playerIds = new Set()) {
  const normalized = {};
  Object.entries(measurements || {}).forEach(([playerId, items]) => {
    if (playerIds.size && !playerIds.has(playerId)) return;
    normalized[playerId] = Array.isArray(items) ? items.map(normalizeMeasurement) : [];
  });
  playerIds.forEach((playerId) => {
    normalized[playerId] ||= [];
  });
  return normalized;
}

function normalizeMeasurement(measurement = {}) {
  return {
    id: measurement.id || `me${crypto.randomUUID()}`,
    date: measurement.date || localIsoDate(),
    height: measurement.height ?? "",
    weight: measurement.weight ?? ""
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
    updatedAt: opponent.updatedAt || localIsoDate()
  };
}

function normalizePlayer(player) {
  const positions = parsePositions(player.positions || player.position || "");
  const injuryUntil = player.injuryUntil || "";
  if (player.birthdate) return { ...player, positions, injuryUntil };
  const year = new Date().getFullYear() - Number(player.age || 20);
  return { ...player, positions, injuryUntil, birthdate: `${year}-07-01` };
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
  // Interne Trainer-Notizen je Spieler (nur Text). Bei Spielern/Eltern ist das immer leer.
  const privateNotes = {};
  Object.entries(event.privateNotes || {}).forEach(([playerId, note]) => {
    if (typeof note === "string" && note) privateNotes[playerId] = note;
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
    privateNotes,
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
  // Von der Abwesenheits-Automatik gesetzt und seither nicht angefasst (siehe applyAutoAbsence).
  if (rating.autoAbsence === true) normalized.autoAbsence = true;
  normalized.grade = calculatedGrade(normalized);
  return normalized;
}

// Gewichtung der Gesamtnote: keine Teilnote darf allein dominieren. Einsatz und Fehlerquote
// bleiben mit 30% die staerksten Faktoren, Entscheidungsfindung ist mit 25% nahezu gleichwertig,
// und Lernfaehigkeit bekommt mit 15% ein Gewicht, das sie tatsaechlich beeinflussen kann - damit
// ein laufstarker, spielintelligenter Spieler nicht allein wegen einer schwaecheren Fehlerquote
// abgestraft wird.
function calculatedGrade(rating) {
  if (!rating || rating.attendance === "absent" || rating.attendance === "excluded") return "";
  const fields = ["effort", "technique", "tactics", "comprehension"];
  if (!fields.every((field) => rating[field])) return "";
  return roundGrade(Number(rating.effort) * 0.3 + Number(rating.technique) * 0.3 + Number(rating.tactics) * 0.25 + Number(rating.comprehension) * 0.15);
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
      date: data.records.at(-1)?.date || localIsoDate(),
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

// Lokaler Zwischenspeicher fuer den Teamstand. Spieler, Eltern, Scout- und Medizin-
// Zugang cachen nichts: sie sehen personenbezogene Daten von Minderjaehrigen, die
// nicht auf dem Geraet zurueckbleiben sollen.
function canCacheLocally() {
  return !["player", "parent", "medical", "scout"].includes(currentRole);
}

function writeLocalCache() {
  if (!canCacheLocally()) return;
  localStorage.setItem(storageKey, JSON.stringify(state));
  localStorage.setItem(cacheStampKey, String(Date.now()));
}

// Entfernt den gesamten lokal gespeicherten Teamstand (Abmelden, Konto-Wechsel).
function clearLocalTeamData() {
  [storageKey, legacyStorageKey, cacheStampKey].forEach((key) => {
    try { localStorage.removeItem(key); } catch { /* Speicher gesperrt: nichts zu loeschen. */ }
  });
}

// Reine Navigationszustaende (z. B. gewaehltes Event) werden nur lokal gemerkt. Es folgt kein
// Cloud-Write, also darf auch kein "Wird gespeichert …" angezeigt werden (SCRUM-50).
function persistLocalUiState() {
  state = normalizeState(state);
  writeLocalCache();
}

function persist() {
  state = normalizeState(state);
  writeLocalCache();
  if (isCloudTrainer()) setSyncState("pending", "Wird gespeichert …");
  if (legacyBlobMode) {
    scheduleLegacyCloudSave();
  } else if (!isCloudActive()) {
    $("#storageState").textContent = `Gespeichert ${new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
  }
}

function setSyncState(stateName, label) {
  const target = $("#storageState");
  if (!target) return;
  target.dataset.syncState = stateName;
  target.textContent = label;
}

function cloudWriteSucceeded() {
  setSyncState("saved", `Cloud synchronisiert ${new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`);
}

function cloudWriteFailed(error, label) {
  console.error(error);
  setSyncState("error", "Speichern fehlgeschlagen – erneut versuchen");
  alert(`${label}${cloudErrorSuffix(error)}`);
}

// Listener-Gesundheit: Ein Fehler eines Echtzeit-Listeners darf nicht unsichtbar bleiben, sonst
// vertraut man veralteten Daten. Der Status ist als role="status" (index.html) auch fuer
// Screenreader erkennbar; technische Details landen nur in der Konsole.
const cloudListenerFailures = new Set();
let cloudSyncDegraded = false;
let cloudRestartTimer = null;
const RETRYABLE_LISTENER_ERRORS = ["unavailable", "deadline-exceeded", "aborted", "cancelled", "internal"];

function cloudListenerFailed(key, error) {
  console.error(key, error);
  cloudListenerFailures.add(key);
  cloudSyncDegraded = true;
  setSyncState("error", "Verbindung unterbrochen – Daten evtl. nicht aktuell");
  // Ein Listener ist nach einem Fehler beendet. Bei voruebergehenden Fehlern wird die gesamte
  // Synchronisation nach kurzer Pause neu gestartet; bei Berechtigungsfehlern nicht (Endlosschleife).
  if (RETRYABLE_LISTENER_ERRORS.includes(error?.code) && !cloudRestartTimer) {
    cloudRestartTimer = setTimeout(() => {
      cloudRestartTimer = null;
      if (!currentRole) return;
      stopCloudSync();
      cloudListenerFailures.clear();
      startCloudSync();
    }, 10000);
  }
}

function cloudListenerRecovered(key) {
  cloudListenerFailures.delete(key);
  if (!cloudSyncDegraded || cloudListenerFailures.size) return;
  cloudSyncDegraded = false;
  setSyncState("saved", "Cloud verbunden");
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
let currentRole = null; // "trainer" | "player" | "parent" | "medical" | "scout" | null (siehe effectiveMemberRole)
let currentPlayerId = null;
let authModule = null;
let authInstance = null;
let firestoreDb = null;
// Schutz gegen doppeltes Absenden des Spieler-Login-Formulars (z.B. Doppel-Tap auf
// mobilen Geraeten): ein zweiter, fast gleichzeitiger Schreibversuch auf denselben
// members/{uid}-Pfad wuerde, nachdem der erste das Dokument schon angelegt hat, als
// "update" statt "create" gewertet und faellt damit unter "allow update: if false".
let playerLoginInFlight = false;
let currentTeamId = null;
let cloudUnsubscribers = [];
// Pro-Event- bzw. pro-Spieler-Listener fuer ratings/developmentPlans (siehe startCloudSync):
// eventId/playerId -> unsubscribe-Funktion.
let ratingListeners = {};
// Interne Trainer-Notizen (nur Trainer duerfen den Pfad lesen, siehe firestore.rules).
let privateNoteListeners = {};
let planListeners = {};
let absenceListeners = {};
let measurementListeners = {};
let legacyBlobMode = false;
let legacyCloudSaveTimer = null;
const cloudCache = { players: [], events: [], ratings: {}, privateNotes: {}, developmentPlans: {}, absences: {}, measurements: {}, opponents: [], lineup: null, scoutProfiles: null, playersLoaded: false, eventsLoaded: false };

function isCloudActive() {
  return Boolean(firestoreDb);
}

// Spieler, Eltern, Medizin- und Scout-Zugang lesen nur: Bearbeiten/Loeschen gehoert nicht
// in ihre Oberflaeche (Firestore lehnt die Schreibzugriffe ohnehin ab).
function canManageRecords() {
  return !["player", "parent", "medical", "scout"].includes(currentRole);
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
    if (isRoleModeConfigured()) showAuthGateError("Die Anmeldung ist gerade nicht erreichbar (offline oder Netzwerkfehler). Es werden keine Teamdaten angezeigt. Bitte Verbindung pruefen und die Seite neu laden.");
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
  }, (error) => {
    console.error(error);
    setSyncState("error", "Verbindung unterbrochen – Daten evtl. nicht aktuell");
  });
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
    // Ohne Anmeldung darf kein Teamstand im Browser bleiben - weder im Speicher noch lokal.
    clearLocalTeamData();
    if (state.players.length || state.events.length) {
      Object.assign(cloudCache, { players: [], events: [], ratings: {}, privateNotes: {}, developmentPlans: {}, absences: {}, measurements: {}, opponents: [], lineup: null, scoutProfiles: null, playersLoaded: false, eventsLoaded: false });
      state = normalizeState({ players: [], events: [], opponents: [] });
      renderAll();
    }
    await showAuthGate();
    return;
  }
  let memberSnap;
  try {
    memberSnap = await firestoreModule.getDoc(teamDoc("members", user.uid));
  } catch (error) {
    console.error(error);
    await showAuthGate();
    // Anonyme Spieler-Anmeldungen legen ihr eigenes members-Dokument erst kurz NACH
    // diesem Aufruf an (siehe handlePlayerLogin) - ein voruebergehendes permission-denied
    // hier ist fuer sie normal und wird dort separat behandelt, deshalb keine Fehlermeldung
    // fuer anonyme Nutzer ueberschreiben.
    if (!user.isAnonymous) {
      $("#authGateError").textContent = `Zugang konnte nicht geprueft werden.${cloudErrorSuffix(error)} (Diagnose - teamId: "${currentTeamId}", UID: "${user.uid}")`;
    }
    return;
  }
  if (!memberSnap.exists()) {
    await showAuthGate();
    // Kein members/{uid}-Dokument gefunden. Fuer ein frisch (per E-Mail/Passwort)
    // angemeldetes Trainer-Konto bedeutet das meist: beim manuellen Anlegen in der
    // Firebase-Konsole (siehe FIREBASE_SETUP.md) fehlt das Dokument, hat die falsche
    // Dokument-ID (muss exakt die UID sein) oder liegt unter einer anderen teamId.
    // Ohne diese Meldung sah es bisher so aus, als wuerde "Anmelden" gar nichts tun -
    // die Anmeldung selbst klappt naemlich, nur die Rollenpruefung schlaegt fehl.
    // Anonyme Spieler-Anmeldungen legen ihr members-Dokument erst im Anschluss an
    // diese Pruefung an (siehe handlePlayerLogin), sind an dieser Stelle also normal
    // noch ohne Dokument - fuer sie deshalb keine Fehlermeldung.
    if (!user.isAnonymous) {
      $("#authGateError").textContent = `Kein Zugang fuer dieses Konto gefunden. Pruefe, ob unter teams/${currentTeamId}/members/${user.uid} ein Dokument mit Feld "role" existiert. (Diagnose - teamId: "${currentTeamId}", UID: "${user.uid}")`;
      await authModule.signOut(authInstance);
    }
    return;
  }
  const member = memberSnap.data();
  // Alt-Konten "medical" ohne healthAccess sind seit SCRUM-170 Scouts (gleiche Logik wie firestore.rules).
  currentRole = effectiveMemberRole(member);
  currentPlayerId = member.playerId || null;
  hideAuthGate();
  applyRoleRestrictions();
  startCloudSync();
  $("#storageState").textContent = "Cloud verbunden";
  document.dispatchEvent(new CustomEvent("teamkompass:cloud-ready"));
}

// SCOUT-PROJECTION START (reine Funktionen ohne Zugriff auf Seitenzustand, getestet in tests/scout-projection.test.mjs)
// SCRUM-170: Scouts lesen nie players/ratings/absences/measurements (dort stehen Status, Verletzung,
// Abwesenheitsgruende in Bewertungsnotizen, Messwerte, Einwilligung). Stattdessen pflegt die Trainer-App
// je Spieler ein bereinigtes Dokument scoutProfiles/{playerId} - nur mit den hier ausdruecklich
// aufgezaehlten Feldern (Positivliste, nichts wird "durchgereicht").
const SCOUT_RATING_FIELDS = ["effort", "technique", "tactics", "comprehension", "minutes", "goals", "assists"];

// Rolle aus dem members-Dokument, wie firestore.rules sie auswertet: "medical" ist nur mit
// healthAccess === true ein Medizin-Zugang; vor SCRUM-170 angelegte "medical"-Konten sind Scouts.
function effectiveMemberRole(member) {
  if (!member || typeof member.role !== "string") return null;
  if (member.role === "medical" && member.healthAccess !== true) return "scout";
  return member.role;
}

// "eingeschraenkt" (dosierte Belastung) und "ausgeschlossen" verraten mehr als die reine Teilnahme -
// der Scout sieht nur anwesend / nicht dabei / offen.
function scoutAttendance(attendance) {
  if (attendance === "present" || attendance === "limited") return "present";
  if (attendance === "absent" || attendance === "excluded") return "absent";
  return "open";
}

// Nur kurze Zahlen-/Textwerte (Teilnoten, Minuten, Tore) - nie Freitext.
function scoutValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length <= 10) return value;
  return "";
}

function scoutRating(rating) {
  const clean = { attendance: scoutAttendance(rating?.attendance) };
  SCOUT_RATING_FIELDS.forEach((field) => { clean[field] = scoutValue(rating?.[field]); });
  return clean;
}

function scoutProfileFor(player, events) {
  const ratings = {};
  (events || []).forEach((event) => {
    const rating = event?.ratings?.[player.id];
    if (!rating || typeof event.id !== "string") return;
    const clean = scoutRating(rating);
    if (clean.attendance !== "open" || SCOUT_RATING_FIELDS.some((field) => clean[field] !== "")) ratings[event.id] = clean;
  });
  const positions = Array.isArray(player.positions) ? player.positions.filter((item) => typeof item === "string").slice(0, 12) : [];
  return {
    playerId: player.id,
    name: typeof player.name === "string" ? player.name : "",
    number: scoutValue(player.number),
    positions,
    birthdate: typeof player.birthdate === "string" ? player.birthdate.slice(0, 10) : "",
    ratings
  };
}

function buildScoutProfiles(players, events) {
  const profiles = {};
  (players || []).forEach((player) => {
    if (player && typeof player.id === "string" && player.id) profiles[player.id] = scoutProfileFor(player, events);
  });
  return profiles;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value ?? null);
}

// Was muss geschrieben/geloescht werden, damit scoutProfiles dem Soll-Stand entspricht?
function scoutProfileWrites(expected, existing) {
  const set = Object.entries(expected).filter(([id, profile]) => !existing?.[id] || stableJson(existing[id]) !== stableJson(profile));
  const remove = Object.keys(existing || {}).filter((id) => !expected[id]);
  return { set, remove };
}

// Scout-Seite: baut aus den bereinigten Profilen Spieler und Bewertungen je Event. Bewusst ohne Status,
// Verletzung, Einwilligung und Notiz - diese Felder gibt es im Scout-Zustand gar nicht.
function scoutStateFromProfiles(profiles) {
  const players = [];
  const ratingsByEvent = {};
  Object.entries(profiles || {}).forEach(([id, profile]) => {
    players.push({ id, name: profile.name || "", number: profile.number ?? "", positions: Array.isArray(profile.positions) ? profile.positions : [], birthdate: profile.birthdate || "", status: "" });
    Object.entries(profile.ratings || {}).forEach(([eventId, rating]) => {
      ratingsByEvent[eventId] ||= {};
      ratingsByEvent[eventId][id] = scoutRating(rating);
    });
  });
  return { players, ratingsByEvent };
}
// SCOUT-PROJECTION END

// Trainer-Seite: gleicht scoutProfiles mit dem Cloud-Stand ab (neu, geaendert, geloescht). Laeuft erst,
// wenn Spieler, alle Bewertungen und die bestehenden Scout-Profile geladen sind - sonst wuerde ein
// halb geladener Stand kurz unvollstaendige Profile schreiben. Bestehende Daten werden so beim ersten
// Oeffnen der Trainer-App nach dem Update automatisch nachgezogen.
let scoutSyncTimer = null;
let scoutSyncRunning = false;

function scheduleScoutProfileSync() {
  if (!isCloudTrainer()) return;
  clearTimeout(scoutSyncTimer);
  scoutSyncTimer = setTimeout(syncScoutProfiles, 1500);
}

function scoutSyncReady() {
  return cloudCache.playersLoaded && cloudCache.eventsLoaded && cloudCache.scoutProfiles !== null
    && cloudCache.events.every((event) => cloudCache.ratings[event.id] !== undefined);
}

async function syncScoutProfiles() {
  if (!isCloudTrainer() || legacyBlobMode || !scoutSyncReady()) return;
  if (scoutSyncRunning) { scheduleScoutProfileSync(); return; }
  scoutSyncRunning = true;
  try {
    const events = cloudCache.events.map((event) => ({ id: event.id, ratings: cloudCache.ratings[event.id] || {} }));
    const players = cloudCache.players.map(normalizePlayer);
    const { set, remove } = scoutProfileWrites(buildScoutProfiles(players, events), cloudCache.scoutProfiles);
    const writes = [
      ...set.map(([id, profile]) => (batch) => batch.set(teamDoc("scoutProfiles", id), profile)),
      ...remove.map((id) => (batch) => batch.delete(teamDoc("scoutProfiles", id)))
    ];
    for (let offset = 0; offset < writes.length; offset += 450) {
      const batch = firestoreModule.writeBatch(firestoreDb);
      writes.slice(offset, offset + 450).forEach((write) => write(batch));
      await batch.commit();
    }
  } catch (error) {
    console.warn("Scout-Ansicht konnte nicht abgeglichen werden", error);
  } finally {
    scoutSyncRunning = false;
  }
}

function startCloudSync() {
  clearTimeout(scoutSyncTimer);
  cloudCache.scoutProfiles = null;
  cloudCache.playersLoaded = false;
  cloudCache.eventsLoaded = false;
  cloudCache.players = [];
  cloudCache.events = [];
  cloudCache.ratings = {};
  cloudCache.privateNotes = {};
  cloudCache.developmentPlans = {};
  cloudCache.absences = {};
  cloudCache.measurements = {};
  cloudCache.opponents = [];
  cloudCache.lineup = null;

  // Event-Metadaten (Titel/Datum/Ergebnis, keine Noten) sind fuer alle Teammitglieder lesbar.
  cloudUnsubscribers.push(firestoreModule.onSnapshot(teamCollection("events"), (snapshot) => {
    cloudCache.events = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    cloudCache.eventsLoaded = true;
    const eventIds = cloudCache.events.map((event) => event.id);
    if (currentRole === "trainer") {
      syncRatingListeners(eventIds);
      syncPrivateNoteListeners(eventIds);
    }
    else if (["player", "parent"].includes(currentRole) && currentPlayerId) syncPlayerRatingListeners(eventIds);
    rebuildStateFromCloudCache();
    cloudListenerRecovered("events");
  }, (error) => cloudListenerFailed("events", error)));

  if (currentRole === "trainer") {
    cloudUnsubscribers.push(firestoreModule.onSnapshot(teamCollection("players"), (snapshot) => {
      cloudCache.players = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      cloudCache.playersLoaded = true;
      syncPlanListeners(cloudCache.players.map((player) => player.id));
      syncAbsenceListeners(cloudCache.players.map((player) => player.id));
      syncMeasurementListeners(cloudCache.players.map((player) => player.id));
      rebuildStateFromCloudCache();
      cloudListenerRecovered("players");
    }, (error) => cloudListenerFailed("players", error)));

    // Bestehende Scout-Profile, damit syncScoutProfiles nur Abweichungen schreibt (SCRUM-170).
    cloudUnsubscribers.push(firestoreModule.onSnapshot(teamCollection("scoutProfiles"), (snapshot) => {
      cloudCache.scoutProfiles = Object.fromEntries(snapshot.docs.map((docSnap) => [docSnap.id, docSnap.data()]));
      scheduleScoutProfileSync();
    }, (error) => {
      // Hintergrund-Abgleich: ein Fehler (z. B. Regeln noch nicht ausgerollt) darf die Trainer-Ansicht nicht als
      // "Verbindung unterbrochen" markieren. Ohne gelesenen Stand wird dann einfach nichts abgeglichen.
      console.warn("Scout-Ansicht konnte nicht gelesen werden", error);
      cloudCache.scoutProfiles = null;
    }));

    cloudUnsubscribers.push(firestoreModule.onSnapshot(teamCollection("opponents"), (snapshot) => {
      cloudCache.opponents = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      rebuildStateFromCloudCache();
      cloudListenerRecovered("opponents");
    }, (error) => cloudListenerFailed("opponents", error)));

    // Startelf/Taktikboard ist wie das gesamte Dashboard nur fuer Trainer sichtbar
    // (siehe applyRoleRestrictions) - deshalb genuegt ein einzelnes Dokument statt
    // einer Unter-Collection pro Spieler/Event.
    cloudUnsubscribers.push(firestoreModule.onSnapshot(teamDoc("meta", "lineup"), (docSnap) => {
      cloudCache.lineup = docSnap.exists() ? docSnap.data() : null;
      rebuildStateFromCloudCache();
      cloudListenerRecovered("lineup");
    }, (error) => cloudListenerFailed("lineup", error)));
  } else if (["player", "parent"].includes(currentRole) && currentPlayerId) {
    // Ein Spieler darf nie die ganze players-Collection auflisten (Firestore-Regeln
    // erlauben Listenabfragen nur, wenn sie fuer JEDES moegliche Ergebnis gelten -
    // deshalb gezielter Get auf das eigene Dokument statt einer Collection-Abfrage).
    cloudUnsubscribers.push(firestoreModule.onSnapshot(teamDoc("players", currentPlayerId), (docSnap) => {
      cloudCache.players = docSnap.exists() ? [{ id: docSnap.id, ...docSnap.data() }] : [];
      rebuildStateFromCloudCache();
      cloudListenerRecovered("player");
    }, (error) => cloudListenerFailed("player", error)));

    cloudUnsubscribers.push(firestoreModule.onSnapshot(teamCollection("players", currentPlayerId, "developmentPlans"), (snapshot) => {
      cloudCache.developmentPlans = { [currentPlayerId]: snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) };
      rebuildStateFromCloudCache();
      cloudListenerRecovered("developmentPlans");
    }, (error) => cloudListenerFailed("developmentPlans", error)));

    cloudUnsubscribers.push(firestoreModule.onSnapshot(teamCollection("players", currentPlayerId, "absences"), (snapshot) => {
      cloudCache.absences = { [currentPlayerId]: snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) };
      rebuildStateFromCloudCache();
      cloudListenerRecovered("absences");
    }, (error) => cloudListenerFailed("absences", error)));

    cloudUnsubscribers.push(firestoreModule.onSnapshot(teamCollection("players", currentPlayerId, "measurements"), (snapshot) => {
      cloudCache.measurements = { [currentPlayerId]: snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) };
      rebuildStateFromCloudCache();
      cloudListenerRecovered("measurements");
    }, (error) => cloudListenerFailed("measurements", error)));
  } else if (currentRole === "medical") {
    cloudUnsubscribers.push(firestoreModule.onSnapshot(teamCollection("players"), (snapshot) => {
      cloudCache.players = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      syncAbsenceListeners(cloudCache.players.map((player) => player.id));
      syncMeasurementListeners(cloudCache.players.map((player) => player.id));
      rebuildStateFromCloudCache();
      cloudListenerRecovered("medical players");
    }, (error) => cloudListenerFailed("medical players", error)));
  } else if (currentRole === "scout") {
    // Scout (SCRUM-170): ausschliesslich die bereinigte Ansicht - keine players-, ratings-, absences-
    // oder measurements-Abfragen (Firestore wuerde sie ohnehin ablehnen).
    cloudUnsubscribers.push(firestoreModule.onSnapshot(teamCollection("scoutProfiles"), (snapshot) => {
      const scoutState = scoutStateFromProfiles(Object.fromEntries(snapshot.docs.map((docSnap) => [docSnap.id, docSnap.data()])));
      cloudCache.players = scoutState.players;
      cloudCache.ratings = scoutState.ratingsByEvent;
      rebuildStateFromCloudCache();
      cloudListenerRecovered("scout profiles");
    }, (error) => cloudListenerFailed("scout profiles", error)));
  }
}

// ratings/developmentPlans liegen als Unter-Collections unter jeweils einem Event bzw.
// Spieler (teams/{teamId}/events/{eventId}/ratings, teams/{teamId}/players/{playerId}/
// developmentPlans). Frueher wurden sie ueber eine teamuebergreifende collectionGroup-
// Abfrage gelesen - das schlug fehl, sobald es (wie seit der U17-Site) mehr als ein Team
// in derselben Firebase-Instanz gibt: Firestore laesst eine Listenabfrage nur zu, wenn
// die Regel fuer JEDES moegliche Ergebnis zutrifft, und "ratings/developmentPlans
// irgendeines Teams" schliesst zwangslaeufig Dokumente ein, die dieser Nutzer nicht lesen
// darf - die gesamte Abfrage wurde deshalb mit "permission-denied" abgelehnt, ohne dass
// das im UI sichtbar war (nur console.error, kein alert). Ein Listener pro Event/Spieler,
// jeweils direkt unter der eigenen teamId, umgeht das Problem komplett.
function syncRatingListeners(eventIds) {
  const idSet = new Set(eventIds);
  Object.keys(ratingListeners).forEach((eventId) => {
    if (idSet.has(eventId)) return;
    ratingListeners[eventId]();
    delete ratingListeners[eventId];
    delete cloudCache.ratings[eventId];
  });
  eventIds.forEach((eventId) => {
    if (ratingListeners[eventId]) return;
    ratingListeners[eventId] = firestoreModule.onSnapshot(
      teamCollection("events", eventId, "ratings"),
      (snapshot) => {
        cloudCache.ratings[eventId] = {};
        snapshot.forEach((docSnap) => { cloudCache.ratings[eventId][docSnap.id] = docSnap.data(); });
        rebuildStateFromCloudCache();
        cloudListenerRecovered(`ratings:${eventId}`);
      },
      (error) => cloudListenerFailed(`ratings:${eventId}`, error)
    );
  });
}

// Interne Notizen: eigener, nur fuer Trainer lesbarer Pfad events/{id}/privateNotes/{playerId}.
// Sie duerfen nie im Bewertungs- oder Event-Dokument landen, die jedes Teammitglied bzw.
// der jeweilige Spieler lesen darf.
function syncPrivateNoteListeners(eventIds) {
  const idSet = new Set(eventIds);
  Object.keys(privateNoteListeners).forEach((eventId) => {
    if (idSet.has(eventId)) return;
    privateNoteListeners[eventId]();
    delete privateNoteListeners[eventId];
    delete cloudCache.privateNotes[eventId];
  });
  eventIds.forEach((eventId) => {
    if (privateNoteListeners[eventId]) return;
    privateNoteListeners[eventId] = firestoreModule.onSnapshot(
      teamCollection("events", eventId, "privateNotes"),
      (snapshot) => {
        cloudCache.privateNotes[eventId] = {};
        snapshot.forEach((docSnap) => { cloudCache.privateNotes[eventId][docSnap.id] = docSnap.data().note || ""; });
        rebuildStateFromCloudCache();
        cloudListenerRecovered(`private-notes:${eventId}`);
      },
      (error) => cloudListenerFailed(`private-notes:${eventId}`, error)
    );
  });
}

function syncPlayerRatingListeners(eventIds) {
  const idSet = new Set(eventIds);
  Object.keys(ratingListeners).forEach((eventId) => {
    if (idSet.has(eventId)) return;
    ratingListeners[eventId]();
    delete ratingListeners[eventId];
    delete cloudCache.ratings[eventId];
  });
  eventIds.forEach((eventId) => {
    if (ratingListeners[eventId]) return;
    ratingListeners[eventId] = firestoreModule.onSnapshot(
      teamDoc("events", eventId, "ratings", currentPlayerId),
      (docSnap) => {
        cloudCache.ratings[eventId] = docSnap.exists() ? { [currentPlayerId]: docSnap.data() } : {};
        rebuildStateFromCloudCache();
        cloudListenerRecovered(`ratings:${eventId}`);
      },
      (error) => cloudListenerFailed(`ratings:${eventId}`, error)
    );
  });
}

function syncPlanListeners(playerIds) {
  const idSet = new Set(playerIds);
  Object.keys(planListeners).forEach((playerId) => {
    if (idSet.has(playerId)) return;
    planListeners[playerId]();
    delete planListeners[playerId];
    delete cloudCache.developmentPlans[playerId];
  });
  playerIds.forEach((playerId) => {
    if (planListeners[playerId]) return;
    planListeners[playerId] = firestoreModule.onSnapshot(
      teamCollection("players", playerId, "developmentPlans"),
      (snapshot) => {
        cloudCache.developmentPlans[playerId] = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        rebuildStateFromCloudCache();
        cloudListenerRecovered(`development-plans:${playerId}`);
      },
      (error) => cloudListenerFailed(`development-plans:${playerId}`, error)
    );
  });
}

function syncAbsenceListeners(playerIds) {
  const idSet = new Set(playerIds);
  Object.keys(absenceListeners).forEach((playerId) => {
    if (idSet.has(playerId)) return;
    absenceListeners[playerId]();
    delete absenceListeners[playerId];
    delete cloudCache.absences[playerId];
  });
  playerIds.forEach((playerId) => {
    if (absenceListeners[playerId]) return;
    absenceListeners[playerId] = firestoreModule.onSnapshot(
      teamCollection("players", playerId, "absences"),
      (snapshot) => {
        cloudCache.absences[playerId] = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        rebuildStateFromCloudCache();
        cloudListenerRecovered(`absences:${playerId}`);
      },
      (error) => cloudListenerFailed(`absences:${playerId}`, error)
    );
  });
}

function syncMeasurementListeners(playerIds) {
  const idSet = new Set(playerIds);
  Object.keys(measurementListeners).forEach((playerId) => {
    if (idSet.has(playerId)) return;
    measurementListeners[playerId]();
    delete measurementListeners[playerId];
    delete cloudCache.measurements[playerId];
  });
  playerIds.forEach((playerId) => {
    if (measurementListeners[playerId]) return;
    measurementListeners[playerId] = firestoreModule.onSnapshot(
      teamCollection("players", playerId, "measurements"),
      (snapshot) => {
        cloudCache.measurements[playerId] = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        rebuildStateFromCloudCache();
        cloudListenerRecovered(`measurements:${playerId}`);
      },
      (error) => cloudListenerFailed(`measurements:${playerId}`, error)
    );
  });
}

function stopCloudSync() {
  clearTimeout(scoutSyncTimer);
  cloudUnsubscribers.forEach((unsubscribe) => unsubscribe());
  cloudUnsubscribers = [];
  Object.values(ratingListeners).forEach((unsubscribe) => unsubscribe());
  ratingListeners = {};
  Object.values(privateNoteListeners).forEach((unsubscribe) => unsubscribe());
  privateNoteListeners = {};
  Object.values(planListeners).forEach((unsubscribe) => unsubscribe());
  planListeners = {};
  Object.values(absenceListeners).forEach((unsubscribe) => unsubscribe());
  absenceListeners = {};
  Object.values(measurementListeners).forEach((unsubscribe) => unsubscribe());
  measurementListeners = {};
}

function rebuildStateFromCloudCache() {
  const events = cloudCache.events.map((event) => ({ ...event, ratings: cloudCache.ratings[event.id] || {}, privateNotes: cloudCache.privateNotes[event.id] || {} }));
  state = normalizeState({
    players: cloudCache.players,
    events,
    developmentPlans: cloudCache.developmentPlans,
    absences: cloudCache.absences,
    measurements: cloudCache.measurements,
    lineup: cloudCache.lineup,
    opponents: cloudCache.opponents,
    selectedEventId: state.selectedEventId
  });
  writeLocalCache();
  scheduleScoutProfileSync();
  // Sobald einmal echte Spieler in der neuen Struktur angekommen sind, macht die
  // Migration aus dem alten Blob-Dokument keinen Sinn mehr - im Gegenteil, sie wuerde
  // neuere Aenderungen wieder mit dem laengst veralteten alten Dokument ueberschreiben.
  // Den Button dann ausblenden schuetzt vor einem versehentlichen erneuten Klick.
  if (isCloudTrainer()) {
    $("#migrateDataBtn").hidden = state.players.length > 0;
  }
  // SCRUM-35: Beim Start feuern >160 Listener nacheinander. Statt jedes Mal alle Ansichten
  // zu rendern, werden die Snapshots gebuendelt und nur die sichtbare Ansicht gezeichnet.
  requestCloudRender();
}

// ---- Granulare Cloud-Schreibvorgaenge (greifen nur im Rollen-Modus als Trainer,
// per Security Rules serverseitig erzwungen - in jedem anderen Modus ein No-Op) ----

// Speichert/loescht diese Funktionen schlagen fehl, ohne dass die (schon lokal
// angezeigte) Aenderung tatsaechlich in der Cloud angekommen ist - ohne die alert()s
// hier wuerde das niemand bemerken, bis die Aenderung beim naechsten Laden des echten
// Cloud-Stands kommentarlos wieder verschwindet.
async function cloudSavePlayer(player) {
  if (!isCloudTrainer()) return;
  try {
    await firestoreModule.setDoc(teamDoc("players", player.id), player, { merge: true });
    cloudWriteSucceeded();
  } catch (error) {
    cloudWriteFailed(error, "Spieler konnte nicht in der Cloud gespeichert werden – die Änderung ist nur lokal sichtbar.");
  }
}

async function cloudDeletePlayer(playerId) {
  if (!isCloudTrainer()) return;
  try {
    const childSnapshots = await Promise.all(["developmentPlans", "absences", "measurements"].map((name) => firestoreModule.getDocs(teamCollection("players", playerId, name))));
    const refs = childSnapshots.flatMap((snapshot) => snapshot.docs.map((docSnap) => docSnap.ref));
    const ratingSnapshots = await Promise.all(state.events.map((event) => firestoreModule.getDoc(teamDoc("events", event.id, "ratings", playerId))));
    refs.push(...ratingSnapshots.filter((snapshot) => snapshot.exists()).map((snapshot) => snapshot.ref));
    const privateNoteSnapshots = await Promise.all(state.events.map((event) => firestoreModule.getDoc(teamDoc("events", event.id, "privateNotes", playerId))));
    refs.push(...privateNoteSnapshots.filter((snapshot) => snapshot.exists()).map((snapshot) => snapshot.ref));
    // Einladungscodes und Zugaenge (members) des Spielers: sonst bleibt ein Code gueltig bzw. ein Zugang
    // bestehen, der auf einen nicht mehr vorhandenen Spieler zeigt.
    const accessSnapshots = await Promise.all(["invites", "members"].map((name) => firestoreModule.getDocs(firestoreModule.query(teamCollection(name), firestoreModule.where("playerId", "==", playerId)))));
    refs.push(...accessSnapshots.flatMap((snapshot) => snapshot.docs.map((docSnap) => docSnap.ref)));
    refs.push(teamDoc("scoutProfiles", playerId));
    refs.push(teamDoc("players", playerId));
    await commitDeleteRefs(refs);
    cloudWriteSucceeded();
  } catch (error) {
    cloudWriteFailed(error, "Spieler konnte nicht vollständig aus der Cloud gelöscht werden.");
  }
}

async function commitDeleteRefs(refs) {
  for (let offset = 0; offset < refs.length; offset += 450) {
    const batch = firestoreModule.writeBatch(firestoreDb);
    refs.slice(offset, offset + 450).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

async function cloudSaveEvent(event) {
  if (!isCloudTrainer()) return;
  // Weder Bewertungen noch interne Notizen gehoeren ins Event-Dokument (fuer alle Teammitglieder lesbar).
  const { ratings, privateNotes, ...meta } = event;
  try {
    await firestoreModule.setDoc(teamDoc("events", event.id), meta, { merge: true });
    cloudWriteSucceeded();
  } catch (error) {
    cloudWriteFailed(error, "Event konnte nicht in der Cloud gespeichert werden – die Änderung ist nur lokal sichtbar.");
  }
}

async function cloudDeleteEvent(event) {
  if (!isCloudTrainer()) return;
  try {
    const [ratings, privateNotes] = await Promise.all([
      firestoreModule.getDocs(teamCollection("events", event.id, "ratings")),
      firestoreModule.getDocs(teamCollection("events", event.id, "privateNotes"))
    ]);
    await commitDeleteRefs([...ratings.docs.map((docSnap) => docSnap.ref), ...privateNotes.docs.map((docSnap) => docSnap.ref), teamDoc("events", event.id)]);
    cloudWriteSucceeded();
  } catch (error) {
    cloudWriteFailed(error, "Event konnte nicht vollständig aus der Cloud gelöscht werden.");
  }
}

async function cloudSaveRating(eventId, playerId, rating) {
  if (!isCloudTrainer()) return;
  try {
    await firestoreModule.setDoc(teamDoc("events", eventId, "ratings", playerId), { ...rating, playerId }, { merge: true });
    cloudWriteSucceeded();
  } catch (error) {
    cloudWriteFailed(error, "Bewertung konnte nicht in der Cloud gespeichert werden – die Änderung ist nur lokal sichtbar.");
  }
}

async function cloudSavePrivateNote(eventId, playerId, note) {
  if (!isCloudTrainer()) return;
  try {
    await firestoreModule.setDoc(teamDoc("events", eventId, "privateNotes", playerId), { playerId, note }, { merge: true });
    cloudWriteSucceeded();
  } catch (error) {
    cloudWriteFailed(error, "Interne Notiz konnte nicht in der Cloud gespeichert werden – die Änderung ist nur lokal sichtbar.");
  }
}

// Gemeinsamer Rahmen fuer alle Cloud-Schreibvorgaenge: setzt die Sync-Anzeige nach
// Erfolg ("Cloud synchronisiert") bzw. Fehler ("Speichern fehlgeschlagen") zurueck.
async function cloudWrite(errorLabel, write) {
  if (!isCloudTrainer()) return;
  try {
    await write();
    cloudWriteSucceeded();
  } catch (error) {
    cloudWriteFailed(error, errorLabel);
  }
}

function cloudSaveDevelopmentPlan(playerId, plan) {
  return cloudWrite("Foerderplan konnte nicht in der Cloud gespeichert werden - die Aenderung geht sonst verloren.",
    () => firestoreModule.setDoc(teamDoc("players", playerId, "developmentPlans", plan.id), { ...plan, playerId }));
}

function cloudDeleteDevelopmentPlan(playerId, planId) {
  return cloudWrite("Foerderplan konnte nicht aus der Cloud geloescht werden.",
    () => firestoreModule.deleteDoc(teamDoc("players", playerId, "developmentPlans", planId)));
}

function cloudSaveAbsence(playerId, absence) {
  return cloudWrite("Abwesenheit konnte nicht in der Cloud gespeichert werden - die Aenderung geht sonst verloren.",
    () => firestoreModule.setDoc(teamDoc("players", playerId, "absences", absence.id), { ...absence, playerId }));
}

function cloudDeleteAbsence(playerId, absenceId) {
  return cloudWrite("Abwesenheit konnte nicht aus der Cloud geloescht werden.",
    () => firestoreModule.deleteDoc(teamDoc("players", playerId, "absences", absenceId)));
}

function cloudSaveMeasurement(playerId, measurement) {
  return cloudWrite("Messung konnte nicht in der Cloud gespeichert werden - die Aenderung geht sonst verloren.",
    () => firestoreModule.setDoc(teamDoc("players", playerId, "measurements", measurement.id), { ...measurement, playerId }));
}

function cloudDeleteMeasurement(playerId, measurementId) {
  return cloudWrite("Messung konnte nicht aus der Cloud geloescht werden.",
    () => firestoreModule.deleteDoc(teamDoc("players", playerId, "measurements", measurementId)));
}

// merge:true, damit die je Spiel gespeicherten Aufstellungen (Feld byEvent im selben
// Dokument, SCRUM-29) nicht von der allgemeinen Startelf ueberschrieben werden.
function cloudSaveLineup(lineup) {
  return cloudWrite("Aufstellung konnte nicht in der Cloud gespeichert werden - die Aenderung geht sonst verloren.",
    () => firestoreModule.setDoc(teamDoc("meta", "lineup"), { assignments: lineup.assignments }, { merge: true }));
}

function cloudSaveEventLineup(eventId, entry) {
  return cloudWrite("Aufstellung konnte nicht in der Cloud gespeichert werden - die Aenderung geht sonst verloren.",
    () => firestoreModule.setDoc(teamDoc("meta", "lineup"), { byEvent: { [eventId]: entry } }, { merge: true }));
}

function cloudDeleteEventLineup(eventId) {
  return cloudWrite("Aufstellung des Spiels konnte nicht aus der Cloud geloescht werden.",
    () => firestoreModule.updateDoc(teamDoc("meta", "lineup"), { [`byEvent.${eventId}`]: firestoreModule.deleteField() }));
}

function cloudSaveOpponent(opponent) {
  return cloudWrite("Gegner konnte nicht in der Cloud gespeichert werden - die Aenderung geht sonst verloren.",
    () => firestoreModule.setDoc(teamDoc("opponents", opponent.id), opponent));
}

function cloudDeleteOpponent(opponentId) {
  return cloudWrite("Gegner konnte nicht aus der Cloud geloescht werden.",
    () => firestoreModule.deleteDoc(teamDoc("opponents", opponentId)));
}

// ---- Auth-Gate (Login), Einladungscodes ----
// Trainer-Konten entstehen absichtlich NICHT ueber die App, sondern ausschliesslich
// manuell in der Firebase-Konsole (siehe FIREBASE_SETUP.md) - hier gibt es deshalb
// bewusst keine Selbstregistrierung, nur einen Login.

function showAuthGate() {
  const gate = $("#authGate");
  if (!gate) return;
  gate.hidden = false;
  gate.classList.remove("is-loading", "is-failed");
  document.body.classList.add("auth-locked");
  $("#authGateError").textContent = "";
}

// Sperrzustand direkt beim Start (vor dem ersten Rendern): Maske ohne Formulare,
// bis Firebase die Anmeldung geklaert hat.
function showAuthGateLoading() {
  const gate = $("#authGate");
  if (!gate) return;
  gate.hidden = false;
  gate.classList.add("is-loading");
  gate.classList.remove("is-failed");
  document.body.classList.add("auth-locked");
  $("#authGateError").textContent = "";
}

// Firebase/Anmeldung nicht verfuegbar: Maske bleibt zu, nur die Fehlermeldung ist sichtbar.
function showAuthGateError(message) {
  const gate = $("#authGate");
  if (!gate) return;
  gate.hidden = false;
  gate.classList.remove("is-loading");
  gate.classList.add("is-failed");
  document.body.classList.add("auth-locked");
  $("#authGateError").textContent = message;
}

function hideAuthGate() {
  const gate = $("#authGate");
  if (!gate) return;
  gate.hidden = true;
  document.body.classList.remove("auth-locked");
}

function applyRoleRestrictions() {
  document.body.classList.toggle("role-player", currentRole === "player");
  document.body.classList.toggle("role-parent", currentRole === "parent");
  document.body.classList.toggle("role-medical", currentRole === "medical");
  document.body.classList.toggle("role-scout", currentRole === "scout");
  // Scouts suchen/sortieren nicht nach Status oder Belastung (SCRUM-170).
  $("#searchInput").placeholder = currentRole === "scout" ? "Name, Position" : "Name, Position, Status";
  if (currentRole === "scout" && ["status", "risk"].includes($("#squadSort").value)) $("#squadSort").value = "number";
  document.body.classList.toggle("role-trainer-cloud", isCloudTrainer());
  $("#signOutBtn").hidden = !isCloudActive();
  $("#migrateDataBtn").hidden = !isCloudTrainer();
  $("#importBtn").hidden = !canManageRecords() || (isCloudActive() && !legacyBlobMode && !isCloudTrainer());
  $("#addTrainerBtn").hidden = !isCloudTrainer();
  $("#addMedicalBtn").hidden = !isCloudTrainer();
  $("#addScoutBtn").hidden = !isCloudTrainer();
  $("#changePasswordBtn").hidden = !(isCloudActive() && ["trainer", "medical", "scout"].includes(currentRole));
  if (["player", "parent"].includes(currentRole)) {
    $("#mobileViewSelect").innerHTML = '<option value="profiles">Profile</option>';
    $("#profilePlayer").disabled = true;
    setView("profiles");
  } else if (["medical", "scout"].includes(currentRole)) {
    $("#mobileViewSelect").innerHTML = '<option value="squad">Kader</option><option value="profiles">Profile</option>';
    $("#profilePlayer").disabled = false;
    setView("squad");
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

// "Passwort vergessen?" im Login: schickt die Mail zum Zuruecksetzen. Ob zur Adresse ein Konto existiert,
// wird nicht verraten (SCRUM-31).
async function handlePasswordReset() {
  const error = $("#authGateError");
  const email = $("#trainerLoginEmail").value.trim();
  error.textContent = "";
  $("#authGateStatus").textContent = "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    error.textContent = "Bitte oben die E-Mail-Adresse deines Kontos eintragen und dann erneut auf „Passwort vergessen?“ tippen.";
    return;
  }
  try {
    await authModule.sendPasswordResetEmail(authInstance, email);
  } catch (resetError) {
    if (!(resetError?.code || "").includes("user-not-found")) {
      error.textContent = authErrorMessage(resetError);
      return;
    }
  }
  $("#authGateStatus").textContent = "Wenn zu dieser E-Mail-Adresse ein Konto existiert, ist eine Nachricht mit einem Link zum Zurücksetzen unterwegs. Bitte auch den Spam-Ordner prüfen.";
}

// Passwort aendern (Trainer/Medizin): das aktuelle Passwort wird erneut bestaetigt (SCRUM-31).
function openPasswordDialog() {
  const form = $("#passwordForm");
  form.reset();
  $("#passwordError").textContent = "";
  $("#passwordDialog").showModal();
}

async function handlePasswordChange(event) {
  event.preventDefault();
  const error = $("#passwordError");
  const current = $("#passwordCurrent").value;
  const next = $("#passwordNew").value;
  error.textContent = "";
  if (!current) { error.textContent = "Bitte das aktuelle Passwort eingeben."; return; }
  const problem = staffPasswordProblem(next);
  if (problem) { error.textContent = problem; return; }
  if (next !== $("#passwordRepeat").value) { error.textContent = "Die beiden neuen Passwörter stimmen nicht überein."; return; }
  if (next === current) { error.textContent = "Das neue Passwort muss sich vom aktuellen unterscheiden."; return; }
  const button = $("#passwordSubmitBtn");
  button.disabled = true;
  try {
    const user = authInstance.currentUser;
    if (!user?.email) throw { code: "auth/requires-recent-login" };
    await authModule.reauthenticateWithCredential(user, authModule.EmailAuthProvider.credential(user.email, current));
    await authModule.updatePassword(user, next);
    $("#passwordForm").reset();
    $("#passwordDialog").close();
    alert("Das Passwort wurde geändert.");
  } catch (changeError) {
    const code = changeError?.code || "";
    error.textContent = code.includes("wrong-password") || code.includes("invalid-credential")
      ? "Das aktuelle Passwort ist falsch."
      : code.includes("requires-recent-login") ? "Bitte melde dich neu an und versuche es dann erneut." : authErrorMessage(changeError);
  } finally {
    button.disabled = false;
  }
}

async function handlePlayerLogin(event) {
  event.preventDefault();
  // Schutz gegen Doppel-Absenden (z.B. Doppel-Tap auf dem Handy): ein zweiter,
  // fast gleichzeitiger Versuch wuerde sonst auf ein vom ersten Versuch bereits
  // angelegtes Dokument treffen und als verbotenes "update" abgelehnt werden.
  if (playerLoginInFlight) return;
  playerLoginInFlight = true;
  const submitButton = event.target.querySelector("button[type='submit']");
  if (submitButton) submitButton.disabled = true;

  try {
    const code = $("#playerLoginCode").value.trim();
    $("#authGateError").textContent = "";

    let credential;
    try {
      // Erst anmelden (anonym), dann den Code pruefen: solange niemand angemeldet ist,
      // duerfen Firestore-Regeln den Code gar nicht lesen lassen (siehe firestore.rules).
      credential = await authModule.signInAnonymously(authInstance);
      // Erzwingt, dass ein frischer Auth-Token vorliegt, bevor irgendein Firestore-Aufruf
      // folgt - direkt nach signInAnonymously() kann es sonst kurzzeitig zu
      // permission-denied kommen, weil der neue Token noch nicht ueberall angekommen ist.
      await credential.user.getIdToken(true);
    } catch (error) {
      $("#authGateError").textContent = authErrorMessage(error);
      return;
    }

    let invite;
    try {
      const inviteSnap = await firestoreModule.getDoc(teamDoc("invites", code));
      if (!inviteSnap.exists()) {
        $("#authGateError").textContent = "Dieser Code ist ungueltig.";
        await authModule.signOut(authInstance);
        return;
      }
      invite = inviteSnap.data();
    } catch (error) {
      $("#authGateError").textContent = `Code konnte nicht geprueft werden (Schritt 1: Code lesen).${cloudErrorSuffix(error)}`;
      await authModule.signOut(authInstance);
      return;
    }

    const expiresAtDate = invite.expiresAt?.toDate ? invite.expiresAt.toDate() : null;
    if (expiresAtDate && expiresAtDate < new Date()) {
      $("#authGateError").textContent = "Dieser Code ist abgelaufen.";
      await authModule.signOut(authInstance);
      return;
    }

    const memberPayload = {
      role: invite.role || "player",
      playerId: invite.playerId,
      claimedInviteCode: code,
      expiresAt: invite.expiresAt ?? null,
      createdAt: firestoreModule.serverTimestamp()
    };
    const memberRef = teamDoc("members", credential.user.uid);
    const inviteRef = teamDoc("invites", code);
    // Mitgliedschaft und Token-Verbrauch werden atomar geschrieben. Ein Token kann
    // dadurch weder wiederverwendet noch nach erfolgreicher Anmeldung weitergegeben werden.
    try {
      const batch = firestoreModule.writeBatch(firestoreDb);
      batch.set(memberRef, memberPayload);
      batch.delete(inviteRef);
      await batch.commit();
    } catch (firstError) {
      if (!(firstError.code || "").includes("permission-denied")) {
        console.error(firstError);
        $("#authGateError").textContent = `Zugang konnte nicht angelegt werden (Schritt 2: Zugang anlegen).${cloudErrorSuffix(firstError)}`;
        return;
      }
      // Direkt nach dem Login kommt es manchmal kurzzeitig zu permission-denied, weil der
      // frische Auth-Token noch nicht ueberall angekommen ist - ein Wiederholungsversuch
      // nach kurzer Wartezeit behebt das meistens von selbst.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      try {
        const retryBatch = firestoreModule.writeBatch(firestoreDb);
        retryBatch.set(memberRef, memberPayload);
        retryBatch.delete(inviteRef);
        await retryBatch.commit();
      } catch (secondError) {
        console.error(secondError);
        if ((secondError.code || "").includes("permission-denied")) {
          $("#authGateError").textContent = "Zugang wird abgeschlossen, einen Moment...";
          setTimeout(() => window.location.reload(), 1200);
          return;
        }
        $("#authGateError").textContent = `Zugang konnte nicht angelegt werden (Schritt 2: Zugang anlegen).${cloudErrorSuffix(secondError)}`;
      }
    }
  } finally {
    playerLoginInFlight = false;
    if (submitButton) submitButton.disabled = false;
  }
}

function authErrorMessage(error) {
  const code = error?.code || "";
  if (code.includes("email-already-in-use")) return "Diese E-Mail wird bereits verwendet.";
  if (code.includes("wrong-password") || code.includes("invalid-credential")) return "E-Mail oder Passwort ist falsch.";
  if (code.includes("user-not-found")) return "Kein Trainer-Konto mit dieser E-Mail gefunden.";
  if (code.includes("weak-password")) return "Das Passwort muss mindestens 12 Zeichen haben.";
  if (code.includes("operation-not-allowed")) return "Diese Anmeldemethode ist in der Firebase-Konsole noch nicht aktiviert.";
  if (code.includes("permission-denied") || code.includes("insufficient-permissions")) {
    return "Zugriff von den Firestore-Regeln verweigert (permission-denied). Pruefe, ob firestore.rules wirklich veroeffentlicht wurde.";
  }
  console.error(error);
  return `Etwas ist schiefgelaufen${code ? ` (Code: ${code})` : ""}. Bitte erneut versuchen.`;
}

async function handleSignOut() {
  if (!authInstance) return;
  // Spieler/Eltern haben nur eine anonyme Anmeldung mit Einmal-Code: ohne neuen Code vom Trainer kommen sie nicht wieder hinein (SCRUM-32).
  if (["player", "parent"].includes(currentRole) &&
    !confirm("Wirklich abmelden? Danach kommst du nur mit einem neuen Einladungscode von deinem Trainer wieder hinein. Der bisherige Code ist verbraucht.")) return;
  await authModule.signOut(authInstance);
  clearLocalTeamData();
  // Neu laden setzt auch Rollen-Oberflaeche und Zwischenzustaende der vorigen Sitzung zurueck.
  location.reload();
}

// Erspart das bisher fehleranfaellige manuelle Anlegen in der Firebase-Konsole
// (Auth-User anlegen, UID kopieren, passendes members/{uid}-Dokument von Hand nachbauen -
// jede Abweichung, z.B. ein vertipptes Zeichen in der UID, fuehrte bisher zu einem
// stillen Fehlschlag beim Login). Legt beides in einem Zug an.
async function createTrainerAccount() {
  return createStaffAccount("trainer");
}

// Medizin-Zugang (Physio o. ae.): Status, Abwesenheiten, Verletzungen, Messwerte. healthAccess: true
// unterscheidet ihn von vor SCRUM-170 angelegten "medical"-Konten, die seitdem Scouts sind.
async function createMedicalAccount() {
  return createStaffAccount("medical");
}

// Scout-Zugang: Kompetenzprofil, Notenverlauf, Statistik - keine Gesundheitsdaten (SCRUM-170).
async function createScoutAccount() {
  return createStaffAccount("scout");
}

const STAFF_ACCOUNT_LABELS = { trainer: "Trainer-Konto", medical: "Medizin-Zugang", scout: "Scout-Zugang" };

const MIN_STAFF_PASSWORD_LENGTH = 12;

// Passwortrichtlinie fuer neue Trainer-/Medizin-Konten (SCRUM-58). Liefert die Meldung oder "".
function staffPasswordProblem(password) {
  if (password.length < MIN_STAFF_PASSWORD_LENGTH) return "Das Passwort muss mindestens 12 Zeichen haben.";
  if (password.length > 128) return "Das Passwort darf höchstens 128 Zeichen haben.";
  if (!/[a-zäöüß]/.test(password) || !/[A-ZÄÖÜ]/.test(password) || !/\d/.test(password)) {
    return "Das Passwort braucht Groß- und Kleinbuchstaben und mindestens eine Ziffer.";
  }
  return "";
}

// Eingabe der Zugangsdaten im Dialog statt per prompt(): das Passwort steht in einem verdeckten Feld (SCRUM-58).
function askStaffCredentials(label) {
  const dialog = $("#staffDialog");
  const form = $("#staffForm");
  const error = $("#staffError");
  $("#staffDialogTitle").textContent = `${label} anlegen`;
  form.reset();
  error.textContent = "";
  return new Promise((resolve) => {
    const finish = (value) => {
      form.removeEventListener("submit", submit);
      dialog.removeEventListener("close", cancel);
      $("#closeStaffDialogBtn").removeEventListener("click", close);
      $("#cancelStaffDialogBtn").removeEventListener("click", close);
      form.reset();
      if (dialog.open) dialog.close();
      resolve(value);
    };
    const submit = (event) => {
      event.preventDefault();
      const email = $("#staffEmail").value.trim();
      const password = $("#staffPassword").value;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { error.textContent = "Bitte eine gültige E-Mail-Adresse eingeben."; return; }
      const problem = staffPasswordProblem(password);
      if (problem) { error.textContent = problem; return; }
      if (password !== $("#staffPasswordRepeat").value) { error.textContent = "Die beiden Passwörter stimmen nicht überein."; return; }
      finish({ email, password });
    };
    const close = () => finish(null);
    const cancel = () => finish(null);
    form.addEventListener("submit", submit);
    dialog.addEventListener("close", cancel);
    $("#closeStaffDialogBtn").addEventListener("click", close);
    $("#cancelStaffDialogBtn").addEventListener("click", close);
    dialog.showModal();
  });
}

async function createStaffAccount(role) {
  if (!isCloudTrainer()) return;
  const label = STAFF_ACCOUNT_LABELS[role] || "Trainer-Konto";
  const credentials = await askStaffCredentials(label);
  if (!credentials) return;
  const trimmedEmail = credentials.email;
  const password = credentials.password;

  const config = window.TEAMKOMPASS_CONFIG || {};
  const appModule = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js");
  // Eine zweite, temporaere Firebase-App-Instanz ist noetig: createUserWithEmailAndPassword()
  // meldet auf der normalen Auth-Instanz sonst die eigene, gerade aktive Trainer-Sitzung ab
  // und stattdessen als das neu angelegte Konto an. Mit einer eigenen Instanz bleibt die
  // eigene Sitzung unberuehrt, waehrend das neue Konto trotzdem entsteht.
  const secondaryApp = appModule.initializeApp(config.firebase, `staff-create-${Date.now()}`);
  try {
    const secondaryAuth = authModule.getAuth(secondaryApp);
    const credential = await authModule.createUserWithEmailAndPassword(secondaryAuth, trimmedEmail, password);
    const newUid = credential.user.uid;
    // Die eigentliche Trainer-Sitzung (authInstance/firestoreDb) ist von der zweiten
    // App-Instanz unberuehrt, dieser Schreibvorgang laeuft also weiterhin unter der
    // eigenen, bereits als Trainer erkannten Identitaet - siehe firestore.rules.
    await firestoreModule.setDoc(teamDoc("members", newUid), {
      role,
      ...(role === "medical" ? { healthAccess: true } : {}),
      email: trimmedEmail,
      createdAt: firestoreModule.serverTimestamp()
    });
    renderAccessManager();
    alert(`${label} für ${trimmedEmail} wurde angelegt.`);
  } catch (error) {
    console.error(error);
    alert(`${label} konnte nicht angelegt werden. ${authErrorMessage(error)}`);
  } finally {
    await appModule.deleteApp(secondaryApp).catch(() => {});
  }
}

// Einladungs-Link: ?invite=<Code> fuellt beim Oeffnen das Code-Feld der Anmeldung vor (SCRUM-30).
function inviteLinkFor(code) {
  return `${location.origin}${location.pathname}?invite=${encodeURIComponent(code)}`;
}

// Fuellt das Code-Feld aus ?invite=... vor und entfernt den Code danach aus der Adressleiste
// (er soll nicht im Verlauf oder in Screenshots der Adresszeile stehenbleiben). Angemeldet wird erst per Knopfdruck.
function prefillInviteFromUrl() {
  try {
    const url = new URL(location.href);
    const code = (url.searchParams.get("invite") || "").trim();
    if (!code) return;
    const field = $("#playerLoginCode");
    if (field && /^[0-9a-f]{32,64}$/i.test(code)) field.value = code.toLowerCase();
    url.searchParams.delete("invite");
    history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  } catch (error) {
    console.error(error);
  }
}

// Kopiert Text in die Zwischenablage; auf Handys ohne Clipboard-API (oder ohne HTTPS) ueber das markierte Feld.
async function copyToClipboard(text, fallbackField) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (error) {
    console.error(error);
  }
  if (!fallbackField) return false;
  try {
    fallbackField.focus();
    fallbackField.select();
    fallbackField.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } catch (error) {
    console.error(error);
    return false;
  }
}

// Gueltigkeit eines Zugangs bzw. einer Einladung als Text (Datum oder null = unbegrenzt).
function accessValidityText(expiresAtDate, now = new Date()) {
  if (!expiresAtDate) return "Unbegrenzt gueltig";
  return expiresAtDate < now
    ? `Abgelaufen seit ${formatDate(localIsoDate(expiresAtDate))}`
    : `Gueltig bis ${formatDate(localIsoDate(expiresAtDate))}`;
}

function formatInviteRole(role) {
  return role === "parent" ? "Eltern" : "Spieler";
}

// Eingabe von Zugangstyp und Befristung im Dialog statt per prompt() (SCRUM-30).
function askInviteOptions(playerName) {
  const dialog = $("#inviteCreateDialog");
  const form = $("#inviteCreateForm");
  const error = $("#inviteCreateError");
  $("#inviteCreateTitle").textContent = `Einladung für ${playerName || "Spieler"}`;
  form.reset();
  error.textContent = "";
  return new Promise((resolve) => {
    const finish = (value) => {
      form.removeEventListener("submit", submit);
      dialog.removeEventListener("close", close);
      $("#closeInviteCreateBtn").removeEventListener("click", close);
      $("#cancelInviteCreateBtn").removeEventListener("click", close);
      if (dialog.open) dialog.close();
      resolve(value);
    };
    const submit = (event) => {
      event.preventDefault();
      const role = $("#inviteCreateRole").value === "parent" ? "parent" : "player";
      const daysText = $("#inviteCreateDays").value.trim();
      const days = Number(daysText);
      if (daysText !== "" && (!Number.isInteger(days) || days < 1 || days > 365)) {
        error.textContent = "Bitte eine ganze Zahl von 1 bis 365 Tagen eingeben oder das Feld leer lassen.";
        return;
      }
      finish({ role, days: daysText === "" ? null : days });
    };
    const close = () => finish(null);
    form.addEventListener("submit", submit);
    dialog.addEventListener("close", close);
    $("#closeInviteCreateBtn").addEventListener("click", close);
    $("#cancelInviteCreateBtn").addEventListener("click", close);
    dialog.showModal();
  });
}

// Zeigt einen Einladungscode im Dialog: Kopieren, Link teilen, QR-Code (SCRUM-30). Ersetzt das fruehere alert().
function showInviteShare({ code, playerName, role, expiresAtDate }) {
  const link = inviteLinkFor(code);
  $("#inviteShareInfo").textContent = `Einmaliger ${formatInviteRole(role)}-Zugang für ${playerName || "Spieler"}. ${accessValidityText(expiresAtDate)}. Der Code wird bei der ersten erfolgreichen Anmeldung ungültig. Behandle ihn bis dahin wie ein Passwort.`;
  $("#inviteShareCode").value = code;
  $("#inviteShareLink").value = link;
  $("#inviteShareStatus").textContent = "";
  $("#inviteNativeShareBtn").hidden = typeof navigator.share !== "function";
  const qr = $("#inviteShareQr");
  try {
    qr.innerHTML = window.TeamKompassQr.toSvg(link, "QR-Code mit dem Einladungs-Link");
  } catch (error) {
    console.error(error);
    qr.textContent = "Der QR-Code konnte nicht erzeugt werden. Code oder Link funktionieren trotzdem.";
  }
  const dialog = $("#inviteShareDialog");
  if (!dialog.open) dialog.showModal();
}

async function copyInviteField(fieldSelector, label) {
  const field = $(fieldSelector);
  const status = $("#inviteShareStatus");
  const ok = await copyToClipboard(field.value, field);
  status.textContent = ok ? `${label} kopiert.` : `Kopieren hat nicht geklappt. Markiere ${label.toLowerCase()} und kopiere es von Hand.`;
}

async function shareInviteNative() {
  const code = $("#inviteShareCode").value;
  try {
    await navigator.share({ title: "TeamKompass-Einladung", text: "Dein Zugang zu TeamKompass:", url: inviteLinkFor(code) });
  } catch (error) {
    if (error?.name !== "AbortError") console.error(error);
  }
}

async function createInviteCodeForPlayer(playerId) {
  if (!isCloudTrainer()) return;
  const player = state.players.find((item) => item.id === playerId);
  if (!confirmDespiteRevokedConsent([player].filter(Boolean), "Das Erzeugen des Zugangs")) return;
  const options = await askInviteOptions(player?.name);
  if (!options) return;
  const { role, days } = options;
  const expiresAtDate = days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;
  const expiresAt = expiresAtDate ? firestoreModule.Timestamp.fromDate(expiresAtDate) : null;
  const tokenBytes = crypto.getRandomValues(new Uint8Array(24));
  const code = Array.from(tokenBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  try {
    await firestoreModule.setDoc(teamDoc("invites", code), {
      playerId,
      role,
      expiresAt,
      createdAt: firestoreModule.serverTimestamp()
    });
    showInviteShare({ code, playerName: player?.name, role, expiresAtDate });
    renderAccessManager();
  } catch (error) {
    console.error(error);
    if ((error.code || "").includes("permission-denied")) {
      alert(`Einladungscode konnte nicht erstellt werden. (Code: permission-denied)\n\nDiagnose - teamId: "${currentTeamId}", eigene UID: "${currentUser?.uid}", erkannte Rolle: "${currentRole}".`);
    } else {
      alert(`Einladungscode konnte nicht erstellt werden.${cloudErrorSuffix(error)}`);
    }
  }
}

function cloudErrorSuffix(error) {
  const code = error?.code || "";
  return code ? ` (Code: ${code})` : "";
}

// Noch nicht eingeloeste Einladungen (code -> Daten), damit "Teilen" den Code ohne neuen Abruf wieder zeigen kann.
let openInvites = new Map();

async function renderAccessManager() {
  if (!isCloudTrainer()) return;
  const list = $("#accessManagerList");
  const scoutList = $("#scoutManagerList");
  const medicalList = $("#medicalManagerList");
  const trainerList = $("#trainerManagerList");
  const inviteList = $("#inviteManagerList");
  if (!list) return;
  const now = new Date();
  const setCount = (selector, count) => { const node = $(selector); if (node) node.textContent = `(${count})`; };
  try {
    const snapshot = await firestoreModule.getDocs(teamCollection("members"));
    const ownUid = currentUser?.uid || authInstance?.currentUser?.uid;
    const row = (docSnap) => {
      const data = docSnap.data();
      const player = state.players.find((item) => item.id === data.playerId);
      const expiresAtDate = data.expiresAt?.toDate ? data.expiresAt.toDate() : null;
      const isSelf = docSnap.id === ownUid;
      let title;
      let detail;
      if (data.role === "trainer") {
        title = data.email || "Trainer-Konto";
        const created = data.createdAt?.toDate ? `angelegt am ${formatDate(localIsoDate(data.createdAt.toDate()))}` : "";
        detail = ["Trainer · Vollzugriff", created, data.email ? "" : `Kennung …${docSnap.id.slice(-6)}`].filter(Boolean).join(" · ");
      } else if (effectiveMemberRole(data) === "medical") {
        title = data.email || "Medizin-Zugang";
        detail = `Medizin · nur lesen · ${accessValidityText(expiresAtDate, now)}`;
      } else if (effectiveMemberRole(data) === "scout") {
        title = data.email || "Scout-Zugang";
        detail = `Scout · nur lesen · ${accessValidityText(expiresAtDate, now)}`;
      } else {
        title = player?.name || data.playerId;
        detail = `${formatInviteRole(data.role)} · ${accessValidityText(expiresAtDate, now)}`;
      }
      const action = isSelf
        ? `<span class="access-self">Das bist du</span>`
        : `<button class="ghost-button" data-action="revoke-access" data-uid="${escapeHtml(docSnap.id)}" data-role="${escapeHtml(effectiveMemberRole(data) || "")}" type="button">Zugang sperren</button>`;
      return `
        <div class="access-row">
          <div><strong>${escapeHtml(title)}</strong><span class="muted">${escapeHtml(detail)}</span></div>
          ${action}
        </div>
      `;
    };
    // Spieler (inkl. Eltern), Scouts, Medizin und Trainer werden getrennt verwaltet (SCRUM-92, SCRUM-30, SCRUM-170).
    const playerDocs = snapshot.docs.filter((docSnap) => ["player", "parent"].includes(docSnap.data().role));
    const scoutDocs = snapshot.docs.filter((docSnap) => effectiveMemberRole(docSnap.data()) === "scout");
    const medicalDocs = snapshot.docs.filter((docSnap) => effectiveMemberRole(docSnap.data()) === "medical");
    const trainerDocs = snapshot.docs.filter((docSnap) => docSnap.data().role === "trainer");
    list.innerHTML = playerDocs.map(row).join("") || `<p class="muted">Noch keine Spieler-Zugaenge vergeben.</p>`;
    if (scoutList) scoutList.innerHTML = scoutDocs.map(row).join("") || `<p class="muted">Noch kein Scout-Zugang angelegt.</p>`;
    if (medicalList) medicalList.innerHTML = medicalDocs.map(row).join("") || `<p class="muted">Noch kein Medizin-Zugang angelegt.</p>`;
    if (trainerList) trainerList.innerHTML = trainerDocs.map(row).join("") || `<p class="muted">Keine Trainer-Konten gefunden.</p>`;
    setCount("#playerAccessCount", playerDocs.length);
    setCount("#scoutAccessCount", scoutDocs.length);
    setCount("#medicalAccessCount", medicalDocs.length);
    setCount("#trainerAccessCount", trainerDocs.length);
  } catch (error) {
    console.error(error);
  }
  if (!inviteList) return;
  try {
    const inviteSnapshot = await firestoreModule.getDocs(teamCollection("invites"));
    openInvites = new Map(inviteSnapshot.docs.map((docSnap) => [docSnap.id, docSnap.data()]));
    const entries = [...openInvites.entries()].sort(([, a], [, b]) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    inviteList.innerHTML = entries.map(([code, data]) => {
      const player = state.players.find((item) => item.id === data.playerId);
      const expiresAtDate = data.expiresAt?.toDate ? data.expiresAt.toDate() : null;
      return `
        <div class="access-row">
          <div><strong>${escapeHtml(player?.name || data.playerId || "Unbekannter Spieler")}</strong><span class="muted">${escapeHtml(`${formatInviteRole(data.role)} · noch nicht eingelöst · ${accessValidityText(expiresAtDate, now)}`)}</span></div>
          <div class="access-actions">
            <button class="ghost-button" data-action="share-invite" data-code="${escapeHtml(code)}" type="button">Code / Link / QR</button>
            <button class="ghost-button" data-action="revoke-invite" data-code="${escapeHtml(code)}" type="button">Widerrufen</button>
          </div>
        </div>
      `;
    }).join("") || `<p class="muted">Keine offenen Einladungen.</p>`;
    setCount("#inviteCount", entries.length);
  } catch (error) {
    console.error(error);
    inviteList.innerHTML = `<p class="muted">Offene Einladungen konnten nicht geladen werden.${escapeHtml(cloudErrorSuffix(error))}</p>`;
  }
}

function shareOpenInvite(code) {
  const data = openInvites.get(code);
  if (!data) return;
  showInviteShare({
    code,
    playerName: state.players.find((item) => item.id === data.playerId)?.name,
    role: data.role,
    expiresAtDate: data.expiresAt?.toDate ? data.expiresAt.toDate() : null
  });
}

// Widerruft eine noch nicht eingeloeste Einladung: das Code-Dokument wird geloescht, der Code ist sofort wertlos.
async function revokeInvite(code) {
  if (!isCloudTrainer()) return;
  if (!confirm("Einladung wirklich widerrufen? Der Code und der Link funktionieren danach nicht mehr.")) return;
  try {
    await firestoreModule.deleteDoc(teamDoc("invites", code));
    renderAccessManager();
  } catch (error) {
    console.error(error);
    alert(`Einladung konnte nicht widerrufen werden.${cloudErrorSuffix(error)}`);
  }
}

async function revokeAccess(uid, role) {
  if (!isCloudTrainer()) return;
  // Das eigene Konto sperren sich Trainer nicht selbst aus (SCRUM-30).
  if (uid === (currentUser?.uid || authInstance?.currentUser?.uid)) {
    alert("Das eigene Konto kann hier nicht gesperrt werden.");
    return;
  }
  const question = role === "trainer"
    ? "Dieses Trainer-Konto wirklich sperren? Es verliert sofort den Vollzugriff und kommt nur mit einem neu angelegten Trainer-Konto wieder hinein."
    : role === "medical"
      ? "Medizin-Zugang wirklich sperren? Er verliert sofort den Zugriff."
      : role === "scout"
      ? "Scout-Zugang wirklich sperren? Er verliert sofort den Zugriff."
      : "Zugang wirklich sperren? Der Spieler muesste sich danach mit einem neuen Code anmelden.";
  if (!confirm(question)) return;
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
  if (!confirm("Bestehende Cloud-Daten aus dem alten Format in die neue Struktur uebertragen?\n\nAchtung: das ueberschreibt aktuelle Spieler/Events/etc. mit dem Stand des alten Dokuments. Nur einmalig direkt nach der Einrichtung verwenden.")) return;
  try {
    const legacySnap = await firestoreModule.getDoc(teamDoc("appState", "current"));
    if (!legacySnap.exists()) {
      alert("Keine alten Cloud-Daten gefunden.");
      return;
    }
    const raw = legacySnap.data();
    // normalizeState() faellt auf die eingebauten Beispieldaten zurueck, wenn "players"
    // fehlt oder kein Array ist (gedacht fuer den allerersten lokalen Start der App ohne
    // jede Daten) - bei einer Migration waere das falsch: lieber abbrechen, als
    // versehentlich Demo-Spieler statt des echten (aber leeren/fehlerhaften) alten
    // Dokuments in die neue Struktur zu schreiben.
    if (!Array.isArray(raw.players) || raw.players.length === 0) {
      alert("Im alten Dokument wurden keine Spieler gefunden. Migration abgebrochen, es wurde nichts geschrieben.");
      return;
    }
    const legacy = normalizeState(raw);
    await Promise.all(legacy.players.map((player) => cloudSavePlayer(player)));
    await Promise.all(legacy.events.map(async (event) => {
      await cloudSaveEvent(event);
      await Promise.all(Object.entries(event.ratings || {}).map(([playerId, rating]) => cloudSaveRating(event.id, playerId, rating)));
    }));
    await Promise.all(Object.entries(legacy.developmentPlans || {}).flatMap(([playerId, plans]) =>
      plans.map((plan) => cloudSaveDevelopmentPlan(playerId, plan))
    ));
    await Promise.all(Object.entries(legacy.absences || {}).flatMap(([playerId, absences]) =>
      absences.map((absence) => cloudSaveAbsence(playerId, absence))
    ));
    await Promise.all(Object.entries(legacy.measurements || {}).flatMap(([playerId, measurements]) =>
      measurements.map((measurement) => cloudSaveMeasurement(playerId, measurement))
    ));
    await Promise.all(legacy.opponents.map((opponent) => cloudSaveOpponent(opponent)));
    if (legacy.lineup && !lineupIsEmpty(legacy.lineup)) await cloudSaveLineup(legacy.lineup);
    alert("Migration abgeschlossen. Das alte Dokument bleibt vorerst unveraendert erhalten.");
  } catch (error) {
    console.error(error);
    alert("Migration fehlgeschlagen: " + (error.message || error));
  }
}

// Ansichten, die die aktuelle Rolle oeffnen darf. Die Navigation blendet die uebrigen nur
// per CSS aus - diese Liste ist die Sperre fuer alle Wege (Suche, Schnellzugriffe, Auswahl).
function allowedViews() {
  if (["player", "parent"].includes(currentRole)) return ["profiles"];
  if (["medical", "scout"].includes(currentRole)) return ["squad", "profiles"];
  return Object.keys(views);
}

// Jeder Bereichswechsel (Bottom-Navigation, Schnellzugriff, Suche, "Mehr") schliesst das Aktionen-Menue.
function closeActionMenu() {
  document.querySelectorAll("details.action-menu[open]").forEach((menu) => menu.removeAttribute("open"));
}

function setView(viewName) {
  if (!allowedViews().includes(viewName)) return;
  closeActionMenu();
  Object.entries(views).forEach(([name, element]) => element.classList.toggle("active", name === viewName));
  document.querySelectorAll(".nav-tab").forEach((button) => button.classList.toggle("active", button.dataset.view === viewName));
  if ($("#moreNavTab")) {
    $("#moreNavTab").classList.toggle("active", ["opponents", "teamAnalysis"].includes(viewName));
  }
  if ($("#mobileViewSelect")) $("#mobileViewSelect").value = viewName;
  $("#pageTitle").textContent = titles[viewName];
  // SCRUM-35: Ansichten, die im Hintergrund veraltet sind, werden erst jetzt aktualisiert.
  const wasStale = renderScheduler.consume(viewName);
  withRenderPass(() => {
    if (viewName === "dashboard") { renderMetrics(); renderPitch(); renderLeaders(); }
    if (viewName === "squad") {
      renderSquad();
      if (isCloudTrainer()) renderAccessManager();
    }
    if (viewName === "events") {
      if (wasStale) renderEvents();
      setEventStep("list");
    }
    if (viewName === "profiles") drawProfile();
    if (viewName === "opponents") renderOpponentAnalysis();
    if (viewName === "teamAnalysis") renderTeamAnalysis();
  });
  prepareMobileAccordions();
}

function isMobileViewport() {
  return Boolean(window.matchMedia?.("(max-width: 720px)")?.matches);
}

function prepareMobileAccordions() {
  if (!isMobileViewport() || mobileAccordionsPrepared) return;
  document.querySelectorAll(".dashboard-section").forEach((section) => {
    section.open = section.dataset.mobileDefaultOpen === "true";
  });
  document.querySelectorAll(".control-disclosure").forEach((section) => {
    section.open = section.dataset.mobileDefaultOpen === "true";
  });
  mobileAccordionsPrepared = true;
}

// Auf dem Handy ist der Event-Tab zweistufig: erst die Liste, dann die
// Bewertung eines Events. Auf dem Desktop stehen beide Panels nebeneinander,
// dort ignoriert das CSS dieses Attribut.
function setEventStep(step) {
  const view = $("#eventsView");
  if (!view) return;
  view.dataset.step = step === "rate" && selectedEvent() ? "rate" : "list";
}

function selectedEvent() {
  return state.events.find((event) => event.id === state.selectedEventId) || state.events[0];
}

function sortedEvents() {
  return renderPassMemo("events", "all", () => [...state.events].sort((a, b) => new Date(b.date) - new Date(a.date)));
}

function playerRatings(playerId) {
  return sortedEvents()
    .map((event) => ({ event, rating: event.ratings?.[playerId] }))
    .filter(({ rating }) => rating && rating.attendance !== "absent" && rating.grade);
}

function playerAverageGrade(playerId) {
  return renderPassMemo("grade", playerId, () => computePlayerAverageGrade(playerId));
}

function computePlayerAverageGrade(playerId) {
  const ratings = playerRatings(playerId);
  if (!ratings.length) return null;
  const sum = ratings.reduce((total, item) => total + Number(item.rating.grade), 0);
  return roundGrade(sum / ratings.length);
}

function playerAttendanceCount(playerId) {
  return state.events.filter((event) => event.ratings?.[playerId]?.attendance === "present" || event.ratings?.[playerId]?.attendance === "limited").length;
}

function playerMeasurements(playerId) {
  return [...(state.measurements?.[playerId] || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
}

function latestMeasurement(playerId) {
  const measurements = playerMeasurements(playerId);
  return measurements.length ? measurements[measurements.length - 1] : null;
}

function quarterKey(date) {
  return `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;
}

function measurementMissingThisQuarter(playerId) {
  const currentQuarter = quarterKey(new Date());
  return !(state.measurements?.[playerId] || []).some((item) => item.date && quarterKey(new Date(`${item.date}T00:00:00`)) === currentQuarter);
}

function calculateBmi(height, weight) {
  const heightM = Number(height) / 100;
  if (!heightM || !weight) return null;
  return Number(weight) / (heightM * heightM);
}

function daysBetween(earlier, later) {
  return (later.getTime() - earlier.getTime()) / 86400000;
}

// --- LOAD-ASSESSMENT START (SCRUM-137) ---
// Belastungsampel. Drei Stufen statt einer Prozentzahl (die Summe geschaetzter Punkte wirkte wie
// eine Wahrscheinlichkeit): Unauffaellig / Beobachten / Anpassen, jeweils mit den Gruenden als Text.
// Verletzt/Angeschlagen ist die getrennte "Verfuegbarkeit" und fliesst nicht in die Stufe ein.
const LOAD_TIERS = {
  unauffaellig: { level: "Unauffällig", action: "Keine Auffälligkeit in der Belastung." },
  beobachten: { level: "Beobachten", action: "Aktuell keine Anpassung nötig, Entwicklung im Blick behalten." },
  anpassen: { level: "Anpassen", action: "Umfang bzw. Anstrengung dosieren und auf ausreichend Erholung achten." }
};

const AVAILABILITY_INFO = {
  fit: { key: "fit", label: "Fit", action: "" },
  angeschlagen: { key: "angeschlagen", label: "Angeschlagen", action: "Einsatz nur nach Rücksprache, Belastung dosieren." },
  verletzt: { key: "verletzt", label: "Verletzt", action: "Nicht einsetzen – ärztliche/physiotherapeutische Abklärung empfohlen." }
};

// Anstrengung 0-10 (angelehnt an die Borg-CR10-Skala), mit Worten.
const EXERTION_LABELS = ["Ruhe", "sehr leicht", "leicht", "mittel", "etwas schwer", "schwer", "ziemlich schwer", "sehr schwer", "sehr, sehr schwer", "fast maximal", "maximal"];
// Bisherige Termine haben nur eine Intensitaet 1/2/3; sie wird als 3/5/7 gelesen (keine Migration noetig).
const LEGACY_INTENSITY_EXERTION = { 1: 3, 2: 5, 3: 7 };
const DEFAULT_EXERTION = 5;
const DEFAULT_SESSION_MINUTES = 90;

function eventExertion(event) {
  const own = event?.exertion;
  if (own !== "" && own != null && Number.isFinite(Number(own)) && Number(own) >= 0 && Number(own) <= 10) return Math.round(Number(own));
  return LEGACY_INTENSITY_EXERTION[Number(event?.intensity)] ?? DEFAULT_EXERTION;
}

// Das alte Feld "intensity" (1-3) bleibt beim Speichern passend mitgefuehrt, damit aeltere Staende lesbar bleiben.
function legacyIntensityForExertion(exertion) {
  return exertion <= 4 ? 1 : exertion <= 6 ? 2 : 3;
}

function exertionLabel(value) {
  const number = Math.min(10, Math.max(0, Math.round(Number(value))));
  return `${number} · ${EXERTION_LABELS[number]}`;
}

function eventPlannedMinutes(event) {
  if (event?.type === "Spiel") return Number(event.matchDuration) > 0 ? Number(event.matchDuration) : DEFAULT_SESSION_MINUTES;
  return Number(event?.durationMinutes) > 0 ? Number(event.durationMinutes) : DEFAULT_SESSION_MINUTES;
}

// Minuten eines Spielers: bei Spielen die gespielten Minuten, sonst die Dauer des Termins;
// "eingeschraenkt" ohne eingetragene Minuten zaehlt 60 % der Dauer.
function sessionMinutes(event, rating) {
  const planned = eventPlannedMinutes(event);
  if (event?.type === "Spiel" && rating?.minutes !== "" && rating?.minutes != null) return Math.max(0, Math.min(planned, Number(rating.minutes)));
  return rating?.attendance === "limited" ? planned * 0.6 : planned;
}

// Belastung eines Termins = Minuten x Anstrengung (0-10).
function sessionLoadValue(event, rating) {
  return sessionMinutes(event, rating) * eventExertion(event);
}

// Reine Rechnung. sessions: [{ date: Date (Mitternacht), load, exertion }] nur fuer Termine, an denen der Spieler
// teilgenommen hat. Nur vergangene Termine zaehlen (SCRUM-136). Woche 0 = die letzten 7 Tage (heute und 6 Tage davor),
// Wochen 1-3 = die 3 Wochen davor (Tage 8-28), ohne Ueberschneidung.
function assessLoad({ sessions = [], measurements = [], lastInjuryEnd = null, lastAbsenceEnd = null, status = "Fit", injuredNow = false, today }) {
  const past = sessions
    .map((item) => ({ ...item, ago: Math.round(daysBetween(item.date, today)) }))
    .filter((item) => item.ago >= 0)
    .sort((a, b) => a.ago - b.ago);
  const weekLoads = [0, 1, 2, 3].map((week) => past.filter((item) => item.ago >= week * 7 && item.ago <= week * 7 + 6).reduce((sum, item) => sum + item.load, 0));
  const acute = weekLoads[0];
  const baseline = (weekLoads[1] + weekLoads[2] + weekLoads[3]) / 3;
  const weeksWithLoad = weekLoads.filter((value) => value > 0).length;
  const ratio = baseline > 0 ? acute / baseline : null;
  const hints = [];
  const infos = [];

  const spike = acute > 0 && (baseline === 0 || ratio >= 1.5);
  if (spike && weeksWithLoad >= 3) {
    hints.push({ label: `Belastungsspitze (${roundGrade(ratio).toFixed(1).replace(".", ",")}-fach des Schnitts der 3 Wochen davor)`, weight: ratio >= 2 ? 2 : 1 });
  } else if (spike) {
    infos.push("Wiedereinstieg – langsam steigern");
  }

  const hard = past.filter((item) => item.ago <= 6 && item.exertion >= 7);
  if (hard.some((item, index) => index > 0 && item.ago - hard[index - 1].ago <= 2)) {
    hints.push({ label: "Zwei sehr harte Einheiten innerhalb von 48 Stunden", weight: 1 });
  }

  // SCRUM-157: nur Messungen der letzten ca. 3 Monate (90 Tage) zaehlen, sonst bleibt ein alter Schub ewig stehen.
  const recentMeasurements = measurements.filter((item) => daysBetween(new Date(`${item.date}T00:00:00`), today) <= 90);
  if (recentMeasurements.length >= 2) {
    const [prev, last] = recentMeasurements.slice(-2);
    const months = daysBetween(new Date(`${prev.date}T00:00:00`), new Date(`${last.date}T00:00:00`)) / 30;
    const growth = months > 0 ? (Number(last.height) - Number(prev.height)) / months : 0;
    const text = roundGrade(growth).toFixed(1).replace(".", ",");
    if (growth >= 1.2) hints.push({ label: `Starker Wachstumsschub (${text} cm/Monat)`, weight: 2 });
    else if (growth >= 0.6) hints.push({ label: `Wachstumsschub (${text} cm/Monat)`, weight: 1 });
  }

  if (lastInjuryEnd) {
    const daysSinceReturn = daysBetween(new Date(`${lastInjuryEnd}T00:00:00`), today);
    if (daysSinceReturn >= 0 && daysSinceReturn <= 21) hints.push({ label: "Rückkehr nach Verletzung", weight: 1 });
  }
  if (lastAbsenceEnd) {
    const daysSinceEnd = daysBetween(new Date(`${lastAbsenceEnd}T00:00:00`), today);
    if (daysSinceEnd >= 0 && daysSinceEnd <= 14) infos.push("Kurz nach Abwesenheit (Wiedereinstieg)");
  }

  const score = hints.reduce((sum, hint) => sum + hint.weight, 0);
  const tier = score >= 2 ? "anpassen" : score >= 1 ? "beobachten" : "unauffaellig";
  const reasons = [...hints.map((hint) => hint.label), ...infos];
  const availability = injuredNow || status === "Verletzt" ? AVAILABILITY_INFO.verletzt : status === "Angeschlagen" ? AVAILABILITY_INFO.angeschlagen : AVAILABILITY_INFO.fit;
  return {
    tier,
    level: LOAD_TIERS[tier].level,
    action: LOAD_TIERS[tier].action,
    reasons,
    reason: reasons.join(" · ") || "Keine auffälligen Belastungsfaktoren",
    load: roundGrade(acute),
    baseline: roundGrade(baseline),
    weeksWithLoad,
    recentEvents: past.filter((item) => item.ago <= 27).length,
    availability
  };
}
// --- LOAD-ASSESSMENT END ---

function playerInjuryRisk(playerId) {
  return renderPassMemo("risk", playerId, () => computePlayerInjuryRisk(playerId));
}

const LOAD_TIER_RANK = { unauffaellig: 0, beobachten: 1, anpassen: 2 };

function computePlayerInjuryRisk(playerId, now = new Date()) {
  const player = state.players.find((item) => item.id === playerId);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const sessions = sortedEvents()
    .filter((event) => event.ratings?.[playerId]?.attendance === "present" || event.ratings?.[playerId]?.attendance === "limited")
    .map((event) => ({
      date: new Date(`${event.date}T00:00:00`),
      load: sessionLoadValue(event, event.ratings[playerId]),
      exertion: eventExertion(event)
    }));

  // Rueckkehr nach Verletzung/laengerer Abwesenheit: das Statusfeld ("ca. verletzt bis") und eine
  // eingetragene Verletzung beschreiben oft dieselbe Rueckkehr - deshalb zaehlt nur die juengste.
  const endedInjuries = (state.absences?.[playerId] || [])
    .filter((item) => isInjuryAbsence(item) && item.to && item.to < todayStr)
    .map((item) => item.to);
  if (player?.injuryUntil) endedInjuries.push(player.injuryUntil);
  const lastInjuryEnd = endedInjuries.sort().at(-1) || null;
  const lastEndedAbsence = (state.absences?.[playerId] || [])
    .filter((item) => !isInjuryAbsence(item) && item.to && item.to < todayStr)
    .sort((a, b) => new Date(b.to) - new Date(a.to))[0];

  return assessLoad({
    sessions,
    measurements: playerMeasurements(playerId),
    lastInjuryEnd,
    lastAbsenceEnd: lastEndedAbsence?.to || null,
    status: player?.status,
    injuredNow: isInjuryAbsence(activeAbsenceOn(playerId, todayStr)),
    today
  });
}

// Anzeige der Belastung (Kaderliste/Profil/PDF): Stufe als Text plus die Gruende; Zahlen korrekt beschriftet.
function loadSummaryText(risk) {
  return `Belastung letzte 7 Tage ${risk.load} · Schnitt der 3 Wochen davor ${risk.baseline}`;
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
  return exertionLabel(value);
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("de-DE");
}

// AVAILABILITY START (Verfuegbarkeit + automatisches "Fehlt", getestet in tests/availability.test.mjs)
// Ein offenes Enddatum ist nur bei Verletzungen zulaessig - dort steht die Rueckkehr
// am Anfang haeufig noch nicht fest, der Eintrag laeuft dann bis er beendet wird.
// Bei allen anderen Gruenden ist "Bis" Pflicht, ein Eintrag ohne Ende bleibt wirkungslos.
function absenceCoversDate(absence, dateStr) {
  if (!absence?.from || !dateStr || dateStr < absence.from) return false;
  return absence.to ? dateStr <= absence.to : isInjuryAbsence(absence);
}

// Bei mehreren gleichzeitigen Eintraegen hat die Verletzung Vorrang: sie ist die
// relevantere Information fuer Status und Event-Notiz.
function activeAbsenceOn(playerId, dateStr) {
  const active = (state.absences?.[playerId] || []).filter((absence) => absenceCoversDate(absence, dateStr));
  return active.find(isInjuryAbsence) || active[0] || null;
}

// Verletzung (Status "Verletzt" + "ca. verletzt bis") und eingetragene Abwesenheiten
// (Verletzung, Urlaub, Klassenfahrt etc.) fuehren beide dazu, dass ein Spieler fuer Events in
// diesem Zeitraum automatisch als "Fehlt" vorbelegt wird - siehe applyAutoAbsence/reconcileAbsences.
// Status "Verletzt" ohne "ca. verletzt bis" (SCRUM-164): gilt ab dem Tag, an dem er gesetzt
// wurde (injuredSince), bis auf Weiteres - also fuer alle Termine ab diesem Tag.
const OPEN_INJURY_REASON = "Verletzt (bis auf Weiteres)";

function isOpenInjury(player) {
  return player?.status === "Verletzt" && !player.injuryUntil;
}

// "Verletzt seit": bleibt der Spieler verletzt, gilt der bisherige Tag weiter; wird er neu auf
// "Verletzt" gesetzt (oder fehlt der Tag bei aelteren Daten), gilt heute. Sonst leer.
function injuredSinceFor(status, previous, today) {
  if (status !== "Verletzt") return "";
  return previous?.status === "Verletzt" && previous.injuredSince ? previous.injuredSince : today;
}

function unavailabilityReason(player, dateStr) {
  if (!player || !dateStr) return null;
  if (player.status === "Verletzt" && player.injuryUntil && dateStr <= player.injuryUntil) {
    return `Verletzt (ca. bis ${formatDate(player.injuryUntil)})`;
  }
  if (isOpenInjury(player) && player.injuredSince && dateStr >= player.injuredSince) return OPEN_INJURY_REASON;
  const absence = activeAbsenceOn(player.id, dateStr);
  if (!absence) return null;
  return `${absenceTitle(absence)} (${absence.to ? `bis ${formatDate(absence.to)}` : "Ende offen"})`;
}

// Status-Anzeige (Kader/Profil): eine heute laufende Abwesenheit ueberlagert den manuell
// gesetzten Status - "Verletzung" und "Sperre" werden dabei als eigener Grund erkannt, jede
// andere Abwesenheit (Urlaub, Klassenfahrt etc.) zeigt "Abwesend". Ohne aktive Abwesenheit
// bleibt es beim manuell gepflegten Status (Fit/Angeschlagen/Verletzt/Pause).
function playerEffectiveStatus(player) {
  const today = localIsoDate();
  const absence = activeAbsenceOn(player.id, today);
  if (!absence) return player.status;
  if (isInjuryAbsence(absence)) return "Verletzt";
  return absence.label.trim().toLowerCase().startsWith("sperre") ? "Gesperrt" : "Abwesend";
}

function hasRatingData(rating) {
  if (!rating) return false;
  return ["effort", "technique", "tactics", "comprehension", "minutes", "goals", "assists", "note"]
    .some((field) => rating[field] !== "" && rating[field] != null);
}

function blankRating() {
  return { attendance: "open", grade: "", effort: "", technique: "", tactics: "", comprehension: "", minutes: "", goals: "", assists: "", note: "" };
}

// Setzt Spieler bei einer Abwesenheit/Verletzung automatisch auf "Fehlt" - und nimmt das wieder
// zurueck, wenn die Abwesenheit geloescht oder verkuerzt wird.
// - Vorwaerts: ueberschreibt nur Ratings, die noch komplett unbearbeitet sind ("open" ohne jede
//   weitere Eingabe). Eine manuell gesetzte Anwesenheit sowie Teilnoten/Notizen bleiben unangetastet.
// - Rueckwaerts: nur Eintraege mit autoAbsence-Markierung. Die Markierung faellt weg, sobald
//   jemand das Rating von Hand aendert (updateRating) - dann bleibt es immer stehen.
// options (SCRUM-164, nur fuer den geaenderten Spieler options.playerId): Termine vor
// options.pastBefore werden nicht angefasst ("Verletzt" ohne Datum wirkt nur nach vorn). Mit
// options.keepPastOpenInjury (Status "Verletzt" ohne Datum zurueckgenommen) bleibt das vergangene,
// automatisch gesetzte "Fehlt" dauerhaft stehen: die Markierung faellt weg wie bei Handeingabe.
function applyAutoAbsence(event, options = {}) {
  let changed = false;
  state.players.forEach((player) => {
    const existing = event.ratings?.[player.id];
    if (options.playerId === player.id && options.pastBefore && event.date && event.date < options.pastBefore) {
      if (options.keepPastOpenInjury && existing?.autoAbsence && existing.note === OPEN_INJURY_REASON) {
        event.ratings[player.id] = { ...existing, autoAbsence: false };
        cloudSaveRating(event.id, player.id, event.ratings[player.id]);
        changed = true;
      }
      return;
    }
    const reason = unavailabilityReason(player, event.date);
    if (existing?.autoAbsence) {
      if (reason && existing.note === reason) return;
      event.ratings[player.id] = reason
        ? { ...existing, note: reason }
        : { ...blankRating(), autoAbsence: false };
      cloudSaveRating(event.id, player.id, event.ratings[player.id]);
      changed = true;
      return;
    }
    if (existing?.attendance && existing.attendance !== "open") return;
    if (hasRatingData(existing)) return;
    if (!reason) return;
    event.ratings ||= {};
    event.ratings[player.id] = { ...blankRating(), attendance: "absent", note: reason, autoAbsence: true };
    cloudSaveRating(event.id, player.id, event.ratings[player.id]);
    changed = true;
  });
  return changed;
}

function reconcileAbsences(options = {}) {
  let changed = false;
  state.events.forEach((event) => { if (applyAutoAbsence(event, options)) changed = true; });
  if (changed) persist();
}
// AVAILABILITY END

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

function hasScore(value) {
  return value !== null && value !== undefined && String(value).trim() !== "" && Number.isFinite(Number(value));
}

// Leeres Ergebnisfeld = "noch kein Ergebnis" (nicht 0).
function scoreOrEmpty(value) {
  return hasScore(value) ? Number(value) : "";
}

function localIsoDate(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Ein Ergebnis zaehlt nur, wenn beide Werte eingetragen sind und das Spiel nicht in der
// Zukunft liegt (ein vorab angelegtes Spiel mit 0:0 ist kein Unentschieden).
function gameResult(event) {
  if (event.type !== "Spiel" || !hasScore(event.goalsFor) || !hasScore(event.goalsAgainst)) return null;
  if (event.date && event.date > localIsoDate()) return null;
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
  const attendances = state.events
    .flatMap((event) => Object.values(event.ratings || {}).map((rating) => rating.attendance))
    .filter((value) => value !== "excluded");
  const attendanceRate = attendances.length
    ? Math.round((attendances.filter((value) => value === "present" || value === "limited").length / attendances.length) * 100)
    : 0;
  const avgIntensity = state.events.length ? roundGrade(state.events.reduce((sum, event) => sum + eventExertion(event), 0) / state.events.length) : null;
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
    ["technique", "Fehlerquote"],
    ["tactics", "Entscheidungsfindung"],
    ["comprehension", "Lernfähigkeit"]
  ];
  return fields.map(([field, label]) => {
    const values = ratings.map((item) => Number(item.rating[field])).filter(Boolean);
    return { label, value: values.length ? roundGrade(values.reduce((sum, value) => sum + value, 0) / values.length) : null };
  });
}

// Fuer Anwesenheits- und Einsatzquoten zaehlt ein Event nur, wenn es nicht in der Zukunft liegt
// und die Anwesenheit des Spielers schon gesetzt ist (nicht "Offen"). Im Voraus angelegte oder
// noch nicht bewertete Termine duerfen die Quote nicht verwaessern.
function countsForPlayerStats(event, playerId) {
  const attendance = event.ratings?.[playerId]?.attendance || "open";
  if (attendance === "open") return false;
  return Boolean(event.date) && new Date(`${event.date}T00:00:00`) <= startOfToday();
}

function profileAvailability(playerId) {
  const relevant = state.events
    .filter((event) => countsForPlayerStats(event, playerId))
    .map((event) => event.ratings[playerId].attendance);
  const total = Math.max(relevant.length, 1);
  const present = relevant.filter((value) => value === "present").length;
  const limited = relevant.filter((value) => value === "limited").length;
  const absent = relevant.filter((value) => value === "absent").length;
  const excluded = relevant.filter((value) => value === "excluded").length;
  return [
    { label: "Anwesend", value: Math.round((present / total) * 100), display: `${present}/${total}` },
    { label: "Teilweise", value: Math.round((limited / total) * 100), display: `${limited}/${total}` },
    { label: "Fehlt", value: Math.round((absent / total) * 100), display: `${absent}/${total}` },
    { label: "Nicht im Kader", value: Math.round((excluded / total) * 100), display: `${excluded}/${total}` }
  ];
}

function playerGameStats(playerId) {
  // Nur gezaehlte Spiele; "Nicht im Kader" zaehlt weder als moegliche Einsatzzeit noch als Spiel.
  const games = gameEvents().filter((event) => countsForPlayerStats(event, playerId) && event.ratings[playerId].attendance !== "excluded");
  const gameRatings = games
    .map((event) => ({ event, rating: event.ratings?.[playerId] }))
    .filter(({ rating }) => rating && rating.attendance !== "absent" && rating.attendance !== "excluded");
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
    minutesPerGame: appearances ? Math.round(minutes / appearances) : 0,
    minutesPerScorer: scorers ? Math.round(minutes / scorers) : null
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
  const fitPlayers = state.players.filter((player) => playerEffectiveStatus(player) === "Fit").length;
  const gradedRatings = state.players.map((player) => playerAverageGrade(player.id)).filter(Boolean);
  const teamGrade = gradedRatings.length ? roundGrade(gradedRatings.reduce((sum, grade) => sum + grade, 0) / gradedRatings.length) : null;
  const highRiskPlayers = state.players.filter((player) => playerInjuryRisk(player.id).tier === "anpassen").length;
  const stats = teamStats();
  const nextEvent = nextUpcomingEvent();
  const metrics = [
    ["Kader", state.players.length],
    ["Fit", fitPlayers],
    ["Events", state.events.length],
    ["Teamnote", gradeLabel(teamGrade)],
    ["Bilanz", `${stats.wins}-${stats.draws}-${stats.losses}`],
    ["Tore", `${stats.goalsFor}:${stats.goalsAgainst}`],
    ["Belastung hoch", highRiskPlayers]
  ];
  $("#metricsGrid").innerHTML = metrics.map(([label, value]) => `<article class="metric"><span>${label}</span><strong>${value}</strong></article>`).join("");
  if (nextEvent) $("#metricsGrid").innerHTML += `<article class="metric metric-wide"><span>Nächstes Event</span><strong>${formatDate(nextEvent.date)}</strong><small>${escapeHtml(nextEvent.title)}</small></article>`;
}

// Zeitlich naechstes Event ab heute (sortedEvents() ist absteigend sortiert).
function nextUpcomingEvent() {
  const today = startOfToday();
  return state.events
    .filter((event) => event.date && new Date(`${event.date}T00:00:00`) >= today)
    .sort((a, b) => new Date(`${a.date}T00:00:00`) - new Date(`${b.date}T00:00:00`))[0] || null;
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

// ---- Startelf/Taktikboard ----
function expandPreset(preset) {
  const slots = [];
  Object.entries(preset).forEach(([zone, count]) => {
    for (let i = 0; i < count; i += 1) slots.push({ zone });
  });
  return slots;
}

function formationNameFromAssignments(assignments) {
  const parts = PITCH_BANDS
    .map((zones) => zones.reduce((sum, zone) => sum + (assignments[zone]?.length || 0), 0))
    .filter((count) => count > 0);
  return parts.length ? parts.join("-") : "Keine Aufstellung";
}

function formationNameFromPreset(preset) {
  const parts = PITCH_BANDS
    .map((zones) => zones.reduce((sum, zone) => sum + Number(preset[zone] || 0), 0))
    .filter((count) => count > 0);
  return parts.join("-");
}

function normalizeLineup(lineup, playerIds = new Set()) {
  const assignments = {};
  Object.keys(PITCH_ZONES).forEach((zone) => {
    const ids = Array.isArray(lineup?.assignments?.[zone]) ? lineup.assignments[zone] : [];
    assignments[zone] = playerIds.size ? ids.filter((id) => playerIds.has(id)) : ids;
  });
  return { assignments };
}

function lineupIsEmpty(lineup) {
  return Object.values(lineup.assignments).every((ids) => !ids.length);
}

// Je Spiel gespeicherte Aufstellung (SCRUM-29): { [eventId]: { assignments, savedAt } }.
// Nur Trainer sehen das Dokument (meta/lineup), deshalb steht es nicht im Event-Dokument.
function normalizeEventLineups(raw, playerIds = new Set()) {
  const result = {};
  Object.entries(raw && typeof raw === "object" ? raw : {}).forEach(([eventId, entry]) => {
    const lineup = normalizeLineup(entry, playerIds);
    if (lineupIsEmpty(lineup)) return;
    result[eventId] = { assignments: lineup.assignments, savedAt: typeof entry?.savedAt === "string" ? entry.savedAt : "" };
  });
  return result;
}

// Das Taktikboard gehoert zum naechsten anstehenden Spiel; gibt es keins, bleibt es
// die allgemeine Startelf wie bisher.
function lineupTargetEvent() {
  const today = localIsoDate();
  return state.events
    .filter((event) => event.type === "Spiel" && event.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0] || null;
}

// Letztes Spiel vor dem Ziel-Spiel (bzw. vor heute), fuer das eine Aufstellung gespeichert ist.
function previousGameWithLineup(target) {
  const before = target?.date || localIsoDate();
  return state.events
    .filter((event) => event.type === "Spiel" && event.id !== target?.id && event.date < before && state.eventLineups?.[event.id])
    .sort((a, b) => b.date.localeCompare(a.date))[0] || null;
}

function saveBoardLineup() {
  const target = lineupTargetEvent();
  if (!target) {
    persist();
    cloudSaveLineup(state.lineup);
    return;
  }
  const entry = { assignments: structuredClone(state.lineup.assignments), savedAt: new Date().toISOString() };
  state.eventLineups ||= {};
  state.eventLineups[target.id] = entry;
  persist();
  cloudSaveEventLineup(target.id, entry);
}

function copyLineupFromPreviousGame() {
  const source = previousGameWithLineup(lineupTargetEvent());
  if (!source) return;
  state.lineup = { assignments: structuredClone(state.eventLineups[source.id].assignments) };
  saveBoardLineup();
  renderPitch();
}

function eventLineupHtml(event) {
  const entry = state.eventLineups?.[event.id];
  if (!entry) return "";
  const rows = Object.keys(PITCH_ZONES).map((zone) => {
    const players = (entry.assignments[zone] || []).map((id) => state.players.find((player) => player.id === id)).filter(Boolean);
    if (!players.length) return "";
    return `<li><strong>${zone}</strong> ${players.map((player) => `${player.number} ${escapeHtml(player.name)}`).join(", ")}</li>`;
  }).join("");
  const bench = state.players.filter((player) => !Object.values(entry.assignments).flat().includes(player.id));
  return `
    <h3>Aufstellung ${escapeHtml(formationNameFromAssignments(entry.assignments))}</h3>
    <ul class="event-lineup-list">${rows}</ul>
    ${bench.length ? `<p class="muted">Bank: ${bench.map((player) => `${player.number} ${escapeHtml(player.name)}`).join(", ")}</p>` : ""}
  `;
}

function eligibleLineupCandidates() {
  return state.players
    .filter((player) => !["Verletzt", "Gesperrt", "Abwesend"].includes(playerEffectiveStatus(player)))
    .sort((a, b) => (playerAverageGrade(a.id) || 9) - (playerAverageGrade(b.id) || 9) || a.number - b.number);
}

// Waehlt aus allen verfuegbaren Spielern die beste GESAMT-Elf fuer die uebergebenen
// Slots: jeder Spieler besetzt hoechstens einen Slot und nur eine Zone, die exakt
// in seinen eingetragenen Positionen steht (keine "verwandten" Positionen). Optimiert
// wird per Bitmask-DP (ein Slot pro Bit) zuerst auf moeglichst wenige offene
// Positionen, danach auf den besten Notendurchschnitt der Elf - statt slot-fuer-slot
// naiv den jeweils besten verfuegbaren Spieler zu nehmen, was einzelne Positionen
// unnoetig freilassen oder eine schwaechere Gesamtelf ergeben kann.
function assignFormationSlots(slots, candidates) {
  const slotCount = slots.length;
  const fullMask = (1 << slotCount) - 1;
  const eligibility = candidates.map((player) => {
    const positions = parsePositions(player.positions || player.position);
    return slots.reduce((bits, slot, index) => (positions.includes(slot.zone) ? bits | (1 << index) : bits), 0);
  });

  let dp = new Array(fullMask + 1).fill(Infinity);
  let parent = new Array(fullMask + 1).fill(null);
  dp[0] = 0;

  candidates.forEach((player, playerIndex) => {
    const bits = eligibility[playerIndex];
    if (!bits) return;
    const grade = playerAverageGrade(player.id) || 9;
    const dpNext = dp.slice();
    const parentNext = parent.slice();
    for (let mask = 0; mask <= fullMask; mask++) {
      if (!Number.isFinite(dp[mask])) continue;
      for (let slotIndex = 0; slotIndex < slotCount; slotIndex++) {
        const bit = 1 << slotIndex;
        if (!(bits & bit) || (mask & bit)) continue;
        const cost = grade;
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

function formationPreview(preset, candidates) {
  const assigned = assignFormationSlots(expandPreset(preset), candidates);
  const grades = assigned.map(({ player }) => player && playerAverageGrade(player.id)).filter(Boolean);
  const grade = grades.length ? roundGrade(grades.reduce((sum, value) => sum + value, 0) / grades.length) : null;
  return { assigned, grade, filled: assigned.filter((item) => item.player).length, total: assigned.length };
}

function assignedToAssignments(assigned) {
  const assignments = {};
  Object.keys(PITCH_ZONES).forEach((zone) => { assignments[zone] = []; });
  assigned.forEach(({ slot, player }) => { if (player) assignments[slot.zone].push(player.id); });
  return assignments;
}

function applyFormationPreset(presetIndex) {
  const preset = FORMATION_PRESETS[presetIndex];
  if (!preset) return;
  const { assigned } = formationPreview(preset, eligibleLineupCandidates());
  state.lineup = { assignments: assignedToAssignments(assigned) };
  saveBoardLineup();
  renderPitch();
}

function playerOnPitchZone(playerId) {
  return Object.entries(state.lineup.assignments).find(([, ids]) => ids.includes(playerId))?.[0] || null;
}

// Stellt playerId in zoneLabel (entfernt ihn zuerst aus seiner bisherigen Zone).
// Keine Kapazitaetsgrenze pro Zone - mehrere Spieler in derselben Zone werden
// beim Rendern per Flexbox nebeneinander innerhalb der Zonenbreite verteilt.
function pitchPlayerCount() {
  return Object.values(state.lineup.assignments).reduce((sum, ids) => sum + ids.length, 0);
}

function movePlayerToZone(playerId, zoneLabel) {
  if (!PITCH_ZONES[zoneLabel]) return;
  // Kapazitaetsgrenze gilt nur beim Einwechseln von der Bank - ein bereits
  // aufgestellter Spieler darf immer die Zone wechseln, da sich die Gesamtzahl
  // auf dem Feld dabei nicht aendert.
  if (!playerOnPitchZone(playerId) && pitchPlayerCount() >= 11) {
    alert("Die Startelf ist bereits voll (11 Spieler). Nimm zuerst jemanden vom Feld, bevor du einen weiteren Spieler aufstellst.");
    return;
  }
  const assignments = state.lineup.assignments;
  Object.keys(assignments).forEach((zone) => {
    assignments[zone] = assignments[zone].filter((id) => id !== playerId);
  });
  assignments[zoneLabel].push(playerId);
  saveBoardLineup();
  renderPitch();
}

function removePlayerFromPitch(playerId) {
  const assignments = state.lineup.assignments;
  Object.keys(assignments).forEach((zone) => {
    assignments[zone] = assignments[zone].filter((id) => id !== playerId);
  });
  saveBoardLineup();
  renderPitch();
}

// Wird beim Ablegen eines Spielers direkt auf einem anderen Spieler aufgerufen
// (auf dem Feld oder der Bank) - beide tauschen ihre Zone. Kam einer der beiden
// von der Bank (keine Zone), landet der andere dafuer auf der Bank statt in einer
// Zone - also eine normale Einwechslung statt eines Tauschs.
function swapPlayers(playerIdA, playerIdB) {
  if (playerIdA === playerIdB) return;
  const zoneA = playerOnPitchZone(playerIdA);
  const zoneB = playerOnPitchZone(playerIdB);
  const assignments = state.lineup.assignments;
  Object.keys(assignments).forEach((zone) => {
    assignments[zone] = assignments[zone].filter((id) => id !== playerIdA && id !== playerIdB);
  });
  if (zoneB) assignments[zoneB].push(playerIdA);
  if (zoneA) assignments[zoneA].push(playerIdB);
  saveBoardLineup();
  renderPitch();
}

let pitchSubstituteTarget = null;

function openPitchSubstituteDialog(zoneLabel, playerId) {
  pitchSubstituteTarget = { zone: zoneLabel, playerId: playerId || null };
  $("#substituteZoneLabel").textContent = zoneLabel;
  $("#substituteSearch").value = "";
  $("#removeFromPitchBtn").hidden = !playerId;
  renderSubstituteList();
  $("#substituteDialog").showModal();
}

function renderSubstituteList() {
  if (!pitchSubstituteTarget) return;
  const { zone, playerId } = pitchSubstituteTarget;
  const query = $("#substituteSearch").value.trim().toLowerCase();
  const players = [...state.players]
    .sort((a, b) => a.number - b.number)
    .filter((player) => !query || [player.name, positionText(player), String(player.number)].join(" ").toLowerCase().includes(query));
  $("#substituteList").innerHTML = players.map((player) => {
    const positions = parsePositions(player.positions || player.position);
    const eligible = positions.includes(zone);
    const currentZone = playerOnPitchZone(player.id);
    return `
      <button type="button" class="substitute-option ${eligible ? "" : "out-of-position"} ${player.id === playerId ? "current" : ""}" data-player-id="${player.id}">
        <span class="number-badge">${player.number}</span>
        <span class="substitute-option-name">
          <strong>${escapeHtml(player.name)}</strong>
          <small class="muted">${positionText(player)} · Note ${gradeLabel(playerAverageGrade(player.id))}${currentZone ? ` · aktuell ${currentZone}` : " · Bank"}</small>
        </span>
      </button>
    `;
  }).join("") || `<p class="muted">Kein Spieler gefunden.</p>`;
}

function renderFormationPicker() {
  const candidates = eligibleLineupCandidates();
  const previews = FORMATION_PRESETS.map((preset) => formationPreview(preset, candidates));
  const completePreviews = previews.filter((preview) => preview.filled === preview.total);
  const recommendationPool = completePreviews.length ? completePreviews : previews;
  const bestFilled = Math.max(...recommendationPool.map((preview) => preview.filled));
  const bestGrade = recommendationPool.reduce((best, preview) => (
    preview.filled === bestFilled && preview.grade !== null && (best === null || preview.grade < best) ? preview.grade : best
  ), null);
  const recommendedIndex = previews.findIndex((preview) => preview.filled === bestFilled && preview.grade === bestGrade);
  const options = previews.map((preview, index) => {
    const name = formationNameFromPreset(FORMATION_PRESETS[index]);
    const recommended = index === recommendedIndex;
    return { preview, name, recommended };
  });

  // Auf dem Handy waere eine Kartenreihe zum Querscrollen; dort ist eine
  // Auswahlliste schneller und zeigt alle Formationen auf einen Blick.
  if (isMobileViewport()) {
    const currentName = formationNameFromAssignments(state.lineup?.assignments || {});
    const isKnown = options.some(({ name }) => name === currentName);
    // Passt die aktuelle Aufstellung zu keiner Vorlage, steht sie als
    // nicht auswaehlbarer Hinweis oben - sonst waere unklar, was gerade steht.
    const placeholder = currentName === "Keine Aufstellung"
      ? "Formation wählen"
      : `Eigene Aufstellung · ${currentName}`;
    $("#formationPicker").innerHTML = `
      <label class="formation-select-label">
        <span>Formation</span>
        <select id="formationSelect" aria-label="Formation wählen">
          ${isKnown ? "" : `<option value="" selected>${escapeHtml(placeholder)}</option>`}
          ${options.map(({ preview, name, recommended }, index) => `
            <option value="${index}" ${isKnown && name === currentName ? "selected" : ""}>${name} · Ø ${gradeLabel(preview.grade)} · ${preview.filled}/${preview.total}${recommended ? " · empfohlen" : ""}</option>
          `).join("")}
        </select>
      </label>`;
    return;
  }

  $("#formationPicker").innerHTML = options.map(({ preview, name, recommended }, index) => `
    <button type="button" class="formation-option ${recommended ? "recommended" : ""}" data-formation-index="${index}">
      ${recommended ? `<span class="formation-badge">Empfohlen</span>` : ""}
      <strong>${name}</strong>
      <span>Ø ${gradeLabel(preview.grade)} · ${preview.filled}/${preview.total} besetzt${preview.filled < preview.total ? ` · ${preview.total - preview.filled} offen` : ""}</span>
    </button>
  `).join("");
}

function renderPitchBench() {
  const onPitch = new Set(Object.values(state.lineup.assignments).flat());
  // Beste Note zuerst (1 ist die beste Schulnote), noch unbewertete Spieler
  // ans Ende und dort nach Rueckennummer.
  const bench = state.players
    .filter((player) => !onPitch.has(player.id))
    .sort((a, b) => {
      const gradeA = playerAverageGrade(a.id);
      const gradeB = playerAverageGrade(b.id);
      if (gradeA && gradeB && gradeA !== gradeB) return gradeA - gradeB;
      if (gradeA && !gradeB) return -1;
      if (!gradeA && gradeB) return 1;
      return a.number - b.number;
    });

  const counter = $("#benchCount");
  if (counter) counter.textContent = bench.length ? `${bench.length} Spieler` : "leer";

  $("#pitchBench").innerHTML = bench.length
    ? bench.map((player) => `
        <button type="button" class="bench-player" data-player-id="${player.id}">
          <span class="number-badge">${player.number}</span>
          <span class="bench-player-name">
            <strong>${escapeHtml(player.name)}</strong>
            <small class="muted">${positionText(player)}</small>
          </span>
          <span class="bench-player-grade">${gradeLabel(playerAverageGrade(player.id))}</span>
        </button>
      `).join("")
    : `<p class="muted">Alle Spieler stehen auf dem Feld.</p>`;
}

function renderPitch() {
  state.lineup ||= normalizeLineup({});
  const target = lineupTargetEvent();
  const storedForTarget = target && state.eventLineups?.[target.id];
  if (storedForTarget) state.lineup = { assignments: structuredClone(storedForTarget.assignments) };
  renderLineupTarget(target, Boolean(storedForTarget));
  if (lineupIsEmpty(state.lineup)) {
    const candidates = eligibleLineupCandidates();
    const previews = FORMATION_PRESETS.map((preset) => formationPreview(preset, candidates));
    let bestIndex = -1;
    previews.forEach((preview, index) => {
      if (preview.grade !== null && (bestIndex === -1 || preview.grade < previews[bestIndex].grade)) bestIndex = index;
    });
    if (bestIndex >= 0) state.lineup = { assignments: assignedToAssignments(previews[bestIndex].assigned) };
  }

  const assignments = state.lineup.assignments;
  $("#pitch").innerHTML = Object.keys(PITCH_ZONES).map((zone) => {
    const info = PITCH_ZONES[zone];
    const ids = assignments[zone] || [];
    const chips = ids.map((playerId) => {
      const player = state.players.find((item) => item.id === playerId);
      if (!player) return "";
      const positions = parsePositions(player.positions || player.position);
      const outOfPosition = !positions.includes(zone);
      return `
        <div class="pitch-player ${outOfPosition ? "out-of-position" : ""}" data-player-id="${player.id}" data-zone="${zone}">
          <em>${zone}</em>
          <strong>${player.number} ${escapeHtml(player.name.split(" ")[0])}</strong>
          <span>Note ${gradeLabel(playerAverageGrade(player.id))}</span>
        </div>
      `;
    }).join("");
    return `
      <div class="pitch-zone ${ids.length ? "" : "pitch-zone-empty"}" style="left:${info.x}%;top:${info.y}%;width:${info.width}%" data-zone="${zone}">
        ${chips || `<span class="pitch-zone-label">${zone}</span>`}
      </div>
    `;
  }).join("");

  const formationNameEl = $("#pitchFormationName");
  if (formationNameEl) formationNameEl.textContent = formationNameFromAssignments(assignments);

  const teamGradeEl = $("#pitchTeamGrade");
  if (teamGradeEl) {
    const startingGrades = Object.values(assignments).flat().map((playerId) => playerAverageGrade(playerId)).filter(Boolean);
    const teamGrade = startingGrades.length ? roundGrade(startingGrades.reduce((sum, value) => sum + value, 0) / startingGrades.length) : null;
    teamGradeEl.textContent = teamGrade ? `Mannschaftsnote Ø ${gradeLabel(teamGrade)}` : "Mannschaftsnote noch ohne Bewertungen";
  }

  renderFormationPicker();
  renderPitchBench();
}

function renderLineupTarget(target, hasStored) {
  const info = $("#pitchTarget");
  const copyBtn = $("#copyLineupBtn");
  if (!info || !copyBtn) return;
  if (!target) {
    info.textContent = "Kein anstehendes Spiel – allgemeine Startelf";
    copyBtn.hidden = true;
    return;
  }
  const source = previousGameWithLineup(target);
  info.textContent = `Aufstellung für ${target.title} (${target.date})${hasStored ? "" : " – noch nicht gespeichert"}`;
  copyBtn.hidden = !source;
  if (source) copyBtn.textContent = `Aufstellung vom letzten Spiel übernehmen (${source.date})`;
}

function renderLeaders() {
  const leaders = state.players
    .map((player) => ({ player, grade: playerAverageGrade(player.id), events: playerAttendanceCount(player.id) }))
    .filter((item) => item.grade)
    .sort((a, b) => a.grade - b.grade)
    .slice(0, isMobileViewport() ? 5 : 6);
  $("#leaderList").innerHTML = leaders.map(({ player, grade, events }) => `
    <article class="leader-item">
      <div><strong>${escapeHtml(player.name)}</strong><br><small class="muted">${events} Events · ${escapeHtml(positionText(player))}</small></div>
      <strong>${gradeLabel(grade)}</strong>
      <div class="bar"><span style="width:${gradeToPercent(grade)}%"></span></div>
    </article>
  `).join("") || `<p class="muted">Noch keine Bewertungen vorhanden.</p>`;
}

function sortedSquad(players) {
  const sorted = [...players];
  switch ($("#squadSort").value) {
    case "name":
      sorted.sort((a, b) => a.name.localeCompare(b.name, "de"));
      break;
    case "position":
      sorted.sort((a, b) => positionText(a).localeCompare(positionText(b), "de") || a.number - b.number);
      break;
    case "age":
      sorted.sort((a, b) => new Date(b.birthdate) - new Date(a.birthdate));
      break;
    case "status":
      sorted.sort((a, b) => playerEffectiveStatus(a).localeCompare(playerEffectiveStatus(b), "de") || a.number - b.number);
      break;
    case "grade":
      sorted.sort((a, b) => (playerAverageGrade(a.id) ?? 99) - (playerAverageGrade(b.id) ?? 99));
      break;
    case "risk":
      sorted.sort((a, b) => (LOAD_TIER_RANK[playerInjuryRisk(b.id).tier] - LOAD_TIER_RANK[playerInjuryRisk(a.id).tier]) || (playerInjuryRisk(b.id).load - playerInjuryRisk(a.id).load));
      break;
    default:
      sorted.sort((a, b) => a.number - b.number);
  }
  return sorted;
}

function renderSquad() {
  const query = $("#searchInput").value.trim().toLowerCase();
  const position = $("#positionFilter").value;
  // Scouts (SCRUM-170): keine Status-, Belastungs- oder Messwert-Spalten und keine Suche nach Status.
  const scout = currentRole === "scout";
  document.querySelectorAll("#squadView .col-health").forEach((cell) => { cell.hidden = scout; });
  const players = sortedSquad(state.players.filter((player) => {
    const positions = parsePositions(player.positions || player.position);
    const matchesQuery = [player.name, positionText(player), scout ? "" : playerEffectiveStatus(player), String(player.number)].join(" ").toLowerCase().includes(query);
    const matchesPosition = position === "all" || positions.includes(position);
    return matchesQuery && matchesPosition;
  }));
  $("#playerTable").innerHTML = players.map((player) => {
    const effectiveStatus = playerEffectiveStatus(player);
    const statusClass = effectiveStatus === "Verletzt" || effectiveStatus === "Gesperrt" ? "danger" : effectiveStatus === "Angeschlagen" || effectiveStatus === "Abwesend" ? "warning" : "";
    const risk = scout ? null : playerInjuryRisk(player.id);
    const lastMeasurement = scout ? null : latestMeasurement(player.id);
    const missingMeasurement = scout ? false : measurementMissingThisQuarter(player.id);
    return `
      <tr>
        <td data-label="Spieler"><div class="player-cell"><span class="number-badge">${player.number}</span><strong>${escapeHtml(player.name)}</strong>${consentChipHtml(player)}</div></td>
        <td data-label="Positionen">${positionChips(player)}</td>
        <td data-label="Geburtsdatum">${formatDate(player.birthdate)}</td>
        ${scout ? "" : `<td data-label="Status"><span class="status-pill ${statusClass}">${escapeHtml(effectiveStatus)}</span></td>`}
        <td data-label="Events">${playerAttendanceCount(player.id)}</td>
        <td data-label="Note">${gradeLabel(playerAverageGrade(player.id))}</td>
        ${scout ? "" : `<td data-label="Belastung"><span class="risk-pill ${risk.tier}" title="${escapeHtml(risk.action)} (${escapeHtml(risk.reason)})">${risk.level}</span></td>
        <td data-label="Messwerte" class="measurement-cell">
          ${missingMeasurement
            ? `<span class="status-pill warning">Messwerte fehlen</span>`
            : `<span class="muted">${formatDate(lastMeasurement.date)} · ${lastMeasurement.height || "–"} cm / ${lastMeasurement.weight || "–"} kg</span>`}
          <button class="ghost-button" data-action="add-measurement" data-id="${player.id}" type="button">Messung hinzufügen</button>
        </td>`}
        <td class="row-actions" data-label="Aktionen">
          <button class="ghost-button" data-action="profile" data-id="${player.id}">Profil</button>
          <button class="ghost-button" data-action="edit" data-id="${player.id}">Bearbeiten</button>
          <button class="ghost-button" data-action="invite" data-id="${player.id}">Einladen</button>
          <button class="ghost-button danger" data-action="delete" data-id="${player.id}" type="button">Löschen</button>
        </td>
      </tr>
    `;
  }).join("");
  $("#playerCardsMobile").innerHTML = players.map((player) => {
    const effectiveStatus = playerEffectiveStatus(player);
    const statusClass = effectiveStatus === "Verletzt" || effectiveStatus === "Gesperrt" ? "danger" : effectiveStatus === "Angeschlagen" || effectiveStatus === "Abwesend" ? "warning" : "";
    const risk = scout ? null : playerInjuryRisk(player.id);
    return `
      <article class="player-card-mobile">
        <div class="player-card-mobile-top">
          <span class="number-badge">${player.number}</span>
          <strong>${escapeHtml(player.name)}</strong>
          ${scout ? "" : `<span class="status-pill ${statusClass}">${escapeHtml(effectiveStatus)}</span>`}
        </div>
        <div class="player-card-mobile-meta">
          ${positionChips(player)}
          ${scout ? "" : `<span class="risk-pill ${risk.tier}" title="${escapeHtml(risk.action)} (${escapeHtml(risk.reason)})">${risk.level}</span>`}
          <span class="player-card-mobile-grade">${gradeLabel(playerAverageGrade(player.id))}</span>
        </div>
        <div class="player-card-mobile-actions">
          <button class="ghost-button" data-action="profile" data-id="${player.id}">Profil öffnen</button>
          <details class="card-menu" name="squadCardMenu">
            <summary aria-label="Weitere Aktionen für ${escapeHtml(player.name)}"><span aria-hidden="true">···</span></summary>
            <div class="card-menu-list">
              <button class="ghost-button" data-action="edit" data-id="${player.id}">Bearbeiten</button>
              <button class="ghost-button" data-action="invite" data-id="${player.id}">Einladen</button>
              <button class="ghost-button danger" data-action="delete" data-id="${player.id}" type="button">Löschen</button>
            </div>
          </details>
        </div>
      </article>
    `;
  }).join("") || `<p class="muted">Keine Spieler gefunden.</p>`;
}

function renderSelects() {
  const selectedProfilePlayer = $("#profilePlayer").value;
  const playerOptions = [...state.players]
    .sort((a, b) => a.number - b.number)
    .map((player) => `<option value="${escapeHtml(player.id)}">${player.number} · ${escapeHtml(player.name)}</option>`)
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

  const eventOptions = sortedEvents().map((event) => `<option value="${escapeHtml(event.id)}">${escapeHtml(event.date)} · ${escapeHtml(event.type)} · ${escapeHtml(event.title)}</option>`).join("");
  $("#eventSelect").innerHTML = eventOptions;
  syncEventSelect();
}

// EVENT-SELECT-SYNC START (SCRUM-129, getestet in tests/event-select-sync.test.mjs)
// Haelt das Auswahlfeld "Event" auf dem intern gewaehlten Event. Reine
// Navigation: schreibt nichts in Cloud oder lokalen Speicher.
function syncEventSelect(select = $("#eventSelect"), eventId = selectedEvent()?.id) {
  if (!select || !eventId) return;
  if (select.value !== eventId) select.value = eventId;
}
// EVENT-SELECT-SYNC END

let eventFilter = { query: "", type: "all" };
let ratingStepperIndex = 0;
let lastRatingStepperKey = null;
const ratingFieldLabels = { effort: "Einsatz", technique: "Fehlerquote", tactics: "Entscheidungsfindung", comprehension: "Lernfähigkeit" };

function filteredEvents() {
  const query = eventFilter.query.trim().toLowerCase();
  return state.events.filter((event) => {
    const matchesType = eventFilter.type === "all" || event.type === eventFilter.type;
    if (!matchesType) return false;
    if (!query) return true;
    const haystack = [event.title, event.opponent, event.location].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query);
  });
}

function monthLabel(dateValue) {
  if (!dateValue) return "Ohne Datum";
  const label = new Date(`${dateValue}T00:00:00`).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function eventCardsHtml(events) {
  let lastMonth = null;
  return events.map((event) => {
    const rated = Object.values(event.ratings || {}).filter((rating) => rating.grade && rating.attendance !== "absent").length;
    const active = event.id === selectedEvent()?.id ? "active" : "";
    const result = gameResult(event);
    const month = monthLabel(event.date);
    const groupHeader = month !== lastMonth ? `<div class="event-group-label">${month}</div>` : "";
    lastMonth = month;
    return `
      ${groupHeader}
      <button class="event-card ${active}" data-event-id="${event.id}">
        <span class="event-type">${escapeHtml(event.type)}</span>
        <strong>${escapeHtml(event.title)}</strong>
        <small>${escapeHtml(event.date)}${event.opponent ? ` · vs. ${escapeHtml(event.opponent)}` : ""}${result ? ` · ${result.goalsFor}:${result.goalsAgainst}` : ""}</small>
        <span>Anstrengung ${exertionLabel(eventExertion(event))}</span>
        <span>${rated} Bewertungen</span>
      </button>
    `;
  }).join("");
}

function renderEvents() {
  syncEventSelect();
  const events = filteredEvents();
  const today = localIsoDate();
  const upcoming = events.filter((event) => event.date >= today).sort((a, b) => new Date(a.date) - new Date(b.date));
  const past = events.filter((event) => event.date < today).sort((a, b) => new Date(b.date) - new Date(a.date));

  // SCRUM-131: leerer Datenbestand und Suche ohne Treffer sind zwei verschiedene Faelle.
  const filterEmpty = state.events.length > 0 && !events.length;
  $("#eventList").innerHTML = eventCardsHtml(upcoming) || (
    !state.events.length ? `<p class="muted">Noch keine Events angelegt.</p>`
      : filterEmpty ? `<p class="muted">Keine Events für diese Suche gefunden.</p><button class="ghost-button" type="button" data-reset-event-filter>Filter zurücksetzen</button>`
      : `<p class="muted">Keine anstehenden Events.</p>`
  );

  const pastToggle = $("#pastEventsToggle");
  if (past.length) {
    pastToggle.hidden = false;
    $("#pastEventsSummary").textContent = `Vergangene Events (${past.length})`;
    $("#pastEventsList").innerHTML = eventCardsHtml(past);
    // Ohne anstehende Events waere die Liste sonst leer, obwohl es Events
    // gibt - dann sind die vergangenen von vornherein aufgeklappt.
    if (!upcoming.length) pastToggle.open = true;
  } else {
    pastToggle.hidden = true;
    pastToggle.open = false;
    $("#pastEventsList").innerHTML = "";
  }

  // Details eines Events, das der Filter ausblendet, nicht still weiter zeigen.
  const shown = selectedEvent();
  const outsideFilter = Boolean(shown) && !filterEmpty && !events.some((item) => item.id === shown.id);
  $("#eventsView")?.classList.toggle("events-filter-empty", filterEmpty);
  const outsideNote = $("#eventOutsideFilterNote");
  if (outsideNote) outsideNote.hidden = !outsideFilter;

  renderRatingTable();
}

function ratingPlayersForEvent(event) {
  const filter = $("#ratingFilter").value;
  return [...state.players].sort((a, b) => a.number - b.number).filter((player) => {
    const attendance = event.ratings?.[player.id]?.attendance || "open";
    if (filter === "present") return attendance === "present" || attendance === "limited";
    if (filter === "missing") return attendance === "absent" || attendance === "excluded" || attendance === "open";
    return true;
  });
}

function renderRatingTable() {
  const event = selectedEvent();
  if (!event) {
    $("#eventEditorTitle").textContent = "Event bewerten";
    $("#eventEditorMeta").textContent = "Lege zuerst ein Event an.";
    $("#ratingTable").innerHTML = "";
    $("#ratingStepper").hidden = true;
    return;
  }

  $("#eventEditorTitle").textContent = event.title;
  const result = gameResult(event);
  const matchDuration = event.type === "Spiel" ? Number(event.matchDuration || 90) : "";
  $("#eventEditorMeta").textContent = `${event.type} · ${event.date}${result ? ` · Ergebnis ${result.goalsFor}:${result.goalsAgainst}` : ""} · Anstrengung ${exertionLabel(eventExertion(event))}${event.location ? ` · ${event.location}` : ""}`;
  if (matchDuration) $("#eventEditorMeta").textContent += ` · ${matchDuration} Min.`;
  else $("#eventEditorMeta").textContent += ` · ${eventPlannedMinutes(event)} Min.`;
  const lineupBox = $("#eventLineup");
  if (lineupBox) {
    const html = event.type === "Spiel" && canManageRecords() ? eventLineupHtml(event) : "";
    lineupBox.innerHTML = html;
    lineupBox.hidden = !html;
  }
  $("#selectedEventIntensity").value = String(eventExertion(event));
  $("#selectedTrainingDuration").value = event.type === "Training" ? eventPlannedMinutes(event) : "";
  $("#selectedTrainingDuration").disabled = event.type !== "Training";
  $("#selectedTrainingDuration").closest("label").hidden = event.type !== "Training";
  $("#selectedGoalsFor").value = hasScore(event.goalsFor) ? event.goalsFor : "";
  $("#selectedGoalsAgainst").value = hasScore(event.goalsAgainst) ? event.goalsAgainst : "";
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
  const players = ratingPlayersForEvent(event);

  const stepperKey = `${event.id}:${$("#ratingFilter").value}`;
  if (stepperKey !== lastRatingStepperKey) {
    ratingStepperIndex = 0;
    lastRatingStepperKey = stepperKey;
  }

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
        <td data-label="Spieler"><div class="player-cell"><span class="number-badge">${player.number}</span><strong>${escapeHtml(player.name)}</strong></div></td>
        <td data-label="Anwesenheit">${attendanceSelectHtml(player.id, attendance, event.type === "Spiel")}</td>
        <td data-label="Gesamtnote"><span class="computed-grade">${gradeLabel(calculatedGrade(rating))}</span></td>
        <td data-label="Einsatz">${gradeSelectHtml(player.id, "effort", rating.effort)}</td>
        <td data-label="Fehlerquote">${gradeSelectHtml(player.id, "technique", rating.technique)}</td>
        <td data-label="Entscheidungsfindung">${gradeSelectHtml(player.id, "tactics", rating.tactics)}</td>
        <td data-label="Lernfähigkeit">${gradeSelectHtml(player.id, "comprehension", rating.comprehension)}</td>
        ${gameFields}
        <td data-label="Feedback an Spieler (sichtbar)"><input class="rating-note" data-player-id="${player.id}" data-field="note" value="${escapeHtml(rating.note || "")}" placeholder="Sichtbar für Spieler/Eltern" /></td>
        ${canManageRecords() ? `<td data-label="Interne Notiz (nur Trainer)"><input class="rating-note rating-private-note" data-player-id="${player.id}" value="${escapeHtml(event.privateNotes?.[player.id] || "")}" placeholder="Nur für Trainer" /></td>` : ""}
      </tr>
    `;
  }).join("");

  renderRatingStepper(event, players, matchDuration);
}

function renderRatingTableHead(isGame) {
  $("#ratingTableHead").innerHTML = `
    <th>Spieler</th>
    <th>Anwesenheit</th>
    <th>Gesamtnote</th>
    <th>Einsatz</th>
    <th>Fehlerquote</th>
    <th>Entscheidungsfindung</th>
    <th>Lernfähigkeit</th>
    ${isGame ? "<th>Min.</th><th>Tore</th><th>Vorlagen</th>" : ""}
    <th title="Diese Notiz sehen Spieler und Eltern in ihrem Profil">Feedback an Spieler (sichtbar)</th>
    ${canManageRecords() ? '<th title="Nur für Trainer sichtbar, Spieler und Eltern bekommen sie nie zu sehen">Interne Notiz (nur Trainer)</th>' : ""}
  `;
}

// groupLabel benennt die Gruppe und jeden Button fuer Screenreader (z. B. "Einsatz: Note 2");
// der gewaehlte Wert steht in aria-pressed, nicht nur in der CSS-Klasse "active".
function chipGroupHtml(playerId, field, value, options, extraClass = "", groupLabel = "") {
  const groupAttr = groupLabel ? ` aria-label="${escapeHtml(groupLabel)}"` : "";
  return `<div class="chip-group ${extraClass}" role="group"${groupAttr}>${options.map(([optionValue, label]) => {
    const active = String(value ?? "") === optionValue;
    const buttonName = groupLabel ? `${groupLabel}: ${optionValue === "" ? "keine Note" : `Note ${label}`}` : "";
    const nameAttr = buttonName ? ` aria-label="${escapeHtml(buttonName)}"` : "";
    return `
    <button type="button" class="chip-button ${active ? "active" : ""}" aria-pressed="${active}"${nameAttr} data-value="${optionValue}" data-player-id="${playerId}" data-field="${field}">${label}</button>
  `;
  }).join("")}</div>`;
}

function attendanceSelectHtml(playerId, value, isGame = false) {
  const options = [
    ["open", "Offen"],
    ["present", "Anwesend"],
    ["limited", "Teilweise"],
    ["absent", "Fehlt"],
    ...(isGame ? [["excluded", "Nicht im Kader"]] : [])
  ];
  return `<select class="rating-input attendance-select" data-player-id="${playerId}" data-field="attendance">${options.map(([optionValue, label]) => `<option value="${optionValue}" ${String(value ?? "open") === optionValue ? "selected" : ""}>${label}</option>`).join("")}</select>`;
}

function gradeChipsHtml(playerId, field, value) {
  const options = [["", "–"], ["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"], ["6", "6"]];
  return chipGroupHtml(playerId, field, value ?? "", options, "grade-chips", ratingFieldLabels[field] || "");
}

function gradeSelectHtml(playerId, field, value) {
  const options = [["", "–"], ["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"], ["6", "6"]];
  return `<select class="rating-input grade-select" data-player-id="${playerId}" data-field="${field}">${options.map(([optionValue, label]) => `<option value="${optionValue}" ${String(value ?? "") === optionValue ? "selected" : ""}>${label}</option>`).join("")}</select>`;
}

function renderRatingCard(player, event, matchDuration) {
  const rating = event.ratings?.[player.id] || {};
  const attendance = rating.attendance || "open";
  const gameFields = event.type === "Spiel" ? `
    <div class="rating-card-numbers">
      <label>Minuten <input class="rating-input" data-player-id="${player.id}" data-field="minutes" type="number" min="0" max="${matchDuration || 90}" value="${rating.minutes ?? ""}" /></label>
      <label>Tore <input class="rating-input" data-player-id="${player.id}" data-field="goals" type="number" min="0" max="20" value="${rating.goals ?? ""}" /></label>
      <label>Vorlagen <input class="rating-input" data-player-id="${player.id}" data-field="assists" type="number" min="0" max="20" value="${rating.assists ?? ""}" /></label>
    </div>
  ` : "";
  return `
    <div class="rating-card-head">
      <span class="number-badge">${player.number}</span>
      <div>
        <strong>${escapeHtml(player.name)}</strong>
        ${consentChipHtml(player)}
        <span class="computed-grade">Gesamtnote ${gradeLabel(calculatedGrade(rating))}</span>
      </div>
    </div>
    <div class="rating-card-field">
      <span class="rating-card-label">Anwesenheit</span>
      ${attendanceSelectHtml(player.id, attendance, event.type === "Spiel")}
    </div>
    <div class="rating-card-grades">
      ${["effort", "technique", "tactics", "comprehension"].map((field) => `
        <div class="rating-card-field">
          <span class="rating-card-label">${ratingFieldLabels[field]}</span>
          ${gradeChipsHtml(player.id, field, rating[field])}
        </div>
      `).join("")}
    </div>
    ${gameFields}
    <label class="rating-card-field">Feedback an Spieler (sichtbar) <input class="rating-note" data-player-id="${player.id}" data-field="note" value="${escapeHtml(rating.note || "")}" placeholder="Sichtbar für Spieler/Eltern" /></label>
    ${canManageRecords() ? `<label class="rating-card-field">Interne Notiz (nur Trainer) <input class="rating-note rating-private-note" data-player-id="${player.id}" value="${escapeHtml(event.privateNotes?.[player.id] || "")}" placeholder="Nur für Trainer" /></label>` : ""}
  `;
}

function renderRatingStepper(event, players, matchDuration) {
  const stepper = $("#ratingStepper");
  if (!players.length) {
    stepper.hidden = true;
    return;
  }
  stepper.hidden = false;
  ratingStepperIndex = Math.max(0, Math.min(ratingStepperIndex, players.length - 1));
  const player = players[ratingStepperIndex];
  const attendance = event.ratings?.[player.id]?.attendance || "open";
  $("#stepperPosition").textContent = `${ratingStepperIndex + 1} / ${players.length}`;
  $("#stepperJump").innerHTML = players.map((item, index) => `<option value="${index}" ${index === ratingStepperIndex ? "selected" : ""}>${item.number} · ${escapeHtml(item.name)}</option>`).join("");
  $("#stepperPrevBtn").disabled = ratingStepperIndex === 0;
  $("#stepperNextBtn").disabled = ratingStepperIndex === players.length - 1;
  $("#stepperCard").className = `rating-stepper-card attendance-${attendance}`;
  $("#stepperCard").innerHTML = renderRatingCard(player, event, matchDuration);

  const progress = $("#ratingProgress");
  if (progress) {
    // Fertig ist, wer eine Gesamtnote hat oder bewusst als fehlend bzw.
    // nicht im Kader markiert wurde - beides braucht keine Teilnoten mehr.
    const done = state.players.filter((item) => {
      const entry = event.ratings?.[item.id] || {};
      return Boolean(calculatedGrade(entry)) || ["absent", "excluded"].includes(entry.attendance);
    }).length;
    const total = state.players.length;
    const share = total ? Math.round((done / total) * 100) : 0;
    progress.innerHTML = total
      ? `<span class="rating-progress-label">${done} von ${total} Spielern erfasst</span>
         <span class="rating-progress-track"><span style="width:${share}%"></span></span>`
      : "";
    progress.dataset.complete = String(total > 0 && done === total);
  }
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
  // Kein vorbelegtes Geburtsdatum: das Feld ist Pflicht (ein falscher Standard verfaelscht Alter und Geburtsquartal).
  $("#playerBirthdate").value = player?.birthdate || "";
  $("#playerStatus").value = player?.status || "Fit";
  $("#playerInjuryUntil").value = player?.injuryUntil || "";
  $("#playerConsentStatus").value = player?.consentStatus || "pending";
  $("#playerConsentDate").value = player?.consentDate || "";
  syncPlayerInjuryField();
  $("#playerDialog").showModal();
}

function syncPlayerInjuryField() {
  const isInjured = $("#playerStatus").value === "Verletzt";
  $("#playerInjuryUntilField").hidden = !isInjured;
  if (!isInjured) $("#playerInjuryUntil").value = "";
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
    status: $("#playerStatus").value,
    injuryUntil: $("#playerStatus").value === "Verletzt" ? $("#playerInjuryUntil").value : "",
    consentStatus: $("#playerConsentStatus").value,
    consentDate: $("#playerConsentDate").value
  };
  const existingIndex = state.players.findIndex((item) => item.id === id);
  const previous = existingIndex >= 0 ? state.players[existingIndex] : null;
  const today = localIsoDate();
  player.injuredSince = injuredSinceFor(player.status, previous, today);
  if (existingIndex >= 0) state.players[existingIndex] = player;
  else state.players.push(player);
  $("#playerDialog").close();
  persist();
  cloudSavePlayer(player);
  // "Verletzt" ohne Datum wirkt nur ab heute; wird es zurueckgenommen, bleibt vergangenes "Fehlt" (SCRUM-164).
  const wasOpen = isOpenInjury(previous);
  const open = isOpenInjury(player);
  reconcileAbsences(wasOpen || open ? { playerId: id, pastBefore: today, keepPastOpenInjury: wasOpen && !open } : {});
  renderAll();
}

function openEventDialog(existing) {
  const editing = existing && existing.id ? existing : null;
  $("#eventDialogTitle").textContent = editing ? "Event bearbeiten" : "Event anlegen";
  $("#eventSubmitBtn").textContent = editing ? "Änderungen speichern" : "Event speichern";
  $("#eventId").value = editing?.id || "";
  $("#eventTitle").value = editing?.title || "";
  $("#eventType").value = editing?.type || "Training";
  if (editing) $("#eventDate").value = editing.date;
  else $("#eventDate").valueAsDate = new Date();
  $("#eventIntensity").value = String(editing ? eventExertion(editing) : DEFAULT_EXERTION);
  $("#eventTrainingDuration").value = editing && editing.type === "Training" ? eventPlannedMinutes(editing) : DEFAULT_SESSION_MINUTES;
  $("#eventLocation").value = editing?.location || "";
  $("#eventTrainingFocus").value = editing?.trainingFocus || "Eigener Ballbesitz";
  $("#eventOpponent").value = editing?.opponent || "";
  $("#eventGoalsFor").value = hasScore(editing?.goalsFor) ? editing.goalsFor : "";
  $("#eventGoalsAgainst").value = hasScore(editing?.goalsAgainst) ? editing.goalsAgainst : "";
  $("#eventMatchDuration").value = editing?.matchDuration || 90;
  $("#eventNotes").value = editing?.notes || "";
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
  const trainingDuration = $("#eventTrainingDuration");
  trainingDuration.disabled = isGame;
  trainingDuration.closest("label").hidden = isGame;
}

function saveEvent(event) {
  event.preventDefault();
  const editId = $("#eventId").value;
  const existing = editId ? state.events.find((item) => item.id === editId) : null;
  const newEvent = {
    id: existing?.id || `e${crypto.randomUUID()}`,
    type: $("#eventType").value,
    title: $("#eventTitle").value.trim(),
    date: $("#eventDate").value,
    exertion: Number($("#eventIntensity").value),
    intensity: legacyIntensityForExertion(Number($("#eventIntensity").value)),
    durationMinutes: $("#eventType").value === "Training" ? Math.max(1, Number($("#eventTrainingDuration").value) || DEFAULT_SESSION_MINUTES) : "",
    location: $("#eventLocation").value.trim(),
    trainingFocus: $("#eventType").value === "Training" ? $("#eventTrainingFocus").value : "",
    opponent: $("#eventOpponent").value.trim(),
    goalsFor: $("#eventType").value === "Spiel" ? scoreOrEmpty($("#eventGoalsFor").value) : "",
    goalsAgainst: $("#eventType").value === "Spiel" ? scoreOrEmpty($("#eventGoalsAgainst").value) : "",
    matchDuration: $("#eventType").value === "Spiel" ? Number($("#eventMatchDuration").value || 90) : "",
    notes: $("#eventNotes").value.trim(),
    ratings: existing?.ratings || {},
    // Interne Trainer-Notizen (SCRUM-14) beim Bearbeiten nicht verwerfen.
    privateNotes: existing?.privateNotes || {}
  };
  // Datum geaendert (oder neues Event): Abwesenheiten fuer das (neue) Datum vorbelegen.
  applyAutoAbsence(newEvent);
  if (existing) state.events[state.events.indexOf(existing)] = newEvent;
  else state.events.push(newEvent);
  state.selectedEventId = newEvent.id;
  $("#eventDialog").close();
  persist();
  cloudSaveEvent(newEvent);
  renderAll();
  if (!existing) {
    setView("events");
    setEventStep("rate");
  }
}

function updateRating(playerId, field, value, rerender = true) {
  const event = selectedEvent();
  if (!event) return;
  event.ratings ||= {};
  event.ratings[playerId] ||= { attendance: "open", grade: "", effort: "", technique: "", tactics: "", comprehension: "", minutes: "", goals: "", assists: "", note: "" };
  event.ratings[playerId][field] = ["effort", "technique", "tactics", "comprehension", "minutes", "goals", "assists"].includes(field) && value !== "" ? Number(value) : value;
  // Eine Hand-Aenderung macht aus dem automatisch gesetzten Eintrag einen normalen: er wird nie wieder zurueckgesetzt.
  if (event.ratings[playerId].autoAbsence) event.ratings[playerId].autoAbsence = false;
  if (field === "minutes" && value !== "") {
    event.ratings[playerId].minutes = Math.min(Number(event.matchDuration || 90), Math.max(0, Number(value)));
  }
  if (field === "attendance" && (value === "absent" || value === "excluded")) {
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

function updatePrivateNote(playerId, value) {
  const event = selectedEvent();
  if (!event) return;
  event.privateNotes ||= {};
  if (value) event.privateNotes[playerId] = value;
  else delete event.privateNotes[playerId];
  persist();
  cloudSavePrivateNote(event.id, playerId, value);
}

function deleteSelectedEvent() {
  const event = selectedEvent();
  if (!event) return;
  if (!confirm(`"${event.title}" wirklich löschen? Alle Bewertungen dieses Events gehen verloren.`)) return;
  state.events = state.events.filter((item) => item.id !== event.id);
  state.selectedEventId = state.events[0]?.id || "";
  const hadLineup = Boolean(state.eventLineups?.[event.id]);
  if (hadLineup) delete state.eventLineups[event.id];
  persist();
  cloudDeleteEvent(event);
  if (hadLineup) cloudDeleteEventLineup(event.id);
  renderEvents();
}

function updateSelectedEventMeta(field, value) {
  const event = selectedEvent();
  if (!event) return;
  const numericValue = Number(value);
  if (field === "intensity") {
    event.exertion = Math.min(10, Math.max(0, Math.round(numericValue)));
    event.intensity = legacyIntensityForExertion(event.exertion);
  } else if (field === "durationMinutes") event[field] = event.type === "Training" ? Math.max(1, Math.round(numericValue) || DEFAULT_SESSION_MINUTES) : "";
  else if (field === "trainingFocus") event[field] = event.type === "Training" ? value : "";
  else if (field === "matchDuration") event[field] = event.type === "Spiel" ? Math.max(1, numericValue || 90) : "";
  else event[field] = event.type === "Spiel" ? scoreOrEmpty(value) : "";
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
  renderAbsenceList(playerId);
  renderMeasurementList(playerId);
  renderMeasurementChart(player);
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
        ${plan.selfReflection ? `<p><strong>Selbstreflexion:</strong> ${escapeHtml(plan.selfReflection)}</p>` : ""}
        ${plan.coachReview ? `<p><strong>Trainerreview:</strong> ${escapeHtml(plan.coachReview)}</p>` : ""}
        ${currentRole === "player" ? `<form class="self-reflection-form" data-plan-id="${escapeHtml(plan.id)}"><label>Meine Reflexion<textarea rows="2" maxlength="400">${escapeHtml(plan.selfReflection)}</textarea></label><button class="primary-button" type="submit">Reflexion speichern</button></form>` : ""}
      </div>
      ${canManageRecords() ? `<div class="row-actions">
        <button class="ghost-button" data-action="edit-plan" data-id="${plan.id}" type="button">Bearbeiten</button>
        <button class="ghost-button danger" data-action="delete-plan" data-id="${plan.id}" type="button">Löschen</button>
      </div>` : ""}
    </article>
  `).join("") || `<p class="muted">Noch kein Förderplan für diesen Spieler angelegt.</p>`;
}

function resetDevelopmentPlanForm() {
  $("#developmentPlanId").value = "";
  $("#developmentPlanFocus").value = "";
  $("#developmentPlanGoal").value = "";
  $("#developmentPlanActions").value = "";
  $("#developmentPlanCoachReview").value = "";
  $("#developmentPlanReviewDate").value = "";
  $("#developmentPlanStatus").value = "Offen";
  $("#developmentPlanDueDate").value = "";
}

function saveDevelopmentPlan(event) {
  event.preventDefault();
  const playerId = $("#profilePlayer").value || state.players[0]?.id;
  if (!playerId) return;
  if (!confirmDespiteRevokedConsent([state.players.find((item) => item.id === playerId)].filter(Boolean), "Das Speichern des Förderplans")) return;
  state.developmentPlans ||= {};
  state.developmentPlans[playerId] ||= [];
  const id = $("#developmentPlanId").value || `dp${crypto.randomUUID()}`;
  const plan = {
    id,
    focus: $("#developmentPlanFocus").value.trim(),
    goal: $("#developmentPlanGoal").value.trim(),
    actions: $("#developmentPlanActions").value.trim(),
    selfReflection: state.developmentPlans[playerId].find((item) => item.id === id)?.selfReflection || "",
    selfReflectionAt: state.developmentPlans[playerId].find((item) => item.id === id)?.selfReflectionAt || "",
    coachReview: $("#developmentPlanCoachReview").value.trim(),
    reviewDate: $("#developmentPlanReviewDate").value,
    status: $("#developmentPlanStatus").value,
    dueDate: $("#developmentPlanDueDate").value,
    createdAt: state.developmentPlans[playerId].find((item) => item.id === id)?.createdAt || localIsoDate()
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
  $("#developmentPlanCoachReview").value = plan.coachReview || "";
  $("#developmentPlanReviewDate").value = plan.reviewDate || "";
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

async function saveSelfReflection(event) {
  event.preventDefault();
  if (currentRole !== "player" || !currentPlayerId) return;
  const planId = event.target.dataset.planId;
  const plan = state.developmentPlans?.[currentPlayerId]?.find((item) => item.id === planId);
  if (!plan) return;
  plan.selfReflection = event.target.querySelector("textarea").value.trim();
  plan.selfReflectionAt = new Date().toISOString();
  writeLocalCache();
  try {
    await firestoreModule.setDoc(teamDoc("players", currentPlayerId, "developmentPlans", planId), {
      selfReflection: plan.selfReflection,
      selfReflectionAt: plan.selfReflectionAt
    }, { merge: true });
    setSyncState("saved", "Reflexion gespeichert");
  } catch (error) {
    cloudWriteFailed(error, "Reflexion konnte nicht gespeichert werden.");
  }
  drawProfile();
}

function renderAbsenceList(playerId) {
  const absences = [...(state.absences?.[playerId] || [])].sort((a, b) => new Date(b.from || 0) - new Date(a.from || 0));
  $("#absenceList").innerHTML = absences.map((absence) => `
    <article class="development-item">
      <div>
        ${isInjuryAbsence(absence) ? `<span class="status-pill danger">Verletzung</span>` : ""}
        <strong>${escapeHtml(absenceTitle(absence))}</strong>
        <p>${escapeHtml(absencePeriodText(absence))}</p>
      </div>
      ${canManageRecords() ? `<div class="row-actions">
        <button class="ghost-button" data-action="edit-absence" data-id="${absence.id}" type="button">Bearbeiten</button>
        <button class="ghost-button danger" data-action="delete-absence" data-id="${absence.id}" type="button">Löschen</button>
      </div>` : ""}
    </article>
  `).join("") || `<p class="muted">Noch keine Abwesenheit oder Verletzung für diesen Spieler eingetragen.</p>`;
}

function syncAbsenceReasonField() {
  const reason = $("#absenceReason").value;
  const isCustom = reason === "Sonstiges";
  const isInjury = reason === ABSENCE_INJURY_REASON;
  $("#absenceCustomReasonField").hidden = !isCustom;
  if (!isCustom) $("#absenceCustomReason").value = "";
  $("#absenceInjuryDetailField").hidden = !isInjury;
  if (!isInjury) $("#absenceInjuryDetail").value = "";
  // Nur bei einer Verletzung darf das Enddatum offen bleiben (siehe absenceCoversDate).
  $("#absenceInjuryHint").hidden = !isInjury;
  $("#absenceToLabel").textContent = isInjury ? "Voraussichtlich bis" : "Bis";
  $("#absenceTo").required = !isInjury;
}

function resetAbsenceForm() {
  $("#absenceId").value = "";
  $("#absenceReason").value = "";
  $("#absenceCustomReason").value = "";
  $("#absenceFrom").value = "";
  $("#absenceTo").value = "";
  syncAbsenceReasonField();
}

function saveAbsence(event) {
  event.preventDefault();
  const playerId = $("#profilePlayer").value || state.players[0]?.id;
  if (!playerId) return;
  if (!confirmDespiteRevokedConsent([state.players.find((item) => item.id === playerId)].filter(Boolean), "Das Speichern von Verletzung/Abwesenheit")) return;
  state.absences ||= {};
  state.absences[playerId] ||= [];
  const id = $("#absenceId").value || `ab${crypto.randomUUID()}`;
  const reason = $("#absenceReason").value;
  const isInjury = reason === ABSENCE_INJURY_REASON;
  const label = reason === "Sonstiges" ? ($("#absenceCustomReason").value.trim() || "Sonstiges") : reason;
  const absence = {
    id,
    kind: isInjury ? "injury" : "absence",
    label,
    detail: isInjury ? $("#absenceInjuryDetail").value.trim() : "",
    from: $("#absenceFrom").value,
    to: $("#absenceTo").value
  };
  // "Bis" vor "Von" waere ein Eintrag, der nie wirkt (absenceCoversDate): nicht speichern.
  if (absence.from && absence.to && absence.to < absence.from) {
    const toField = $("#absenceTo");
    toField.setCustomValidity("Das Enddatum darf nicht vor dem Beginn liegen.");
    toField.reportValidity();
    toField.setCustomValidity("");
    return;
  }
  const existingIndex = state.absences[playerId].findIndex((item) => item.id === id);
  if (existingIndex >= 0) state.absences[playerId][existingIndex] = absence;
  else state.absences[playerId].push(absence);
  resetAbsenceForm();
  persist();
  cloudSaveAbsence(playerId, absence);
  reconcileAbsences();
  drawProfile();
}

function editAbsence(absenceId) {
  const playerId = $("#profilePlayer").value || state.players[0]?.id;
  const absence = state.absences?.[playerId]?.find((item) => item.id === absenceId);
  if (!absence) return;
  $("#absenceId").value = absence.id;
  const isInjury = isInjuryAbsence(absence);
  const isFixedReason = !isInjury && ABSENCE_FIXED_REASONS.includes(absence.label);
  $("#absenceReason").value = isInjury ? ABSENCE_INJURY_REASON : isFixedReason ? absence.label : "Sonstiges";
  $("#absenceCustomReason").value = isInjury || isFixedReason ? "" : absence.label;
  // Aeltere Verletzungen standen als Freitext im Label - der wandert beim Bearbeiten
  // in die Detailzeile, damit er beim Speichern nicht verloren geht.
  $("#absenceInjuryDetail").value = isInjury ? (absence.detail || absence.label.replace(/^verletzung\s*[:·-]?\s*/i, "")) : "";
  syncAbsenceReasonField();
  $("#absenceFrom").value = absence.from;
  $("#absenceTo").value = absence.to;
}

function deleteAbsence(absenceId) {
  const playerId = $("#profilePlayer").value || state.players[0]?.id;
  if (!playerId) return;
  if (!confirm("Diesen Eintrag wirklich löschen?")) return;
  state.absences ||= {};
  state.absences[playerId] = (state.absences?.[playerId] || []).filter((item) => item.id !== absenceId);
  persist();
  cloudDeleteAbsence(playerId, absenceId);
  reconcileAbsences();
  drawProfile();
}

function renderMeasurementList(playerId) {
  const measurements = [...playerMeasurements(playerId)].reverse();
  $("#measurementList").innerHTML = measurements.map((measurement) => {
    const bmi = calculateBmi(measurement.height, measurement.weight);
    return `
      <article class="development-item">
        <div>
          <strong>${formatDate(measurement.date)}</strong>
          <p>${measurement.height || "–"} cm · ${measurement.weight || "–"} kg${bmi ? ` · BMI ${roundGrade(bmi)}` : ""}</p>
        </div>
        ${canManageRecords() ? `<div class="row-actions">
          <button class="ghost-button" data-action="edit-measurement" data-id="${measurement.id}" type="button">Bearbeiten</button>
          <button class="ghost-button danger" data-action="delete-measurement" data-id="${measurement.id}" type="button">Löschen</button>
        </div>` : ""}
      </article>
    `;
  }).join("") || `<p class="muted">Noch keine Messwerte für diesen Spieler eingetragen.</p>`;
}

function resetMeasurementForm() {
  $("#measurementId").value = "";
  $("#measurementDate").valueAsDate = new Date();
  $("#measurementHeight").value = "";
  $("#measurementWeight").value = "";
}

function saveMeasurement(event) {
  event.preventDefault();
  const playerId = $("#profilePlayer").value || state.players[0]?.id;
  if (!playerId) return;
  if (!confirmDespiteRevokedConsent([state.players.find((item) => item.id === playerId)].filter(Boolean), "Das Speichern des Messwerts")) return;
  state.measurements ||= {};
  state.measurements[playerId] ||= [];
  const id = $("#measurementId").value || `me${crypto.randomUUID()}`;
  const measurement = {
    id,
    date: $("#measurementDate").value,
    height: $("#measurementHeight").value,
    weight: $("#measurementWeight").value
  };
  const existingIndex = state.measurements[playerId].findIndex((item) => item.id === id);
  if (existingIndex >= 0) state.measurements[playerId][existingIndex] = measurement;
  else state.measurements[playerId].push(measurement);
  resetMeasurementForm();
  persist();
  cloudSaveMeasurement(playerId, measurement);
  drawProfile();
  renderSquad();
}

function editMeasurement(measurementId) {
  const playerId = $("#profilePlayer").value || state.players[0]?.id;
  const measurement = state.measurements?.[playerId]?.find((item) => item.id === measurementId);
  if (!measurement) return;
  $("#measurementId").value = measurement.id;
  $("#measurementDate").value = measurement.date;
  $("#measurementHeight").value = measurement.height;
  $("#measurementWeight").value = measurement.weight;
}

function deleteMeasurement(measurementId) {
  const playerId = $("#profilePlayer").value || state.players[0]?.id;
  if (!playerId) return;
  if (!confirm("Diese Messung wirklich löschen?")) return;
  state.measurements ||= {};
  state.measurements[playerId] = (state.measurements?.[playerId] || []).filter((item) => item.id !== measurementId);
  persist();
  cloudDeleteMeasurement(playerId, measurementId);
  drawProfile();
  renderSquad();
}

function goToMeasurementForm(playerId) {
  $("#profilePlayer").value = playerId;
  setView("profiles");
  resetMeasurementForm();
  const panel = $("#measurementPanel");
  if (panel) panel.open = true;
  panel?.scrollIntoView({ behavior: "smooth", block: "center" });
  $("#measurementHeight").focus();
}

function renderMeasurementChart(player) {
  const canvas = $("#measurementChart");
  if (!canvas) return;
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const entries = (player ? playerMeasurements(player.id) : [])
    .filter((item) => item.height && item.weight && new Date(`${item.date}T00:00:00`) >= oneYearAgo);

  const chart = setupChartCanvas(canvas, (width) => (width < 520 ? Math.round(width * 0.86) : Math.round(width / 2.6)));
  const { ctx, width, height, palette, compact } = chart;
  const font = chartFonts(compact);
  const title = player ? `${player.name} · Größe, Gewicht, BMI` : "Größe, Gewicht, BMI";

  ctx.fillStyle = palette.ink;
  ctx.font = font.title;
  ctx.fillText(title, 12, compact ? 18 : 24);

  if (entries.length < 2) {
    const text = "Noch nicht genug Messwerte der letzten 12 Monate für einen Verlauf (mindestens 2 nötig).";
    drawChartPlaceholder(chart, text);
    describeChart(canvas, `${title}: ${text}`);
    return;
  }

  const last = entries[entries.length - 1];
  const lastBmi = calculateBmi(last.height, last.weight);
  const series = [
    { label: `Größe ${last.height} cm`, short: "Größe", unit: "cm", color: palette.series[0], shape: "circle", values: entries.map((item) => Number(item.height)) },
    { label: `Gewicht ${last.weight} kg`, short: "Gewicht", unit: "kg", color: palette.series[1], shape: "square", values: entries.map((item) => Number(item.weight)) },
    { label: `BMI ${gradeLabel(lastBmi ? roundGrade(lastBmi) : null)}`, short: "BMI", unit: "", color: palette.series[2], shape: "diamond", values: entries.map((item) => calculateBmi(item.height, item.weight)) }
  ];

  const legendBaseline = drawChartLegend(chart, series, 12, compact ? 38 : 48);
  const left = 18;
  const right = width - 18;
  const top = legendBaseline + 18;
  const bottom = height - (compact ? 24 : 30);
  const span = Math.max(entries.length - 1, 1);

  // Dezente Hilfslinien; jede Reihe nutzt ihre eigene Skala (Hoehe, Gewicht und BMI liegen weit auseinander).
  ctx.strokeStyle = palette.line;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 5]);
  for (let step = 0; step <= 3; step += 1) {
    const y = top + (step * (bottom - top)) / 3;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  const hits = entries.map((entry, index) => ({ x: left + (index * (right - left)) / span, entry, index }));
  series.forEach((item) => {
    const min = Math.min(...item.values);
    const max = Math.max(...item.values);
    const range = max - min || 1;
    const points = entries.map((entry, index) => ({
      x: left + (index * (right - left)) / span,
      y: bottom - ((item.values[index] - min) / range) * (bottom - top)
    }));
    ctx.strokeStyle = item.color;
    ctx.lineWidth = compact ? 2.25 : 3;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    chartSmoothPath(ctx, points);
    ctx.stroke();
    points.forEach((point) => {
      ctx.fillStyle = palette.surface;
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 2.25;
      chartMarker(ctx, item.shape, point.x, point.y, compact ? 3.5 : 4.5);
      ctx.fill();
      ctx.stroke();
    });
  });

  const labelStep = Math.max(1, Math.ceil(entries.length / Math.max(1, Math.floor((right - left) / (compact ? 46 : 70)))));
  ctx.font = font.label;
  ctx.fillStyle = palette.muted;
  ctx.textAlign = "center";
  const labelled = chartLabelIndices(entries.length, labelStep);
  entries.forEach((entry, index) => {
    if (!labelled.has(index)) return;
    const x = left + (index * (right - left)) / span;
    ctx.fillText(entry.date.slice(0, 7), Math.min(Math.max(x, left + 16), right - 16), bottom + (compact ? 15 : 19));
  });
  ctx.textAlign = "left";

  const describe = (index) => `${entries[index].date}: Größe ${entries[index].height} cm, Gewicht ${entries[index].weight} kg, BMI ${gradeLabel(series[2].values[index] ? roundGrade(series[2].values[index]) : null)}`;
  describeChart(
    canvas,
    chartSummary(`${title} (letzte 12 Monate)`, entries.map((_, index) => describe(index))),
    hits.map(({ x, index }) => ({
      ax: x,
      ay: top,
      test: (px) => Math.abs(px - x) <= Math.max((right - left) / span / 2, 12),
      text: describe(index)
    }))
  );
}

// Einwilligung (SCRUM-51): "widerrufen" warnt deutlich, blockiert aber nichts. "Noch offen" und
// "dokumentiert" verhalten sich gleich und zeigen keine Warnung.
function isConsentRevoked(player) {
  return player?.consentStatus === "revoked";
}

function consentRevokedMessage(player) {
  return `Die Datennutzung für ${player?.name || "diesen Spieler"} wurde widerrufen. Bitte Daten prüfen und nur weiter erfassen oder weitergeben, wenn dafür eine andere Rechtsgrundlage besteht.`;
}

// Fragt vor dem Erfassen/Einladen/Exportieren nach, wenn die Einwilligung widerrufen ist. Gibt false zurück,
// wenn der Trainer abbricht; es wird nie ohne seine Bestätigung etwas gesperrt oder erzwungen.
function confirmDespiteRevokedConsent(players, action) {
  const revoked = players.filter(isConsentRevoked);
  if (!revoked.length) return true;
  const names = revoked.map((player) => player.name).join(", ");
  const text = revoked.length === 1
    ? `${consentRevokedMessage(revoked[0])}\n\n${action} trotzdem fortsetzen?`
    : `Für ${revoked.length} Spieler (${names}) wurde die Datennutzung widerrufen. Bitte Daten prüfen.\n\n${action} trotzdem fortsetzen?`;
  return confirm(text);
}

function consentChipHtml(player) {
  return isConsentRevoked(player) ? `<span class="consent-chip" title="${escapeHtml(consentRevokedMessage(player))}">⚠ Einwilligung widerrufen</span>` : "";
}

function renderProfileHeader(player, ratings) {
  const average = playerAverageGrade(player?.id);
  if (currentRole === "scout") {
    $("#profileHeader").innerHTML = player ? `
      <div class="profile-card">
        <div class="profile-number">${escapeHtml(String(player.number ?? ""))}</div>
        <div>
          <strong>${escapeHtml(player.name)}</strong>
          <span>${escapeHtml(positionText(player))} · ${formatDate(player.birthdate)} · ${ageFromBirthdate(player.birthdate) ?? "-"} Jahre</span>
        </div>
        <div class="profile-grade">
          <span>Ø Note</span>
          <strong>${gradeLabel(average)}</strong>
        </div>
      </div>
    ` : `<p class="muted">Noch kein Spieler vorhanden.</p>`;
    return;
  }
  const risk = player ? playerInjuryRisk(player.id) : null;
  const effectiveStatus = player ? playerEffectiveStatus(player) : null;
  $("#profileHeader").innerHTML = player ? `
    <div class="profile-card">
      <div class="profile-number">${player.number}</div>
      <div>
        <strong>${escapeHtml(player.name)}</strong>
        <span>${escapeHtml(positionText(player))} · ${formatDate(player.birthdate)} · ${ageFromBirthdate(player.birthdate) ?? "-"} Jahre · ${escapeHtml(effectiveStatus)}${effectiveStatus === "Verletzt" && player.injuryUntil ? ` (ca. bis ${formatDate(player.injuryUntil)})` : ""}</span>
        <small class="muted">Datennutzung: ${player.consentStatus === "granted" ? `dokumentiert${player.consentDate ? ` am ${formatDate(player.consentDate)}` : ""}` : player.consentStatus === "revoked" ? "widerrufen" : "noch offen"}</small>
        ${isConsentRevoked(player) ? `<p class="consent-warning" role="alert">${escapeHtml(consentRevokedMessage(player))}</p>` : ""}
      </div>
      <div class="profile-grade">
        <span>Ø Note</span>
        <strong>${gradeLabel(average)}</strong>
      </div>
      <div class="risk-panel">
        <div>
          <span>Belastung</span>
          <strong><span class="risk-pill ${risk.tier}">${risk.level}</span></strong>
        </div>
        <small>${escapeHtml(risk.reason)}</small>
        <div class="risk-compare">
          <div><span>Belastung letzte 7 Tage</span><strong>${risk.load}</strong></div>
          <div><span>Schnitt der 3 Wochen davor</span><strong>${risk.baseline}</strong></div>
        </div>
        <small>Belastung je Termin = Minuten × Anstrengung (0–10). ${escapeHtml(risk.action)}</small>
        <small>Verfügbarkeit: <b>${risk.availability.label}</b>${risk.availability.action ? ` – ${escapeHtml(risk.availability.action)}` : ""}</small>
      </div>
    </div>
  ` : `<p class="muted">Noch kein Spieler vorhanden.</p>`;
}

function renderProfileChart(player, ratings) {
  drawGradeTrendChart(
    $("#trendChart"),
    player ? `${player.name} · Notenentwicklung` : "Notenentwicklung",
    ratings.map((item) => ({ label: item.event.date.slice(5), detail: `${item.event.title} (${item.event.date})`, grade: Number(item.rating.grade), kind: item.event.type })),
    "Noch keine benoteten Events vorhanden."
  );
}

function renderProfileHistory(ratings) {
  $("#profileHistory").innerHTML = ratings.map(({ event, rating }) => `
    <article class="record-item">
      <div>
        <strong>${escapeHtml(event.title)}</strong>
        <small>${escapeHtml(event.date)} · ${escapeHtml(event.type)}${gameResult(event) ? ` · ${gameResult(event).goalsFor}:${gameResult(event).goalsAgainst}` : ""} · Anstrengung ${exertionLabel(eventExertion(event))} · Note ${rating.grade}</small>
        <p class="muted">${escapeHtml(rating.note || event.notes || "Keine Notiz")}</p>
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
  if (currentRole === "scout") { $("#profileAvailabilityBars").innerHTML = ""; return; }
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
  const scout = currentRole === "scout";
  const risk = scout ? null : playerInjuryRisk(playerId);
  const recentIntensity = ratings.slice(-3).map((item) => eventExertion(item.event));
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
    ...(scout ? [] : [["Belastung", risk.level]]),
    ["Ø Anstrengung zuletzt", avgIntensity ? avgIntensity.toFixed(1).replace(".", ",") : "-"],
    ["Entwicklung Saison", development === null ? "-" : `${development > 0 ? "+" : ""}${gradeLabel(development)}`],
    ["Bestes Event", bestEvent ? `${gradeLabel(bestEvent.rating.grade)} · ${escapeHtml(bestEvent.event.type)}` : "-"],
    ["Einsatzquote", `${gameStats.appearanceRate}%`],
    ["Scorer/Spiel", statLabel(gameStats.scorersPerGame)],
    ["Tore + Vorlagen", `${gameStats.goals} + ${gameStats.assists}`],
    ["Min./Spiel", gameStats.minutesPerGame || "-"],
    ["Min./Scorerpunkt", gameStats.minutesPerScorer ?? "-"]
  ];
  $("#analyticsCards").innerHTML = cards.map(([label, value]) => `<article class="insight-card"><span class="muted">${label}</span><strong>${value}</strong></article>`).join("");
}

function downloadProfilePdf() {
  // Das Profil-PDF enthaelt Belastung/Verfuegbarkeit - fuer Scouts gibt es keinen Export (SCRUM-170).
  if (currentRole === "scout") return;
  const playerId = $("#profilePlayer").value || state.players[0]?.id;
  const player = state.players.find((item) => item.id === playerId);
  if (!player) return;
  const ratings = playerRatings(playerId).sort((a, b) => new Date(a.event.date) - new Date(b.event.date));
  const average = playerAverageGrade(playerId);
  const gameStats = playerGameStats(playerId);
  const risk = playerInjuryRisk(playerId);
  const logoUrl = new URL("./assets/club-logo.png", window.location.href).href;
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
        <td>${escapeHtml(event.type)}</td>
        <td>${gradeLabel(rating.grade)}</td>
      </tr>
    `).join("");
  const report = window.open("", "_blank");
  if (!report) return;
  // Der Bericht soll nicht auf die App zurückgreifen können (SCRUM-62); "noopener" ginge hier nicht,
  // weil window.open dann null liefert und wir nicht mehr hineinschreiben könnten.
  report.opener = null;
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
            <p class="muted">${escapeHtml(window.TEAMKOMPASS_CONFIG?.teamName || "TeamKompass")} · Spielerprofil</p>
            <h1>${escapeHtml(player.name)}</h1>
            <div class="muted">Nr. ${player.number} · ${escapeHtml(positionText(player))} · ${formatDate(player.birthdate)} · ${escapeHtml(playerEffectiveStatus(player))}</div>
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
        <section class="load-box">
          <h2>Belastung</h2>
          <p><strong>${risk.level}</strong> · ${escapeHtml(risk.reason)}</p>
          <table>
            <thead><tr><th>Belastung letzte 7 Tage</th><th>Schnitt der 3 Wochen davor</th><th>Verfügbarkeit</th></tr></thead>
            <tbody><tr><td>${risk.load}</td><td>${risk.baseline}</td><td>${risk.availability.label}${risk.availability.action ? ` – ${escapeHtml(risk.availability.action)}` : ""}</td></tr></tbody>
          </table>
          <p class="muted">Belastung je Termin = Minuten × Anstrengung (0–10).</p>
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
    .filter(({ risk }) => risk.tier !== "unauffaellig")
    .sort((a, b) => (LOAD_TIER_RANK[b.risk.tier] - LOAD_TIER_RANK[a.risk.tier]) || (b.risk.load - a.risk.load))
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
    ["Ø Anstrengung", stats.avgIntensity ? stats.avgIntensity.toFixed(1).replace(".", ",") : "-"],
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
      ${topPlayers.map(({ player, grade }) => `<span>${escapeHtml(player.name)} · Note ${gradeLabel(grade)}</span>`).join("") || "<span>Noch keine Bewertungen.</span>"}
    </article>
    <article class="team-insight">
      <strong>Belastung im Blick</strong>
      ${highRisk.map(({ player, risk }) => `<span>${escapeHtml(player.name)} · ${risk.level}${risk.reason ? ` · ${escapeHtml(risk.reason)}` : ""}</span>`).join("") || "<span>Keine Auffälligkeiten.</span>"}
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
  const palette = chartPalette();
  const gameColor = palette.series[3];
  const trainingColor = palette.series[1];
  const entries = [...state.events]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((event) => ({ event, grade: teamAverageGradeForEvent(event) }))
    .filter((item) => item.grade)
    .map((item) => ({
      label: item.event.date.slice(5),
      detail: `${item.event.title} (${item.event.date})`,
      grade: Number(item.grade),
      kind: item.event.type === "Spiel" ? "Spiel" : "Training",
      color: item.event.type === "Spiel" ? gameColor : trainingColor,
      shape: item.event.type === "Spiel" ? "diamond" : "circle"
    }));
  drawGradeTrendChart($("#teamTrendChart"), "Teamnoten nach Event", entries, "Noch keine Teamnoten vorhanden.", {
    legend: [
      { label: "Spiel", color: gameColor, shape: "diamond" },
      { label: "Training", color: trainingColor, shape: "circle" }
    ]
  });
}

function drawBirthQuarterChart() {
  const counts = birthQuarterCounts();
  drawBarChart($("#birthQuarterChart"), Object.entries(counts).map(([label, value]) => ({ label, value })), "Geborene Spieler je Quartal", chartPalette().series[0]);
}

function drawPositionCoverageChart() {
  const rows = positionCoverage().slice(0, 10).map(([label, value]) => ({ label, value }));
  drawBarChart($("#positionCoverageChart"), rows, "Positionsabdeckung", chartPalette().series[1]);
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
  if (!canvas) return;
  const chart = setupChartCanvas(canvas, (width) =>
    (width < 520 ? 56 + 2 * 82 + rows.length * 34 : 60 + 2 * 96 + 20));
  const { ctx, width, height, palette, compact } = chart;
  const font = chartFonts(compact);
  const colors = palette.series;
  const shapes = ["circle", "square", "diamond", "triangle"];
  const total = rows.reduce((sum, row) => sum + row.value, 0);

  ctx.fillStyle = palette.ink;
  ctx.font = font.title;
  ctx.fillText(title, 12, compact ? 19 : 26);

  if (!total) {
    drawChartPlaceholder(chart, "Noch keine Trainings angelegt.");
    describeChart(canvas, `${title}: Noch keine Trainings angelegt.`);
    return;
  }

  // Schmal: Ring oben, Legende darunter. Breit: Ring links, Legende rechts.
  const radius = compact ? Math.min(width * 0.26, 82) : 96;
  const centerX = compact ? width / 2 : 20 + radius;
  const centerY = compact ? 40 + radius : height / 2 + 12;
  const thickness = Math.round(radius * 0.38);
  const slices = [];

  const visible = rows.filter((row) => row.value > 0);
  let startAngle = -Math.PI / 2;
  rows.forEach((row, index) => {
    if (!row.value) return;
    const slice = (row.value / total) * Math.PI * 2;
    const gap = visible.length > 1 ? 0.035 : 0;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius - thickness / 2, startAngle + gap, startAngle + slice - gap);
    ctx.strokeStyle = colors[index % colors.length];
    ctx.lineWidth = thickness;
    ctx.lineCap = "butt";
    ctx.stroke();
    slices.push({ row, index, from: startAngle, to: startAngle + slice });
    startAngle += slice;
  });

  ctx.fillStyle = palette.ink;
  ctx.font = compact ? "700 22px system-ui" : "700 28px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(String(total), centerX, centerY + (compact ? 4 : 5));
  ctx.fillStyle = palette.muted;
  ctx.font = font.label;
  ctx.fillText("Trainings", centerX, centerY + (compact ? 18 : 22));
  ctx.textAlign = "left";

  const legendX = compact ? 14 : centerX + radius + 28;
  const legendTop = compact ? centerY + radius + 26 : centerY - ((rows.length - 1) * 46) / 2;
  const legendStep = compact ? 34 : 46;

  rows.forEach((row, index) => {
    const y = legendTop + index * legendStep;
    const percentage = Math.round((row.value / total) * 100);
    ctx.fillStyle = colors[index % colors.length];
    chartMarker(ctx, shapes[index % shapes.length], legendX + 6, y - 6, 5.5);
    ctx.fill();
    ctx.fillStyle = palette.ink;
    ctx.font = font.value;
    ctx.fillText(row.label, legendX + 21, y, width - legendX - 30);
    ctx.fillStyle = palette.muted;
    ctx.font = font.legend;
    ctx.fillText(`${row.value} Einheiten · ${percentage}%`, legendX + 21, y + 15, width - legendX - 30);
  });

  describeChart(
    canvas,
    chartSummary(title, rows.map((row) => `${row.label} ${row.value} Einheiten (${Math.round((row.value / total) * 100)}%)`)),
    slices.map(({ row, from, to }) => {
      const middle = (from + to) / 2;
      return {
        ax: centerX + Math.cos(middle) * (radius - thickness / 2),
        ay: centerY + Math.sin(middle) * (radius - thickness / 2),
        test: (x, y) => {
          const distance = Math.hypot(x - centerX, y - centerY);
          if (distance < radius - thickness - 4 || distance > radius + 6) return false;
          let angle = Math.atan2(y - centerY, x - centerX);
          if (angle < -Math.PI / 2) angle += Math.PI * 2;
          return angle >= from && angle <= to;
        },
        text: `${row.label}: ${row.value} Einheiten (${Math.round((row.value / total) * 100)}%)`
      };
    })
  );
}

function drawBarChart(canvas, rows, title, color) {
  if (!canvas) return;
  const barHeight = 20;
  const barGap = 11;
  const headHeight = 42;
  const chart = setupChartCanvas(canvas, () => headHeight + Math.max(rows.length, 1) * (barHeight + barGap) + 8);
  const { ctx, width, palette, compact } = chart;
  const font = chartFonts(compact);

  ctx.fillStyle = palette.ink;
  ctx.font = font.title;
  ctx.fillText(title, 12, compact ? 19 : 24);

  if (!rows.length) {
    drawChartPlaceholder(chart, "Noch keine Daten vorhanden.");
    describeChart(canvas, `${title}: Noch keine Daten vorhanden.`);
    return;
  }

  // Beschriftungsspalte an den laengsten Eintrag anpassen, aber gedeckelt.
  ctx.font = font.label;
  const labelWidth = Math.min(
    Math.max(...rows.map((row) => ctx.measureText(row.label).width)) + 12,
    Math.round(width * 0.34)
  );
  const valueWidth = 30;
  const trackLeft = 12 + labelWidth;
  const trackRight = width - 12 - valueWidth;
  const max = Math.max(...rows.map((row) => row.value), 1);
  const hits = [];

  rows.forEach((row, index) => {
    const y = headHeight + index * (barHeight + barGap);
    ctx.fillStyle = palette.muted;
    ctx.font = font.label;
    ctx.textAlign = "left";
    ctx.fillText(row.label, 12, y + barHeight / 2 + 3.5, labelWidth - 10);

    ctx.fillStyle = palette.soft;
    chartRoundRect(ctx, trackLeft, y, Math.max(trackRight - trackLeft, 1), barHeight, barHeight / 2);
    ctx.fill();
    if (row.value) {
      const barWidth = Math.max((row.value / max) * (trackRight - trackLeft), barHeight);
      ctx.fillStyle = color;
      chartRoundRect(ctx, trackLeft, y, barWidth, barHeight, barHeight / 2);
      ctx.fill();
    }

    ctx.fillStyle = palette.ink;
    ctx.font = font.value;
    ctx.textAlign = "right";
    ctx.fillText(String(row.value), width - 12, y + barHeight / 2 + 4);
    hits.push({
      ax: trackLeft + Math.max((row.value / max) * (trackRight - trackLeft), barHeight) / 2,
      ay: y,
      test: (px, py) => py >= y - barGap / 2 && py <= y + barHeight + barGap / 2,
      text: `${row.label}: ${row.value}`
    });
  });
  ctx.textAlign = "left";
  describeChart(canvas, chartSummary(title, rows.map((row) => `${row.label} ${row.value}`)), hits);
}

function exportData() {
  if (!canManageRecords()) return;
  if (!confirmDespiteRevokedConsent(state.players, "Der Export")) return;
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `teamkompass-export-${localIsoDate()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

// BACKUP-IMPORT START (reine Funktionen ohne Zugriff auf Seitenzustand, getestet in tests/backup-import.test.mjs)
const BACKUP_ID_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;

function isBackupId(id) {
  return typeof id === "string" && BACKUP_ID_PATTERN.test(id) && id !== "." && id !== ".." && !/^__.*__$/.test(id);
}

// Prueft eine eingelesene Export-Datei streng. Anders als normalizeState() faellt sie nie auf die
// Beispieldaten zurueck: eine falsche Datei darf nichts ueberschreiben.
function validateBackupData(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Die Datei ist kein TeamKompass-Export." };
  if (!Array.isArray(raw.players) || !Array.isArray(raw.events)) return { ok: false, error: "In der Datei fehlen Spieler oder Events - sie stammt nicht aus „Daten exportieren“." };
  if (!raw.players.length) return { ok: false, error: "Die Datei enthält keine Spieler. Es wurde nichts geändert." };
  const collections = ["developmentPlans", "absences", "measurements"];
  for (const player of raw.players) {
    if (!player || typeof player !== "object" || !isBackupId(player.id) || typeof player.name !== "string") return { ok: false, error: "Mindestens ein Spieler in der Datei ist unvollständig oder hat eine ungültige ID." };
  }
  for (const event of raw.events) {
    if (!event || typeof event !== "object" || !isBackupId(event.id)) return { ok: false, error: "Mindestens ein Event in der Datei ist unvollständig oder hat eine ungültige ID." };
    for (const key of ["ratings", "privateNotes"]) {
      const map = event[key];
      if (map === undefined) continue;
      if (!map || typeof map !== "object" || Array.isArray(map) || !Object.keys(map).every(isBackupId) || !Object.values(map).every((value) => (key === "ratings" ? value && typeof value === "object" && !Array.isArray(value) : typeof value === "string"))) return { ok: false, error: "Mindestens ein Event enthält ungültige Bewertungen." };
    }
  }
  for (const name of collections) {
    const group = raw[name];
    if (group === undefined) continue;
    if (!group || typeof group !== "object" || Array.isArray(group)) return { ok: false, error: "Die Datei enthält ungültige Förderpläne, Abwesenheiten oder Messungen." };
    for (const [playerId, items] of Object.entries(group)) {
      if (!isBackupId(playerId) || !Array.isArray(items) || items.some((item) => !item || typeof item !== "object" || (item.id !== undefined && !isBackupId(item.id)))) return { ok: false, error: "Die Datei enthält ungültige Förderpläne, Abwesenheiten oder Messungen." };
    }
  }
  if (raw.opponents !== undefined && (!Array.isArray(raw.opponents) || raw.opponents.some((item) => !item || typeof item !== "object" || (item.id !== undefined && !isBackupId(item.id))))) return { ok: false, error: "Die Datei enthält ungültige Gegner." };
  return { ok: true };
}

// Fuehrt ein (normalisiertes) Backup in den aktuellen Stand ein: gleiche IDs werden ueberschrieben,
// neue ergaenzt, alles andere bleibt unangetastet. Es wird nie etwas geloescht.
function mergeBackupState(current, incoming) {
  const byId = (list) => new Map(list.map((item) => [item.id, item]));
  const mergeList = (base, extra) => {
    const map = byId(base);
    extra.forEach((item) => map.set(item.id, item));
    return [...map.values()];
  };
  const mergeGroups = (base = {}, extra = {}) => {
    const result = { ...base };
    Object.entries(extra).forEach(([playerId, items]) => {
      result[playerId] = mergeList(base[playerId] || [], items);
    });
    return result;
  };
  const existingEvents = byId(current.events);
  const events = mergeList(current.events, incoming.events.map((event) => {
    const old = existingEvents.get(event.id);
    return old ? { ...event, ratings: { ...old.ratings, ...event.ratings }, privateNotes: { ...old.privateNotes, ...event.privateNotes } } : event;
  }));
  const incomingHasLineup = Object.values(incoming.lineup?.assignments || {}).some((ids) => ids.length);
  return {
    ...current,
    players: mergeList(current.players, incoming.players),
    events,
    developmentPlans: mergeGroups(current.developmentPlans, incoming.developmentPlans),
    absences: mergeGroups(current.absences, incoming.absences),
    measurements: mergeGroups(current.measurements, incoming.measurements),
    opponents: mergeList(current.opponents || [], incoming.opponents || []),
    lineup: incomingHasLineup ? incoming.lineup : current.lineup
  };
}

// Zaehlt fuer die Sicherheitsabfrage, was das Backup neu anlegt und was es ueberschreibt.
function summarizeBackupImport(current, incoming) {
  const split = (base, extra) => {
    const ids = new Set(base.map((item) => item.id));
    const overwritten = extra.filter((item) => ids.has(item.id)).length;
    return { created: extra.length - overwritten, overwritten };
  };
  const nested = (baseGroups = {}, extraGroups = {}) => {
    const total = { created: 0, overwritten: 0 };
    Object.entries(extraGroups).forEach(([playerId, items]) => {
      const part = split(baseGroups[playerId] || [], items);
      total.created += part.created;
      total.overwritten += part.overwritten;
    });
    return total;
  };
  const ratingCount = (events) => events.reduce((sum, event) => sum + Object.keys(event.ratings || {}).length, 0);
  return {
    players: split(current.players, incoming.players),
    events: split(current.events, incoming.events),
    ratings: ratingCount(incoming.events),
    opponents: split(current.opponents || [], incoming.opponents || []),
    plans: nested(current.developmentPlans, incoming.developmentPlans),
    absences: nested(current.absences, incoming.absences),
    measurements: nested(current.measurements, incoming.measurements)
  };
}

// Schreibliste fuer die Cloud: dieselben Dokumente und Felder wie die einzelnen cloudSave*-Funktionen.
function backupCloudOperations(incoming) {
  const ops = [];
  incoming.players.forEach((player) => ops.push({ path: ["players", player.id], data: player, merge: true }));
  incoming.events.forEach((event) => {
    const { ratings, privateNotes, ...meta } = event;
    ops.push({ path: ["events", event.id], data: meta, merge: true });
    Object.entries(ratings || {}).forEach(([playerId, rating]) => ops.push({ path: ["events", event.id, "ratings", playerId], data: { ...rating, playerId }, merge: true }));
    Object.entries(privateNotes || {}).forEach(([playerId, note]) => ops.push({ path: ["events", event.id, "privateNotes", playerId], data: { playerId, note }, merge: true }));
  });
  [["developmentPlans", incoming.developmentPlans], ["absences", incoming.absences], ["measurements", incoming.measurements]].forEach(([name, groups]) => {
    Object.entries(groups || {}).forEach(([playerId, items]) => items.forEach((item) => ops.push({ path: ["players", playerId, name, item.id], data: { ...item, playerId }, merge: false })));
  });
  (incoming.opponents || []).forEach((opponent) => ops.push({ path: ["opponents", opponent.id], data: opponent, merge: false }));
  if (Object.values(incoming.lineup?.assignments || {}).some((ids) => ids.length)) ops.push({ path: ["meta", "lineup"], data: incoming.lineup, merge: false });
  return ops;
}
// BACKUP-IMPORT END

function backupSummaryText(summary) {
  const line = (label, part) => (part.created || part.overwritten ? `• ${label}: ${part.created} neu, ${part.overwritten} werden überschrieben\n` : "");
  return line("Spieler", summary.players) + line("Events", summary.events) + `• Bewertungen in den Events: ${summary.ratings}\n`
    + line("Gegner", summary.opponents) + line("Förderpläne", summary.plans) + line("Abwesenheiten", summary.absences) + line("Messungen", summary.measurements);
}

async function importBackupFile(file) {
  if (!file || !canManageRecords()) return;
  if (isCloudActive() && !legacyBlobMode && !isCloudTrainer()) return;
  let raw;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    alert("Die Datei konnte nicht gelesen werden. Bitte eine mit „Daten exportieren“ erstellte .json-Datei wählen.");
    return;
  }
  const check = validateBackupData(raw);
  if (!check.ok) {
    alert(`${check.error}\nEs wurde nichts geändert.`);
    return;
  }
  const incoming = normalizeState({ ...raw, opponents: Array.isArray(raw.opponents) ? raw.opponents : [], selectedEventId: state.selectedEventId });
  const summary = summarizeBackupImport(state, incoming);
  const overwrites = summary.players.overwritten + summary.events.overwritten + summary.opponents.overwritten + summary.plans.overwritten + summary.absences.overwritten + summary.measurements.overwritten;
  const warning = overwrites ? "\nAchtung: Vorhandene Einträge mit gleicher Kennung werden mit dem Stand aus dem Backup überschrieben. Tipp: vorher „Daten exportieren“, um den aktuellen Stand zu sichern." : "";
  if (!confirm(`Backup „${file.name}“ einspielen?\n\n${backupSummaryText(summary)}\nNichts wird gelöscht: Einträge, die nicht im Backup stehen, bleiben erhalten.${warning}`)) return;
  if (!isCloudActive() || legacyBlobMode) {
    state = normalizeState(mergeBackupState(state, incoming));
    persist();
    renderAll();
    alert("Backup eingespielt.");
    return;
  }
  try {
    setSyncState("pending", "Backup wird eingespielt …");
    const ops = backupCloudOperations(incoming);
    for (let offset = 0; offset < ops.length; offset += 450) {
      const batch = firestoreModule.writeBatch(firestoreDb);
      ops.slice(offset, offset + 450).forEach((op) => batch.set(teamDoc(...op.path), op.data, op.merge ? { merge: true } : {}));
      await batch.commit();
    }
    cloudWriteSucceeded();
    alert("Backup eingespielt. Die Daten erscheinen in wenigen Sekunden.");
  } catch (error) {
    cloudWriteFailed(error, "Backup konnte nicht vollständig eingespielt werden – bitte prüfen und ggf. erneut versuchen (bereits geschriebene Teile bleiben bestehen).");
  }
}

let opponentFilter = "";

function renderOpponentAnalysis() {
  const query = opponentFilter.trim().toLowerCase();
  const opponents = [...(state.opponents || [])]
    .filter((opponent) => !query || [opponent.name, opponent.formation, opponent.style].filter(Boolean).join(" ").toLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
  $("#opponentCount").textContent = `${opponents.length} Gegner`;
  $("#opponentList").innerHTML = opponents.map((opponent) => {
    const details = [
      opponent.strengths ? opponentDetail("Stärken", opponent.strengths) : "",
      opponent.weaknesses ? opponentDetail("Schwächen", opponent.weaknesses) : "",
      opponent.keyPlayers ? opponentDetail("Schlüsselspieler", opponent.keyPlayers) : "",
      opponent.setPieces ? opponentDetail("Standards", opponent.setPieces) : "",
      opponent.gamePlan ? opponentDetail("Matchplan", opponent.gamePlan) : "",
      opponent.notes ? opponentDetail("Notizen", opponent.notes) : ""
    ].join("");
    return `
    <article class="opponent-card">
      <div class="opponent-card-head">
        <div>
          <span class="event-type">${escapeHtml(opponent.style)}</span>
          <strong>${escapeHtml(opponent.name)}</strong>
          <small class="muted">${opponent.formation ? `Formation ${escapeHtml(opponent.formation)} · ` : ""}aktualisiert ${formatDate(opponent.updatedAt)}</small>
        </div>
        <div class="row-actions">
          <button class="ghost-button" data-action="edit-opponent" data-id="${opponent.id}" type="button">Bearbeiten</button>
          <button class="ghost-button danger" data-action="delete-opponent" data-id="${opponent.id}" type="button">Löschen</button>
        </div>
      </div>
      ${details ? `
      <details class="opponent-details-toggle">
        <summary>Details anzeigen</summary>
        <div class="opponent-detail-grid">${details}</div>
      </details>
      ` : ""}
    </article>
  `;
  }).join("") || `<p class="muted">${query ? "Kein Gegner gefunden." : "Noch keine Gegneranalyse angelegt."}</p>`;
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
    updatedAt: localIsoDate()
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
  // Ein vollstaendiger Durchlauf macht geplante und "veraltete" Ansichten hinfaellig.
  renderScheduler.clear();
  withRenderPass(() => {
    safeRender(renderMetrics, "Dashboard-Kennzahlen");
    safeRender(renderPitch, "Startelf");
    safeRender(renderLeaders, "Formkurve");
    safeRender(renderSelects, "Auswahllisten");
    safeRender(renderSquad, "Kader");
    safeRender(renderEvents, "Events");
    safeRender(drawProfile, "Spielerprofile");
    safeRender(renderOpponentAnalysis, "Gegneranalyse");
    safeRender(renderTeamAnalysis, "Teamanalyse");
  });
  document.dispatchEvent(new CustomEvent("teamkompass:render"));
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
on("#mobileViewSelect", "change", (event) => setView(event.target.value));
// Nach einem Wechsel zwischen Desktop und Mobil darf kein offenes Overlay zurueckbleiben.
window.matchMedia?.("(max-width: 720px)")?.addEventListener?.("change", closeActionMenu);
if ($("#moreNavTab") && $("#moreSheet")) {
  on("#moreNavTab", "click", () => $("#moreSheet").showModal());
  on("#moreSheet", "click", (event) => {
    if (event.target === $("#moreSheet") || event.target.closest(".nav-tab")) $("#moreSheet").close();
  });
}
let resizeRedrawTimer = null;
window.addEventListener("resize", () => {
  if (!isMobileViewport()) mobileAccordionsPrepared = false;
  prepareMobileAccordions();
  renderLeaders();
  // Die Formationsauswahl sieht je nach Geraeteklasse anders aus.
  if ($("#dashboardView")?.classList.contains("active")) renderFormationPicker();
  // Diagramme haengen an der Breite ihrer Zeichenflaeche und muessen nach
  // Drehen des Geraets bzw. Groessenaenderung neu gezeichnet werden.
  clearTimeout(resizeRedrawTimer);
  resizeRedrawTimer = setTimeout(() => {
    if ($("#profilesView")?.classList.contains("active")) drawProfile();
    if ($("#teamAnalysisView")?.classList.contains("active")) renderTeamAnalysis();
  }, 180);
});
on("#copyLineupBtn", "click", copyLineupFromPreviousGame);
on("#formationPicker", "click", (event) => {
  const button = event.target.closest(".formation-option");
  if (!button) return;
  applyFormationPreset(Number(button.dataset.formationIndex));
});

on("#pitch", "click", (event) => {
  const zoneEl = event.target.closest(".pitch-zone");
  if (!zoneEl) return;
  const chip = event.target.closest(".pitch-player");
  openPitchSubstituteDialog(zoneEl.dataset.zone, chip?.dataset.playerId || null);
});

// Startelf-Drag&Drop laeuft komplett ueber die Pointer Events API statt der
// nativen HTML5-Drag&Drop-API: Letztere feuert auf Touch-Geraeten (v.a. iOS
// Safari, aber auch inkonsistent auf Android) gar nicht oder nur unzuverlaessig,
// waehrend Pointer Events Maus, Touch und Stift einheitlich behandeln.
let pitchDrag = null;
let suppressNextPitchClick = false;
const PITCH_DRAG_THRESHOLD = 8;

function pitchZoneAt(x, y) {
  return document.elementFromPoint(x, y)?.closest(".pitch-zone") || null;
}

function pitchBenchAt(x, y) {
  return document.elementFromPoint(x, y)?.closest(".pitch-bench") || null;
}

function pitchChipAt(x, y) {
  return document.elementFromPoint(x, y)?.closest(".pitch-player, .bench-player") || null;
}

function clearPitchDragHighlights() {
  document.querySelectorAll(".pitch-zone.drag-over, .pitch-bench.drag-over").forEach((el) => el.classList.remove("drag-over"));
}

function beginPitchDragging() {
  const { sourceEl } = pitchDrag;
  pitchDrag.dragging = true;
  sourceEl.setPointerCapture(pitchDrag.pointerId);
  const rect = sourceEl.getBoundingClientRect();
  const ghost = sourceEl.cloneNode(true);
  ghost.classList.add("pitch-drag-ghost");
  ghost.style.width = `${rect.width}px`;
  document.body.appendChild(ghost);
  pitchDrag.ghost = ghost;
  pitchDrag.offsetX = pitchDrag.startX - rect.left;
  pitchDrag.offsetY = pitchDrag.startY - rect.top;
  sourceEl.classList.add("dragging-source");
  movePitchGhost(pitchDrag.startX, pitchDrag.startY);
}

function movePitchGhost(x, y) {
  const { ghost, offsetX, offsetY } = pitchDrag;
  ghost.style.left = `${x - offsetX}px`;
  ghost.style.top = `${y - offsetY}px`;
}

function applyPitchDrop(playerId, x, y) {
  const zoneEl = pitchZoneAt(x, y);
  const benchEl = !zoneEl ? pitchBenchAt(x, y) : null;
  if (!zoneEl && !benchEl) return;
  const targetChip = pitchChipAt(x, y);
  const targetPlayerId = targetChip?.dataset.playerId;
  if (targetPlayerId && targetPlayerId !== playerId) {
    swapPlayers(playerId, targetPlayerId);
  } else if (zoneEl) {
    movePlayerToZone(playerId, zoneEl.dataset.zone);
  } else {
    removePlayerFromPitch(playerId);
  }
}

function endPitchDrag(event, cancelled) {
  const { sourceEl, ghost, dragging, playerId } = pitchDrag;
  sourceEl.releasePointerCapture(event.pointerId);
  sourceEl.classList.remove("dragging-source");
  clearPitchDragHighlights();
  ghost?.remove();
  if (dragging) {
    suppressNextPitchClick = true;
    if (!cancelled) applyPitchDrop(playerId, event.clientX, event.clientY);
  }
  pitchDrag = null;
}

document.addEventListener("click", (event) => {
  if (!suppressNextPitchClick) return;
  suppressNextPitchClick = false;
  event.preventDefault();
  event.stopPropagation();
}, true);

document.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const chip = event.target.closest(".pitch-player, .bench-player");
  if (!chip || !chip.dataset.playerId) return;
  pitchDrag = {
    pointerId: event.pointerId,
    playerId: chip.dataset.playerId,
    sourceEl: chip,
    startX: event.clientX,
    startY: event.clientY,
    dragging: false,
    ghost: null
  };
});

document.addEventListener("pointermove", (event) => {
  if (!pitchDrag || event.pointerId !== pitchDrag.pointerId) return;
  if (!pitchDrag.dragging) {
    const distance = Math.hypot(event.clientX - pitchDrag.startX, event.clientY - pitchDrag.startY);
    if (distance < PITCH_DRAG_THRESHOLD) return;
    beginPitchDragging();
  }
  event.preventDefault();
  movePitchGhost(event.clientX, event.clientY);
  clearPitchDragHighlights();
  const zoneEl = pitchZoneAt(event.clientX, event.clientY);
  const targetEl = zoneEl || pitchBenchAt(event.clientX, event.clientY);
  targetEl?.classList.add("drag-over");
});

document.addEventListener("pointerup", (event) => {
  if (!pitchDrag || event.pointerId !== pitchDrag.pointerId) return;
  endPitchDrag(event, false);
});

document.addEventListener("pointercancel", (event) => {
  if (!pitchDrag || event.pointerId !== pitchDrag.pointerId) return;
  endPitchDrag(event, true);
});

on("#substituteSearch", "input", renderSubstituteList);
on("#closeSubstituteDialogBtn", "click", () => $("#substituteDialog").close());
on("#cancelSubstituteDialogBtn", "click", () => $("#substituteDialog").close());
on("#removeFromPitchBtn", "click", () => {
  if (pitchSubstituteTarget?.playerId) removePlayerFromPitch(pitchSubstituteTarget.playerId);
  $("#substituteDialog").close();
});
on("#substituteList", "click", (event) => {
  const button = event.target.closest(".substitute-option");
  if (!button || !pitchSubstituteTarget) return;
  const pickedId = button.dataset.playerId;
  if (pitchSubstituteTarget.playerId && pitchSubstituteTarget.playerId !== pickedId) {
    swapPlayers(pickedId, pitchSubstituteTarget.playerId);
  } else {
    movePlayerToZone(pickedId, pitchSubstituteTarget.zone);
  }
  $("#substituteDialog").close();
});

on("#searchInput", "input", renderSquad);
on("#positionFilter", "change", renderSquad);
on("#squadSort", "change", renderSquad);
on("#addPlayerTop", "click", () => openPlayerDialog());
on("#closeDialogBtn", "click", () => $("#playerDialog").close());
on("#cancelDialogBtn", "click", () => $("#playerDialog").close());
on("#playerForm", "submit", savePlayer);
on("#playerStatus", "change", syncPlayerInjuryField);
on("#positionOptions", "change", () => $("#playerCustomPositions").setCustomValidity(""));
on("#playerCustomPositions", "input", () => $("#playerCustomPositions").setCustomValidity(""));
on("#playerNumber", "input", () => $("#playerNumber").setCustomValidity(""));
on("#exportBtn", "click", exportData);
on("#importBtn", "click", () => $("#importFile").click());
on("#importFile", "change", (event) => {
  const [file] = event.target.files;
  event.target.value = "";
  importBackupFile(file);
});
on("#themeToggle", "click", toggleTheme);
on("#newEventBtn", "click", () => openEventDialog());
on("#heroEventBtn", "click", () => {
  setView("events");
  openEventDialog();
});
on("#heroAnalysisBtn", "click", () => setView("teamAnalysis"));
on("#quickEventBtn", "click", () => {
  setView("events");
  openEventDialog();
});
on("#quickPlayerBtn", "click", () => openPlayerDialog());
on("#quickProfileBtn", "click", () => setView("profiles"));
on("#quickOpponentBtn", "click", () => setView("opponents"));
on("#eventForm", "submit", saveEvent);
on("#eventType", "change", syncEventGameFields);
on("#closeEventDialogBtn", "click", () => $("#eventDialog").close());
on("#cancelEventDialogBtn", "click", () => $("#eventDialog").close());
on("#eventSelect", "change", (event) => {
  state.selectedEventId = event.target.value;
  persistLocalUiState();
  renderEvents();
});
on("#ratingFilter", "change", renderRatingTable);
on("#deleteEventBtn", "click", deleteSelectedEvent);
on("#editEventBtn", "click", () => {
  const event = selectedEvent();
  if (event) openEventDialog(event);
});
on("#selectedEventIntensity", "change", (event) => updateSelectedEventMeta("intensity", event.target.value));
on("#selectedTrainingDuration", "change", (event) => updateSelectedEventMeta("durationMinutes", event.target.value));
on("#selectedGoalsFor", "change", (event) => updateSelectedEventMeta("goalsFor", event.target.value));
on("#selectedGoalsAgainst", "change", (event) => updateSelectedEventMeta("goalsAgainst", event.target.value));
on("#selectedMatchDuration", "change", (event) => updateSelectedEventMeta("matchDuration", event.target.value));
on("#selectedTrainingFocus", "change", (event) => updateSelectedEventMeta("trainingFocus", event.target.value));
on("#profilePlayer", "change", () => {
  resetDevelopmentPlanForm();
  resetAbsenceForm();
  resetMeasurementForm();
  drawProfile();
});
on("#profilePdfBtn", "click", downloadProfilePdf);
on("#developmentPlanForm", "submit", saveDevelopmentPlan);
on("#cancelDevelopmentPlanBtn", "click", resetDevelopmentPlanForm);
on("#absenceForm", "submit", saveAbsence);
on("#cancelAbsenceBtn", "click", resetAbsenceForm);
on("#absenceReason", "change", syncAbsenceReasonField);
on("#measurementForm", "submit", saveMeasurement);
on("#cancelMeasurementBtn", "click", resetMeasurementForm);
on("#opponentForm", "submit", saveOpponent);
on("#cancelOpponentBtn", "click", resetOpponentForm);
on("#opponentSearch", "input", (event) => {
  opponentFilter = event.target.value;
  renderOpponentAnalysis();
});

on("#developmentPlanList", "click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.action === "edit-plan") editDevelopmentPlan(button.dataset.id);
  if (button.dataset.action === "delete-plan") deleteDevelopmentPlan(button.dataset.id);
});
on("#developmentPlanList", "submit", saveSelfReflection);

on("#absenceList", "click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.action === "edit-absence") editAbsence(button.dataset.id);
  if (button.dataset.action === "delete-absence") deleteAbsence(button.dataset.id);
});

on("#opponentList", "click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.action === "edit-opponent") editOpponent(button.dataset.id);
  if (button.dataset.action === "delete-opponent") deleteOpponent(button.dataset.id);
});

on("#measurementList", "click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.action === "edit-measurement") editMeasurement(button.dataset.id);
  if (button.dataset.action === "delete-measurement") deleteMeasurement(button.dataset.id);
});

function handleSquadActionClick(event) {
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
  if (button.dataset.action === "add-measurement" && player) goToMeasurementForm(player.id);
  if (button.dataset.action === "delete" && player) {
    if (!confirm(`"${player.name}" wirklich löschen? Alle Bewertungen, der Förderplan sowie die Abwesenheiten und Verletzungen dieses Spielers gehen verloren.`)) return;
    cloudDeletePlayer(player.id);
    state.players = state.players.filter((item) => item.id !== player.id);
    state.events.forEach((item) => delete item.ratings?.[player.id]);
    delete state.developmentPlans?.[player.id];
    delete state.absences?.[player.id];
    delete state.measurements?.[player.id];
    persist();
    renderAll();
  }
}
on("#playerTable", "click", handleSquadActionClick);
on("#playerCardsMobile", "click", handleSquadActionClick);
on("#addPlayerFabMobile", "click", () => openPlayerDialog());

function resetEventFilter() {
  eventFilter = { query: "", type: "all" };
  if ($("#eventSearch")) $("#eventSearch").value = "";
  if ($("#eventTypeFilter")) $("#eventTypeFilter").value = "all";
  renderEvents();
}

function handleEventListClick(event) {
  if (event.target.closest("[data-reset-event-filter]")) { resetEventFilter(); return; }
  const card = event.target.closest("[data-event-id]");
  if (!card) return;
  state.selectedEventId = card.dataset.eventId;
  persistLocalUiState();
  renderEvents();
  setEventStep("rate");
}

on("#eventList", "click", handleEventListClick);
on("#pastEventsList", "click", handleEventListClick);
on("#eventsBackBtn", "click", () => setEventStep("list"));
on("#formationPicker", "change", (event) => {
  const select = event.target.closest("#formationSelect");
  if (!select || select.value === "") return;
  applyFormationPreset(Number(select.value));
});
// Ein offenes Kartenmenue schliesst sich, sobald daneben getippt wird.
document.addEventListener("click", (event) => {
  document.querySelectorAll(".card-menu[open]").forEach((menu) => {
    if (!menu.contains(event.target)) menu.open = false;
  });
});

on("#ratingTable", "change", (event) => {
  const input = event.target.closest(".rating-input");
  if (!input) return;
  updateRating(input.dataset.playerId, input.dataset.field, input.value);
});

on("#ratingTable", "input", (event) => {
  const input = event.target.closest(".rating-note");
  if (!input) return;
  if (input.classList.contains("rating-private-note")) updatePrivateNote(input.dataset.playerId, input.value);
  else updateRating(input.dataset.playerId, input.dataset.field, input.value, false);
});

on("#ratingTable", "click", (event) => {
  const chip = event.target.closest(".chip-button");
  if (!chip) return;
  updateRating(chip.dataset.playerId, chip.dataset.field, chip.dataset.value);
});

on("#ratingStepper", "click", (event) => {
  const chip = event.target.closest(".chip-button");
  if (chip) {
    updateRating(chip.dataset.playerId, chip.dataset.field, chip.dataset.value);
  }
});

on("#ratingStepper", "change", (event) => {
  const input = event.target.closest(".rating-input");
  if (!input) return;
  updateRating(input.dataset.playerId, input.dataset.field, input.value);
});

on("#ratingStepper", "input", (event) => {
  const input = event.target.closest(".rating-note");
  if (!input) return;
  if (input.classList.contains("rating-private-note")) updatePrivateNote(input.dataset.playerId, input.value);
  else updateRating(input.dataset.playerId, input.dataset.field, input.value, false);
});

on("#eventSearch", "input", (event) => {
  eventFilter.query = event.target.value;
  renderEvents();
});

on("#eventTypeFilter", "change", (event) => {
  eventFilter.type = event.target.value;
  renderEvents();
});

on("#stepperPrevBtn", "click", () => {
  ratingStepperIndex = Math.max(0, ratingStepperIndex - 1);
  renderRatingTable();
});

on("#stepperNextBtn", "click", () => {
  ratingStepperIndex += 1;
  renderRatingTable();
});

on("#stepperJump", "change", (event) => {
  ratingStepperIndex = Number(event.target.value);
  renderRatingTable();
});

on("#trainerLoginForm", "submit", handleTrainerLogin);
on("#playerLoginForm", "submit", handlePlayerLogin);
on("#signOutBtn", "click", handleSignOut);
on("#migrateDataBtn", "click", migrateLegacyBlobToCollections);
on("#addTrainerBtn", "click", createTrainerAccount);
on("#addMedicalBtn", "click", createMedicalAccount);
on("#addScoutBtn", "click", createScoutAccount);
on("#absenceFrom", "change", () => { $("#absenceTo").min = $("#absenceFrom").value; });
on("#trainerResetBtn", "click", handlePasswordReset);
on("#changePasswordBtn", "click", openPasswordDialog);
on("#passwordForm", "submit", handlePasswordChange);
on("#closePasswordDialogBtn", "click", () => $("#passwordDialog").close());
on("#cancelPasswordDialogBtn", "click", () => $("#passwordDialog").close());
["#accessManagerList", "#scoutManagerList", "#medicalManagerList", "#trainerManagerList"].forEach((selector) => on(selector, "click", (event) => {
  const button = event.target.closest("button[data-action='revoke-access']");
  if (!button) return;
  revokeAccess(button.dataset.uid, button.dataset.role);
}));
on("#inviteManagerList", "click", (event) => {
  const button = event.target.closest("button[data-code]");
  if (!button) return;
  if (button.dataset.action === "share-invite") shareOpenInvite(button.dataset.code);
  if (button.dataset.action === "revoke-invite") revokeInvite(button.dataset.code);
});
on("#scoutManagerPanel", "click", (event) => {
  if (event.target.closest("button[data-action='add-scout']")) createScoutAccount();
});
on("#medicalManagerPanel", "click", (event) => {
  if (event.target.closest("button[data-action='add-medical']")) createMedicalAccount();
});
on("#trainerManagerPanel", "click", (event) => {
  if (event.target.closest("button[data-action='add-trainer']")) createTrainerAccount();
});
on("#inviteCopyCodeBtn", "click", () => copyInviteField("#inviteShareCode", "Code"));
on("#inviteCopyLinkBtn", "click", () => copyInviteField("#inviteShareLink", "Link"));
on("#inviteNativeShareBtn", "click", shareInviteNative);
on("#closeInviteShareBtn", "click", () => $("#inviteShareDialog").close());
on("#doneInviteShareBtn", "click", () => $("#inviteShareDialog").close());
prefillInviteFromUrl();

window.TeamKompass = Object.freeze({
  getState: () => structuredClone(state),
  allowedViews: () => allowedViews(),
  openEvent: (eventId) => {
    if (!allowedViews().includes("events")) return;
    if (state.events.some((event) => event.id === eventId)) state.selectedEventId = eventId;
    setView("events");
    renderEvents();
    setEventStep("rate");
  },
  openOpponent: (opponentId) => {
    if (!allowedViews().includes("opponents")) return;
    const opponent = (state.opponents || []).find((item) => item.id === opponentId);
    if (!opponent) return;
    // Liste auf diesen Gegner filtern, damit sein Profil direkt sichtbar ist.
    opponentFilter = opponent.name;
    if ($("#opponentSearch")) $("#opponentSearch").value = opponent.name;
    setView("opponents");
    renderOpponentAnalysis();
  },
  openPlayer: (playerId) => {
    if (["player", "parent"].includes(currentRole) && playerId !== currentPlayerId) return;
    if (!allowedViews().includes("profiles")) return;
    if ($("#profilePlayer")) $("#profilePlayer").value = playerId;
    setView("profiles");
    drawProfile();
  }
});

applyTeamBrand();
initTheme();
setEventStep("list");
prepareMobileAccordions();
if (isRoleModeConfigured()) showAuthGateLoading();
renderAll();
initDataStore();
