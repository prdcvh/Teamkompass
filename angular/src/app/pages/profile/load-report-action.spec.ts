import { TestBed } from '@angular/core/testing';
import { SessionService } from '../../core/auth/session.service';
import type { Role } from '../../core/auth/role';
import type { TeamEvent } from '../../core/events/event';
import { FileOutput } from '../../core/export/file-output';
import type { Player } from '../../core/player/player';
import { BLANK_RATING } from '../../core/ratings/rating';
import { todayIso } from '../../core/shared/dates';
import { LoadReportAction } from './load-report-action';

const player: Player = {
  id: 'p1',
  name: 'Ali Adler',
  positions: ['ST'],
  number: 9,
  birthdate: '2012-02-05',
  status: 'Fit',
  injuryUntil: '',
  injuredSince: '',
  consentStatus: 'granted',
  consentDate: '',
};
const event = { id: 'e1', title: 'Training', type: 'Training', date: todayIso(), exertion: 6, intensity: 2, durationMinutes: 80, matchDuration: null } as TeamEvent;

describe('LoadReportAction (Belastungsprotokoll)', () => {
  let printed: string[];

  async function render(role: Role, ownPlayerId: string | null = null) {
    printed = [];
    TestBed.configureTestingModule({ providers: [{ provide: FileOutput, useValue: { print: (html: string) => printed.push(html) } }] });
    const session = TestBed.inject(SessionService);
    session.role.set(role);
    session.playerId.set(ownPlayerId);
    const fixture = TestBed.createComponent(LoadReportAction);
    fixture.componentRef.setInput('player', player);
    fixture.componentRef.setInput('items', [{ event, rating: { ...BLANK_RATING, attendance: 'present' } }]);
    fixture.componentRef.setInput('absences', [{ id: 'a1', kind: 'injury', label: 'Verletzung', detail: 'Zerrung', from: '2020-01-01', to: '' }]);
    fixture.componentRef.setInput('measurements', []);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const openButton = (fixture: { nativeElement: unknown }) => root(fixture).querySelector<HTMLButtonElement>('button.open');

  it('ist für Eltern, Medizin, Scouts und fremde Spieler nicht da', async () => {
    expect(openButton(await render('parent', 'p1'))).toBeNull();
    TestBed.resetTestingModule();
    expect(openButton(await render('physio'))).toBeNull();
    TestBed.resetTestingModule();
    expect(openButton(await render('scout'))).toBeNull();
    TestBed.resetTestingModule();
    expect(openButton(await render('player', 'p2'))).toBeNull();
  });

  it('der Spieler erstellt sein eigenes Protokoll; ohne Häkchen ohne Verletzung', async () => {
    const fixture = await render('player', 'p1');
    openButton(fixture)!.click();
    fixture.detectChanges();
    const form = root(fixture).querySelector('form')!;
    const health = form.querySelector<HTMLInputElement>('input[name="health"]')!;
    expect(health.checked).toBe(true);
    health.click();
    fixture.detectChanges();
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(printed).toHaveLength(1);
    expect(printed[0]).toContain('Ali Adler (Spieler, selbst erstellt)');
    expect(printed[0]).toContain('480');
    expect(printed[0]).not.toContain('Zerrung');
    expect(printed[0]).not.toContain('Verfügbarkeit</span>');
  });

  it('der Trainer erstellt es mit Gesundheitsdaten; ein falscher Zeitraum wird gemeldet', async () => {
    const fixture = await render('trainer');
    openButton(fixture)!.click();
    fixture.detectChanges();
    const form = root(fixture).querySelector('form')!;
    const period = form.querySelector<HTMLSelectElement>('select[name="period"]')!;
    period.value = 'custom';
    period.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const from = form.querySelector<HTMLInputElement>('input[name="from"]')!;
    from.value = '2099-01-01';
    from.dispatchEvent(new Event('input'));
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(printed).toHaveLength(0);
    expect(root(fixture).querySelector('[role="alert"]')?.textContent).toContain('Beginn liegt nach dem Ende');

    period.value = '8';
    period.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(printed).toHaveLength(1);
    expect(printed[0]).toContain('Zerrung');
    expect(printed[0]).toContain('<span>Verfügbarkeit</span><strong>Verletzt</strong>');
  });
});
