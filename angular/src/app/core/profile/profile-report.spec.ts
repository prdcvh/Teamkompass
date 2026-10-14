import { describe, expect, it } from 'vitest';
import { type TeamEvent } from '../events/event';
import type { Player } from '../player/player';
import { escapeHtml, profileReportHtml } from './profile-report';
import { BLANK_RATING } from '../ratings/rating';

const player: Player = {
  id: 'p1',
  name: '<img src=x onerror=alert(1)>',
  positions: ['ST'],
  number: 9,
  birthdate: '2012-02-05',
  status: 'Fit',
  injuryUntil: '',
  consentStatus: 'granted',
  consentDate: '',
};
const event = { id: 'e1', title: '<b>Spiel</b> & Co', type: 'Spiel', date: '2026-10-01', intensity: 2, location: '', trainingFocus: '', opponent: '', goalsFor: 2, goalsAgainst: 1, matchDuration: 90, notes: '' } as TeamEvent;
const rating = { ...BLANK_RATING, attendance: 'present' as const, effort: 2, technique: 2, tactics: 2, comprehension: 2, minutes: 90, goals: 1, assists: 0 };

describe('escapeHtml', () => {
  it('maskiert alle Sonderzeichen', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#039;&amp;&#039;&lt;/a&gt;');
    expect(escapeHtml(null)).toBe('');
  });
});

describe('profileReportHtml', () => {
  const html = profileReportHtml({ teamName: 'Team <X>', player, items: [{ event, rating }], absences: [], today: '2026-10-12' });

  it('gibt Spielername, Eventtitel und Teamname nie als HTML aus', () => {
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>Spiel');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;b&gt;Spiel&lt;/b&gt; &amp; Co');
    expect(html).toContain('Team &lt;X&gt;');
  });

  it('zeigt Kennzahlen, Kompetenzprofil und Bestleistungen', () => {
    expect(html).toContain('<span>Ø Note</span><strong>2,0</strong>');
    expect(html).toContain('<span>Tore + Vorlagen</span><strong>1 + 0</strong>');
    expect(html).toContain('Einsatz');
    expect(html).toContain('01.10.2026');
  });

  it('meldet fehlende Bewertungen', () => {
    const empty = profileReportHtml({ teamName: 'T', player, items: [], absences: [], today: '2026-10-12' });
    expect(empty).toContain('Keine Bewertungen vorhanden.');
    expect(empty).toContain('<span>Ø Note</span><strong>–</strong>');
  });
});
