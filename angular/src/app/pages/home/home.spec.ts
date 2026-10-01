import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { Home } from './home';

describe('Home', () => {
  it('zeigt Teamname und Team-ID der konfigurierten Instanz', async () => {
    await TestBed.configureTestingModule({ imports: [Home] }).compileComponents();
    const fixture = TestBed.createComponent(Home);
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain(environment.teamName);
    expect(text).toContain(environment.teamId);
  });
});
