/** Druckbarer Saisonbericht (SCRUM-196): ein Dokument mit einer Seite (oder mehr) je Spieler. Jeder Nutzertext wird maskiert (SCRUM-13). */
import { formatDate } from '../shared/dates';
import { scoreLabel } from '../ratings/rating-scale';
import { escapeHtml } from './profile-report';
import type { SeasonReport } from './season-report';

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export function monthLabel(month: string): string {
  const [year, number] = month.split('-').map(Number);
  return `${MONTHS[(number ?? 1) - 1] ?? month} ${year}`;
}

/**
 * Gestaltung des Berichts. Steht nicht als Style-Element im HTML, sondern wird beim Drucken per CSSOM gesetzt
 * (`FileOutput.print`), damit die CSP ohne `style-src 'unsafe-inline'` auskommt (SCRUM-119/121).
 */
export const SEASON_REPORT_CSS = `
  body { margin: 28px; color: #241d1f; font-family: Arial, Helvetica, sans-serif; font-size: 13px; }
  .player + .player { margin-top: 48px; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 4px solid #d8072e; padding-bottom: 14px; }
  header img { width: 72px; height: 72px; object-fit: contain; }
  h1 { margin: 0 0 4px; font-size: 26px; }
  h2 { margin: 22px 0 8px; font-size: 16px; }
  ul { margin: 4px 0; padding-left: 18px; }
  .muted { color: #70686b; }
  .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 4px 16px; margin-top: 12px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-top: 10px; }
  .card { border: 1px solid #e4dcde; border-radius: 8px; padding: 10px; }
  .card span { display: block; color: #70686b; font-size: 11px; }
  .card strong { display: block; margin-top: 4px; color: #a90624; font-size: 19px; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 12px; }
  th, td { border-bottom: 1px solid #e4dcde; padding: 6px; text-align: left; vertical-align: top; }
  th { color: #70686b; text-transform: uppercase; font-size: 10px; }
  tr, .card { break-inside: avoid; }
  .comment { border-left: 4px solid #d8072e; padding: 6px 12px; background: #fff7f9; white-space: pre-wrap; }
  .table-wrap { overflow-x: auto; }
  footer { margin-top: 24px; padding: 10px 12px; border-radius: 8px; background: #fff7f9; color: #70686b; font-size: 11px; }
  @media (max-width: 600px) { body { margin: 14px; } header img { width: 52px; height: 52px; } table { font-size: 11px; } th, td { padding: 4px 3px; } th { font-size: 9px; } }
  @media print { body { margin: 14mm; } h2 { break-after: avoid; } .player + .player { margin-top: 0; break-before: page; } }
`;

function trendText(report: SeasonReport): string {
  const withGrade = report.months.filter((month) => month.overall !== null);
  if (withGrade.length < 2) return '';
  const first = withGrade[0].overall!;
  const last = withGrade[withGrade.length - 1].overall!;
  const diff = last - first;
  const word = report.scale === 'levels' ? 'Kompetenzstufe' : 'Note';
  if (Math.abs(diff) < 0.1) return `Die ${word} ist über den Zeitraum stabil geblieben.`;
  return `Die ${word} hat sich von ${monthLabel(withGrade[0].month)} bis ${monthLabel(withGrade[withGrade.length - 1].month)} ${diff < 0 ? 'verbessert' : 'verschlechtert'}.`;
}

