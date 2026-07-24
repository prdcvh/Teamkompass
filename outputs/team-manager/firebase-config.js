window.TEAMKOMPASS_CONFIG = {
  storage: "firebase",
  teamId: "mein-team",
  // Auf true stellen, um den Rollen-Modus (Trainer-Login + Spieler-Einladungscodes,
  // siehe firestore.rules) zu aktivieren. Vorher in der Firebase-Konsole unter
  // Authentication die Anmeldemethoden "E-Mail/Passwort" und "Anonym" aktivieren
  // und firestore.rules deployen - siehe FIREBASE_SETUP.md.
  enableRoles: true,
  firebase: {
    apiKey: "AIzaSyCJbajbFdiUFumwIGFN-UXxsg353Y4JgT0",
    authDomain: "teamkompass-b8aac.firebaseapp.com",
    projectId: "teamkompass-b8aac",
    storageBucket: "teamkompass-b8aac.firebasestorage.app",
    messagingSenderId: "942049581058",
    appId: "1:942049581058:web:9d92343bb4037b80186f1b",
    measurementId: "G-HSSGEM2KL7"
  }
};

const responsiveStyles = document.createElement("link");
responsiveStyles.rel = "stylesheet";
responsiveStyles.href = "./responsive-enhancements.css?v=2";
document.head.append(responsiveStyles);

window.TEAMKOMPASS_VERSION = "responsive-v2";
document.querySelector(".brand strong").textContent = "1. FC Königstein U14";

window.addEventListener("load", () => {
  const criteria = ["Einsatz", "Taktisches Verständnis", "Zweikampfbereitschaft", "Fehlerquote"];
  const ratingLabels = {
    Technik: criteria[1],
    Taktik: criteria[2],
    Auffassung: criteria[3],
    Auffassungsgabe: criteria[3]
  };

  const applyRatingLabels = () => {
    const headers = document.querySelectorAll("#ratingTableHead th");
    criteria.forEach((label, index) => {
      const header = headers[index + 3];
      if (header && header.textContent !== label) header.textContent = label;
    });

    document.querySelectorAll("#ratingTable tr").forEach((row) => {
      const cells = row.querySelectorAll("td");
      criteria.forEach((label, index) => {
        const cell = cells[index + 3];
        if (cell && cell.dataset.label !== label) cell.dataset.label = label;
      });
    });

    document.querySelectorAll("th, .analysis-bar-row strong, .rating-card-label").forEach((element) => {
      const replacement = ratingLabels[element.textContent.trim()];
      if (replacement && element.textContent !== replacement) element.textContent = replacement;
    });
    document.querySelectorAll("[data-label]").forEach((element) => {
      const replacement = ratingLabels[element.dataset.label];
      if (replacement && element.dataset.label !== replacement) element.dataset.label = replacement;
    });
  };

  if (typeof calculatedGrade === "function") {
    calculatedGrade = (rating) => {
      if (!rating || rating.attendance === "absent") return "";
      const fields = ["effort", "technique", "tactics", "comprehension"];
      if (!fields.every((field) => rating[field])) return "";
      return roundGrade(fields.reduce((sum, field) => sum + Number(rating[field]), 0) / fields.length);
    };
  }

  if (typeof profileSkillAverages === "function") {
    const originalProfileSkillAverages = profileSkillAverages;
    profileSkillAverages = (ratings) => originalProfileSkillAverages(ratings).map((item) => ({
      ...item,
      label: ratingLabels[item.label] || item.label
    }));
  }

  const observer = new MutationObserver(applyRatingLabels);
  observer.observe(document.body, { childList: true, subtree: true });
  if (typeof renderAll === "function") renderAll();
  applyRatingLabels();
});
