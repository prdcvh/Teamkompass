// Ergaenzungen, die ohne eigene Ansicht auskommen: die globale Suche
// (Lupe bzw. Strg/Cmd + K), eine Textzusammenfassung der Diagramme fuer
// Screenreader und die Registrierung des Service Workers.
(function initTeamKompassExtras() {
  "use strict";

  function appState() {
    return window.TeamKompass?.getState?.() || { players: [], events: [], developmentPlans: {}, lineup: { assignments: {} } };
  }

  function escape(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
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

  installCommandPalette();
  installAccessibleChartSummaries();
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("./service-worker.js").catch(console.error);
}());
