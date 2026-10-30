/** Druckbarer Bericht zum Belastungsprotokoll (SCRUM-139). Jeder Nutzertext wird maskiert (SCRUM-13). */
import { escapeHtml } from '../profile/profile-report';
import { addDays, formatDate } from '../shared/dates';
import { type LoadReport, type LoadReportWeek, comma } from './load-report';

function chartSvg(weeks: readonly LoadReportWeek[]): string {
  const width = 720;
  const height = 220;
  const left = 56;
  const bottom = 34;
  const top = 18;
  const max = Math.max(1, ...weeks.map((week) => week.load));
  const slot = (width - left - 12) / Math.max(1, weeks.length);
  const barWidth = Math.min(48, slot * 0.6);
  const y = (value: number) => top + (height - top - bottom) * (1 - value / max);
  const grid = [0, 0.5, 1]
    .map((share) => {
      const value = Math.round(max * share);
      return `<line x1="${left}" x2="${width - 12}" y1="${y(value)}" y2="${y(value)}" stroke="#e4dcde" /><text x="${left - 8}" y="${y(value) + 4}" text-anchor="end" font-size="11" fill="#70686b">${value}</text>`;
    })
    .join('');
  const bars = weeks
    .map((week, index) => {
      const x = left + slot * index + (slot - barWidth) / 2;
      const barTop = y(week.load);
      return (
        `<rect x="${x}" y="${barTop}" width="${barWidth}" height="${Math.max(0, height - bottom - barTop)}" rx="3" fill="#d8072e"><title>${formatDate(week.from)}–${formatDate(week.to)}: ${week.load}</title></rect>` +
        `<text x="${x + barWidth / 2}" y="${height - bottom + 14}" text-anchor="middle" font-size="10" fill="#70686b">${formatDate(week.from).slice(0, 6)}</text>` +
        (week.load ? `<text x="${x + barWidth / 2}" y="${barTop - 4}" text-anchor="middle" font-size="10" fill="#241d1f">${week.load}</text>` : '')
      );
    })
    .join('');
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Belastung pro Woche">${grid}${bars}<text x="${left}" y="${height - 4}" font-size="10" fill="#70686b">Woche ab</text></svg>`;
}

/**
 * Gestaltung des Berichts. Steht nicht als Style-Element im HTML, sondern wird beim Drucken per CSSOM gesetzt
 * (`FileOutput.print`), damit die CSP ohne `style-src 'unsafe-inline'` auskommt (SCRUM-119/121).
 */
export const LOAD_REPORT_CSS = `
  body { margin: 28px; color: #241d1f; font-family: Arial, Helvetica, sans-serif; font-size: 13px; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 4px solid #d8072e; padding-bottom: 14px; }
  header img { width: 72px; height: 72px; object-fit: contain; }
  h1 { margin: 0 0 4px; font-size: 26px; }
  h2 { margin: 24px 0 8px; font-size: 16px; }
  h3 { margin: 14px 0 6px; font-size: 13px; }
  ul { margin: 4px 0; padding-left: 18px; }
  .muted { color: #70686b; }
  .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 4px 16px; margin-top: 12px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-top: 10px; }
  .card { border: 1px solid #e4dcde; border-radius: 8px; padding: 10px; }
  .card span { display: block; color: #70686b; font-size: 11px; }
  .card strong { display: block; margin-top: 4px; color: #a90624; font-size: 19px; }
  .card small { display: block; margin-top: 4px; color: #70686b; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 12px; }
  th, td { border-bottom: 1px solid #e4dcde; padding: 6px; text-align: left; vertical-align: top; }
  th { color: #70686b; text-transform: uppercase; font-size: 10px; }
  tr { break-inside: avoid; }
  .chart { border: 1px solid #e4dcde; border-radius: 8px; padding: 6px; }
  footer { margin-top: 24px; padding: 10px 12px; border-radius: 8px; background: #fff7f9; color: #70686b; font-size: 11px; }
  .table-wrap { overflow-x: auto; }
  @media (max-width: 600px) { body { margin: 14px; } header img { width: 52px; height: 52px; } table { font-size: 11px; } th, td { padding: 4px 3px; } th { font-size: 9px; } }
  @media print { body { margin: 14mm; } h2 { break-after: avoid; } }
`;

