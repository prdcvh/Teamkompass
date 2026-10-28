/**
 * Spielerprofil als druckbarer Bericht (PDF über „Drucken → Als PDF speichern“). Entspricht dem Bericht der bisherigen
 * App (Alt-App app.js: downloadProfilePdf), zeigt aber nur das Wesentliche: Kennzahlen, Kompetenzprofil,
 * Verfügbarkeit und die drei besten Events. Jede Eingabe aus der Datenbank wird maskiert (SCRUM-13): kein Name,
 * Titel oder Typ gelangt als HTML in den Bericht.
 */
import { formatDate } from '../events/event';
import { type Player, positionText } from '../player/player';
import { type EventRating, availability, gameStats, gradedEvents, numberLabel, profileFigures, skillAverages } from './profile';
import { gradeLabel } from '../ratings/rating';
import type { Absence } from '../records/absence';
import { effectiveStatus } from '../records/availability';
import type { Measurement } from '../records/measurement';
import { injuryRisk } from '../analysis/risk';

/** Ersetzt die fünf HTML-Sonderzeichen, damit Text nie als Markup gelesen wird. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char] ?? char);
}

export interface ProfileReportInput {
  readonly teamName: string;
  readonly player: Player;
  readonly items: readonly EventRating[];
  readonly absences: readonly Absence[];
  /** Körpermessungen (für den Hinweis „Wachstumsschub“); fehlen sie, entfällt dieser Hinweis. */
  readonly measurements?: readonly Measurement[];
  readonly today: string;
}

/**
 * Gestaltung des Berichts. Steht nicht als Style-Element im HTML, sondern wird beim Drucken per CSSOM gesetzt
 * (`FileOutput.print`), damit die CSP ohne `style-src 'unsafe-inline'` auskommt (SCRUM-119/121).
 */
export const PROFILE_REPORT_CSS = `
  body { margin: 32px; color: #241d1f; font-family: Arial, Helvetica, sans-serif; }
  header { border-bottom: 4px solid #d8072e; padding-bottom: 18px; }
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
  .note { margin-top: 18px; padding: 10px 12px; border-radius: 8px; background: #fff7f9; color: #70686b; font-size: 12px; }
  @media print { body { margin: 18mm; } }
`;

export function profileReportHtml(input: ProfileReportInput): string {
  const { player, items, today } = input;
  const figures = profileFigures(items, today);
  const games = gameStats(items, today);
  const graded = gradedEvents(items);
  const skills = skillAverages(graded)
    .map((skill) => `<tr><td>${escapeHtml(skill.label)}</td><td>${escapeHtml(gradeLabel(skill.value))}</td></tr>`)
    .join('');
  const availabilityRows = availability(items, today)
    .map((row) => `<tr><td>${escapeHtml(row.label)}</td><td>${escapeHtml(row.display)}</td><td>${row.percent}%</td></tr>`)
    .join('');
  const best = [...graded]
    .sort((a, b) => a.grade - b.grade)
    .slice(0, 3)
    .map(
      ({ event, grade }) =>
        `<tr><td>${escapeHtml(formatDate(event.date))}</td><td>${escapeHtml(event.title)}</td><td>${escapeHtml(event.type)}</td><td>${escapeHtml(gradeLabel(grade))}</td></tr>`,
    )
    .join('');
  const status = effectiveStatus(player, input.absences, today);
  const risk = injuryRisk(player, items, input.absences, input.measurements ?? [], new Date(`${today}T12:00:00`));
  const card = (label: string, value: string) => `<div class="card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>Spielerprofil ${escapeHtml(player.name)}</title>
</head>
<body>
<header>
  <p class="muted">${escapeHtml(input.teamName)} · Spielerprofil</p>
  <h1>${escapeHtml(player.name)}</h1>
  <div class="muted">Nr. ${escapeHtml(player.number)} · ${escapeHtml(positionText(player))} · ${escapeHtml(formatDate(player.birthdate))} · ${escapeHtml(status)}</div>
</header>
<section class="cards">
  ${card('Ø Note', gradeLabel(figures.average))}
  ${card('Bewertete Events', String(figures.ratedEvents))}
  ${card('Teilnahmen', String(figures.attendances))}
  ${card('Einsatzquote', `${games.appearanceRate}%`)}
  ${card('Scorer/Spiel', numberLabel(games.scorersPerGame))}
  ${card('Tore + Vorlagen', `${games.goals} + ${games.assists}`)}
  ${card('Min./Spiel', games.minutesPerGame ? String(games.minutesPerGame) : '–')}
  ${card('Spiele', `${games.appearances}/${games.games}`)}
</section>
<section class="load-box">
  <h2>Belastung</h2>
  <p><strong>${escapeHtml(risk.level)}</strong> · ${escapeHtml(risk.reason)}</p>
  <table><thead><tr><th>Belastung letzte 7 Tage</th><th>Schnitt der 3 Wochen davor</th><th>Verfügbarkeit</th></tr></thead><tbody><tr><td>${escapeHtml(numberLabel(risk.load))}</td><td>${escapeHtml(numberLabel(risk.baseline))}</td><td>${escapeHtml(risk.availability.label)}${risk.availability.action ? ` – ${escapeHtml(risk.availability.action)}` : ''}</td></tr></tbody></table>
  <p class="muted">Belastung je Termin = Minuten × Anstrengung (0–10).</p>
</section>
<section class="section-grid">
  <div>
    <h2>Kompetenzprofil</h2>
    <table><thead><tr><th>Kriterium</th><th>Ø Note</th></tr></thead><tbody>${skills || '<tr><td colspan="2">Keine Bewertungen vorhanden.</td></tr>'}</tbody></table>
  </div>
  <div>
    <h2>Verfügbarkeit</h2>
    <table><thead><tr><th>Status</th><th>Events</th><th>Anteil</th></tr></thead><tbody>${availabilityRows}</tbody></table>
  </div>
</section>
<h2>Bestleistungen</h2>
<table><thead><tr><th>Datum</th><th>Event</th><th>Typ</th><th>Gesamt</th></tr></thead><tbody>${best || '<tr><td colspan="4">Keine Bewertungen vorhanden.</td></tr>'}</tbody></table>
<div class="note">Der Bericht ist bewusst komprimiert und zeigt nicht die komplette Saisonhistorie. Die vollständige Historie bleibt im Spielerprofil der App verfügbar.</div>
</body>
</html>`;
}
