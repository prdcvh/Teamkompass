(() => {
  "use strict";

  const STORAGE_KEY = "hvac-scoutkompass-data-v1";
  const THEME_KEY = "hvac-scoutkompass-theme";

  const POSITIONS = ["TW", "IV", "LV", "RV", "DM", "ZM", "OM", "LA", "RA", "ST"];
  const POSITION_LABELS = {
    TW: "Torwart",
    IV: "Innenverteidiger",
    LV: "Linksverteidiger",
    RV: "Rechtsverteidiger",
    DM: "Defensives Mittelfeld",
    ZM: "Zentrales Mittelfeld",
    OM: "Offensives Mittelfeld",
    LA: "Linksaußen",
    RA: "Rechtsaußen",
    ST: "Stürmer",
  };
  const STATUS_LABELS = {
    beobachtung: "In Beobachtung",
    empfohlen: "Empfohlen",
    "zurückgestellt": "Zurückgestellt",
    abgeschlossen: "Abgeschlossen",
  };
  const REC_LABELS = {
    weiterverfolgen: "Weiterverfolgen",
    empfehlen: "Für Kader/Auswahl empfehlen",
    "zurückstellen": "Zurückstellen",
    "kein-bedarf": "Kein Bedarf",
  };

  function uid(prefix) {
    return prefix + "_" + Math.random().toString(36).slice(2, 9);
  }

  function initials(name) {
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase();
  }

  function formatDate(iso) {
    if (!iso) return "–";
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function daysUntil(iso) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(iso + "T00:00:00");
    return Math.round((target - today) / 86400000);
  }

  function dayWord(n) {
    return Math.abs(n) === 1 ? "Tag" : "Tage";
  }

  function dayWordDative(n) {
    return Math.abs(n) === 1 ? "Tag" : "Tagen";
  }

  function gradeClass(grade) {
    return grade ? "g" + grade : "gnone";
  }

  // ---------- Demo seed data ----------

  function seedData() {
    const scouts = [
      { id: "s1", name: "Michael Bertram", role: "Verbandsscout U15/U16", region: "Kreis Gießen" },
      { id: "s2", name: "Sabine Kranz", role: "Stützpunkttrainerin", region: "Kreis Marburg-Biedenkopf" },
      { id: "s3", name: "Yusuf Aydın", role: "Verbandsscout U17/U19", region: "Kreis Wetzlar" },
      { id: "s4", name: "Thorsten Voss", role: "Stützpunkttrainer", region: "Kreis Limburg" },
      { id: "s5", name: "Elena Marquardt", role: "Verbandsscoutin U14/U15", region: "Kreis Gießen" },
    ];

    const clubs = [
      "SV Blau-Weiß Lindenau",
      "TuS Eichenberg",
      "FC Rot-Gold Fernwald",
      "SG Talblick",
      "VfB Amselfeld",
      "1. FC Bergheim",
      "SV Wiesengrund",
      "TSV Falkenhain",
      "FSV Nordstadt 09",
      "SC Hohenrode",
    ];

    const firstNames = ["Luca", "Finn", "Elias", "Noah", "Leon", "Milan", "Jonas", "Emil", "David", "Kaan", "Bastian", "Samuel", "Julian", "Theo"];
    const lastNames = ["Weber", "Schmitt", "Hoffmann", "Klein", "Brandt", "Özdemir", "Lehmann", "Kaiser", "Vogt", "Winkler", "Sommer", "Freitag", "Nowak", "Reuter"];

    const players = [];
    const usedNames = new Set();
    function makeName() {
      let name;
      do {
        name = firstNames[Math.floor(Math.random() * firstNames.length)] + " " + lastNames[Math.floor(Math.random() * lastNames.length)];
      } while (usedNames.has(name));
      usedNames.add(name);
      return name;
    }

    const seedPlayers = [
      { pos: "ST", year: 2010, club: 0, status: "empfohlen", tags: ["Top-Talent", "Abschlussstark"] },
      { pos: "ZM", year: 2011, club: 1, status: "beobachtung", tags: ["Spielübersicht"] },
      { pos: "IV", year: 2009, club: 2, status: "beobachtung", tags: ["Zweikampfstark"] },
      { pos: "TW", year: 2010, club: 3, status: "beobachtung", tags: ["Reflexe"] },
      { pos: "OM", year: 2011, club: 4, status: "empfohlen", tags: ["Kreativität", "Standards"] },
      { pos: "LA", year: 2010, club: 5, status: "beobachtung", tags: ["Tempo"] },
      { pos: "RV", year: 2009, club: 6, status: "zurückgestellt", tags: [] },
      { pos: "DM", year: 2010, club: 7, status: "beobachtung", tags: ["Zweikampfstark", "Passsicher"] },
      { pos: "ST", year: 2011, club: 8, status: "beobachtung", tags: ["Kopfballstark"] },
      { pos: "LV", year: 2009, club: 9, status: "abgeschlossen", tags: [] },
      { pos: "RA", year: 2010, club: 0, status: "beobachtung", tags: ["Dribbelstark"] },
      { pos: "ZM", year: 2008, club: 2, status: "empfohlen", tags: ["Führungsspieler"] },
      { pos: "IV", year: 2011, club: 5, status: "beobachtung", tags: [] },
      { pos: "ST", year: 2009, club: 7, status: "zurückgestellt", tags: ["Abschlussschwäche"] },
      { pos: "OM", year: 2010, club: 3, status: "beobachtung", tags: ["Beidfüßig"] },
      { pos: "TW", year: 2011, club: 8, status: "beobachtung", tags: [] },
    ];

    seedPlayers.forEach((sp, i) => {
      players.push({
        id: uid("p"),
        name: makeName(),
        birthYear: sp.year,
        club: clubs[sp.club],
        league: sp.year <= 2009 ? "Verbandsliga" : "Kreisliga A",
        position: sp.pos,
        foot: ["rechts", "links", "beidfüßig"][i % 3],
        height: 150 + ((i * 7) % 40),
        status: sp.status,
        tags: sp.tags,
        watchAgain: false,
        watchAgainDate: null,
        createdAt: new Date(Date.now() - (30 - i) * 86400000).toISOString().slice(0, 10),
      });
    });

    const matchTemplates = [
      "Kreisliga A – Heimspiel gegen {club}",
      "Bezirksliga – Auswärtsspiel bei {club}",
      "Verbandsliga – Nachholspiel gegen {club}",
      "U-Auswahl-Sichtungsspiel gegen {club}",
      "Kreispokal-Halbfinale gegen {club}",
    ];
    const matchTypeLabels = ["Ligaspiel", "Ligaspiel", "Ligaspiel", "Sichtungsspiel", "Pokalspiel"];

    const strengthsPool = ["Zweikampfstark", "gutes Stellungsspiel", "starker linker Fuß", "hohe Spielintelligenz", "explosiv im Antritt", "kopfballstark", "ruhig am Ball", "gute Übersicht", "zielstrebig im Abschluss", "diszipliniert im Defensivverhalten"];
    const weaknessesPool = ["noch zu passiv im Zweikampf", "Abschlussschwäche", "muss athletischer werden", "Entscheidungsfindung unter Druck", "schwacher schwacher Fuß", "verliert bei Gegenpressing öfter den Ball", "muss an Explosivität arbeiten"];
    const recs = Object.keys(REC_LABELS);

    const reports = [];
    players.forEach((player, idx) => {
      const numReports = 1 + (idx % 4);
      for (let r = 0; r < numReports; r++) {
        const scout = scouts[(idx + r) % scouts.length];
        const daysAgo = r * 21 + (idx % 10) + 3;
        const date = new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
        const grade = Math.max(1, Math.min(6, 2 + Math.round(Math.sin(idx + r) * 2)));
        reports.push({
          id: uid("r"),
          playerId: player.id,
          date,
          match: matchTemplates[(idx + r) % matchTemplates.length].replace("{club}", clubs[(idx + r + 3) % clubs.length]),
          scoutId: scout.id,
          grade,
          positionObserved: player.position,
          strengths: strengthsPool[(idx + r) % strengthsPool.length] + ", " + strengthsPool[(idx + r + 4) % strengthsPool.length],
          weaknesses: weaknessesPool[(idx + r) % weaknessesPool.length],
          recommendation: recs[(idx + r) % recs.length],
          comment: "Im " + matchTypeLabels[(idx + r) % matchTypeLabels.length] + " insgesamt " + (grade <= 2 ? "sehr überzeugender" : grade <= 3 ? "solider" : "durchwachsener") + " Auftritt. Weiterhin beobachten.",
          watchAgain: r === numReports - 1 && idx % 3 !== 2,
          watchAgainDate: null,
          createdAt: date,
        });
      }
    });

    // set a spread of watch-again dates (some overdue, some upcoming) on the latest report per flagged player
    let overdueCount = 0;
    reports.forEach((rep) => {
      if (rep.watchAgain) {
        const offset = overdueCount % 5 === 0 ? -4 : overdueCount % 5 === 1 ? -1 : (overdueCount % 5) * 4;
        rep.watchAgainDate = new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
        overdueCount++;
        const player = players.find((p) => p.id === rep.playerId);
        if (player) {
          player.watchAgain = true;
          player.watchAgainDate = rep.watchAgainDate;
        }
      }
    });

    return { scouts, players, reports };
  }

  // ---------- State ----------

  let db = loadData();
  let currentView = "dashboard";
  let currentProfileId = null;
  let selectedGrade = null;
  let globalSearchTerm = "";

  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      /* ignore corrupt storage */
    }
    const seeded = seedData();
    saveData(seeded);
    return seeded;
  }

  function saveData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data || db));
  }

  function getPlayer(id) {
    return db.players.find((p) => p.id === id);
  }
  function getScout(id) {
    return db.scouts.find((s) => s.id === id);
  }
  function playerReports(playerId) {
    return db.reports
      .filter((r) => r.playerId === playerId)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }
  function avgGrade(playerId) {
    const reps = playerReports(playerId);
    if (!reps.length) return null;
    const sum = reps.reduce((acc, r) => acc + r.grade, 0);
    return Math.round((sum / reps.length) * 10) / 10;
  }

  // ---------- Rendering: shared ----------

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function scoutAvatar(scout, size) {
    return `<div class="avatar${size === "sm" ? " sm" : ""}">${initials(scout.name)}</div>`;
  }

  // ---------- Dashboard ----------

  function renderDashboard() {
    const totalPlayers = db.players.length;
    const activeWatch = db.players.filter((p) => p.watchAgain).length;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const recentReports = db.reports.filter((r) => r.date >= thirtyDaysAgo);
    const activeScouts = new Set(recentReports.map((r) => r.scoutId)).size;

    const metrics = [
      { label: "Spieler in der Datenbank", value: totalPlayers, hint: `${db.players.filter((p) => p.status === "empfohlen").length} aktuell empfohlen` },
      { label: "Sichtungen (30 Tage)", value: recentReports.length, hint: `${db.reports.length} insgesamt erfasst` },
      { label: "Offene Wiedervorlagen", value: activeWatch, hint: "Spieler erneut ansehen" },
      { label: "Aktive Scouts (30 Tage)", value: activeScouts, hint: `${db.scouts.length} Scouts im Verband` },
    ];
    const grid = document.getElementById("metricsGrid");
    grid.innerHTML = "";
    metrics.forEach((m) => {
      const card = el("div", "metric-card");
      card.innerHTML = `<span>${m.label}</span><strong>${m.value}</strong><small>${m.hint}</small>`;
      grid.appendChild(card);
    });

    // Watchlist
    const watchPanel = document.getElementById("watchlistPanel");
    const watchPlayers = db.players
      .filter((p) => p.watchAgain && p.watchAgainDate)
      .sort((a, b) => (a.watchAgainDate < b.watchAgainDate ? -1 : 1));
    document.getElementById("watchlistCount").textContent = watchPlayers.length ? `${watchPlayers.length} Spieler` : "";
    watchPanel.innerHTML = "";
    if (!watchPlayers.length) {
      watchPanel.appendChild(el("div", "empty-hint", "Keine offenen Wiedervorlagen. Gute Arbeit!"));
    } else {
      watchPlayers.slice(0, 6).forEach((p) => {
        const diff = daysUntil(p.watchAgainDate);
        const overdue = diff < 0;
        const item = el("div", "watchlist-item" + (overdue ? " overdue" : ""));
        item.innerHTML = `
          <div class="avatar sm">${initials(p.name)}</div>
          <div class="watchlist-main">
            <strong>${p.name}</strong>
            <small>${p.club} &middot; ${POSITION_LABELS[p.position]}</small>
          </div>
          <span class="due-chip${overdue ? " overdue" : ""}">${overdue ? `${Math.abs(diff)} ${dayWord(diff)} überfällig` : diff === 0 ? "Heute fällig" : `in ${diff} ${dayWordDative(diff)}`}</span>
        `;
        item.addEventListener("click", () => openProfile(p.id));
        watchPanel.appendChild(item);
      });
    }

    // Activity feed
    const feed = document.getElementById("activityFeed");
    feed.innerHTML = "";
    const latest = [...db.reports].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);
    latest.forEach((r) => {
      const player = getPlayer(r.playerId);
      const scout = getScout(r.scoutId);
      if (!player || !scout) return;
      const item = el("div", "activity-item");
      item.innerHTML = `
        <div class="avatar sm">${initials(scout.name)}</div>
        <div class="activity-body">
          <p><strong>${scout.name}</strong> hat <strong>${player.name}</strong> mit Note ${r.grade} bewertet</p>
          <div class="activity-meta">${formatDate(r.date)} &middot; ${player.club}</div>
        </div>
      `;
      item.style.cursor = "pointer";
      item.addEventListener("click", () => openProfile(player.id));
      feed.appendChild(item);
    });

    // Top players
    const topPanel = document.getElementById("topPlayers");
    topPanel.innerHTML = "";
    const ranked = db.players
      .map((p) => ({ p, avg: avgGrade(p.id) }))
      .filter((x) => x.avg !== null)
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 6);
    ranked.forEach((x, i) => {
      const row = el("div", "top-player-row");
      row.innerHTML = `
        <span class="top-player-rank">${i + 1}</span>
        <div class="avatar sm">${initials(x.p.name)}</div>
        <div class="top-player-info">
          <strong>${x.p.name}</strong>
          <small>${x.p.club} &middot; ${POSITION_LABELS[x.p.position]}</small>
        </div>
        <span class="grade-badge ${gradeClass(Math.round(x.avg))}">${x.avg}</span>
      `;
      row.addEventListener("click", () => openProfile(x.p.id));
      topPanel.appendChild(row);
    });

    // Scout activity
    const scoutPanel = document.getElementById("scoutActivity");
    scoutPanel.innerHTML = "";
    const counts = db.scouts.map((s) => ({
      scout: s,
      count: recentReports.filter((r) => r.scoutId === s.id).length,
    }));
    const max = Math.max(1, ...counts.map((c) => c.count));
    counts
      .sort((a, b) => b.count - a.count)
      .forEach((c) => {
        const row = el("div", "scout-activity-row");
        row.innerHTML = `
          <div class="avatar sm">${initials(c.scout.name)}</div>
          <div class="scout-activity-info">
            <strong>${c.scout.name}</strong>
            <small>${c.scout.role}</small>
          </div>
          <div class="scout-bar-track"><div class="scout-bar-fill" style="width:${(c.count / max) * 100}%"></div></div>
          <small>${c.count}</small>
        `;
        scoutPanel.appendChild(row);
      });
  }

  // ---------- Player database ----------

  function populateFilterOptions() {
    const posSelect = document.getElementById("filterPosition");
    if (posSelect.options.length <= 1) {
      POSITIONS.forEach((pos) => {
        const opt = el("option");
        opt.value = pos;
        opt.textContent = `${pos} – ${POSITION_LABELS[pos]}`;
        posSelect.appendChild(opt);
      });
    }
    const yearSelect = document.getElementById("filterYear");
    if (yearSelect.options.length <= 1) {
      const years = [...new Set(db.players.map((p) => p.birthYear))].sort((a, b) => b - a);
      years.forEach((y) => {
        const opt = el("option");
        opt.value = y;
        opt.textContent = "Jahrgang " + y;
        yearSelect.appendChild(opt);
      });
    }
    const statusSelect = document.getElementById("filterStatus");
    if (statusSelect.options.length <= 1) {
      Object.entries(STATUS_LABELS).forEach(([key, label]) => {
        const opt = el("option");
        opt.value = key;
        opt.textContent = label;
        statusSelect.appendChild(opt);
      });
    }
  }

  function filteredPlayers() {
    const pos = document.getElementById("filterPosition").value;
    const year = document.getElementById("filterYear").value;
    const status = document.getElementById("filterStatus").value;
    const grade = document.getElementById("filterGrade").value;
    const onlyWatch = document.getElementById("filterWatchAgain").checked;
    const term = globalSearchTerm.trim().toLowerCase();

    return db.players.filter((p) => {
      if (pos && p.position !== pos) return false;
      if (year && String(p.birthYear) !== year) return false;
      if (status && p.status !== status) return false;
      if (onlyWatch && !p.watchAgain) return false;
      if (grade) {
        const avg = avgGrade(p.id);
        if (avg === null || avg > Number(grade)) return false;
      }
      if (term && !(p.name.toLowerCase().includes(term) || p.club.toLowerCase().includes(term))) return false;
      return true;
    });
  }

  function renderDatabase() {
    populateFilterOptions();
    const players = filteredPlayers().sort((a, b) => a.name.localeCompare(b.name));
    document.getElementById("dbCount").textContent = `${players.length} von ${db.players.length} Spielern`;

    const table = document.getElementById("playerTable");
    table.innerHTML = "";
    if (!players.length) {
      table.appendChild(el("div", "empty-hint", "Keine Spieler gefunden. Filter anpassen oder neue Sichtung erfassen."));
      return;
    }
    players.forEach((p) => {
      const avg = avgGrade(p.id);
      const reps = playerReports(p.id);
      const row = el("div", "player-row");
      row.innerHTML = `
        <div class="player-row-main">
          <div class="avatar sm">${initials(p.name)}</div>
          <div class="player-row-name">
            <strong>${p.name}</strong>
            <small>${POSITION_LABELS[p.position]} &middot; Jg. ${p.birthYear}</small>
          </div>
        </div>
        <div class="player-row-club col-club-cell">${p.club}</div>
        <div class="col-jahrgang-cell">${reps.length} Sichtung${reps.length === 1 ? "" : "en"}</div>
        <div><span class="grade-badge ${gradeClass(avg ? Math.round(avg) : null)}">${avg ?? "–"}</span></div>
        <div class="col-status-cell"><span class="status-tag status-${p.status}">${STATUS_LABELS[p.status]}</span></div>
        <div class="col-watch-cell">${
          p.watchAgain
            ? `<span class="watch-flag${daysUntil(p.watchAgainDate) < 0 ? " overdue" : ""}"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>${formatDate(p.watchAgainDate)}</span>`
            : ""
        }</div>
      `;
      row.addEventListener("click", () => openProfile(p.id));
      table.appendChild(row);
    });
  }

  // ---------- Player profile ----------

  function openProfile(playerId) {
    currentProfileId = playerId;
    switchView("profile");
    renderProfile();
  }

  function renderProfile() {
    const player = getPlayer(currentProfileId);
    const content = document.getElementById("profileContent");
    if (!player) {
      content.innerHTML = `<div class="empty-hint">Spieler nicht gefunden.</div>`;
      return;
    }
    const reps = playerReports(player.id);
    const avg = avgGrade(player.id);
    const age = new Date().getFullYear() - player.birthYear;

    let html = "";
    if (player.watchAgain && player.watchAgainDate) {
      const diff = daysUntil(player.watchAgainDate);
      const overdue = diff < 0;
      html += `<div class="watch-again-banner${overdue ? " overdue" : ""}">
        <span>${overdue ? `Wiedervorlage überfällig seit ${Math.abs(diff)} ${dayWordDative(diff)} — erneut ansehen (geplant: ${formatDate(player.watchAgainDate)})` : `Wiedervorlage geplant für ${formatDate(player.watchAgainDate)} (in ${diff} ${dayWordDative(diff)})`}</span>
        <button class="ghost-button" id="quickReportBtn">Sichtung erfassen</button>
      </div>`;
    }

    html += `<div class="profile-header">
      <div class="avatar">${initials(player.name)}</div>
      <div class="profile-id">
        <h2>${player.name}</h2>
        <p>${player.club} &middot; ${POSITION_LABELS[player.position]} &middot; Jahrgang ${player.birthYear} (${age} Jahre)</p>
        <div class="profile-tags">
          <span class="status-tag status-${player.status}">${STATUS_LABELS[player.status]}</span>
          ${player.tags.map((t) => `<span class="tag-chip">${t}</span>`).join("")}
        </div>
      </div>
      <div class="profile-stats">
        <div class="profile-stat"><strong>${avg ?? "–"}</strong><span>Notenschnitt</span></div>
        <div class="profile-stat"><strong>${reps.length}</strong><span>Sichtungen</span></div>
        <div class="profile-stat"><strong>${reps.length ? formatDate(reps[0].date) : "–"}</strong><span>Zuletzt gesehen</span></div>
      </div>
    </div>`;

    html += `<div class="profile-grid">
      <div class="info-card">
        <h3>Stammdaten</h3>
        <div class="info-row"><span>Verein</span><span>${player.club}</span></div>
        <div class="info-row"><span>Liga</span><span>${player.league}</span></div>
        <div class="info-row"><span>Position</span><span>${POSITION_LABELS[player.position]}</span></div>
        <div class="info-row"><span>Starker Fuß</span><span>${player.foot}</span></div>
        <div class="info-row"><span>Größe</span><span>${player.height} cm</span></div>
        <div class="info-row"><span>In Datenbank seit</span><span>${formatDate(player.createdAt)}</span></div>
        <button class="primary-button" id="addReportForPlayerBtn" style="width:100%; justify-content:center; margin-top:14px;">Neue Sichtung erfassen</button>
      </div>
      <div class="timeline" id="profileTimeline"></div>
    </div>`;

    content.innerHTML = html;

    const timeline = document.getElementById("profileTimeline");
    if (!reps.length) {
      timeline.appendChild(el("div", "empty-hint", "Noch keine Sichtungen für diesen Spieler erfasst."));
    } else {
      reps.forEach((r) => {
        const scout = getScout(r.scoutId);
        const item = el("div", "timeline-item");
        item.innerHTML = `
          <div class="timeline-head">
            <div class="timeline-scout">
              ${scoutAvatar(scout, "sm")}
              <div class="timeline-scout-info">
                <strong>${scout.name}</strong>
                <small>${formatDate(r.date)} &middot; ${scout.role}</small>
              </div>
            </div>
            <div class="timeline-grade">
              <span class="rec-chip ${r.recommendation}">${REC_LABELS[r.recommendation]}</span>
              <span class="grade-badge ${gradeClass(r.grade)}">${r.grade}</span>
            </div>
          </div>
          <p class="timeline-match">${r.match} &middot; beobachtete Position: ${POSITION_LABELS[r.positionObserved] || r.positionObserved}</p>
          <div class="timeline-tags">
            ${r.strengths ? `<span><strong>Stärken:</strong>${r.strengths}</span>` : ""}
            ${r.weaknesses ? `<span><strong>Schwächen:</strong>${r.weaknesses}</span>` : ""}
          </div>
          ${r.comment ? `<p class="timeline-comment">${r.comment}</p>` : ""}
        `;
        timeline.appendChild(item);
      });
    }

    document.getElementById("addReportForPlayerBtn").addEventListener("click", () => openReportModal(player.id));
    const quickBtn = document.getElementById("quickReportBtn");
    if (quickBtn) quickBtn.addEventListener("click", () => openReportModal(player.id));
  }

  // ---------- Reports feed view ----------

  function populateReportFilters() {
    const scoutSelect = document.getElementById("reportsScoutFilter");
    if (scoutSelect.options.length <= 1) {
      db.scouts.forEach((s) => {
        const opt = el("option");
        opt.value = s.id;
        opt.textContent = s.name;
        scoutSelect.appendChild(opt);
      });
    }
    const recSelect = document.getElementById("reportsRecFilter");
    if (recSelect.options.length <= 1) {
      Object.entries(REC_LABELS).forEach(([key, label]) => {
        const opt = el("option");
        opt.value = key;
        opt.textContent = label;
        recSelect.appendChild(opt);
      });
    }
  }

  function renderReportsView() {
    populateReportFilters();
    const scoutFilter = document.getElementById("reportsScoutFilter").value;
    const recFilter = document.getElementById("reportsRecFilter").value;
    const term = globalSearchTerm.trim().toLowerCase();

    let reports = [...db.reports].sort((a, b) => (a.date < b.date ? 1 : -1));
    if (scoutFilter) reports = reports.filter((r) => r.scoutId === scoutFilter);
    if (recFilter) reports = reports.filter((r) => r.recommendation === recFilter);
    if (term) {
      reports = reports.filter((r) => {
        const player = getPlayer(r.playerId);
        return player && (player.name.toLowerCase().includes(term) || player.club.toLowerCase().includes(term));
      });
    }

    const list = document.getElementById("reportsList");
    list.innerHTML = "";
    if (!reports.length) {
      list.appendChild(el("div", "empty-hint", "Keine Sichtungen gefunden."));
      return;
    }
    reports.forEach((r) => {
      const player = getPlayer(r.playerId);
      const scout = getScout(r.scoutId);
      if (!player || !scout) return;
      const card = el("div", "report-card");
      card.innerHTML = `
        <span class="grade-badge ${gradeClass(r.grade)}">${r.grade}</span>
        <div class="report-main">
          <strong>${player.name}</strong> <span style="color:var(--muted); font-weight:500;">&middot; ${player.club}</span>
          <p>${r.match}</p>
        </div>
        <div class="report-side">
          ${formatDate(r.date)}<br>
          ${scout.name}
        </div>
      `;
      card.addEventListener("click", () => openProfile(player.id));
      list.appendChild(card);
    });
  }

  // ---------- Scouts view ----------

  function renderScoutsView() {
    const grid = document.getElementById("scoutsGrid");
    grid.innerHTML = "";
    db.scouts.forEach((s) => {
      const reps = db.reports.filter((r) => r.scoutId === s.id);
      const playersSeen = new Set(reps.map((r) => r.playerId)).size;
      const card = el("div", "scout-card");
      card.innerHTML = `
        <div class="scout-card-head">
          ${scoutAvatar(s)}
          <div>
            <strong>${s.name}</strong>
            <small>${s.role}</small>
          </div>
        </div>
        <small style="color:var(--muted);">${s.region}</small>
        <div class="scout-card-stats">
          <div><strong>${reps.length}</strong><span>Sichtungen</span></div>
          <div><strong>${playersSeen}</strong><span>Spieler</span></div>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  // ---------- View switching ----------

  const VIEW_TITLES = {
    dashboard: "Dashboard",
    database: "Spielerdatenbank",
    profile: "Spielerprofil",
    reports: "Sichtungen",
    scouts: "Scouts",
  };

  function switchView(view) {
    currentView = view;
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    document.getElementById(view + "View").classList.add("active");
    document.getElementById("pageTitle").textContent = VIEW_TITLES[view];

    document.querySelectorAll(".nav-tab").forEach((tab) => {
      const isActive = tab.dataset.view === view;
      tab.classList.toggle("active", isActive);
    });
    positionNavIndicator();

    if (view === "dashboard") renderDashboard();
    else if (view === "database") renderDatabase();
    else if (view === "reports") renderReportsView();
    else if (view === "scouts") renderScoutsView();
    else if (view === "profile") renderProfile();
  }

  function positionNavIndicator() {
    const activeTab = document.querySelector(".nav-tab.active");
    const indicator = document.getElementById("navIndicator");
    if (!activeTab) {
      indicator.style.opacity = "0";
      return;
    }
    indicator.style.opacity = "1";
    indicator.style.transform = `translateY(${activeTab.offsetTop}px)`;
    indicator.style.height = activeTab.offsetHeight + "px";
  }

  // ---------- Report modal ----------

  function populateModalStaticOptions() {
    const scoutSelect = document.getElementById("scoutSelect");
    scoutSelect.innerHTML = db.scouts.map((s) => `<option value="${s.id}">${s.name}</option>`).join("");

    const posSelect = document.getElementById("positionObserved");
    posSelect.innerHTML = POSITIONS.map((p) => `<option value="${p}">${p} – ${POSITION_LABELS[p]}</option>`).join("");

    const newPosSelect = document.getElementById("newPlayerPosition");
    newPosSelect.innerHTML = POSITIONS.map((p) => `<option value="${p}">${p} – ${POSITION_LABELS[p]}</option>`).join("");

    const datalist = document.getElementById("playerOptions");
    datalist.innerHTML = db.players.map((p) => `<option value="${p.name}" label="${p.club}">`).join("");
  }

  function openReportModal(playerId) {
    populateModalStaticOptions();
    const form = document.getElementById("reportForm");
    form.reset();
    selectedGrade = null;
    document.querySelectorAll(".grade-tile").forEach((t) => {
      t.classList.remove("selected");
      t.setAttribute("aria-checked", "false");
    });
    document.getElementById("matchDate").value = new Date().toISOString().slice(0, 10);
    document.getElementById("watchAgainCheck").checked = true;
    const wDate = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);
    document.getElementById("watchAgainDate").value = wDate;
    document.getElementById("newPlayerDetails").open = false;

    if (playerId) {
      const player = getPlayer(playerId);
      if (player) {
        document.getElementById("playerSelect").value = player.name;
        document.getElementById("positionObserved").value = player.position;
      }
    } else {
      document.getElementById("playerSelect").value = "";
    }

    document.getElementById("reportModalOverlay").classList.add("open");
  }

  function closeReportModal() {
    document.getElementById("reportModalOverlay").classList.remove("open");
  }

  function findOrCreatePlayer(name) {
    const trimmed = name.trim();
    let player = db.players.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
    if (player) return player;

    const club = document.getElementById("newPlayerClub").value.trim() || "Unbekannter Verein";
    const year = Number(document.getElementById("newPlayerYear").value) || new Date().getFullYear() - 14;
    const position = document.getElementById("newPlayerPosition").value || "ZM";
    const foot = document.getElementById("newPlayerFoot").value || "rechts";

    player = {
      id: uid("p"),
      name: trimmed,
      birthYear: year,
      club,
      league: "Kreisliga",
      position,
      foot,
      height: 165,
      status: "beobachtung",
      tags: [],
      watchAgain: false,
      watchAgainDate: null,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    db.players.push(player);
    return player;
  }

  function handleReportSubmit(ev) {
    ev.preventDefault();
    const playerName = document.getElementById("playerSelect").value;
    if (!playerName.trim()) return;
    if (!selectedGrade) {
      showToast("Bitte eine Note von 1–6 vergeben.");
      return;
    }
    const player = findOrCreatePlayer(playerName);
    const watchAgain = document.getElementById("watchAgainCheck").checked;
    const watchAgainDate = watchAgain ? document.getElementById("watchAgainDate").value : null;

    const report = {
      id: uid("r"),
      playerId: player.id,
      date: document.getElementById("matchDate").value,
      match: document.getElementById("matchInfo").value.trim(),
      scoutId: document.getElementById("scoutSelect").value,
      grade: selectedGrade,
      positionObserved: document.getElementById("positionObserved").value,
      strengths: document.getElementById("strengths").value.trim(),
      weaknesses: document.getElementById("weaknesses").value.trim(),
      recommendation: document.getElementById("recommendation").value,
      comment: document.getElementById("comment").value.trim(),
      watchAgain,
      watchAgainDate,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    db.reports.push(report);
    player.watchAgain = watchAgain;
    player.watchAgainDate = watchAgainDate;
    if (report.recommendation === "empfehlen") player.status = "empfohlen";
    else if (report.recommendation === "zurückstellen") player.status = "zurückgestellt";

    saveData();
    closeReportModal();
    showToast(`Sichtung für ${player.name} gespeichert.`);

    if (currentView === "profile" && currentProfileId === player.id) renderProfile();
    else if (currentView === "dashboard") renderDashboard();
    else if (currentView === "database") renderDatabase();
    else if (currentView === "reports") renderReportsView();
  }

  let toastTimer = null;
  function showToast(msg) {
    const toast = document.getElementById("toast");
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
  }

  // ---------- Theme ----------

  function applyTheme(theme) {
    if (theme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
      document.getElementById("themeToggleText").textContent = "Lightmode";
      document.getElementById("themeToggle").setAttribute("aria-pressed", "true");
    } else {
      document.documentElement.removeAttribute("data-theme");
      document.getElementById("themeToggleText").textContent = "Darkmode";
      document.getElementById("themeToggle").setAttribute("aria-pressed", "false");
    }
    localStorage.setItem(THEME_KEY, theme);
  }

  function toggleTheme() {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    applyTheme(isDark ? "light" : "dark");
  }

  // ---------- Init ----------

  function init() {
    applyTheme(localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light");

    document.querySelectorAll(".nav-tab").forEach((tab) => {
      tab.addEventListener("click", () => switchView(tab.dataset.view));
    });
    document.getElementById("backToDb").addEventListener("click", () => switchView("database"));
    document.getElementById("themeToggle").addEventListener("click", toggleTheme);

    document.getElementById("newReportBtn").addEventListener("click", () => openReportModal());
    document.getElementById("heroReportBtn").addEventListener("click", () => openReportModal());
    document.getElementById("heroDbBtn").addEventListener("click", () => switchView("database"));
    document.getElementById("reportModalClose").addEventListener("click", closeReportModal);
    document.getElementById("reportCancelBtn").addEventListener("click", closeReportModal);
    document.getElementById("reportModalOverlay").addEventListener("click", (ev) => {
      if (ev.target.id === "reportModalOverlay") closeReportModal();
    });
    document.getElementById("reportForm").addEventListener("submit", handleReportSubmit);

    document.querySelectorAll(".grade-tile").forEach((tile) => {
      tile.addEventListener("click", () => {
        selectedGrade = Number(tile.dataset.grade);
        document.querySelectorAll(".grade-tile").forEach((t) => {
          t.classList.remove("selected");
          t.setAttribute("aria-checked", "false");
        });
        tile.classList.add("selected");
        tile.setAttribute("aria-checked", "true");
      });
    });

    document.getElementById("watchAgainCheck").addEventListener("change", (ev) => {
      document.getElementById("watchAgainDate").disabled = !ev.target.checked;
    });

    ["filterPosition", "filterYear", "filterStatus", "filterGrade", "filterWatchAgain"].forEach((id) => {
      document.getElementById(id).addEventListener("change", renderDatabase);
    });
    document.getElementById("filterReset").addEventListener("click", () => {
      document.getElementById("filterPosition").value = "";
      document.getElementById("filterYear").value = "";
      document.getElementById("filterStatus").value = "";
      document.getElementById("filterGrade").value = "";
      document.getElementById("filterWatchAgain").checked = false;
      renderDatabase();
    });

    ["reportsScoutFilter", "reportsRecFilter"].forEach((id) => {
      document.getElementById(id).addEventListener("change", renderReportsView);
    });

    document.getElementById("globalSearch").addEventListener("input", (ev) => {
      globalSearchTerm = ev.target.value;
      if (currentView === "database") renderDatabase();
      else if (currentView === "reports") renderReportsView();
      else if (globalSearchTerm.trim()) switchView("database");
    });

    window.addEventListener("resize", positionNavIndicator);

    switchView("dashboard");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
