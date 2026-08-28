// Ergaenzungen, die ohne eigene Ansicht auskommen: die globale Suche
// (Lupe bzw. Strg/Cmd + K), der Datenschutz-Dialog hinter "Aktionen", eine
// Textzusammenfassung der Diagramme fuer Screenreader und die Registrierung
// des Service Workers.
(function initTeamKompassExtras() {
  "use strict";

  // Geraetelokale Einstellungen. Die Aufbewahrungsdauer liest app.js beim
  // Start aus demselben Schluessel, der Verlauf bleibt rein lokal.
  const workspaceKey = "teamkompass-workspace-v1";
  const defaultWorkspace = { retentionDays: 90, activity: [] };
  let workspace = loadWorkspace();

  function loadWorkspace() {
    try {
      const stored = JSON.parse(localStorage.getItem(workspaceKey) || "{}");
      return {
        retentionDays: Number(stored.retentionDays) || defaultWorkspace.retentionDays,
        activity: Array.isArray(stored.activity) ? stored.activity : []
      };
    } catch { return structuredClone(defaultWorkspace); }
  }

  function saveWorkspace(action) {
    if (action) workspace.activity.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), action });
    workspace.activity = workspace.activity.slice(0, 100);
    localStorage.setItem(workspaceKey, JSON.stringify(workspace));
    renderPrivacy();
  }

  function appState() {
    return window.TeamKompass?.getState?.() || { players: [], events: [], developmentPlans: {}, lineup: { assignments: {} } };
  }

  function escape(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }

  // Jedes Element einzeln pruefen: der Dialog ist optional, ein fehlendes
  // Feld darf die uebrigen nicht mit abraeumen.
  function renderPrivacy() {
    const retention = document.querySelector("#retentionDays");
    if (retention) retention.value = String(workspace.retentionDays);
    const log = document.querySelector("#activityLog");
    if (!log) return;
    log.innerHTML = workspace.activity.map((item) => `<article><strong>${escape(item.action)}</strong><span>${new Date(item.at).toLocaleString("de-DE")}</span></article>`).join("") || `<p class="muted">Noch keine lokalen Aktivitäten protokolliert.</p>`;
  }

  function installPrivacyDialog() {
    const dialog = document.querySelector("#privacyDialog");
    if (!dialog) return;
    document.querySelector("#privacyBtn")?.addEventListener("click", () => {
      renderPrivacy();
      dialog.showModal();
    });
    document.querySelector("#closePrivacyDialogBtn")?.addEventListener("click", () => dialog.close());
    document.querySelector("#cancelPrivacyDialogBtn")?.addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
    document.querySelector("#retentionDays")?.addEventListener("change", (event) => {
      workspace.retentionDays = Number(event.target.value);
      saveWorkspace(`Lokale Aufbewahrung auf ${workspace.retentionDays} Tage gesetzt`);
    });
    document.querySelector("#clearLocalCacheBtn")?.addEventListener("click", () => {
      if (!confirm("Lokalen Zwischenspeicher auf diesem Gerät löschen? Cloud-Daten bleiben erhalten.")) return;
      ["teamkompass-data-v1", "teamkompass-data-v2"].forEach((key) => localStorage.removeItem(key));
      workspace.activity.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), action: "Lokalen Zwischenspeicher gelöscht" });
      localStorage.setItem(workspaceKey, JSON.stringify(workspace));
      location.reload();
    });
  }

  // Speist den Aktivitaetsverlauf im Datenschutz-Dialog.
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

  installPrivacyDialog();
  installActivityCapture();
  installCommandPalette();
  installAccessibleChartSummaries();
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("./service-worker.js").catch(console.error);
}());