export function loadReportHtml(report: LoadReport, logoUrl = ''): string {
  const e = escapeHtml;
  const a = report.assessment;
  const reasons = a.reasons.length ? a.reasons.map((reason) => `<li>${e(reason)}</li>`).join('') : '<li>Keine auffälligen Belastungsfaktoren</li>';
  const rows = report.rows
    .map(
      (row) =>
        `<tr><td>${formatDate(row.date)}</td><td>${e(row.type)}${row.title ? `<br><span class="muted">${e(row.title)}</span>` : ''}</td><td>${e(row.attendance)}${row.reason ? `<br><span class="muted">${e(row.reason)}</span>` : ''}</td><td>${row.minutes ?? '–'}</td><td>${row.exertion ?? '–'}</td><td>${row.load ?? '–'}</td></tr>`,
    )
    .join('');
  const growth = report.markers.growth.length
    ? report.markers.growth
        .map(
          (item) =>
            `<li>${formatDate(item.from)} → ${formatDate(item.to)}: ${comma(item.fromHeight, 1)} → ${comma(item.toHeight, 1)} cm (${comma(item.perMonth, 1)} cm/Monat)${item.perMonth >= 1.2 ? ' – starker Wachstumsschub' : item.perMonth >= 0.6 ? ' – Wachstumsschub' : ''}</li>`,
        )
        .join('')
    : '<li>Keine Messungen im Zeitraum.</li>';
  const returns = report.includeHealth
    ? `<h3>Verletzungen und Abwesenheiten</h3><ul>${
        report.markers.returns.length
          ? report.markers.returns
              .map(
                (item) =>
                  `<li><strong>${e(item.kind)}:</strong> ${e(item.text)} (${item.from ? formatDate(item.from) : '?'} – ${item.to ? formatDate(item.to) : 'offen'})${item.returned ? ` · Rückkehr ab ${formatDate(addDays(item.to, 1))}` : ''}</li>`,
              )
              .join('')
          : '<li>Keine Einträge im Zeitraum.</li>'
      }</ul>`
    : '';
  const recovery = report.markers.recovery.length ? report.markers.recovery.map((text) => `<li>${e(text)}</li>`).join('') : '<li>Keine Hinweise im Zeitraum.</li>';
  const availability = a.availability
    ? `<div class="card"><span>Verfügbarkeit</span><strong>${e(a.availability.label)}</strong>${a.availability.action ? `<small>${e(a.availability.action)}</small>` : ''}</div>`
    : '';
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Belastungsprotokoll ${e(report.playerName)}</title>
</head>
<body>
<header>
  <div>
    <p class="muted">${e(report.teamName)} · Belastungsprotokoll</p>
    <h1>${e(report.playerName)}</h1>
    <div class="meta">
      <span><span class="muted">Rückennummer:</span> ${e(report.playerNumber)}</span>
      <span><span class="muted">Zeitraum:</span> ${formatDate(report.from)} – ${formatDate(report.to)}</span>
      <span><span class="muted">Erstellt am:</span> ${formatDate(report.created)}</span>
      <span><span class="muted">Erstellt von:</span> ${e(report.createdBy || '–')}</span>
    </div>
  </div>
  ${logoUrl ? `<img src="${e(logoUrl)}" alt="Vereinslogo" />` : ''}
</header>
<h2>Zusammenfassung (Stand ${formatDate(report.to)})</h2>
<section class="cards">
  <div class="card"><span>Stufe</span><strong>${e(a.level)}</strong><small>${e(a.action)}</small></div>
  ${availability}
  <div class="card"><span>Belastung letzte 7 Tage</span><strong>${a.load}</strong><small>Schnitt der 3 Wochen davor: ${a.baseline}</small></div>
  <div class="card"><span>Im Zeitraum</span><strong>${report.totals.sessions} Einheiten</strong><small>${report.totals.minutes} Minuten · Belastung ${report.totals.load}${report.totals.missed ? ` · ${report.totals.missed}× gefehlt` : ''}</small></div>
</section>
<h3>Gründe für die Stufe</h3>
<ul>${reasons}</ul>
${report.includeHealth ? '' : '<p class="muted">Ohne Verletzungs- und Befindensdaten erstellt: Stufe ohne Verletzungen und Abwesenheiten gerechnet, Verfügbarkeit nicht angegeben.</p>'}
<h2>Wochenverlauf</h2>
<div class="chart">${report.weeks.some((week) => week.load > 0) ? chartSvg(report.weeks) : '<p class="muted">Keine Belastung im Zeitraum eingetragen.</p>'}</div>
<h2>Termine im Zeitraum</h2>
<div class="table-wrap">
<table>
  <thead><tr><th>Datum</th><th>Art</th><th>Teilnahme</th><th>Minuten</th><th>Anstrengung<br>(Trainer)</th><th>Belastung</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="6">Keine Termine im Zeitraum.</td></tr>'}</tbody>
</table>
</div>
<h2>Risikomarker im Zeitraum</h2>
<h3>Wachstum</h3>
<ul>${growth}</ul>
${returns}
<h3>Erholungs-Hinweise</h3>
<ul>${recovery}</ul>
<footer>
  <p>Belastung je Termin = Minuten × Anstrengung (0–10, angelehnt an die Borg-CR10-Skala). Die Werte beruhen auf Einschätzungen des Trainers und sind keine medizinische Diagnose.</p>
  ${
    report.includeHealth
      ? '<p><strong>Vertraulich:</strong> Dieses Protokoll enthält Gesundheitsdaten eines Minderjährigen. Nur an die vorgesehene Stelle weitergeben, nicht öffentlich teilen und nach Gebrauch löschen.</p>'
      : '<p><strong>Vertraulich:</strong> Personenbezogene Daten eines Minderjährigen. Nur an die vorgesehene Stelle weitergeben.</p>'
  }
</footer>
</body>
</html>`;
}
