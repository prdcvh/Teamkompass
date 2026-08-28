(function initTeamKompassNextLevel() {
  "use strict";
  const workspaceKey = "teamkompass-workspace-v1";
  const defaultWorkspace = { weeklyFocus: "", weeklySuccess: "", retentionDays: 90, activity: [] };
  let workspace = loadWorkspace();

  function loadWorkspace() {
    try { return { ...defaultWorkspace, ...JSON.parse(localStorage.getItem(workspaceKey) || "{}") }; }
    catch { return structuredClone(defaultWorkspace); }
  }

  function saveWorkspace(action) {
    if (action) workspace.activity.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), action });
    workspace.activity = workspace.activity.slice(0, 100);
    localStorage.setItem(workspaceKey, JSON.stringify(workspace));
    window.TeamKompass?.saveWorkspace?.(workspace).catch((error) => console.error("Workspace-Sync", error));
    renderOperations();
  }

  let unsubscribeWorkspace = null;
  function connectWorkspace() {
    unsubscribeWorkspace?.();
    unsubscribeWorkspace = window.TeamKompass?.subscribeWorkspace?.((remote) => {
      workspace = { ...defaultWorkspace, ...remote, activity: Array.isArray(remote.activity) ? remote.activity : workspace.activity };
      localStorage.setItem(workspaceKey, JSON.stringify(workspace));
      renderOperations();
    });
  }

  function appState() {
    return window.TeamKompass?.getState?.() || { players: [], events: [], developmentPlans: {}, lineup: { assignments: {} } };
  }

  function escape(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }

  function nextGame(state) {
    const today = new Date().toISOString().slice(0, 10);
    return [...state.events].filter((event) => event.type === "Spiel" && event.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] || null;
  }

  function actionItems(state) {
    const actions = [];
    const game = nextGame(state);
    const today = new Date();
    const duePlans = Object.values(state.developmentPlans || {}).flat().filter((plan) => plan.status !== "Erreicht" && plan.dueDate && new Date(`${plan.dueDate}T23:59:59`) <= new Date(today.getTime() + 14 * 86400000));
    const unavailable = state.players.filter((player) => ["Verletzt", "Pause", "Gesperrt", "Abwesend"].includes(player.status));
    if (!workspace.weeklyFocus) actions.push({ level: "high", title: "Wochenfokus festlegen", detail: "Das Team hat noch keine gemeinsame Leitlinie für diese Woche." });
    if (game && Object.keys(game.ratings || {}).length < state.players.length) actions.push({ level: "high", title: "Verfügbarkeit fürs nächste Spiel prüfen", detail: `${state.players.length - Object.keys(game.ratings || {}).length} Rückmeldungen sind noch offen.` });
    if (duePlans.length) actions.push({ level: "medium", title: "Entwicklungsziele überprüfen", detail: `${duePlans.length} Ziele sind fällig oder werden in 14 Tagen fällig.` });
    if (unavailable.length) actions.push({ level: "medium", title: "Kaderengpass beachten", detail: `${unavailable.length} Spieler sind aktuell nicht voll verfügbar.` });
    if (!actions.length) actions.push({ level: "ok", title: "Alles vorbereitet", detail: "Aktuell gibt es keinen dringenden Handlungsbedarf." });
    return actions;
  }

  function renderWeekTimeline(state) {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start.getTime() + index * 86400000);
      const key = date.toISOString().slice(0, 10);
      return { date, key, events: state.events.filter((event) => event.date === key) };
    });
    return days.map(({ date, events }) => `<article class="week-day ${events.length ? "has-event" : ""}"><div><strong>${date.toLocaleDateString("de-DE", { weekday: "short" })}</strong><span>${date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}</span></div>${events.length ? events.map((event) => `<button type="button" data-week-event="${escape(event.id)}"><strong>${escape(event.title)}</strong><small>${escape(event.type)} · Intensität ${event.intensity || 2}</small></button>`).join("") : `<span class="muted">Regeneration / frei</span>`}</article>`).join("");
  }

  function renderOperations() {
    const root = document.querySelector("#planningView");
    if (!root) return;
    const state = appState();
    const game = nextGame(state);
    const assignments = Object.values(state.lineup?.assignments || {}).flat();
    document.querySelector("#weeklyFocus").value = workspace.weeklyFocus;
    document.querySelector("#weeklySuccess").value = workspace.weeklySuccess;
    document.querySelector("#retentionDays").value = String(workspace.retentionDays);
    document.querySelector("#operationsSummary").innerHTML = `
      <article><span>Wochenfokus</span><strong>${escape(workspace.weeklyFocus || "Noch offen")}</strong><small>${escape(workspace.weeklySuccess || "Erfolgskriterium ergänzen")}</small></article>
      <article><span>Nächstes Spiel</span><strong>${game ? escape(game.title) : "Noch nicht geplant"}</strong><small>${game ? escape(game.date) : "Im Kalender anlegen"}</small></article>
      <article><span>Aufstellung</span><strong>${assignments.length}/11</strong><small>${assignments.length >= 11 ? "vollständig" : `${11 - assignments.length} ${11 - assignments.length === 1 ? "Position" : "Positionen"} offen`}</small></article>`;
    document.querySelector("#actionFeed").innerHTML = actionItems(state).map((item) => `<article class="action-item ${item.level}"><strong>${escape(item.title)}</strong><p>${escape(item.detail)}</p></article>`).join("");
    document.querySelector("#weekTimeline").innerHTML = renderWeekTimeline(state);
    document.querySelector("#weekTimeline").querySelectorAll("[data-week-event]").forEach((button) => { button.onclick = () => window.TeamKompass?.openEvent?.(button.dataset.weekEvent); });
    document.querySelector("#matchdayStatus").textContent = game ? game.date : "kein Spiel geplant";
    document.querySelector("#matchdayCockpit").innerHTML = game ? `
      <div class="matchday-score"><span>${escape(game.location || "Ort offen")}</span><strong>${escape(game.opponent || game.title)}</strong><small>${escape(game.date)} · ${game.matchDuration || 90} Minuten</small></div>
      <div class="matchday-checks"><span class="${assignments.length >= 11 ? "done" : ""}">Aufstellung ${assignments.length >= 11 ? "bereit" : "offen"}</span><span class="${workspace.weeklyFocus ? "done" : ""}">Matchfokus ${workspace.weeklyFocus ? "definiert" : "offen"}</span><span>Bewertung nach Abpfiff vorbereiten</span></div>
      <button class="ghost-button" id="openMatchEventBtn" type="button">Zum Spiel &amp; zur Bewertung</button>` : `<p class="muted">Lege ein Spiel an, um das Matchday-Cockpit zu aktivieren.</p>`;
    const matchButton = document.querySelector("#openMatchEventBtn");
    if (matchButton) matchButton.onclick = () => window.TeamKompass?.openEvent?.(game.id);
    document.querySelector("#activityLog").innerHTML = workspace.activity.map((item) => `<article><strong>${escape(item.action)}</strong><span>${new Date(item.at).toLocaleString("de-DE")}</span></article>`).join("") || `<p class="muted">Noch keine lokalen Aktivitäten protokolliert.</p>`;
  }

  function installCommandPalette() {
    const dialog = document.createElement("dialog");
    dialog.className = "command-palette";
    dialog.innerHTML = `<div class="command-palette-box"><label>TeamKompass durchsuchen<input type="search" id="commandSearch" placeholder="Bereich, Spieler oder Event …" autocomplete="off" /></label><div id="commandResults"></div><small>Esc zum Schließen · Strg/⌘ + K zum Öffnen</small></div>`;
    document.body.append(dialog);
    const input = dialog.querySelector("#commandSearch");
    const results = dialog.querySelector("#commandResults");
    const render = () => {
      const query = input.value.trim().toLowerCase();
      const state = appState();
      const views = [["dashboard", "Dashboard"], ["squad", "Kader"], ["events", "Events"], ["profiles", "Profile"], ["opponents", "Gegneranalyse"], ["teamAnalysis", "Teamanalyse"]];
      const items = [
        ...views.map(([id, label]) => ({ type: "view", id, label, meta: "Bereich" })),
        ...state.players.map((player) => ({ type: "player", id: player.id, label: player.name, meta: `Spieler · Nr. ${player.number}` })),
        ...state.events.map((event) => ({ type: "event", id: event.id, label: event.title, meta: `${event.type} · ${event.date}` }))
      ].filter((item) => !query || `${item.label} ${item.meta}`.toLowerCase().includes(query)).slice(0, 12);
      results.innerHTML = items.map((item) => `<button type="button" data-type="${item.type}" data-id="${escape(item.id)}"><strong>${escape(item.label)}</strong><span>${escape(item.meta)}</span></button>`).join("") || `<p class="muted">Kein Treffer.</p>`;
    };
    input.addEventListener("input", render);
    results.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-type]");
      if (!button) return;
      if (button.dataset.type === "player") window.TeamKompass?.openPlayer?.(button.dataset.id);
      else if (button.dataset.type === "event") window.TeamKompass?.openEvent?.(button.dataset.id);
      else document.querySelector(`.nav-tab[data-view="${button.dataset.id}"]`)?.click();
      dialog.close();
    });
    const openPalette = () => {
      if (dialog.open) return;
      dialog.showModal();
      input.value = "";
      render();
      requestAnimationFrame(() => input.focus());
    };
    document.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openPalette();
      }
    });
    document.querySelector("#globalSearchBtn")?.addEventListener("click", openPalette);
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  }

  function installAccessibleChartSummaries() {
    const summary = document.createElement("div");
    summary.id = "chartDataSummary";
    summary.className = "sr-only";
    document.body.append(summary);
    document.querySelectorAll("canvas[aria-label]").forEach((canvas) => canvas.setAttribute("aria-describedby", summary.id));
    const state = appState();
    summary.textContent = `Textzusammenfassung der Diagramme: ${state.players.length} Spieler, ${state.events.length} Events. Detaillierte Werte stehen zusätzlich in den Profil-, Kader- und Eventlisten.`;
  }

  function installActivityCapture() {
    const actions = new Map([
      ["playerForm", "Spielerprofil gespeichert"], ["eventForm", "Event gespeichert"],
      ["developmentPlanForm", "Entwicklungsziel gespeichert"], ["absenceForm", "Abwesenheit gespeichert"],
      ["measurementForm", "Messwert gespeichert"], ["opponentForm", "Gegnerprofil gespeichert"]
    ]);
    document.addEventListener("submit", (event) => {
      const action = actions.get(event.target.id);
      if (action) saveWorkspace(action);
    }, true);
  }

  document.querySelector("#weeklyFocusForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    workspace.weeklyFocus = document.querySelector("#weeklyFocus").value.trim();
    workspace.weeklySuccess = document.querySelector("#weeklySuccess").value.trim();
    saveWorkspace("Wochenfokus aktualisiert");
  });
  document.querySelector("#retentionDays")?.addEventListener("change", (event) => {
    workspace.retentionDays = Number(event.target.value);
    saveWorkspace(`Lokale Aufbewahrung auf ${workspace.retentionDays} Tage gesetzt`);
  });
  document.querySelector("#planningNewEventBtn")?.addEventListener("click", () => window.TeamKompass?.newEvent?.());
  document.querySelector("#clearLocalCacheBtn")?.addEventListener("click", () => {
    if (!confirm("Lokalen Zwischenspeicher auf diesem Gerät löschen? Cloud-Daten bleiben erhalten.")) return;
    ["teamkompass-data-v1", "teamkompass-data-v2"].forEach((key) => localStorage.removeItem(key));
    workspace.activity.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), action: "Lokalen Zwischenspeicher gelöscht" });
    localStorage.setItem(workspaceKey, JSON.stringify(workspace));
    location.reload();
  });

  document.addEventListener("teamkompass:render", renderOperations);
  document.addEventListener("teamkompass:cloud-ready", connectWorkspace);
  installCommandPalette();
  installActivityCapture();
  installAccessibleChartSummaries();
  connectWorkspace();
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("./service-worker.js").catch(console.error);
  renderOperations();
}());
