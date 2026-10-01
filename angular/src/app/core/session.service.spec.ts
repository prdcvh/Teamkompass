import { TestBed } from '@angular/core/testing';
import { SessionService } from './session.service';

describe('SessionService', () => {
  it('bildet Kürzel aus Vor- und Nachname', () => {
    const session = TestBed.inject(SessionService);
    session.displayName.set('Pascal von Hinueber');
    expect(session.initials()).toBe('PH');
  });

  it('nimmt bei einem Namen die ersten zwei Buchstaben', () => {
    const session = TestBed.inject(SessionService);
    session.displayName.set('Luca');
    expect(session.initials()).toBe('LU');
  });

  it('liefert ein Fragezeichen ohne Namen', () => {
    const session = TestBed.inject(SessionService);
    session.displayName.set('  ');
    expect(session.initials()).toBe('?');
  });
});
