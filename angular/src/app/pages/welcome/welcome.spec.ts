import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { EventsService } from '../../core/events/events.service';
import { SquadService } from '../../core/player/squad.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { Welcome } from './welcome';

describe('Welcome (Einstieg nach der Registrierung)', () => {
  async function render() {
    const firebase = new FakeFirebase();
    await TestBed.configureTestingModule({ imports: [Welcome], providers: [provideRouter([]), ...provideFakeFirebase(firebase)] }).compileComponents();
    TestBed.inject(SessionService).role.set('trainer');
    const fixture = TestBed.createComponent(Welcome);
    await fixture.whenStable();
    return fixture;
  }

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;

  it('führt zum ersten Spieler und ersten Termin und öffnet dort direkt das Anlegen', async () => {
    const fixture = await render();
    const links = [...root(fixture).querySelectorAll<HTMLAnchorElement>('a.action')].map((link) => link.getAttribute('href'));
    expect(links).toEqual(['/kader?neu=1', '/events?neu=1']);
    expect(root(fixture).textContent).toContain('Später – zur Übersicht');
  });

  it('hakt erledigte Schritte ab', async () => {
    const fixture = await render();
    TestBed.inject(SquadService).players.set([{ id: 'p1' } as never]);
    TestBed.inject(EventsService).events.set([{ id: 'e1' } as never]);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(root(fixture).querySelectorAll('li.done').length).toBe(2);
    expect(root(fixture).textContent).toContain('Geschafft');
  });
});
