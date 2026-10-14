import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { LayoutService } from '../../../core/shell/layout.service';
import { SessionService } from '../../../core/auth/session.service';
import { FakeFirebase, provideFakeFirebase } from '../../../core/testing/fake-firebase';
import { Profile } from '../profile';

/** Test-Aufbau der Profilseite: Kader mit zwei Spielern, Events und Bewertungen bzw. Zusatzdaten. */

export const isMobile = signal(false);

export const grades = (grade: number, extra: Record<string, unknown> = {}) => ({ attendance: 'present', effort: grade, technique: grade, tactics: grade, comprehension: grade, ...extra });
export const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
export const q = <T extends Element>(fixture: { nativeElement: unknown }, selector: string) => root(fixture).querySelector<T>(selector);
export const qa = <T extends Element>(fixture: { nativeElement: unknown }, selector: string) => [...root(fixture).querySelectorAll<T>(selector)];
export const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

export async function renderProfile(options: { mobile?: boolean; id?: string; withData?: boolean; consent?: string } = {}) {
  const { mobile = false, id = '', withData = true, consent } = options;
  isMobile.set(mobile);
  const firebase = new FakeFirebase();
  firebase.players.players.set('p1', { name: 'Jonas Keller', positions: ['TW'], number: 1, birthdate: '2012-05-05', status: 'Verletzt', injuryUntil: '2026-12-01', consentStatus: 'granted', consentDate: '2026-09-01' });
  firebase.players.players.set('p2', { name: '<b>Elias</b> Wagner', positions: ['RV', 'LV'], number: 2, birthdate: '2012-06-06', status: 'Fit', consentStatus: consent ?? 'pending' });
  if (withData) {
    firebase.events.events.set('e1', { type: 'Training', title: 'Training Montag', date: '2026-09-01', intensity: 2, notes: 'Passspiel' });
    firebase.events.events.set('e2', { type: 'Spiel', title: '<img src=x onerror=alert(1)>', date: '2026-09-08', intensity: 3, goalsFor: 3, goalsAgainst: 1, matchDuration: 80 });
    firebase.events.events.set('e3', { type: 'Training', title: 'Training Zukunft', date: '2099-01-01' });
    firebase.ratings.ratings.set('e1', new Map([['p1', grades(3, { note: '' })]]));
    firebase.ratings.ratings.set('e2', new Map([['p1', grades(1, { note: 'Starkes Spiel', minutes: 80, goals: 2, assists: 1 })]]));
    firebase.ratings.ratings.set('e3', new Map([['p1', { attendance: 'absent' }]]));
  }
  const navigate = vi.fn().mockResolvedValue(true);
  TestBed.configureTestingModule({
    providers: [
      ...provideFakeFirebase(firebase),
      { provide: LayoutService, useValue: { isMobile } },
      { provide: ActivatedRoute, useValue: { paramMap: new BehaviorSubject(convertToParamMap(id ? { id } : {})) } },
      { provide: Router, useValue: { navigate } },
    ],
  });
  TestBed.inject(SessionService).role.set('trainer');
  const fixture = TestBed.createComponent(Profile);
  await fixture.whenStable();
  await vi.waitFor(() => {
    fixture.detectChanges();
    expect(root(fixture).querySelector('.header, .notice, .empty')).not.toBeNull();
  });
  return { fixture, firebase, navigate };
}

export async function renderProfileExtras(role: 'trainer' | 'medical' = 'trainer') {
  isMobile.set(false);
  const firebase = new FakeFirebase();
  firebase.players.players.set('p1', { name: 'Jonas Keller', positions: ['TW'], number: 1, birthdate: '2012-05-05', status: 'Fit', consentStatus: 'granted' });
  firebase.events.events.set('e1', { type: 'Training', title: 'Training Montag', date: '2026-09-01', intensity: 2 });
  firebase.records.playerRecords.set('p1/developmentPlans', new Map([['dp1', { focus: 'Orientierung', goal: 'Blick vor dem Ball', status: 'In Arbeit', dueDate: '2026-12-01', createdAt: '2026-09-01', selfReflection: 'Lief gut', coachReview: 'Weiter so' }]]));
  firebase.records.playerRecords.set('p1/absences', new Map([
    ['ab1', { kind: 'injury', label: 'Verletzung', detail: 'Zerrung', from: '2020-01-01', to: '' }],
    ['ab2', { kind: 'absence', label: 'Urlaub', from: '2026-08-01', to: '2026-08-10' }],
  ]));
  firebase.records.playerRecords.set('p1/measurements', new Map([
    ['me1', { date: '2026-07-01', height: '150', weight: '40' }],
    ['me2', { date: '2026-10-01', height: '155', weight: '43' }],
  ]));
  const navigate = vi.fn().mockResolvedValue(true);
  TestBed.configureTestingModule({
    providers: [
      ...provideFakeFirebase(firebase),
      { provide: LayoutService, useValue: { isMobile } },
      { provide: ActivatedRoute, useValue: { paramMap: new BehaviorSubject(convertToParamMap({})) } },
      { provide: Router, useValue: { navigate } },
    ],
  });
  TestBed.inject(SessionService).role.set(role);
  const fixture = TestBed.createComponent(Profile);
  await vi.waitFor(() => {
    fixture.detectChanges();
    expect(root(fixture).querySelector('.block')).not.toBeNull();
  });
  return { fixture, firebase, navigate };
}

export const clickByText = (fixture: { nativeElement: unknown }, selector: string, label: string) => {
  const button = qa<HTMLButtonElement>(fixture, selector).find((entry) => text(entry) === label);
  expect(button, `${selector} „${label}“`).toBeDefined();
  button!.click();
};
export const settle = async (fixture: { detectChanges: () => void; whenStable: () => Promise<unknown> }) => {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
};
export const typeInto = (element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string, event = 'input') => {
  element.value = value;
  element.dispatchEvent(new Event(event));
};
