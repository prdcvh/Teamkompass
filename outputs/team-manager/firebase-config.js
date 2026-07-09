window.TEAMKOMPASS_CONFIG = {
  storage: "firebase",
  teamId: "mein-team",
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

document.querySelector(".brand strong").textContent = "1. FC TSG Königstein U14";

window.addEventListener("load", () => {
  const ratingLabels = {
    Technik: "Taktisches Verständnis",
    Taktik: "Zweikampfbereitschaft",
    Auffassung: "Fehlerquote",
    Auffassungsgabe: "Fehlerquote"
  };

  const applyRatingLabels = (root = document) => {
    root.querySelectorAll("th, .analysis-bar-row strong").forEach((element) => {
      const replacement = ratingLabels[element.textContent.trim()];
      if (replacement) element.textContent = replacement;
    });
    root.querySelectorAll("[data-label]").forEach((element) => {
      const replacement = ratingLabels[element.dataset.label];
      if (replacement) element.dataset.label = replacement;
    });
  };

  if (typeof window.calculatedGrade === "function") {
    window.calculatedGrade = (rating) => {
      if (!rating || rating.attendance === "absent") return "";
      const fields = ["effort", "technique", "tactics", "comprehension"];
      if (!fields.every((field) => rating[field])) return "";
      return window.roundGrade(fields.reduce((sum, field) => sum + Number(rating[field]), 0) / fields.length);
    };
  }

  if (typeof window.profileSkillAverages === "function") {
    const originalProfileSkillAverages = window.profileSkillAverages;
    window.profileSkillAverages = (ratings) => originalProfileSkillAverages(ratings).map((item) => ({
      ...item,
      label: ratingLabels[item.label] || item.label
    }));
  }

  const observer = new MutationObserver(() => applyRatingLabels());
  observer.observe(document.body, { childList: true, subtree: true });
  if (typeof window.renderAll === "function") window.renderAll();
  applyRatingLabels();
});