function playerSection(report: SeasonReport, logoUrl: string): string {
  const e = escapeHtml;
  const label = (value: number | null) => scoreLabel(value, report.scale);
  const heading = report.scale === 'levels' ? 'Ø Stufe' : 'Ø Note';
  const a = report.attendance;
  const quote = a.counted ? Math.round((a.took / a.counted) * 100) : 0;
  const attendanceRows = a.rows.map((row) => `<tr><td>${e(row.label)}</td><td>${e(row.display)}</td><td>${row.percent}%</td></tr>`).join('');
  const monthRows = report.months
    .map(
      (month) =>
        `<tr><td>${e(monthLabel(month.month))}</td><td>${month.events}</td>${(['effort', 'technique', 'tactics', 'comprehension'] as const)
          .map((field) => `<td>${e(label(month.skills[field]))}</td>`)
          .join('')}<td><strong>${e(label(month.overall))}</strong></td></tr>`,
    )
    .join('');
  const skills = report.skills.map((skill) => `<tr><td>${e(skill.label)}</td><td>${e(label(skill.value))}</td></tr>`).join('');
  const goals = report.goals.achieved.length
    ? `<ul>${report.goals.achieved.map((goal) => `<li><strong>${e(goal.focus)}:</strong> ${e(goal.goal)} <span class="muted">(${e(formatDate(goal.date))})</span></li>`).join('')}</ul>`
    : '<p class="muted">Im Zeitraum wurde kein Förderziel als erreicht eingetragen.</p>';
  const goalsRunning = report.goals.running ? `<p class="muted">Weitere Förderziele in Arbeit oder offen: ${report.goals.running}.</p>` : '';
  const paths = report.paths.length
    ? `<ul>${report.paths
        .map(
          (path) =>
            `<li><strong>${e(path.title)}</strong>: ${path.done} von ${path.total} Stufen bestätigt${
              path.inPeriod.length
                ? `<ul>${path.inPeriod.map((level) => `<li>Stufe ${level.number}: ${e(level.title)} <span class="muted">(${e(formatDate(level.date))})</span></li>`).join('')}</ul>`
                : ''
            }</li>`,
        )
        .join('')}</ul>`
    : '<p class="muted">Noch keine Lernpfad-Stufe bestätigt.</p>';
  const comment = report.comment ? `<div class="comment">${e(report.comment)}</div>` : '<p class="muted">Kein Kommentar des Trainers.</p>';
  const health = report.health
    ? `<h2>Verletzungen und Abwesenheiten</h2>${
        report.health.length
          ? `<ul>${report.health.map((item) => `<li><strong>${e(item.kind)}:</strong> ${e(item.text)} (${item.from ? e(formatDate(item.from)) : '?'} – ${item.to ? e(formatDate(item.to)) : 'offen'})</li>`).join('')}</ul>`
          : '<p class="muted">Keine Einträge im Zeitraum.</p>'
      }`
    : '';
  return `<section class="player">
<header>
  <div>
    <p class="muted">${e(report.teamName)} · Saisonbericht</p>
    <h1>${e(report.playerName)}</h1>
    <div class="meta">
      <span><span class="muted">Rückennummer:</span> ${e(report.playerNumber)}</span>
      <span><span class="muted">Zeitraum:</span> ${e(formatDate(report.from))} – ${e(formatDate(report.to))}</span>
      <span><span class="muted">Erstellt am:</span> ${e(formatDate(report.created))}</span>
    </div>
  </div>
  ${logoUrl ? `<img src="${e(logoUrl)}" alt="Vereinslogo" />` : ''}
</header>
<h2>Zusammenfassung</h2>
<div class="cards">
  <div class="card"><span>Anwesenheit</span><strong>${quote}%</strong></div>
  <div class="card"><span>Teilnahmen</span><strong>${a.took} von ${a.counted}</strong></div>
  <div class="card"><span>Training / Spiel</span><strong>${a.trainings} / ${a.games}</strong></div>
  <div class="card"><span>${heading}</span><strong>${e(label(report.overall))}</strong></div>
</div>
<h2>Anwesenheit</h2>
<table><thead><tr><th>Status</th><th>Termine</th><th>Anteil</th></tr></thead><tbody>${attendanceRows}</tbody></table>
<h2>Entwicklung des Kompetenzprofils</h2>
<div class="table-wrap">
<table>
  <thead><tr><th>Monat</th><th>Bewertete Termine</th><th>Einsatz</th><th>Fehlerquote</th><th>Entscheidungsfindung</th><th>Lernfähigkeit</th><th>${heading}</th></tr></thead>
  <tbody>${monthRows || '<tr><td colspan="7">Keine Bewertungen im Zeitraum.</td></tr>'}</tbody>
</table>
</div>
${trendText(report) ? `<p>${e(trendText(report))}</p>` : ''}
<table><thead><tr><th>Kriterium</th><th>${heading} im Zeitraum</th></tr></thead><tbody>${skills}</tbody></table>
<h2>Erreichte Förderziele</h2>
${goals}
${goalsRunning}
<h2>Lernpfad-Stufen</h2>
${paths}
<h2>Kommentar des Trainers</h2>
${comment}
${health}
</section>`;
}

/** Ein Dokument für einen oder mehrere Spieler; jeder Spieler beginnt beim Drucken auf einer neuen Seite. */
export function seasonReportsHtml(reports: readonly SeasonReport[], logoUrl = ''): string {
  const e = escapeHtml;
  const health = reports.some((report) => report.health !== null);
  const title = reports.length === 1 ? `Saisonbericht ${e(reports[0].playerName)}` : `Saisonbericht ${e(reports[0]?.teamName ?? '')}`;
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
</head>
<body>
${reports.map((report) => playerSection(report, logoUrl)).join('\n')}
<footer>
  <p>Die Werte beruhen auf Einschätzungen des Trainers. ${
    health
      ? '<strong>Vertraulich:</strong> Dieser Bericht enthält auf ausdrücklichen Wunsch Gesundheitsdaten Minderjähriger. Nur an die vorgesehene Stelle weitergeben und nicht öffentlich teilen.'
      : '<strong>Vertraulich:</strong> Personenbezogene Daten Minderjähriger. Nur an die vorgesehene Stelle weitergeben.'
  }</p>
</footer>
</body>
</html>`;
}
